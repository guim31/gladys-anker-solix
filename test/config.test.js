import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, isConfigured, normalizeConfig } from '../src/config.js';

test('defaults', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.equal(isConfigured(normalizeConfig()), false);
});

test('types and values from the form', () => {
  const config = normalizeConfig({
    email: '  me@example.com ',
    password: ' spaces kept ',
    country: ' de ',
    language: 'es',
    refresh_interval: '300',
    allow_settings: 'true',
  });
  assert.deepEqual(config, {
    email: 'me@example.com',
    password: ' spaces kept ',
    country: 'DE',
    language: 'es',
    refresh_interval: 300,
    allow_settings: true,
  });
  assert.equal(isConfigured(config), true);
});

test('the cloud is never read faster than once a minute', () => {
  assert.equal(normalizeConfig({ refresh_interval: '10' }).refresh_interval, 60);
  assert.equal(normalizeConfig({ refresh_interval: 'abc' }).refresh_interval, 60);
});

test('country codes: ISO spellings of the United Kingdom and Greece, junk replaced', () => {
  assert.equal(normalizeConfig({ country: 'gb' }).country, 'UK');
  assert.equal(normalizeConfig({ country: 'GR' }).country, 'EL');
  assert.equal(normalizeConfig({ country: 'France' }).country, 'FR');
});

test('an unknown language falls back to French', () => {
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});
