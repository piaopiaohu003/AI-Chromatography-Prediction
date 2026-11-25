import { ChromatogramChart } from "./chart.js";

/* ------------------------------------------------------------------ */
/* state                                                               */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "chromai-state-v2";
const AI_SESSION_KEY = "chromai-ai-key";

const DEFAULT_CONDITIONS = () => ({
  mode: "gradient",
  organic: "ACN",
  percent_b: 50,
  gradient: [
    { time_min: 0, percent_b: 5 },
    { time_min: 20, percent_b: 95 },
    { time_min: 25, percent_b: 95 },
  ],
  flow_ml_min: 1,
  temperature_c: 30,
  ph: 2.5,
  wavelength_nm: 254,
  column: { length_mm: 150, inner_diameter_mm: 4.6, particle_um: 5, porosity: 0.65 },
  dwell_volume_ml: 1,
  injection_volume_ul: 10,
  total_time_min: null,
  noise_mau: 0.15,
});

const COLUMN_PRESETS = [
  {
    id: "c18-250-46-5",
    name: "高分离 C18",
    group: "常规分析柱",
    column: { length_mm: 250, inner_diameter_mm: 4.6, particle_um: 5, porosity: 0.65 },
    flow_ml_min: 1,
    dwell_volume_ml: 1,
  },
  {
    id: "c18-150-46-5",
    name: "常规 C18",
    group: "常规分析柱",
    column: { length_mm: 150, inner_diameter_mm: 4.6, particle_um: 5, porosity: 0.65 },
    flow_ml_min: 1,
    dwell_volume_ml: 1,
  },
  {
    id: "c18-150-46-35",
    name: "中效 C18",
    group: "常规分析柱",
    column: { length_mm: 150, inner_diameter_mm: 4.6, particle_um: 3.5, porosity: 0.65 },
    flow_ml_min: 1,
    dwell_volume_ml: 0.9,
  },
  {
    id: "c18-100-46-5",
    name: "快速 C18",
    group: "常规分析柱",
    column: { length_mm: 100, inner_diameter_mm: 4.6, particle_um: 5, porosity: 0.65 },
    flow_ml_min: 1,
    dwell_volume_ml: 0.8,
  },
  {
    id: "c18-100-46-35",
    name: "快速高效 C18",
    group: "常规分析柱",
    column: { length_mm: 100, inner_diameter_mm: 4.6, particle_um: 3.5, porosity: 0.65 },
    flow_ml_min: 1,
    dwell_volume_ml: 0.8,
  },
  {
    id: "c18-50-46-5",
    name: "超快速 C18",
    group: "常规分析柱",
    column: { length_mm: 50, inner_diameter_mm: 4.6, particle_um: 5, porosity: 0.65 },
    flow_ml_min: 1,
    dwell_volume_ml: 0.7,
  },
  {
    id: "c18-150-30-3",
    name: "窄径 C18",
    group: "窄径柱",
    column: { length_mm: 150, inner_diameter_mm: 3, particle_um: 3, porosity: 0.65 },
    flow_ml_min: 0.5,
    dwell_volume_ml: 0.5,
  },
  {
    id: "c18-100-30-27",
    name: "快速窄径 C18",
    group: "窄径柱",
    column: { length_mm: 100, inner_diameter_mm: 3, particle_um: 2.7, porosity: 0.65 },
    flow_ml_min: 0.5,
    dwell_volume_ml: 0.4,
  },
  {
    id: "c18-150-21-3",
    name: "窄径 C18",
    group: "窄径柱",
    column: { length_mm: 150, inner_diameter_mm: 2.1, particle_um: 3, porosity: 0.65 },
    flow_ml_min: 0.3,
    dwell_volume_ml: 0.5,
  },
  {
    id: "c18-100-21-18",
    name: "UHPLC C18",
    group: "UHPLC 柱",
    column: { length_mm: 100, inner_diameter_mm: 2.1, particle_um: 1.8, porosity: 0.65 },
    flow_ml_min: 0.3,
    dwell_volume_ml: 0.4,
  },
  {
    id: "c18-50-21-17",
    name: "超快速 UHPLC",
    group: "UHPLC 柱",
    column: { length_mm: 50, inner_diameter_mm: 2.1, particle_um: 1.7, porosity: 0.65 },
    flow_ml_min: 0.3,
    dwell_volume_ml: 0.3,
  },
  {
    id: "c18-30-21-18",
    name: "极速 UHPLC",
    group: "UHPLC 柱",
    column: { length_mm: 30, inner_diameter_mm: 2.1, particle_um: 1.8, porosity: 0.65 },
    flow_ml_min: 0.4,
    dwell_volume_ml: 0.2,
  },
  {
    id: "c18-100-10-17",
    name: "微径 UHPLC",
    group: "微径柱",
    column: { length_mm: 100, inner_diameter_mm: 1, particle_um: 1.7, porosity: 0.65 },
    flow_ml_min: 0.08,
    dwell_volume_ml: 0.2,
  },
  {
    id: "c18-150-10-3",
    name: "微径 C18",
    group: "微径柱",
    column: { length_mm: 150, inner_diameter_mm: 1, particle_um: 3, porosity: 0.65 },
    flow_ml_min: 0.05,
    dwell_volume_ml: 0.3,
  },
];

const DEFAULT_IDS = ["benzoic-acid", "acetaminophen", "caffeine", "ibuprofen"];

const state = {
  library: [],
  categories: [],
  compounds: [],
  conditions: DEFAULT_CONDITIONS(),
  result: null,
  simBusy: false,
  tab: "sim",
  aiConfig: { base_url: "", model: "", api_key: "" },
  aiConstraints: { detector: "UV", organic: "auto", mode: "auto", max_run_min: 40 },
  aiStatus: { configured: false },
  aiResult: null,
  aiBusy: false,
  librarySelection: new Set(),
  libraryCategory: "全部",
  librarySearch: "",
  onlineLibrary: [],
};

const charts = { sim: null, ai: null };
let simTimer = null;
let simAbort = null;
let libraryTimer = null;
let libraryAbort = null;
let librarySeq = 0;
let lastAiError = "";

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));

const fmt = (value, digits = 2) =>
  value === null || value === undefined || Number.isNaN(Number(value))
    ? "—"
    : Number(value).toFixed(digits);

