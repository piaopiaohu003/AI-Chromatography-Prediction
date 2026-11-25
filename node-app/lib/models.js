'use strict';

/* Request normalisation mirroring the Pydantic models of the Python service.
 * Missing optional fields get the same defaults; values are range-checked and
 * a ValidationError is reported as HTTP 400. */

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const DEFAULT_GRADIENT = () => [
  { time_min: 0.0, percent_b: 5.0 },
  { time_min: 20.0, percent_b: 95.0 },
  { time_min: 25.0, percent_b: 95.0 },
];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseNumber(value, field, options = {}) {
  const { required = false, defaultValue = null, min = -Infinity, max = Infinity } = options;
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new ValidationError(`${field} 为必填项`);
    }
    return defaultValue;
  }
  let parsed;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    parsed = Number(value);
  } else {
    throw new ValidationError(`${field} 必须是数字`);
  }
  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${field} 必须是有限数字`);
  }
  if (parsed < min || parsed > max) {
    throw new ValidationError(`${field} 超出允许范围（${min} – ${max}）`);
  }
  return parsed;
}

function parseInteger(value, field, options = {}) {
  const parsed = parseNumber(value, field, options);
  if (parsed === null || parsed === undefined) {
    return parsed;
  }
  if (!Number.isInteger(parsed)) {
    throw new ValidationError(`${field} 必须是整数`);
  }
  return parsed;
}

function parseString(value, field, options = {}) {
  const { required = false, defaultValue = null } = options;
  if (value === undefined || value === null) {
    if (required) {
      throw new ValidationError(`${field} 为必填项`);
    }
    return defaultValue;
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} 必须是字符串`);
  }
  return value;
}

function parseLiteral(value, field, allowed, defaultValue) {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (!allowed.includes(value)) {
    throw new ValidationError(`${field} 必须是 ${allowed.join(' / ')} 之一`);
  }
  return value;
}

