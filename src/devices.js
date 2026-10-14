// -----------------------------------------------------------------------------
// PURE: Anker systems -> Gladys devices and states. No I/O.
//
// One Gladys device per physical device the cloud reports in a system
// (Solarbank, micro-inverter, smart meter, smart plug), plus one "system"
// device per Anker system for what belongs to the whole system: the usage
// mode, the home consumption and the solar production counters. Nothing is
// counted twice: the solar power of a Solarbank is on the Solarbank, the
// production of the system on the system.
//
// External ids are built from the ids the cloud gives (site id, serial
// numbers), never from a name, and the feature keys are English and stable:
// they are forever (see CLAUDE.md).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { MODE_LABELS, featureName } from './i18n.js';
import { siteDevices } from './anker/model.js';

/** Device types, first part of the external ids. */
export const KIND = {
  SYSTEM: 'system',
  SOLARBANK: 'solarbank',
  INVERTER: 'inverter',
  SMARTMETER: 'smartmeter',
  SMARTPLUG: 'smartplug',
};

/** Feature keys, last part of the feature external ids. */
export const FEATURE = {
  USAGE_MODE: 'usage_mode',
  HOME_LOAD: 'home_load',
  PRODUCTION_TOTAL: 'production_total',
  PRODUCTION_TODAY: 'production_today',
  BATTERY_LEVEL: 'battery_level',
  BATTERY_ENERGY: 'battery_energy',
  CHARGE_POWER: 'charge_power',
  DISCHARGE_POWER: 'discharge_power',
  SOLAR_POWER: 'solar_power',
  OUTPUT_POWER: 'output_power',
  GRID_IMPORT: 'grid_import',
  GRID_EXPORT: 'grid_export',
  PLUG_POWER: 'power',
};

/** Key of the feature of PV input `n` (1-based). */
export const solarInputKey = (n) => `solar_power_${n}`;

/** Name of the device parameter holding the Anker site id. */
export const SITE_PARAM = 'ANKER_SITE_ID';

// The core polls once a minute at most; the container polls by itself anyway
// (see poller.js), this is only the fallback.
const POLL = { should_poll: true, poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES };

// Display bounds (the core never enforces them). Powers in W, energies in kWh.
const MAX_SOLARBANK_W = 3600; // Solarbank 3: 4 x 900 W of PV, 1200 W AC charge
const MAX_INPUT_W = 1000;
const MAX_OUTPUT_W = 2400;
const MAX_HOME_W = 20000;
const MAX_PLUG_W = 3680;
const MAX_INVERTER_W = 1000;

/** External ids of one device. */
export function deviceIds(gladys, kind, platformId) {
  return gladys.externalIds(kind, platformId);
}

function sensor(ids, key, name, category, type, unit, max, { decimals = false } = {}) {
  return {
    name,
    external_id: ids.feature(key),
    category,
    type,
    unit,
    min: 0,
    max: decimals ? Math.ceil(max) : max,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  };
}

/**
 * The usage mode as a select: Gladys shows the modes as buttons. Changing it
 * goes through onSetValue, refused while "Allow settings" is off.
 */
function usageModeFeature(ids, site, language) {
  return {
    name: featureName(FEATURE.USAGE_MODE, language),
    external_id: ids.feature(FEATURE.USAGE_MODE),
    category: CATEGORIES.TEXT,
    type: TYPES.TEXT.SELECT,
    min: 0,
    max: 0,
    read_only: false,
    has_feedback: true,
    keep_history: false,
    supported_options: site.modes.map((mode, index) => ({
      value: mode,
      label: MODE_LABELS[mode][language] ?? MODE_LABELS[mode].en,
      sort_order: index,
    })),
  };
}

const siteParams = (site, model) => [
  { name: SITE_PARAM, value: site.id },
  ...(model ? [{ name: 'ANKER_MODEL', value: model }] : []),
];

