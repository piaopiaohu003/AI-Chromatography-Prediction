import { ChromatogramChart } from "./chart.js";

/* ------------------------------------------------------------------ */
/* state                                                               */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "chromai-state-v2";
const AI_SESSION_KEY = "chromai-ai-key";

const DEFAULT_CONDITIONS = () => ({
  phase: "reversed",
  mode: "gradient",
  organic: "ACN",
  organic_label: null,
  aqueous: "auto",
  aqueous_label: null,
  percent_b: 50,
  solvent_c: "none",
  solvent_c_label: null,
  percent_c: 0,
  solvent_d: "none",
  solvent_d_label: null,
  percent_d: 0,
  gradient: [
    { time_min: 0, percent_b: 5 },
    { time_min: 20, percent_b: 95 },
    { time_min: 25, percent_b: 95 },
  ],
  flow_ml_min: 1,
  temperature_c: 30,
  ph: 2.5,
  wavelength_nm: 254,
  detector: "UV",
  bandwidth_nm: 10,
  excitation_nm: 250,
  emission_nm: 400,
  cell_temperature_c: 30,
  drift_tube_c: 60,
  gas_flow_l_min: 1.5,
  gain: 5,
  evaporation_c: 45,
  gas_pressure_psi: 35,
  ionization: "ESI+",
  cone_voltage_v: 30,
  column: {
    length_mm: 150,
    inner_diameter_mm: 4.6,
    particle_um: 5,
    porosity: 0.65,
    chemistry: "c18",
  },
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
  {
    id: "silica-150-46-5",
    name: "标准硅胶",
    group: "正相柱",
    phase: "normal",
    column: {
      length_mm: 150, inner_diameter_mm: 4.6, particle_um: 5, porosity: 0.65, chemistry: "silica",
    },
    flow_ml_min: 1,
    dwell_volume_ml: 1,
  },
  {
    id: "silica-250-46-5",
    name: "高分离硅胶",
    group: "正相柱",
    phase: "normal",
    column: {
      length_mm: 250, inner_diameter_mm: 4.6, particle_um: 5, porosity: 0.65, chemistry: "silica",
    },
    flow_ml_min: 1,
    dwell_volume_ml: 1.2,
  },
  {
    id: "diol-150-46-5",
    name: "二醇柱",
    group: "正相柱",
    phase: "normal",
    column: {
      length_mm: 150, inner_diameter_mm: 4.6, particle_um: 5, porosity: 0.65, chemistry: "diol",
    },
    flow_ml_min: 1,
    dwell_volume_ml: 1,
  },
  {
    id: "amino-150-46-5",
    name: "氨基柱",
    group: "正相柱",
    phase: "normal",
    column: {
      length_mm: 150, inner_diameter_mm: 4.6, particle_um: 5, porosity: 0.65, chemistry: "amino",
    },
    flow_ml_min: 1,
    dwell_volume_ml: 1,
  },
  {
    id: "silica-100-21-3",
    name: "窄径硅胶",
    group: "正相柱",
    phase: "normal",
    column: {
      length_mm: 100, inner_diameter_mm: 2.1, particle_um: 3, porosity: 0.65, chemistry: "silica",
    },
    flow_ml_min: 0.3,
    dwell_volume_ml: 0.4,
  },
  {
    id: "silica-50-21-3",
    name: "快速硅胶",
    group: "正相柱",
    phase: "normal",
    column: {
      length_mm: 50, inner_diameter_mm: 2.1, particle_um: 3, porosity: 0.65, chemistry: "silica",
    },
    flow_ml_min: 0.3,
    dwell_volume_ml: 0.3,
  },
];

const COLUMN_CHEMISTRY_LABELS = {
  // 反相
  c18: "C18（ODS）",
  c8: "C8（Octyl）",
  c4: "C4（Butyl）",
  phenyl: "Phenyl（苯基）",
  cyano: "Cyano（氰基）",
  hilic: "HILIC（亲水作用）",
  amide: "Amide（酰胺）",
  // 正相
  silica: "Silica（硅胶）",
  diol: "Diol（二醇）",
  amino: "Amino（氨基）",
};

const REVERSED_COLUMN_CHEMISTRIES = ["c18", "c8", "c4", "phenyl", "cyano", "hilic", "amide"];
const NORMAL_COLUMN_CHEMISTRIES = ["silica", "diol", "amino"];

function getAllowedChemistries(phase) {
  return phase === "normal" ? NORMAL_COLUMN_CHEMISTRIES : REVERSED_COLUMN_CHEMISTRIES;
}

const DEFAULT_IDS = ["benzoic-acid", "acetaminophen", "caffeine", "ibuprofen"];

const DEFAULT_PREFERENCES = {
  default_phase: "reversed",
  default_organic: "ACN",
  default_detector: "UV",
  default_temperature_c: 30,
};

const state = {
  library: [],
  categories: [],
  compounds: [],
  conditions: DEFAULT_CONDITIONS(),
  result: null,
  simBusy: false,
  tab: "sim",
  aiConfig: { base_url: "", model: "", api_key: "" },
  aiConstraints: { detector: "UV", phase: "auto", organic: "auto", mode: "auto", max_run_min: 40 },
  aiStatus: { configured: false },
  aiResult: null,
  aiBusy: false,
  librarySelection: new Set(),
  libraryCategory: "全部",
  librarySearch: "",
  onlineLibrary: [],
  cbLibrary: [],
  user: null,
  account: {
    preferences: { ...DEFAULT_PREFERENCES },
    favorites: [],
  },
  literature: {
    loaded: false,
    topics: [],
    results: [],
    sources: {},
    query: "",
    sort: "relevance",
    loading: false,
    scanning: null,
    activeTopic: null,
    autoScanStarted: false,
    fromWatch: false,
  },
};

const charts = { sim: null, ai: null };
let simTimer = null;
let simAbort = null;
let libraryTimer = null;
let libraryAbort = null;
let librarySeq = 0;
let libraryCbAbort = null;
let libraryCbSeq = 0;
let libraryLoading = false;
let libraryCbLoading = false;
let libraryCbError = "";
const quickSearch = { query: "", online: [], cb: [], cbError: "", cbLoading: false, active: -1, loading: false };
let quickTimer = null;
let quickAbort = null;
let quickSeq = 0;
let quickCbAbort = null;
let quickCbSeq = 0;
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
    if (res.status === 401) {
      state.user = null;
      renderUser();
      showAuthGate();
    }
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
      state.tab = ["sim", "ai", "lit", "cb", "detect"].includes(raw.tab) ? raw.tab : "sim";
      state.aiConstraints = {
        detector: "UV", phase: "auto", organic: "auto", mode: "auto", max_run_min: 40,
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
/* auth                                                                */
/* ------------------------------------------------------------------ */

function bindAuth() {
  $("#auth-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-auth-tab]");
    if (!button) return;
    setAuthMode(button.dataset.authTab);
  });
  $("#auth-form").addEventListener("submit", submitAuth);
  $("#btn-logout").addEventListener("click", logout);
  $("#btn-account").addEventListener("click", openAccount);
  const forgot = $("#btn-forgot");
  if (forgot) {
    forgot.addEventListener("click", (event) => {
      event.preventDefault();
      const panel = $("#auth-reset");
      if (panel) panel.classList.toggle("hidden");
    });
  }
  const requestBtn = $("#btn-reset-request");
  if (requestBtn) requestBtn.addEventListener("click", requestPasswordReset);
  const confirmBtn = $("#btn-reset-confirm");
  if (confirmBtn) confirmBtn.addEventListener("click", confirmPasswordReset);
}

function setResetMessage(message, isError) {
  const node = $("#reset-msg");
  if (!node) return;
  node.textContent = message || "";
  node.classList.toggle("hidden", !message);
  node.style.color = isError ? "" : "var(--teal-dim)";
}

async function requestPasswordReset() {
  const email = ($("#reset-email")?.value || "").trim();
  if (!email) {
    setResetMessage("请输入注册邮箱", true);
    return;
  }
  const button = $("#btn-reset-request");
  if (button) button.disabled = true;
  setResetMessage("正在发送…", false);
  try {
    const res = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* ignore */ }
    if (!res.ok) {
      throw new Error(typeof data.detail === "string" ? data.detail : "发送失败，请稍后重试");
    }
    if (data.debug_token) {
      const tokenInput = $("#reset-token");
      if (tokenInput) tokenInput.value = data.debug_token;
      setResetMessage("邮件服务未配置，已自动填入重置令牌（生产环境请配置 SMTP）。", false);
    } else {
      setResetMessage("重置令牌已发送至邮箱，请在 30 分钟内完成重置。", false);
    }
  } catch (err) {
    setResetMessage(err.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function confirmPasswordReset() {
  const token = ($("#reset-token")?.value || "").trim();
  const password = $("#reset-password")?.value || "";
  if (!token) {
    setResetMessage("请输入重置令牌", true);
    return;
  }
  if (password.length < 8 || password.length > 64) {
    setResetMessage("新密码长度需为 8–64 位", true);
    return;
  }
  const button = $("#btn-reset-confirm");
  if (button) button.disabled = true;
  setResetMessage("正在重置…", false);
  try {
    const res = await fetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, new_password: password }),
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* ignore */ }
    if (!res.ok) {
      throw new Error(typeof data.detail === "string" ? data.detail : "重置失败，请稍后重试");
    }
    setResetMessage("密码已重置，请使用新密码登录。", false);
    $("#reset-token").value = "";
    $("#reset-password").value = "";
    setAuthMode("login");
  } catch (err) {
    setResetMessage(err.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";
  const register = authMode === "register";
  $$("#auth-tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.authTab === authMode);
  });
  $("#auth-confirm-field").classList.toggle("hidden", !register);
  const emailField = $("#auth-email-field");
  if (emailField) emailField.classList.toggle("hidden", !register);
  const emailInput = $("#auth-email");
  if (emailInput) emailInput.required = register;
  $("#auth-password").autocomplete = register ? "new-password" : "current-password";
  $("#auth-submit").textContent = register ? "注册并登录" : "登录";
  hideAuthError();
}

function showAuthGate() {
  const gate = $("#auth-gate");
  if (!gate) return;
  gate.classList.remove("hidden");
  const username = $("#auth-username");
  if (username && !username.value) {
    setTimeout(() => username.focus(), 60);
  }
}

function hideAuthGate() {
  const gate = $("#auth-gate");
  if (gate) gate.classList.add("hidden");
}

function showAuthError(message) {
  const node = $("#auth-error");
  if (!node) return;
  node.textContent = message;
  node.classList.remove("hidden");
}

function hideAuthError() {
  const node = $("#auth-error");
  if (!node) return;
  node.textContent = "";
  node.classList.add("hidden");
}

function setAuthBusy(busy) {
  const button = $("#auth-submit");
  if (!button) return;
  button.disabled = busy;
  if (busy) {
    button.textContent = "请稍候…";
  } else {
    button.textContent = authMode === "register" ? "注册并登录" : "登录";
  }
}

async function submitAuth(event) {
  event.preventDefault();
  if (authBusy) return;
  hideAuthError();
  const username = $("#auth-username").value.trim();
  const email = ($("#auth-email")?.value || "").trim();
  const password = $("#auth-password").value;
  const confirm = $("#auth-confirm").value;
  if (!username || !password) {
    showAuthError("请输入用户名和密码");
    return;
  }
  if (authMode === "register" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthError("请输入有效的邮箱地址");
    return;
  }
  if (authMode === "register" && password !== confirm) {
    showAuthError("两次输入的密码不一致");
    return;
  }
  setAuthBusy(true);
  authBusy = true;
  const path = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ username, email, password }),
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* ignore */ }
    if (!res.ok) {
      throw new Error(typeof data.detail === "string" ? data.detail : "操作失败，请稍后重试");
    }
    state.user = data.user;
    renderUser();
    hideAuthGate();
    $("#auth-password").value = "";
    $("#auth-confirm").value = "";
    await startApp();
    applyPreferences(state.account.preferences, { silent: true });
    toast(`${authMode === "register" ? "注册" : "登录"}成功，欢迎 ${state.user.username}`, "ok");
  } catch (err) {
    showAuthError(err.message);
  } finally {
    authBusy = false;
    setAuthBusy(false);
  }
}

function renderUser() {
  const chip = $("#user-chip");
  if (!chip) return;
  if (!state.user) {
    chip.classList.add("hidden");
    return;
  }
  chip.classList.remove("hidden");
  $("#user-name").textContent = state.user.username;
  $("#user-avatar").textContent = state.user.username.slice(0, 1).toUpperCase();
}

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } catch (_) { /* ignore */ }
  window.location.reload();
}

/* ------------------------------------------------------------------ */
/* account settings                                                    */
/* ------------------------------------------------------------------ */

let accountTab = "prefs";