function toast(message, type = "") {
  const stack = $("#toasts");
  const node = document.createElement("div");
  node.className = `toast ${type}`.trim();
  node.textContent = message;
  stack.appendChild(node);
  setTimeout(() => {
    node.style.opacity = "0";
    node.style.transform = "translateX(10px)";
    node.style.transition = "all .2s ease";
    setTimeout(() => node.remove(), 220);
  }, 4200);
}

async function postJSON(path, body, signal) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch (_) { /* ignore */ }
    throw new Error(detail || `请求失败（HTTP ${res.status}）`);
  }
  return res.json();
}

function setPath(object, path, value) {
  const parts = path.split(".");
  let cursor = object;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (cursor[parts[i]] === undefined || cursor[parts[i]] === null) cursor[parts[i]] = {};
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

function deepMerge(base, patch) {
  if (Array.isArray(base) || typeof base !== "object" || base === null) {
    return patch === undefined ? base : patch;
  }
  const output = { ...base };
  if (patch && typeof patch === "object") {
    Object.keys(patch).forEach((key) => {
      output[key] = deepMerge(base[key], patch[key]);
    });
  }
  return output;
}

/* ------------------------------------------------------------------ */
/* persistence                                                         */
/* ------------------------------------------------------------------ */

function persist() {
  const payload = {
    compounds: state.compounds,
    conditions: state.conditions,
    tab: state.tab,
    aiConstraints: state.aiConstraints,
    aiConfig: { ...state.aiConfig, api_key: "" },
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (_) { /* storage may be unavailable */ }
}

function restore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (raw) {
      state.conditions = deepMerge(DEFAULT_CONDITIONS(), raw.conditions || {});
      if (!Array.isArray(state.conditions.gradient) || state.conditions.gradient.length < 2) {
        state.conditions.gradient = DEFAULT_CONDITIONS().gradient;
      }
      state.tab = raw.tab === "ai" ? "ai" : "sim";
      state.aiConstraints = {
        detector: "UV", organic: "auto", mode: "auto", max_run_min: 40,
        ...(raw.aiConstraints || {}),
      };
      state.aiConfig = { base_url: "", model: "", api_key: "", ...(raw.aiConfig || {}) };
      if (Array.isArray(raw.compounds)) {
        state.compounds = raw.compounds.filter((c) => c && c.id && c.name && typeof c.log_p === "number");
      }
    }
    const sessionKey = sessionStorage.getItem(AI_SESSION_KEY);
    if (sessionKey) state.aiConfig.api_key = sessionKey;
  } catch (_) { /* ignore corrupt storage */ }
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", init);

async function init() {
  restore();
  bindTabs();
  bindModals();
  bindSimControls();
  bindAIControls();
  bindSettings();
  bindLibrary();
  bindExport();

  charts.sim = new ChromatogramChart($("#chrom"), $("#sim-chart-wrap"), $("#sim-chart-tip"));

  try {
    const res = await fetch("/api/compounds");
    const data = await res.json();
    state.library = data.compounds || [];
    state.categories = data.categories || [];
  } catch (err) {
    toast(`组分库加载失败：${err.message}`, "err");
  }

  if (!state.compounds.length) {
    state.compounds = DEFAULT_IDS
      .map((id) => state.library.find((c) => c.id === id))
      .filter(Boolean)
      .map((c) => ({ ...c, concentration_mg_l: 100 }));
    if (!state.compounds.length) {
      state.compounds = state.library.slice(0, 4).map((c) => ({ ...c, concentration_mg_l: 100 }));
    }
  }

  syncControls();
  renderCompoundList();
  renderAIView();
  setTab(state.tab, false);
  refreshAIStatus();

  if (state.compounds.length) scheduleSim(30);
  else renderEmptySimulation();
}

/* ------------------------------------------------------------------ */
/* tabs & modals                                                       */
/* ------------------------------------------------------------------ */

function bindTabs() {
  $("#main-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if (!button) return;
    setTab(button.dataset.view);
  });
}

function setTab(tab, save = true) {
  state.tab = tab;
  $$("#main-tabs .tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === tab);
  });
  $("#view-sim").classList.toggle("hidden", tab !== "sim");
  $("#view-ai").classList.toggle("hidden", tab !== "ai");
  if (tab === "sim" && charts.sim) {
    requestAnimationFrame(() => charts.sim.draw());
  }
  if (tab === "ai") {
    renderAIView();
  }
  if (save) persist();
}

function bindModals() {
  $$("[data-close]").forEach((element) => {
    element.addEventListener("click", () => {
      const modal = $(`#modal-${element.dataset.close}`);
      if (modal) modal.classList.add("hidden");
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      $$(".modal:not(.hidden)").forEach((modal) => modal.classList.add("hidden"));
    }
  });
}

/* ------------------------------------------------------------------ */
/* simulation controls                                                 */
/* ------------------------------------------------------------------ */

const OUTPUT_MAP = {
  flow_ml_min: { id: "flow-out", format: (v) => `${Number(v).toFixed(2)} mL/min` },
  temperature_c: { id: "temperature-out", format: (v) => `${Math.round(v)} °C` },
  ph: { id: "ph-out", format: (v) => Number(v).toFixed(1) },
  wavelength_nm: { id: "wavelength-out", format: (v) => `${Math.round(v)} nm` },
};

function bindSimControls() {
  renderColumnOptions();
  $("#compound-list").addEventListener("input", (event) => {
    const input = event.target.closest("[data-conc]");
    if (!input) return;
    const compound = state.compounds.find((c) => c.id === input.dataset.conc);
    if (!compound) return;
    const value = parseFloat(input.value);
    compound.concentration_mg_l = Number.isFinite(value) ? Math.max(0.01, value) : 100;
    persist();
    scheduleSim();
  });
  $("#compound-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    removeCompound(button.dataset.remove);
  });

  $("#btn-reset-conditions").addEventListener("click", () => {
    state.conditions = DEFAULT_CONDITIONS();
    syncControls();
    persist();
    scheduleSim(0);
    toast("已恢复默认色谱条件", "ok");
  });

  bindSegment("#seg-mode", () => state.conditions.mode, (value) => {
    state.conditions.mode = value;
    syncModeVisibility();
    persist();
    scheduleSim();
  });
  bindSegment("#seg-organic", () => state.conditions.organic, (value) => {
    state.conditions.organic = value;
    persist();
    scheduleSim();
  });

  $("#iso-slider").addEventListener("input", (event) => {
    state.conditions.percent_b = parseFloat(event.target.value);
    $("#iso-out").textContent = `${Math.round(state.conditions.percent_b)}%`;
    persist();
    scheduleSim();
  });

  $$("input[data-key]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.key;
      const value = parseFloat(input.value);
      if (!Number.isFinite(value)) return;
      state.conditions[key] = value;
      updateOutputs();
      persist();
      scheduleSim();
    });
  });

  $$("input[data-path]").forEach((input) => {
    input.addEventListener("change", () => {
      const path = input.dataset.path;
      if (path === "total_time_min") {
        const value = parseFloat(input.value);
        setPath(state.conditions, path, Number.isFinite(value) && value > 0 ? value : null);
      } else {
        const value = parseFloat(input.value);
        if (!Number.isFinite(value)) return;
        setPath(state.conditions, path, value);
      }
      persist();
      if (path.startsWith("column.")) syncColumnSelector();
      scheduleSim();
    });
  });

  $("#column-preset").addEventListener("change", (event) => {
    applyColumnPreset(event.target.value);
  });

  $("#btn-add-grad").addEventListener("click", () => {
    const points = state.conditions.gradient;
    const last = points[points.length - 1] || { time_min: 0, percent_b: 5 };
    points.push({ time_min: Math.round((last.time_min + 5) * 10) / 10, percent_b: last.percent_b });
    renderGradient();
    persist();
    scheduleSim();
  });

  $("#gradient-list").addEventListener("input", (event) => {
    const input = event.target.closest("[data-grad-field]");
    if (!input) return;
    const row = input.closest("[data-grad-index]");
    const index = Number(row.dataset.gradIndex);
    const value = parseFloat(input.value);
    if (!Number.isFinite(value)) return;
    state.conditions.gradient[index][input.dataset.gradField] = value;
    persist();
    scheduleSim();
  });

  $("#gradient-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-grad]");
    if (!button) return;
    if (state.conditions.gradient.length <= 2) {
      toast("梯度程序至少保留两个点", "err");
      return;
    }
    const index = Number(button.closest("[data-grad-index]").dataset.gradIndex);
    state.conditions.gradient.splice(index, 1);
    renderGradient();
    persist();
    scheduleSim();
  });

  $$("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset));
  });
}

