// -----------------------------------------------------------------------------
// PURE: changing the schedule of a Solarbank 2 or 3 system. No I/O.
//
// The usage mode and the output plans of a Solarbank 2/3 system live in one
// "schedule" (device parameter type 6):
//   { mode_type: 3,
//     custom_rate_plan: [{ index, week: [0..6], ranges: [{ start_time, end_time, power }] }],
//     blend_plan: [...], use_time: [...], manual_backup: {...},
//     default_home_load: 200, min_load: 0, max_load: 800, step: 10 }
// `week` counts from Sunday (0). The cloud expects the subset of the plans
// that goes with the mode, as the reference library sends it
// (schedule.py set_sb2_home_load, MIT): the manual and smart plug plans for
// those two modes, the AC plans for the other ones. Everything not changed
// is sent back as it was read: the plans the user built in the Anker app are
// never rewritten, only the power of the current time slot.
// -----------------------------------------------------------------------------

import { USAGE_MODES, num } from './model.js';

/** A change the schedule does not allow; `reason` is a key of the messages. */
export class ScheduleError extends Error {
  /** @param {'not_manual' | 'no_slot' | 'mode_unavailable'} reason */
  constructor(reason) {
    super(reason);
    this.name = 'ScheduleError';
    this.reason = reason;
  }
}

const DEFAULT_PRESET = 200;

/** `HH:MM` to minutes, `24:00` included. */
const minutes = (hhmm) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
};

/**
 * The time slot of the manual plan that applies at `date` (local time of the
 * container, which Gladys sets to its own time zone).
 * @returns {{ plan: number, range: number } | undefined} indexes in custom_rate_plan
 */
export function currentSlot(schedule, date) {
  const plans = Array.isArray(schedule?.custom_rate_plan) ? schedule.custom_rate_plan : [];
  const day = date.getDay();
  const now = date.getHours() * 60 + date.getMinutes();
  for (let p = 0; p < plans.length; p += 1) {
    if (!Array.isArray(plans[p]?.week) || !plans[p].week.map(Number).includes(day)) {
      continue;
    }
    const ranges = Array.isArray(plans[p].ranges) ? plans[p].ranges : [];
    for (let r = 0; r < ranges.length; r += 1) {
      const start = minutes(ranges[r].start_time);
      const end = minutes(ranges[r].end_time);
      if (start !== undefined && end !== undefined && start <= now && now < end) {
        return { plan: p, range: r };
      }
    }
  }
  return undefined;
}

/** Output power of the current manual slot, in W, when there is one. */
export function currentPreset(schedule, date) {
  const slot = currentSlot(schedule, date);
  return slot
    ? num(schedule.custom_rate_plan[slot.plan].ranges[slot.range].power)
    : num(schedule?.default_home_load);
}

/** Output power limits the schedule declares. */
export function presetLimits(schedule) {
  const min = num(schedule?.min_load) ?? 0;
  const max = num(schedule?.max_load) ?? 800;
  const step = num(schedule?.step) || 10;
  return { min, max: Math.max(min, max), step };
}

/** Clamp to the limits, round to the step. */
export function clampPreset(watts, schedule) {
  const { min, max, step } = presetLimits(schedule);
  const rounded = Math.round(Number(watts) / step) * step;
  return Math.min(max, Math.max(min, rounded));
}

/**
 * The schedule subset that sets the output power of the current slot of the
 * manual plan.
 * @param {object} schedule as read
 * @param {number} watts requested power
 * @param {Date} date now
 * @returns {{ payload: object, applied: number }}
 * @throws {ScheduleError} `not_manual` outside the manual mode, `no_slot`
 *   when the plan has no slot for now
 */
export function setOutputPower(schedule, watts, date) {
  if (Number(schedule?.mode_type) !== USAGE_MODES.manual) {
    throw new ScheduleError('not_manual');
  }
  const slot = currentSlot(schedule, date);
  if (!slot) {
    throw new ScheduleError('no_slot');
  }
  const applied = clampPreset(watts, schedule);
  const plans = structuredClone(schedule.custom_rate_plan);
  plans[slot.plan].ranges[slot.range].power = applied;
  return {
    payload: {
      mode_type: USAGE_MODES.manual,
      custom_rate_plan: plans,
      blend_plan: schedule.blend_plan ?? [],
    },
    applied,
  };
}

/**
 * The schedule subset that switches the usage mode.
 * @param {object} schedule as read
 * @param {string} mode a key of USAGE_MODES
 * @returns {object} payload
 */
export function setUsageMode(schedule, mode) {
  const modeType = USAGE_MODES[mode];
  if (modeType === undefined) {
    throw new ScheduleError('mode_unavailable');
  }
  if (mode === 'manual' || mode === 'smartplugs') {
    let plans = Array.isArray(schedule?.custom_rate_plan) ? schedule.custom_rate_plan : [];
    if (mode === 'manual' && plans.length === 0) {
      // The manual mode needs a plan: the one the app creates, the whole week
      // at the default output power.
      plans = [
        {
          index: 0,
          week: [0, 1, 2, 3, 4, 5, 6],
          ranges: [
            {
              start_time: '00:00',
              end_time: '24:00',
              power: num(schedule?.default_home_load) ?? DEFAULT_PRESET,
            },
          ],
        },
      ];
    }
    return {
      mode_type: modeType,
      custom_rate_plan: plans,
      blend_plan: schedule?.blend_plan ?? [],
    };
  }
  return {
    mode_type: modeType,
    manual_backup: schedule?.manual_backup ?? {},
    use_time: schedule?.use_time ?? [],
  };
}