async function apiJSON(path, method = "GET", body) {
  const options = { method, credentials: "same-origin", headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const res = await fetch(path, options);
  let data = {};
  try { data = await res.json(); } catch (_) { /* ignore */ }
  if (!res.ok) {
    if (res.status === 401) {
      state.user = null;
      renderUser();
      showAuthGate();
    }
    throw new Error(typeof data.detail === "string" ? data.detail : `请求失败（HTTP ${res.status}）`);
  }
  return data;
}

async function loadAccount() {
  if (!state.user) return;
  try {
    const data = await apiJSON("/api/account");
    state.account = {
      preferences: { ...DEFAULT_PREFERENCES, ...(data.preferences || {}) },
      favorites: Array.isArray(data.favorites) ? data.favorites : [],
    };
    renderFavorites();
    syncPrefForm();
  } catch (_) { /* keep local defaults */ }
}

function bindAccount() {
  $("#account-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-account-tab]");
    if (!button) return;
    setAccountTab(button.dataset.accountTab);
  });

  $("#pref-phase").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    state.account.preferences.default_phase = button.dataset.value;
    const options = ORGANIC_OPTIONS[button.dataset.value].filter((item) => item.value !== "custom");
    if (!options.some((item) => item.value === state.account.preferences.default_organic)) {
      state.account.preferences.default_organic = options[0].value;
    }
    renderPrefOrganic();
    syncSegment("#pref-phase", state.account.preferences.default_phase);
  });

  $("#pref-organic").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    state.account.preferences.default_organic = button.dataset.value;
    syncSegment("#pref-organic", state.account.preferences.default_organic);
  });

  $("#pref-detector").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    state.account.preferences.default_detector = button.dataset.value;
    syncSegment("#pref-detector", state.account.preferences.default_detector);
  });

  const temperature = $("#pref-temperature");
  temperature.addEventListener("input", () => {
    state.account.preferences.default_temperature_c = Number(temperature.value);
    $("#pref-temperature-out").textContent = `${temperature.value} °C`;
  });

  $("#btn-pref-save").addEventListener("click", async () => {
    const button = $("#btn-pref-save");
    button.disabled = true;
    try {
      const data = await apiJSON("/api/account/preferences", "PUT", state.account.preferences);
      state.account.preferences = { ...DEFAULT_PREFERENCES, ...(data.preferences || {}) };
      applyPreferences(state.account.preferences);
      syncPrefForm();
      toast("偏好设置已保存并应用", "ok");
    } catch (err) {
      toast(err.message, "err");
    } finally {
      button.disabled = false;
    }
  });

  $("#btn-pref-apply").addEventListener("click", () => {
    applyPreferences(state.account.preferences);
  });

  $("#pwd-new").addEventListener("input", updatePasswordStrength);
  $("#pwd-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const current = $("#pwd-current").value;
    const next = $("#pwd-new").value;
    const confirm = $("#pwd-confirm").value;
    if (!current || !next) {
      toast("请填写当前密码和新密码", "err");
      return;
    }
    if (next.length < 8 || next.length > 64) {
      toast("新密码长度需为 8–64 位", "err");
      return;
    }
    if (next !== confirm) {
      toast("两次输入的新密码不一致", "err");
      return;
    }
    const button = $("#btn-pwd-save");
    button.disabled = true;
    try {
      await apiJSON("/api/account/password", "POST", {
        current_password: current,
        new_password: next,
      });
      $("#pwd-current").value = "";
      $("#pwd-new").value = "";
      $("#pwd-confirm").value = "";
      updatePasswordStrength();
      toast("密码已更新，其他设备上的登录已失效", "ok");
    } catch (err) {
      toast(err.message, "err");
    } finally {
      button.disabled = false;
    }
  });

  $("#btn-favorite-add").addEventListener("click", async () => {
    const input = $("#favorite-name");
    const name = input.value.trim();
    if (!name) {
      toast("请先为收藏命名", "err");
      input.focus();
      return;
    }
    const button = $("#btn-favorite-add");
    button.disabled = true;
    try {
      const data = await apiJSON("/api/account/favorites", "POST", {
        name,
        phase: state.conditions.phase,
        conditions: state.conditions,
      });
      if (data.favorite) state.account.favorites.unshift(data.favorite);
      input.value = "";
      renderFavorites();
      toast("已收藏当前色谱条件", "ok");
    } catch (err) {
      toast(err.message, "err");
    } finally {
      button.disabled = false;
    }
  });

  $("#favorite-list").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-fav-action]");
    if (!button) return;
    const id = button.dataset.favId;
    if (button.dataset.favAction === "apply") {
      applyFavorite(id);
      return;
    }
    if (button.dataset.favAction === "delete") {
      button.disabled = true;
      try {
        await apiJSON(`/api/account/favorites/${id}`, "DELETE");
        state.account.favorites = state.account.favorites.filter((item) => item.id !== id);
        renderFavorites();
        toast("收藏已删除", "ok");
      } catch (err) {
        button.disabled = false;
        toast(err.message, "err");
      }
    }
  });
}

function openAccount() {
  if (!state.user) return;
  setAccountTab(accountTab);
  syncPrefForm();
  renderFavorites();
  const subtitle = $("#account-subtitle");
  const created = state.user.created_at
    ? new Date(state.user.created_at).toLocaleDateString("zh-CN")
    : "";
  subtitle.textContent = `${state.user.username}${created ? ` · 注册于 ${created}` : ""}`;
  $("#pwd-username").value = state.user.username;
  $("#modal-account").classList.remove("hidden");
  loadAccount();
}

function setAccountTab(tab) {
  accountTab = ["prefs", "security", "favorites"].includes(tab) ? tab : "prefs";
  $$("#account-tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.accountTab === accountTab);
  });
  ["prefs", "security", "favorites"].forEach((name) => {
    $(`#account-${name}`).classList.toggle("hidden", name !== accountTab);
  });
}

function renderPrefOrganic() {
  const phase = state.account.preferences.default_phase === "normal" ? "normal" : "reversed";
  const options = ORGANIC_OPTIONS[phase].filter((item) => item.value !== "custom");
  if (!options.some((item) => item.value === state.account.preferences.default_organic)) {
    state.account.preferences.default_organic = options[0].value;
  }
  $("#pref-organic").innerHTML = options
    .map((item) => `<button data-value="${item.value}">${item.label}</button>`)
    .join("");
  syncSegment("#pref-organic", state.account.preferences.default_organic);
}

function syncPrefForm() {
  const prefs = state.account.preferences;
  renderPrefOrganic();
  syncSegment("#pref-phase", prefs.default_phase);
  syncSegment("#pref-detector", prefs.default_detector);
  const temperature = $("#pref-temperature");
  temperature.value = String(prefs.default_temperature_c);
  $("#pref-temperature-out").textContent = `${prefs.default_temperature_c} °C`;
}

function applyPreferences(preferences, { silent = false } = {}) {
  if (!preferences) return;
  const phase = preferences.default_phase === "normal" ? "normal" : "reversed";
  const options = ORGANIC_OPTIONS[phase].filter((item) => item.value !== "custom");
  const organic = options.some((item) => item.value === preferences.default_organic)
    ? preferences.default_organic
    : options[0].value;
  const temperature = Math.max(15, Math.min(60, Number(preferences.default_temperature_c) || 30));
  state.conditions.phase = phase;
  state.conditions.organic = organic;
  state.conditions.aqueous = phase === "normal" ? "hexane" : "water";
  state.conditions.temperature_c = temperature;
  const allowedChemistry = getAllowedChemistries(phase);
  if (!allowedChemistry.includes(state.conditions.column.chemistry)) {
    state.conditions.column.chemistry = phase === "normal" ? "silica" : "c18";
  }
  const detectors = ["UV", "FLD", "RID", "ELSD", "CAD", "MS"];
  state.aiConstraints.detector = detectors.includes(preferences.default_detector)
    ? preferences.default_detector
    : "UV";
  syncControls();
  persist();
  scheduleSim(0);
  if (!silent) toast("偏好已应用到当前条件", "ok");
}

function updatePasswordStrength() {
  const value = $("#pwd-new").value;
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  score = Math.min(4, score);
  const colors = ["#ef4444", "#f59e0b", "#eab308", "#22c55e"];
  const labels = ["弱", "一般", "较好", "强"];
  const bar = $("#pwd-meter-bar");
  bar.style.width = value ? `${score * 25}%` : "0%";
  bar.style.background = colors[Math.max(0, score - 1)] || colors[0];
  $("#pwd-hint").textContent = value
    ? `密码强度：${labels[Math.max(0, score - 1)] || "弱"}（至少 8 位）`
    : "至少 8 位，建议包含大小写字母、数字与符号。";
}

function renderFavorites() {
  const list = $("#favorite-list");
  if (!list) return;
  if (!state.account.favorites.length) {
    list.innerHTML = `<div class="favorite-empty">还没有收藏。命名并收藏当前条件后，可在这里一键恢复。</div>`;
    return;
  }
  list.innerHTML = state.account.favorites.map((item) => {
    const phaseLabel = item.phase === "normal" ? "正相 NPLC" : "反相 RPLC";
    const conditions = item.conditions || {};
    const solvent = solventLabel(
      conditions.organic,
      conditions.organic_label,
      ORGANIC_NAMES,
      phaseLabel,
    );
    const date = item.created_at
      ? new Date(item.created_at).toLocaleString("zh-CN", {
        month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      })
      : "";
    return `
      <div class="favorite-item">
        <div class="favorite-main">
          <div class="favorite-name">${escapeHtml(item.name)}</div>
          <div class="favorite-meta">${phaseLabel} · ${escapeHtml(solvent)}${date ? ` · ${date}` : ""}</div>
        </div>
        <div class="favorite-btns">
          <button class="mini-btn" data-fav-action="apply" data-fav-id="${item.id}">应用</button>
          <button class="mini-btn" data-fav-action="delete" data-fav-id="${item.id}">删除</button>
        </div>
      </div>`;
  }).join("");
}

