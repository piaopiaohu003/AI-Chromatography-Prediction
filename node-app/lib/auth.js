'use strict';

/* Minimal account system for the ChromAI demo deployment.
 * Accounts and sessions are persisted via lib/store.js which picks Redis
 * (REDIS_URL/REDIS_HOST) or a local JSON file on startup. Passwords are
 * stored as scrypt hashes with a per-user random salt. All public functions
 * are async because the underlying store may talk to Redis. */

const crypto = require('crypto');
const store = require('./store');
const mailer = require('./mailer');

const COOKIE_NAME = 'chromai_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const DEFAULT_PREFERENCES = {
  default_phase: 'reversed',
  default_organic: 'ACN',
  default_detector: 'UV',
  default_temperature_c: 30,
};
const PHASE_ORGANICS = {
  reversed: ['ACN', 'MeOH', 'THF', 'EtOH'],
  normal: ['IPA', 'EtOAc', 'THF', 'EtOH'],
};
const MAX_FAVORITES = 30;
const MAX_LITERATURE_TOPICS = 12;

class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

async function bootstrapDemo() {
  // Pre-seed the demo account on cold start so that redeployments, which wipe
  // the ephemeral runtime /tmp directory, still allow the documented demo /
  // ChromAI2026 credentials to work without manual re-registration.
  // No-op if the demo user already exists or the seed vars are misconfigured.
  const DEMO_USER = process.env.CHROM_DEMO_USER || 'demo';
  const DEMO_PASS = process.env.CHROM_DEMO_PASS || 'ChromAI2026';
  if (!DEMO_USER || !DEMO_PASS) return;
  try {
    normalizeUsername(DEMO_USER);
    normalizePassword(DEMO_PASS);
  } catch {
    return;
  }
  const s = await store.loadStore();
  if (s.users.some((u) => u.username.toLowerCase() === DEMO_USER.toLowerCase())) return;
  const salt = crypto.randomBytes(16).toString('hex');
  const demoId = crypto.randomUUID();
  s.users.push({
    id: demoId,
    username: DEMO_USER,
    email: `${DEMO_USER.toLowerCase()}@chromai.local`,
    email_verified: false,
    salt,
    password_hash: hashPassword(DEMO_PASS, salt),
    created_at: new Date().toISOString(),
    preferences: { ...DEFAULT_PREFERENCES },
    favorites: [
      {
        id: crypto.randomUUID(),
        name: '梯度筛查 · C18 150mm',
        phase: 'reversed',
        conditions: {
          phase: 'reversed', mode: 'gradient', organic: 'ACN', aqueous: 'water',
          gradient: [
            { time_min: 0, percent_b: 5, percent_c: 0, percent_d: 0 },
            { time_min: 20, percent_b: 95, percent_c: 0, percent_d: 0 },
            { time_min: 25, percent_b: 95, percent_c: 0, percent_d: 0 },
          ],
          flow_ml_min: 1, temperature_c: 30, ph: 2.5, wavelength_nm: 254,
          column: { length_mm: 150, inner_diameter_mm: 4.6, particle_um: 5, porosity: 0.65, chemistry: 'c18' },
          dwell_volume_ml: 1, injection_volume_ul: 10, total_time_min: 30, noise_mau: 0.15,
        },
        created_at: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        name: '等度 50% · 快速分离',
        phase: 'reversed',
        conditions: {
          phase: 'reversed', mode: 'isocratic', organic: 'ACN', aqueous: 'water',
          percent_b: 50,
          flow_ml_min: 1, temperature_c: 30, ph: 2.5, wavelength_nm: 254,
          column: { length_mm: 100, inner_diameter_mm: 4.6, particle_um: 3.5, porosity: 0.65, chemistry: 'c18' },
          dwell_volume_ml: 0.8, injection_volume_ul: 10, total_time_min: 10, noise_mau: 0.15,
        },
        created_at: new Date().toISOString(),
      },
    ],
    literature_watch: [],
  });
  await store.saveStore(s);
  console.log(`[chromai.auth] Bootstrapped demo user "${DEMO_USER}"`);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    created_at: user.created_at,
    email: user.email || null,
  };
}

