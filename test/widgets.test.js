// -----------------------------------------------------------------------------
// The "Anker SOLIX" widget: the energy flow of a system, valid for the core
// (validateWidgetContent: vocabulary and budget), in every language, with the
// setting buttons only when they can work.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { parseSite } from '../src/anker/model.js';
import { WIDGET_ACTION, WIDGET_KEY, buildEnergyFlowContent } from '../src/widgets.js';
import { FIXTURES, loadFixture } from './helpers/fakeAnker.js';
import { createWorld } from './helpers/world.js';

const site = (name) => {
  const fixture = loadFixture(name);
  return parseSite(fixture.site, fixture.scene);
};
const types = (content) => content.components.map((component) => component.type);

test('every fixture gives a valid content, in every language', () => {
  for (const name of FIXTURES) {
    for (const language of ['en', 'fr', 'de', 'es']) {
      for (const allowSettings of [false, true]) {
        const content = buildEnergyFlowContent({
          site: site(name),
          language,
          ttlSeconds: 60,
          productionTodayKwh: 1.91,
          allowSettings,
          output: { min: 0, max: 800, preset: 120 },
        });
        assert.deepEqual(validateWidgetContent(content), [], `${name} ${language}`);
        assert.ok(content.components.length <= 8, `${name}: budget`);
      }
    }
  }
});

test('solar -> battery -> home -> grid, with the battery gauge', () => {
  const content = buildEnergyFlowContent({
    site: site('sb2-pro-meter-manual'),
    language: 'fr',
    ttlSeconds: 60,
    productionTodayKwh: 1.91,
  });
  assert.deepEqual(types(content), ['gauge', 'value', 'value', 'value', 'value', 'status']);
  const [gauge, solar, battery, home, grid, status] = content.components;
  assert.equal(gauge.value, 39);
  assert.equal(gauge.color, 'warning');
  assert.deepEqual([solar.label, solar.value], ['Solaire', 741]);
  assert.deepEqual(
    [battery.label, battery.value, battery.icon],
    ['Charge', 741, 'battery-charging'],
  );
  assert.deepEqual([home.label, home.value], ['Vers la maison', 0]);
  assert.deepEqual([grid.label, grid.value], ['Soutirage', 684]);
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value]),
    [
      ['Mode', 'Planning manuel'],
      ['Consigne de sortie', '0 W'],
      ['Énergie stockée', '1.25 kWh'],
      ['Solaire du jour', '1.91 kWh'],
    ],
  );
});

test('the setting buttons open a form, only when allowed, for the owner of a Solarbank 2/3', () => {
  const base = { language: 'en', ttlSeconds: 60, output: { min: 0, max: 800, preset: 120 } };
  const off = buildEnergyFlowContent({ ...base, site: site('sb2-pro-meter-manual') });
  assert.ok(!types(off).includes('button'));

  const on = buildEnergyFlowContent({
    ...base,
    site: site('sb2-pro-meter-manual'),
    allowSettings: true,
  });
  const buttons = on.components.filter((component) => component.type === 'button');
  assert.deepEqual(
    buttons.map((button) => button.action.key),
    [WIDGET_ACTION.OUTPUT, WIDGET_ACTION.MODE],
  );
  assert.deepEqual(buttons[0].action.fields[0], {
    key: 'watts',
    type: 'number',
    label: {
      en: 'Output power (W)',
      fr: 'Puissance de sortie (W)',
      de: 'Ausgangsleistung (W)',
      es: 'Potencia de salida (W)',
    },
    required: true,
    min: 0,
    max: 800,
    default: 120,
  });
  assert.deepEqual(
    buttons[1].action.fields[0].options.map((option) => option.value),
    ['smartmeter', 'manual'],
  );
  assert.equal(buttons[1].action.fields[0].default, 'manual');

  const member = { ...site('sb2-pro-meter-manual'), owner: false };
  assert.ok(
    !types(buildEnergyFlowContent({ ...base, site: member, allowSettings: true })).includes(
      'button',
    ),
  );
  const sb1 = buildEnergyFlowContent({ ...base, site: site('sb1-single'), allowSettings: true });
  assert.ok(!types(sb1).includes('button'));
  // AI mode: no output button (manual plan only), the mode button stays.
  const smart = buildEnergyFlowContent({
    ...base,
    site: site('sb3-smart-meter'),
    allowSettings: true,
  });
  assert.deepEqual(
    smart.components.filter((c) => c.type === 'button').map((button) => button.action.key),
    [WIDGET_ACTION.MODE],
  );
});

test('an offline device is listed in red', () => {
  const s = site('sb3-plugs');
  s.plugs[1].online = false;
  const content = buildEnergyFlowContent({ site: s, language: 'de', ttlSeconds: 60 });
  const status = content.components.find((component) => component.type === 'status');
  assert.deepEqual(status.items.at(-1), {
    label: 'Offline',
    value: 'Smart Plug',
    icon: 'wifi-off',
    color: 'danger',
  });
});

test('through Gladys: the content, the form actions and their toast', async () => {
  const clock = new Date(2026, 9, 14, 9, 0).getTime();
  const world = await createWorld({
    addDevices: true,
    config: { allow_settings: true },
    now: () => clock,
  });
  const ack = await world.gladys.fake.widgetGet(WIDGET_KEY, { language: 'es' });
  assert.equal(ack.success, true);
  const content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  const output = content.components.find((c) => c.action?.key === WIDGET_ACTION.OUTPUT);
  assert.equal(output.action.fields[0].default, 120, 'the current slot of the plan');

  const set = await world.gladys.fake.widgetAction(
    WIDGET_KEY,
    WIDGET_ACTION.OUTPUT,
    output.action.params,
    {
      values: { watts: 250 },
    },
  );
  assert.equal(set.success, true);
  assert.equal(set.data.message.es, 'Potencia de salida ajustada a 250 W.');

  const mode = await world.gladys.fake.widgetAction(
    WIDGET_KEY,
    WIDGET_ACTION.MODE,
    output.action.params,
    {
      values: { mode: 'smartmeter' },
    },
  );
  assert.equal(mode.data.message.fr, 'Mode d’utilisation : Compteur intelligent.');

  const noForm = await world.gladys.fake.widgetAction(
    WIDGET_KEY,
    WIDGET_ACTION.OUTPUT,
    output.action.params,
    {},
  );
  assert.match(noForm.data.message.en, /output power in watts/, 'an older core without the form');
});

test('not configured, or no data: one sentence', async () => {
  const world = await createWorld({ config: { email: '', password: '' } });
  const ack = await world.gladys.fake.widgetGet(WIDGET_KEY, { language: 'fr' });
  assert.deepEqual(types(ack.data.content), ['text']);
  assert.match(ack.data.content.components[0].text, /compte Anker/);
});
