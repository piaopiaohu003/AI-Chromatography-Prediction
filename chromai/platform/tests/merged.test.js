'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const chemicalbook = require('../lib/chemicalbook');
const detector = require('../lib/detector');
const simulation = require('../lib/simulation');
const models = require('../lib/models');
const { COMPOUNDS } = require('../lib/compounds');
const aiClient = require('../lib/ai-client');

const SAMPLE = models.normalizeCompoundList([COMPOUNDS[0]]);

function simulateWith(overrides) {
  const conditions = models.normalizeConditions(overrides);
  return simulation.simulate(SAMPLE, conditions);
}

const signalSum = (result) => result.signal.reduce((sum, value) => sum + Math.abs(value), 0);

const SEARCH_HTML = `
<table class="mid"><tr><td><table class="mbox">
<tr><td>CBNumber:</td><td>CB5114818</td></tr>
<tr><td>Chemical Name:</td><td class="rtd"><a>aspirin</a></td></tr>
<tr><td>Molecular Formula:</td><td>C9H8O4</td></tr>
<tr><td>Formula Weight:</td><td>180.16</td></tr>
<tr><td>CAS No.:</td><td>50-78-2</td></tr>
</table><a href="/ProductChemicalPropertiesCB5114818_EN.htm">Chemical Properties</a></td></tr></table>
<table class="mid"><tr><td><table class="mbox">
<tr><td>Chemical Name:</td><td class="rtd"><a>Unknown compound</a></td></tr>
<tr><td>Molecular Formula:</td><td> </td></tr><tr><td>CAS No.:</td><td> </td></tr>
</table></td></tr></table>`;

const DETAIL_HTML = `<table>
<tr class="ProdSupplierGN_ProductA_2"><td>Product Name:</td><td>Acetylsalicylic acid</td></tr>
<tr class="ProdSupplierGN_ProductA_1"><td>CAS:</td><td>50-78-2</td></tr>
<tr class="ProdSupplierGN_ProductA_2"><td>MF:</td><td>C9H8O4</td></tr>
<tr class="ProdSupplierGN_ProductA_1"><td>MW:</td><td>180.16</td></tr>
<tr class="ProdSupplierGN_ProductA_2"><td>Boiling point</td><td>272.96°C (rough estimate)</td></tr>
<tr class="ProdSupplierGN_ProductA_1"><td><a name="Chemical property">Chemical property</a></td><td>This product is a white crystalline solid.</td></tr>
</table>`;

const validPayload = (mode = 'simulate') => ({
  mode,
  route: 'combined',
  parameters: {
    flow_rate: 1,
    temperature: 40,
    injection_volume: 10,
    detection_wavelength: 254,
    run_time: 30,
    gradient: 20,
  },
  compound: { name: 'aspirin', cas_number: '50-78-2' },
});

test('ChemicalBook search preserves present and missing fields', () => {
  const matches = chemicalbook.parseSearch(SEARCH_HTML);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].name, 'aspirin');
  assert.equal(matches[0].cas_number, '50-78-2');
  assert.equal(matches[0].molecular_formula, 'C9H8O4');
  assert.equal(matches[0].molecular_weight, '180.16');
  assert.equal(matches[0].cb_number, 'CB5114818');
  assert.equal(matches[0].detail_url, 'https://www.chemicalbook.com/ProductChemicalPropertiesCB5114818_EN.htm');
  assert.equal(matches[1].cas_number, null);
  assert.equal(matches[1].molecular_formula, null);
});

test('ChemicalBook detail maps properties and paragraph summary', () => {
  const selected = chemicalbook.parseDetail(DETAIL_HTML, chemicalbook.parseSearch(SEARCH_HTML)[0]);
  assert.equal(selected.name, 'Acetylsalicylic acid');
  assert.equal(selected.source_label, 'ChemicalBook · Product chemical properties');
  assert.equal(selected.summary, 'This product is a white crystalline solid.');
  assert.deepEqual(selected.properties, [
    { label: 'Molecular formula', value: 'C9H8O4' },
    { label: 'Molecular weight', value: '180.16' },
    { label: 'Boiling point', value: '272.96°C (rough estimate)' },
  ]);
});

test('ChemicalBook empty page returns no matches', () => {
  assert.deepEqual(chemicalbook.parseSearch('<html><body>No matches</body></html>'), []);
});

test('detector simulation is deterministic and complete', () => {
  const first = detector.simulate(detector.validatePayload(validPayload()));
  assert.deepEqual(first, detector.simulate(detector.validatePayload(validPayload())));
  assert.equal(first.mode, 'simulate');
  assert.equal(first.simulated, true);
  assert.equal(first.plot.points.length, 241);
  assert.equal(first.results.peak_count, 3);
  for (const key of ['retention_time', 'resolution', 'tailing_factor', 'peaks']) {
    assert.ok(key in first.results);
  }
});

test('changed parameters reproduce the verified retention result', () => {
  const payload = validPayload();
  payload.parameters.flow_rate = 1.5;
  payload.parameters.temperature = 50;
  assert.equal(detector.simulate(detector.validatePayload(payload)).results.retention_time, 8.6286);
});

test('detector analysis exposes distinct result fields', () => {
  const result = detector.analyze(detector.validatePayload(validPayload('analyze')));
  assert.equal('plot' in result, false);
  assert.equal('retention_time' in result.results, false);
  assert.equal(result.results.recognized_parameters.length, 6);
  for (const key of ['confidence', 'modules_detected', 'interface_quality']) {
    assert.ok(key in result.results);
  }
});