function applyFavorite(id) {
  const favorite = state.account.favorites.find((item) => item.id === id);
  if (!favorite) return;
  const merged = deepMerge(DEFAULT_CONDITIONS(), favorite.conditions || {});
  if (!Array.isArray(merged.gradient) || merged.gradient.length < 2) {
    merged.gradient = DEFAULT_CONDITIONS().gradient;
  }
  state.conditions = merged;
  syncControls();
  persist();
  scheduleSim(0);
  $("#modal-account").classList.add("hidden");
  toast(`已应用收藏「${favorite.name}」`, "ok");
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", init);

let appStarted = false;
let authMode = "login";
let authBusy = false;

async function init() {
  restore();
  bindAuth();
  if (await loadSession()) {
    await startApp();
  } else {
    showAuthGate();
  }
}

async function loadSession() {
  try {
    const res = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!res.ok) return false;
    const data = await res.json();
    state.user = data.user || null;
    renderUser();
    return Boolean(state.user);
  } catch (_) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* literature references                                               */
/* ------------------------------------------------------------------ */

function litDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function safeHttpUrl(value) {
  const url = String(value || "");
  return /^https?:\/\//i.test(url) ? url : "";
}

function litSourceLabel(sources) {
  const names = [];
  if (sources?.europepmc === "ok") names.push("Europe PMC");
  if (sources?.crossref === "ok") names.push("Crossref");
  return names.join(" · ");
}

function renderLitStatus(message, kind = "") {
  const node = $("#lit-status");
  if (!node) return;
  node.textContent = message || "";
  node.className = `library-status${kind ? ` ${kind}` : ""}`;
}

function renderLitContext() {
  const node = $("#lit-context-chips");
  if (!node) return;
  const names = state.compounds.slice(0, 4).map((item) => item.name);
  node.innerHTML = names.length
    ? names.map((name) => `<span class="ai-chip">${escapeHtml(name)}</span>`).join("")
    : '<span class="hint">尚未选择组分</span>';
}

function litContextQuery() {
  const names = state.compounds.slice(0, 3).map((item) => item.name_en || item.name);
  if (!names.length) return "";
  const mode = state.conditions.phase === "normal" ? "normal phase HPLC" : "HPLC";
  return `${names.join(" ")} ${mode}`;
}

function litCard(item) {
  const meta = [
    item.authors,
    item.journal,
    item.year ? String(item.year) : "",
    item.cited_by != null ? `被引 ${item.cited_by}` : "",
  ].filter(Boolean);
  const tags = (item.sources || [])
    .map((source) => `<span class="lit-tag">${source === "europepmc" ? "Europe PMC" : "Crossref"}</span>`)
    .join("");
  const link = safeHttpUrl(item.url);
  const abstract = item.abstract
    ? `<details class="lit-abstract"><summary>摘要</summary><p>${escapeHtml(item.abstract)}</p></details>`
    : "";
  return `
    <article class="lit-card ${item.is_new ? "is-new" : ""}">
      <div class="lit-card-top">
        ${item.is_new ? '<span class="lit-new">NEW</span>' : ""}
        ${tags}
        <span class="lit-doi">${item.doi ? escapeHtml(item.doi) : "无 DOI"}</span>
      </div>
      <h3 class="lit-title">${escapeHtml(item.title)}</h3>
      <p class="lit-meta">${meta.map((part) => escapeHtml(part)).join(" · ")}</p>
      ${abstract}
      ${link ? `<a class="lit-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">查看原文 ↗</a>` : ""}
    </article>
  `;
}

function renderLitResults(label) {
  const node = $("#lit-results");
  if (!node) return;
  const results = state.literature.results;
  $("#lit-result-count").textContent = String(results.length);
  const note = $("#lit-source-note");
  if (note) {
    note.textContent = state.literature.fromWatch
      ? "监控缓存 · Europe PMC / Crossref"
      : (litSourceLabel(state.literature.sources) || "Europe PMC · Crossref");
  }
  const head = label
    ? `<div class="lit-result-head"><span>${escapeHtml(label)}</span><span>${results.length} 篇</span></div>`
    : "";
  if (!results.length) {
    node.innerHTML = `${head}<div class="empty-state">未检索到文献，可尝试更宽泛的关键词或切换排序。</div>`;
    return;
  }
  node.innerHTML = head + results.map(litCard).join("");
}

function renderLiteratureTopics() {
  const list = $("#lit-watch-list");
  if (!list) return;
  const topics = state.literature.topics;
  $("#lit-watch-count").textContent = String(topics.length);
  if (!topics.length) {
    list.innerHTML = '<p class="hint">暂无监控主题，点击「+ 新建」创建。</p>';
    return;
  }
  list.innerHTML = topics.map((topic) => {
    const scanning = state.literature.scanning === topic.id;
    const last = topic.last_scan_at
      ? `扫描于 ${litDate(topic.last_scan_at)}`
      : "尚未扫描";
    return `
      <div class="lit-watch-item ${state.literature.activeTopic === topic.id ? "active" : ""}">
        <div class="lit-watch-main">
          <div class="lit-watch-name">
            ${escapeHtml(topic.name)}
            ${topic.new_count ? `<span class="lit-badge">+${topic.new_count}</span>` : ""}
          </div>
          <div class="lit-watch-meta">
            <span class="lit-watch-query">${escapeHtml(topic.query)}</span>
            <span>${escapeHtml(last)}${topic.items_count ? ` · 缓存 ${topic.items_count} 篇` : ""}</span>
            ${topic.last_error ? `<span class="lit-watch-error">${escapeHtml(topic.last_error)}</span>` : ""}
          </div>
        </div>
        <div class="lit-watch-actions">
          <button class="lit-mini-btn" data-lit-action="scan" data-topic-id="${escapeHtml(topic.id)}" ${scanning ? "disabled" : ""}>${scanning ? "扫描中…" : "扫描"}</button>
          <button class="lit-mini-btn" data-lit-action="items" data-topic-id="${escapeHtml(topic.id)}">查看</button>
          <button class="lit-mini-btn danger" data-lit-action="delete" data-topic-id="${escapeHtml(topic.id)}" aria-label="删除监控主题">×</button>
        </div>
      </div>
    `;
  }).join("");
}

async function renderLiteratureView() {
  renderLitContext();
  if (!state.literature.loaded) {
    try {
      const data = await apiJSON("/api/literature/watch");
      state.literature.topics = Array.isArray(data.topics) ? data.topics : [];
      state.literature.loaded = true;
    } catch (_) { /* 401 is handled by apiJSON */ }
  }
  renderLiteratureTopics();
  if (!state.literature.autoScanStarted) {
    state.literature.autoScanStarted = true;
    autoScanLiterature();
  }
}

async function autoScanLiterature() {
  const sixHours = 6 * 60 * 60 * 1000;
  const stale = state.literature.topics
    .filter((topic) => !topic.last_scan_at
      || Date.now() - new Date(topic.last_scan_at).getTime() > sixHours)
    .slice(0, 3);
  if (!stale.length) return;
  let added = 0;
  for (const topic of stale) {
    if ($("#view-lit").classList.contains("hidden")) break;
    const data = await scanLiteratureTopic(topic.id, { silent: true });
    added += data?.new_count || 0;
  }
  if (added > 0) toast(`文献监控发现 ${added} 篇新文献`, "ok");
}

async function scanLiteratureTopic(topicId, options = {}) {
  const topic = state.literature.topics.find((item) => item.id === topicId);
  state.literature.scanning = topicId;
  renderLiteratureTopics();
  try {
    const data = await apiJSON(`/api/literature/watch/${encodeURIComponent(topicId)}/scan`, "POST");
    if (data.topic) {
      const index = state.literature.topics.findIndex((item) => item.id === topicId);
      if (index !== -1) state.literature.topics[index] = data.topic;
    }
    if (!options.silent) {
      if (data.scan_error) {
        renderLitStatus(data.scan_error, "error");
        toast(`扫描失败：${data.scan_error}`, "err");
      } else {
        toast(`扫描完成，新增 ${data.new_count || 0} 篇`, "ok");
        showLiteratureItems(topicId, data.items || [], topic?.name || "");
      }
    }
    return data;
  } catch (err) {
    if (!options.silent) {
      renderLitStatus(String(err.message || err), "error");
      toast(String(err.message || err), "err");
    }
    return { new_count: 0 };
  } finally {
    state.literature.scanning = null;
    renderLiteratureTopics();
  }
}

function showLiteratureItems(topicId, items, name) {
  state.literature.activeTopic = topicId;
  state.literature.fromWatch = true;
  state.literature.results = items.slice();
  renderLitResults(`监控主题：${name}`);
  renderLitStatus(items.length ? "" : "该主题尚无缓存文献，请先扫描。", items.length ? "" : "error");
  renderLiteratureTopics();
}

async function loadLiteratureItems(topicId) {
  const topic = state.literature.topics.find((item) => item.id === topicId);
  try {
    const data = await apiJSON(`/api/literature/watch/${encodeURIComponent(topicId)}/items`);
    showLiteratureItems(topicId, data.items || [], topic?.name || "");
  } catch (err) {
    renderLitStatus(String(err.message || err), "error");
  }
}

async function runLiteratureSearch(query, options = {}) {
  const q = String(query === undefined ? $("#lit-query").value : query).trim();
  if (q.length < 2) {
    toast("请输入至少 2 个字符的检索词", "err");
    return;
  }
  state.literature.query = q;
  const input = $("#lit-query");
  if (input) input.value = q;
  state.literature.sort = $("#lit-sort")?.value || "relevance";
  state.literature.loading = true;
  state.literature.fromWatch = false;
  state.literature.activeTopic = null;
  renderLiteratureTopics();
  renderLitStatus("正在检索 Europe PMC 与 Crossref…", "loading");
  $("#lit-result-count").textContent = "…";
  $("#lit-results").innerHTML = "";
  const params = new URLSearchParams({ q, sort: state.literature.sort, limit: "15" });
  try {
    const data = await apiJSON(`/api/literature/search?${params.toString()}`);
    state.literature.results = Array.isArray(data.results) ? data.results : [];
    state.literature.sources = data.sources || {};
    renderLitResults(options.label || `检索：「${q}」`);
    renderLitStatus((data.errors || []).join("；"), data.errors?.length ? "error" : "");
  } catch (err) {
    state.literature.results = [];
    renderLitResults("");
    renderLitStatus(String(err.message || err), "error");
  } finally {
    state.literature.loading = false;
  }
}

async function saveLiteratureTopic() {
  const name = $("#lit-watch-name").value.trim();
  const query = $("#lit-watch-query").value.trim();
  if (!name || query.length < 2) {
    toast("请填写主题名称与至少 2 个字符的检索式", "err");
    return;
  }
  try {
    const data = await apiJSON("/api/literature/watch", "POST", { name, query });
    state.literature.topics.unshift(data.topic);
    $("#lit-watch-form").classList.add("hidden");
    $("#lit-watch-name").value = "";
    $("#lit-watch-query").value = "";
    renderLiteratureTopics();
    toast("监控主题已创建，正在首次扫描…", "ok");
    await scanLiteratureTopic(data.topic.id, {});
  } catch (err) {
    toast(String(err.message || err), "err");
  }
}

async function deleteLiteratureTopic(topicId) {
  try {
    await apiJSON(`/api/literature/watch/${encodeURIComponent(topicId)}`, "DELETE");
    state.literature.topics = state.literature.topics.filter((item) => item.id !== topicId);
    if (state.literature.activeTopic === topicId) {
      state.literature.activeTopic = null;
      state.literature.results = [];
      state.literature.fromWatch = false;
      renderLitResults("");
      renderLitStatus("");
    }
    renderLiteratureTopics();
    toast("已删除监控主题", "ok");
  } catch (err) {
    toast(String(err.message || err), "err");
  }
}

function bindLiterature() {
  $("#lit-search-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    runLiteratureSearch();
  });
  $("#lit-sort")?.addEventListener("change", () => {
    if (state.literature.query) runLiteratureSearch(state.literature.query);
  });
  $("#btn-lit-context")?.addEventListener("click", () => {
    const query = litContextQuery();
    if (!query) {
      toast("请先在模拟台添加样品组分", "err");
      setTab("sim");
      return;
    }
    runLiteratureSearch(query, { label: `当前体系：「${query}」` });
  });
  $("#btn-lit-watch-toggle")?.addEventListener("click", () => {
    const form = $("#lit-watch-form");
    form.classList.toggle("hidden");
    if (!form.classList.contains("hidden")) $("#lit-watch-name").focus();
  });
  $("#btn-lit-watch-cancel")?.addEventListener("click", () => {
    $("#lit-watch-form").classList.add("hidden");
  });
  $("#btn-lit-watch-save")?.addEventListener("click", saveLiteratureTopic);
  $("#lit-watch-list")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-lit-action]");
    if (!button) return;
    const { litAction, topicId } = button.dataset;
    if (litAction === "scan") {
      scanLiteratureTopic(topicId, {});
    } else if (litAction === "items") {
      loadLiteratureItems(topicId);
    } else if (litAction === "delete") {
      deleteLiteratureTopic(topicId);
    }
  });
}

