// -----------------------------------------------------------------------------
// Anker systems -> Gladys devices: one device per physical device plus one
// "system" device, stable external ids from the serials and the site id,
// names from the Anker app, feature names in the configured language.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { parseSite } from '../src/anker/model.js';
import { FEATURE, KIND, SITE_PARAM, buildDevices, buildStates, siteIdOf } from '../src/devices.js';
import { loadFixture } from './helpers/fakeAnker.js';

const gladys = createFakeGladys();
const site = (name) => {
  const fixture = loadFixture(name);
  return parseSite(fixture.site, fixture.scene);
};
const keys = (device) => device.features.map((f) => f.external_id.split(':').pop());

test('Solarbank 2 Pro + smart meter: a system device, the Solarbank, the meter', () => {
  const s = site('sb2-pro-meter-manual');
  const [system, solarbank, meter] = buildDevices(gladys, [s], 'fr');
  assert.equal(system.name, 'Anker SOLIX Maison');
  assert.equal(system.external_id, `ext:test-integration:${KIND.SYSTEM}:${s.id}`);
  assert.deepEqual(keys(system), [
    'usage_mode',
    'home_load',
    'production_total',
    'production_today',
  ]);
  const mode = system.features[0];
  assert.deepEqual(
    mode.supported_options.map((option) => [option.value, option.label]),
    [
      ['smartmeter', 'Compteur intelligent'],
      ['manual', 'Planning manuel'],
    ],
  );
  assert.equal(solarbank.name, 'Solarbank 2 E1600 Pro');
  assert.equal(solarbank.model, 'A17C1');
  assert.deepEqual(keys(solarbank), [
    'battery_level',
    'battery_energy',
    'charge_power',
    'discharge_power',
    'solar_power',
    'solar_power_1',
    'solar_power_2',
    'solar_power_3',
    'solar_power_4',
    'output_power',
  ]);
  assert.equal(solarbank.features[1].max, 4, 'stored energy bounded by 3.2 kWh, rounded up');
  assert.deepEqual(keys(meter), ['grid_import', 'grid_export']);
  for (const device of [system, solarbank, meter]) {
    assert.equal(siteIdOf(device), s.id, `${device.name}: ${SITE_PARAM}`);
  }
});

test('feature names follow the configured language', () => {
  const s = site('sb2-pro-meter-manual');
  const names = (language) => buildDevices(gladys, [s], language)[1].features.map((f) => f.name);
  assert.equal(names('fr')[0], 'Niveau de batterie');
  assert.equal(names('en')[5], 'Solar input 1');
  assert.equal(names('de')[9], 'Leistung zum Haus');
  assert.equal(names('es')[2], 'Potencia de carga');
});

test('three devices with the same name get the end of their serial number', () => {
  const devices = buildDevices(gladys, [site('sb3-multisystem')], 'en');
  const solarbanks = devices.filter((d) => d.external_id.includes(':solarbank:'));
  assert.equal(new Set(solarbanks.map((d) => d.name)).size, 3);
  for (const device of solarbanks) {
    assert.match(device.name, /^Solarbank 3 E2700 Pro [A-Z0-9]{4}$/);
  }
});

test('Solarbank 1 and MI80: no usage mode, no per-input power, an inverter device', () => {
  const devices = buildDevices(gladys, [site('sb1-dual-mi80')], 'fr');
  const system = devices[0];
  assert.deepEqual(keys(system), ['production_total', 'production_today']);
  const inverter = devices.find((d) => d.external_id.includes(':inverter:'));
  assert.deepEqual(keys(inverter), ['solar_power']);
  const sb1 = devices.find((d) => d.external_id.includes(':solarbank:'));
  assert.ok(!keys(sb1).includes('solar_power_1'));
});

test('smart plugs: one device each, power only (read, not switched)', () => {
  const plugs = buildDevices(gladys, [site('sb3-plugs')], 'fr').filter((d) =>
    d.external_id.includes(':smartplug:'),
  );
  assert.equal(plugs.length, 4);
  for (const plug of plugs) {
    assert.deepEqual(keys(plug), [FEATURE.PLUG_POWER]);
    assert.equal(plug.features[0].read_only, true);
  }
  // No home consumption without a meter.
  const system = buildDevices(gladys, [site('sb3-plugs')], 'fr')[0];
  assert.ok(!keys(system).includes('home_load'));
});

test('states: numbers for the measures, text for the mode, nothing for a missing value', () => {
  const s = site('sb2-pro-meter-manual');
  const states = buildStates(gladys, s, { productionTodayKwh: 1.91 });
  const byKey = Object.fromEntries(
    states.map((state) => [state.device_feature_external_id.split(':').slice(-2).join(':'), state]),
  );
  assert.deepEqual(byKey[`${s.id}:usage_mode`], {
    device_feature_external_id: `ext:test-integration:system:${s.id}:usage_mode`,
    text: 'manual',
  });
  assert.equal(byKey[`${s.id}:production_today`].state, 1.91);
  assert.equal(byKey[`${s.solarbanks[0].sn}:battery_level`].state, 39);
  assert.equal(byKey[`${s.solarbanks[0].sn}:solar_power_3`].state, 190);

  s.solarbanks[0].soc = undefined;
  assert.ok(
    !buildStates(gladys, s).some((state) =>
      state.device_feature_external_id.endsWith(':battery_level'),
    ),
  );
});

test('external ids come from the serials and the site id, never from a name', () => {
  const s = site('sb3-plugs');
  const renamed = { ...s, name: 'Renamed', plugs: s.plugs.map((p) => ({ ...p, name: 'Other' })) };
  const ids = (x) =>
    buildDevices(gladys, [x], 'fr').flatMap((d) => [
      d.external_id,
      ...d.features.map((f) => f.external_id),
    ]);
  assert.deepEqual(ids(renamed), ids(s));
});
