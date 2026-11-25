'use strict';

/* Minimal account system for the ChromAI demo deployment.
 * Accounts and sessions are persisted to a JSON file in the runtime temp
 * directory because the deployment bundle itself is read-only.  Passwords are
 * stored as scrypt hashes with a per-user random salt. */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const COOKIE_NAME = 'chromai_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const DB_PATH = process.env.CHROM_USER_DB
  || path.join(process.env.TMPDIR || '/tmp', 'chromai-users.json');

class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

function emptyStore() {
  return { version: 1, users: [], sessions: {} };
}

function loadStore() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.users)) return emptyStore();
    if (!parsed.sessions || typeof parsed.sessions !== 'object') parsed.sessions = {};
    return parsed;
  } catch (err) {
    return emptyStore();
  }
}

function saveStore(store) {
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, DB_PATH);
}

function publicUser(user) {
  return { id: user.id, username: user.username, created_at: user.created_at };
}

function normalizeUsername(value) {
  const username = String(value === undefined || value === null ? '' : value).trim();
  if (!/^[\w\u4e00-\u9fa5.-]{3,24}$/u.test(username)) {
    throw new AuthError('用户名需为 3–24 位字母、数字、中文、下划线、点或短横线');
  }
  return username;
}

function normalizePassword(value) {
  const password = String(value === undefined || value === null ? '' : value);
  if (password.length < 8 || password.length > 64) {
    throw new AuthError('密码长度需为 8–64 位');
  }
  return password;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function issueSession(store, userId) {
  pruneSessions(store);
  const token = crypto.randomBytes(32).toString('hex');
  store.sessions[token] = {
    user_id: userId,
    expires_at: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  return token;
}

function pruneSessions(store) {
  const now = Date.now();
  Object.keys(store.sessions).forEach((token) => {
    const session = store.sessions[token];
    if (!session || !session.expires_at || session.expires_at <= now) {
      delete store.sessions[token];
    }
  });
}

function register(usernameInput, passwordInput) {
  const username = normalizeUsername(usernameInput);
  const password = normalizePassword(passwordInput);
  const store = loadStore();
  pruneSessions(store);
  const exists = store.users.some(
    (user) => user.username.toLowerCase() === username.toLowerCase(),
  );
  if (exists) {
    throw new AuthError('该用户名已被注册', 409);
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id: crypto.randomUUID(),
    username,
    salt,
    password_hash: hashPassword(password, salt),
    created_at: new Date().toISOString(),
  };
  store.users.push(user);
  const token = issueSession(store, user.id);
  saveStore(store);
  return { user: publicUser(user), token };
}

function login(usernameInput, passwordInput) {
  const username = String(usernameInput === undefined || usernameInput === null ? '' : usernameInput).trim();
  const password = String(passwordInput === undefined || passwordInput === null ? '' : passwordInput);
  if (!username || !password) {
    throw new AuthError('请输入用户名和密码');
  }
  const store = loadStore();
  const user = store.users.find(
    (item) => item.username.toLowerCase() === username.toLowerCase(),
  );
  const salt = user ? user.salt : '00000000000000000000000000000000';
  const expected = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64);
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!user || !matches) {
    throw new AuthError('用户名或密码错误', 401);
  }
  pruneSessions(store);
  const token = issueSession(store, user.id);
  saveStore(store);
  return { user: publicUser(user), token };
}

function currentUser(token) {
  if (!token) return null;
  const store = loadStore();
  const session = store.sessions[token];
  if (!session) return null;
  if (!session.expires_at || session.expires_at <= Date.now()) {
    delete store.sessions[token];
    saveStore(store);
    return null;
  }
  const user = store.users.find((item) => item.id === session.user_id);
  return user ? publicUser(user) : null;
}

function logout(token) {
  if (!token) return;
  const store = loadStore();
  if (store.sessions[token]) {
    delete store.sessions[token];
    saveStore(store);
  }
}

module.exports = {
  AuthError,
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  DB_PATH,
  register,
  login,
  logout,
  currentUser,
};
