// -----------------------------------------------------------------------------
// Client of the Anker power cloud (the API of the Anker app).
//
// Endpoints, headers, login and error codes come from thomluther/anker-solix-api
// (MIT), the reference library behind the Home Assistant integration:
//   - POST passport/login: e-mail, country, password encrypted by ECDH (see
//     crypto.js); answers a token, the user id and the token expiry;
//   - every other request carries `x-auth-token` and `gtoken` (md5 of the
//     user id), the country and the time zone;
//   - the answer is `{ code, msg, data }`, code 0 meaning success.
//
// Quotas: the library spaces its requests and stays under ~10 requests per
// minute and per endpoint (the cloud answers 429 beyond, 10-12 per minute for
// the energy statistics). This client sends one request at a time, at least
// `minGapMs` apart; the callers keep each endpoint far below the limit.
//
// The session token is kept in /data (store.js) so a restart does not log in
// again. Nothing here ever logs the e-mail, the password or the token.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import { createKeyExchange, encryptWithSecret } from './crypto.js';

export const API_SERVERS = {
  eu: 'https://ankerpower-api-eu.anker.com',
  com: 'https://ankerpower-api.anker.com',
};

// Countries served by the "com" server; every other one by the EU server
// (apitypes.py API_COUNTRIES of the reference library).
const COM_COUNTRIES = new Set([
  'DZ',
  'LB',
  'SY',
  'EG',
  'LY',
  'TN',
  'MA',
  'JO',
  'PS',
  'AR',
  'AU',
  'BR',
  'HK',
  'IN',
  'MX',
  'NG',
  'NZ',
  'RU',
  'ZA',
  'KR',
  'TW',
  'US',
  'CA',
]);

export const ENDPOINTS = {
  login: 'passport/login',
  siteList: 'power_service/v1/site/get_site_list',
  sceneInfo: 'power_service/v1/site/get_scen_info',
  energyAnalysis: 'power_service/v1/site/energy_analysis',
  getDeviceParam: 'power_service/v1/site/get_site_device_param',
  setDeviceParam: 'power_service/v1/site/set_site_device_param',
};

/** Parameter type of the Solarbank 2 and 3 schedule (usage mode, output plans). */
export const SCHEDULE_PARAM_TYPE = '6';

const BASE_HEADERS = {
  'content-type': 'application/json',
  'model-type': 'DESKTOP',
  'app-name': 'anker_power',
  'os-type': 'android',
};

// Answer codes of the cloud (errors.py of the reference library).
const CREDENTIAL_CODES = new Set([26108, 26156, 26055]);
const AUTH_CODES = new Set([401, 403, 26084, 26070]);
const VERIFY_CODES = new Set([26050, 26051, 26052, 26053, 26054]);
const RATE_LIMIT_CODES = new Set([429, 100053]);
const BUSY_CODES = new Set([21105]);
const PERMISSION_CODES = new Set([160003]);

/**
 * An error of the cloud, with a kind the callers can act on:
 * `credentials` (wrong e-mail or password), `verification` (the account
 * asks for a code sent by e-mail: log in once in the Anker app), `auth`
 * (token refused), `rate_limit`, `busy`, `permission` (a member account
 * cannot change the settings), `network`, `server`, `api` (any other code).
 */
export class AnkerError extends Error {
  /**
   * @param {string} kind
   * @param {string} message never a secret
   * @param {number} [code] the cloud answer code or the HTTP status
   */
  constructor(kind, message, code) {
    super(message);
    this.name = 'AnkerError';
    this.kind = kind;
    this.code = code;
  }
}

/** @param {string} country two-letter code */
export function serverFor(country) {
  return COM_COUNTRIES.has(country) ? API_SERVERS.com : API_SERVERS.eu;
}

const md5 = (text) => createHash('md5').update(text).digest('hex');

/** Identifies the account a stored session belongs to, without storing the e-mail. */
export const accountKey = (config) =>
  createHash('sha256').update(`${config.email.toLowerCase()}|${config.country}`).digest('hex');