async function startApp() {
  if (appStarted) return;
  appStarted = true;
  hideAuthGate();
  bindTabs();
  bindModals();
  bindSimControls();
  bindAIControls();
  bindSettings();
  bindLibrary();
  bindQuickSearch();
  bindLiterature();
  bindChemicalBook();
  bindDetector();
  bindExport();
  bindAccount();
  await loadAccount();

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
  initDetectorDefaults();
  renderChemicalBook();
  renderDetector();
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
  $("#view-lit").classList.toggle("hidden", tab !== "lit");
  $("#view-cb").classList.toggle("hidden", tab !== "cb");
  $("#view-detect").classList.toggle("hidden", tab !== "detect");
  if (tab === "sim" && charts.sim) {
    requestAnimationFrame(() => charts.sim.draw());
  }
  if (tab === "ai") {
    renderAIView();
  }
  if (tab === "lit") {
    renderLiteratureView();
  }
  if (tab === "cb") {
    renderChemicalBook();
  }
  if (tab === "detect") {
    renderDetector();
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
};

const DETECTOR_DEFS = {
  UV: {
    label: "UV / DAD",
    fields: [
      { key: "wavelength_nm", label: "检测波长", unit: "nm", min: 190, max: 800, step: 1 },
      { key: "bandwidth_nm", label: "狭缝带宽", unit: "nm", min: 2, max: 40, step: 1 },
    ],
  },
  FLD: {
    label: "FLD 荧光",
    fields: [
      { key: "excitation_nm", label: "激发波长 Ex", unit: "nm", min: 190, max: 500, step: 1 },
      { key: "emission_nm", label: "发射波长 Em", unit: "nm", min: 210, max: 800, step: 1 },
      { key: "bandwidth_nm", label: "狭缝带宽", unit: "nm", min: 2, max: 40, step: 1 },
    ],
  },
  RID: {
    label: "RID 示差",
    fields: [
      { key: "cell_temperature_c", label: "检测池温度", unit: "°C", min: 20, max: 60, step: 1 },
    ],
  },
  ELSD: {
    label: "ELSD 蒸发光",
    fields: [
      { key: "drift_tube_c", label: "漂移管温度", unit: "°C", min: 30, max: 100, step: 1 },
      { key: "gas_flow_l_min", label: "载气流量", unit: "L/min", min: 0.3, max: 3, step: 0.1 },
      { key: "gain", label: "增益", unit: "", min: 1, max: 10, step: 1 },
    ],
  },
  CAD: {
    label: "CAD 电雾式",
    fields: [
      { key: "evaporation_c", label: "蒸发温度", unit: "°C", min: 20, max: 80, step: 1 },
      { key: "gas_pressure_psi", label: "载气压力", unit: "psi", min: 10, max: 60, step: 1 },
    ],
  },
  MS: {
    label: "LC-MS",
    fields: [
      { key: "cone_voltage_v", label: "锥孔电压", unit: "V", min: 5, max: 150, step: 1 },
    ],
    select: { key: "ionization", label: "离子化模式", options: ["ESI+", "ESI-"] },
  },
};

function detectorSummary(conditions) {
  switch (conditions.detector) {
    case "FLD":
      return `FLD Ex ${Math.round(conditions.excitation_nm)}/Em ${Math.round(conditions.emission_nm)} nm`;
    case "RID":
      return `RID ${Math.round(conditions.cell_temperature_c)} °C`;
    case "ELSD":
      return `ELSD ${Math.round(conditions.drift_tube_c)} °C`;
    case "CAD":
      return `CAD ${Math.round(conditions.evaporation_c)} °C`;
    case "MS":
      return `MS ${conditions.ionization}`;
    default:
      return `UV ${Math.round(conditions.wavelength_nm)} nm`;
  }
}

function renderDetectorParams() {
  const container = $("#detector-params");
  if (!container) return;
  const conditions = state.conditions;
  const definition = DETECTOR_DEFS[conditions.detector] || DETECTOR_DEFS.UV;
  const select = $("#sim-detector");
  if (select) select.value = conditions.detector;
  const output = $("#sim-detector-out");
  if (output) output.textContent = definition.label;
  container.innerHTML = definition.fields.map((field) => `
    <div class="field inline-field">
      <label for="det-${field.key}">${field.label}</label>
      <div class="inline-input">
        <input id="det-${field.key}" type="number" data-detector-key="${field.key}"
          min="${field.min}" max="${field.max}" step="${field.step}"
          value="${Number(conditions[field.key]) || field.min}">
        <span>${field.unit}</span>
      </div>
    </div>
  `).join("") + (definition.select ? `
    <div class="field inline-field">
      <label for="det-${definition.select.key}">${definition.select.label}</label>
      <div class="inline-input">
        <select data-detector-select="${definition.select.key}" id="det-${definition.select.key}">
          ${definition.select.options.map((option) => `
            <option value="${option}" ${conditions[definition.select.key] === option ? "selected" : ""}>${option}</option>
          `).join("")}
        </select>
      </div>
    </div>
  ` : "");
}

function bindSimControls() {
  renderColumnOptions();
  renderDetectorParams();
  $("#sim-detector").addEventListener("change", (event) => {
    state.conditions.detector = event.target.value;
    renderDetectorParams();
    persist();
    scheduleSim();
  });
  $("#detector-params").addEventListener("input", (event) => {
    const input = event.target.closest("[data-detector-key]");
    if (!input) return;
    const value = parseFloat(input.value);
    if (!Number.isFinite(value)) return;
    state.conditions[input.dataset.detectorKey] = value;
    persist();
    scheduleSim();
  });
  $("#detector-params").addEventListener("change", (event) => {
    const select = event.target.closest("[data-detector-select]");
    if (!select) return;
    state.conditions[select.dataset.detectorSelect] = select.value;
    persist();
    scheduleSim();
  });
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
  bindSegment("#seg-phase", () => state.conditions.phase, (value) => setPhase(value));
  $("#seg-organic").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    state.conditions.organic = button.dataset.value;
    syncSegment("#seg-organic", state.conditions.organic);
    syncSolventCustomFields();
    if (state.conditions.organic === "custom") {
      setTimeout(() => $("#organic-custom").focus(), 0);
    }
    persist();
    scheduleSim();
  });

  $("#seg-aqueous").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    state.conditions.aqueous = button.dataset.value;
    syncSegment("#seg-aqueous", state.conditions.aqueous);
    syncSolventCustomFields();
    if (state.conditions.aqueous === "custom") {
      setTimeout(() => $("#aqueous-custom").focus(), 0);
    }
    persist();
    scheduleSim();
  });

  $("#organic-custom").addEventListener("input", (event) => {
    state.conditions.organic_label = event.target.value;
    persist();
    scheduleSim(350);
  });

  $("#aqueous-custom").addEventListener("input", (event) => {
    state.conditions.aqueous_label = event.target.value;
    persist();
    scheduleSim(350);
  });

  [["c", "C"], ["d", "D"]].forEach(([slot]) => {
    $(`#solvent-${slot}`).addEventListener("change", (event) => {
      state.conditions[`solvent_${slot}`] = event.target.value;
      syncAuxFields();
      renderGradient();
      if (event.target.value === "custom") {
        setTimeout(() => $(`#solvent-${slot}-custom`).focus(), 0);
      }
      persist();
      scheduleSim();
    });
    $(`#solvent-${slot}-custom`).addEventListener("input", (event) => {
      state.conditions[`solvent_${slot}_label`] = event.target.value;
      syncAuxFields();
      persist();
      scheduleSim(350);
    });
    $(`#percent-${slot}`).addEventListener("input", (event) => {
      const value = parseFloat(event.target.value);
      if (!Number.isFinite(value)) return;
      state.conditions[`percent_${slot}`] = value;
      syncAuxFields();
      persist();
      scheduleSim();
    });
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

  $("#column-chemistry").addEventListener("change", (event) => {
    state.conditions.column.chemistry = event.target.value;
    syncControls();
    persist();
    scheduleSim(0);
  });

  $("#btn-add-grad").addEventListener("click", () => {
    const points = state.conditions.gradient;
    const last = points[points.length - 1] || { time_min: 0, percent_b: 5 };
    points.push({
      time_min: Math.round((last.time_min + 5) * 10) / 10,
      percent_b: last.percent_b,
      percent_c: Number(last.percent_c) || 0,
      percent_d: Number(last.percent_d) || 0,
    });
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
  syncPhaseUI();
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
  renderChemistryOptions(conditions.phase);
  renderDetectorParams();

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

const ORGANIC_OPTIONS = {
  reversed: [
    { value: "ACN", label: "乙腈 ACN" },
    { value: "MeOH", label: "甲醇 MeOH" },
    { value: "THF", label: "四氢呋喃 THF" },
    { value: "EtOH", label: "乙醇 EtOH" },
    { value: "custom", label: "自定义" },
  ],
  normal: [
    { value: "IPA", label: "异丙醇 IPA" },
    { value: "EtOAc", label: "乙酸乙酯 EtOAc" },
    { value: "THF", label: "四氢呋喃 THF" },
    { value: "EtOH", label: "乙醇 EtOH" },
    { value: "custom", label: "自定义" },
  ],
};

const AQUEOUS_OPTIONS = {
  reversed: [
    { value: "water", label: "水" },
    { value: "buffer", label: "缓冲水相" },
    { value: "custom", label: "自定义" },
  ],
  normal: [
    { value: "hexane", label: "正己烷" },
    { value: "heptane", label: "正庚烷" },
    { value: "cyclohexane", label: "环己烷" },
    { value: "custom", label: "自定义" },
  ],
};

const ORGANIC_NAMES = {
  ACN: "乙腈", MeOH: "甲醇", IPA: "异丙醇", EtOAc: "乙酸乙酯",
  THF: "四氢呋喃", EtOH: "乙醇",
};
const AQUEOUS_NAMES = {
  water: "水", buffer: "缓冲水相", hexane: "正己烷", heptane: "正庚烷",
  cyclohexane: "环己烷",
};

const AUX_SOLVENT_OPTIONS = [
  { value: "none", label: "未启用" },
  { value: "ACN", label: "乙腈 ACN" },
  { value: "MeOH", label: "甲醇 MeOH" },
  { value: "THF", label: "四氢呋喃 THF" },
  { value: "EtOH", label: "乙醇 EtOH" },
  { value: "IPA", label: "异丙醇 IPA" },
  { value: "EtOAc", label: "乙酸乙酯 EtOAc" },
  { value: "water", label: "水" },
  { value: "buffer", label: "缓冲水相" },
  { value: "hexane", label: "正己烷" },
  { value: "heptane", label: "正庚烷" },
  { value: "cyclohexane", label: "环己烷" },
  { value: "custom", label: "自定义" },
];

function renderAuxSolventOptions(selectId, value) {
  const select = $(selectId);
  if (!select) return;
  select.innerHTML = AUX_SOLVENT_OPTIONS
    .map((item) => `<option value="${item.value}">${item.label}</option>`)
    .join("");
  select.value = AUX_SOLVENT_OPTIONS.some((item) => item.value === value) ? value : "none";
}

function syncAuxFields() {
  const conditions = state.conditions;
  [["c", "C"], ["d", "D"]].forEach(([slot]) => {
    const value = conditions[`solvent_${slot}`] || "none";
    const select = $(`#solvent-${slot}`);
    if (select) select.value = value;
    const custom = $(`#solvent-${slot}-custom`);
    const isCustom = value === "custom";
    if (custom) {
      custom.classList.toggle("hidden", !isCustom);
      if (isCustom && document.activeElement !== custom) {
        custom.value = conditions[`solvent_${slot}_label`] || "";
      }
    }
    const percent = conditions[`percent_${slot}`] || 0;
    const isGradient = conditions.mode === "gradient";
    const slider = $(`#percent-${slot}`);
    if (slider) {
      slider.value = String(percent);
      slider.disabled = value === "none" || isGradient;
      slider.classList.toggle("hidden", isGradient);
    }
    const out = $(`#solvent-${slot}-out`);
    if (out) {
      if (value === "none") {
        out.textContent = "未启用";
      } else {
        const label = solventLabel(
          value,
          conditions[`solvent_${slot}_label`],
          { ...ORGANIC_NAMES, ...AQUEOUS_NAMES },
          "自定义溶剂",
        );
        out.textContent = isGradient
          ? `由梯度表控制 · ${label}`
          : `${Math.round(percent)}% · ${label}`;
      }
    }
  });
}

function solventLabel(value, customLabel, names, fallback) {
  if (value === "custom") return (customLabel || "").trim() || fallback;
  if (value === "auto") return fallback || "自动";
  return names[value] || value;
}

function renderOrganicOptions() {
  const phase = state.conditions.phase || "reversed";
  const options = ORGANIC_OPTIONS[phase];
  if (!options.some((item) => item.value === state.conditions.organic)) {
    state.conditions.organic = phase === "normal" ? "IPA" : "ACN";
  }
  $("#seg-organic").innerHTML = options
    .map((item) => `<button data-value="${item.value}">${item.label}</button>`)
    .join("");
  syncSegment("#seg-organic", state.conditions.organic);
}

function renderAqueousOptions() {
  const phase = state.conditions.phase || "reversed";
  const options = AQUEOUS_OPTIONS[phase];
  if (!options.some((item) => item.value === state.conditions.aqueous)) {
    state.conditions.aqueous = phase === "normal" ? "hexane" : "water";
  }
  $("#seg-aqueous").innerHTML = options
    .map((item) => `<button data-value="${item.value}">${item.label}</button>`)
    .join("");
  syncSegment("#seg-aqueous", state.conditions.aqueous);
}

function syncSolventCustomFields() {
  const organicCustom = state.conditions.organic === "custom";
  const aqueousCustom = state.conditions.aqueous === "custom";
  $("#organic-custom-field").classList.toggle("hidden", !organicCustom);
  $("#organic-custom-hint").classList.toggle("hidden", !organicCustom);
  $("#aqueous-custom-field").classList.toggle("hidden", !aqueousCustom);
  $("#aqueous-custom-hint").classList.toggle("hidden", !aqueousCustom);
  const organicInput = $("#organic-custom");
  if (organicCustom && document.activeElement !== organicInput) {
    organicInput.value = state.conditions.organic_label || "";
  }
  const aqueousInput = $("#aqueous-custom");
  if (aqueousCustom && document.activeElement !== aqueousInput) {
    aqueousInput.value = state.conditions.aqueous_label || "";
  }
}

function renderAiOrganicOptions() {
  const phase = state.aiConstraints.phase;
  const options = [{ value: "auto", label: "自动" }];
  if (phase === "normal") {
    options.push({ value: "IPA", label: "IPA" }, { value: "EtOAc", label: "EtOAc" });
  } else if (phase === "reversed") {
    options.push({ value: "ACN", label: "ACN" }, { value: "MeOH", label: "MeOH" });
  } else {
    options.push(
      { value: "ACN", label: "ACN" },
      { value: "MeOH", label: "MeOH" },
      { value: "IPA", label: "IPA" },
      { value: "EtOAc", label: "EtOAc" },
    );
  }
  if (!options.some((item) => item.value === state.aiConstraints.organic)) {
    state.aiConstraints.organic = "auto";
  }
  $("#seg-ai-organic").innerHTML = options
    .map((item) => `<button data-value="${item.value}">${item.label}</button>`)
    .join("");
  lightSyncSegment("#seg-ai-organic", state.aiConstraints.organic);
}

function syncPhaseUI() {
  const phase = state.conditions.phase || "reversed";
  const normal = phase === "normal";
  syncSegment("#seg-phase", phase);
  lightSyncSegment("#seg-ai-phase", state.aiConstraints.phase);
  $("#phase-note").classList.toggle("hidden", !normal);
  $("#ph-field").classList.toggle("hidden", normal);
  $("#iso-label").textContent = "B 相比例";
  $("#column-hint").textContent = normal
    ? "正相推荐硅胶/二醇/氨基柱，A 相为正己烷"
    : "切换预设会同时应用推荐流速与系统延迟体积";
  const isoPreset = $('[data-preset="iso50"]');
  if (isoPreset) isoPreset.textContent = normal ? "等度 10%" : "等度 50%";
  renderAqueousOptions();
  renderOrganicOptions();
  syncSolventCustomFields();
  renderAuxSolventOptions("#solvent-c", state.conditions.solvent_c);
  renderAuxSolventOptions("#solvent-d", state.conditions.solvent_d);
  syncAuxFields();
  renderAiOrganicOptions();
  renderColumnOptions();
  syncColumnSelector();
}

function setPhase(phase) {
  if (!["reversed", "normal"].includes(phase) || state.conditions.phase === phase) return;
  state.conditions.phase = phase;
  const normal = phase === "normal";
  const organicValues = ORGANIC_OPTIONS[phase].map((item) => item.value);
  if (!organicValues.includes(state.conditions.organic)) {
    state.conditions.organic = normal ? "IPA" : "ACN";
  }
  state.conditions.aqueous = normal ? "hexane" : "water";
  const allowed = getAllowedChemistries(phase);
  if (!allowed.includes(state.conditions.column.chemistry)) {
    state.conditions.column.chemistry = normal ? "silica" : "c18";
  }
  syncControls();
  persist();
  scheduleSim(0);
  toast(normal ? "已切换为正相 NPLC" : "已切换为反相 RPLC", "ok");
}

function setAiPhase(phase) {
  state.aiConstraints.phase = phase;
  renderAiOrganicOptions();
  lightSyncSegment("#seg-ai-phase", phase);
  persist();
}

function renderColumnOptions() {
  const select = $("#column-preset");
  if (!select) return;
  const phase = state.conditions.phase || "reversed";
  const groups = new Map();
  COLUMN_PRESETS
    .filter((preset) => (preset.phase || "reversed") === phase)
    .forEach((preset) => {
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
  const phase = state.conditions.phase || "reversed";
  const matched = COLUMN_PRESETS
    .filter((preset) => (preset.phase || "reversed") === phase)
    .find((preset) =>
      ["length_mm", "inner_diameter_mm", "particle_um", "porosity"].every(
        (key) => Math.abs(Number(column[key]) - Number(preset.column[key])) < 1e-6,
      )
      && (column.chemistry || "c18") === (preset.column.chemistry || "c18"));
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
    const chemistry = COLUMN_CHEMISTRY_LABELS[column.chemistry] || "C18";
    summary.textContent = `${preset ? preset.name : "自定义"} · ${chemistry} · ${column.length_mm} × ${column.inner_diameter_mm} mm · ${column.particle_um} µm`;
  }
}

function renderChemistryOptions(phase) {
  const select = $("#column-chemistry");
  if (!select) return;
  const allowed = getAllowedChemistries(phase);
  const current = state.conditions.column.chemistry;
  select.innerHTML = allowed
    .map((key) => `<option value="${key}">${COLUMN_CHEMISTRY_LABELS[key] || key}</option>`)
    .join("");
  if (allowed.includes(current)) {
    select.value = current;
  } else {
    select.value = allowed[0];
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
      const chemistry = COLUMN_CHEMISTRY_LABELS[column.chemistry] || "C18";
      summary.textContent = `自定义 · ${chemistry} · ${column.length_mm} × ${column.inner_diameter_mm} mm · ${column.particle_um} µm`;
    }
    return;
  }
  const preset = COLUMN_PRESETS.find((item) => item.id === presetId);
  if (!preset) return;
  state.conditions.column = {
    ...state.conditions.column,
    ...preset.column,
    chemistry: preset.column.chemistry || "c18",
  };
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
  syncAuxFields();
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
  conditions.solvent_c = "none";
  conditions.percent_c = 0;
  conditions.solvent_d = "none";
  conditions.percent_d = 0;
  if ((conditions.phase || "reversed") === "normal") {
    const presets = {
      screen: {
        mode: "gradient",
        gradient: [
          { time_min: 0, percent_b: 2 },
          { time_min: 20, percent_b: 40 },
          { time_min: 24, percent_b: 40 },
        ],
      },
      iso50: { mode: "isocratic", percent_b: 10 },
      polar: {
        mode: "gradient",
        gradient: [
          { time_min: 0, percent_b: 2 },
          { time_min: 18, percent_b: 60 },
          { time_min: 22, percent_b: 60 },
        ],
      },
      hydrophobic: { mode: "isocratic", percent_b: 4 },
    };
    if (presets[name]) {
      Object.assign(conditions, presets[name], {
        organic: "IPA",
        ph: 7,
        flow_ml_min: 1,
        temperature_c: 30,
        wavelength_nm: 254,
        total_time_min: null,
      });
    }
    syncControls();
    persist();
    scheduleSim(0);
    const active = $(`[data-preset="${name}"]`);
    if (active) active.classList.add("active");
    return;
  }
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

function ensureGradientChannelFields() {
  const conditions = state.conditions;
  const seedC = Number(conditions.percent_c) || 0;
  const seedD = Number(conditions.percent_d) || 0;
  conditions.gradient.forEach((point) => {
    if (!Number.isFinite(Number(point.percent_c))) point.percent_c = seedC;
    if (!Number.isFinite(Number(point.percent_d))) point.percent_d = seedD;
  });
}

function gradientAuxChannels() {
  const conditions = state.conditions;
  return {
    hasC: Boolean(conditions.solvent_c) && conditions.solvent_c !== "none",
    hasD: Boolean(conditions.solvent_d) && conditions.solvent_d !== "none",
  };
}

function renderGradient() {
  const wrap = $("#gradient-list");
  if (!wrap) return;
  ensureGradientChannelFields();
  const { hasC, hasD } = gradientAuxChannels();
  const columns = 2 + (hasC ? 1 : 0) + (hasD ? 1 : 0);
  const template = `16px repeat(${columns}, minmax(0, 1fr)) 24px`;
  const rows = state.conditions.gradient.map((point, index) => {
    const cells = [
      `<input type="number" step="0.1" min="0" max="300" value="${point.time_min}" data-grad-field="time_min" aria-label="时间">`,
      `<input type="number" step="0.1" min="0" max="100" value="${point.percent_b}" data-grad-field="percent_b" aria-label="B 相比例">`,
    ];
    if (hasC) {
      cells.push(`<input type="number" step="0.1" min="0" max="100" value="${point.percent_c}" data-grad-field="percent_c" aria-label="C 相比例">`);
    }
    if (hasD) {
      cells.push(`<input type="number" step="0.1" min="0" max="100" value="${point.percent_d}" data-grad-field="percent_d" aria-label="D 相比例">`);
    }
    return `
      <div class="grad-row" data-grad-index="${index}" style="grid-template-columns:${template}">
        <span class="idx">${String(index + 1).padStart(2, "0")}</span>
        ${cells.join("")}
        <button class="remove-btn" data-remove-grad title="删除该梯度点" aria-label="删除">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
    `;
  }).join("");
  const headers = ["#", "时间 (min)", "%B"];
  if (hasC) headers.push("%C");
  if (hasD) headers.push("%D");
  headers.push("");
  wrap.innerHTML = `
    <div class="grad-units" style="grid-template-columns:${template}">
      ${headers.map((text) => `<span>${text}</span>`).join("")}
    </div>
    ${rows}
  `;
  const hint = $("#grad-hint");
  if (hint) {
    hint.textContent = hasC || hasD
      ? "A 相 = 100 − B − C − D，随梯度自动计算"
      : "时间从 0 min 起，%B 为 B 相体积分数";
  }
}

/* ------------------------------------------------------------------ */
/* compound list                                                       */
/* ------------------------------------------------------------------ */

function compoundMeta(compound) {
  const parts = [`logP ${fmt(compound.log_p, 1)}`];
  if (compound.pka != null) parts.push(`pKa ${fmt(compound.pka, 1)}`);
  if (compound.lambda_max_nm) parts.push(`λ${Math.round(compound.lambda_max_nm)}`);
  if (compound.estimated) parts.push("估算");
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
    const normal = state.conditions.phase === "normal";
    const aqueousLabel = solventLabel(
      state.conditions.aqueous,
      state.conditions.aqueous_label,
      AQUEOUS_NAMES,
      normal ? "正己烷" : "水",
    );
    const organicLabel = solventLabel(
      state.conditions.organic,
      state.conditions.organic_label,
      ORGANIC_NAMES,
      normal ? "异丙醇" : "乙腈",
    );
    const auxNote = ["c", "d"]
      .filter((slot) => state.conditions[`solvent_${slot}`] !== "none")
      .map((slot) => {
        const label = solventLabel(
          state.conditions[`solvent_${slot}`],
          state.conditions[`solvent_${slot}_label`],
          { ...ORGANIC_NAMES, ...AQUEOUS_NAMES },
          "自定义",
        );
        return ` + ${slot.toUpperCase()} ${Math.round(state.conditions[`percent_${slot}`] || 0)}% ${label}`;
      })
      .join("");
    const mobileNote = normal
      ? `${aqueousLabel}/${organicLabel}${auxNote}`
      : `${aqueousLabel}/${organicLabel}${auxNote} · pH ${Number(state.conditions.ph).toFixed(1)}`;
    $("#chart-sub").textContent =
      `${result.peaks.length} 个组分 · ${gradient ? "梯度" : "等度"} · `
      + `${mobileNote} · ${detectorSummary(state.conditions)} · `
      + `运行 ${fmt(result.metrics.run_time_min, 1)} min`;
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
  bindSegment("#seg-ai-phase", () => state.aiConstraints.phase, (value) => setAiPhase(value));
  $("#seg-ai-organic").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-value]");
    if (!button) return;
    state.aiConstraints.organic = button.dataset.value;
    lightSyncSegment("#seg-ai-organic", state.aiConstraints.organic);
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
  if (state.compounds.length > 20) {
    toast("一次最多分析 20 个组分，请先在样品组分中精简", "err");
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
        <button class="ghost-btn" style="margin-top:16px" id="btn-retry-ai">重试</button>
      </section>
    `;
    const retry = $("#btn-retry-ai");
    if (retry) retry.addEventListener("click", () => generateRecommendation());
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
  const auxC = Boolean(conditions.solvent_c) && conditions.solvent_c !== "none";
  const auxD = Boolean(conditions.solvent_d) && conditions.solvent_d !== "none";
  const gradientRows = Array.isArray(method.gradient) && conditions.mode === "gradient"
    ? method.gradient.map((point) => {
      let cells = `<td>${fmt(point.time_min, 1)}</td><td>${fmt(point.percent_b, 1)}</td>`;
      if (auxC) cells += `<td>${fmt(point.percent_c ?? conditions.percent_c, 1)}</td>`;
      if (auxD) cells += `<td>${fmt(point.percent_d ?? conditions.percent_d, 1)}</td>`;
      return `<tr>${cells}</tr>`;
    }).join("")
    : "";
  const gradientHead = `<th>时间 (min)</th><th>%B</th>${auxC ? "<th>%C</th>" : ""}${auxD ? "<th>%D</th>" : ""}`;
  const gradientBlock = conditions.mode === "gradient"
    ? `<div class="table-wrap" style="max-width:380px">
        <table class="peak-table">
          <thead><tr>${gradientHead}</tr></thead>
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

  const detector = result.detector && Array.isArray(result.detector.parameters)
    ? result.detector
    : null;
  const detectorBlock = detector
    ? `<div class="section-title">检测器关键参数 · ${escapeHtml(detector.label)}</div>
      <div class="method-grid">
        ${detector.parameters.map((p) =>
          `<div class="method-cell"><span>${escapeHtml(p.label)}</span><b class="mono">${escapeHtml(p.value)}</b></div>`
        ).join("")}
      </div>`
    : "";
  const wavelengthLabel = detector && detector.type !== "UV" ? "检测波长（参考）" : "检测波长";

  const errorHtml = result.llm_error
    ? `<div class="llm-error">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>
        <span>${escapeHtml(result.llm_error)}</span>
      </div>`
    : "";

  const references = Array.isArray(result.references) ? result.references : [];
  const literature = result.literature || null;
  const referenceUrl = (item) => {
    const url = String(item.url || "");
    if (/^https?:\/\//i.test(url)) return url;
    return item.doi ? `https://doi.org/${item.doi}` : "";
  };
  const referenceItems = references.map((item) => {
    const url = referenceUrl(item);
    const label = `[${item.index}] ${item.title || "未命名文献"}`;
    const meta = [item.journal, item.year].filter(Boolean).join(" · ");
    return `<li>
      ${url
        ? `<a class="lit-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
        : `<span>${escapeHtml(label)}</span>`}
      ${meta ? `<span class="lit-meta">${escapeHtml(meta)}</span>` : ""}
      ${item.note ? `<span class="ref-note">${escapeHtml(item.note)}</span>` : ""}
    </li>`;
  }).join("");
  let literatureSection = "";
  if (literature && literature.status && literature.status !== "skipped") {
    if (references.length) {
      literatureSection = `
        <div class="section-title">文献依据 · 引用 ${references.length} 篇</div>
        <ul class="ref-list">${referenceItems}</ul>`;
    } else if (literature.status === "error") {
      const reason = (literature.errors || []).join("；") || "检索服务不可用";
      literatureSection = `
        <div class="section-title">文献依据</div>
        <p class="ref-empty">文献检索未完成（${escapeHtml(reason)}），本次条件仅基于组分化学性质与色谱分离原理生成。</p>`;
    } else {
      literatureSection = `
        <div class="section-title">文献依据</div>
        <p class="ref-empty">未检索到可直接引用的文献，本次条件仅基于组分化学性质与色谱分离原理生成。</p>`;
    }
  }

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
        <div class="method-cell"><span>${wavelengthLabel}</span><b class="mono">${fmt(conditions.wavelength_nm, 0)} nm</b></div>
        <div class="method-cell"><span>进样量</span><b class="mono">${fmt(conditions.injection_volume_ul, 1)} µL</b></div>
        <div class="method-cell"><span>运行时间</span><b class="mono">${fmt(metrics.run_time_min, 1)} min</b></div>
      </div>

      ${detectorBlock}

      <div class="section-title">梯度程序</div>
      ${gradientBlock}

      <div class="section-title">设计依据</div>
      <ul class="bullet-list">
        ${(result.rationale || []).map((text) => `<li>${escapeHtml(text)}</li>`).join("") || "<li>—</li>"}
      </ul>

      ${literatureSection}

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
        <span class="chip ${metrics.min_resolution == null ? "" : metrics.min_resolution >= 1.5 ? "good" : metrics.min_resolution >= 1.0 ? "warn" : "bad"}">最小 Rs <b>${metrics.min_resolution == null ? "—" : fmt(metrics.min_resolution, 2)}</b></span>
        <span class="chip">检出峰 <b>${metrics.num_peaks}</b></span>
      </div>

      <div class="ai-actions">
        <button class="primary-btn" id="btn-apply-ai">应用到模拟台继续优化</button>
        <button class="ghost-btn" id="btn-regen-ai">重新生成</button>
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
  $("#btn-regen-ai").addEventListener("click", () => generateRecommendation());
  $("#btn-export-ai").addEventListener("click", () => exportPeaks(result.result, "ai-method-peaks"));
}

function applyAIResult(result) {
  state.conditions = deepMerge(
    DEFAULT_CONDITIONS(),
    JSON.parse(JSON.stringify(result.conditions)),
  );
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
  $("#ai-settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    $("#btn-ai-save").click();
  });
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
  $("#btn-library-cb").addEventListener("click", () => {
    const query = String($("#library-search").value || "").trim();
    $("#modal-library").classList.add("hidden");
    setTab("cb");
    if (query) {
      $("#cb-query").value = query;
      searchChemicalBook(query);
    } else {
      $("#cb-query").focus();
    }
  });
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
    let reference = 0;
    state.librarySelection.forEach((id) => {
      if (state.compounds.some((c) => c.id === id)) return;
      const item = state.library.find((c) => c.id === id)
        || state.onlineLibrary.find((c) => c.id === id)
        || state.cbLibrary.find((c) => c.id === id);
      if (item) {
        state.compounds.push({ ...item, concentration_mg_l: 100 });
        added += 1;
        if (item.estimated) estimated += 1;
        if (item.source === "chemicalbook") reference += 1;
      }
    });
    state.librarySelection.clear();
    $("#modal-library").classList.add("hidden");
    onCompoundsChanged();
    const suffix = [
      estimated ? `其中 ${estimated} 个参数为估算值` : "",
      reference ? `含 ${reference} 个 ChemicalBook 参考记录` : "",
    ].filter(Boolean).join("，");
    toast(suffix ? `已添加 ${added} 个组分，${suffix}` : `已添加 ${added} 个组分`, "ok");
  });
  $("#btn-add-custom").addEventListener("click", addCustomCompound);
}

/* quick compound search (sidebar)                                     */
/* ------------------------------------------------------------------ */

function bindQuickSearch() {
  const input = $("#quick-search");
  const box = $("#quick-results");
  if (!input || !box) return;

  input.addEventListener("input", () => {
    quickSearch.query = input.value.trim();
    quickSearch.active = -1;
    renderQuickResults();
    scheduleQuickOnline(quickSearch.query);
  });

  input.addEventListener("focus", () => {
    quickSearch.query = input.value.trim();
    if (quickSearch.query) renderQuickResults();
  });

  input.addEventListener("keydown", (event) => {
    const items = quickMatches();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!items.length) return;
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      quickSearch.active = (quickSearch.active + delta + items.length) % items.length;
      renderQuickResults();
      const activeNode = $("#quick-results .quick-result.active");
      if (activeNode) activeNode.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      if (!items.length) return;
      event.preventDefault();
      addQuickCompound(items[quickSearch.active >= 0 ? quickSearch.active : 0]);
    } else if (event.key === "Escape") {
      closeQuickResults();
    }
  });

  box.addEventListener("click", (event) => {
    const row = event.target.closest("[data-quick-id]");
    if (!row) return;
    const id = row.dataset.quickId;
    const item = state.library.find((c) => c.id === id)
      || quickSearch.online.find((c) => c.id === id)
      || quickSearch.cb.find((c) => c.id === id);
    if (item) addQuickCompound(item);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".quick-search")) closeQuickResults();
  });
}

function quickMatches() {
  const query = quickSearch.query.toLowerCase();
  if (!query) return [];
  const local = state.library.filter((item) =>
    `${item.name} ${item.name_en || ""} ${item.id} ${item.category || ""}`
      .toLowerCase()
      .includes(query));
  const seen = new Set(local.map((item) => item.id));
  const localNames = new Set(local.map((item) => String(item.name_en || item.name).toLowerCase()));
  const online = quickSearch.online.filter((item) =>
    !seen.has(item.id) && !localNames.has(String(item.name_en || item.name).toLowerCase()));
  const onlineNames = new Set(online.map((item) => String(item.name_en || item.name).toLowerCase()));
  const chemicalbook = quickSearch.cb.filter((item) => {
    if (seen.has(item.id) || localNames.has(String(item.name_en || item.name).toLowerCase())) return false;
    return !onlineNames.has(String(item.name_en || item.name).toLowerCase());
  });
  return local.concat(online, chemicalbook).slice(0, 14);
}

function renderQuickResults() {
  const input = $("#quick-search");
  const box = $("#quick-results");
  if (!input || !box) return;
  if (!quickSearch.query) {
    closeQuickResults();
    return;
  }
  const items = quickMatches();
  const rows = items.map((item, index) => {
    const added = state.compounds.some((c) => c.id === item.id);
    const online = item.source === "pubchem";
    const reference = item.source === "chemicalbook";
    const tag = online ? '<span class="qr-tag">PubChem·估算</span>'
      : reference ? '<span class="qr-tag cb">ChemicalBook·估算</span>' : "";
    const meta = [
      item.name_en || item.id,
      item.cas_number ? `CAS ${item.cas_number}` : "",
      `logP ${fmt(item.log_p, 1)}`,
      item.pka != null ? `pKa ${fmt(item.pka, 1)}` : "",
    ].filter(Boolean).join(" · ");
    return `
      <div class="quick-result ${index === quickSearch.active ? "active" : ""} ${added ? "added" : ""}"
        role="option" aria-selected="${index === quickSearch.active}" data-quick-id="${escapeHtml(item.id)}">
        <div class="qr-main">
          <div class="qr-name">${escapeHtml(item.name)}${tag}</div>
          <div class="qr-meta">${escapeHtml(meta)}</div>
        </div>
        <span class="qr-add">${added ? "已添加" : "添加"}</span>
      </div>
    `;
  }).join("");
  const loading = quickSearch.loading || quickSearch.cbLoading;
  const sources = [quickSearch.loading ? "PubChem" : "", quickSearch.cbLoading ? "ChemicalBook" : ""]
    .filter(Boolean).join(" 与 ");
  const status = loading
    ? `<div class="quick-status">正在检索 ${sources}…</div>`
    : (!items.length && !quickSearch.cbError
      ? `<div class="quick-status">未找到匹配化合物${quickSearch.query.length < 2 ? "，输入 2 个字符以上可检索在线数据库" : ""}</div>`
      : "");
  const warning = quickSearch.cbError && !loading
    ? `<div class="quick-status warn">${escapeHtml(quickSearch.cbError)}，仍可使用 PubChem 与本地结果</div>`
    : "";
  box.innerHTML = rows + status + warning;
  box.classList.remove("hidden");
  input.setAttribute("aria-expanded", "true");
}

function closeQuickResults() {
  const box = $("#quick-results");
  const input = $("#quick-search");
  if (box) box.classList.add("hidden");
  if (input) input.setAttribute("aria-expanded", "false");
  quickSearch.active = -1;
}

function scheduleQuickOnline(query) {
  clearTimeout(quickTimer);
  if (quickAbort) quickAbort.abort();
  if (quickCbAbort) quickCbAbort.abort();
  quickSearch.online = [];
  quickSearch.cb = [];
  quickSearch.cbError = "";
  quickSearch.loading = false;
  quickSearch.cbLoading = false;
  quickSeq += 1;
  quickCbSeq += 1;
  if (query.length < 2) {
    renderQuickResults();
    return;
  }
  quickSearch.loading = true;
  quickSearch.cbLoading = true;
  renderQuickResults();
  quickTimer = setTimeout(() => {
    runQuickOnline(query);
    runQuickChemicalBook(query);
  }, 350);
}

async function runQuickOnline(query) {
  const seq = ++quickSeq;
  quickAbort = new AbortController();
  try {
    const res = await fetch(
      `/api/compounds/search?q=${encodeURIComponent(query)}&limit=6`,
      { signal: quickAbort.signal },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (seq !== quickSeq) return;
    quickSearch.online = data.online || [];
    quickSearch.loading = false;
    quickSearch.active = Math.min(quickSearch.active, quickMatches().length - 1);
    renderQuickResults();
  } catch (err) {
    if (err.name === "AbortError") return;
    if (seq !== quickSeq) return;
    quickSearch.loading = false;
    renderQuickResults();
  }
}

async function runQuickChemicalBook(query) {
  const seq = ++quickCbSeq;
  quickCbAbort = new AbortController();
  try {
    const res = await fetch(
      `/api/compounds/search?q=${encodeURIComponent(query)}&source=chemicalbook&limit=6`,
      { signal: quickCbAbort.signal },
    );
    const data = await res.json().catch(() => ({}));
    if (seq !== quickCbSeq) return;
    if (res.status === 502 || (data.error && data.error.code === "upstream_unavailable")) {
      quickSearch.cb = [];
      quickSearch.cbError = "ChemicalBook 暂不可用";
    } else if (!res.ok) {
      quickSearch.cb = [];
      quickSearch.cbError = "ChemicalBook 检索失败";
    } else {
      quickSearch.cb = (data.matches || []).map(chemicalBookCompound);
      quickSearch.cbError = "";
    }
    quickSearch.cbLoading = false;
    quickSearch.active = Math.min(quickSearch.active, quickMatches().length - 1);
    renderQuickResults();
  } catch (err) {
    if (err.name === "AbortError") return;
    if (seq !== quickCbSeq) return;
    quickSearch.cb = [];
    quickSearch.cbError = "ChemicalBook 暂不可用";
    quickSearch.cbLoading = false;
    renderQuickResults();
  }
}

function pushSampleCompound(item) {
  if (state.compounds.some((c) => c.id === item.id)) {
    toast("该组分已在样品中");
    return false;
  }
  if (state.compounds.length >= 20) {
    toast("样品组分已达上限 20 个", "err");
    return false;
  }
  state.compounds.push({ ...item, concentration_mg_l: 100 });
  onCompoundsChanged();
  return true;
}

function addQuickCompound(item) {
  if (!pushSampleCompound(item)) return;
  quickSearch.query = "";
  quickSearch.online = [];
  quickSearch.cb = [];
  const input = $("#quick-search");
  if (input) input.value = "";
  closeQuickResults();
  const suffix = item.source === "chemicalbook"
    ? "，ChemicalBook 参考参数为估算值，建议在方法中复核"
    : item.estimated ? "，在线参数为估算值" : "";
  toast(`已添加「${item.name}」${suffix}`, "ok");
}

function openLibrary() {
  state.librarySelection.clear();
  state.libraryCategory = "全部";
  state.librarySearch = "";
  state.onlineLibrary = [];
  state.cbLibrary = [];
  libraryLoading = false;
  libraryCbLoading = false;
  libraryCbError = "";
  clearTimeout(libraryTimer);
  if (libraryAbort) libraryAbort.abort();
  if (libraryCbAbort) libraryCbAbort.abort();
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
  if (libraryCbAbort) libraryCbAbort.abort();
  if (query.length < 2) {
    state.onlineLibrary = [];
    state.cbLibrary = [];
    libraryLoading = false;
    libraryCbLoading = false;
    libraryCbError = "";
    setLibraryStatus("");
    renderLibrary();
    return;
  }
  libraryLoading = true;
  libraryCbLoading = true;
  libraryCbError = "";
  updateLibraryStatus();
  libraryTimer = setTimeout(() => {
    runLibrarySearch(query);
    runLibraryChemicalBook(query);
  }, 350);
}

function updateLibraryStatus() {
  if (libraryLoading || libraryCbLoading) {
    const sources = [libraryLoading ? "PubChem" : "", libraryCbLoading ? "ChemicalBook" : ""]
      .filter(Boolean).join(" 与 ");
    setLibraryStatus(`正在检索 ${sources}…`);
    return;
  }
  const parts = [];
  if (state.onlineLibrary.length) parts.push(`PubChem ${state.onlineLibrary.length} 个`);
  if (state.cbLibrary.length) parts.push(`ChemicalBook ${state.cbLibrary.length} 个`);
  if (!parts.length) {
    setLibraryStatus(libraryCbError || "没有更多在线结果", libraryCbError ? "warn" : "");
    return;
  }
  const suffix = libraryCbError ? ` · ${libraryCbError}` : "";
  setLibraryStatus(`在线补充 ${parts.join(" · ")}，参数带“估算”标记${suffix}`, libraryCbError ? "warn" : "");
}

async function runLibraryChemicalBook(query) {
  const seq = ++libraryCbSeq;
  libraryCbAbort = new AbortController();
  try {
    const res = await fetch(
      `/api/compounds/search?q=${encodeURIComponent(query)}&source=chemicalbook&limit=6`,
      { signal: libraryCbAbort.signal },
    );
    const data = await res.json().catch(() => ({}));
    if (seq !== libraryCbSeq) return;
    if (res.status === 502 || (data.error && data.error.code === "upstream_unavailable")) {
      state.cbLibrary = [];
      libraryCbError = "ChemicalBook 暂不可用";
    } else if (!res.ok) {
      state.cbLibrary = [];
      libraryCbError = "ChemicalBook 检索失败";
    } else {
      state.cbLibrary = (data.matches || []).map(chemicalBookCompound);
      libraryCbError = "";
    }
    libraryCbLoading = false;
    renderLibrary();
    updateLibraryStatus();
  } catch (err) {
    if (err.name === "AbortError") return;
    if (seq !== libraryCbSeq) return;
    state.cbLibrary = [];
    libraryCbError = "ChemicalBook 暂不可用";
    libraryCbLoading = false;
    renderLibrary();
    updateLibraryStatus();
  }
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
    libraryLoading = false;
    renderLibrary();
    updateLibraryStatus();
  } catch (err) {
    if (err.name === "AbortError") return;
    if (seq !== librarySeq) return;
    libraryLoading = false;
    renderLibrary();
    updateLibraryStatus();
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
  const filtered = state.library.concat(state.onlineLibrary, state.cbLibrary).filter((item) => {
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
      const reference = item.source === "chemicalbook";
      return `
        <div class="library-item ${selected ? "selected" : ""} ${added ? "added" : ""}" data-library-id="${escapeHtml(item.id)}">
          <span class="cat-tag ${online ? "online" : ""} ${reference ? "reference" : ""}">${escapeHtml(online ? "PubChem" : reference ? "ChemicalBook" : item.category || "")}</span>
          <h4>${escapeHtml(item.name)}</h4>
          <div class="en">${escapeHtml(item.name_en || "")}${added ? " · 已添加" : ""}</div>
          <div class="props">
            <span>logP ${fmt(item.log_p, 1)}</span>
            ${item.pka != null ? `<span>pKa ${fmt(item.pka, 1)}</span>` : ""}
            <span>λ${Math.round(item.lambda_max_nm)}</span>
          </div>
          ${online || reference ? `<div class="estimate-note">${reference ? "ChemicalBook 参考参数为估算值" : "pKa/λ 为估算值"}</div>` : ""}
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

/* ------------------------------------------------------------------ */
/* ChemicalBook reference search (merged from the ION workspace)        */
/* ------------------------------------------------------------------ */

const cbState = { query: "", loading: false, data: null, error: null, failed: false };

const CB_PROPERTY_LABELS = {
  "Molecular formula": "分子式",
  "Molecular weight": "分子量",
  "Boiling point": "沸点",
};

function cbSourceLabel(label) {
  if (!label) return "ChemicalBook";
  if (label.includes("Product chemical properties")) return "ChemicalBook · 产品化学性质";
  if (label.includes("Search result")) return "ChemicalBook · 检索结果";
  return label;
}

function chemicalBookCompound(match) {
  const name = match.name || "未命名化合物";
  const cbNumber = match.cb_number || "";
  const slug = String(name).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "");
  return {
    id: `chemicalbook-${cbNumber || slug || "record"}`,
    name,
    name_en: name,
    category: "ChemicalBook",
    log_p: 2.5,
    pka: null,
    acid_base: "neutral",
    lambda_max_nm: 254,
    concentration_mg_l: 100,
    log_kw: null,
    s_value: null,
    epsilon_max: 1,
    source: "chemicalbook",
    estimated: true,
    cas_number: match.cas_number || null,
    molecular_formula: match.molecular_formula || null,
    molecular_weight: match.molecular_weight || null,
    cb_number: cbNumber || null,
    detail_url: match.detail_url || null,
  };
}

function addCbSelectedToSample() {
  const selected = cbState.data && cbState.data.selected;
  if (!selected) return;
  const compound = chemicalBookCompound(selected);
  if (!pushSampleCompound(compound)) return;
  renderChemicalBook();
  toast(`已将「${compound.name}」加入样品与目标，参考参数为估算值，请在模拟台复核`, "ok");
}

function bindChemicalBook() {
  const form = $("#cb-search-form");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    searchChemicalBook($("#cb-query").value);
  });
  $("#cb-matches").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-cb-number]");
    if (!button) return;
    searchChemicalBook(cbState.query, button.dataset.cbNumber);
  });
  $("#cb-detail").addEventListener("click", (event) => {
    if (!event.target.closest("#cb-retry")) return;
    searchChemicalBook(cbState.query);
  });
  const addButton = $("#cb-add-sample");
  if (addButton) addButton.addEventListener("click", addCbSelectedToSample);
  const jump = $("#btn-quick-cb");
  if (jump) {
    jump.addEventListener("click", () => {
      const query = String(($("#quick-search") || {}).value || "").trim();
      setTab("cb");
      if (query) {
        $("#cb-query").value = query;
        searchChemicalBook(query);
      } else {
        $("#cb-query").focus();
      }
    });
  }
}

async function searchChemicalBook(query, cbNumber = null) {
  const q = String(query || "").trim();
  if (!q) {
    toast("请输入化合物名称或 CAS 号", "err");
    return;
  }
  cbState.query = q;
  cbState.loading = true;
  cbState.error = null;
  cbState.failed = false;
  renderChemicalBook();
  const params = new URLSearchParams({ q, source: "chemicalbook", limit: "6" });
  if (cbNumber) params.set("cb_number", cbNumber);
  try {
    const res = await fetch(`/api/compounds/search?${params.toString()}`, { credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 502 || (data && data.error && data.error.code === "upstream_unavailable")) {
      cbState.failed = true;
      cbState.data = null;
      cbState.error = "ChemicalBook 暂不可用（可能触发人机验证或访问限制），请稍后重试。";
    } else if (!res.ok) {
      cbState.failed = true;
      cbState.data = null;
      cbState.error = (data && data.error && data.error.message) || `检索失败（HTTP ${res.status}）`;
    } else {
      cbState.data = data;
    }
  } catch (err) {
    cbState.failed = true;
    cbState.data = null;
    cbState.error = `网络请求失败：${err.message}`;
  } finally {
    cbState.loading = false;
    renderChemicalBook();
  }
}

function cbEmpty(message, kind = "") {
  return `<div class="cb-empty${kind ? ` ${kind}` : ""}">${escapeHtml(message)}</div>`;
}

function renderChemicalBook() {
  const matchesNode = $("#cb-matches");
  if (!matchesNode) return;
  const pill = $("#cb-source-pill");
  const sourceLine = $("#cb-source-line");
  const count = $("#cb-match-count");
  const detail = $("#cb-detail");
  const external = $("#cb-external");
  const addBtn = $("#cb-add-sample");
  const data = cbState.data;

  if (cbState.loading) {
    pill.textContent = "检索中";
    sourceLine.innerHTML = '<span class="cb-dot live"></span><span>正在连接 ChemicalBook…</span>';
    count.textContent = "…";
    matchesNode.innerHTML = '<div class="loading-shimmer" style="height:56px"></div><div class="loading-shimmer" style="height:56px;margin-top:8px"></div>';
    detail.innerHTML = cbEmpty("正在读取检索结果与化合物档案…");
    external.classList.add("hidden");
    if (addBtn) addBtn.classList.add("hidden");
    return;
  }

  if (cbState.failed) {
    pill.textContent = "不可用";
    sourceLine.innerHTML = '<span class="cb-dot bad"></span><span>ChemicalBook 暂不可用</span>';
    count.textContent = "0";
    matchesNode.innerHTML = cbEmpty("上游数据源暂时不可用。", "bad");
    detail.innerHTML = `
      <div class="cb-empty bad">
        <strong>检索失败</strong>
        <p>${escapeHtml(cbState.error || "ChemicalBook 暂不可用。")}</p>
        <button class="ghost-btn" type="button" id="cb-retry">重试检索</button>
      </div>`;
    external.classList.add("hidden");
    if (addBtn) addBtn.classList.add("hidden");
    return;
  }

  if (!data) {
    pill.textContent = "参考库";
    sourceLine.innerHTML = '<span class="cb-dot"></span><span>等待检索</span>';
    count.textContent = "0";
    matchesNode.innerHTML = cbEmpty("输入名称或 CAS 号开始检索，结果会列出匹配记录。");
    detail.innerHTML = cbEmpty("选择左侧匹配记录后，在这里查看分子式、分子量、沸点与化合物摘要。");
    external.classList.add("hidden");
    if (addBtn) addBtn.classList.add("hidden");
    return;
  }

  const matches = Array.isArray(data.matches) ? data.matches : [];
  const selected = data.selected || null;
  pill.textContent = data.source && data.source.status === "live" ? "在线" : "参考库";
  sourceLine.innerHTML = `<span class="cb-dot live"></span><span>ChemicalBook · ${escapeHtml(data.query || "")}</span>`;
  count.textContent = String(matches.length);

  matchesNode.innerHTML = matches.length
    ? matches.map((match) => {
      const active = selected && selected.cb_number && match.cb_number === selected.cb_number ? " active" : "";
      const meta = [match.cas_number ? `CAS ${match.cas_number}` : "CAS 未公布", match.molecular_formula || "分子式未公布"].join(" · ");
      return `
        <button class="cb-match${active}" type="button" data-cb-number="${escapeHtml(match.cb_number || "")}">
          <span class="cb-match-name">${escapeHtml(match.name)}</span>
          <span class="cb-match-meta">${escapeHtml(meta)}</span>
          <span class="cb-match-id">${escapeHtml(match.cb_number || "—")}</span>
        </button>`;
    }).join("")
    : cbEmpty("没有匹配的化合物。可以换用英文名或 CAS 号检索。");

  if (!selected) {
    detail.innerHTML = cbEmpty("上游返回了匹配列表，但未提供可用的化合物档案。");
    external.classList.add("hidden");
    if (addBtn) addBtn.classList.add("hidden");
    return;
  }

  const properties = Array.isArray(selected.properties) ? selected.properties : [];
  const propertyRows = properties.length
    ? properties.map((item) => `
        <div class="method-cell">
          <span>${escapeHtml(CB_PROPERTY_LABELS[item.label] || item.label)}</span>
          <b class="mono">${escapeHtml(item.value)}</b>
        </div>`).join("")
    : `<p class="hint">该记录未公布分子式、分子量或沸点等物理性质。</p>`;

  detail.innerHTML = `
    <div class="cb-detail-head">
      <div>
        <h3>${escapeHtml(selected.name || "未命名记录")}</h3>
        <p>${escapeHtml(cbSourceLabel(selected.source_label))}</p>
      </div>
      <span class="pill">${escapeHtml(selected.cb_number || "—")}</span>
    </div>
    <div class="method-grid">
      <div class="method-cell"><span>CAS 号</span><b class="mono">${escapeHtml(selected.cas_number || "未公布")}</b></div>
      <div class="method-cell"><span>分子式</span><b class="mono">${escapeHtml(selected.molecular_formula || "未公布")}</b></div>
      <div class="method-cell"><span>分子量</span><b class="mono">${escapeHtml(selected.molecular_weight || "未公布")}</b></div>
      <div class="method-cell"><span>检索词</span><b class="mono">${escapeHtml(data.query || "")}</b></div>
    </div>
    <div class="section-title">物理性质</div>
    <div class="method-grid">${propertyRows}</div>
    <div class="section-title">化合物摘要</div>
    <div class="cb-summary">${selected.summary ? escapeHtml(selected.summary) : "该记录未公布化合物摘要。"}</div>
    <p class="hint">数据来源为 ChemicalBook 公开页面，仅用于方法开发参考；如需法规用途请核对原始记录。</p>`;

  if (selected.detail_url && /^https?:\/\//i.test(selected.detail_url)) {
    external.href = selected.detail_url;
    external.classList.remove("hidden");
  } else {
    external.classList.add("hidden");
  }

  if (addBtn) {
    const compound = chemicalBookCompound(selected);
    const added = state.compounds.some((c) => c.id === compound.id);
    addBtn.classList.remove("hidden");
    addBtn.disabled = added;
    addBtn.textContent = added ? "已在样品中" : "加入样品与目标";
  }
}

/* ------------------------------------------------------------------ */
/* Simulated interface detector (merged from the ION workspace)        */
/* ------------------------------------------------------------------ */

const DETECT_PARAMS = [
  { key: "flow_rate", label: "流速", unit: "mL/min", min: 0.05, max: 5, step: 0.05, cond: "flow_ml_min", digits: 2 },
  { key: "temperature", label: "柱温", unit: "°C", min: 4, max: 100, step: 1, cond: "temperature_c", digits: 0 },
  { key: "injection_volume", label: "进样体积", unit: "µL", min: 0.1, max: 100, step: 0.1, cond: "injection_volume_ul", digits: 1 },
  { key: "detection_wavelength", label: "检测波长", unit: "nm", min: 190, max: 800, step: 1, cond: "wavelength_nm", digits: 0 },
  { key: "run_time", label: "运行时间", unit: "min", min: 1, max: 180, step: 1, cond: null, digits: 0 },
  { key: "gradient", label: "初始有机相", unit: "%", min: 0, max: 100, step: 1, cond: "percent_b", digits: 0 },
];

const DETECT_ROUTE_LABELS = {
  combined: "组合接口",
  inlet: "进样与溶剂",
  uv_vis: "紫外检测器",
  temperature: "柱温箱",
  column: "色谱柱采集",
};

const DETECT_MODULE_LABELS = {
  "Inlet & solvent delivery": "进样与溶剂输送",
  "UV-Vis detector": "紫外-可见检测器",
  "Column thermostat": "柱温箱",
  "Injection system": "进样系统",
  "Solvent channels": "溶剂通道",
  "Gradient mixer": "梯度混合器",
  "Flow controller": "流量控制器",
  "Wavelength control": "波长控制",
  "Signal monitor": "信号监测",
  "Temperature controller": "温度控制器",
  "Column parameters": "色谱柱参数",
  "Acquisition runtime": "采集运行时间",
};

const DETECT_PARAM_LABELS = {
  "Flow rate": "流速",
  "Column temperature": "柱温",
  "Injection volume": "进样体积",
  "Detection wavelength": "检测波长",
  "Run time": "运行时间",
  "Initial organic phase": "初始有机相",
};

const detectState = {
  route: "combined",
  busy: false,
  image: null,
  values: {},
  result: null,
  plot: null,
};

function detectDefaultRunTime(conditions) {
  const gradient = Array.isArray(conditions.gradient) ? conditions.gradient : [];
  const last = gradient.length ? Number(gradient[gradient.length - 1].time_min) : 30;
  const value = Number(conditions.total_time_min) || (Number.isFinite(last) ? last + 5 : 30);
  return Math.max(1, Math.min(180, Math.round(value)));
}

function initDetectorDefaults() {
  const c = state.conditions;
  detectState.values = {
    flow_rate: Number(c.flow_ml_min) || 1,
    temperature: Number(c.temperature_c) || 30,
    injection_volume: Number(c.injection_volume_ul) || 10,
    detection_wavelength: Number(c.wavelength_nm) || 254,
    run_time: detectDefaultRunTime(c),
    gradient: Number(c.percent_b) || 5,
  };
  renderDetectParameters();
}

function renderDetectParameters() {
  const node = $("#detect-params");
  if (!node) return;
  node.innerHTML = DETECT_PARAMS.map((def) => `
    <label class="detect-field">
      <span>${def.label} (${def.unit})</span>
      <input type="number" id="detect-param-${def.key}" value="${detectState.values[def.key]}"
        min="${def.min}" max="${def.max}" step="${def.step}" inputmode="decimal">
      <small class="param-error" data-error-for="${def.key}"></small>
    </label>`).join("");
}

function readDetectParameters() {
  const parameters = {};
  const errors = {};
  for (const def of DETECT_PARAMS) {
    const input = $(`#detect-param-${def.key}`);
    const raw = input ? input.value.trim() : "";
    if (!raw) {
      errors[def.key] = `${def.label}为必填项。`;
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      errors[def.key] = `${def.label}必须是数字。`;
    } else if (value < def.min || value > def.max) {
      errors[def.key] = `${def.label}需在 ${def.min} – ${def.max} ${def.unit} 之间。`;
    } else {
      parameters[def.key] = value;
    }
  }
  detectState.values = { ...detectState.values, ...parameters };
  return { parameters, errors };
}

function renderDetectParameterErrors(errors) {
  for (const def of DETECT_PARAMS) {
    const input = $(`#detect-param-${def.key}`);
    const node = $(`.param-error[data-error-for="${def.key}"]`);
    const message = errors[def.key] || "";
    if (input) input.classList.toggle("invalid", Boolean(message));
    if (node) node.textContent = message;
  }
}

function setDetectStatus(message, kind = "") {
  const node = $("#detect-status");
  if (!node) return;
  node.textContent = message || "";
  node.className = `library-status${kind ? ` ${kind}` : ""}`;
}

function bindDetector() {
  const routes = $("#detect-routes");
  if (!routes) return;
  routes.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-route]");
    if (!button) return;
    detectState.route = button.dataset.route;
    renderDetector();
  });
  $("#detect-run").addEventListener("click", () => runDetector());
  $("#detect-clear").addEventListener("click", clearDetectImage);
  $("#detect-sync").addEventListener("click", syncDetectToSimulation);
  $("#detect-file").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) handleDetectFile(file);
    event.target.value = "";
  });
}

