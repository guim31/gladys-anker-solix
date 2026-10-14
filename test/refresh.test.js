// -----------------------------------------------------------------------------
// Refresh: the container reads the cloud on its own timer, without waiting
// for the core's onPoll (GladysAssistant/Gladys#3198); onPoll is a fallback
// skipped right after the timer; only the systems with a device in Gladys are
// read; the energy statistics every 5 minutes; changes only, plus a heartbeat.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE, KIND } from '../src/devices.js';
import { addAll, createWorld } from './helpers/world.js';

const SCENE = 'power_service/v1/site/get_scen_info';
const ENERGY = 'power_service/v1/site/energy_analysis';
const count = (anker, endpoint) => anker.endpoints().filter((e) => e === endpoint).length;
const flush = async () => {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

function batteryId(world) {
  const sn = world.anker.first.scene.solarbank_info.solarbank_list[0].device_sn;
  return world.gladys.externalIds(KIND.SOLARBANK, sn).feature(FEATURE.BATTERY_LEVEL);
}

test('the states refresh on the container timer, without any onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ timers: true, addDevices: true });
  t.after(() => world.app.stop());
  const { gladys, anker } = world;
  assert.equal(gladys.fake.lastState(batteryId(world)), 39);
  const scenesBefore = count(anker, SCENE);

  anker.first.scene.solarbank_info.solarbank_list[0].battery_power = '55';
  t.mock.timers.tick(59_000);
  await flush();
  assert.equal(count(anker, SCENE), scenesBefore, 'not before the interval');

  t.mock.timers.tick(1_000);
  await flush();
  assert.equal(count(anker, SCENE), scenesBefore + 1);
  assert.equal(gladys.fake.lastState(batteryId(world)), 55);
  assert.ok(
    !gladys.fake.wsMessages.some((message) => /poll/.test(message.type)),
    'no poll message from the core',
  );

  // And again at the next interval.
  anker.first.scene.solarbank_info.solarbank_list[0].battery_power = '56';
  t.mock.timers.tick(60_000);
  await flush();
  assert.equal(gladys.fake.lastState(batteryId(world)), 56);
});

test('the interval of the configuration is used (5 minutes)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({
    timers: true,
    addDevices: true,
    config: { refresh_interval: '300' },
  });
  t.after(() => world.app.stop());
  const before = count(world.anker, SCENE);
  t.mock.timers.tick(120_000);
  await flush();
  assert.equal(count(world.anker, SCENE), before);
  t.mock.timers.tick(180_000);
  await flush();
  assert.equal(count(world.anker, SCENE), before + 1);
});

test('only the systems with a device added to Gladys are read', async () => {
  const world = await createWorld();
  const before = count(world.anker, SCENE);
  await world.app.cycle();
  assert.equal(count(world.anker, SCENE), before, 'nothing added: no read');

  await addAll(world);
  const afterAdd = count(world.anker, SCENE);
  await world.app.cycle();
  assert.equal(count(world.anker, SCENE), afterAdd + 1);
});

test('onPoll is a fallback: skipped right after the timer, used when it stalls', async () => {
  let clock = Date.UTC(2026, 9, 14, 10, 0, 0);
  const world = await createWorld({ addDevices: true, now: () => clock });
  const device = world.gladys.fake.devices[0];
  await world.app.cycle();
  const before = count(world.anker, SCENE);

  clock += 30_000;
  assert.deepEqual(await world.gladys.fake.poll(device), { success: true });
  assert.equal(count(world.anker, SCENE), before, 'read 30 s ago: skipped');

  clock += 40_000;
  await world.gladys.fake.poll(device);
  assert.equal(count(world.anker, SCENE), before + 1, 'the timer stalled: onPoll reads');
});

