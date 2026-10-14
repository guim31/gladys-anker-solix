// -----------------------------------------------------------------------------
// Persistent state in /data, the only writable volume of the container.
//
// One small JSON file per key. Only the cloud session lives here (the login
// token, never the password): the container keeps it across restarts so it
// does not log in again at every start, which the Anker cloud rate-limits.
// The files are readable by the container user only.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rm, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export class Store {
  /** @param {string} dir */
  constructor(dir) {
    this.dir = dir;
  }

  /**
   * @param {string} key
   * @returns {Promise<any>} the stored value, undefined when absent or unreadable
   */
  async read(key) {
    try {
      return JSON.parse(await readFile(this.path(key), 'utf8'));
    } catch {
      return undefined;
    }
  }

  /**
   * Write atomically: a crash mid-write never leaves a truncated file.
   * @param {string} key
   * @param {any} value
   */
  async write(key, value) {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.path(key)}.tmp`;
    await writeFile(tmp, JSON.stringify(value), { mode: 0o600 });
    await rename(tmp, this.path(key));
  }

  /** @param {string} key */
  async remove(key) {
    await rm(this.path(key), { force: true });
  }

  /** @param {string} key */
  path(key) {
    return join(this.dir, `${key}.json`);
  }
}