function ensureAccount(user) {
  if (!user.preferences || typeof user.preferences !== 'object') {
    user.preferences = { ...DEFAULT_PREFERENCES };
  } else {
    user.preferences = { ...DEFAULT_PREFERENCES, ...user.preferences };
  }
  if (!Array.isArray(user.favorites)) user.favorites = [];
  if (!Array.isArray(user.literature_watch)) user.literature_watch = [];
  return user;
}

function findUser(s, userId) {
  const user = s.users.find((item) => item.id === userId);
  if (!user) throw new AuthError('用户不存在', 404);
  return ensureAccount(user);
}

function normalizePreferences(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new AuthError('偏好设置格式不正确');
  }
  const phase = ['reversed', 'normal'].includes(patch.default_phase)
    ? patch.default_phase
    : DEFAULT_PREFERENCES.default_phase;
  const options = PHASE_ORGANICS[phase];
  const organic = options.includes(patch.default_organic)
    ? patch.default_organic
    : options[0];
  const detector = ['UV', 'FLD', 'RID', 'ELSD', 'CAD', 'MS'].includes(patch.default_detector)
    ? patch.default_detector
    : DEFAULT_PREFERENCES.default_detector;
  let temperature = Number(patch.default_temperature_c);
  if (!Number.isFinite(temperature)) temperature = DEFAULT_PREFERENCES.default_temperature_c;
  temperature = Math.max(15, Math.min(60, Math.round(temperature)));
  return {
    default_phase: phase,
    default_organic: organic,
    default_detector: detector,
    default_temperature_c: temperature,
  };
}

