// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the message tables of the
// code, the feature names and the four documentation files. German says
// "du", never the polite "Sie".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import { MESSAGES, MODE_LABELS, NAMES, WIDGET_TEXT, all, featureName } from '../src/i18n.js';
import { USAGE_MODES } from '../src/anker/model.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const docs = Object.fromEntries(
  await Promise.all(
    ['en', 'fr', 'de', 'es'].map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  message: 200,
  tile: 24,
  featureName: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

test('the configuration offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 60, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the name is the same in every language, 3 to 30 characters', () => {
  assert.equal(typeof manifest.name, 'string');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
});

test('every message of the code has the four languages', () => {
  const found = Object.entries(MESSAGES).flatMap(([key, value]) =>
    problems(value, `MESSAGES.${key}`, MAX.message),
  );
  assert.deepEqual(found, []);
});

test('the widget texts: tiles and buttons short, sentences bounded', () => {
  const sentences = new Set(['notConfigured', 'noData']);
  const found = Object.entries(WIDGET_TEXT).flatMap(([key, value]) =>
    problems(value, `WIDGET_TEXT.${key}`, sentences.has(key) ? MAX.message : MAX.tile),
  );
  assert.deepEqual(found, []);
});

test('every usage mode has a label in the four languages', () => {
  assert.deepEqual(Object.keys(MODE_LABELS), Object.keys(USAGE_MODES));
  const found = Object.entries(MODE_LABELS).flatMap(([key, value]) =>
    problems(value, `MODE_LABELS.${key}`, MAX.tile),
  );
  assert.deepEqual(found, []);
});

test('the feature names exist in every language, with the same keys', () => {
  assert.deepEqual(Object.keys(NAMES).sort(), sorted(LANGS));
  const found = [];
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(NAMES[lang]).sort(), Object.keys(NAMES.en).sort(), lang);
    for (const key of Object.keys(NAMES.en)) {
      found.push(
        ...textProblems(
          featureName(key, lang, { n: 4 }),
          `NAMES.${lang}.${key}`,
          lang,
          MAX.featureName,
        ),
      );
    }
  }
  assert.deepEqual(found, []);
});

test('placeholders are filled in every language', () => {
  const text = all(MESSAGES.modeSet, { mode: MODE_LABELS.smartmeter });
  assert.deepEqual(text, {
    en: 'Usage mode: Smart meter.',
    fr: 'Mode d’utilisation : Compteur intelligent.',
    de: 'Betriebsmodus: Smart Meter.',
    es: 'Modo de uso: Medidor inteligente.',
  });
  for (const value of Object.values(all(MESSAGES.unreachable, { reason: 'timeout' }))) {
    assert.ok(!value.includes('{'), value);
  }
});

test('the four documentation files have the same sections', () => {
  const sections = (text) => text.split('\n').filter((line) => line.startsWith('## '));
  const counts = Object.fromEntries(LANGS.map((lang) => [lang, sections(docs[lang]).length]));
  assert.ok(counts.en >= 9, `en has ${counts.en} sections`);
  for (const lang of LANGS) {
    assert.equal(counts[lang], counts.en, `docs/${lang}.md sections`);
    // Same tables, same scene examples: the files stay in sync.
    const rows = (text) => text.split('\n').filter((line) => line.startsWith('|')).length;
    assert.equal(rows(docs[lang]), rows(docs.en), `docs/${lang}.md table rows`);
  }
});

test('every documentation says it was developed without the hardware', () => {
  assert.match(docs.en, /Developed without the hardware/);
  assert.match(docs.fr, /Développée sans le matériel/);
  assert.match(docs.de, /Ohne die Hardware entwickelt/);
  assert.match(docs.es, /Desarrollada sin el hardware/);
  for (const lang of LANGS) {
    assert.match(docs[lang], /Anker[\s>]+Innovations/, `${lang}: not affiliated`);
  }
});

test('the German documentation says "du"', () => {
  const polite = docs.de.split('\n').filter((line) => POLITE_GERMAN.test(line));
  assert.deepEqual(polite, []);
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: '', es: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Gerät', 'Ihre IP', 'mit Ihrem']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  const forgotten = structuredClone(manifest);
  delete forgotten.scene_actions[0].fields[1].label.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.scene_actions[0].fields[1].label has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});
