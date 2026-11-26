'use strict';

/* Simulated instrument-interface detection and six-parameter method preview.
 * All outputs are synthetic and labelled as such; this module never claims to
 * read a real instrument. Parameter validation is shared by the HTTP layer. */

const { createHash } = require('crypto');

const PARAMETER_DEFS = {
  flow_rate: { label: 'Flow rate', unit: 'mL/min', min: 0.05, max: 5 },
  temperature: { label: 'Column temperature', unit: '°C', min: 4, max: 100 },
  injection_volume: { label: 'Injection volume', unit: 'µL', min: 0.1, max: 100 },
  detection_wavelength: { label: 'Detection wavelength', unit: 'nm', min: 190, max: 800 },
  run_time: { label: 'Run time', unit: 'min', min: 1, max: 180 },
  gradient: { label: 'Initial organic phase', unit: '%', min: 0, max: 100 },
};

const ROUTE_MODULES = {
  combined: [
    ['Inlet & solvent delivery', ['flow_rate', 'gradient']],
    ['UV-Vis detector', ['detection_wavelength']],
    ['Column thermostat', ['temperature']],
    ['Injection system', ['injection_volume', 'run_time']],
  ],
  inlet: [
    ['Solvent channels', ['gradient']],
    ['Gradient mixer', ['gradient']],
    ['Flow controller', ['flow_rate']],
  ],
  uv_vis: [
    ['UV-Vis detector', ['detection_wavelength']],
    ['Wavelength control', ['detection_wavelength']],
    ['Signal monitor', []],
  ],
  temperature: [
    ['Column thermostat', ['temperature']],
    ['Temperature controller', ['temperature']],
  ],
  column: [
    ['Column parameters', ['run_time']],
    ['Injection system', ['injection_volume']],
    ['Acquisition runtime', ['run_time']],
  ],
};

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

class ValidationError extends Error {
  constructor(message, fields = {}, status = 400) {
    super(message);
    this.fields = fields;
    this.status = status;
  }
}

const round = (value, digits = 4) => Number(value.toFixed(digits));
const seedValue = (value) => Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16);

function validatePayload(payload) {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    throw new ValidationError('A JSON object payload is required.', { body: 'Provide a JSON object.' });
  }
  const mode = payload.mode === undefined ? 'simulate' : payload.mode;
  if (!['simulate', 'analyze'].includes(mode)) {
    throw new ValidationError("Mode must be either 'simulate' or 'analyze'.", { mode: 'Choose simulate or analyze.' });
  }
  const route = payload.route === undefined ? 'combined' : payload.route;
  if (!Object.prototype.hasOwnProperty.call(ROUTE_MODULES, route)) {
    throw new ValidationError('The selected interface route is not supported.', {
      route: 'Choose combined, inlet, uv_vis, temperature, or column.',
    });
  }
  if (!payload.parameters || Array.isArray(payload.parameters) || typeof payload.parameters !== 'object') {
    throw new ValidationError('Six method parameters are required.', { parameters: 'Provide a parameters object.' });
  }
  const parameters = {};
  const errors = {};
  for (const [key, definition] of Object.entries(PARAMETER_DEFS)) {
    const raw = payload.parameters[key];
    if (raw === undefined || raw === null || raw === '') {
      errors[key] = `${definition.label} is required.`;
    } else if (typeof raw === 'boolean' || (typeof raw === 'string' && !raw.trim())) {
      errors[key] = `${definition.label} must be a number.`;
    } else {
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        errors[key] = `${definition.label} must be a finite number.`;
      } else if (value < definition.min || value > definition.max) {
        errors[key] = `Enter a value from ${definition.min} to ${definition.max} ${definition.unit}.`;
      } else {
        parameters[key] = value;
      }
    }
  }
  if (Object.keys(errors).length) {
    throw new ValidationError('Correct the highlighted method parameters.', errors);
  }
  const rawCompound = payload.compound || {};
  if (Array.isArray(rawCompound) || typeof rawCompound !== 'object') {
    throw new ValidationError('Compound must be an object.', { compound: 'Provide a compound object.' });
  }
  const compound = {};
  for (const key of ['name', 'cas_number', 'molecular_formula', 'molecular_weight']) {
    const value = rawCompound[key];
    if (value === null || value === undefined) compound[key] = null;
    else if (typeof value === 'string' && value.trim().length <= 200) compound[key] = value.trim() || null;
    else throw new ValidationError('Compound text fields must be strings of at most 200 characters.', { compound: `Invalid ${key}.` });
  }
  return { mode, route, parameters, compound };
}

function decodeImage(image) {
  if (!image) return null;
  if (!image.filename) {
    throw new ValidationError('The attached image has no filename.', { image: 'Choose a screenshot to upload.' });
  }
  const mimeType = image.mimeType || image.mime_type;
  if (!IMAGE_TYPES.includes(mimeType)) {
    throw new ValidationError('Only PNG, JPEG, and WebP screenshots are supported.', {
      image: 'Choose a PNG, JPEG, or WebP image.',
    });
  }
  let encoded = image.data_base64 || image.dataUrl || image.data_url || '';
  const comma = encoded.indexOf(',');
  if (encoded.startsWith('data:')) {
    if (comma === -1) {
      throw new ValidationError('The attached image data is malformed.', { image: 'Upload a valid image file.' });
    }
    encoded = encoded.slice(comma + 1);
  }
  const buffer = Buffer.from(String(encoded), 'base64');
  if (!buffer.length) {
    throw new ValidationError('The attached image data is empty.', { image: 'Upload a valid image file.' });
  }
  if (buffer.length > 5 * 1024 * 1024) {
    throw new ValidationError('Uploads are limited to 5 MB.', { image: 'Choose an image smaller than 5 MB.' }, 413);
  }
  const valid = mimeType === 'image/png'
    ? buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mimeType === 'image/jpeg'
      ? buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : buffer.length >= 12
        && buffer.subarray(0, 4).toString() === 'RIFF'
        && buffer.subarray(8, 12).toString() === 'WEBP';
  if (!valid) {
    throw new ValidationError('The file content does not match its declared image type.', {
      image: 'Upload a valid image file.',
    });
  }
  return { filename: image.filename, mimeType, bytes: buffer.length };
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
  const pythonNumber = (value) => (Number.isInteger(value) ? value.toFixed(1) : String(value));
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
    retention.forEach((center, peakIndex) => {
      signal += amplitudes[peakIndex] * Math.exp(-0.5 * ((time - center) / widths[peakIndex]) ** 2);
    });
    points.push({ time: round(time), signal: round(Math.max(0, signal)) });
  }
  return { run_time: runTime, points, peaks: retention.map((value) => ({ retention_time: round(value) })) };
}

function simulate(payload, imageAttached = false) {
  const plot = createPlot(payload.parameters, payload.compound);
  const name = payload.compound.name || 'Target analyte';
  const peaks = plot.peaks.map((peak, index) => ({
    ...peak,
    relative_area: [16.4, 64.3, 19.3][index],
    assignment: ['Solvent front', name, 'Related substance'][index],
  }));
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

function analyze(payload, imageAttached = false) {
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
      recognized_parameters: Object.entries(PARAMETER_DEFS).map(([key, definition]) => ({
        key,
        label: definition.label,
        value: payload.parameters[key],
        unit: definition.unit,
        source: 'Combined parameter preview',
      })),
    },
  };
}

module.exports = {
  PARAMETER_DEFS,
  ROUTE_MODULES,
  ValidationError,
  validatePayload,
  decodeImage,
  simulate,
  analyze,
};