function verifyPassword(user, passwordInput) {
  const password = String(passwordInput === undefined || passwordInput === null ? '' : passwordInput);
  const expected = Buffer.from(user.password_hash, 'hex');
  const actual = Buffer.from(hashPassword(password, user.salt), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
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

function normalizeEmail(value) {
  const email = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError('邮箱格式不正确');
  }
  return email;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function issueSession(s, userId) {
  pruneSessions(s);
  const token = crypto.randomBytes(32).toString('hex');
  s.sessions[token] = {
    user_id: userId,
    expires_at: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  return token;
}

function pruneSessions(s) {
  const now = Date.now();
  Object.keys(s.sessions).forEach((token) => {
    const session = s.sessions[token];
    if (!session || !session.expires_at || session.expires_at <= now) {
      delete s.sessions[token];
    }
  });
}

async function register(usernameInput, emailInput, passwordInput) {
  const username = normalizeUsername(usernameInput);
  const email = normalizeEmail(emailInput);
  const password = normalizePassword(passwordInput);
  const s = await store.loadStore();
  pruneSessions(s);
  prunePasswordResets(s);
  const exists = s.users.some(
    (user) => user.username.toLowerCase() === username.toLowerCase(),
  );
  if (exists) {
    throw new AuthError('该用户名已被注册', 409);
  }
  const emailTaken = s.users.some(
    (user) => String(user.email || '').toLowerCase() === email,
  );
  if (emailTaken) {
    throw new AuthError('该邮箱已被注册，可直接找回密码', 409);
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id: crypto.randomUUID(),
    username,
    email,
    email_verified: false,
    salt,
    password_hash: hashPassword(password, salt),
    created_at: new Date().toISOString(),
    preferences: { ...DEFAULT_PREFERENCES },
    favorites: [],
  };
  s.users.push(user);
  const token = issueSession(s, user.id);
  await store.saveStore(s);
  return { user: publicUser(user), token };
}

async function login(usernameInput, passwordInput) {
  const username = String(usernameInput === undefined || usernameInput === null ? '' : usernameInput).trim();
  const password = String(passwordInput === undefined || passwordInput === null ? '' : passwordInput);
  if (!username || !password) {
    throw new AuthError('请输入用户名和密码');
  }
  const s = await store.loadStore();
  const user = s.users.find(
    (item) => item.username.toLowerCase() === username.toLowerCase(),
  );
  const salt = user ? user.salt : '00000000000000000000000000000000';
  const expected = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64);
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!user || !matches) {
    throw new AuthError('用户名或密码错误', 401);
  }
  pruneSessions(s);
  const token = issueSession(s, user.id);
  await store.saveStore(s);
  return { user: publicUser(user), token };
}

async function currentUser(token) {
  if (!token) return null;
  const s = await store.loadStore();
  const session = s.sessions[token];
  if (!session) return null;
  if (!session.expires_at || session.expires_at <= Date.now()) {
    delete s.sessions[token];
    await store.saveStore(s);
    return null;
  }
  const user = s.users.find((item) => item.id === session.user_id);
  return user ? publicUser(user) : null;
}

async function logout(token) {
  if (!token) return;
  const s = await store.loadStore();
  if (s.sessions[token]) {
    delete s.sessions[token];
    await store.saveStore(s);
  }
}

function prunePasswordResets(s) {
  const now = Date.now();
  Object.keys(s.password_resets).forEach((token) => {
    const entry = s.password_resets[token];
    if (!entry || !entry.expires_at || entry.expires_at <= now) {
      delete s.password_resets[token];
    }
  });
}

async function requestPasswordReset(emailInput) {
  const email = normalizeEmail(emailInput);
  const s = await store.loadStore();
  prunePasswordResets(s);
  const user = s.users.find((item) => String(item.email || '').toLowerCase() === email);
  // Always answer { ok: true } so the endpoint cannot be used to enumerate
  // which emails are registered.
  if (!user) {
    await store.saveStore(s);
    return { ok: true };
  }
  Object.keys(s.password_resets).forEach((token) => {
    if (s.password_resets[token] && s.password_resets[token].user_id === user.id) {
      delete s.password_resets[token];
    }
  });
  const token = crypto.randomBytes(24).toString('hex');
  s.password_resets[token] = {
    user_id: user.id,
    expires_at: Date.now() + PASSWORD_RESET_TTL_MS,
  };
  await store.saveStore(s);

  let mailed = { sent: false, reason: 'smtp-not-configured' };
  try {
    mailed = await mailer.sendMail({
      to: email,
      subject: 'ChromAI 密码重置',
      text: [
        `你好 ${user.username}，`,
        '',
        '我们收到了你的密码重置请求。请在 30 分钟内使用以下重置令牌完成密码重置：',
        '',
        `    ${token}`,
        '',
        '如果这不是你的操作，请忽略本邮件，你的密码不会改变。',
        '',
        '— ChromAI',
      ].join('\n'),
    });
  } catch (err) {
    mailed = { sent: false, reason: err && err.message ? err.message : String(err) };
    console.warn(`[chromai.auth] password reset mail failed: ${mailed.reason}`);
  }
  const result = { ok: true, mail_sent: Boolean(mailed.sent) };
  if (!mailed.sent) {
    // No SMTP configured (or sending failed) — surface the token so the
    // deployment stays usable. Operators should set CHROM_SMTP_URL to
    // deliver resets by email instead.
    result.debug_token = token;
    console.log(`[chromai.auth] password reset token for ${email}: ${token}`);
  }
  return result;
}

async function resetPassword(tokenInput, newPasswordInput) {
  const token = String(tokenInput === undefined || tokenInput === null ? '' : tokenInput).trim();
  if (!token) {
    throw new AuthError('缺少重置令牌');
  }
  const s = await store.loadStore();
  prunePasswordResets(s);
  const entry = s.password_resets[token];
  if (!entry) {
    throw new AuthError('重置令牌无效或已过期', 400);
  }
  const user = findUser(s, entry.user_id);
  const password = normalizePassword(newPasswordInput);
  const salt = crypto.randomBytes(16).toString('hex');
  user.salt = salt;
  user.password_hash = hashPassword(password, salt);
  // Invalidate every session and every reset token of this account.
  Object.keys(s.sessions).forEach((t) => {
    if (s.sessions[t] && s.sessions[t].user_id === user.id) delete s.sessions[t];
  });
  Object.keys(s.password_resets).forEach((t) => {
    if (s.password_resets[t] && s.password_resets[t].user_id === user.id) delete s.password_resets[t];
  });
  await store.saveStore(s);
  return { ok: true };
}

async function getAccount(userId) {
  const s = await store.loadStore();
  const user = findUser(s, userId);
  return {
    user: publicUser(user),
    preferences: { ...user.preferences },
    favorites: user.favorites.map((item) => ({ ...item })),
    literature_topics: user.literature_watch.map((item) => literatureTopicMeta(item)),
  };
}

async function updatePreferences(userId, patch) {
  const preferences = normalizePreferences(patch);
  const s = await store.loadStore();
  const user = findUser(s, userId);
  user.preferences = preferences;
  await store.saveStore(s);
  return { ...preferences };
}

async function changePassword(userId, currentToken, currentPassword, newPassword) {
  const s = await store.loadStore();
  const user = findUser(s, userId);
  if (!verifyPassword(user, currentPassword)) {
    throw new AuthError('当前密码不正确', 400);
  }
  const password = normalizePassword(newPassword);
  if (password === String(currentPassword || '')) {
    throw new AuthError('新密码不能与当前密码相同');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  user.salt = salt;
  user.password_hash = hashPassword(password, salt);
  Object.keys(s.sessions).forEach((token) => {
    const session = s.sessions[token];
    if (session && session.user_id === userId && token !== currentToken) {
      delete s.sessions[token];
    }
  });
  await store.saveStore(s);
  return { ok: true };
}

async function addFavorite(userId, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AuthError('收藏内容格式不正确');
  }
  const name = String(payload.name === undefined || payload.name === null ? '' : payload.name).trim();
  if (!name || name.length > 40) {
    throw new AuthError('收藏名称需为 1–40 个字符');
  }
  if (payload.conditions && typeof payload.conditions === 'object') {
    const size = Buffer.byteLength(JSON.stringify(payload.conditions), 'utf8');
    if (size > 60000) {
      throw new AuthError('收藏的色谱条件过大');
    }
  } else {
    throw new AuthError('缺少色谱条件');
  }
  const s = await store.loadStore();
  const user = findUser(s, userId);
  if (user.favorites.length >= MAX_FAVORITES) {
    throw new AuthError(`最多保存 ${MAX_FAVORITES} 个收藏`);
  }
  const favorite = {
    id: crypto.randomUUID(),
    name,
    phase: payload.phase === 'normal' ? 'normal' : 'reversed',
    conditions: payload.conditions,
    created_at: new Date().toISOString(),
  };
  user.favorites.unshift(favorite);
  await store.saveStore(s);
  return { favorite: { ...favorite } };
}

async function deleteFavorite(userId, favoriteId) {
  const s = await store.loadStore();
  const user = findUser(s, userId);
  const index = user.favorites.findIndex((item) => item.id === favoriteId);
  if (index === -1) {
    throw new AuthError('收藏不存在', 404);
  }
  const [removed] = user.favorites.splice(index, 1);
  await store.saveStore(s);
  return { ok: true, id: removed.id };
}

function literatureTopicMeta(topic) {
  return {
    id: topic.id,
    name: topic.name,
    query: topic.query,
    created_at: topic.created_at,
    last_scan_at: topic.last_scan_at || null,
    new_count: Array.isArray(topic.new_ids) ? topic.new_ids.length : 0,
    items_count: Array.isArray(topic.items) ? topic.items.length : 0,
    last_error: topic.last_error || null,
  };
}

function normalizeLiteratureTopic(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AuthError('监控主题格式不正确');
  }
  const name = String(payload.name === undefined || payload.name === null ? '' : payload.name).trim();
  const query = String(payload.query === undefined || payload.query === null ? '' : payload.query).trim();
  if (!name || name.length > 40) {
    throw new AuthError('主题名称需为 1–40 个字符');
  }
  if (query.length < 2 || query.length > 160) {
    throw new AuthError('检索式需为 2–160 个字符');
  }
  return { name, query };
}