function handleDetectFile(file) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    toast("仅支持 PNG / JPEG / WebP 截图", "err");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast("截图不能超过 5 MB", "err");
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const dataUrl = String(reader.result || "");
    const comma = dataUrl.indexOf(",");
    detectState.image = {
      filename: file.name,
      mimeType: file.type,
      data_base64: comma === -1 ? dataUrl : dataUrl.slice(comma + 1),
      preview: dataUrl,
      bytes: file.size,
    };
    renderDetector();
    setDetectStatus("已读取截图，正在模拟识别接口模块…");
    runDetector();
  });
  reader.addEventListener("error", () => toast("截图读取失败", "err"));
  reader.readAsDataURL(file);
}

function clearDetectImage() {
  detectState.image = null;
  renderDetector();
  setDetectStatus("已清空截图，仍可直接使用六项参数运行模拟。");
}

async function detectRequest(body) {
  const res = await fetch("/api/interface/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error((data.error && data.error.message) || `请求失败（HTTP ${res.status}）`);
    error.fields = (data.error && data.error.fields) || {};
    throw error;
  }
  return data;
}

async function runDetector() {
  if (detectState.busy) return;
  const { parameters, errors } = readDetectParameters();
  renderDetectParameterErrors(errors);
  if (Object.keys(errors).length) {
    setDetectStatus("请先修正六项方法参数。", "warn");
    toast("请修正高亮的方法参数", "err");
    return;
  }
  detectState.busy = true;
  const runButton = $("#detect-run");
  if (runButton) {
    runButton.disabled = true;
    runButton.textContent = "正在模拟识别…";
  }
  setDetectStatus("正在模拟识别接口模块并生成色谱图…");
  const payload = {
    route: detectState.route,
    parameters,
    compound: { name: state.compounds[0] ? state.compounds[0].name : null },
  };
  if (detectState.image) {
    payload.image = {
      filename: detectState.image.filename,
      mimeType: detectState.image.mimeType,
      data_base64: detectState.image.data_base64,
    };
  }
  try {
    const analysis = await detectRequest({ ...payload, mode: "analyze" });
    const simulation = await detectRequest({ ...payload, mode: "simulate" });
    detectState.result = analysis;
    detectState.plot = simulation;
    renderDetector();
    setDetectStatus(
      `模拟识别完成：${analysis.detection.modules.length} 个模块 · 置信度 ${fmt(analysis.results.confidence, 3)}${detectState.image ? " · 已附截图" : ""}`,
      "ok",
    );
  } catch (err) {
    const fields = err.fields || {};
    renderDetectParameterErrors(fields);
    setDetectStatus(err.message || "界面检测失败", "warn");
    toast(err.message || "界面检测失败", "err");
  } finally {
    detectState.busy = false;
    if (runButton) {
      runButton.disabled = false;
      runButton.textContent = "运行界面检测";
    }
  }
}

