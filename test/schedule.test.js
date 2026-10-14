// -----------------------------------------------------------------------------
// Changing the Solarbank 2/3 schedule: only the current slot of the manual
// plan, the user's plans sent back untouched, the subset of plans the cloud
// expects per mode (schedule.py of anker-solix-api).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ScheduleError,
  clampPreset,
  currentPreset,
  currentSlot,
  setOutputPower,
  setUsageMode,
} from '../src/anker/schedule.js';
import { loadFixture } from './helpers/fakeAnker.js';

// Real schedule: weekend 110 W all day; weekdays 100 W, 120 W from 08:00, 90 W from 22:00.
const manual = () => structuredClone(loadFixture('sb2-pro-meter-manual').schedule);
const plugs = () => structuredClone(loadFixture('sb2-pro-plugs').schedule);

// 2026-10-14 is a Wednesday (3), 2026-10-17 a Saturday (6). Local time.
const wednesday = (hh, mm = 0) => new Date(2026, 9, 14, hh, mm);
const saturday = (hh) => new Date(2026, 9, 17, hh, 0);

test('the slot of now: weekday plan, by time; weekend plan', () => {
  assert.deepEqual(currentSlot(manual(), wednesday(7, 59)), { plan: 1, range: 0 });
  assert.deepEqual(currentSlot(manual(), wednesday(8)), { plan: 1, range: 1 });
  assert.deepEqual(currentSlot(manual(), wednesday(23, 30)), { plan: 1, range: 2 });
  assert.deepEqual(currentSlot(manual(), saturday(12)), { plan: 0, range: 0 });
  assert.equal(currentPreset(manual(), wednesday(9)), 120);
  assert.equal(currentPreset(manual(), saturday(9)), 110);
});

test('the output power changes the current slot only, rounded to the step and bounded', () => {
  const schedule = manual();
  const before = structuredClone(schedule);
  const { payload, applied } = setOutputPower(schedule, 347, wednesday(9));
  assert.equal(applied, 350, 'step of 10 W');
  assert.equal(payload.mode_type, 3);
  assert.equal(payload.custom_rate_plan[1].ranges[1].power, 350);
  // Everything else as read.
  const expected = structuredClone(before.custom_rate_plan);
  expected[1].ranges[1].power = 350;
  assert.deepEqual(payload.custom_rate_plan, expected);
  assert.deepEqual(payload.blend_plan, []);
  assert.deepEqual(schedule, before, 'the schedule read is not modified');

  assert.equal(setOutputPower(manual(), 5000, wednesday(9)).applied, 800, 'max_load');
  assert.equal(clampPreset(-50, manual()), 0, 'min_load');
});

test('no output power outside the manual mode, nor without a slot for now', () => {
  assert.throws(
    () => setOutputPower(plugs(), 200, wednesday(9)),
    (err) => err instanceof ScheduleError && err.reason === 'not_manual',
  );
  const holes = manual();
  holes.custom_rate_plan[1].ranges = [{ start_time: '00:00', end_time: '08:00', power: 100 }];
  assert.throws(
    () => setOutputPower(holes, 200, wednesday(9)),
    (err) => err.reason === 'no_slot',
  );
});

test('usage mode: the manual and smart plug plans go with those modes', () => {
  const schedule = plugs();
  const payload = setUsageMode(schedule, 'manual');
  assert.deepEqual(Object.keys(payload).sort(), ['blend_plan', 'custom_rate_plan', 'mode_type']);
  assert.equal(payload.mode_type, 3);
  assert.deepEqual(payload.custom_rate_plan, schedule.custom_rate_plan);
  assert.deepEqual(payload.blend_plan, schedule.blend_plan);
  assert.equal(setUsageMode(schedule, 'smartplugs').mode_type, 2);
});

test('usage mode: the automatic modes carry the AC plans', () => {
  const schedule = loadFixture('sb2-ac-use-time').schedule;
  const payload = setUsageMode(schedule, 'smartmeter');
  assert.deepEqual(Object.keys(payload).sort(), ['manual_backup', 'mode_type', 'use_time']);
  assert.equal(payload.mode_type, 1);
  assert.deepEqual(payload.use_time, schedule.use_time);
  assert.equal(setUsageMode({}, 'smart').mode_type, 7);
  assert.deepEqual(setUsageMode({}, 'smart').manual_backup, {});
});

test('the manual mode without any plan gets the default one, the whole week', () => {
  const payload = setUsageMode(
    { mode_type: 1, custom_rate_plan: [], default_home_load: 200 },
    'manual',
  );
  assert.deepEqual(payload.custom_rate_plan, [
    {
      index: 0,
      week: [0, 1, 2, 3, 4, 5, 6],
      ranges: [{ start_time: '00:00', end_time: '24:00', power: 200 }],
    },
  ]);
});

test('an unknown mode is refused', () => {
  assert.throws(
    () => setUsageMode({}, 'turbo'),
    (err) => err.reason === 'mode_unavailable',
  );
});