async function listLiteratureTopics(userId) {
  const s = await store.loadStore();
  const user = findUser(s, userId);
  return { topics: user.literature_watch.map((item) => literatureTopicMeta(item)) };
}

async function addLiteratureTopic(userId, payload) {
  const { name, query } = normalizeLiteratureTopic(payload);
  const s = await store.loadStore();
  const user = findUser(s, userId);
  if (user.literature_watch.length >= MAX_LITERATURE_TOPICS) {
    throw new AuthError(`最多创建 ${MAX_LITERATURE_TOPICS} 个文献监控主题`);
  }
  if (user.literature_watch.some((item) => item.query.toLowerCase() === query.toLowerCase())) {
    throw new AuthError('已存在相同检索式的监控主题', 409);
  }
  const topic = {
    id: `lit_${crypto.randomBytes(6).toString('hex')}`,
    name,
    query,
    created_at: new Date().toISOString(),
    last_scan_at: null,
    seen_ids: [],
    items: [],
    new_ids: [],
    last_error: null,
  };
  user.literature_watch.unshift(topic);
  await store.saveStore(s);
  return { topic: literatureTopicMeta(topic) };
}

async function deleteLiteratureTopic(userId, topicId) {
  const s = await store.loadStore();
  const user = findUser(s, userId);
  const index = user.literature_watch.findIndex((item) => item.id === topicId);
  if (index === -1) {
    throw new AuthError('监控主题不存在', 404);
  }
  const [removed] = user.literature_watch.splice(index, 1);
  await store.saveStore(s);
  return { ok: true, id: removed.id };
}