test('today’s production: every 5 minutes, not at every refresh', async () => {
  let clock = Date.UTC(2026, 9, 14, 10, 0, 0);
  const world = await createWorld({ addDevices: true, now: () => clock });
  const start = count(world.anker, ENERGY);
  for (let minute = 1; minute <= 4; minute += 1) {
    clock += 60_000;
    await world.app.cycle();
  }
  assert.equal(count(world.anker, ENERGY), start, 'within 5 minutes');
  clock += 60_000;
  await world.app.cycle();
  assert.equal(count(world.anker, ENERGY), start + 1);

  const system = world.gladys.externalIds(KIND.SYSTEM, world.anker.first.site.site_id);
  assert.equal(world.gladys.fake.lastState(system.feature(FEATURE.PRODUCTION_TODAY)), 1.25);
});

test('only the changes are published, plus a heartbeat every 6 hours', async () => {
  let clock = Date.UTC(2026, 9, 14, 10, 0, 0);
  const world = await createWorld({ addDevices: true, now: () => clock });
  // The SDK dates its heartbeat with the real clock: check the option it gets.
  const calls = [];
  const original = world.gladys.publishChangedStates.bind(world.gladys);
  world.gladys.publishChangedStates = (states, options) => {
    calls.push(options);
    return original(states, options);
  };
  const before = world.gladys.fake.states.length;
  clock += 60_000;
  await world.app.cycle();
  assert.equal(world.gladys.fake.states.length, before, 'nothing changed: nothing sent');
  assert.equal(calls.at(-1).heartbeat, 6 * 3600 * 1000);

  world.anker.first.scene.grid_info.grid_to_home_power = '700';
  clock += 60_000;
  await world.app.cycle();
  const sent = world.gladys.fake.states.slice(before);
  assert.deepEqual(
    sent.map((state) => state.device_feature_external_id.split(':').pop()),
    ['grid_import'],
  );
});

test('a device added later receives its states at once', async () => {
  const world = await createWorld();
  const meter = world.gladys.fake.discoveredDevices.find((d) =>
    d.external_id.includes(':smartmeter:'),
  );
  await world.gladys.fake.deviceCreated(meter);
  assert.equal(world.gladys.fake.lastState(`${meter.external_id}:${FEATURE.GRID_IMPORT}`), 684);
  assert.ok(world.gladys.fake.widgetRefreshes.length > 0, 'the widget is nudged');
});

test('the cloud down at the start: the next refresh reads the account and publishes the devices', async () => {
  let clock = Date.UTC(2026, 9, 14, 10, 0, 0);
  const world = await createWorld({ connect: false, now: () => clock });
  world.anker.failures['*'] = 'network';
  await world.gladys.connect();
  assert.deepEqual(world.gladys.fake.discoveredDevices, []);
  assert.equal(world.gladys.fake.connectionStatus.connected, false);

  delete world.anker.failures['*'];
  clock += 60_000;
  await world.app.cycle();
  assert.equal(world.gladys.fake.discoveredDevices.length, 3, 'system, Solarbank, meter');
  assert.equal(world.gladys.fake.connectionStatus.connected, true);
});

test('a device added in the Anker app shows up in the Discovery tab within 30 minutes', async () => {
  let clock = Date.UTC(2026, 9, 14, 10, 0, 0);
  const world = await createWorld({ addDevices: true, now: () => clock });
  const scene = world.anker.first.scene;
  scene.smart_plug_info = {
    smartplug_list: [
      {
        device_pn: 'A17X8',
        device_sn: 'TESTPLUG0001',
        device_name: 'Dryer',
        current_power: '0',
        status: '1',
      },
    ],
    total_power: '0',
  };
  clock += 60_000;
  await world.app.cycle();
  assert.equal(world.gladys.fake.discoveredDevices.length, 3, 'not at every refresh');
  clock += 30 * 60_000;
  await world.app.cycle();
  const names = world.gladys.fake.discoveredDevices.map((device) => device.name);
  assert.ok(names.includes('Dryer'), names.join(', '));
});