function bindSegment(selector, getValue, onChange) {
  const root = $(selector);
  if (!root) return;
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    onChange(button.dataset.value);
    syncSegment(selector, getValue());
  });
}

function syncSegment(selector, value) {
  $$(`${selector} button`).forEach((button) => {
    button.classList.toggle("active", button.dataset.value === value);
  });
}

function syncControls() {
  const conditions = state.conditions;
  syncSegment("#seg-mode", conditions.mode);
  syncSegment("#seg-organic", conditions.organic);
  lightSyncSegment("#seg-detector", state.aiConstraints.detector);
  lightSyncSegment("#seg-ai-organic", state.aiConstraints.organic);
  lightSyncSegment("#seg-ai-mode", state.aiConstraints.mode);

  const isoSlider = $("#iso-slider");
  isoSlider.value = String(conditions.percent_b);
  $("#iso-out").textContent = `${Math.round(conditions.percent_b)}%`;

  $$("input[data-key]").forEach((input) => {
    const key = input.dataset.key;
    if (conditions[key] !== undefined && conditions[key] !== null) {
      input.value = String(conditions[key]);
    }
  });

  $$("input[data-path]").forEach((input) => {
    const path = input.dataset.path;
    const value = path.split(".").reduce((acc, part) => (acc == null ? acc : acc[part]), conditions);
    input.value = value === null || value === undefined ? "" : String(value);
  });

  syncColumnSelector();

  const maxRun = $("#max-run");
  maxRun.value = String(state.aiConstraints.max_run_min);
  $("#max-run-out").textContent = `${Math.round(state.aiConstraints.max_run_min)} min`;

  syncModeVisibility();
  renderGradient();
  updateOutputs();
}

function lightSyncSegment(selector, value) {
  $$(`${selector} button`).forEach((button) => {
    button.classList.toggle("active", button.dataset.value === value);
  });
}

function renderColumnOptions() {
  const select = $("#column-preset");
  if (!select) return;
  const groups = new Map();
  COLUMN_PRESETS.forEach((preset) => {
    if (!groups.has(preset.group)) groups.set(preset.group, []);
    groups.get(preset.group).push(preset);
  });
  const options = Array.from(groups.entries()).map(([group, presets]) => {
    const items = presets.map((preset) =>
      `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.name)} · ${preset.column.length_mm} × ${preset.column.inner_diameter_mm} mm, ${preset.column.particle_um} µm</option>`
    ).join("");
    return `<optgroup label="${escapeHtml(group)}">${items}</optgroup>`;
  }).join("");
  select.innerHTML = `${options}<option value="custom">自定义尺寸</option>`;
}

function matchColumnPreset(column) {
  const matched = COLUMN_PRESETS.find((preset) =>
    ["length_mm", "inner_diameter_mm", "particle_um", "porosity"].every(
      (key) => Math.abs(Number(column[key]) - Number(preset.column[key])) < 1e-6,
    ));
  return matched ? matched.id : "custom";
}

function syncColumnSelector() {
  const select = $("#column-preset");
  if (!select) return;
  const presetId = matchColumnPreset(state.conditions.column);
  const preset = COLUMN_PRESETS.find((item) => item.id === presetId);
  const column = state.conditions.column;
  select.value = presetId;
  const summary = $("#column-summary");
  if (summary) {
    summary.textContent = `${preset ? preset.name : "自定义"} · ${column.length_mm} × ${column.inner_diameter_mm} mm · ${column.particle_um} µm`;
  }
}

function applyColumnPreset(presetId) {
  const select = $("#column-preset");
  if (!presetId || presetId === "custom") {
    const details = $(".advanced");
    if (details) details.open = true;
    if (select) select.value = "custom";
    const column = state.conditions.column;
    const summary = $("#column-summary");
    if (summary) {
      summary.textContent = `自定义 · ${column.length_mm} × ${column.inner_diameter_mm} mm · ${column.particle_um} µm`;
    }
    return;
  }
  const preset = COLUMN_PRESETS.find((item) => item.id === presetId);
  if (!preset) return;
  state.conditions.column = { ...state.conditions.column, ...preset.column };
  state.conditions.flow_ml_min = preset.flow_ml_min;
  state.conditions.dwell_volume_ml = preset.dwell_volume_ml;
  syncControls();
  persist();
  scheduleSim(0);
  toast(`已切换为${preset.name}（${preset.column.length_mm} × ${preset.column.inner_diameter_mm} mm，${preset.column.particle_um} µm）`, "ok");
}

