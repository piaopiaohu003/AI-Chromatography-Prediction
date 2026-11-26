import http from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import Busboy from 'busboy';
import { Agent, ProxyAgent, fetch, setGlobalDispatcher } from 'undici';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = existsSync(path.join(__dirname, 'index.html')) ? __dirname : path.join(__dirname, 'dist');
const MAX_BODY = 6 * 1024 * 1024;
const BASE_URL = 'https://www.chemicalbook.com';
const SEARCH_URL = `${BASE_URL}/Search_EN.aspx`;
const DETAIL_PATH = /\/ProductChemicalPropertiesCB\d+_EN\.htm/i;
const PARAMETER_DEFS = {
  flow_rate: { label: 'Flow rate', unit: 'mL/min', min: 0.05, max: 5 },
  temperature: { label: 'Column temperature', unit: '°C', min: 4, max: 100 },
  injection_volume: { label: 'Injection volume', unit: 'µL', min: 0.1, max: 100 },
  detection_wavelength: { label: 'Detection wavelength', unit: 'nm', min: 190, max: 800 },
  run_time: { label: 'Run time', unit: 'min', min: 1, max: 180 },
  gradient: { label: 'Initial organic phase', unit: '%', min: 0, max: 100 },
};
const ROUTE_MODULES = {
  combined: [['Inlet & solvent delivery', ['flow_rate', 'gradient']], ['UV-Vis detector', ['detection_wavelength']], ['Column thermostat', ['temperature']], ['Injection system', ['injection_volume', 'run_time']]],
  inlet: [['Solvent channels', ['gradient']], ['Gradient mixer', ['gradient']], ['Flow controller', ['flow_rate']]],
  uv_vis: [['UV-Vis detector', ['detection_wavelength']], ['Wavelength control', ['detection_wavelength']], ['Signal monitor', []]],
  temperature: [['Column thermostat', ['temperature']], ['Temperature controller', ['temperature']]],
  column: [['Column parameters', ['run_time']], ['Injection system', ['injection_volume']], ['Acquisition runtime', ['run_time']]],
};
const responseCache = new Map();
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
setGlobalDispatcher(proxy ? new ProxyAgent(proxy) : new Agent({ connectTimeout: 10000 }));

class ValidationError extends Error {
  constructor(message, fields = {}, status = 400) {
    super(message);
    this.fields = fields;
    this.status = status;
  }
}
class ChemicalBookError extends Error {}

const clean = (value) => {
  const cleaned = String(value ?? '').replaceAll('\xa0', ' ').replace(/\s+/g, ' ').trim();
  return cleaned || null;
};
const round = (value, digits = 4) => Number(value.toFixed(digits));
const seedValue = (value) => Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16);

async function upstreamRequest(url) {
  if (responseCache.has(url)) return responseCache.get(url);
  const pending = (async () => {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow',
      });
      if (!response.ok) throw new ChemicalBookError('ChemicalBook did not return a usable response.');
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 8_000_000) throw new ChemicalBookError('ChemicalBook returned an unexpectedly large response.');
      const text = new TextDecoder('utf-8').decode(buffer);
      if (response.url.includes('/verify') || text.includes("Verify you're human")) {
        throw new ChemicalBookError('ChemicalBook requires browser verification for this request.');
      }
      return { text, url: response.url };
    } catch (error) {
      if (error instanceof ChemicalBookError) throw error;
      throw new ChemicalBookError('ChemicalBook did not return a usable response.', { cause: error });
    }
  })();
  responseCache.set(url, pending);
  if (responseCache.size > 128) responseCache.delete(responseCache.keys().next().value);
  try {
    return await pending;
  } catch (error) {
    responseCache.delete(url);
    throw error;
  }
}

function rowFields($, scope) {
  const fields = {};
  scope.find('tr').each((_, row) => {
    const cells = $(row).children('td');
    if (cells.length < 2) return;
    const label = clean(cells.eq(0).text());
    const value = clean(cells.eq(1).text());
    if (label && value) fields[label.replace(/:$/, '').trim().toLowerCase()] = value;
  });
  return fields;
}

export function parseSearch(html, limit = 5) {
  const $ = cheerio.load(html);
  const matches = [];
  $('table.mbox').each((_, element) => {
    if (matches.length >= limit) return;
    const table = $(element);
    const nameCell = table.find('td.rtd').first();
    if (!nameCell.length) return;
    const fields = rowFields($, table);
    const name = clean(nameCell.text());
    if (!name) return;
    const mid = table.parents('table.mid').first();
    const scope = mid.length ? mid : table.parent();
    const detailLink = scope.find('a').filter((_, link) => DETAIL_PATH.test($(link).attr('href') || '')).first();
    const href = detailLink.attr('href');
    const detailUrl = href ? new URL(href, BASE_URL).href : null;
    let cbNumber = fields.cbnumber || null;
    if (!cbNumber && detailUrl) cbNumber = detailUrl.match(/Properties(CB\d+)/i)?.[1]?.toUpperCase() || null;
    matches.push({
      id: cbNumber || `result-${matches.length + 1}`,
      cb_number: cbNumber,
      name,
      cas_number: fields['cas no.'] || null,
      molecular_formula: fields['molecular formula'] || null,
      molecular_weight: fields['formula weight'] || null,
      detail_url: detailUrl,
    });
  });
  return matches;
}

