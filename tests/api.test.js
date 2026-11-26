import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { analyze, server, simulate, validatePayload } from '../server.js';

const validPayload = (mode = 'simulate') => ({
  mode,
  route: 'combined',
  parameters: { flow_rate: 1, temperature: 40, injection_volume: 10, detection_wavelength: 254, run_time: 30, gradient: 20 },
  compound: { name: 'aspirin', cas_number: '50-78-2' },
});
let port;

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); });

function request(method, route, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try { data = JSON.parse(text); } catch { data = text; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
const postJson = (payload) => {
  const body = JSON.stringify(payload);
  return request('POST', '/api/interface/detect', body, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
};

test('simulation contract is deterministic and complete', () => {
  const first = simulate(validatePayload(validPayload()));
  assert.deepEqual(first, simulate(validatePayload(validPayload())));
  assert.equal(first.mode, 'simulate');
  assert.equal(first.simulated, true);
  assert.equal(first.plot.points.length, 241);
  assert.equal(first.results.peak_count, 3);
  for (const key of ['retention_time', 'resolution', 'tailing_factor', 'peaks']) assert.ok(key in first.results);
});

test('changed parameters reproduce the verified retention result', () => {
  const payload = validPayload();
  payload.parameters.flow_rate = 1.5;
  payload.parameters.temperature = 50;
  assert.equal(simulate(validatePayload(payload)).results.retention_time, 8.6286);
});

test('analysis exposes distinct result fields', () => {
  const result = analyze(validatePayload(validPayload('analyze')));
  assert.equal('plot' in result, false);
  assert.equal('retention_time' in result.results, false);
  assert.equal(result.results.recognized_parameters.length, 6);
  for (const key of ['confidence', 'modules_detected', 'interface_quality']) assert.ok(key in result.results);
});

test('all parameters are required and range checked', () => {
  const invalid = { flow_rate: 0, temperature: 101, injection_volume: 0, detection_wavelength: 189, run_time: 0, gradient: 101 };
  for (const [key, value] of Object.entries(invalid)) {
    const missing = validPayload();
    delete missing.parameters[key];
    assert.throws(() => validatePayload(missing), (error) => Boolean(error.fields[key]));
    const outOfRange = validPayload();
    outOfRange.parameters[key] = value;
    assert.throws(() => validatePayload(outOfRange), (error) => Boolean(error.fields[key]));
    const wrongType = validPayload();
    wrongType.parameters[key] = 'not-a-number';
    assert.throws(() => validatePayload(wrongType));
  }
});

test('parameter boundaries are accepted', () => {
  const payload = validPayload();
  Object.assign(payload.parameters, { flow_rate: 0.05, temperature: 4, injection_volume: 0.1, detection_wavelength: 190, run_time: 1, gradient: 0 });
  assert.doesNotThrow(() => validatePayload(payload));
});

test('health, static page and JSON API smoke', async () => {
  const health = await request('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.simulation_engine, true);
  const home = await request('GET', '/');
  assert.equal(home.status, 200);
  assert.match(home.data, /ION/);
  const result = await postJson(validPayload());
  assert.equal(result.status, 200);
  assert.equal(result.data.results.peak_count, 3);
});

test('invalid mode route body and search query return field errors', async () => {
  for (const [key, value] of [['mode', 'predict'], ['route', 'other']]) {
    const payload = validPayload();
    payload[key] = value;
    const response = await postJson(payload);
    assert.equal(response.status, 400);
    assert.ok(response.data.error.fields[key]);
  }
  const empty = await request('POST', '/api/interface/detect', '', { 'Content-Type': 'application/json' });
  assert.equal(empty.status, 400);
  const search = await request('GET', '/api/compounds/search?q=');
  assert.equal(search.status, 400);
  assert.ok(search.data.error.fields.q);
});

test('PNG multipart upload triggers analysis', async () => {
  const boundary = '----IONTESTBOUNDARY';
  const payload = JSON.stringify(validPayload('analyze'));
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\nContent-Type: application/json\r\n\r\n${payload}\r\n--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="screen.png"\r\nContent-Type: image/png\r\n\r\n`),
    png,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const response = await request('POST', '/api/interface/detect', body, { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length });
  assert.equal(response.status, 200);
  assert.equal(response.data.detection.image_attached, true);
});

test('invalid image signature is rejected', async () => {
  const boundary = '----IONTESTBOUNDARY';
  const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${JSON.stringify(validPayload())}\r\n--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="screen.png"\r\nContent-Type: image/png\r\n\r\nnot-an-image\r\n--${boundary}--\r\n`);
  const response = await request('POST', '/api/interface/detect', body, { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length });
  assert.equal(response.status, 400);
  assert.ok(response.data.error.fields.image);
});
