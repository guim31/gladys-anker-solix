// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user from the `config_schema` of the manifest; the SDK
// fetches it (`gladys.getConfig()`) and notifies every change
// (`onConfigUpdated`). This module only provides the defaults and normalizes
// the received object, so the rest of the code never deals with `undefined`
// or with a number typed as a string.
// -----------------------------------------------------------------------------

/** Languages of the feature names and of the texts the container produces. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/**
 * Refresh intervals offered to the user, in seconds. The Anker cloud refreshes
 * the values of a system once a minute at best (every 5 minutes for many
 * Solarbank 2 systems): reading it faster brings nothing and uses the quota of
 * the account.
 */
export const REFRESH_INTERVALS = [60, 120, 300];

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  email: '',
  password: '',
  country: 'FR',
  language: 'fr',
  refresh_interval: 60,
  allow_settings: false,
};

/**
 * Merge the user config with the defaults, and fix the types.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const interval = Number(raw.refresh_interval ?? DEFAULT_CONFIG.refresh_interval);
  return {
    email: String(raw.email ?? '').trim(),
    password: String(raw.password ?? ''),
    country: normalizeCountry(raw.country),
    language: LANGUAGES.includes(raw.language) ? raw.language : DEFAULT_CONFIG.language,
    // A select arrives as a string: only the offered values are kept, the
    // cloud must never be read faster than once a minute.
    refresh_interval: REFRESH_INTERVALS.includes(interval)
      ? interval
      : DEFAULT_CONFIG.refresh_interval,
    allow_settings: raw.allow_settings === true || raw.allow_settings === 'true',
  };
}

/**
 * Two-letter country code of the Anker account, upper case. The cloud
 * spells the United Kingdom "UK" and Greece "EL", where ISO 3166 says GB and
 * GR: both spellings are accepted.
 * @param {unknown} raw
 */
function normalizeCountry(raw) {
  const code = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (code === 'GB') {
    return 'UK';
  }
  if (code === 'GR') {
    return 'EL';
  }
  return /^[A-Z]{2}$/.test(code) ? code : DEFAULT_CONFIG.country;
}

/**
 * The integration can only log in once the e-mail and the password are set.
 * @param {ReturnType<typeof normalizeConfig>} config
 */
export function isConfigured(config) {
  return Boolean(config.email && config.password);
}
