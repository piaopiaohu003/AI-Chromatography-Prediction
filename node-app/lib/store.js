'use strict';

/**
 * ChromAI account store abstraction.
 *
 * Two backends, both expose the same async `{ load, save }` API:
 *   - FileStore  : JSON file on local disk (existing behavior, default)
 *   - RedisStore : Redis blob key (enabled via REDIS_URL/REDIS_HOST)
 *
 * Backend selection is deterministic on module load:
 *   1. If REDIS_URL or REDIS_HOST is set and we can successfully PING the
 *      server → RedisStore. A single JSON blob key holds the whole store.
 *   2. Otherwise → FileStore, path controlled by CHROM_USER_DB (default:
 *      /tmp/chromai-users.json).
 *
 * No npm dependencies are required: an inline RESP2 client covers all
 * commands we need (PING / AUTH / SELECT / GET / SET).
 */

const fs = require('fs');
const path = require('path');

const KEY_PREFIX = (process.env.CHROM_REDIS_KEY_PREFIX || 'chromai').replace(/:+$/g, '');
const DB_KEY = `${KEY_PREFIX}:v1:db`;

/* ================================================================ */
/* File backend                                                      */
/* ================================================================ */

class FileStore {
  constructor(dbPath) {
    this.dbPath = dbPath;
  }
  async load() {
    try {
      const raw = fs.readFileSync(this.dbPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.users)) return { version: 1, users: [], sessions: {}, password_resets: {} };
      if (!parsed.sessions || typeof parsed.sessions !== 'object') parsed.sessions = {};
      if (!parsed.password_resets || typeof parsed.password_resets !== 'object') parsed.password_resets = {};
      return parsed;
    } catch {
      return { version: 1, users: [], sessions: {}, password_resets: {} };
    }
  }
  async save(store) {
    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.dbPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, this.dbPath);
  }
}

/* ================================================================ */
/* Tiny RESP2 client                                                 */
/* ================================================================ */

class Resp2Client {
  constructor(opts) {
    this.host = opts.host;
    this.port = Number(opts.port) || 6379;
    this.password = opts.password || undefined;
    this.db = Number(opts.db) || 0;
    this.tls = !!opts.tls;
    this.connectTimeoutMs = Number(opts.connectTimeoutMs) || 1500;
    this.commandTimeoutMs = Number(opts.commandTimeoutMs) || 3000;
    this.socket = null;
  }

