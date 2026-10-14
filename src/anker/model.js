// -----------------------------------------------------------------------------
// PURE: reading the answers of the Anker cloud. No I/O.
//
// `get_scen_info` is what the home screen of the Anker app shows for one
// system ("site"): every number arrives as a string ("741", "0.39", "200W"),
// some only for some models, and several fields are known to be misleading.
// The reading below follows thomluther/anker-solix-api (poller.py, MIT):
//   - `battery_power` of a Solarbank is its state of charge in %, not a power;
//   - the charge and discharge powers come from `bat_charge_power` and
//     `bat_discharge_power` when the cloud sends them (Solarbank 2 and later),
//     otherwise from the balance solar + grid charge - output;
//   - the PV inputs of a Solarbank are in `pv_power` (per device, multisystems)
//     or in `solarbank_info.solar_power_N` (the only Solarbank of the system);
//   - `statistics` type 1 is the energy the system produced since it was set
//     up, in kWh; `retain_load` the output preset of the system ("200W");
//   - a device `status` of "0" means the device is offline for the cloud.
// -----------------------------------------------------------------------------

/** Usable capacity per model, in Wh (apitypes.py SolixDeviceCapacity). */
export const BATTERY_CAPACITY_WH = {
  A17C0: 1600, // Solarbank E1600
  A17C1: 1600, // Solarbank 2 E1600 Pro
  A17C2: 1600, // Solarbank 2 E1600 AC
  A17C3: 1600, // Solarbank 2 E1600 Plus
  A17C5: 2688, // Solarbank 3 E2700 Pro
  AE103: 5024, // Solarbank 4 E5000 Pro
};

/** Number of PV inputs the cloud reports separately, per model. */
export const PV_INPUTS = {
  A17C1: 4,
  A17C2: 2,
  A17C3: 2,
  A17C5: 4,
};

/**
 * Models whose usage mode and output plans are the param_type 6 schedule
 * (Solarbank 2 and 3). The Solarbank 1 uses another schedule format, and the
 * later generations are not documented enough to be written blind.
 */
export const SCHEDULE_MODELS = new Set(['A17C1', 'A17C2', 'A17C3', 'A17C5']);

/** Models of the third generation, the only ones offering the AI "smart" mode. */
const SMART_MODE_MODELS = new Set(['A17C5']);

/**
 * Usage modes of a Solarbank 2/3 system (`scene_mode`, `mode_type` of the
 * schedule). Keys are what Gladys stores: English and stable.
 */
export const USAGE_MODES = {
  smartmeter: 1, // output follows the smart meter (self-consumption)
  smartplugs: 2, // output follows the Anker smart plugs
  manual: 3, // output follows the manual time plan
  backup: 4, // temporary emergency charge (cannot be set)
  use_time: 5, // time-of-use plan (Solarbank 2 AC and 3)
  smart: 7, // AI mode of the Solarbank 3
  time_slot: 8, // dynamic tariff slots
};

/** The modes the integration can set; the other ones are only read. */
export const SETTABLE_MODES = ['smartmeter', 'smartplugs', 'manual', 'smart'];

const MODE_BY_VALUE = new Map(Object.entries(USAGE_MODES).map(([key, value]) => [value, key]));

/** @returns {string|undefined} the mode key of a `scene_mode` value */
export const modeKey = (value) => MODE_BY_VALUE.get(Number(value));

/**
 * A number from a cloud string, or undefined when the field is absent,
 * empty or not a number ("", null, "--").
 * @param {unknown} value
 */
export function num(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value.replace(/[^\d.+-]/g, ''));
  return Number.isFinite(parsed) && /\d/.test(value) ? parsed : undefined;
}

const round = (value, decimals = 0) =>
  value === undefined ? undefined : Number(value.toFixed(decimals));

const online = (status) =>
  status === undefined || status === '' ? undefined : String(status) !== '0';

/**
 * Read one system.
 * @param {object} site entry of get_site_list (site_id, site_name, ms_type...)
 * @param {object} scene data of get_scen_info
 * @returns {object} the normalized system
 */
