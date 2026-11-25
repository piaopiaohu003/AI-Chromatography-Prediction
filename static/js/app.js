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
  c18: "C18", silica: "Silica", diol: "Diol", amino: "Amino",
};

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
  user: null,
  account: {
    preferences: { ...DEFAULT_PREFERENCES },
    favorites: [],
  },
};

const charts = { sim: null, ai: null };
let simTimer = null;
let simAbort = null;
let libraryTimer = null;
let libraryAbort = null;
let librarySeq = 0;
const quickSearch = { query: "", online: [], active: -1, loading: false };
let quickTimer = null;
let quickAbort = null;
let quickSeq = 0;
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
      state.tab = raw.tab === "ai" ? "ai" : "sim";
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
}

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";
  const register = authMode === "register";
  $$("#auth-tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.authTab === authMode);
  });
  $("#auth-confirm-field").classList.toggle("hidden", !register);
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
  const password = $("#auth-password").value;
  const confirm = $("#auth-confirm").value;
  if (!username || !password) {
    showAuthError("请输入用户名和密码");
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
      body: JSON.stringify({ username, password }),
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
  const allowedChemistry = phase === "normal" ? ["silica", "diol", "amino"] : ["c18"];
  if (!allowedChemistry.includes(state.conditions.column.chemistry)) {
    state.conditions.column.chemistry = phase === "normal" ? "silica" : "c18";
  }
  state.aiConstraints.detector = preferences.default_detector === "MS" ? "MS" : "UV";
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
    const slider = $(`#percent-${slot}`);
    if (slider) {
      slider.value = String(percent);
      slider.disabled = value === "none";
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
        out.textContent = `${Math.round(percent)}% · ${label}`;
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
  $("#grad-hint").textContent = "时间从 0 min 起，%B 为 B 相体积分数";
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
  const allowed = normal ? ["silica", "diol", "amino"] : ["c18"];
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
      + `${mobileNote} · λ ${Math.round(state.conditions.wavelength_nm)} nm · `
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
      || quickSearch.online.find((c) => c.id === id);
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
  return local.concat(online).slice(0, 12);
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
    return `
      <div class="quick-result ${index === quickSearch.active ? "active" : ""} ${added ? "added" : ""}"
        role="option" aria-selected="${index === quickSearch.active}" data-quick-id="${escapeHtml(item.id)}">
        <div class="qr-main">
          <div class="qr-name">${escapeHtml(item.name)}${online ? '<span class="qr-tag">PubChem·估算</span>' : ""}</div>
          <div class="qr-meta">${escapeHtml(item.name_en || item.id)} · logP ${fmt(item.log_p, 1)}${item.pka != null ? ` · pKa ${fmt(item.pka, 1)}` : ""}</div>
        </div>
        <span class="qr-add">${added ? "已添加" : "添加"}</span>
      </div>
    `;
  }).join("");
  const status = quickSearch.loading
    ? '<div class="quick-status">正在检索 PubChem…</div>'
    : (!items.length
      ? `<div class="quick-status">未找到匹配化合物${quickSearch.query.length < 2 ? "，输入 2 个字符以上可检索 PubChem" : ""}</div>`
      : "");
  box.innerHTML = rows + status;
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
  quickSearch.online = [];
  quickSearch.loading = false;
  quickSeq += 1;
  if (query.length < 2) {
    renderQuickResults();
    return;
  }
  quickSearch.loading = true;
  renderQuickResults();
  quickTimer = setTimeout(() => runQuickOnline(query), 350);
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

function addQuickCompound(item) {
  if (state.compounds.some((c) => c.id === item.id)) {
    toast("该组分已在样品中");
    return;
  }
  if (state.compounds.length >= 20) {
    toast("样品组分已达上限 20 个", "err");
    return;
  }
  state.compounds.push({ ...item, concentration_mg_l: 100 });
  quickSearch.query = "";
  quickSearch.online = [];
  const input = $("#quick-search");
  if (input) input.value = "";
  closeQuickResults();
  onCompoundsChanged();
  toast(
    item.estimated ? `已添加「${item.name}」，在线参数为估算值` : `已添加「${item.name}」`,
    "ok",
  );
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