function syncModeVisibility() {
  const isGradient = state.conditions.mode === "gradient";
  $("#grad-field").classList.toggle("hidden", !isGradient);
  $("#iso-field").classList.toggle("hidden", isGradient);
  $$("[data-preset]").forEach((button) => button.classList.remove("active"));
}

function updateOutputs() {
  Object.entries(OUTPUT_MAP).forEach(([key, meta]) => {
    const node = $(`#${meta.id}`);
    if (node && state.conditions[key] !== undefined) {
      node.textContent = meta.format(state.conditions[key]);
    }
  });
}

function applyPreset(name) {
  const conditions = state.conditions;
  if (name === "screen") {
    Object.assign(conditions, {
      mode: "gradient",
      organic: "ACN",
      gradient: [
        { time_min: 0, percent_b: 5 },
        { time_min: 20, percent_b: 95 },
        { time_min: 25, percent_b: 95 },
      ],
      flow_ml_min: 1,
      temperature_c: 30,
      ph: 2.5,
      wavelength_nm: 254,
      total_time_min: null,
    });
  } else if (name === "iso50") {
    Object.assign(conditions, { mode: "isocratic", percent_b: 50, organic: "ACN", total_time_min: null });
  } else if (name === "polar") {
    Object.assign(conditions, {
      mode: "gradient",
      organic: "ACN",
      gradient: [
        { time_min: 0, percent_b: 2 },
        { time_min: 15, percent_b: 60 },
        { time_min: 19, percent_b: 60 },
      ],
      ph: 2.5,
      wavelength_nm: 210,
      flow_ml_min: 1,
      total_time_min: null,
    });
  } else if (name === "hydrophobic") {
    Object.assign(conditions, {
      mode: "gradient",
      organic: "ACN",
      gradient: [
        { time_min: 0, percent_b: 40 },
        { time_min: 20, percent_b: 100 },
        { time_min: 24, percent_b: 100 },
      ],
      ph: 2.5,
      wavelength_nm: 254,
      flow_ml_min: 1,
      total_time_min: null,
    });
  }
  syncControls();
  persist();
  scheduleSim(0);
  const button = $(`[data-preset="${name}"]`);
  if (button) button.classList.add("active");
}

function renderGradient() {
  const wrap = $("#gradient-list");
  if (!wrap) return;
  const rows = state.conditions.gradient.map((point, index) => `
    <div class="grad-row" data-grad-index="${index}">
      <span class="idx">${String(index + 1).padStart(2, "0")}</span>
      <input type="number" step="0.1" min="0" max="300" value="${point.time_min}" data-grad-field="time_min" aria-label="时间">
      <input type="number" step="0.1" min="0" max="100" value="${point.percent_b}" data-grad-field="percent_b" aria-label="有机相比例">
      <button class="remove-btn" data-remove-grad title="删除该梯度点" aria-label="删除">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
  `).join("");
  wrap.innerHTML = `
    <div class="grad-units"><span>#</span><span>时间 (min)</span><span>%B</span><span></span></div>
    ${rows}
  `;
}

/* ------------------------------------------------------------------ */
/* compound list                                                       */
/* ------------------------------------------------------------------ */

function compoundMeta(compound) {
  const parts = [`logP ${fmt(compound.log_p, 1)}`];
  if (compound.pka != null) parts.push(`pKa ${fmt(compound.pka, 1)}`);
  if (compound.lambda_max_nm) parts.push(`λ${Math.round(compound.lambda_max_nm)}`);
  return parts.join(" · ");
}

function renderCompoundList() {
  const wrap = $("#compound-list");
  if (!wrap) return;
  $("#compound-count").textContent = String(state.compounds.length);
  if (!state.compounds.length) {
    wrap.innerHTML = `<div class="empty-state">尚未添加组分<br>点击右上角「添加」从化合物库中选择</div>`;
    return;
  }
  wrap.innerHTML = state.compounds.map((compound) => `
    <div class="compound-item">
      <div>
        <span class="compound-name">${escapeHtml(compound.name)}</span>
        <span class="compound-meta">${escapeHtml(compoundMeta(compound))}</span>
      </div>
      <input class="conc-input" type="number" min="0.01" step="1" value="${Math.round(compound.concentration_mg_l)}"
             data-conc="${escapeHtml(compound.id)}" title="浓度 mg/L" aria-label="浓度">
      <button class="remove-btn" data-remove="${escapeHtml(compound.id)}" title="移除">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13"/>
        </svg>
      </button>
    </div>
  `).join("");
}

function removeCompound(id) {
  state.compounds = state.compounds.filter((c) => c.id !== id);
  renderCompoundList();
  renderAIView();
  persist();
  if (state.compounds.length) scheduleSim(0);
  else renderEmptySimulation();
}

function onCompoundsChanged() {
  renderCompoundList();
  renderAIView();
  persist();
  if (state.compounds.length) scheduleSim(0);
  else renderEmptySimulation();
}

/* ------------------------------------------------------------------ */
/* simulation                                                          */
/* ------------------------------------------------------------------ */

function scheduleSim(delay = 150) {
  clearTimeout(simTimer);
  simTimer = setTimeout(runSimulation, delay);
}

async function runSimulation() {
  if (!state.compounds.length) {
    renderEmptySimulation();
    return;
  }
  if (simAbort) simAbort.abort();
  const controller = new AbortController();
  simAbort = controller;
  state.simBusy = true;
  $("#chart-sub").textContent = "正在调用保留模型计算…";
  try {
    const result = await postJSON(
      "/api/simulate",
      { compounds: state.compounds, conditions: state.conditions },
      controller.signal,
    );
    if (simAbort !== controller) return;
    state.result = result;
    charts.sim.setResult(result);
    $("#sim-chart-empty").classList.add("hidden");
    renderPeakTable(result);
    renderWarnings(result.warnings);
    renderMetrics(result);
    $("#peak-count").textContent = String(result.peaks.length);
    const gradient = state.conditions.mode === "gradient";
    $("#chart-sub").textContent =
      `${result.peaks.length} 个组分 · ${gradient ? "梯度" : "等度"} · `
      + `${state.conditions.organic} · λ ${Math.round(state.conditions.wavelength_nm)} nm · `
      + `pH ${Number(state.conditions.ph).toFixed(1)} · 运行 ${fmt(result.metrics.run_time_min, 1)} min`;
  } catch (err) {
    if (err.name === "AbortError") return;
    $("#chart-sub").textContent = "计算失败，请检查输入参数";
    toast(err.message, "err");
  } finally {
    if (simAbort === controller) {
      simAbort = null;
      state.simBusy = false;
    }
  }
}