export function parseDetail(html, match) {
  const $ = cheerio.load(html);
  const fields = {};
  $("tr[class^='ProdSupplierGN_ProductA_']").each((_, row) => {
    const cells = $(row).children('td');
    if (cells.length < 2) return;
    const label = clean(cells.eq(0).text());
    const value = clean(cells.eq(1).text());
    const key = label?.replace(/:$/, '').trim().toLowerCase();
    if (key && value && fields[key] === undefined) fields[key] = value;
  });
  const selected = {
    ...match,
    name: fields['product name'] || match.name,
    cas_number: fields.cas || match.cas_number,
    molecular_formula: fields.mf || match.molecular_formula,
    molecular_weight: fields.mw || match.molecular_weight,
    source_label: 'ChemicalBook · Product chemical properties',
  };
  selected.properties = [
    ['Molecular formula', selected.molecular_formula],
    ['Molecular weight', selected.molecular_weight],
    ['Boiling point', fields['boiling point']],
  ].filter(([, value]) => value).map(([label, value]) => ({ label, value }));
  const anchor = $('a[name]').filter((_, element) => clean($(element).attr('name'))?.toLowerCase() === 'chemical property').first();
  const cells = anchor.closest('tr').children('td');
  selected.summary = cells.length >= 2 ? clean(cells.last().text()) : null;
  return selected;
}

export async function searchCompounds(query, cbNumber = null) {
  const search = await upstreamRequest(`${SEARCH_URL}?keyword=${encodeURIComponent(query)}`);
  const matches = parseSearch(search.text);
  let selected = null;
  if (matches.length) {
    const base = cbNumber ? matches.find((item) => item.cb_number?.toUpperCase() === cbNumber.toUpperCase()) : matches[0];
    if (base?.detail_url) {
      const detail = await upstreamRequest(base.detail_url);
      selected = parseDetail(detail.text, base);
    } else if (base) {
      selected = {
        ...base,
        properties: [['Molecular formula', base.molecular_formula], ['Molecular weight', base.molecular_weight]].filter(([, value]) => value).map(([label, value]) => ({ label, value })),
        summary: null,
        source_label: 'ChemicalBook · Search result',
      };
    }
  }
  return {
    query,
    source: { name: 'ChemicalBook', status: 'live', url: search.url },
    matches,
    selected,
    notices: {
      matches: matches.length ? null : 'No compounds matched this search.',
      properties: selected?.properties?.length ? null : 'No physical properties are published for this record.',
      summary: selected?.summary ? null : 'No compound summary is published for this record.',
    },
  };
}

export function validatePayload(payload) {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new ValidationError('A JSON object or a multipart payload field is required.');
  const mode = payload.mode ?? 'simulate';
  if (!['simulate', 'analyze'].includes(mode)) throw new ValidationError("Mode must be either 'simulate' or 'analyze'.", { mode: 'Choose simulate or analyze.' });
  const route = payload.route ?? 'combined';
  if (!Object.hasOwn(ROUTE_MODULES, route)) throw new ValidationError('The selected interface route is not supported.', { route: 'Choose combined, inlet, uv_vis, temperature, or column.' });
  if (!payload.parameters || Array.isArray(payload.parameters) || typeof payload.parameters !== 'object') throw new ValidationError('Six method parameters are required.', { parameters: 'Provide a parameters object.' });
  const parameters = {};
  const errors = {};
  for (const [key, definition] of Object.entries(PARAMETER_DEFS)) {
    const raw = payload.parameters[key];
    if (raw === undefined || raw === null || raw === '') errors[key] = `${definition.label} is required.`;
    else if (typeof raw === 'boolean' || raw === null || (typeof raw === 'string' && !raw.trim())) errors[key] = `${definition.label} must be a number.`;
    else {
      const value = Number(raw);
      if (!Number.isFinite(value)) errors[key] = `${definition.label} must be a finite number.`;
      else if (value < definition.min || value > definition.max) errors[key] = `Enter a value from ${definition.min} to ${definition.max} ${definition.unit}.`;
      else parameters[key] = value;
    }
  }
  if (Object.keys(errors).length) throw new ValidationError('Correct the highlighted method parameters.', errors);
  const rawCompound = payload.compound || {};
  if (Array.isArray(rawCompound) || typeof rawCompound !== 'object') throw new ValidationError('Compound must be an object.', { compound: 'Provide a compound object.' });
  const compound = {};
  for (const key of ['name', 'cas_number', 'molecular_formula', 'molecular_weight']) {
    const value = rawCompound[key];
    if (value === null || value === undefined) compound[key] = null;
    else if (typeof value === 'string' && value.trim().length <= 200) compound[key] = value.trim() || null;
    else throw new ValidationError('Compound text fields must be strings of at most 200 characters.', { compound: `Invalid ${key}.` });
  }
  return { mode, route, parameters, compound };
}

