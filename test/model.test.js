// -----------------------------------------------------------------------------
// Reading real answers of the Anker cloud (test/fixtures/anker/, published by
// thomluther/anker-solix-api, anonymized): every Solarbank generation, alone,
// cascaded or in a multisystem, with a smart meter, smart plugs or an MI80.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableModes, modeKey, num, parseSite } from '../src/anker/model.js';
import { FIXTURES, loadFixture } from './helpers/fakeAnker.js';

const parse = (name) => {
  const fixture = loadFixture(name);
  return parseSite(fixture.site, fixture.scene);
};

test('numbers arrive as strings, some empty or with a unit', () => {
  assert.equal(num('741'), 741);
  assert.equal(num('0.39'), 0.39);
  assert.equal(num('200W'), 200);
  assert.equal(num(''), undefined);
  assert.equal(num(null), undefined);
  assert.equal(num('--'), undefined);
  assert.equal(num(12), 12);
});

test('every fixture reads into a system with devices', () => {
  for (const name of FIXTURES) {
    const site = parse(name);
    assert.ok(site.id, name);
    assert.ok(site.solarbanks.length > 0, name);
    for (const sb of site.solarbanks) {
      assert.ok(sb.sn && sb.model, name);
      assert.ok(sb.soc >= 0 && sb.soc <= 100, `${name}: ${sb.soc}`);
      assert.ok(sb.chargePower >= 0 && sb.dischargePower >= 0, name);
      assert.ok(!(sb.chargePower > 0 && sb.dischargePower > 0), `${name}: both directions`);
    }
  }
});

test('Solarbank 2 Pro with a smart meter, manual plan, charging from the sun', () => {
  const site = parse('sb2-pro-meter-manual');
  assert.equal(site.name, 'Maison');
  assert.equal(site.owner, true);
  assert.equal(site.scheduleCapable, true);
  assert.equal(site.usageMode, 'manual');
  assert.deepEqual(site.modes, ['smartmeter', 'manual']);
  assert.equal(site.productionTotalKwh, 151.7);
  assert.equal(site.homeLoad, 684);
  const [sb] = site.solarbanks;
  assert.equal(sb.model, 'A17C1');
  assert.equal(sb.soc, 39);
  assert.equal(sb.capacityWh, 3200, 'one BP1600 expansion');
  assert.equal(sb.energyKwh, 1.25);
  assert.equal(sb.solarPower, 741);
  assert.deepEqual(sb.pvInputs, [191, 182, 190, 178]);
  assert.equal(sb.chargePower, 741, 'all the sun into the battery');
  assert.equal(sb.dischargePower, 0);
  assert.equal(sb.outputPower, 0);
  const [meter] = site.meters;
  assert.equal(meter.gridImport, 684);
  assert.equal(meter.gridExport, 0);
});

test('Solarbank 3 in AI mode: bypass, the battery neither charges nor discharges', () => {
  const site = parse('sb3-smart-meter');
  assert.equal(site.usageMode, 'smart');
  assert.deepEqual(site.modes, ['smartmeter', 'manual', 'smart']);
  assert.equal(site.outputPreset, 200);
  const [sb] = site.solarbanks;
  assert.equal(sb.capacityWh, 2688);
  assert.deepEqual(sb.pvInputs, [252, 282, 0, 0]);
  assert.equal(sb.chargePower, 0);
  assert.equal(sb.dischargePower, 0);
  assert.equal(sb.outputPower, 534);
  assert.equal(site.meters[0].model, 'SHEMP3', 'a Shelly Pro 3EM as meter');
});

test('Solarbank 1: no usage mode, power balance computed', () => {
  const site = parse('sb1-single');
  assert.equal(site.scheduleCapable, false);
  assert.equal(site.usageMode, undefined);
  assert.deepEqual(site.modes, []);
  const [sb] = site.solarbanks;
  assert.equal(sb.model, 'A17C0');
  assert.deepEqual(sb.pvInputs, [], 'one MPPT, no per-input value');
});

test('two Solarbank 1 and an MI80 micro-inverter', () => {
  const site = parse('sb1-dual-mi80');
  assert.equal(site.solarbanks.length, 2);
  assert.equal(site.inverters.length, 1);
  assert.equal(site.inverters[0].model, 'A5143');
  assert.equal(site.inverters[0].solarPower, 0);
  assert.equal(site.batteryLevel, 26, 'weighted by capacity');
});

test('smart plugs: power per plug; the smart plug mode is offered', () => {
  const site = parse('sb3-plugs');
  assert.equal(site.plugs.length, 4);
  assert.deepEqual(
    site.plugs.map((plug) => plug.power),
    [2, 0, 85, 66],
  );
  assert.ok(site.modes.includes('smartplugs'));
  assert.ok(!site.modes.includes('smartmeter'), 'no smart meter in this system');
});

test('multisystem: three Solarbank 3 with per-device PV values', () => {
  const site = parse('sb3-multisystem');
  assert.equal(site.solarbanks.length, 3);
  for (const sb of site.solarbanks) {
    assert.equal(sb.capacityWh, 2688 * 3, 'two BP2700 expansions each');
    assert.deepEqual(sb.pvInputs, [0, 0, 0, 0]);
    assert.equal(sb.dischargePower, sb.outputPower, 'night: the battery feeds the home');
  }
});

test('Solarbank 2 cascaded with two Solarbank 1: no per-input value for the Solarbank 2', () => {
  const site = parse('sb2-sb1-cascaded');
  const sb2 = site.solarbanks.find((sb) => sb.model === 'A17C1');
  assert.deepEqual(sb2.pvInputs, [undefined, undefined, undefined, undefined]);
});

test('Solarbank 2 AC in time-of-use mode: a read-only mode stays listed', () => {
  const site = parse('sb2-ac-use-time');
  assert.equal(site.usageMode, 'use_time');
  assert.ok(site.modes.includes('use_time'));
});

test('an offline device', () => {
  const fixture = loadFixture('sb2-pro-meter-manual');
  fixture.scene.solarbank_info.solarbank_list[0].status = '0';
  const site = parseSite(fixture.site, fixture.scene);
  assert.equal(site.solarbanks[0].online, false);
  assert.equal(site.meters[0].online, true);
});

test('a member account is not the owner', () => {
  const fixture = loadFixture('sb2-pro-meter-manual');
  const site = parseSite({ ...fixture.site, ms_type: 2 }, fixture.scene);
  assert.equal(site.owner, false);
});

test('mode keys and options', () => {
  assert.equal(modeKey(1), 'smartmeter');
  assert.equal(modeKey('3'), 'manual');
  assert.equal(modeKey(99), undefined);
  assert.deepEqual(
    availableModes({
      solarbanks: [{ model: 'A17C1' }],
      meters: [],
      plugs: [],
      usageMode: undefined,
    }),
    ['manual'],
  );
});
