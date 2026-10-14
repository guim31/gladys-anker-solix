// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTION, SCENE_ACTION, TRIGGER } from '../src/app.js';
import { SETTABLE_MODES, USAGE_MODES } from '../src/anker/model.js';
import { DEFAULT_CONFIG, LANGUAGES, REFRESH_INTERVALS, normalizeConfig } from '../src/config.js';
import { WIDGET_KEY } from '../src/widgets.js';
import { createWorld } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// The handlers the integration registers on the SDK.
const { gladys: registered } = await createWorld({ connect: false });
const handlerKeys = (prefix) =>
  Object.keys(registered.handlers)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length))
    .sort();

const keysOf = (list) => (list ?? []).map((entry) => entry.key).sort();

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('identity: name, image, cloud transport, energy category', () => {
  assert.equal(manifest.name, 'Anker SOLIX');
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.docker_image, `ghcr.io/guim31/gladys-anker-solix:${pkg.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-anker-solix/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['energy']);
});

test('version matches package.json', () => {
  assert.equal(manifest.version, pkg.version);
});

test('the widget buttons open a form: Gladys >= 5.2.0 (#3168)', () => {
  assert.ok(isAtLeast(minGladysVersion(), [5, 2, 0]), manifest.gladys_version);
});

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(handlerKeys('action:'), keysOf(manifest.actions));
  assert.deepEqual(keysOf(manifest.actions), Object.values(ACTION).sort());
});

test('every scene action has a handler, and vice versa', () => {
  assert.deepEqual(handlerKeys('sceneAction:'), keysOf(manifest.scene_actions));
  assert.deepEqual(keysOf(manifest.scene_actions), Object.values(SCENE_ACTION).sort());
});

test('the scene actions return their declared outputs', async () => {
  const clock = new Date(2026, 9, 14, 9, 0).getTime();
  const world = await createWorld({
    addDevices: true,
    config: { allow_settings: true },
    now: () => clock,
  });
  const system = world.gladys.fake.devices.find((d) => d.external_id.includes(':system:'));
  const fields = {
    set_output_power: { system: system.external_id, power: 200 },
    set_usage_mode: { system: system.external_id, mode: 'manual' },
  };
  for (const action of manifest.scene_actions) {
    const ack = await world.gladys.fake.sceneAction(action.key, fields[action.key]);
    assert.equal(ack.success, true, `${action.key}: ${ack.error}`);
    assert.deepEqual(Object.keys(ack.data.outputs).sort(), keysOf(action.outputs), action.key);
  }
});

test('the usage mode options are the settable modes of the code', () => {
  const action = manifest.scene_actions.find((entry) => entry.key === SCENE_ACTION.MODE);
  const mode = action.fields.find((field) => field.key === 'mode');
  assert.deepEqual(
    mode.options.map((option) => option.value),
    SETTABLE_MODES,
  );
  const trigger = manifest.scene_triggers.find((entry) => entry.key === TRIGGER.MODE_CHANGED);
  assert.deepEqual(
    trigger.fields.find((field) => field.key === 'mode').options.map((option) => option.value),
    Object.keys(USAGE_MODES),
  );
});

test('every scene trigger fired by the code is declared, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers), Object.values(TRIGGER).sort());
});

test('every widget has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.deepEqual(handlerKeys('widget:'), [WIDGET_KEY]);
  assert.deepEqual(handlerKeys('widgetAction:'), [WIDGET_KEY]);
});

test('the config defaults are the code defaults', () => {
  const fields = Object.fromEntries(
    manifest.config_schema.filter((field) => field.type !== 'section').map((f) => [f.key, f]),
  );
  assert.deepEqual(Object.keys(fields).sort(), Object.keys(DEFAULT_CONFIG).sort());
  const defaults = Object.fromEntries(
    Object.entries(fields)
      .filter(([, field]) => field.default !== undefined)
      .map(([key, field]) => [key, field.default]),
  );
  const normalized = normalizeConfig({ ...defaults, email: '', password: '' });
  assert.deepEqual(normalized, DEFAULT_CONFIG);
  assert.equal(fields.password.type, 'secret');
  assert.equal(fields.allow_settings.default, false, 'settings are off by default');
  assert.deepEqual(
    fields.language.options.map((option) => option.value),
    LANGUAGES,
  );
  assert.deepEqual(
    fields.refresh_interval.options.map((option) => Number(option.value)),
    REFRESH_INTERVALS,
  );
});

test('no secret field in an action, nor in a scene card (unfillable or readable)', () => {
  for (const item of [
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ]) {
    for (const field of item.fields ?? []) {
      assert.notEqual(field.type, 'secret', `${item.key}.${field.key}`);
    }
  }
});

test('number fields: integer min and default (the form has no step)', () => {
  for (const field of allFields.filter((f) => f.type === 'number')) {
    assert.ok(Number.isInteger(field.min ?? 0), field.key);
    assert.ok(field.default === undefined || Number.isInteger(field.default), field.key);
  }
});

test('select defaults are among the options', () => {
  for (const field of allFields.filter((f) => f.type === 'select' && f.default !== undefined)) {
    assert.ok(
      field.options.some((option) => option.value === field.default),
      `${field.key}: ${field.default}`,
    );
  }
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [language, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `${language}: ${text.length}`);
  }
});
