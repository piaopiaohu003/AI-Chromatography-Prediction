'use strict';

/* ChromAI backend: HTTP service exposing the same /api contract and static
 * assets as the original FastAPI application.  No external dependencies. */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { COMPOUNDS, CATEGORIES } = require('./lib/compounds');
const { simulate } = require('./lib/simulation');
const { recommend } = require('./lib/recommend');
const { identify } = require('./lib/identify');
const aiClient = require('./lib/ai-client');
const models = require('./lib/models');
const pubchem = require('./lib/pubchem');
const literature = require('./lib/literature');
const auth = require('./lib/auth');
const store = require('./lib/store');

const PUBLIC_DIR = path.join(__dirname, 'public');
const STATIC_DIR = path.join(PUBLIC_DIR, 'static');
const MAX_BODY_BYTES = 20 * 1024 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function sendError(res, status, detail) {
  sendJson(res, status, { detail });
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch (_) {
        return null;
      }
    }
  }
  return null;
}

function sessionCookie(req, token, maxAgeSeconds) {
  const secure = req.headers['x-forwarded-proto'] === 'https'
    || Boolean(req.socket && req.socket.encrypted);
  const parts = [
    `${auth.COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function searchLocalCompounds(query, limit = 12) {
  if (!query) return COMPOUNDS.slice(0, limit);
  const needle = query.toLowerCase();
  return COMPOUNDS.filter((item) =>
    `${item.name} ${item.name_en || ''} ${item.id} ${item.category || ''}`
      .toLowerCase()
      .includes(needle)
  ).slice(0, limit);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new models.ValidationError('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const text = await readBody(req);
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new models.ValidationError('请求体不是合法 JSON');
  }
}

function serveFile(res, filePath) {
  return new Promise((resolve) => {
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        resolve(false);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
      });
      const stream = fs.createReadStream(filePath);
      stream.on('error', () => {
        if (!res.headersSent) {
          sendError(res, 500, '静态资源读取失败');
        } else {
          res.destroy();
        }
        resolve(true);
      });
      stream.pipe(res);
      stream.on('end', () => resolve(true));
    });
  });
}

function resolveStaticPath(relPath) {
  const target = path.resolve(STATIC_DIR, relPath);
  if (target !== STATIC_DIR && !target.startsWith(STATIC_DIR + path.sep)) {
    return null;
  }
  return target;
}

async function handleApi(req, res, pathname) {
  const method = req.method || 'GET';

  if (pathname === '/api/health') {
    if (method !== 'GET') {
      return sendError(res, 405, 'Method Not Allowed');
    }
    return sendJson(res, 200, { status: 'ok' });
  }

  if (pathname === '/api/auth/register' || pathname === '/api/auth/login') {
    if (method !== 'POST') {
      return sendError(res, 405, 'Method Not Allowed');
    }
    const body = await readJsonBody(req);
    if (!models.isPlainObject(body)) {
      throw new models.ValidationError('请求体必须是 JSON 对象');
    }
    try {
      const { user, token } = await (pathname === '/api/auth/register'
        ? auth.register(body.username, body.email, body.password)
        : auth.login(body.username, body.password));
      return sendJson(
        res,
        200,
        { user },
        { 'Set-Cookie': sessionCookie(req, token, auth.SESSION_TTL_SECONDS) },
      );
    } catch (err) {
      if (err instanceof auth.AuthError) {
        return sendError(res, err.status, err.message);
      }
      throw err;
    }
  }

  if (pathname === '/api/auth/password-reset/request') {
    if (method !== 'POST') {
      return sendError(res, 405, 'Method Not Allowed');
    }
    const body = await readJsonBody(req);
    try {
      return sendJson(res, 200, await auth.requestPasswordReset(body.email));
    } catch (err) {
      if (err instanceof auth.AuthError) {
        return sendError(res, err.status, err.message);
      }
      throw err;
    }
  }

  if (pathname === '/api/auth/password-reset/confirm') {
    if (method !== 'POST') {
      return sendError(res, 405, 'Method Not Allowed');
    }
    const body = await readJsonBody(req);
    try {
      await auth.resetPassword(body.token, body.new_password);
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      if (err instanceof auth.AuthError) {
        return sendError(res, err.status, err.message);
      }
      throw err;
    }
  }

  if (pathname === '/api/auth/logout') {
    if (method !== 'POST') {
      return sendError(res, 405, 'Method Not Allowed');
    }
    await auth.logout(readCookie(req, auth.COOKIE_NAME));
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  if (pathname === '/api/auth/me') {
    if (method !== 'GET') {
      return sendError(res, 405, 'Method Not Allowed');
    }
    const user = await auth.currentUser(readCookie(req, auth.COOKIE_NAME));
    if (!user) {
      return sendError(res, 401, '请先登录');
    }
    return sendJson(res, 200, { user });
  }

  const accountPaths = [
    '/api/account',
    '/api/account/preferences',
    '/api/account/password',
    '/api/account/favorites',
  ];
  const isFavoriteDelete = pathname.startsWith('/api/account/favorites/');
  if (accountPaths.includes(pathname) || isFavoriteDelete) {
    const user = await auth.currentUser(readCookie(req, auth.COOKIE_NAME));
    if (!user) {
      return sendError(res, 401, '请先登录');
    }
    try {
      if (pathname === '/api/account' && method === 'GET') {
        return sendJson(res, 200, await auth.getAccount(user.id));
      }
      if (pathname === '/api/account/preferences' && method === 'PUT') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, {
          preferences: await auth.updatePreferences(user.id, body),
        });
      }
      if (pathname === '/api/account/password' && method === 'POST') {
        const body = await readJsonBody(req);
        const token = readCookie(req, auth.COOKIE_NAME);
        await auth.changePassword(user.id, token, body.current_password, body.new_password);
        return sendJson(res, 200, { ok: true });
      }
      if (pathname === '/api/account/favorites' && method === 'POST') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, await auth.addFavorite(user.id, body));
      }
      if (isFavoriteDelete && method === 'DELETE') {
        const favoriteId = pathname.split('/').pop();
        return sendJson(res, 200, await auth.deleteFavorite(user.id, favoriteId));
      }
      return sendError(res, 405, 'Method Not Allowed');
    } catch (err) {
      if (err instanceof auth.AuthError) {
        return sendError(res, err.status, err.message);
      }
      throw err;
    }
  }

  const protectedPaths = [
    '/api/simulate',
    '/api/recommend',
    '/api/identify',
    '/api/ai/test',
  ];
  if (protectedPaths.includes(pathname)) {
    const user = await auth.currentUser(readCookie(req, auth.COOKIE_NAME));
    if (!user) {
      return sendError(res, 401, '请先登录');
    }
  }

  if (pathname === '/api/compounds/search') {
    if (method !== 'GET') {
      return sendError(res, 405, 'Method Not Allowed');
    }
    const url = new URL(req.url, 'http://localhost');
    const query = (url.searchParams.get('q') || '').trim();
    const requested = Number.parseInt(url.searchParams.get('limit') || '6', 10);
    const limit = Math.min(10, Math.max(1, Number.isFinite(requested) ? requested : 6));
    const local = searchLocalCompounds(query);
    if (query.length < 2) {
      return sendJson(res, 200, { query, local, online: [], online_error: null });
    }
    try {
      const online = await pubchem.searchOnline(query, limit);
      return sendJson(res, 200, { query, local, online, online_error: null });
    } catch (err) {
      return sendJson(res, 200, {
        query,
        local,
        online: [],
        online_error: err.message || '在线数据库暂不可用',
      });
    }
  }

  if (pathname === '/api/compounds') {
    if (method !== 'GET') {
      return sendError(res, 405, 'Method Not Allowed');
    }
    return sendJson(res, 200, { compounds: COMPOUNDS, categories: CATEGORIES });
  }

  if (pathname === '/api/literature/search' || pathname.startsWith('/api/literature/watch')) {
    const user = await auth.currentUser(readCookie(req, auth.COOKIE_NAME));
    if (!user) {
      return sendError(res, 401, '请先登录');
    }
  }

  if (pathname === '/api/literature/search') {
    if (method !== 'GET') {
      return sendError(res, 405, 'Method Not Allowed');
    }
    const url = new URL(req.url, 'http://localhost');
    const requested = Number.parseInt(url.searchParams.get('limit') || '15', 10);
    try {
      const data = await literature.search(url.searchParams.get('q') || '', {
        limit: Number.isFinite(requested) ? requested : 15,
        sort: url.searchParams.get('sort') || 'relevance',
        from_year: url.searchParams.get('from_year') || null,
        to_year: url.searchParams.get('to_year') || null,
      });
      return sendJson(res, 200, data);
    } catch (err) {
      if (err instanceof literature.LiteratureError) {
        return sendError(res, err.status, err.message);
      }
      return sendError(res, 502, `文献检索失败：${err.message || err}`);
    }
  }

  const watchMatch = pathname.match(/^\/api\/literature\/watch(?:\/([^/]+))?(?:\/(scan|items))?$/);
  if (watchMatch) {
    const topicId = watchMatch[1];
    const action = watchMatch[2];
    const user = await auth.currentUser(readCookie(req, auth.COOKIE_NAME));
    try {
      if (!topicId) {
        if (method === 'GET') {
          return sendJson(res, 200, await auth.listLiteratureTopics(user.id));
        }
        if (method === 'POST') {
          const body = await readJsonBody(req);
          return sendJson(res, 200, await auth.addLiteratureTopic(user.id, body));
        }
        return sendError(res, 405, 'Method Not Allowed');
      }
      if (action === 'items' && method === 'GET') {
        const data = await auth.getLiteratureTopic(user.id, topicId);
        return sendJson(res, 200, { topic: data.topic, items: data.items });
      }
      if (action === 'scan' && method === 'POST') {
        const current = await auth.getLiteratureTopic(user.id, topicId);
        try {
          const scan = await literature.scanTopic(current.topic.query, current.seen_ids, {
            baseline: !current.topic.last_scan_at,
          });
          return sendJson(res, 200, await auth.saveLiteratureScan(user.id, topicId, scan));
        } catch (err) {
          const saved = await auth.saveLiteratureScan(
            user.id,
            topicId,
            null,
            err.message || '文献扫描失败',
          );
          return sendJson(res, 200, {
            ...saved,
            scan_error: err.message || '文献数据库暂不可用',
          });
        }
      }
      if (!action && method === 'DELETE') {
        return sendJson(res, 200, await auth.deleteLiteratureTopic(user.id, topicId));
      }
      return sendError(res, 405, 'Method Not Allowed');
    } catch (err) {
      if (err instanceof auth.AuthError) {
        return sendError(res, err.status, err.message);
      }
      throw err;
    }
  }

  if (pathname === '/api/ai/status') {
    if (method === 'GET') {
      return sendJson(res, 200, aiClient.publicStatus());
    }
    if (method === 'POST') {
      const body = await readJsonBody(req);
      const override = models.normalizeAIOverride(
        models.isPlainObject(body) ? body : {},
      );
      return sendJson(res, 200, aiClient.publicStatus(override));
    }
    return sendError(res, 405, 'Method Not Allowed');
  }

  if (pathname === '/api/ai/test') {
    if (method !== 'POST') {
      return sendError(res, 405, 'Method Not Allowed');
    }
    const body = await readJsonBody(req);
    const override = models.normalizeAIOverride(
      models.isPlainObject(body) ? body : {},
    );
    const config = aiClient.resolveConfig(override);
    if (!config.configured) {
      return sendError(res, 400, '请先填写 API Key');
    }
    try {
      const result = await aiClient.testConnection(config);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendError(res, 502, err.message || String(err));
    }
  }

  if (pathname === '/api/simulate') {
    if (method !== 'POST') {
      return sendError(res, 405, 'Method Not Allowed');
    }
    const body = await readJsonBody(req);
    if (!models.isPlainObject(body)) {
      throw new models.ValidationError('请求体必须是 JSON 对象');
    }
    const compounds = models.normalizeCompoundList(body.compounds, 'compounds');
    const conditions = models.normalizeConditions(body.conditions, 'conditions');
    if (!compounds.length) {
      return sendError(res, 400, '至少选择一个组分');
    }
    let result;
    try {
      result = simulate(compounds, conditions);
    } catch (err) {
      return sendError(res, 500, `模拟失败：${err.message || err}`);
    }
    return sendJson(res, 200, result);
  }

  if (pathname === '/api/recommend') {
    if (method !== 'POST') {
      return sendError(res, 405, 'Method Not Allowed');
    }
    const body = await readJsonBody(req);
    if (!models.isPlainObject(body)) {
      throw new models.ValidationError('请求体必须是 JSON 对象');
    }
    const compounds = models.normalizeCompoundList(body.compounds, 'compounds');
    const constraints = models.normalizeConstraints(body.constraints, 'constraints');
    const override = models.normalizeAIOverride(body.ai, 'ai');
    if (!compounds.length) {
      return sendError(res, 400, '至少选择一个组分');
    }
    if (compounds.length > 20) {
      return sendError(res, 400, '一次最多分析 20 个组分');
    }
    try {
      const result = await recommend(compounds, constraints, override);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendError(res, 500, `条件设计失败：${err.message || err}`);
    }
  }

  if (pathname === '/api/identify') {
    if (method !== 'POST') {
      return sendError(res, 405, 'Method Not Allowed');
    }
    const body = await readJsonBody(req);
    const request = models.normalizeIdentifyRequest(body);
    if (!request.observed_peaks.length) {
      return sendError(res, 400, '至少提供一个观测峰');
    }
    try {
      return sendJson(res, 200, identify(request));
    } catch (err) {
      if (err instanceof models.ValidationError) {
        return sendError(res, 400, err.message);
      }
      return sendError(res, 500, `组分识别失败：${err.message || err}`);
    }
  }

  return sendError(res, 404, 'Not Found');
}

async function handleRequest(req, res) {
  let pathname;
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
  } catch (err) {
    return sendError(res, 400, '非法请求路径');
  }

  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendError(res, 405, 'Method Not Allowed');
  }

  if (pathname === '/' || pathname === '') {
    const ok = await serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
    if (!ok) {
      return sendError(res, 404, 'Not Found');
    }
    return undefined;
  }

  if (pathname.startsWith('/static/')) {
    const relPath = pathname.slice('/static/'.length);
    const target = resolveStaticPath(relPath);
    if (!target) {
      return sendError(res, 403, 'Forbidden');
    }
    const ok = await serveFile(res, target);
    if (!ok) {
      return sendError(res, 404, 'Not Found');
    }
    return undefined;
  }

  return sendError(res, 404, 'Not Found');
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (err instanceof models.ValidationError) {
      sendError(res, 400, err.message);
      return;
    }
    sendError(res, 500, `服务器内部错误：${err && err.message ? err.message : err}`);
  });
});

const PORT = Number(process.env.PORT) || 8000;
const HOST = '0.0.0.0';

async function main() {
  // Wait for the store backend to finish probing (file or Redis), then
  // seed the demo account before accepting any requests.
  await store.storePromise;
  await auth.bootstrapDemo();
  await new Promise((resolve) => server.listen(PORT, HOST, resolve));
  process.stdout.write(`ChromAI Node server listening on http://${HOST}:${PORT}\n`);
}

main().catch((err) => {
  console.error('[chromai] Failed to start server:', err);
  process.exit(1);
});