/** The "system" device of an Anker system, or null when it has nothing to show. */
function systemDevice(gladys, site, language) {
  const ids = deviceIds(gladys, KIND.SYSTEM, site.id);
  const n = (key) => featureName(key, language);
  const features = [];
  if (site.scheduleCapable) {
    features.push(usageModeFeature(ids, site, language));
  }
  if (site.homeLoad !== undefined && site.meters.length > 0) {
    features.push(
      sensor(
        ids,
        FEATURE.HOME_LOAD,
        n(FEATURE.HOME_LOAD),
        CATEGORIES.ENERGY_SENSOR,
        TYPES.ENERGY_SENSOR.POWER,
        UNITS.WATT,
        MAX_HOME_W,
      ),
    );
  }
  if (site.productionTotalKwh !== undefined) {
    // A cumulative index: the energy monitoring of Gladys derives the
    // half-hourly production from it.
    features.push(
      sensor(
        ids,
        FEATURE.PRODUCTION_TOTAL,
        n(FEATURE.PRODUCTION_TOTAL),
        CATEGORIES.ENERGY_PRODUCTION_SENSOR,
        TYPES.ENERGY_PRODUCTION_SENSOR.INDEX,
        UNITS.KILOWATT_HOUR,
        1_000_000,
      ),
    );
  }
  if (site.solarbanks.length > 0 || site.inverters.length > 0) {
    features.push(
      sensor(
        ids,
        FEATURE.PRODUCTION_TODAY,
        n(FEATURE.PRODUCTION_TODAY),
        CATEGORIES.ENERGY_PRODUCTION_SENSOR,
        TYPES.ENERGY_PRODUCTION_SENSOR.DAILY_PRODUCTION,
        UNITS.KILOWATT_HOUR,
        100,
      ),
    );
  }
  if (features.length === 0) {
    return null;
  }
  return {
    name: `Anker SOLIX ${site.name}`,
    external_id: ids.device,
    model: 'Anker SOLIX system',
    ...POLL,
    params: siteParams(site),
    features,
  };
}

function solarbankDevice(gladys, site, sb, name, language) {
  const ids = deviceIds(gladys, KIND.SOLARBANK, sb.sn);
  const n = (key, values) => featureName(key, language, values);
  const features = [
    sensor(
      ids,
      FEATURE.BATTERY_LEVEL,
      n(FEATURE.BATTERY_LEVEL),
      CATEGORIES.BATTERY_STORAGE,
      TYPES.BATTERY_STORAGE.BATTERY_LEVEL,
      UNITS.PERCENT,
      100,
    ),
  ];
  if (sb.capacityWh) {
    features.push(
      sensor(
        ids,
        FEATURE.BATTERY_ENERGY,
        n(FEATURE.BATTERY_ENERGY),
        CATEGORIES.BATTERY_STORAGE,
        TYPES.BATTERY_STORAGE.BATTERY_ENERGY_REMAINING,
        UNITS.KILOWATT_HOUR,
        sb.capacityWh / 1000,
        { decimals: true },
      ),
    );
  }
  features.push(
    sensor(
      ids,
      FEATURE.CHARGE_POWER,
      n(FEATURE.CHARGE_POWER),
      CATEGORIES.BATTERY_STORAGE,
      TYPES.BATTERY_STORAGE.CHARGE_POWER,
      UNITS.WATT,
      MAX_SOLARBANK_W,
    ),
    sensor(
      ids,
      FEATURE.DISCHARGE_POWER,
      n(FEATURE.DISCHARGE_POWER),
      CATEGORIES.BATTERY_STORAGE,
      TYPES.BATTERY_STORAGE.DISCHARGE_POWER,
      UNITS.WATT,
      MAX_SOLARBANK_W,
    ),
    sensor(
      ids,
      FEATURE.SOLAR_POWER,
      n(FEATURE.SOLAR_POWER),
      CATEGORIES.ENERGY_PRODUCTION_SENSOR,
      TYPES.ENERGY_PRODUCTION_SENSOR.POWER,
      UNITS.WATT,
      MAX_SOLARBANK_W,
    ),
  );
  sb.pvInputs.forEach((value, index) => {
    // Only the inputs the cloud reports for this device (a Solarbank 2
    // cascaded with Solarbank 1 units has no per-input values).
    if (value === undefined) {
      return;
    }
    features.push(
      sensor(
        ids,
        solarInputKey(index + 1),
        n('solar_input', { n: index + 1 }),
        CATEGORIES.ENERGY_PRODUCTION_SENSOR,
        TYPES.ENERGY_PRODUCTION_SENSOR.POWER,
        UNITS.WATT,
        MAX_INPUT_W,
      ),
    );
  });
  features.push(
    sensor(
      ids,
      FEATURE.OUTPUT_POWER,
      n(FEATURE.OUTPUT_POWER),
      CATEGORIES.HOME_OUTPUT_SENSOR,
      TYPES.HOME_OUTPUT_SENSOR.POWER,
      UNITS.WATT,
      MAX_OUTPUT_W,
    ),
  );
  return {
    name,
    external_id: ids.device,
    model: sb.model,
    ...POLL,
    params: siteParams(site, sb.model),
    features,
  };
}