function detectChartSvg(plot) {
  if (!plot || !Array.isArray(plot.points) || !plot.points.length) return "";
  const width = 760;
  const height = 260;
  const pad = { left: 44, right: 18, top: 16, bottom: 30 };
  const maxTime = Number(plot.run_time) || plot.points[plot.points.length - 1].time || 1;
  const maxSignalRaw = Math.max(...plot.points.map((point) => Number(point.signal) || 0), 1);
  const maxSignal = maxSignalRaw * 1.12;
  const x = (time) => pad.left + (time / maxTime) * (width - pad.left - pad.right);
  const y = (signal) => height - pad.bottom - (signal / maxSignal) * (height - pad.top - pad.bottom);
  const line = plot.points.map((point) => `${x(point.time).toFixed(1)},${y(point.signal).toFixed(1)}`).join(" ");
  const grid = [];
  for (let index = 0; index <= 4; index += 1) {
    const gy = pad.top + ((height - pad.top - pad.bottom) * index) / 4;
    grid.push(`<line x1="${pad.left}" y1="${gy.toFixed(1)}" x2="${width - pad.right}" y2="${gy.toFixed(1)}" stroke="rgba(140,172,190,0.14)"/>`);
  }
  const ticks = [];
  for (let index = 0; index <= 6; index += 1) {
    const value = (maxTime * index) / 6;
    const gx = x(value);
    ticks.push(`<line x1="${gx.toFixed(1)}" y1="${pad.top}" x2="${gx.toFixed(1)}" y2="${height - pad.bottom}" stroke="rgba(140,172,190,0.08)"/>`);
    ticks.push(`<text x="${gx.toFixed(1)}" y="${height - 8}" fill="#6f8798" font-size="10" text-anchor="middle" font-family="var(--mono)">${value.toFixed(1)}</text>`);
  }
  const markers = (plot.peaks || []).map((peak, index) => {
    const px = x(peak.retention_time);
    return `<line x1="${px.toFixed(1)}" y1="${pad.top}" x2="${px.toFixed(1)}" y2="${height - pad.bottom}" stroke="rgba(45,212,191,0.35)" stroke-dasharray="3 4"/>
      <text x="${px.toFixed(1)}" y="${(pad.top + 12 + index * 12).toFixed(1)}" fill="#2dd4bf" font-size="10" text-anchor="middle" font-family="var(--mono)">P${index + 1}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="模拟色谱图">
    <rect x="0" y="0" width="${width}" height="${height}" rx="10" fill="rgba(8,14,19,0.55)"/>
    ${grid.join("")}${ticks.join("")}
    <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" stroke="rgba(140,172,190,0.35)"/>
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" stroke="rgba(140,172,190,0.35)"/>
    <polyline points="${line}" fill="none" stroke="#2dd4bf" stroke-width="1.8" stroke-linejoin="round"/>
    ${markers}
    <text x="${pad.left}" y="${pad.top - 4}" fill="#6f8798" font-size="10">信号 (mAU)</text>
    <text x="${width - pad.right}" y="${height - 6}" fill="#6f8798" font-size="10" text-anchor="end">时间 (min)</text>
  </svg>`;
}

function detectPeakAssignment(value) {
  if (value === "Solvent front") return "溶剂前沿";
  if (value === "Related substance") return "有关物质";
  return value || "—";
}

function renderDetector() {
  const routes = $("#detect-routes");
  if (routes) {
    $$("#detect-routes button[data-route]").forEach((button) => {
      button.classList.toggle("active", button.dataset.route === detectState.route);
    });
  }
  const routePill = $("#detect-route-pill");
  if (routePill) routePill.textContent = DETECT_ROUTE_LABELS[detectState.route] || "组合接口";

  const filePill = $("#detect-file-pill");
  const preview = $("#detect-preview");
  if (filePill) filePill.textContent = detectState.image ? "已上传" : "未上传";
  if (preview) {
    if (detectState.image) {
      preview.innerHTML = `<img src="${detectState.image.preview}" alt="仪器界面截图预览">
        <span>${escapeHtml(detectState.image.filename)} · ${(detectState.image.bytes / 1024).toFixed(0)} KB</span>`;
      preview.classList.remove("hidden");
    } else {
      preview.innerHTML = "";
      preview.classList.add("hidden");
    }
  }

  const modulesNode = $("#detect-modules");
  const plotNode = $("#detect-plot");
  const metricsNode = $("#detect-metrics");
  const tableWrap = $("#detect-table-wrap");
  const tableBody = $("#detect-peak-body");
  if (!modulesNode || !plotNode) return;

  if (!detectState.result) {
    modulesNode.innerHTML = `
      <div class="detect-placeholder">
        <strong>尚未运行检测</strong>
        <p>选择接口路由、按需上传截图并确认六项参数，点击「运行界面检测」查看模拟识别结果。</p>
      </div>`;
    plotNode.innerHTML = "";
    if (metricsNode) metricsNode.innerHTML = "";
    if (tableWrap) tableWrap.hidden = true;
    return;
  }

  const detection = detectState.result.detection || {};
  const modules = Array.isArray(detection.modules) ? detection.modules : [];
  modulesNode.innerHTML = modules.map((module) => {
    const percent = Math.max(0, Math.min(1, Number(module.confidence) || 0)) * 100;
    const paramNames = (module.parameters || []).map((name) => DETECT_PARAM_LABELS[name] || name);
    return `
      <div class="detect-module">
        <div class="detect-module-head">
          <strong>${escapeHtml(DETECT_MODULE_LABELS[module.name] || module.name)}</strong>
          <span>${percent.toFixed(1)}%</span>
        </div>
        <div class="conf-bar"><i style="width:${percent.toFixed(1)}%"></i></div>
        <p>${paramNames.length ? `关联参数：${escapeHtml(paramNames.join("、"))}` : "无直接关联参数"}</p>
      </div>`;
  }).join("") || '<div class="detect-placeholder"><p>没有可显示的识别模块。</p></div>';

  const simulation = detectState.plot;
  if (simulation && simulation.plot) {
    plotNode.innerHTML = detectChartSvg(simulation.plot);
    const results = simulation.results || {};
    if (metricsNode) {
      metricsNode.innerHTML = [
        `<span class="chip">保留时间 <b>${fmt(results.retention_time, 4)} min</b></span>`,
        `<span class="chip">分离度 <b>${fmt(results.resolution, 3)}</b></span>`,
        `<span class="chip">峰数 <b>${fmt(results.peak_count, 0)}</b></span>`,
        `<span class="chip">拖尾因子 <b>${fmt(results.tailing_factor, 3)}</b></span>`,
      ].join("");
    }
    if (tableWrap && tableBody) {
      const peaks = Array.isArray(results.peaks) ? results.peaks : [];
      tableBody.innerHTML = peaks.map((peak, index) => `
        <tr>
          <td>P${index + 1}</td>
          <td>${fmt(peak.retention_time, 4)}</td>
          <td>${fmt(peak.relative_area, 1)}</td>
          <td>${escapeHtml(detectPeakAssignment(peak.assignment))}</td>
        </tr>`).join("");
      tableWrap.hidden = peaks.length === 0;
    }
  } else {
    plotNode.innerHTML = "";
    if (metricsNode) metricsNode.innerHTML = "";
    if (tableWrap) tableWrap.hidden = true;
  }
}

function syncDetectToSimulation() {
  const { parameters, errors } = readDetectParameters();
  renderDetectParameterErrors(errors);
  if (Object.keys(errors).length) {
    toast("请先修正六项方法参数", "err");
    return;
  }
  state.conditions.flow_ml_min = parameters.flow_rate;
  state.conditions.temperature_c = parameters.temperature;
  state.conditions.injection_volume_ul = parameters.injection_volume;
  state.conditions.wavelength_nm = parameters.detection_wavelength;
  state.conditions.percent_b = parameters.gradient;
  state.conditions.total_time_min = parameters.run_time;
  state.conditions.mode = "isocratic";
  syncControls();
  persist();
  scheduleSim(0);
  toast("已将界面检测参数同步到色谱模拟台", "ok");
}
