// -----------------------------------------------------------------------------
// Settings: usage mode and output power of a Solarbank 2/3, from the device
// select, the scene actions and the widget form. Off by default, owner
// account only, never on a Solarbank 1, and nothing else ever written.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE } from '../src/devices.js';
import { createWorld } from './helpers/world.js';

const SET = 'power_service/v1/site/set_site_device_param';
const writes = (anker) => anker.calls.filter((call) => call.endpoint === SET);

function systemOf(world) {
  return world.gladys.fake.devices.find((device) => device.external_id.includes(':system:'));
}

async function setMode(world, mode) {
  const system = systemOf(world);
  const feature = system.features.find((f) => f.external_id.endsWith(`:${FEATURE.USAGE_MODE}`));
  return world.gladys.fake.setValue(system, feature, mode);
}

test('settings are refused while “Allow settings” is off (the default)', async () => {
  const world = await createWorld({ addDevices: true });
  const ack = await setMode(world, 'smartmeter');
  assert.equal(ack.success, false);
  assert.match(ack.error, /Autoriser les réglages/, 'in the configured language');
  const scene = await world.gladys.fake.sceneAction('set_output_power', {
    system: systemOf(world).external_id,
    power: 300,
  });
  assert.equal(scene.success, false);
  assert.deepEqual(writes(world.anker), []);
});

test('usage mode from the device select: written, state published at once', async () => {
  const world = await createWorld({ addDevices: true, config: { allow_settings: true } });
  const ack = await setMode(world, 'smartmeter');
  assert.deepEqual(ack, { success: true });
  const [write] = writes(world.anker);
  assert.deepEqual(JSON.parse(write.body.param_data), {
    mode_type: 1,
    manual_backup: {},
    use_time: [],
  });
  const mode = `${systemOf(world).external_id}:${FEATURE.USAGE_MODE}`;
  assert.equal(world.gladys.fake.lastState(mode), 'smartmeter');
  assert.deepEqual(
    world.logger.at('info').at(-1).text,
    'Maison: usage mode set to smartmeter',
    'one line per user action',
  );
});

test('a mode the system does not offer is refused, and the real mode is shown again', async () => {
  const world = await createWorld({ addDevices: true, config: { allow_settings: true } });
  const ack = await setMode(world, 'smartplugs');
  assert.equal(ack.success, false);
  assert.match(ack.error, /pas disponible/);
  assert.deepEqual(writes(world.anker), []);
  const mode = `${systemOf(world).external_id}:${FEATURE.USAGE_MODE}`;
  assert.equal(world.gladys.fake.lastState(mode), 'manual');
});

test('output power from a scene: current slot of the manual plan, applied value returned', async () => {
  // A Wednesday at 09:00, local time: the 08:00-22:00 weekday slot (120 W).
  const clock = new Date(2026, 9, 14, 9, 0).getTime();
  const world = await createWorld({
    addDevices: true,
    config: { allow_settings: true },
    now: () => clock,
  });
  const ack = await world.gladys.fake.sceneAction('set_output_power', {
    system: systemOf(world).external_id,
    power: 333,
  });
  assert.deepEqual(ack, { success: true, data: { outputs: { applied_power: 330 } } });
  const sent = JSON.parse(writes(world.anker)[0].body.param_data);
  assert.equal(sent.mode_type, 3);
  assert.equal(sent.custom_rate_plan[1].ranges[1].power, 330);
  assert.equal(sent.custom_rate_plan[1].ranges[0].power, 100, 'other slots untouched');
});

test('output power outside the manual mode is refused with the reason', async () => {
  const world = await createWorld({
    fixtures: ['sb2-pro-plugs'],
    addDevices: true,
    config: { allow_settings: true, language: 'en' },
  });
  const ack = await world.gladys.fake.sceneAction('set_output_power', {
    system: systemOf(world).external_id,
    power: 300,
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Manual plan/);
  assert.deepEqual(writes(world.anker), []);
});

test('a scene action may name any device of the system', async () => {
  const world = await createWorld({ addDevices: true, config: { allow_settings: true } });
  const meter = world.gladys.fake.devices.find((d) => d.external_id.includes(':smartmeter:'));
  const ack = await world.gladys.fake.sceneAction('set_usage_mode', {
    system: meter.external_id,
    mode: 'smartmeter',
  });
  assert.deepEqual(ack, { success: true, data: { outputs: { mode: 'smartmeter' } } });
});

test('a shared (member) account cannot change the settings', async () => {
  const world = await createWorld({
    addDevices: true,
    msType: 2,
    config: { allow_settings: true },
  });
  const ack = await setMode(world, 'smartmeter');
  assert.equal(ack.success, false);
  assert.match(ack.error, /compte propriétaire/);
  assert.deepEqual(writes(world.anker), []);
});

test('a Solarbank 1 system has no usage mode and no setting', async () => {
  const world = await createWorld({
    fixtures: ['sb1-single'],
    addDevices: true,
    config: { allow_settings: true },
  });
  const system = systemOf(world);
  assert.ok(!system.features.some((f) => f.external_id.endsWith(`:${FEATURE.USAGE_MODE}`)));
  const ack = await world.gladys.fake.sceneAction('set_output_power', {
    system: system.external_id,
    power: 200,
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Solarbank 2 ou 3/);
});

test('an unknown device is refused', async () => {
  const world = await createWorld({ addDevices: true, config: { allow_settings: true } });
  const ack = await world.gladys.fake.sceneAction('set_usage_mode', {
    system: 'ext:test-integration:solarbank:NOPE',
    mode: 'manual',
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Système inconnu/);
});

test('the connection test action reports the systems and devices', async () => {
  const world = await createWorld();
  const ack = await world.gladys.fake.action('test_connection');
  assert.equal(ack.success, true);
  assert.equal(ack.data.message.fr, 'Connecté : 1 système(s), 2 appareil(s).');
  assert.equal(ack.data.message.de, 'Verbunden: 1 System(e), 2 Gerät(e).');

  const wrong = await createWorld({ config: { password: 'bad-password-123' } });
  const refused = await wrong.gladys.fake.action('test_connection');
  assert.match(refused.data.message.en, /refused the e-mail or the password/);
});