  static parseUrl(url) {
    let u = String(url).trim();
    if (!/^rediss?:\/\//i.test(u)) u = `redis://${u}`;
    const parsed = new URL(u);
    const out = {
      host: parsed.hostname || '127.0.0.1',
      port: Number(parsed.port) || (parsed.protocol === 'rediss:' ? 6380 : 6379),
      password: parsed.password || undefined,
      db: 0,
      tls: parsed.protocol === 'rediss:',
    };
    const dbMatch = parsed.pathname && /\/(\d+)/.exec(parsed.pathname);
    if (dbMatch) out.db = Number(dbMatch[1]);
    return out;
  }

  async ensureConnected() {
    if (this.socket && !this.socket.destroyed) return;
    const lib = this.tls ? require('tls') : require('net');
    const socket = await new Promise((resolve, reject) => {
      const s = lib.connect({ host: this.host, port: this.port, timeout: this.connectTimeoutMs });
      s.once('connect', () => resolve(s));
      s.once('error', (e) => reject(e));
      s.once('timeout', () => { s.destroy(new Error('connect timeout')); });
    });
    socket.setTimeout(this.commandTimeoutMs);
    this.socket = socket;
    if (this.password) await this._raw(['AUTH', this.password]);
    if (this.db) await this._raw(['SELECT', String(this.db)]);
  }

  async command(...args) {
    await this.ensureConnected();
    return this._raw(args);
  }

  async close() {
    if (this.socket) { try { this.socket.destroy(); } catch {} ; this.socket = null; }
  }

  async _raw(args) {
    const req = '*' + args.length + '\r\n' + args.map((a) => '$' + Buffer.byteLength(String(a)) + '\r\n' + String(a) + '\r\n').join('');
    this.socket.write(req);
    return this._readReply();
  }

  async _readReply() {
    const line = await this._readLine();
    const type = line[0];
    const body = line.slice(1);
    if (type === '+') return body;
    if (type === '-') throw new Error(`Redis ERR ${body}`);
    if (type === ':') return Number(body);
    if (type === '$') {
      const len = Number(body);
      if (len === -1) return null;
      const buf = await this._readExactly(len + 2);
      return buf.slice(0, len).toString('utf8');
    }
    if (type === '*') {
      const count = Number(body);
      if (count === -1) return null;
      const items = [];
      for (let i = 0; i < count; i++) items.push(await this._readReply());
      return items;
    }
    throw new Error(`unknown RESP prefix: ${type}`);
  }

  async _readLine() {
    let buf = Buffer.alloc(0);
    while (true) {
      const chunk = await new Promise((resolve, reject) => {
        if (!this.socket || this.socket.destroyed) return reject(new Error('socket closed'));
        const onData = (c) => {
          this.socket.off('error', onError);
          resolve(c);
        };
        const onError = (e) => { this.socket.off('data', onData); reject(e); };
        this.socket.once('data', onData);
        this.socket.once('error', onError);
      });
      buf = Buffer.concat([buf, chunk]);
      const idx = buf.indexOf('\r\n');
      if (idx >= 0) return buf.slice(0, idx).toString('utf8');
    }
  }

  async _readExactly(n) {
    let buf = Buffer.alloc(0);
    while (buf.length < n) {
      const chunk = await new Promise((resolve, reject) => {
        if (!this.socket || this.socket.destroyed) return reject(new Error('socket closed'));
        const onData = (c) => {
          this.socket.off('error', onError);
          resolve(c);
        };
        const onError = (e) => { this.socket.off('data', onData); reject(e); };
        this.socket.once('data', onData);
        this.socket.once('error', onError);
      });
      buf = Buffer.concat([buf, chunk]);
    }
    return buf.slice(0, n);
  }
}

/* ================================================================ */
/* Redis backend                                                     */
/* ================================================================ */

class RedisStore {
  constructor(client, key) {
    this.client = client;
    this.key = key;
  }
  async load() {
    const raw = await this.client.command('GET', this.key);
    if (!raw) return { version: 1, users: [], sessions: {}, password_resets: {} };
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.users)) return { version: 1, users: [], sessions: {}, password_resets: {} };
      if (!parsed.sessions || typeof parsed.sessions !== 'object') parsed.sessions = {};
      if (!parsed.password_resets || typeof parsed.password_resets !== 'object') parsed.password_resets = {};
      return parsed;
    } catch {
      return { version: 1, users: [], sessions: {}, password_resets: {} };
    }
  }
  async save(store) {
    const raw = JSON.stringify(store);
    await this.client.command('SET', this.key, raw);
  }
}

/* ================================================================ */
/* Backend selection                                                 */
/* ================================================================ */

async function buildStore() {
  const dbPath = process.env.CHROM_USER_DB
    || path.join(process.env.TMPDIR || '/tmp', 'chromai-users.json');

  let opts;
  let label;
  if (process.env.REDIS_URL) {
    opts = Resp2Client.parseUrl(process.env.REDIS_URL);
    label = opts.password
      ? `${opts.host}:${opts.port}`
      : `${opts.host}:${opts.port}`;
  } else if (process.env.REDIS_HOST) {
    opts = {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB) || 0,
      tls: (process.env.REDIS_TLS === '1' || process.env.REDIS_TLS === 'true'),
    };
    label = `${opts.host}:${opts.port}`;
  }

  if (opts) {
    const client = new Resp2Client({ ...opts, connectTimeoutMs: 1500, commandTimeoutMs: 1500 });
    try {
      await client.ensureConnected();
      await client.command('PING');
      console.log(`[chromai.store] Redis store active at ${label} (key=${DB_KEY})`);
      return new RedisStore(client, DB_KEY);
    } catch (err) {
      console.warn(`[chromai.store] Redis unavailable (${err.message}), falling back to file store: ${dbPath}`);
      try { await client.close(); } catch {}
    }
  } else {
    console.log(`[chromai.store] File store active: ${dbPath}`);
  }
  return new FileStore(dbPath);
}

/* ================================================================ */
/* Lazy init — a single top-level async call in Node 20              */
/* ================================================================ */

const storePromise = buildStore();
let _store = null;

async function getStore() {
  if (!_store) _store = await storePromise;
  return _store;
}

async function loadStore() {
  const s = await getStore();
  return s.load();
}

async function saveStore(storeData) {
  const s = await getStore();
  await s.save(storeData);
}

module.exports = { loadStore, saveStore, getStore, storePromise, DB_KEY };