function validateImage(image) {
  if (!image) return false;
  if (!image.filename) throw new ValidationError('The attached image has no filename.', { image: 'Choose a screenshot to upload.' });
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType)) throw new ValidationError('Only PNG, JPEG, and WebP screenshots are supported.', { image: 'Choose a PNG, JPEG, or WebP image.' });
  const valid = image.mimeType === 'image/png'
    ? image.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : image.mimeType === 'image/jpeg'
      ? image.buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : image.buffer.length >= 12 && image.buffer.subarray(0, 4).toString() === 'RIFF' && image.buffer.subarray(8, 12).toString() === 'WEBP';
  if (!valid) throw new ValidationError('The file content does not match its declared image type.', { image: 'Upload a valid image file.' });
  return true;
}

function detection(route, parameters, imageAttached) {
  return {
    route,
    status: 'completed',
    simulated: true,
    image_attached: imageAttached,
    modules: ROUTE_MODULES[route].map(([name, keys], index) => ({
      name,
      confidence: round(0.97 - index * 0.018 - (imageAttached ? 0 : 0.025), 3),
      parameters: keys.map((key) => PARAMETER_DEFS[key].label),
    })),
  };
}

function createPlot(parameters, compound) {
  const runTime = parameters.run_time;
  const flow = parameters.flow_rate;
  const pythonNumber = (value) => Number.isInteger(value) ? value.toFixed(1) : String(value);
  const seed = seedValue(`${compound.name || 'analyte'}|${pythonNumber(flow)}|${pythonNumber(parameters.temperature)}|${pythonNumber(parameters.gradient)}`);
  const variation = (seed % 1000) / 1000;
  const main = runTime * Math.max(0.15, Math.min(0.8, (0.28 + parameters.gradient / 350 + variation * 0.08) / Math.sqrt(flow)));
  const retention = [Math.max(runTime * 0.055, main * 0.42), main, Math.min(runTime * 0.91, main * 1.43)];
  const widths = [runTime * 0.013, runTime * (0.008 + 0.002 / flow), runTime * 0.014];
  const amplitudes = [32, 105 + parameters.injection_volume * 0.5, 48];
  const points = [];
  for (let index = 0; index <= 240; index += 1) {
    const time = runTime * index / 240;
    let signal = 1.4 + Math.sin(index * 1.77 + variation) * 0.35 + Math.sin(index * 0.19) * 0.15;
    retention.forEach((center, peakIndex) => { signal += amplitudes[peakIndex] * Math.exp(-0.5 * ((time - center) / widths[peakIndex]) ** 2); });
    points.push({ time: round(time), signal: round(Math.max(0, signal)) });
  }
  return { run_time: runTime, points, peaks: retention.map((value) => ({ retention_time: round(value) })) };
}

export function simulate(payload, imageAttached = false) {
  const plot = createPlot(payload.parameters, payload.compound);
  const name = payload.compound.name || 'Target analyte';
  const peaks = plot.peaks.map((peak, index) => ({ ...peak, relative_area: [16.4, 64.3, 19.3][index], assignment: ['Solvent front', name, 'Related substance'][index] }));
  return {
    simulated: true,
    mode: 'simulate',
    detection: detection(payload.route, payload.parameters, imageAttached),
    results: {
      retention_time: plot.peaks[1].retention_time,
      resolution: round(Math.max(1.5, Math.min(4.5, 2.4 - payload.parameters.flow_rate * 0.13 + payload.parameters.temperature / 250)), 3),
      peak_count: peaks.length,
      tailing_factor: round(1.02 + (seedValue(name) % 17) / 100, 3),
      run_time: payload.parameters.run_time,
      peaks,
    },
    plot,
  };
}

