// -----------------------------------------------------------------------------
// Quiet logs: nothing at info level for a normal refresh, one line at the
// first failure and one at the recovery, never a secret of the configuration
// (password, e-mail, token).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT } from './helpers/fakeAnker.js';
import { createWorld } from './helpers/world.js';

const visible = (logger) => logger.lines.filter((line) => line.level !== 'debug');

test('a normal refresh cycle writes nothing at info level', async () => {
  let clock = Date.UTC(2026, 9, 14, 10, 0, 0);
  const world = await createWorld({ addDevices: true, now: () => clock });
  world.logger.clear();
  for (let i = 0; i < 6; i += 1) {
    world.anker.first.scene.solarbank_info.solarbank_list[0].photovoltaic_power = String(700 + i);
    clock += 60_000;
    await world.app.cycle();
  }
  assert.deepEqual(visible(world.logger), []);
  assert.ok(world.logger.at('debug').length > 0, 'the details stay available in debug');
});

test('the startup says it once: connected, how many systems and devices', async () => {
  const world = await createWorld();
  assert.deepEqual(
    world.logger.at('info').map((line) => line.text),
    ['Connected to the Anker cloud: 1 system(s), 2 device(s)'],
  );
});

test('a cloud outage: one warning, silence while it lasts, one line at the recovery', async () => {
  let clock = Date.UTC(2026, 9, 14, 10, 0, 0);
  const world = await createWorld({ addDevices: true, now: () => clock });
  world.logger.clear();
  world.anker.failures['*'] = 'network';
  for (let i = 0; i < 5; i += 1) {
    clock += 60_000;
    await world.app.cycle();
  }
  assert.equal(world.logger.at('warn').length, 1);
  assert.match(world.logger.at('warn')[0].text, /Anker cloud unreachable/);
  assert.equal(world.logger.at('error').length, 0);
  const statuses = world.gladys.fake.connectionStatuses;
  assert.equal(statuses.at(-1).connected, false);
  assert.match(statuses.at(-1).message.fr, /ne répond pas/);
  assert.equal(statuses.filter((status) => status.connected === false).length, 1, 'said once');

  delete world.anker.failures['*'];
  clock += 60_000;
  await world.app.cycle();
  assert.deepEqual(
    world.logger.at('info').map((line) => line.text),
    ['Anker cloud reachable again'],
  );
  assert.equal(world.gladys.fake.connectionStatuses.at(-1).connected, true);
});

test('no secret of the configuration ever reaches the logs, even in debug', async () => {
  let clock = Date.UTC(2026, 9, 14, 10, 0, 0);
  const world = await createWorld({
    addDevices: true,
    now: () => clock,
    config: { allow_settings: true },
  });
  // Everything that logs: refresh, refused token, wrong password, settings.
  world.anker.revokeToken();
  clock += 60_000;
  await world.app.cycle();
  await world.gladys.fake.action('test_connection');
  const system = world.gladys.fake.devices.find((d) => d.external_id.includes(':system:'));
  await world.gladys.fake.sceneAction('set_usage_mode', {
    system: system.external_id,
    mode: 'smartmeter',
  });
  world.anker.password = 'changed-elsewhere';
  world.anker.revokeToken();
  clock += 60_000;
  await world.app.cycle();

  const all = world.logger.lines.map((line) => line.text).join('\n');
  assert.ok(world.logger.lines.length > 10);
  for (const secret of [ACCOUNT.password, ACCOUNT.email, 'token-1', 'token-2', 'token-3']) {
    assert.ok(!all.includes(secret), `"${secret}" appears in the logs`);
  }
  assert.match(all, /wrong e-mail or password/, 'the refusal itself is said');
});

test('a wrong password: one error, then no more login attempt until a new configuration', async () => {
  const world = await createWorld({ config: { password: 'not-the-right-one' } });
  assert.equal(world.logger.at('error').length, 1);
  assert.match(world.gladys.fake.connectionStatus.message.en, /refused the e-mail or the password/);
  const logins = () => world.anker.endpoints().filter((e) => e === 'passport/login').length;
  const before = logins();
  await world.app.cycle();
  await world.app.cycle();
  assert.equal(logins(), before, 'the account is not hammered');

  await world.gladys.fake.configUpdated({
    ...world.gladys.fake.config,
    password: ACCOUNT.password,
  });
  assert.equal(world.gladys.fake.connectionStatus.connected, true);
});
