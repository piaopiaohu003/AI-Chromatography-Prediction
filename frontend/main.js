import './style.css';

const DEFAULT_PARAMETERS = Object.freeze({
  flow_rate: 1.0,
  temperature: 40,
  injection_volume: 10,
  detection_wavelength: 254,
  run_time: 30,
  gradient: 20,
});

const PARAMETER_DEFS = [
  { key: 'flow_rate', label: 'Flow rate', unit: 'mL/min', min: 0.05, max: 5, step: 0.05 },
  { key: 'temperature', label: 'Column temperature', unit: '°C', min: 4, max: 100, step: 1 },
  { key: 'injection_volume', label: 'Injection volume', unit: 'µL', min: 0.1, max: 100, step: 0.1 },
  { key: 'detection_wavelength', label: 'Detection wavelength', unit: 'nm', min: 190, max: 800, step: 1 },
  { key: 'run_time', label: 'Run time', unit: 'min', min: 1, max: 180, step: 1 },
  { key: 'gradient', label: 'Initial organic phase', unit: '%', min: 0, max: 100, step: 1 },
];

const MODULES = [
  { name: 'Interface Definition', description: 'Choose the instrument interface route used for detection.', view: 'detector', kind: 'route' },
  { name: 'Gradient Setting', description: 'Set the starting organic-phase proportion for the gradient.', parameter: 'gradient' },
  { name: 'Analytical Method', description: 'Select the separation mode for this predictive method.', kind: 'select', key: 'method', options: ['Reverse phase HPLC', 'Normal phase HPLC', 'Ion exchange'] },
  { name: 'Interface Detector', description: 'Upload an interface screenshot and simulate component recognition.', view: 'detector', kind: 'detector' },
  { name: 'System Suitability', description: 'Choose the suitability target used to contextualize the prediction.', kind: 'select', key: 'suitability', options: ['Standard resolution', 'High resolution', 'Rapid screening'] },
  { name: 'pH Value', description: 'Record the aqueous mobile-phase pH for this method.', kind: 'number', key: 'ph', min: 0, max: 14, step: 0.1, unit: 'pH' },
  { name: 'Buffer Solution', description: 'Select the buffer recorded with the aqueous mobile phase.', kind: 'select', key: 'buffer', options: ['Phosphate', 'Acetate', 'Formate', 'None'] },
  { name: 'Ionic Strength', description: 'Record the buffer ionic strength in millimolar units.', kind: 'number', key: 'ionic_strength', min: 0, max: 500, step: 1, unit: 'mM' },
  { name: 'Concentration', description: 'Record the nominal sample concentration.', kind: 'number', key: 'concentration', min: 0.001, max: 1000, step: 0.1, unit: 'mg/mL' },
  { name: 'Detector Settings', description: 'Set the UV-Vis detection wavelength.', parameter: 'detection_wavelength' },
  { name: 'Flow Rate', description: 'Set the mobile-phase flow through the column.', parameter: 'flow_rate' },
  { name: 'Solvent Ratio', description: 'Set the initial organic-phase percentage.', parameter: 'gradient' },
  { name: 'Parameter Setting', description: 'Preview and edit all six required method parameters.', view: 'parameters', kind: 'parameters' },
  { name: 'Wavelength Optimization', description: 'Adjust the wavelength and regenerate the simulated response.', parameter: 'detection_wavelength' },
  { name: 'Flow Rate Optimization', description: 'Adjust flow rate to inspect its predicted retention effect.', parameter: 'flow_rate' },
  { name: 'Column Temperature', description: 'Set the column thermostat temperature.', parameter: 'temperature' },
  { name: 'Experiment', description: 'Set the total acquisition time for the simulated experiment.', parameter: 'run_time' },
  { name: 'Simulate', description: 'Generate a synthetic chromatogram from the active method.', kind: 'simulate' },
];

const ROUTE_MODULES = {
  combined: ['Inlet & solvent delivery', 'UV-Vis detector', 'Column thermostat', 'Injection system'],
  inlet: ['Solvent channels', 'Gradient mixer', 'Flow controller'],
  uv_vis: ['UV-Vis detector', 'Wavelength control', 'Signal monitor'],
  temperature: ['Column thermostat', 'Temperature controller'],
  column: ['Column parameters', 'Injection system', 'Acquisition runtime'],
};