/** `GMT+02:00`, the time zone header of the app. */
export function timezoneHeader(date = new Date()) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `GMT${sign}${hh}:${mm}`;
}

const SESSION_KEY = 'anker-session';

/**
 * @param {object} options
 * @param {() => object} options.getConfig the current normalized config
 * @param {import('../store.js').Store} options.store
 * @param {typeof fetch} [options.fetch]
 * @param {() => number} [options.now]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {number} [options.minGapMs] minimum delay between two requests
 * @param {number} [options.timeoutMs]
 * @param {string} [options.serverPublicKey] tests only
 * @param {object} [options.logger]
 */
export function createAnkerClient({
  getConfig,
  store,
  fetch: fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  minGapMs = 500,
  timeoutMs = 15000,
  serverPublicKey,
  logger = createLogger({ name: 'anker-cloud' }),
}) {
  let session = null;
  let sessionLoaded = false;
  let queue = Promise.resolve();
  let lastRequestAt = -Infinity;

  /** One request at a time, spaced by minGapMs. */
  function enqueue(task) {
    const run = queue.then(async () => {
      const wait = lastRequestAt + minGapMs - now();
      if (wait > 0) {
        await sleep(wait);
      }
      try {
        return await task();
      } finally {
        lastRequestAt = now();
      }
    });
    queue = run.catch(() => {});
    return run;
  }

  function headers(config, withAuth) {
    const result = {
      ...BASE_HEADERS,
      country: config.country,
      timezone: timezoneHeader(new Date(now())),
    };
    if (withAuth && session) {
      result['x-auth-token'] = session.token;
      result.gtoken = md5(session.userId);
    }
    return result;
  }

  /** One HTTP exchange; returns `data` or throws an AnkerError. */
  async function exchange(endpoint, body, withAuth) {
    const config = getConfig();
    const url = `${serverFor(config.country)}/${endpoint}`;
    logger.debug(`POST ${endpoint}`);
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: headers(config, withAuth),
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message);
      throw new AnkerError('network', `Anker cloud unreachable (${reason})`);
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const code = payload && typeof payload.code === 'number' ? payload.code : undefined;
    if (!response.ok) {
      throw classify(code ?? response.status, response.status);
    }
    if (!payload || typeof payload !== 'object') {
      throw new AnkerError('server', 'Anker cloud answered an empty response', response.status);
    }
    if (code !== 0) {
      throw classify(code, response.status);
    }
    return payload.data ?? {};
  }

  /** Maps a cloud code or an HTTP status to an AnkerError. */
  function classify(code, status) {
    if (CREDENTIAL_CODES.has(code)) {
      return new AnkerError('credentials', 'Anker account: wrong e-mail or password', code);
    }
    if (VERIFY_CODES.has(code)) {
      return new AnkerError('verification', 'Anker account: a verification code is required', code);
    }
    if (AUTH_CODES.has(code)) {
      return new AnkerError('auth', `Anker cloud refused the session (code ${code})`, code);
    }
    if (RATE_LIMIT_CODES.has(code)) {
      return new AnkerError('rate_limit', 'Anker cloud: too many requests', code);
    }
    if (BUSY_CODES.has(code)) {
      return new AnkerError('busy', 'Anker cloud is busy', code);
    }
    if (PERMISSION_CODES.has(code)) {
      return new AnkerError('permission', 'Anker account: no permission for this system', code);
    }
    if (status >= 500) {
      return new AnkerError('server', `Anker cloud error (HTTP ${status})`, code);
    }
    return new AnkerError('api', `Anker cloud error (code ${code})`, code);
  }

  async function loadSession() {
    if (sessionLoaded) {
      return;
    }
    sessionLoaded = true;
    const stored = await store.read(SESSION_KEY);
    if (
      stored &&
      stored.account === accountKey(getConfig()) &&
      typeof stored.token === 'string' &&
      typeof stored.userId === 'string' &&
      !(stored.expiresAt && stored.expiresAt * 1000 - now() < 60_000)
    ) {
      session = stored;
    }
  }

  async function login() {
    const config = getConfig();
    const { publicKey, sharedSecret } = createKeyExchange(serverPublicKey);
    const date = new Date(now());
    const data = await enqueue(() =>
      exchange(
        ENDPOINTS.login,
        {
          ab: config.country,
          client_secret_info: { public_key: publicKey },
          enc: 0,
          email: config.email,
          password: encryptWithSecret(config.password, sharedSecret),
          time_zone: -date.getTimezoneOffset() * 60_000,
          transaction: String(now()),
        },
        false,
      ),
    );
    if (!data.auth_token || !data.user_id) {
      throw new AnkerError('server', 'Anker cloud login answered no token');
    }
    session = {
      account: accountKey(config),
      token: String(data.auth_token),
      userId: String(data.user_id),
      expiresAt: Number(data.token_expires_at) || 0,
    };
    await store.write(SESSION_KEY, session);
    logger.debug('Logged in to the Anker cloud');
    return session;
  }

  const api = {
    /**
     * Authenticated request; logs in first when needed, and once more when
     * the cloud refuses the stored token.
     * @param {string} endpoint
     * @param {object} [body]
     */
    async request(endpoint, body) {
      await loadSession();
      if (!session || (session.expiresAt && session.expiresAt * 1000 - now() < 60_000)) {
        await login();
      }
      try {
        return await enqueue(() => exchange(endpoint, body, true));
      } catch (err) {
        if (err.kind === 'auth') {
          session = null;
          await store.remove(SESSION_KEY);
          await login();
          return enqueue(() => exchange(endpoint, body, true));
        }
        if (err.kind === 'busy') {
          // The reference library retries a busy answer once, a few seconds later.
          await sleep(3000);
          return enqueue(() => exchange(endpoint, body, true));
        }
        throw err;
      }
    },

    /** Log in now (connection test, probe), even with a stored session. */
    async login() {
      sessionLoaded = true;
      return login();
    },

    /** Forget the session (new account in the configuration). */
    async reset() {
      session = null;
      sessionLoaded = false;
      await store.remove(SESSION_KEY);
    },

    /** The systems ("sites") the account owns or is a member of. */
    async getSiteList() {
      const data = await api.request(ENDPOINTS.siteList, {});
      return Array.isArray(data.site_list) ? data.site_list : [];
    },

    /** What the home screen of the app shows for one system. */
    async getSceneInfo(siteId) {
      return api.request(ENDPOINTS.sceneInfo, { site_id: siteId });
    },

    /**
     * Energy statistics of one day for one system.
     * @param {string} siteId
     * @param {string} day YYYY-MM-DD, in the time zone of the system
     * @param {string} [deviceType] solar_production | solarbank | home_usage | grid
     */
    async getEnergyDay(siteId, day, deviceType = 'solar_production') {
      return api.request(ENDPOINTS.energyAnalysis, {
        site_id: siteId,
        device_sn: '',
        type: 'day',
        start_time: day,
        end_time: day,
        device_type: deviceType,
      });
    },

    /** The Solarbank 2/3 schedule of a system, parsed. */
    async getSchedule(siteId) {
      const data = await api.request(ENDPOINTS.getDeviceParam, {
        site_id: siteId,
        param_type: SCHEDULE_PARAM_TYPE,
      });
      const raw = data.param_data;
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw);
        } catch {
          throw new AnkerError('server', 'Anker cloud answered an unreadable schedule');
        }
      }
      return raw && typeof raw === 'object' ? raw : {};
    },

    /**
     * Write (part of) the Solarbank 2/3 schedule of a system.
     * @param {string} siteId
     * @param {object} paramData
     */
    async setSchedule(siteId, paramData) {
      await api.request(ENDPOINTS.setDeviceParam, {
        site_id: siteId,
        param_type: SCHEDULE_PARAM_TYPE,
        cmd: 17,
        param_data: JSON.stringify(paramData),
      });
    },
  };
  return api;
}
