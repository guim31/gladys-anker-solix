// -----------------------------------------------------------------------------
// Scene triggers: what the device states cannot tell. A usage mode changed
// outside Gladys (a text state cannot be compared in a scene), a device that
// stopped reporting to the cloud or came back. The battery thresholds are not
// triggers: the core's own "device value" trigger with "only when the
// threshold is crossed" already does it on the battery level feature.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TRIGGER } from '../src/app.js';
import { createWorld } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

async function world(options = {}) {
  let clock = Date.UTC(2026, 9, 14, 10, 0, 0);
  const w = await createWorld({ addDevices: true, now: () => clock, ...options });
  w.tick = async () => {
    clock += 60_000;
    await w.app.cycle();
  };
  return w;
}

test('the usage mode changed in the Anker app: one event, with the new and previous modes', async () => {
  const w = await world();
  w.anker.first.scene.scene_mode = 1;
  await w.tick();
  await w.tick();
  const events = w.gladys.fake.sceneEvents;
  assert.equal(events.length, 1);
  const system = w.gladys.externalIds('system', w.anker.first.site.site_id).device;
  assert.deepEqual(events[0], {
    key: TRIGGER.MODE_CHANGED,
    data: {
      system,
      mode: 'smartmeter',
      previous_mode: 'manual',
      mode_label: 'Compteur intelligent',
    },
  });
});

test('a mode set by Gladys itself fires no event (no loop through a scene)', async () => {
  const w = await world({ config: { allow_settings: true } });
  const system = w.gladys.fake.devices.find((d) => d.external_id.includes(':system:'));
  await w.gladys.fake.sceneAction('set_usage_mode', {
    system: system.external_id,
    mode: 'smartmeter',
  });
  await w.tick();
  assert.deepEqual(w.gladys.fake.sceneEvents, []);
  // A later change in the app is reported again.
  w.anker.first.scene.scene_mode = 3;
  await w.tick();
  assert.equal(w.gladys.fake.sceneEvents.length, 1);
});

test('a device offline for two reads in a row, then back: two events', async () => {
  const w = await world();
  const sb = w.anker.first.scene.solarbank_info.solarbank_list[0];
  const device = w.gladys.externalIds('solarbank', sb.device_sn).device;
  sb.status = '0';
  await w.tick();
  assert.deepEqual(w.gladys.fake.sceneEvents, [], 'one read is not enough (cloud hiccup)');
  await w.tick();
  await w.tick();
  sb.status = '1';
  await w.tick();
  assert.deepEqual(w.gladys.fake.sceneEvents, [
    {
      key: TRIGGER.CONNECTION_CHANGED,
      data: { device, state: 'offline', device_name: 'Solarbank 2 E1600 Pro' },
    },
    {
      key: TRIGGER.CONNECTION_CHANGED,
      data: { device, state: 'online', device_name: 'Solarbank 2 E1600 Pro' },
    },
  ]);
  assert.deepEqual(
    w.logger
      .at('info')
      .slice(-2)
      .map((line) => line.text),
    ['Solarbank 2 E1600 Pro: offline for the Anker cloud', 'Solarbank 2 E1600 Pro: back online'],
  );
});

test('every key of the events is a declared filter or variable', async () => {
  const w = await world();
  w.anker.first.scene.scene_mode = 1;
  const sb = w.anker.first.scene.solarbank_info.solarbank_list[0];
  sb.status = '0';
  await w.tick();
  await w.tick();
  const byKey = new Map(manifest.scene_triggers.map((trigger) => [trigger.key, trigger]));
  assert.equal(w.gladys.fake.sceneEvents.length, 2);
  for (const event of w.gladys.fake.sceneEvents) {
    const trigger = byKey.get(event.key);
    assert.ok(trigger, `${event.key} is declared`);
    const declared = new Set([...trigger.fields, ...trigger.variables].map((field) => field.key));
    for (const key of Object.keys(event.data)) {
      assert.ok(declared.has(key), `${event.key}.${key} is declared`);
    }
    for (const field of trigger.fields) {
      assert.ok(field.key in event.data, `${event.key}: the filter ${field.key} has a value`);
    }
  }
});