function renderEmptySimulation() {
  state.result = null;
  charts.sim.clear();
  $("#sim-chart-empty").classList.remove("hidden");
  $("#chart-sub").textContent = "请添加样品组分以生成色谱图";
  $("#peak-table-body").innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:22px">暂无数据</td></tr>`;
  $("#peak-count").textContent = "0";
  $("#metric-chips").innerHTML = "";
  $("#warnings").innerHTML = warningItem("添加组分并设置条件后，系统会在这里给出分离度与风险提示。", "ok");
}

function renderPeakTable(result) {
  const body = $("#peak-table-body");
  if (!result.peaks || !result.peaks.length) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:22px">暂无峰</td></tr>`;
    return;
  }
  body.innerHTML = result.peaks.map((peak, index) => {
    const rs = peak.resolution_prev;
    let rsClass = "";
    if (rs != null) rsClass = rs >= 1.5 ? "rs-good" : rs >= 1.0 ? "rs-warn" : "rs-bad";
    const tr = peak.tr_min == null ? "未洗脱" : fmt(peak.tr_min, 2);
    const name = escapeHtml(peak.name) + (peak.visible ? "" : `<span style="color:var(--muted);font-size:10px"> · 无响应</span>`);
    return `
      <tr class="${peak.visible ? "" : "invisible"}">
        <td>${index + 1}</td>
        <td class="truncate" title="${escapeHtml(peak.name)}">${name}</td>
        <td>${tr}</td>
        <td>${peak.k == null ? "—" : fmt(peak.k, 2)}</td>
        <td>${fmt(peak.height_mau, 1)}</td>
        <td>${peak.width_min == null ? "—" : fmt(peak.width_min, 2)}</td>
        <td>${peak.plates ?? "—"}</td>
        <td class="${rsClass}">${rs == null ? "—" : fmt(rs, 2)}</td>
      </tr>
    `;
  }).join("");
}

function renderMetrics(result) {
  const metrics = result.metrics;
  const minRs = metrics.min_resolution;
  const rsClass = minRs == null ? "" : minRs >= 1.5 ? "good" : minRs >= 1.0 ? "warn" : "bad";
  const pressure = metrics.pressure_bar;
  const pressureLimit = state.conditions.column.particle_um <= 2.5 ? 1000 : 400;
  const pressureClass = pressure == null ? "" : pressure > pressureLimit ? "bad" : pressure > pressureLimit * 0.85 ? "warn" : "";
  $("#metric-chips").innerHTML = `
    <span class="chip">死时间 <b>${fmt(metrics.t0_min, 2)} min</b></span>
    <span class="chip">塔板数 <b>${metrics.plates ?? "—"}</b></span>
    <span class="chip ${pressureClass}">柱压 <b>${pressure == null ? "—" : `${Math.round(pressure)} bar`}</b></span>
    <span class="chip ${rsClass}">最小 Rs <b>${minRs == null ? "—" : fmt(minRs, 2)}</b></span>
  `;
}

function warningItem(text, kind = "") {
  const icon = kind === "ok"
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4M12 17h.01"/><path d="M10.3 4.2l-8 14A1.8 1.8 0 0 0 3.9 21h16.2a1.8 1.8 0 0 0 1.6-2.8l-8-14a1.8 1.8 0 0 0-3.4 0z"/></svg>`;
  return `<div class="warning-item ${kind === "ok" ? "ok" : ""}">${icon}<span>${escapeHtml(text)}</span></div>`;
}

function renderWarnings(warnings) {
  const unique = [...new Set(warnings || [])];
  const wrap = $("#warnings");
  if (!unique.length) {
    wrap.innerHTML = warningItem("当前条件下未发现明显风险：峰形、分离度与柱压均在模型建议范围内。", "ok");
    return;
  }
  wrap.innerHTML = unique.map((text) => warningItem(text)).join("");
}

/* ------------------------------------------------------------------ */
/* AI view                                                             */
/* ------------------------------------------------------------------ */

function bindAIControls() {
  $("#btn-ai-manage").addEventListener("click", openLibrary);
  bindSegment("#seg-detector", () => state.aiConstraints.detector, (value) => {
    state.aiConstraints.detector = value;
    persist();
    refreshAIStatus();
  });
  bindSegment("#seg-ai-organic", () => state.aiConstraints.organic, (value) => {
    state.aiConstraints.organic = value;
    persist();
  });
  bindSegment("#seg-ai-mode", () => state.aiConstraints.mode, (value) => {
    state.aiConstraints.mode = value;
    persist();
  });
  $("#max-run").addEventListener("input", (event) => {
    state.aiConstraints.max_run_min = parseFloat(event.target.value);
    $("#max-run-out").textContent = `${Math.round(state.aiConstraints.max_run_min)} min`;
    persist();
  });
  $("#btn-recommend").addEventListener("click", generateRecommendation);
}

function renderAIView() {
  const chips = $("#ai-compound-chips");
  $("#ai-count").textContent = String(state.compounds.length);
  if (!chips) return;
  if (!state.compounds.length) {
    chips.innerHTML = `<div class="empty-state" style="grid-column:1/-1">尚未选择组分<br>请先添加待分析化合物</div>`;
  } else {
    chips.innerHTML = state.compounds.map((compound) => `
      <span class="ai-chip">
        <b>${escapeHtml(compound.name)}</b>
        <span>${Math.round(compound.concentration_mg_l)} mg/L</span>
      </span>
    `).join("");
  }
  lightSyncSegment("#seg-detector", state.aiConstraints.detector);
  lightSyncSegment("#seg-ai-organic", state.aiConstraints.organic);
  lightSyncSegment("#seg-ai-mode", state.aiConstraints.mode);
  $("#max-run").value = String(state.aiConstraints.max_run_min);
  $("#max-run-out").textContent = `${Math.round(state.aiConstraints.max_run_min)} min`;
  updateAIModeLabel();
}

