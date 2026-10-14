// -----------------------------------------------------------------------------
// A simulated Anker power cloud, served through a fetch stub.
//
// It answers like the real cloud does (thomluther/anker-solix-api): `{ code,
// msg, data }`, code 0 for success, 401 for a refused token, 26108 for a wrong
// password. The systems are the fixtures of test/fixtures/anker/, real
// answers of the cloud published by the reference library, anonymized.
//
// The login is checked for real: the fake server has its own ECDH key pair,
// derives the shared secret from the client public key, and decrypts the
// password the client encrypted.
// -----------------------------------------------------------------------------

import { createDecipheriv, createECDH, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const FIXTURES = [
  'sb1-single',
  'sb1-dual-mi80',
  'sb2-pro-meter-manual',
  'sb2-pro-plugs',
  'sb2-sb1-cascaded',
  'sb2-ac-use-time',
  'sb3-smart-meter',
  'sb3-plugs',
  'sb3-multisystem',
];

export const loadFixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/anker/${name}.json`, import.meta.url), 'utf8'));

export const ACCOUNT = { email: 'owner@example.com', password: 'Sup3r-s3cret!' };
const USER_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const md5 = (text) => createHash('md5').update(text).digest('hex');

/**
 * @param {object} [options]
 * @param {string[]} [options.fixtures] fixture names, one system each
 * @param {number} [options.msType] 1 owner, 2 member (shared system)
 * @param {() => number} [options.now]
 */
export function createFakeAnker({ fixtures = ['sb2-pro-meter-manual'], msType = 1, now } = {}) {
  const server = createECDH('prime256v1');
  server.generateKeys();

  const systems = new Map();
  for (const name of fixtures) {
    const fixture = structuredClone(loadFixture(name));
    fixture.site.ms_type = msType;
    systems.set(fixture.site.site_id, {
      name,
      site: fixture.site,
      scene: fixture.scene,
      schedule: fixture.schedule ?? null,
      energyToday: fixture.energy_today ?? { solar_total: '1.25' },
    });
  }

  const fake = {
    /** Public key the client must use, in place of the Anker one. */
    serverPublicKey: server.getPublicKey('hex', 'uncompressed'),
    systems,
    /** Every request: `{ endpoint, body, headers }`. */
    calls: [],
    /** Passwords the login received, decrypted (to check the encryption). */
    passwords: [],
    token: null,
    tokenCount: 0,
    /**
     * `{ endpoint: { code, status? } | 'network' | () => failure }`: the answers
     * of an endpoint fail (a function decides per call).
     */
    failures: {},
    /** The account password the fake accepts. */
    password: ACCOUNT.password,

    /** The endpoints called, in order. */
    endpoints() {
      return fake.calls.map((call) => call.endpoint);
    },

    /** The first system. */
    get first() {
      return [...systems.values()][0];
    },

    /** Refuse the current token, as when it expired server-side. */
    revokeToken() {
      fake.token = null;
    },

    async fetch(url, init = {}) {
      const { pathname, origin } = new URL(String(url));
      const endpoint = pathname.slice(1);
      const body = init.body ? JSON.parse(init.body) : {};
      const headers = init.headers ?? {};
      fake.calls.push({ endpoint, body, headers, origin });

      let failure = fake.failures[endpoint] ?? fake.failures['*'];
      if (typeof failure === 'function') {
        failure = failure();
      }
      if (failure === 'network') {
        throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
      }
      if (failure) {
        return reply(failure.status ?? 200, { code: failure.code, msg: 'failure' });
      }

      if (endpoint === 'passport/login') {
        return login(body);
      }
      if (
        !fake.token ||
        headers['x-auth-token'] !== fake.token ||
        headers.gtoken !== md5(USER_ID)
      ) {
        return reply(401, { code: 401, msg: 'Unauthorized' });
      }
      const system = body.site_id ? systems.get(body.site_id) : undefined;
      switch (endpoint) {
        case 'power_service/v1/site/get_site_list':
          return ok({ site_list: [...systems.values()].map((s) => s.site) });
        case 'power_service/v1/site/get_scen_info':
          return system ? ok(system.scene) : reply(200, { code: 10004, msg: 'not found' });
        case 'power_service/v1/site/energy_analysis':
          return system ? ok(system.energyToday) : reply(200, { code: 10004, msg: 'not found' });
        case 'power_service/v1/site/get_site_device_param':
          if (msType !== 1) {
            return reply(200, { code: 160003, msg: 'no permission' });
          }
          return ok({ param_data: JSON.stringify(system?.schedule ?? {}) });
        case 'power_service/v1/site/set_site_device_param': {
          if (msType !== 1) {
            return reply(200, { code: 160003, msg: 'no permission' });
          }
          const data = JSON.parse(body.param_data);
          system.schedule = { ...system.schedule, ...data };
          system.scene.scene_mode = data.mode_type;
          return ok({});
        }
        default:
          return reply(404, { code: 404, msg: 'unknown endpoint' });
      }
    },
  };

  function login(body) {
    const secret = server.computeSecret(Buffer.from(body.client_secret_info.public_key, 'hex'));
    const decipher = createDecipheriv('aes-256-cbc', secret, secret.subarray(0, 16));
    const password = Buffer.concat([
      decipher.update(Buffer.from(body.password, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    fake.passwords.push(password);
    if (body.email !== ACCOUNT.email || password !== fake.password) {
      return reply(200, { code: 26108, msg: 'Incorrect email or password' });
    }
    fake.tokenCount += 1;
    fake.token = `token-${fake.tokenCount}`;
    const nowSeconds = Math.floor((now ? now() : Date.now()) / 1000);
    return ok({
      user_id: USER_ID,
      email: ACCOUNT.email,
      nick_name: 'Owner',
      auth_token: fake.token,
      token_expires_at: nowSeconds + 30 * 24 * 3600,
    });
  }

  return fake;
}

function ok(data) {
  return reply(200, { code: 0, msg: 'success!', data });
}

function reply(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => structuredClone(payload),
  };
}