function inverterDevice(gladys, site, inverter, name, language) {
  const ids = deviceIds(gladys, KIND.INVERTER, inverter.sn);
  return {
    name,
    external_id: ids.device,
    model: inverter.model,
    ...POLL,
    params: siteParams(site, inverter.model),
    features: [
      sensor(
        ids,
        FEATURE.SOLAR_POWER,
        featureName(FEATURE.SOLAR_POWER, language),
        CATEGORIES.ENERGY_PRODUCTION_SENSOR,
        TYPES.ENERGY_PRODUCTION_SENSOR.POWER,
        UNITS.WATT,
        MAX_INVERTER_W,
      ),
    ],
  };
}

function meterDevice(gladys, site, meter, name, language) {
  const ids = deviceIds(gladys, KIND.SMARTMETER, meter.sn);
  const n = (key) => featureName(key, language);
  return {
    name,
    external_id: ids.device,
    model: meter.model,
    ...POLL,
    params: siteParams(site, meter.model),
    features: [
      sensor(
        ids,
        FEATURE.GRID_IMPORT,
        n(FEATURE.GRID_IMPORT),
        CATEGORIES.GRID_SENSOR,
        TYPES.GRID_SENSOR.INPUT_POWER,
        UNITS.WATT,
        MAX_HOME_W,
      ),
      sensor(
        ids,
        FEATURE.GRID_EXPORT,
        n(FEATURE.GRID_EXPORT),
        CATEGORIES.GRID_SENSOR,
        TYPES.GRID_SENSOR.OUTPUT_POWER,
        UNITS.WATT,
        MAX_HOME_W,
      ),
    ],
  };
}

function plugDevice(gladys, site, plug, name, language) {
  const ids = deviceIds(gladys, KIND.SMARTPLUG, plug.sn);
  return {
    name,
    external_id: ids.device,
    model: plug.model,
    ...POLL,
    params: siteParams(site, plug.model),
    features: [
      sensor(
        ids,
        FEATURE.PLUG_POWER,
        featureName('plug_power', language),
        CATEGORIES.SWITCH,
        TYPES.SWITCH.POWER,
        UNITS.WATT,
        MAX_PLUG_W,
      ),
    ],
  };
}

const BUILDERS = {
  [KIND.SOLARBANK]: solarbankDevice,
  [KIND.INVERTER]: inverterDevice,
  [KIND.SMARTMETER]: meterDevice,
  [KIND.SMARTPLUG]: plugDevice,
};