function updateAIModeLabel() {
  const configured = state.aiStatus && state.aiStatus.configured;
  const badge = $("#ai-badge");
  if (badge) {
    badge.classList.toggle("on", !!configured);
    badge.innerHTML = `<i></i>${configured ? "AI 已配置" : "规则引擎"}`;
  }
  const label = $("#ai-mode-label");
  const desc = $("#ai-mode-desc");
  if (label && desc) {
    if (configured) {
      label.textContent = state.aiStatus.model || "大模型";
      desc.textContent = "已连接 OpenAI 兼容接口，将结合规则约束生成方法";
    } else {
      label.textContent = "本地规则专家系统";
      desc.textContent = "未配置 API Key，基于 logP / pKa / λmax 与 LSS 模型设计条件";
    }
  }
}

async function refreshAIStatus() {
  try {
    const status = await postJSON("/api/ai/status", state.aiConfig);
    state.aiStatus = status;
  } catch (_) {
    state.aiStatus = { configured: false };
  }
  updateAIModeLabel();
}

async function generateRecommendation() {
  if (state.aiBusy) return;
  if (!state.compounds.length) {
    toast("请先添加待分析的组分", "err");
    return;
  }
  state.aiBusy = true;
  lastAiError = "";
  const button = $("#btn-recommend");
  button.disabled = true;
  button.innerHTML = `<span class="spin"></span> 正在设计条件…`;
  $("#ai-results").innerHTML = `
    <section class="card">
      <div class="loading-shimmer"></div>
      <div class="loading-shimmer" style="margin-top:12px;height:90px"></div>
      <p class="hint" style="margin-top:12px">正在检索保留模型并评估分离度，请稍候…</p>
    </section>
  `;

  try {
    const payload = {
      compounds: state.compounds,
      constraints: state.aiConstraints,
      ai: state.aiConfig,
    };
    const result = await postJSON("/api/recommend", payload);
    state.aiResult = result;
    renderAIResult(result);
    refreshAIStatus();
  } catch (err) {
    lastAiError = err.message;
    $("#ai-results").innerHTML = `
      <section class="card ai-placeholder">
        <div class="placeholder-graphic" style="opacity:.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="82" height="82"><path d="M12 9v4M12 17h.01"/><path d="M10.3 4.2l-8 14A1.8 1.8 0 0 0 3.9 21h16.2a1.8 1.8 0 0 0 1.6-2.8l-8-14a1.8 1.8 0 0 0-3.4 0z"/></svg>
        </div>
        <h3>条件生成失败</h3>
        <p>${escapeHtml(err.message)}</p>
        <button class="ghost-btn" style="margin-top:16px" onclick="document.getElementById('btn-recommend').click()">重试</button>
      </section>
    `;
    toast(err.message, "err");
  } finally {
    state.aiBusy = false;
    button.disabled = false;
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7L12 3z"/></svg> 生成科学的色谱条件`;
  }
}

function renderAIResult(result) {
  if (charts.ai && charts.ai.destroy) charts.ai.destroy();
  const method = result.method || {};
  const metrics = result.result.metrics;
  const conditions = result.conditions;
  const isLlm = result.source === "llm";
  const gradientRows = Array.isArray(method.gradient) && conditions.mode === "gradient"
    ? method.gradient.map((point) => `<tr><td>${fmt(point.time_min, 1)}</td><td>${fmt(point.percent_b, 1)}</td></tr>`).join("")
    : "";
  const gradientBlock = conditions.mode === "gradient"
    ? `<div class="table-wrap" style="max-width:340px">
        <table class="peak-table">
          <thead><tr><th>时间 (min)</th><th>%B</th></tr></thead>
          <tbody>${gradientRows}</tbody>
        </table>
      </div>`
    : `<p class="hint">等度洗脱：${fmt(method.isocratic_percent, 1)}% B</p>`;

  const orderChips = (result.expected_order || []).map((item, index) =>
    `<span class="chip">${index + 1}. ${escapeHtml(item.name)} <b>${fmt(item.tr_min, 2)} min</b></span>`
  ).join("");

  const warningList = [...new Set(result.result.warnings || [])];
  const risksHtml = warningList.length
    ? warningList.map((text) => warningItem(text)).join("")
    : warningItem("未发现明显风险。", "ok");

  const errorHtml = result.llm_error
    ? `<div class="llm-error">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>
        <span>${escapeHtml(result.llm_error)}</span>
      </div>`
    : "";

  $("#ai-results").innerHTML = `
    <section class="card">
      <div class="ai-result-head">
        <div>
          <h2>${escapeHtml(method.name || "推荐色谱方法")}</h2>
          <p>${isLlm ? `大模型 ${escapeHtml(result.ai_model || "")} 设计，已通过物理模型复核` : "本地规则专家系统设计，已通过物理模型复核"}</p>
        </div>
        <span class="source-badge ${isLlm ? "" : "rule"}">${isLlm ? "AI 生成" : "规则生成"}</span>
      </div>
      ${errorHtml}
      <div class="method-grid">
        <div class="method-cell"><span>色谱柱</span><b class="mono">${escapeHtml(method.column_label || "—")}</b></div>
        <div class="method-cell"><span>洗脱方式</span><b>${conditions.mode === "gradient" ? "梯度洗脱" : "等度洗脱"}</b></div>
        <div class="method-cell"><span>流动相 A</span><b>${escapeHtml(method.eluent_a || "—")}</b></div>
        <div class="method-cell"><span>流动相 B</span><b>${escapeHtml(method.eluent_b || "—")}</b></div>
        <div class="method-cell"><span>pH</span><b class="mono">${fmt(conditions.ph, 1)}</b></div>
        <div class="method-cell"><span>流速</span><b class="mono">${fmt(conditions.flow_ml_min, 2)} mL/min</b></div>
        <div class="method-cell"><span>柱温</span><b class="mono">${fmt(conditions.temperature_c, 0)} °C</b></div>
        <div class="method-cell"><span>检测波长</span><b class="mono">${fmt(conditions.wavelength_nm, 0)} nm</b></div>
        <div class="method-cell"><span>进样量</span><b class="mono">${fmt(conditions.injection_volume_ul, 1)} µL</b></div>
        <div class="method-cell"><span>运行时间</span><b class="mono">${fmt(metrics.run_time_min, 1)} min</b></div>
      </div>

      <div class="section-title">梯度程序</div>
      ${gradientBlock}

      <div class="section-title">设计依据</div>
      <ul class="bullet-list">
        ${(result.rationale || []).map((text) => `<li>${escapeHtml(text)}</li>`).join("") || "<li>—</li>"}
      </ul>

      <div class="section-title">风险与验证建议</div>
      <div class="warning-list">${risksHtml}</div>

      <div class="section-title">预计出峰顺序</div>
      <div class="chips" style="justify-content:flex-start">${orderChips || '<span class="chip">—</span>'}</div>

      <div class="section-title">预测色谱图</div>
      <div class="chart-wrap result-chart" id="ai-chart-wrap">
        <canvas id="ai-chrom"></canvas>
        <div class="chart-tip hidden" id="ai-chart-tip"></div>
      </div>
      <div class="chips" style="justify-content:flex-start;margin-top:8px">
        <span class="chip">理论塔板数 <b>${metrics.plates ?? "—"}</b></span>
        <span class="chip">柱压 <b>${metrics.pressure_bar == null ? "—" : `${Math.round(metrics.pressure_bar)} bar`}</b></span>
        <span class="chip ${metrics.min_resolution == null ? "" : metrics.min_resolution >= 1.5 ? "good" : "bad"}">最小 Rs <b>${metrics.min_resolution == null ? "—" : fmt(metrics.min_resolution, 2)}</b></span>
        <span class="chip">检出峰 <b>${metrics.num_peaks}</b></span>
      </div>

      <div class="ai-actions">
        <button class="primary-btn" id="btn-apply-ai">应用到模拟台继续优化</button>
        <button class="ghost-btn" id="btn-export-ai">导出峰表 CSV</button>
      </div>
    </section>
  `;

  const wrap = $("#ai-chart-wrap");
  const canvas = $("#ai-chrom");
  const tip = $("#ai-chart-tip");
  charts.ai = new ChromatogramChart(canvas, wrap, tip);
  charts.ai.setResult(result.result);

  $("#btn-apply-ai").addEventListener("click", () => applyAIResult(result));
  $("#btn-export-ai").addEventListener("click", () => exportPeaks(result.result, "ai-method-peaks"));
}