async function getLiteratureTopic(userId, topicId) {
  const s = await store.loadStore();
  const user = findUser(s, userId);
  const topic = user.literature_watch.find((item) => item.id === topicId);
  if (!topic) {
    throw new AuthError('监控主题不存在', 404);
  }
  return {
    topic: literatureTopicMeta(topic),
    items: Array.isArray(topic.items) ? topic.items.map((item) => ({ ...item })) : [],
    seen_ids: Array.isArray(topic.seen_ids) ? topic.seen_ids.slice() : [],
  };
}

async function saveLiteratureScan(userId, topicId, scan, errorMessage) {
  const s = await store.loadStore();
  const user = findUser(s, userId);
  const topic = user.literature_watch.find((item) => item.id === topicId);
  if (!topic) {
    throw new AuthError('监控主题不存在', 404);
  }
  if (scan) {
    topic.last_scan_at = scan.scanned_at;
    topic.seen_ids = scan.seen_ids;
    topic.items = scan.items;
    topic.new_ids = scan.new_ids;
    topic.last_error = null;
  } else {
    topic.last_scan_at = new Date().toISOString();
    topic.last_error = String(errorMessage || '扫描失败').slice(0, 200);
    topic.new_ids = [];
  }
  await store.saveStore(s);
  return {
    topic: literatureTopicMeta(topic),
    items: scan ? scan.items : (topic.items || []),
    new_count: scan ? scan.new_count : 0,
  };
}

module.exports = {
  AuthError,
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  DEFAULT_PREFERENCES,
  bootstrapDemo,
  register,
  login,
  logout,
  currentUser,
  getAccount,
  updatePreferences,
  changePassword,
  addFavorite,
  deleteFavorite,
  requestPasswordReset,
  resetPassword,
  listLiteratureTopics,
  addLiteratureTopic,
  deleteLiteratureTopic,
  getLiteratureTopic,
  saveLiteratureScan,
};