test('all parameters are required and range checked', () => {
  const invalid = { flow_rate: 0, temperature: 101, injection_volume: 0, detection_wavelength: 189, run_time: 0, gradient: 101 };
  for (const [key, value] of Object.entries(invalid)) {
    const missing = validPayload();
    delete missing.parameters[key];
    assert.throws(() => detector.validatePayload(missing), (error) => Boolean(error.fields[key]));
    const outOfRange = validPayload();
    outOfRange.parameters[key] = value;
    assert.throws(() => detector.validatePayload(outOfRange), (error) => Boolean(error.fields[key]));
    const wrongType = validPayload();
    wrongType.parameters[key] = 'not-a-number';
    assert.throws(() => detector.validatePayload(wrongType));
  }
});

test('parameter boundaries are accepted', () => {
  const payload = validPayload();
  Object.assign(payload.parameters, {
    flow_rate: 0.05,
    temperature: 4,
    injection_volume: 0.1,
    detection_wavelength: 190,
    run_time: 1,
    gradient: 0,
  });
  assert.doesNotThrow(() => detector.validatePayload(payload));
});

test('invalid routes and modes are rejected', () => {
  const badRoute = validPayload();
  badRoute.route = 'other';
  assert.throws(() => detector.validatePayload(badRoute), (error) => Boolean(error.fields.route));
  const badMode = validPayload();
  badMode.mode = 'predict';
  assert.throws(() => detector.validatePayload(badMode), (error) => Boolean(error.fields.mode));
});

test('detector type defaults to UV and rejects unknown values', () => {
  assert.equal(models.normalizeConditions({}).detector, 'UV');
  assert.throws(() => models.normalizeConditions({ detector: 'PDA' }), (error) => error instanceof models.ValidationError);
});

test('UV response depends on wavelength while RID stays universal', () => {
  const uvShort = simulateWith({ detector: 'UV', wavelength_nm: 210 });
  const uvLong = simulateWith({ detector: 'UV', wavelength_nm: 400 });
  assert.notEqual(signalSum(uvShort), signalSum(uvLong));

  const ridShort = simulateWith({ detector: 'RID', wavelength_nm: 210 });
  const ridLong = simulateWith({ detector: 'RID', wavelength_nm: 400 });
  assert.deepEqual(ridShort.signal, ridLong.signal);
  assert.deepEqual(ridShort.peaks, ridLong.peaks);
  assert.equal(ridShort.peaks[0].eps_rel, 1);
  assert.equal(ridShort.metrics.detector, 'RID');
});

test('detector parameters change the simulated response', () => {
  const narrow = simulateWith({ detector: 'UV', wavelength_nm: 254, bandwidth_nm: 2 });
  const wide = simulateWith({ detector: 'UV', wavelength_nm: 254, bandwidth_nm: 40 });
  assert.notEqual(signalSum(narrow), signalSum(wide));

  const fldExact = simulateWith({ detector: 'FLD', excitation_nm: COMPOUNDS[0].lambda_max_nm });
  const fldOff = simulateWith({ detector: 'FLD', excitation_nm: 500 });
  assert.notEqual(signalSum(fldExact), signalSum(fldOff));
});

test('each detector reports its own advisory warning', () => {
  assert.ok(simulateWith({ detector: 'RID' }).warnings.some((item) => item.includes('RID')));
  assert.ok(simulateWith({ detector: 'ELSD' }).warnings.some((item) => item.includes('挥发性缓冲盐')));
  assert.ok(simulateWith({ detector: 'MS' }).warnings.some((item) => item.includes('MS')));
});

test('AI payload omits temperature by default for strict providers', () => {
  const payload = aiClient.buildPayload([{ role: 'user', content: 'ping' }]);
  assert.equal('temperature' in payload, false);
  assert.equal(payload.max_tokens, 2000);
  assert.deepEqual(payload.response_format, { type: 'json_object' });
});

test('AI payload honours explicit temperature and text mode', () => {
  const payload = aiClient.buildPayload([], { temperature: 0.3, jsonMode: false });
  assert.equal(payload.temperature, 0.3);
  assert.equal('response_format' in payload, false);
});


test('AI requests stop waiting before the platform gateway times out', async () => {
  const http = require('http');
  const server = http.createServer(() => {});
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();
  process.env.CHROM_AI_TIMEOUT_MS = '1500';
  try {
    await assert.rejects(
      aiClient.chat(
        { configured: true, base_url: `http://127.0.0.1:${port}/v1`, model: 'slow-model', api_key: 'k' },
        [{ role: 'user', content: 'ping' }],
        { jsonMode: false },
      ),
      (error) => /超时/.test(error.message),
    );
  } finally {
    delete process.env.CHROM_AI_TIMEOUT_MS;
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    server.close();
  }
});

test('image signatures are verified from base64 payloads', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]).toString('base64');
  const accepted = detector.decodeImage({ filename: 'screen.png', mimeType: 'image/png', data_base64: png });
  assert.equal(accepted.mimeType, 'image/png');
  assert.throws(
    () => detector.decodeImage({ filename: 'screen.png', mimeType: 'image/png', data_base64: Buffer.from('not-an-image').toString('base64') }),
    (error) => Boolean(error.fields.image),
  );
  assert.throws(
    () => detector.decodeImage({ filename: 'screen.bmp', mimeType: 'image/bmp', data_base64: png }),
    (error) => Boolean(error.fields.image),
  );
});