const state = {
  parameters: { ...DEFAULT_PARAMETERS },
  extras: { method: 'Reverse phase HPLC', suitability: 'Standard resolution', ph: 3, buffer: 'Phosphate', ionic_strength: 25, concentration: 1 },
  activeModule: 18,
  mode: 'simulate',
  route: 'combined',
  result: null,
  compounds: null,
  file: null,
  busy: false,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const svgIcon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const parameterDef = (key) => PARAMETER_DEFS.find((item) => item.key === key);
const formatNumber = (value, digits = 2) => Number(value).toFixed(digits);
let toastTimer;
let searchController;
let detectionController;

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3400);
}

function setViewStatus(label, type = 'ready') {
  const status = $('#view-status');
  status.className = `view-status ${type === 'ready' ? '' : type}`.trim();
  status.innerHTML = '<i></i>';
  status.append(document.createTextNode(` ${label}`));
}

async function apiRequest(url, options = {}, timeout = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: options.signal || controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error?.message || `Request failed with status ${response.status}.`);
      error.code = data.error?.code || 'request_failed';
      error.fields = data.error?.fields || {};
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError' && options.signal?.aborted) {
      throw error;
    }
    if (error.name === 'AbortError') {
      const timeoutError = new Error('The request timed out. Check the service and try again.');
      timeoutError.code = 'timeout';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function renderModules() {
  const list = $('#module-list');
  list.replaceChildren();
  MODULES.forEach((module, index) => {
    const id = index + 1;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `module-item${state.activeModule === id ? ' active' : ''}${state.result ? ' configured' : ''}`;
    button.dataset.module = String(id);
    button.setAttribute('aria-current', state.activeModule === id ? 'step' : 'false');
    button.innerHTML = `<span class="module-number">${String(id).padStart(2, '0')}</span><span>${module.name}</span>${svgIcon('check')}`;
    button.querySelector('.icon').classList.add('module-check');
    button.addEventListener('click', () => selectModule(id));
    list.append(button);
  });
}

function selectModule(id) {
  state.activeModule = id;
  const module = MODULES[id - 1];
  if (module.view) setView(module.view);
  else setView('simulation');
  renderModules();
  renderModuleConfig();
}

function renderModuleConfig() {
  const id = state.activeModule;
  const module = MODULES[id - 1];
  $('#config-step').textContent = `${String(id).padStart(2, '0')} / 18`;
  $('#config-title').textContent = module.name;
  $('#config-description').textContent = module.description;
  const form = $('#module-config-form');
  form.replaceChildren();

  if (module.kind === 'simulate') {
    const summary = document.createElement('div');
    summary.className = 'config-summary';
    summary.innerHTML = `<span>Flow<strong>${state.parameters.flow_rate} mL/min</strong></span><span>Runtime<strong>${state.parameters.run_time} min</strong></span><span>UV<strong>${state.parameters.detection_wavelength} nm</strong></span><span>Column<strong>${state.parameters.temperature} °C</strong></span>`;
    form.append(summary);
  } else if (module.parameter) {
    form.append(createConfigInput(module.parameter, true));
  } else if (module.kind === 'route') {
    form.append(createSelect('route', 'Interface route', ['combined', 'inlet', 'uv_vis', 'temperature', 'column'], state.route));
  } else if (module.kind === 'select') {
    form.append(createSelect(module.key, 'Configuration', module.options, state.extras[module.key]));
  } else if (module.kind === 'number') {
    form.append(createExtraNumber(module));
  } else if (module.kind === 'detector') {
    const note = document.createElement('p');
    note.className = 'empty-copy';
    note.textContent = `${ROUTE_MODULES[state.route].length} modules available on the ${state.route.replace('_', '-')} route.`;
    form.append(note);
  } else if (module.kind === 'parameters') {
    const note = document.createElement('p');
    note.className = 'empty-copy';
    note.textContent = 'Combined preview contains all six required fields.';
    form.append(note);
  }

  const action = document.createElement('button');
  action.type = 'submit';
  action.className = `button ${module.kind === 'simulate' ? 'button-primary' : 'button-secondary'}`;
  action.innerHTML = module.kind === 'simulate' ? `${svgIcon('play')}Run simulation` : module.kind === 'detector' || module.kind === 'parameters' ? 'Open module' : 'Apply configuration';
  form.append(action);
}

function createConfigInput(key, includeLabel = false) {
  const def = parameterDef(key);
  const wrapper = document.createElement('div');
  wrapper.className = 'config-field';
  const inputId = `config-${key}`;
  if (includeLabel) {
    const label = document.createElement('label');
    label.htmlFor = inputId;
    label.textContent = `${def.label} (${def.unit})`;
    wrapper.append(label);
  }
  const input = document.createElement('input');
  Object.assign(input, { id: inputId, name: key, type: 'number', value: state.parameters[key], min: def.min, max: def.max, step: def.step, required: true });
  wrapper.append(input);
  return wrapper;
}

function createSelect(key, labelText, options, selected) {
  const wrapper = document.createElement('div');
  wrapper.className = 'config-field';
  const label = document.createElement('label');
  label.htmlFor = `config-${key}`;
  label.textContent = labelText;
  const select = document.createElement('select');
  select.id = `config-${key}`;
  select.name = key;
  options.forEach((option) => select.add(new Option(option.replaceAll('_', ' '), option, false, option === selected)));
  wrapper.append(label, select);
  return wrapper;
}

function createExtraNumber(module) {
  const wrapper = document.createElement('div');
  wrapper.className = 'config-field';
  const label = document.createElement('label');
  label.htmlFor = `config-${module.key}`;
  label.textContent = `Value (${module.unit})`;
  const input = document.createElement('input');
  Object.assign(input, { id: `config-${module.key}`, name: module.key, type: 'number', value: state.extras[module.key], min: module.min, max: module.max, step: module.step, required: true });
  wrapper.append(label, input);
  return wrapper;
}

function setView(view) {
  $$('.view-panel').forEach((panel) => { panel.hidden = panel.id !== `${view}-view`; });
  $$('.view-tabs [data-view]').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
}

function setMode(mode, run = true) {
  state.mode = mode;
  $$('.segmented-control [data-mode]').forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#run-button span').textContent = mode === 'simulate' ? 'Run simulation' : 'Analyze interface';
  if (run) runDetection();
}

function setBusy(busy, label = '') {
  state.busy = busy;
  ['#run-button', '#detect-button', '#apply-parameters'].forEach((selector) => { $(selector).disabled = busy; });
  $('#result-loading').hidden = !busy || state.mode !== 'simulate';
  setViewStatus(busy ? label : 'Ready', busy ? 'busy' : 'ready');
}

function renderCombinedParams() {
  const container = $('#combined-params');
  container.replaceChildren();
  PARAMETER_DEFS.forEach((def) => {
    const row = document.createElement('div');
    row.className = 'combined-param';
    const label = document.createElement('span');
    label.textContent = def.label;
    const value = document.createElement('strong');
    value.textContent = `${state.parameters[def.key]} ${def.unit}`;
    row.append(label, value);
    container.append(row);
  });
  renderParameterJson();
}

function renderParameterJson() {
  $('#parameter-json').textContent = JSON.stringify({ mode: 'simulate', route: state.route, parameters: readParameterForm(false) }, null, 2);
}

function buildParameterForm() {
  const form = $('#parameters-form');
  PARAMETER_DEFS.forEach((def) => {
    const field = document.createElement('div');
    field.className = 'parameter-field';
    field.dataset.field = def.key;
    const label = document.createElement('label');
    label.htmlFor = `parameter-${def.key}`;
    label.textContent = def.label;
    const inputWrap = document.createElement('div');
    inputWrap.className = 'parameter-input-wrap';
    const input = document.createElement('input');
    Object.assign(input, { id: `parameter-${def.key}`, name: def.key, type: 'number', value: state.parameters[def.key], min: def.min, max: def.max, step: def.step, required: true });
    input.setAttribute('aria-describedby', `hint-${def.key} error-${def.key}`);
    input.addEventListener('input', () => {
      clearFieldError(def.key);
      renderParameterJson();
    });
    input.addEventListener('blur', () => validateParameterField(def, input));
    const unit = document.createElement('span');
    unit.textContent = def.unit;
    inputWrap.append(input, unit);
    const hint = document.createElement('small');
    hint.id = `hint-${def.key}`;
    hint.textContent = `Allowed range: ${def.min}–${def.max} ${def.unit}`;
    const error = document.createElement('small');
    error.id = `error-${def.key}`;
    error.className = 'field-error';
    field.append(label, inputWrap, hint, error);
    form.append(field);
  });
}

function readParameterForm(useFallback = true) {
  const values = {};
  PARAMETER_DEFS.forEach((def) => {
    const input = $(`#parameter-${def.key}`);
    const raw = input?.value ?? state.parameters[def.key];
    const number = Number(raw);
    values[def.key] = Number.isFinite(number) ? number : (useFallback ? raw : state.parameters[def.key]);
  });
  return values;
}

function validateParameterField(def, input) {
  const value = Number(input.value);
  if (input.value === '' || !Number.isFinite(value) || value < def.min || value > def.max) {
    setFieldError(def.key, `Enter a value from ${def.min} to ${def.max} ${def.unit}.`);
    return false;
  }
  clearFieldError(def.key);
  return true;
}

function setFieldError(key, message) {
  const field = $(`.parameter-field[data-field="${key}"]`);
  if (!field) return;
  field.classList.add('invalid');
  const error = $(`#error-${key}`);
  error.textContent = message;
  $(`#parameter-${key}`).setAttribute('aria-invalid', 'true');
}

function clearFieldError(key) {
  const field = $(`.parameter-field[data-field="${key}"]`);
  if (!field) return;
  field.classList.remove('invalid');
  $(`#error-${key}`).textContent = '';
  $(`#parameter-${key}`).removeAttribute('aria-invalid');
}

function clearAllFieldErrors() {
  PARAMETER_DEFS.forEach((def) => clearFieldError(def.key));
}

async function runDetection(override = {}) {
  if (state.busy) return;
  const parameters = override.parameters || state.parameters;
  const mode = override.mode || state.mode;
  const useFile = override.useFile !== false && state.file;
  setBusy(true, mode === 'simulate' ? 'Computing' : 'Detecting');
  $('#result-error').hidden = true;
  detectionController?.abort();
  detectionController = new AbortController();

  const payload = {
    mode,
    route: state.route,
    parameters,
    compound: state.compounds?.selected ? {
      name: state.compounds.selected.name,
      cas_number: state.compounds.selected.cas_number,
      molecular_formula: state.compounds.selected.molecular_formula,
      molecular_weight: state.compounds.selected.molecular_weight,
    } : { name: $('#compound-query').value.trim() || null },
  };

  let body;
  let headers;
  if (useFile) {
    body = new FormData();
    body.append('payload', JSON.stringify(payload));
    body.append('image', state.file, state.file.name);
  } else {
    body = JSON.stringify(payload);
    headers = { 'Content-Type': 'application/json' };
  }

  try {
    const result = await apiRequest('/api/interface/detect', { method: 'POST', headers, body, signal: detectionController.signal }, 15000);
    state.result = result;
    state.mode = result.mode;
    if (result.mode === 'simulate') {
      setView('simulation');
    }
    renderResult(result);
    renderDetectedModules(result.detection);
    setViewStatus(result.mode === 'simulate' ? 'Simulation complete' : 'Detection complete');
    return result;
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (error.fields && Object.keys(error.fields).length) {
      Object.entries(error.fields).forEach(([key, message]) => setFieldError(key, message));
      $('#parameter-form-status').textContent = 'The backend rejected one or more parameters. Correct the highlighted fields.';
      $('#parameter-form-status').classList.add('error');
      setView('parameters');
    }
    $('#result-error').textContent = error.message;
    $('#result-error').hidden = false;
    setViewStatus('Request failed', 'error');
    showToast(error.message);
    throw error;
  } finally {
    setBusy(false);
  }
}

function renderResult(result) {
  setMode(result.mode, false);
  const isSimulation = result.mode === 'simulate';
  $('#result-eyebrow').textContent = isSimulation ? 'SIMULATED OUTPUT' : 'SIMULATED INTERFACE ANALYSIS';
  $('#result-title').childNodes[0].textContent = isSimulation ? 'UV chromatogram ' : 'Mapped instrument modules ';
  $('#result-title span').textContent = isSimulation ? `${state.parameters.detection_wavelength} nm` : result.detection.route.replace('_', '-');
  $('#chromatogram').hidden = !isSimulation;
  $('#analysis-canvas').hidden = isSimulation;
  $('#chart-legend').hidden = !isSimulation;
  $('#chart-axis-label').hidden = !isSimulation;
  $('.peak-table-wrap').hidden = !isSimulation;

  if (isSimulation) {
    renderChart(result.plot);
    renderMetrics([
      ['Retention time', formatNumber(result.results.retention_time), 'min'],
      ['Resolution', formatNumber(result.results.resolution), 'Rs'],
      ['Detected peaks', result.results.peak_count, 'peaks'],
      ['Tailing factor', formatNumber(result.results.tailing_factor), 'Tf'],
    ]);
    renderPeaks(result.results.peaks);
  } else {
    renderAnalysis(result);
    renderMetrics([
      ['Confidence', formatNumber(result.results.confidence * 100, 1), '%'],
      ['Modules mapped', result.results.modules_detected, 'modules'],
      ['Interface quality', result.results.interface_quality, ''],
      ['Image input', result.detection.image_attached ? 'Attached' : 'None', ''],
    ]);
  }
  renderModules();
}

function renderMetrics(metrics) {
  $$('.metric').forEach((metric, index) => {
    const [label, value, unit] = metrics[index];
    $('span', metric).textContent = label;
    $('strong', metric).textContent = value;
    $('small', metric).textContent = unit;
  });
}

function renderChart(plot) {
  const svg = $('#chromatogram');
  svg.replaceChildren();
  const ns = 'http://www.w3.org/2000/svg';
  const make = (tag, attributes = {}, text = '') => {
    const node = document.createElementNS(ns, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    if (text) node.textContent = text;
    return node;
  };
  const left = 42, right = 758, top = 18, bottom = 262;
  const width = right - left, height = bottom - top;
  const points = plot.points;
  const maxTime = plot.run_time;
  const maxSignal = Math.max(...points.map((point) => point.signal), 1) * 1.12;
  const x = (time) => left + (time / maxTime) * width;
  const y = (signal) => bottom - (signal / maxSignal) * height;

  for (let index = 0; index <= 5; index += 1) {
    const gy = top + (height / 5) * index;
    svg.append(make('line', { x1: left, x2: right, y1: gy, y2: gy, class: 'chart-grid' }));
    const value = maxSignal * (1 - index / 5);
    svg.append(make('text', { x: left - 8, y: gy + 3, 'text-anchor': 'end', class: 'chart-axis-text' }, value.toFixed(0)));
  }
  for (let index = 0; index <= 6; index += 1) {
    const time = (maxTime / 6) * index;
    const gx = x(time);
    svg.append(make('line', { x1: gx, x2: gx, y1: top, y2: bottom, class: 'chart-grid' }));
    svg.append(make('text', { x: gx, y: bottom + 22, 'text-anchor': 'middle', class: 'chart-axis-text' }, time.toFixed(0)));
  }

  const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(point.time).toFixed(2)},${y(point.signal).toFixed(2)}`).join(' ');
  const area = `${path} L${right},${bottom} L${left},${bottom} Z`;
  svg.append(make('path', { d: area, class: 'chart-area' }));
  svg.append(make('path', { d: path, class: 'chart-signal' }));

  plot.peaks.forEach((peak, index) => {
    const px = x(peak.retention_time);
    const point = points.reduce((closest, item) => Math.abs(item.time - peak.retention_time) < Math.abs(closest.time - peak.retention_time) ? item : closest, points[0]);
    const py = y(point.signal);
    svg.append(make('line', { x1: px, x2: px, y1: py - 8, y2: bottom, class: 'peak-line' }));
    svg.append(make('circle', { cx: px, cy: py, r: 3, fill: 'var(--accent)' }));
    svg.append(make('text', { x: px, y: Math.max(12, py - 10), 'text-anchor': 'middle', class: 'peak-label' }, `P${index + 1}`));
  });
}

function renderPeaks(peaks) {
  const body = $('#peak-table-body');
  body.replaceChildren();
  peaks.forEach((peak, index) => {
    const row = document.createElement('tr');
    [ `P${index + 1}`, `${formatNumber(peak.retention_time)} min`, `${formatNumber(peak.relative_area, 1)} %`, peak.assignment ].forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
}

function renderAnalysis(result) {
  const canvas = $('#analysis-canvas');
  canvas.replaceChildren();
  result.detection.modules.forEach((module, index) => {
    const row = document.createElement('div');
    row.className = 'analysis-row';
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = module.name;
    const subtitle = document.createElement('small');
    subtitle.textContent = module.parameters.join(' · ') || 'Interface region recognized';
    copy.append(title, subtitle);
    const confidence = document.createElement('b');
    confidence.textContent = `${formatNumber(module.confidence * 100, 0)}%`;
    row.append(number, copy, confidence);
    canvas.append(row);
  });
}

function renderDetectedModules(detection) {
  const container = $('#detected-modules');
  container.replaceChildren();
  detection.modules.forEach((module) => {
    const row = document.createElement('div');
    row.className = 'detected-module';
    row.innerHTML = svgIcon('check');
    const name = document.createElement('span');
    name.textContent = module.name;
    const confidence = document.createElement('b');
    confidence.textContent = `${formatNumber(module.confidence * 100, 0)}%`;
    row.append(name, confidence);
    container.append(row);
  });
}

function setSourceStatus(status) {
  const badge = $('#source-badge');
  badge.className = `source-badge ${status === 'live' ? 'live' : status === 'error' ? 'error' : ''}`.trim();
  $('span', badge).textContent = status === 'live' ? 'LIVE SOURCE' : status === 'error' ? 'UNAVAILABLE' : 'CONNECTING';
}

function emptyNode(message, className = 'empty-copy') {
  const node = document.createElement('p');
  node.className = className;
  node.textContent = message;
  return node;
}

async function searchCompounds({ query, cbNumber = null, initial = false }) {
  const q = (query ?? $('#compound-query').value).trim();
  if (!q) {
    $('#compound-feedback').textContent = 'Enter a compound name or CAS number to search.';
    $('#compound-feedback').classList.add('error');
    $('#compound-query').focus();
    return;
  }
  searchController?.abort();
  searchController = new AbortController();
  setSourceStatus('loading');
  $('#compound-feedback').classList.remove('error');
  $('#compound-feedback').textContent = initial ? 'Connecting to the live chemical data source…' : `Searching ChemicalBook for “${q}”…`;
  if (initial || !state.compounds) renderCompoundLoading();

  const params = new URLSearchParams({ q });
  if (cbNumber) params.set('cb_number', cbNumber);
  try {
    const data = await apiRequest(`/api/compounds/search?${params}`, { signal: searchController.signal }, 30000);
    state.compounds = data;
    renderCompounds(data);
    if (state.result?.mode === 'simulate') runDetection().catch(() => {});
  } catch (error) {
    if (error.name === 'AbortError') return;
    setSourceStatus('error');
    $('#compound-feedback').textContent = `ChemicalBook unavailable: ${error.message} Simulation remains available.`;
    $('#compound-feedback').classList.add('error');
    renderCompoundFailure();
  }
}

function renderCompoundLoading() {
  $('#compound-results').innerHTML = '<div class="compound-skeleton"></div><div class="compound-skeleton"></div><div class="compound-skeleton"></div>';
  $('#compound-identity').replaceChildren(emptyNode('Loading source record…'));
  $('#compound-properties').innerHTML = '<div class="empty-property"><dt>Properties</dt><dd>Loading published values…</dd></div>';
  $('#compound-summary').textContent = 'Loading chemical property summary…';
  $('#result-count').textContent = '…';
}

function renderCompoundFailure() {
  $('#compound-results').replaceChildren(emptyNode('Live results unavailable. Check the connection and retry the search.'));
  $('#result-count').textContent = '0';
  $('#compound-identity').replaceChildren(emptyNode('No source record available while ChemicalBook is unreachable.'));
  renderProperties([], 'Properties cannot be retrieved while the source is unavailable.');
  $('#compound-summary').textContent = 'No summary available because the live source request failed.';
  $('#compound-source-link').href = 'https://www.chemicalbook.com/';
}

function renderCompounds(data) {
  setSourceStatus('live');
  $('#compound-feedback').classList.remove('error');
  $('#compound-feedback').textContent = data.matches.length ? `Live ChemicalBook records for “${data.query}”.` : `No ChemicalBook records matched “${data.query}”. Try another name or CAS number.`;
  $('#result-count').textContent = String(data.matches.length).padStart(2, '0');
  const list = $('#compound-results');
  list.replaceChildren();

  if (!data.matches.length) {
    list.append(emptyNode(data.notices.matches));
  } else {
    data.matches.forEach((match, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `compound-result${data.selected?.id === match.id ? ' active' : ''}`;
      button.setAttribute('aria-label', `Inspect ${match.name}${match.cas_number ? `, CAS ${match.cas_number}` : ''}`);
      const number = document.createElement('span');
      number.className = 'compound-index';
      number.textContent = String(index + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'compound-result-name';
      name.textContent = match.name;
      const cas = document.createElement('span');
      cas.className = 'compound-result-cas';
      cas.textContent = match.cas_number || 'No CAS';
      button.append(number, name, cas);
      button.addEventListener('click', () => searchCompounds({ query: data.query, cbNumber: match.cb_number }));
      list.append(button);
    });
  }
  renderSelectedCompound(data.selected, data.notices);
}

function renderSelectedCompound(selected, notices) {
  const identity = $('#compound-identity');
  identity.replaceChildren();
  if (!selected) {
    identity.append(emptyNode('No source record selected. Search with a different compound identifier.'));
    renderProperties([], notices?.properties || 'No physical properties to display.');
    $('#compound-summary').textContent = notices?.summary || 'No compound summary to display.';
    $('#compound-source-link').href = 'https://www.chemicalbook.com/';
    return;
  }

  const name = document.createElement('div');
  name.className = 'identity-name';
  name.textContent = selected.name;
  const meta = document.createElement('div');
  meta.className = 'identity-meta';
  [selected.cas_number ? `CAS ${selected.cas_number}` : 'CAS unavailable', selected.cb_number || 'Record ID unavailable'].forEach((value) => {
    const chip = document.createElement('span');
    chip.textContent = value;
    meta.append(chip);
  });
  const source = document.createElement('div');
  source.className = 'identity-source';
  source.innerHTML = '<i></i>';
  source.append(document.createTextNode(selected.source_label || 'ChemicalBook · Search result'));
  identity.append(name, meta, source);
  renderProperties(selected.properties, notices?.properties);
  $('#compound-summary').textContent = selected.summary || notices?.summary || 'No compound summary is published for this record.';
  $('#compound-source-link').href = selected.detail_url || 'https://www.chemicalbook.com/';
}

function renderProperties(properties = [], emptyMessage = 'No physical properties are published for this record.') {
  const list = $('#compound-properties');
  list.replaceChildren();
  if (!properties?.length) {
    const row = document.createElement('div');
    row.className = 'empty-property';
    const label = document.createElement('dt');
    label.textContent = 'Properties';
    const value = document.createElement('dd');
    value.textContent = emptyMessage;
    row.append(label, value);
    list.append(row);
    return;
  }
  properties.forEach((property) => {
    const row = document.createElement('div');
    const label = document.createElement('dt');
    label.textContent = property.label;
    const value = document.createElement('dd');
    value.textContent = property.value;
    row.append(label, value);
    list.append(row);
  });
}

function handleFile(file) {
  if (!file) return;
  const status = $('#file-status');
  status.classList.remove('error');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    status.textContent = 'Unsupported file. Choose a PNG, JPG, or WebP screenshot.';
    status.classList.add('error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    status.textContent = 'The screenshot exceeds 5 MB. Choose a smaller image.';
    status.classList.add('error');
    return;
  }
  state.file = file;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    $('#interface-preview').src = reader.result;
    $('#interface-preview').hidden = false;
    $('#upload-placeholder').hidden = true;
  });
  reader.readAsDataURL(file);
  status.textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB · running simulated detection…`;
  setView('detector');
  state.mode = 'analyze';
  $$('.segmented-control [data-mode]').forEach((button) => {
    const active = button.dataset.mode === 'analyze';
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  runDetection({ mode: 'analyze' }).then(() => {
    status.textContent = `${file.name} · simulated interface detection complete.`;
  }).catch((error) => {
    status.textContent = error.message;
    status.classList.add('error');
  });
}

function exportMethod() {
  const exportData = {
    product: 'ION Chromatography Prediction Workspace',
    simulated: true,
    modules: MODULES.map((module, index) => ({ step: index + 1, name: module.name })),
    active_configuration: { route: state.route, ...state.extras },
    parameters: state.parameters,
    compound: state.compounds?.selected ? {
      name: state.compounds.selected.name,
      cas_number: state.compounds.selected.cas_number,
      source: state.compounds.selected.detail_url,
    } : null,
    last_result: state.result ? { mode: state.result.mode, results: state.result.results } : null,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ion-method-001.json';
  link.click();
  URL.revokeObjectURL(url);
  showToast('Method configuration exported as JSON.');
}

function resetWorkspace() {
  searchController?.abort();
  detectionController?.abort();
  state.parameters = { ...DEFAULT_PARAMETERS };
  state.extras = { method: 'Reverse phase HPLC', suitability: 'Standard resolution', ph: 3, buffer: 'Phosphate', ionic_strength: 25, concentration: 1 };
  state.activeModule = 18;
  state.mode = 'simulate';
  state.route = 'combined';
  state.result = null;
  state.compounds = null;
  state.file = null;
  state.busy = false;
  $('#compound-query').value = 'aspirin';
  $('#interface-file').value = '';
  $('#interface-preview').hidden = true;
  $('#upload-placeholder').hidden = false;
  $('#file-status').textContent = 'No screenshot attached. Detection will use the simulated combined interface.';
  $('#result-error').hidden = true;
  $('input[name="route"][value="combined"]').checked = true;
  PARAMETER_DEFS.forEach((def) => { $(`#parameter-${def.key}`).value = DEFAULT_PARAMETERS[def.key]; });
  clearAllFieldErrors();
  $$('.segmented-control [data-mode]').forEach((button) => {
    const active = button.dataset.mode === 'simulate';
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#run-button span').textContent = 'Run simulation';
  setView('simulation');
  renderModules();
  renderModuleConfig();
  renderCombinedParams();
  searchCompounds({ query: 'aspirin', initial: true });
  runDetection().catch(() => {});
  showToast('Workspace reset to the default method.');
}

$('#module-config-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const module = MODULES[state.activeModule - 1];
  if (module.kind === 'detector' || module.kind === 'parameters') {
    setView(module.view);
    return;
  }
  if (module.kind === 'simulate') {
    state.mode = 'simulate';
    runDetection({ mode: 'simulate' }).catch(() => {});
    return;
  }
  const data = new FormData(event.currentTarget);
  if (module.parameter) {
    const def = parameterDef(module.parameter);
    const value = Number(data.get(module.parameter));
    if (!Number.isFinite(value) || value < def.min || value > def.max) {
      showToast(`${def.label} must be between ${def.min} and ${def.max} ${def.unit}.`);
      return;
    }
    state.parameters[module.parameter] = value;
    $(`#parameter-${module.parameter}`).value = value;
    state.mode = 'simulate';
    renderCombinedParams();
    runDetection({ mode: 'simulate' }).then(() => showToast(`${def.label} applied.`)).catch(() => {});
  } else if (module.kind === 'route') {
    state.route = data.get('route');
    $(`input[name="route"][value="${state.route}"]`).checked = true;
    renderCombinedParams();
    setView('detector');
    showToast('Interface route applied. Run detection to inspect the route.');
  } else {
    state.extras[module.key] = module.kind === 'number' ? Number(data.get(module.key)) : data.get(module.key);
    showToast(`${module.name} configuration applied.`);
  }
});

$('#parameters-form').addEventListener('submit', (event) => {
  event.preventDefault();
  clearAllFieldErrors();
  const valid = PARAMETER_DEFS.map((def) => validateParameterField(def, $(`#parameter-${def.key}`))).every(Boolean);
  if (!valid) {
    $('#parameter-form-status').textContent = 'Correct the highlighted values before applying.';
    $('#parameter-form-status').classList.add('error');
    return;
  }
  const parameters = readParameterForm();
  state.parameters = parameters;
  state.mode = 'simulate';
  $$('.segmented-control [data-mode]').forEach((button) => {
    const active = button.dataset.mode === 'simulate';
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#parameter-form-status').textContent = 'Applying the six validated parameters…';
  $('#parameter-form-status').classList.remove('error');
  renderCombinedParams();
  renderModuleConfig();
  runDetection({ parameters, mode: 'simulate', useFile: false }).then(() => {
    $('#parameter-form-status').textContent = 'Parameters applied and validated by the backend.';
    showToast('Method parameters applied. Simulation updated.');
  }).catch(() => {});
});

$('#defaults-button').addEventListener('click', () => {
  PARAMETER_DEFS.forEach((def) => { $(`#parameter-${def.key}`).value = DEFAULT_PARAMETERS[def.key]; });
  clearAllFieldErrors();
  renderParameterJson();
  $('#parameter-form-status').textContent = 'Default values restored in the preview. Apply to run.';
  $('#parameter-form-status').classList.remove('error');
});

$('#compound-search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  searchCompounds({ query: $('#compound-query').value });
});
$('#run-button').addEventListener('click', () => runDetection({ useFile: state.mode === 'analyze' }).catch(() => {}));
$('#detect-button').addEventListener('click', () => {
  state.mode = 'analyze';
  runDetection({ mode: 'analyze' }).catch(() => {});
});
$$('.segmented-control [data-mode]').forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.mode !== state.mode) setMode(button.dataset.mode);
}));
$$('.view-tabs [data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
$$('[data-open-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.openView)));
$$('input[name="route"]').forEach((input) => input.addEventListener('change', () => {
  state.route = input.value;
  renderCombinedParams();
  renderModuleConfig();
  $('#detected-modules').replaceChildren(emptyNode('Route changed. Run detection to map its modules.'));
}));
$('#interface-file').addEventListener('change', (event) => handleFile(event.target.files[0]));
['dragenter', 'dragover'].forEach((type) => $('#drop-zone').addEventListener(type, (event) => {
  event.preventDefault();
  $('#drop-zone').classList.add('dragging');
}));
['dragleave', 'drop'].forEach((type) => $('#drop-zone').addEventListener(type, (event) => {
  event.preventDefault();
  $('#drop-zone').classList.remove('dragging');
}));
$('#drop-zone').addEventListener('drop', (event) => handleFile(event.dataTransfer.files[0]));
$('#export-button').addEventListener('click', exportMethod);
$('#reset-button').addEventListener('click', resetWorkspace);

renderModules();
renderModuleConfig();
buildParameterForm();
renderCombinedParams();
searchCompounds({ query: 'aspirin', initial: true });
runDetection().catch(() => {});