/**
 * Device names: the name given in the Anker app; when two devices of a
 * system share it (three "Solarbank 3 E2700 Pro" in a multisystem), the end
 * of the serial number tells them apart.
 */
function deviceNames(site) {
  const entries = siteDevices(site);
  const counts = new Map();
  for (const { device } of entries) {
    counts.set(device.name, (counts.get(device.name) ?? 0) + 1);
  }
  return new Map(
    entries.map(({ device }) => [
      device.sn,
      counts.get(device.name) > 1 ? `${device.name} ${device.sn.slice(-4)}` : device.name,
    ]),
  );
}

/**
 * Every Gladys device of the systems.
 * @param {object} gladys GladysIntegration (externalIds)
 * @param {object[]} sites parsed systems (model.js parseSite)
 * @param {string} language feature names
 */
export function buildDevices(gladys, sites, language) {
  const devices = [];
  for (const site of sites) {
    const system = systemDevice(gladys, site, language);
    if (system) {
      devices.push(system);
    }
    const names = deviceNames(site);
    for (const { kind, device } of siteDevices(site)) {
      devices.push(BUILDERS[kind](gladys, site, device, names.get(device.sn), language));
    }
  }
  return devices;
}

/**
 * The states of one system, in the publishStates format. A value the cloud
 * did not send is not published (the previous one stays in Gladys).
 * @param {object} gladys
 * @param {object} site parsed system
 * @param {{ productionTodayKwh?: number }} [extra] values read elsewhere
 */
export function buildStates(gladys, site, extra = {}) {
  const states = [];
  const push = (ids, key, value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      states.push({ device_feature_external_id: ids.feature(key), state: value });
    }
  };

  const system = deviceIds(gladys, KIND.SYSTEM, site.id);
  if (site.scheduleCapable && site.usageMode) {
    states.push({
      device_feature_external_id: system.feature(FEATURE.USAGE_MODE),
      text: site.usageMode,
    });
  }
  if (site.meters.length > 0) {
    push(system, FEATURE.HOME_LOAD, site.homeLoad);
  }
  push(system, FEATURE.PRODUCTION_TOTAL, site.productionTotalKwh);
  push(system, FEATURE.PRODUCTION_TODAY, extra.productionTodayKwh);

  for (const sb of site.solarbanks) {
    const ids = deviceIds(gladys, KIND.SOLARBANK, sb.sn);
    push(ids, FEATURE.BATTERY_LEVEL, sb.soc);
    if (sb.capacityWh) {
      push(ids, FEATURE.BATTERY_ENERGY, sb.energyKwh);
    }
    push(ids, FEATURE.CHARGE_POWER, sb.chargePower);
    push(ids, FEATURE.DISCHARGE_POWER, sb.dischargePower);
    push(ids, FEATURE.SOLAR_POWER, sb.solarPower);
    sb.pvInputs.forEach((value, index) => push(ids, solarInputKey(index + 1), value));
    push(ids, FEATURE.OUTPUT_POWER, sb.outputPower);
  }
  for (const inverter of site.inverters) {
    push(deviceIds(gladys, KIND.INVERTER, inverter.sn), FEATURE.SOLAR_POWER, inverter.solarPower);
  }
  for (const meter of site.meters) {
    const ids = deviceIds(gladys, KIND.SMARTMETER, meter.sn);
    push(ids, FEATURE.GRID_IMPORT, meter.gridImport);
    push(ids, FEATURE.GRID_EXPORT, meter.gridExport);
  }
  for (const plug of site.plugs) {
    push(deviceIds(gladys, KIND.SMARTPLUG, plug.sn), FEATURE.PLUG_POWER, plug.power);
  }
  return states;
}

/**
 * The Anker site id of a Gladys device (any device of the integration).
 * @param {object} device a Gladys device (params) or a discovered one
 */
export function siteIdOf(device) {
  return device?.params?.find((param) => param.name === SITE_PARAM)?.value;
}