export function analyze(payload, imageAttached = false) {
  const detected = detection(payload.route, payload.parameters, imageAttached);
  const confidence = round(detected.modules.reduce((sum, module) => sum + module.confidence, 0) / detected.modules.length, 3);
  return {
    simulated: true,
    mode: 'analyze',
    detection: detected,
    results: {
      confidence,
      modules_detected: detected.modules.length,
      interface_quality: confidence >= 0.9 ? 'Ready' : 'Review',
      recognized_parameters: Object.entries(PARAMETER_DEFS).map(([key, definition]) => ({ key, label: definition.label, value: payload.parameters[key], unit: definition.unit, source: 'Combined parameter preview' })),
    },
  };
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new ValidationError('Uploads are limited to 5 MB.', { image: 'Choose an image smaller than 5 MB.' }, 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    let payloadText = '';
    let image = null;
    let failure = null;
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 } });
    busboy.on('field', (name, value) => { if (name === 'payload') payloadText = value; });
    busboy.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => { failure = new ValidationError('Uploads are limited to 5 MB.', { image: 'Choose an image smaller than 5 MB.' }, 413); });
      stream.on('end', () => { if (name === 'image') image = { ...info, buffer: Buffer.concat(chunks) }; });
    });
    busboy.on('error', reject);
    busboy.on('close', () => {
      if (failure) return reject(failure);
      try { resolve({ payload: JSON.parse(payloadText), image }); }
      catch { reject(new ValidationError('The multipart payload must be valid JSON.', { payload: 'Invalid JSON.' })); }
    });
    req.on('error', reject);
    req.pipe(busboy);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' });
  res.end(body);
}
const validationResponse = (res, error) => sendJson(res, error.status || 400, { error: { code: error.status === 413 ? 'payload_too_large' : 'validation_error', message: error.message, fields: error.fields || {} } });

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { status: 'ok', service: 'ion-chromatography', simulation_engine: true });
  if (req.method === 'GET' && url.pathname === '/api/compounds/search') {
    const query = (url.searchParams.get('q') || '').trim();
    const cbNumber = (url.searchParams.get('cb_number') || '').trim() || null;
    const fields = {};
    if (!query) fields.q = 'Enter a compound name or CAS number.';
    else if (query.length > 100) fields.q = 'Search queries are limited to 100 characters.';
    if (cbNumber && !/^CB\d+$/i.test(cbNumber)) fields.cb_number = 'Use a valid ChemicalBook record identifier.';
    if (Object.keys(fields).length) return validationResponse(res, new ValidationError('Check the compound search parameters.', fields));
    try { return sendJson(res, 200, await searchCompounds(query, cbNumber)); }
    catch (error) {
      if (!(error instanceof ChemicalBookError)) throw error;
      return sendJson(res, 502, { error: { code: 'upstream_unavailable', message: 'ChemicalBook is temporarily unavailable. Retry the search.' }, source: { name: 'ChemicalBook', status: 'unavailable' }, matches: [], selected: null });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/interface/detect') {
    let payload;
    let image = null;
    if (req.headers['content-type']?.startsWith('multipart/form-data')) ({ payload, image } = await parseMultipart(req));
    else if (req.headers['content-type']?.includes('application/json')) {
      try { payload = JSON.parse((await readBody(req)).toString('utf8')); }
      catch (error) { if (error instanceof ValidationError) throw error; throw new ValidationError('The request body must be valid JSON.', { body: 'Invalid JSON.' }); }
    } else throw new ValidationError('Send JSON or multipart/form-data.', { body: 'Unsupported request body.' });
    const validated = validatePayload(payload);
    const imageAttached = validateImage(image);
    return sendJson(res, 200, validated.mode === 'analyze' ? analyze(validated, imageAttached) : simulate(validated, imageAttached));
  }
  return sendJson(res, 404, { error: { code: 'not_found', message: 'API route not found.' } });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
async function serveStatic(res, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return sendJson(res, 400, { error: { code: 'invalid_path', message: 'Invalid URL path.' } }); }
  let file = path.resolve(DIST, `.${decoded}`);
  if (!file.startsWith(`${path.resolve(DIST)}${path.sep}`)) file = path.join(DIST, 'index.html');
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not-file');
  } catch { file = path.join(DIST, 'index.html'); }
  try {
    const body = await readFile(file);
    const extension = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[extension] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' });
    res.end(body);
  } catch { return sendJson(res, 503, { error: { code: 'frontend_not_built', message: 'Run npm run build before starting the server.' } }); }
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else if (['GET', 'HEAD'].includes(req.method)) await serveStatic(res, url.pathname);
    else sendJson(res, 405, { error: { code: 'method_not_allowed', message: 'Method not allowed.' } });
  } catch (error) {
    if (error instanceof ValidationError) return validationResponse(res, error);
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { error: { code: 'internal_error', message: 'The simulation service could not complete the request.' } });
    else res.end();
  }
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  server.listen(port, '0.0.0.0', () => console.log(`ION workspace listening on 0.0.0.0:${port}`));
}