export function parseSite(site, scene) {
  const sbInfo = scene.solarbank_info ?? {};
  const sbList = Array.isArray(sbInfo.solarbank_list) ? sbInfo.solarbank_list : [];
  const single = sbList.length === 1;
  const siteGridCharge = num(sbInfo.grid_to_battery_power);

  const solarbanks = sbList
    .filter((sb) => sb && sb.device_sn)
    .map((sb) => {
      const model = String(sb.device_pn ?? '');
      const pvTotal = num(sb.pv_power?.total);
      const solarPower = pvTotal ?? num(sb.photovoltaic_power);
      const outputPower = num(sb.output_power);
      const inputs = PV_INPUTS[model] ?? 0;
      const pvInputs = [];
      for (let i = 1; i <= inputs; i += 1) {
        pvInputs.push(
          num(sb.pv_power?.[`pv${i}`]) ?? (single ? num(sbInfo[`solar_power_${i}`]) : undefined),
        );
      }
      const { chargePower, dischargePower } = batteryFlow(sb, {
        solarPower,
        outputPower,
        gridCharge: single ? siteGridCharge : undefined,
      });
      const soc = num(sb.battery_power);
      const expansions = num(sb.sub_package_num) ?? 0;
      const capacityWh = BATTERY_CAPACITY_WH[model]
        ? BATTERY_CAPACITY_WH[model] * (1 + expansions)
        : undefined;
      return {
        sn: String(sb.device_sn),
        model,
        name: String(sb.device_name || model || 'Solarbank'),
        online: online(sb.status),
        soc,
        capacityWh,
        energyKwh:
          soc === undefined || capacityWh === undefined
            ? undefined
            : round((soc / 100) * (capacityWh / 1000), 2),
        chargePower,
        dischargePower,
        solarPower,
        pvInputs,
        outputPower,
      };
    });

  const gridInfo = scene.grid_info ?? {};
  const meters = (Array.isArray(gridInfo.grid_list) ? gridInfo.grid_list : [])
    .filter((meter) => meter && meter.device_sn)
    .map((meter, index) => ({
      sn: String(meter.device_sn),
      model: String(meter.device_pn ?? ''),
      name: String(meter.device_name || meter.device_pn || 'Smart Meter'),
      online: online(meter.status),
      // The system reports one grid exchange: it belongs to its first meter.
      gridImport: index === 0 ? num(gridInfo.grid_to_home_power) : undefined,
      gridExport: index === 0 ? num(gridInfo.photovoltaic_to_grid_power) : undefined,
    }));

  const plugInfo = scene.smart_plug_info ?? {};
  const plugs = (Array.isArray(plugInfo.smartplug_list) ? plugInfo.smartplug_list : [])
    .filter((plug) => plug && plug.device_sn)
    .map((plug) => ({
      sn: String(plug.device_sn),
      model: String(plug.device_pn ?? ''),
      name: String(plug.device_name || plug.device_pn || 'Smart Plug'),
      online: online(plug.status),
      power: num(plug.current_power),
    }));

  const inverters = (Array.isArray(scene.solar_list) ? scene.solar_list : [])
    .filter((inverter) => inverter && inverter.device_sn)
    .map((inverter) => ({
      sn: String(inverter.device_sn),
      model: String(inverter.device_pn ?? ''),
      name: String(inverter.device_name || inverter.device_pn || 'Inverter'),
      online: online(inverter.status),
      solarPower: round(num(inverter.generate_power) ?? num(inverter.photovoltaic_power)),
    }));

  const production = (Array.isArray(scene.statistics) ? scene.statistics : []).find(
    (stat) => String(stat?.type) === '1',
  );
  const scheduleCapable = solarbanks.some((sb) => SCHEDULE_MODELS.has(sb.model));
  const usageMode = scheduleCapable ? modeKey(scene.scene_mode) : undefined;

  return {
    id: String(site.site_id ?? scene.site_id),
    name: String(site.site_name || 'Anker SOLIX'),
    // ms_type 1 = owner, 2 = member; an unknown value is treated as owner.
    owner: site.ms_type === undefined || [0, 1].includes(Number(site.ms_type)),
    scheduleCapable,
    usageMode,
    modes: scheduleCapable ? availableModes({ solarbanks, meters, plugs, usageMode }) : [],
    outputPreset: num(scene.retain_load),
    homeLoad: num(scene.home_load_power),
    productionTotalKwh: production ? num(production.total) : undefined,
    batteryLevel: siteBatteryLevel(solarbanks),
    solarbanks,
    meters,
    plugs,
    inverters,
  };
}

/**
 * Charge and discharge power of one Solarbank, both >= 0.
 * @param {object} sb solarbank_list entry
 * @param {{ solarPower?: number, outputPower?: number, gridCharge?: number }} flows
 */
function batteryFlow(sb, { solarPower, outputPower, gridCharge }) {
  const charge = num(sb.bat_charge_power);
  const discharge = num(sb.bat_discharge_power);
  if (charge > 0) {
    return { chargePower: charge, dischargePower: 0 };
  }
  if (discharge > 0) {
    return { chargePower: 0, dischargePower: discharge };
  }
  if (solarPower === undefined && outputPower === undefined) {
    return { chargePower: undefined, dischargePower: undefined };
  }
  const net = (solarPower ?? 0) + (gridCharge ?? 0) - (outputPower ?? 0);
  return { chargePower: Math.max(0, net), dischargePower: Math.max(0, -net) };
}

/** State of charge of the whole system, weighted by capacity. */
function siteBatteryLevel(solarbanks) {
  let weighted = 0;
  let total = 0;
  for (const sb of solarbanks) {
    if (sb.soc === undefined) {
      continue;
    }
    const weight = sb.capacityWh ?? 1600;
    weighted += sb.soc * weight;
    total += weight;
  }
  return total > 0 ? Math.round(weighted / total) : undefined;
}

/**
 * The usage modes offered for a Solarbank 2/3 system: manual always, the
 * smart meter and smart plug modes when such devices are in the system, the
 * AI mode on a Solarbank 3 with a smart meter (api.py
 * solarbank_usage_mode_options). The current mode is listed too when it is a
 * read-only one, so Gladys can show it.
 */
export function availableModes({ solarbanks, meters, plugs, usageMode }) {
  const modes = new Set(['manual']);
  if (meters.length > 0) {
    modes.add('smartmeter');
  }
  if (plugs.length > 0) {
    modes.add('smartplugs');
  }
  if (meters.length > 0 && solarbanks.some((sb) => SMART_MODE_MODELS.has(sb.model))) {
    modes.add('smart');
  }
  if (usageMode) {
    modes.add(usageMode);
  }
  return Object.keys(USAGE_MODES).filter((mode) => modes.has(mode));
}

/** Every device of a system, with its kind. */
export function siteDevices(site) {
  return [
    ...site.solarbanks.map((device) => ({ kind: 'solarbank', device })),
    ...site.inverters.map((device) => ({ kind: 'inverter', device })),
    ...site.meters.map((device) => ({ kind: 'smartmeter', device })),
    ...site.plugs.map((device) => ({ kind: 'smartplug', device })),
  ];
}