function applyAIResult(result) {
  state.conditions = JSON.parse(JSON.stringify(result.conditions));
  if (!state.conditions.column) state.conditions.column = DEFAULT_CONDITIONS().column;
  if (!Array.isArray(state.conditions.gradient) || state.conditions.gradient.length < 2) {
    state.conditions.gradient = DEFAULT_CONDITIONS().gradient;
  }
  if (state.conditions.total_time_min === undefined) state.conditions.total_time_min = null;
  syncControls();
  persist();
  setTab("sim");
  scheduleSim(0);
  toast("已载入推荐条件，可在模拟台微调", "ok");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

function bindSettings() {
  $("#btn-settings").addEventListener("click", openSettings);
  $("#btn-ai-save").addEventListener("click", () => {
    state.aiConfig = {
      base_url: $("#ai-base").value.trim(),
      model: $("#ai-model").value.trim(),
      api_key: $("#ai-key").value.trim(),
    };
    if (state.aiConfig.api_key) sessionStorage.setItem(AI_SESSION_KEY, state.aiConfig.api_key);
    else sessionStorage.removeItem(AI_SESSION_KEY);
    persist();
    $("#modal-settings").classList.add("hidden");
    refreshAIStatus();
    toast("AI 接口配置已保存", "ok");
  });
  $("#btn-ai-clear").addEventListener("click", () => {
    state.aiConfig = { base_url: "", model: "", api_key: "" };
    $("#ai-base").value = "";
    $("#ai-model").value = "";
    $("#ai-key").value = "";
    sessionStorage.removeItem(AI_SESSION_KEY);
    persist();
    setSettingsStatus("已清除配置，将使用本地规则专家系统", "");
    refreshAIStatus();
  });
  $("#btn-ai-test").addEventListener("click", async () => {
    const config = {
      base_url: $("#ai-base").value.trim(),
      model: $("#ai-model").value.trim(),
      api_key: $("#ai-key").value.trim(),
    };
    if (!config.api_key) {
      setSettingsStatus("请先填写 API Key", "err");
      return;
    }
    setSettingsStatus("正在测试连接…", "");
    try {
      const res = await postJSON("/api/ai/test", config);
      setSettingsStatus(`连接成功 · ${res.latency_ms} ms · 模型回复「${res.message || "OK"}」`, "ok");
    } catch (err) {
      setSettingsStatus(err.message, "err");
    }
  });
}

function openSettings() {
  $("#ai-base").value = state.aiConfig.base_url || "";
  $("#ai-model").value = state.aiConfig.model || "";
  $("#ai-key").value = state.aiConfig.api_key || "";
  setSettingsStatus(state.aiConfig.api_key ? "当前已配置 API Key" : "未配置 API Key，使用本地规则专家系统", "");
  $("#modal-settings").classList.remove("hidden");
}

function setSettingsStatus(text, kind) {
  const node = $("#settings-status");
  node.textContent = text;
  node.className = `settings-status ${kind}`.trim();
}

/* ------------------------------------------------------------------ */
/* compound library                                                    */
/* ------------------------------------------------------------------ */

function bindLibrary() {
  $("#btn-add-compound").addEventListener("click", openLibrary);
  $("#library-search").addEventListener("input", (event) => {
    const query = event.target.value.trim();
    state.librarySearch = query.toLowerCase();
    renderLibrary();
    scheduleLibrarySearch(query);
  });
  $("#library-categories").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-category]");
    if (!button) return;
    state.libraryCategory = button.dataset.category;
    renderLibrary();
    renderCategoryChips();
  });
  $("#library-grid").addEventListener("click", (event) => {
    const item = event.target.closest("[data-library-id]");
    if (!item || item.classList.contains("added")) return;
    const id = item.dataset.libraryId;
    if (state.librarySelection.has(id)) state.librarySelection.delete(id);
    else state.librarySelection.add(id);
    renderLibrary();
  });
  $("#btn-apply-library").addEventListener("click", () => {
    if (!state.librarySelection.size) {
      toast("请选择至少一个组分", "err");
      return;
    }
    let added = 0;
    let estimated = 0;
    state.librarySelection.forEach((id) => {
      if (state.compounds.some((c) => c.id === id)) return;
      const item = state.library.find((c) => c.id === id)
        || state.onlineLibrary.find((c) => c.id === id);
      if (item) {
        state.compounds.push({ ...item, concentration_mg_l: 100 });
        added += 1;
        if (item.estimated) estimated += 1;
      }
    });
    state.librarySelection.clear();
    $("#modal-library").classList.add("hidden");
    onCompoundsChanged();
    toast(
      estimated
        ? `已添加 ${added} 个组分，其中 ${estimated} 个在线参数为估算值`
        : `已添加 ${added} 个组分`,
      "ok",
    );
  });
  $("#btn-add-custom").addEventListener("click", addCustomCompound);
}