function parseBoolean(value, field, defaultValue) {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${field} 必须是布尔值`);
  }
  return value;
}

const COLUMN_DEFAULTS = {
  length_mm: 150.0,
  inner_diameter_mm: 4.6,
  particle_um: 5.0,
  porosity: 0.65,
  chemistry: 'c18',
};

function normalizeColumn(raw, path) {
  if (raw === undefined || raw === null) {
    return { ...COLUMN_DEFAULTS };
  }
  if (!isPlainObject(raw)) {
    throw new ValidationError(`${path} 必须是对象`);
  }
  return {
    length_mm: parseNumber(raw.length_mm, `${path}.length_mm`, { defaultValue: 150.0, min: 30.0, max: 300.0 }),
    inner_diameter_mm: parseNumber(raw.inner_diameter_mm, `${path}.inner_diameter_mm`, { defaultValue: 4.6, min: 1.0, max: 10.0 }),
    particle_um: parseNumber(raw.particle_um, `${path}.particle_um`, { defaultValue: 5.0, min: 1.2, max: 10.0 }),
    porosity: parseNumber(raw.porosity, `${path}.porosity`, { defaultValue: 0.65, min: 0.45, max: 0.85 }),
    chemistry: parseLiteral(raw.chemistry, `${path}.chemistry`, ['c18', 'silica', 'diol', 'amino'], 'c18'),
  };
}

function normalizeGradient(raw, path) {
  if (raw === undefined || raw === null) {
    return DEFAULT_GRADIENT();
  }
  if (!Array.isArray(raw)) {
    throw new ValidationError(`${path} 必须是数组`);
  }
  return raw.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isPlainObject(item)) {
      throw new ValidationError(`${itemPath} 必须是对象`);
    }
    return {
      time_min: parseNumber(item.time_min, `${itemPath}.time_min`, { required: true, min: 0.0, max: 600.0 }),
      percent_b: parseNumber(item.percent_b, `${itemPath}.percent_b`, { required: true, min: 0.0, max: 100.0 }),
    };
  });
}

function parseOptionalLabel(value, path) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > 40) {
    throw new ValidationError(`${path} 长度不能超过 40`);
  }
  return text;
}

function normalizeConditions(raw, path = 'conditions') {
  if (!isPlainObject(raw)) {
    throw new ValidationError(`${path} 为必填对象`);
  }
  const totalRaw = raw.total_time_min;
  let totalTime = null;
  if (totalRaw !== undefined && totalRaw !== null) {
    totalTime = parseNumber(totalRaw, `${path}.total_time_min`, { min: 1.0, max: 300.0 });
  }
  return {
    phase: parseLiteral(raw.phase, `${path}.phase`, ['reversed', 'normal'], 'reversed'),
    mode: parseLiteral(raw.mode, `${path}.mode`, ['isocratic', 'gradient'], 'gradient'),
    organic: parseLiteral(
      raw.organic,
      `${path}.organic`,
      ['ACN', 'MeOH', 'IPA', 'EtOAc', 'THF', 'EtOH', 'custom'],
      'ACN',
    ),
    organic_label: parseOptionalLabel(raw.organic_label, `${path}.organic_label`),
    aqueous: parseLiteral(
      raw.aqueous,
      `${path}.aqueous`,
      ['auto', 'water', 'buffer', 'hexane', 'heptane', 'cyclohexane', 'custom'],
      'auto',
    ),
    aqueous_label: parseOptionalLabel(raw.aqueous_label, `${path}.aqueous_label`),
    percent_b: parseNumber(raw.percent_b, `${path}.percent_b`, { defaultValue: 50.0, min: 0.0, max: 100.0 }),
    solvent_c: parseLiteral(
      raw.solvent_c,
      `${path}.solvent_c`,
      ['none', 'ACN', 'MeOH', 'THF', 'EtOH', 'IPA', 'EtOAc',
        'water', 'buffer', 'hexane', 'heptane', 'cyclohexane', 'custom'],
      'none',
    ),
    solvent_c_label: parseOptionalLabel(raw.solvent_c_label, `${path}.solvent_c_label`),
    percent_c: parseNumber(raw.percent_c, `${path}.percent_c`, { defaultValue: 0.0, min: 0.0, max: 100.0 }),
    solvent_d: parseLiteral(
      raw.solvent_d,
      `${path}.solvent_d`,
      ['none', 'ACN', 'MeOH', 'THF', 'EtOH', 'IPA', 'EtOAc',
        'water', 'buffer', 'hexane', 'heptane', 'cyclohexane', 'custom'],
      'none',
    ),
    solvent_d_label: parseOptionalLabel(raw.solvent_d_label, `${path}.solvent_d_label`),
    percent_d: parseNumber(raw.percent_d, `${path}.percent_d`, { defaultValue: 0.0, min: 0.0, max: 100.0 }),
    gradient: normalizeGradient(raw.gradient, `${path}.gradient`),
    flow_ml_min: parseNumber(raw.flow_ml_min, `${path}.flow_ml_min`, { defaultValue: 1.0, min: 0.05, max: 5.0 }),
    temperature_c: parseNumber(raw.temperature_c, `${path}.temperature_c`, { defaultValue: 30.0, min: 10.0, max: 70.0 }),
    ph: parseNumber(raw.ph, `${path}.ph`, { defaultValue: 2.5, min: 0.5, max: 13.0 }),
    wavelength_nm: parseNumber(raw.wavelength_nm, `${path}.wavelength_nm`, { defaultValue: 254.0, min: 180.0, max: 800.0 }),
    column: normalizeColumn(raw.column, `${path}.column`),
    dwell_volume_ml: parseNumber(raw.dwell_volume_ml, `${path}.dwell_volume_ml`, { defaultValue: 1.0, min: 0.0, max: 5.0 }),
    injection_volume_ul: parseNumber(raw.injection_volume_ul, `${path}.injection_volume_ul`, { defaultValue: 10.0, min: 0.1, max: 100.0 }),
    total_time_min: totalTime,
    noise_mau: parseNumber(raw.noise_mau, `${path}.noise_mau`, { defaultValue: 0.15, min: 0.0, max: 2.0 }),
  };
}

function normalizeCompound(raw, path) {
  if (!isPlainObject(raw)) {
    throw new ValidationError(`${path} 必须是对象`);
  }
  const id = parseString(raw.id, `${path}.id`, { required: true });
  const name = parseString(raw.name, `${path}.name`, { required: true });
  const logP = parseNumber(raw.log_p, `${path}.log_p`, { required: true });
  return {
    id,
    name,
    name_en: parseString(raw.name_en, `${path}.name_en`, { defaultValue: null }),
    category: parseString(raw.category, `${path}.category`, { defaultValue: null }),
    log_p: logP,
    pka: parseNumber(raw.pka, `${path}.pka`, { defaultValue: null }),
    acid_base: parseLiteral(raw.acid_base, `${path}.acid_base`, ['acid', 'base', 'neutral'], 'neutral'),
    lambda_max_nm: parseNumber(raw.lambda_max_nm, `${path}.lambda_max_nm`, { defaultValue: 254.0 }),
    concentration_mg_l: parseNumber(raw.concentration_mg_l, `${path}.concentration_mg_l`, { defaultValue: 100.0, min: 0.01, max: 10000.0 }),
    log_kw: parseNumber(raw.log_kw, `${path}.log_kw`, { defaultValue: null }),
    s_value: parseNumber(raw.s_value, `${path}.s_value`, { defaultValue: null }),
    log_k_np: parseNumber(raw.log_k_np, `${path}.log_k_np`, { defaultValue: null }),
    s_np: parseNumber(raw.s_np, `${path}.s_np`, { defaultValue: null }),
    epsilon_max: parseNumber(raw.epsilon_max, `${path}.epsilon_max`, { defaultValue: 1.0 }),
  };
}

function normalizeCompoundList(raw, path, maxLength) {
  if (!Array.isArray(raw)) {
    throw new ValidationError(`${path} 必须是数组`);
  }
  if (maxLength !== undefined && raw.length > maxLength) {
    throw new ValidationError(`${path} 最多 ${maxLength} 个，当前 ${raw.length} 个`);
  }
  return raw.map((item, index) => normalizeCompound(item, `${path}[${index}]`));
}

function normalizeConstraints(raw, path = 'constraints') {
  if (raw === undefined || raw === null) {
    return { detector: 'UV', phase: 'auto', organic: 'auto', mode: 'auto', max_run_min: 40.0 };
  }
  if (!isPlainObject(raw)) {
    throw new ValidationError(`${path} 必须是对象`);
  }
  return {
    detector: parseLiteral(raw.detector, `${path}.detector`, ['UV', 'MS'], 'UV'),
    phase: parseLiteral(raw.phase, `${path}.phase`, ['auto', 'reversed', 'normal'], 'auto'),
    organic: parseLiteral(raw.organic, `${path}.organic`, ['auto', 'ACN', 'MeOH', 'IPA', 'EtOAc'], 'auto'),
    mode: parseLiteral(raw.mode, `${path}.mode`, ['auto', 'isocratic', 'gradient'], 'auto'),
    max_run_min: parseNumber(raw.max_run_min, `${path}.max_run_min`, { defaultValue: 40.0, min: 8.0, max: 120.0 }),
  };
}

function normalizeAIOverride(raw, path = 'ai') {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (!isPlainObject(raw)) {
    throw new ValidationError(`${path} 必须是对象`);
  }
  return {
    base_url: parseString(raw.base_url, `${path}.base_url`, { defaultValue: null }),
    api_key: parseString(raw.api_key, `${path}.api_key`, { defaultValue: null }),
    model: parseString(raw.model, `${path}.model`, { defaultValue: null }),
  };
}

function normalizeObservedPeak(raw, path) {
  if (!isPlainObject(raw)) {
    throw new ValidationError(`${path} 必须是对象`);
  }
  return {
    label: parseString(raw.label, `${path}.label`, { defaultValue: null }),
    tr_min: parseNumber(raw.tr_min, `${path}.tr_min`, { required: true, min: 0.0, max: 600.0 }),
    height_mau: parseNumber(raw.height_mau, `${path}.height_mau`, { defaultValue: null, min: 0.0 }),
    area: parseNumber(raw.area, `${path}.area`, { defaultValue: null, min: 0.0 }),
    lambda_max_nm: parseNumber(raw.lambda_max_nm, `${path}.lambda_max_nm`, { defaultValue: null, min: 180.0, max: 800.0 }),
  };
}

function normalizeIdentifyRequest(raw) {
  if (!isPlainObject(raw)) {
    throw new ValidationError('请求体必须是 JSON 对象');
  }
  if (!Array.isArray(raw.observed_peaks)) {
    throw new ValidationError('observed_peaks 必须是数组');
  }
  if (raw.observed_peaks.length < 1 || raw.observed_peaks.length > 20) {
    throw new ValidationError('observed_peaks 数量必须在 1 – 20 之间');
  }
  let candidates = null;
  if (raw.candidates !== undefined && raw.candidates !== null) {
    candidates = normalizeCompoundList(raw.candidates, 'candidates', 200);
  }
  return {
    conditions: normalizeConditions(raw.conditions, 'conditions'),
    observed_peaks: raw.observed_peaks.map((item, index) => normalizeObservedPeak(item, `observed_peaks[${index}]`)),
    candidates,
    tolerance_min: parseNumber(raw.tolerance_min, 'tolerance_min', { defaultValue: 0.20, min: 0.02, max: 2.0 }),
    tolerance_pct: parseNumber(raw.tolerance_pct, 'tolerance_pct', { defaultValue: 0.02, min: 0.0, max: 0.10 }),
    min_score: parseNumber(raw.min_score, 'min_score', { defaultValue: 0.35, min: 0.0, max: 1.0 }),
    max_candidates: parseInteger(raw.max_candidates, 'max_candidates', { defaultValue: 5, min: 1, max: 10 }),
    include_reconstruction: parseBoolean(raw.include_reconstruction, 'include_reconstruction', true),
  };
}

module.exports = {
  ValidationError,
  DEFAULT_GRADIENT,
  DEFAULT_COLUMN: COLUMN_DEFAULTS,
  isPlainObject,
  normalizeColumn,
  normalizeGradient,
  normalizeConditions,
  normalizeCompound,
  normalizeCompoundList,
  normalizeConstraints,
  normalizeAIOverride,
  normalizeObservedPeak,
  normalizeIdentifyRequest,
};