function openLibrary() {
  state.librarySelection.clear();
  state.libraryCategory = "全部";
  state.librarySearch = "";
  state.onlineLibrary = [];
  clearTimeout(libraryTimer);
  if (libraryAbort) libraryAbort.abort();
  $("#library-search").value = "";
  setLibraryStatus("");
  renderCategoryChips();
  renderLibrary();
  $("#modal-library").classList.remove("hidden");
}

function setLibraryStatus(text, kind = "") {
  const node = $("#library-status");
  if (!node) return;
  node.textContent = text;
  node.className = `library-status ${kind}`.trim();
}

function scheduleLibrarySearch(query) {
  clearTimeout(libraryTimer);
  if (libraryAbort) libraryAbort.abort();
  if (query.length < 2) {
    state.onlineLibrary = [];
    setLibraryStatus("");
    renderLibrary();
    return;
  }
  setLibraryStatus("正在检索在线化合物库…");
  libraryTimer = setTimeout(() => runLibrarySearch(query), 350);
}

async function runLibrarySearch(query) {
  const seq = ++librarySeq;
  libraryAbort = new AbortController();
  try {
    const res = await fetch(
      `/api/compounds/search?q=${encodeURIComponent(query)}&limit=6`,
      { signal: libraryAbort.signal },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (seq !== librarySeq) return;
    state.onlineLibrary = data.online || [];
    renderLibrary();
    if (data.online_error) {
      setLibraryStatus(`在线数据库暂不可用：${data.online_error}`, "warn");
    } else if (state.onlineLibrary.length) {
      setLibraryStatus(`在线补充 ${state.onlineLibrary.length} 个化合物，参数带“估算”标记`);
    } else {
      setLibraryStatus("没有更多在线结果");
    }
  } catch (err) {
    if (err.name === "AbortError") return;
    if (seq === librarySeq) setLibraryStatus(`在线搜索失败：${err.message}`, "warn");
  }
}

function renderCategoryChips() {
  const categories = ["全部", ...state.categories];
  $("#library-categories").innerHTML = categories.map((category) => `
    <button class="chip-btn ${state.libraryCategory === category ? "active" : ""}" data-category="${escapeHtml(category)}">
      ${escapeHtml(category)}
    </button>
  `).join("");
}

function renderLibrary() {
  const grid = $("#library-grid");
  const filtered = state.library.concat(state.onlineLibrary).filter((item) => {
    if (state.libraryCategory !== "全部" && item.category !== state.libraryCategory) return false;
    if (!state.librarySearch) return true;
    return `${item.name} ${item.name_en || ""} ${item.id} ${item.category || ""}`
      .toLowerCase()
      .includes(state.librarySearch);
  });
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">没有匹配的化合物</div>`;
  } else {
    grid.innerHTML = filtered.map((item) => {
      const added = state.compounds.some((c) => c.id === item.id);
      const selected = state.librarySelection.has(item.id);
      const online = item.source === "pubchem";
      return `
        <div class="library-item ${selected ? "selected" : ""} ${added ? "added" : ""}" data-library-id="${escapeHtml(item.id)}">
          <span class="cat-tag ${online ? "online" : ""}">${escapeHtml(online ? "PubChem" : item.category || "")}</span>
          <h4>${escapeHtml(item.name)}</h4>
          <div class="en">${escapeHtml(item.name_en || "")}${added ? " · 已添加" : ""}</div>
          <div class="props">
            <span>logP ${fmt(item.log_p, 1)}</span>
            ${item.pka != null ? `<span>pKa ${fmt(item.pka, 1)}</span>` : ""}
            <span>λ${Math.round(item.lambda_max_nm)}</span>
          </div>
          ${online ? `<div class="estimate-note">pKa/λ 为估算值</div>` : ""}
        </div>
      `;
    }).join("");
  }
  $("#library-selected-note").textContent = `已选择 ${state.librarySelection.size} 个`;
  $("#btn-apply-library").disabled = state.librarySelection.size === 0;
}

function addCustomCompound() {
  const name = $("#custom-name").value.trim();
  const logP = parseFloat($("#custom-logp").value);
  const type = $("#custom-type").value;
  const pkaRaw = $("#custom-pka").value.trim();
  const pka = pkaRaw === "" ? null : parseFloat(pkaRaw);
  const lambda = parseFloat($("#custom-lambda").value) || 254;
  const conc = parseFloat($("#custom-conc").value) || 100;

  if (!name) {
    toast("请填写化合物名称", "err");
    return;
  }
  if (!Number.isFinite(logP)) {
    toast("请填写有效的 logP", "err");
    return;
  }
  if (type !== "neutral" && !Number.isFinite(pka)) {
    toast("酸性/碱性化合物请填写 pKa", "err");
    return;
  }
  const id = `custom-${Date.now()}`;
  state.compounds.push({
    id,
    name,
    name_en: "",
    category: "自定义",
    log_p: logP,
    pka: Number.isFinite(pka) ? pka : null,
    acid_base: type,
    lambda_max_nm: lambda,
    concentration_mg_l: conc,
    log_kw: null,
    s_value: null,
    epsilon_max: 1,
  });
  $("#custom-name").value = "";
  $("#modal-library").classList.add("hidden");
  onCompoundsChanged();
  toast(`已添加自定义组分「${name}」`, "ok");
}

/* ------------------------------------------------------------------ */
/* export                                                              */
/* ------------------------------------------------------------------ */

function bindExport() {
  $("#btn-export-sim").addEventListener("click", () => {
    if (state.result) exportPeaks(state.result, "chromai-peaks");
  });
}

function exportPeaks(result, prefix) {
  if (!result || !result.peaks || !result.peaks.length) {
    toast("暂无可导出的峰数据", "err");
    return;
  }
  const header = ["name", "tr_min", "k", "height_mau", "width_min", "plates", "resolution_prev"];
  const rows = result.peaks.map((peak) => [
    `"${String(peak.name).replace(/"/g, '""')}"`,
    peak.tr_min ?? "",
    peak.k ?? "",
    peak.height_mau ?? "",
    peak.width_min ?? "",
    peak.plates ?? "",
    peak.resolution_prev ?? "",
  ].join(","));
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  link.href = URL.createObjectURL(blob);
  link.download = `${prefix}-${stamp}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast("峰表已导出", "ok");
}
