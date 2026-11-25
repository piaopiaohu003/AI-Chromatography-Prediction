'use strict';

/* Chromatographic method design: rule-based expert system + optional LLM.
 * Mirrors app/recommend.py.  The rule engine derives pH / organic modifier /
 * column / flow / wavelength and an isocratic or gradient program, validating
 * each candidate with the same physical simulation used by the API. */

const aiClient = require('./ai-client');
const {
  DEFAULT_GRADIENT, DEFAULT_COLUMN, isPlainObject,
} = require('./models');
const {
  epsRel, logKw, neutralFraction, sValue, npLogKRef, npS, tempFactor, simulate,
} = require('./simulation');
const { pyRound, clamp, mean, maxOf, minOf } = require('./util');

const PH_CANDIDATES = [2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.8, 7.5, 8.5, 9.5, 10.5];
const CHEMISTRY_LABELS = {
  c18: 'C18', silica: 'Silica', diol: 'Diol', amino: 'Amino',
};
const SOLVENT_LABELS = {
  ACN: '乙腈 (ACN)', MeOH: '甲醇 (MeOH)', IPA: '异丙醇 (IPA)', EtOAc: '乙酸乙酯 (EtOAc)',
};

function choosePhase(compounds, constraints) {
  if (constraints.phase === 'reversed' || constraints.phase === 'normal') {
    return constraints.phase;
  }
  if (!compounds.length) return 'reversed';
  const logps = compounds.map((c) => c.log_p).slice().sort((a, b) => a - b);
  const median = logps[Math.floor(logps.length / 2)];
  const ionizable = compounds.some((c) => c.pka !== null && c.pka !== undefined);
  return median >= 4.5 && !ionizable ? 'normal' : 'reversed';
}

const SYSTEM_PROMPT = `你是一名资深液相色谱方法开发专家，精通反相(RPLC)与正相(NPLC)色谱、QbD、LSS 保留模型、QSRR、pH/离子化控制与梯度优化。
你的任务是根据给定的组分性质设计一套可直接上机的科学色谱条件。

硬性要求：
1. 只输出一个 JSON 对象，不要 Markdown、不要代码块、不要解释性前后缀。
2. 必须使用下面给定的字段名与数据类型，数值使用数字而非字符串。
3. gradient 的时间必须从 0 开始且严格递增；最后一个点后建议再保持 3–5 min。
4. 若 mode 为 isocratic，则使用 percent_b；gradient 字段仍需给出但不会使用。
5. phase 只能是 "reversed" 或 "normal"。
6. 反相：pH 必须在 1–12；UV 可用磷酸盐，LC-MS 必须用挥发性缓冲盐；有机相只能是 "ACN" 或 "MeOH"；固定相用 "c18"。
7. 正相：pH 固定为 7 且不使用缓冲盐；B 相只能是 "IPA" 或 "EtOAc"（A 相为正己烷）；固定相用 "silica"、"diol" 或 "amino"。
8. 波长 200–360 nm；柱温 25–45 °C。
9. 目标：等度时各组分 k≈1–10；梯度时所有组分在运行时间内洗脱，相邻峰 Rs≥1.5。
10. 不要编造未提供的化合物性质；只能基于给出的 logP/pKa/λmax/logkw。
11. rationale、risks 使用简体中文，各 2–5 条，具体到数值依据。

JSON 结构：
{
  "method_name": "string",
  "phase": "reversed" | "normal",
  "mode": "gradient" | "isocratic",
  "organic": "ACN" | "MeOH" | "IPA" | "EtOAc",
  "percent_b": number,
  "gradient": [{"time_min": number, "percent_b": number}, ...],
  "flow_ml_min": number,
  "temperature_c": number,
  "ph": number,
  "wavelength_nm": number,
  "column": {"length_mm": number, "inner_diameter_mm": number, "particle_um": number, "chemistry": "c18" | "silica" | "diol" | "amino"},
  "dwell_volume_ml": number,
  "injection_volume_ul": number,
  "buffer_system": "string",
  "rationale": ["string", ...],
  "risks": ["string", ...],
  "expected_order": ["string", ...]
}`;

function defaultConditions() {
  return {
    mode: 'gradient',
    organic: 'ACN',
    percent_b: 50.0,
    gradient: DEFAULT_GRADIENT(),
    flow_ml_min: 1.0,
    temperature_c: 30.0,
    ph: 2.5,
    wavelength_nm: 254.0,
    column: { ...DEFAULT_COLUMN },
    dwell_volume_ml: 1.0,
    injection_volume_ul: 10.0,
    total_time_min: null,
    noise_mau: 0.15,
  };
}

function clampNumber(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function numberOr(value, defaultValue, low, high) {
  let parsed;
  if (value === undefined || value === null) {
    parsed = NaN;
  } else {
    try {
      parsed = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
    } catch (err) {
      parsed = NaN;
    }
  }
  if (!Number.isFinite(parsed)) {
    parsed = defaultValue;
  }
  return clampNumber(parsed, low, high);
}

function bufferFor(ph, detector) {
  if (detector === 'MS') {
    if (ph <= 3.0) {
      return '0.1% 甲酸水溶液（pH≈2.5，MS 兼容）';
    }
    if (ph <= 5.5) {
      return '5 mM 甲酸铵缓冲液（pH≈4.5，MS 兼容）';
    }
    if (ph <= 7.5) {
      return '10 mM 乙酸铵缓冲液（pH≈6.8，MS 兼容）';
    }
    if (ph <= 10.0) {
      return '10 mM 碳酸氢铵（pH≈9.0，MS 兼容，需耐碱柱）';
    }
    return '5 mM 碳酸铵/氨水（pH≈10.2，MS 兼容，需耐碱柱）';
  }
  if (ph <= 2.8) {
    return '0.1% 甲酸水溶液（pH≈2.5）';
  }
  if (ph <= 4.0) {
    return '10 mM 磷酸二氢钾缓冲液（pH≈3.0）';
  }
  if (ph <= 5.5) {
    return '10 mM 乙酸铵/乙酸缓冲液（pH≈4.8）';
  }
  if (ph <= 7.5) {
    return '10 mM 磷酸盐缓冲液（pH≈6.8）';
  }
  if (ph <= 10.0) {
    return '10 mM 碳酸氢铵（pH≈9.0，需耐碱柱）';
  }
  return '5 mM 碳酸铵/氨水（pH≈10.2，需耐碱柱）';
}

function choosePh(compounds, detector) {
  let bestPh = 2.5;
  let bestScore = -1e9;
  for (const ph of PH_CANDIDATES) {
    const logFractions = compounds.map((c) => Math.log10(Math.max(neutralFraction(c, ph), 1e-4)));
    let score = mean(logFractions);
    if (ph > 8.0) {
      score -= 0.35;
    }
    if (ph > 10.0) {
      score -= 0.15;
    }
    if (ph >= 7.0) {
      score -= 0.08;
    }
    if (ph < 2.8) {
      score -= 0.02 * Math.abs(ph - 2.5);
    }
    if (detector === 'MS' && ph > 8.5) {
      score -= 0.1;
    }
    if (score > bestScore + 1e-9) {
      bestScore = score;
      bestPh = ph;
    }
  }
  const notes = [];
  const sensitive = compounds
    .filter((c) => c.pka !== null && c.pka !== undefined && Math.abs(bestPh - c.pka) < 0.5)
    .map((c) => c.name);
  if (sensitive.length) {
    notes.push(
      '所选 pH 接近 ' + sensitive.join('、') + ' 的 pKa，建议在方法耐用性考察中验证 pH ±0.2 的影响。',
    );
  }
  return { ph: bestPh, notes };
}

function logKEffective(compounds, ph, temperatureC) {
  return compounds.map((compound) => {
    const neutral = Math.max(neutralFraction(compound, ph), 1e-8);
    const temp = Math.max(tempFactor(compound, temperatureC), 1e-8);
    return logKw(compound) + Math.log10(neutral) + Math.log10(temp);
  });
}

function chooseWavelength(compounds, detector) {
  if (detector === 'MS') {
    return { wavelength: 254.0, notes: [] };
  }
  let bestScore = -1.0;
  let bestLambda = 254.0;
  for (let wavelength = 200; wavelength <= 360; wavelength += 2) {
    let score = 0.0;
    for (const c of compounds) {
      score += epsRel(c, wavelength);
    }
    if (wavelength < 230) {
      score *= 0.9;
    }
    if (wavelength < 210) {
      score *= 0.9;
    }
    if (score > bestScore) {
      bestScore = score;
      bestLambda = wavelength;
    }
  }
  const weak = compounds
    .filter((c) => epsRel(c, bestLambda) < 0.05)
    .map((c) => `「${c.name}」`);
  const notes = [];
  if (weak.length) {
    notes.push(
      `${weak.join('、')}在 ${bestLambda.toFixed(0)} nm 吸收较弱，若灵敏度不足建议改用电化学/荧光/质谱检测。`,
    );
  }
  return { wavelength: bestLambda, notes };
}

function columnFor(detector, compoundCount, phase = 'reversed') {
  if (phase === 'normal') {
    if (detector === 'MS') {
      return {
        length_mm: 150.0,
        inner_diameter_mm: 2.1,
        particle_um: 3.0,
        flow: 0.3,
        dwell: 0.4,
        injection: 2.0,
        chemistry: 'silica',
        label: 'Silica, 150 × 2.1 mm, 3 µm（正相/MS）',
      };
    }
    const length = compoundCount >= 8 ? 250.0 : 150.0;
    return {
      length_mm: length,
      inner_diameter_mm: 4.6,
      particle_um: 5.0,
      flow: 1.0,
      dwell: 1.2,
      injection: 10.0,
      chemistry: 'silica',
      label: `Silica, ${Math.trunc(length)} × 4.6 mm, 5 µm`,
    };
  }
  if (detector === 'MS') {
    return {
      length_mm: 100.0,
      inner_diameter_mm: 2.1,
      particle_um: 1.8,
      flow: 0.3,
      dwell: 0.3,
      injection: 2.0,
      chemistry: 'c18',
      label: 'C18, 100 × 2.1 mm, 1.8 µm（UHPLC/MS）',
    };
  }
  const length = compoundCount >= 8 ? 250.0 : 150.0;
  return {
    length_mm: length,
    inner_diameter_mm: 4.6,
    particle_um: 5.0,
    flow: 1.0,
    dwell: 1.2,
    injection: 10.0,
    chemistry: 'c18',
    label: `C18, ${Math.trunc(length)} × 4.6 mm, 5 µm`,
  };
}

function buildConditions(options) {
  const {
    mode, organic, ph, wavelength, column,
    percentB = 50.0, gradient = null, phase = 'reversed',
  } = options;
  return {
    phase,
    mode,
    organic,
    percent_b: percentB,
    solvent_c: 'none',
    percent_c: 0.0,
    solvent_d: 'none',
    percent_d: 0.0,
    gradient: gradient || DEFAULT_GRADIENT(),
    flow_ml_min: column.flow,
    temperature_c: 30.0,
    ph,
    wavelength_nm: wavelength,
    column: {
      length_mm: column.length_mm,
      inner_diameter_mm: column.inner_diameter_mm,
      particle_um: column.particle_um,
      porosity: 0.65,
      chemistry: column.chemistry || 'c18',
    },
    dwell_volume_ml: column.dwell,
    injection_volume_ul: column.injection,
    total_time_min: null,
    noise_mau: 0.12,
  };
}

function gradientPoints(start, end, gradientTime) {
  const startValue = pyRound(clampNumber(start, 0.0, 100.0), 1);
  const endValue = pyRound(clampNumber(end, 5.0, 100.0), 1);
  const hold = pyRound(Math.max(3.0, Math.min(5.0, gradientTime * 0.20)), 1);
  return [
    { time_min: 0.0, percent_b: startValue },
    { time_min: pyRound(gradientTime, 1), percent_b: endValue },
    { time_min: pyRound(gradientTime + hold, 1), percent_b: endValue },
  ];
}

function simulationSummary(result) {
  const peaks = result.peaks;
  const visible = peaks.filter((p) => p.visible && p.tr_min !== null);
  return {
    visible,
    all_eluted: peaks.every((p) => p.tr_min !== null),
    missing: peaks.filter((p) => p.tr_min === null).length,
    first_tr: visible.length ? minOf(visible.map((p) => p.tr_min)) : null,
    last_tr: visible.length ? maxOf(visible.map((p) => p.tr_min)) : null,
    min_rs: result.metrics.min_resolution,
    min_k: visible.some((p) => p.k !== null && p.k !== undefined)
      ? minOf(visible.map((p) => p.k)) : null,
    t0: result.metrics.t0_min,
    pressure: result.metrics.pressure_bar,
  };
}

function scoreIsocratic(summary, maxRun) {
  if (summary.first_tr === null) {
    return -100.0;
  }
  let minRs = summary.min_rs;
  if (minRs === null || minRs === undefined) {
    minRs = 2.0;
  }
  let score = 3.0 * Math.min(minRs, 2.0);
  score -= 4.0 * summary.missing;
  if (summary.min_k !== null && summary.min_k !== undefined && summary.min_k < 1.0) {
    score -= 1.2 * (1.0 - summary.min_k);
  }
  if (summary.last_tr !== null) {
    score -= 0.05 * summary.last_tr;
  }
  if (summary.last_tr !== null && summary.last_tr > maxRun - 1.0) {
    score -= 5.0;
  }
  if (summary.first_tr !== null && summary.t0) {
    if (summary.first_tr < 1.4 * summary.t0) {
      score -= 0.8;
    }
  }
  if (summary.pressure && summary.pressure > 950) {
    score -= 1.5;
  }
  return score;
}

function scoreGradient(summary, gradientTime, maxRun) {
  if (summary.last_tr === null) {
    return -100.0;
  }
  let minRs = summary.min_rs;
  if (minRs === null || minRs === undefined) {
    minRs = 2.0;
  }
  let score = 3.0 * Math.min(minRs, 2.0);
  const ratio = summary.last_tr / Math.max(gradientTime, 1e-6);
  score -= 4.0 * Math.abs(ratio - 0.95);
  score -= 0.08 * gradientTime;
  score -= 4.0 * summary.missing;
  if (summary.first_tr !== null && summary.t0) {
    if (summary.first_tr < 2.2 * summary.t0) {
      score -= 1.5;
    }
  }
  if (summary.last_tr > gradientTime + 4.0) {
    score -= 2.5;
  }
  if (summary.last_tr > maxRun - 1.0) {
    score -= 5.0;
  }
  if (summary.pressure && summary.pressure > 950) {
    score -= 1.5;
  }
  return score;
}

function ruleNormalConditions(compounds, constraints) {
  const detector = constraints.detector;
  const organic = (constraints.organic === 'IPA' || constraints.organic === 'EtOAc')
    ? constraints.organic : 'IPA';
  const wavelengthChoice = chooseWavelength(compounds, detector);
  const wavelength = wavelengthChoice.wavelength;
  const column = columnFor(detector, compounds.length, 'normal');
  const logKRef = compounds.map((c) => npLogKRef(c));
  const sValues = compounds.map((c) => npS(c));

  const p10 = logKRef.map((lk, i) => (0.10 + (lk - 1.0) / sValues[i]) * 100.0);
  const p1 = logKRef.map((lk, i) => (0.10 + lk / sValues[i]) * 100.0);
  const p10Max = maxOf(p10);
  const p1Min = minOf(p1);
  const windowGap = p1Min - p10Max;
  const isocraticOk = (
    windowGap >= 4.0
    && p10Max >= 1.0
    && p10Max <= 45.0
    && (constraints.mode === 'auto' || constraints.mode === 'isocratic')
  );

  const rationale = [];
  const risks = [];
  rationale.push(...wavelengthChoice.notes);
  if (constraints.organic === 'ACN' || constraints.organic === 'MeOH') {
    rationale.push('正相模式不使用乙腈/甲醇，已改用异丙醇作为极性调节剂。');
  }

  let conditions;
  let result;
  let summary;
  let start = 2.0;
  let end = 40.0;

  if (isocraticOk) {
    let percentB = pyRound(clampNumber((p10Max + p1Min) / 2.0, 1.0, 55.0), 1);
    conditions = buildConditions({
      mode: 'isocratic', organic, ph: 7.0, wavelength, column, percentB, phase: 'normal',
    });
    result = simulate(compounds, conditions);
    summary = simulationSummary(result);
    if (summary.min_rs !== null && summary.min_rs < 1.2) {
      const adjusted = pyRound(clampNumber(percentB + 2.0, 1.0, 55.0), 1);
      const alt = buildConditions({
        mode: 'isocratic', organic, ph: 7.0, wavelength, column, percentB: adjusted, phase: 'normal',
      });
      const altResult = simulate(compounds, alt);
      const altSummary = simulationSummary(altResult);
      if ((altSummary.min_rs || 0) > (summary.min_rs || 0)) {
        conditions = alt;
        result = altResult;
        summary = altSummary;
        percentB = adjusted;
      }
    }
    rationale.push(
      `正相保留随极性调节剂比例升高而降低；取 k≈1–10 的中点，推荐 ${percentB.toFixed(1)}% ${organic} 等度。`,
    );
    if (constraints.mode === 'isocratic' && !isocraticOk) {
      risks.push('等度无法覆盖所有组分的正相保留窗口，实际建议改用梯度洗脱。');
    }
  } else {
    start = pyRound(clampNumber(p1Min - 10.0, 1.0, 20.0), 1);
    end = pyRound(clampNumber(p10Max + 18.0, Math.max(25.0, start + 15.0), 70.0), 1);
    let candidates = [6.0, 8.0, 10.0, 12.0, 15.0, 18.0, 22.0, 26.0, 30.0, 35.0, 40.0];
    candidates = candidates.filter((value) => value + 6.0 <= constraints.max_run_min);
    if (!candidates.length) {
      candidates = [Math.max(3.0, constraints.max_run_min - 6.0)];
    }

    let best = null;
    for (const gradientTime of candidates) {
      const points = gradientPoints(start, end, gradientTime);
      const trial = buildConditions({
        mode: 'gradient', organic, ph: 7.0, wavelength, column, gradient: points, phase: 'normal',
      });
      const trialResult = simulate(compounds, trial);
      const trialSummary = simulationSummary(trialResult);
      const score = scoreGradient(trialSummary, gradientTime, constraints.max_run_min);
      if (best === null || score > best.score) {
        best = {
          score, gradientTime, points, result: trialResult, summary: trialSummary,
        };
      }
    }

    const gradientTime = best.gradientTime;
    result = best.result;
    summary = best.summary;
    conditions = buildConditions({
      mode: 'gradient', organic, ph: 7.0, wavelength, column, gradient: best.points, phase: 'normal',
    });
    rationale.push(
      `组分极性跨度较大，等度无法同时满足 k=1–10，采用 ${start.toFixed(1)}→${end.toFixed(1)}% ${organic} 正相梯度。`,
    );
    rationale.push(
      `通过物理模型搜索梯度时间，选定 ${gradientTime.toFixed(0)} min，后接 3–5 min 保持。`,
    );
    if (!summary.all_eluted) {
      risks.push('在当前极性调节剂上限下仍有组分未洗脱，需提高末端 B 比例或改用更强极性溶剂。');
    }
    if (end >= 65.0) {
      risks.push('梯度末端极性溶剂比例较高，注意正相柱在高极性条件下的平衡时间。');
    }
  }

  rationale.push(
    `检测波长 ${wavelength.toFixed(0)} nm：在 200–360 nm 范围内使各组分吸光度之和最大。`,
  );
  rationale.push(
    `色谱柱 ${column.label}，流速 ${column.flow.toFixed(2)} mL/min，柱温 30 °C，进样 ${column.injection.toFixed(0)} µL。`,
  );
  rationale.push(
    '正相以正己烷为 A、极性溶剂为 B；不使用 pH 和缓冲盐，需控制流动相含水量并充分平衡色谱柱。',
  );
  result.warnings.push(...risks);
  rationalityMetricPush(rationale, result);

  const method = buildMethod(conditions, column, '');
  return {
    source: 'rule',
    ai_model: null,
    llm_error: null,
    conditions,
    result,
    method,
    rationale,
    risks,
    expected_order: expectedOrder(result),
  };
}

function ruleConditions(compounds, constraints) {
  const phase = choosePhase(compounds, constraints);
  if (phase === 'normal') {
    return ruleNormalConditions(compounds, constraints);
  }
  const detector = constraints.detector;
  const organic = (constraints.organic === 'auto' || constraints.organic === 'IPA' || constraints.organic === 'EtOAc')
    ? 'ACN' : constraints.organic;
  const phChoice = choosePh(compounds, detector);
  const ph = phChoice.ph;
  const wavelengthChoice = chooseWavelength(compounds, detector);
  const wavelength = wavelengthChoice.wavelength;
  const column = columnFor(detector, compounds.length);
  const logKEff = logKEffective(compounds, ph, 30.0);
  const sValues = compounds.map((c) => sValue(c, organic));

  // Percent B that would give k=10 (most retained) and k=1 (least retained)
  const p10 = logKEff.map((lk, i) => (lk - 1.0) / sValues[i] * 100.0);
  const p1 = logKEff.map((lk, i) => lk / sValues[i] * 100.0);
  const p10Max = maxOf(p10);
  const p1Min = minOf(p1);
  const windowGap = p1Min - p10Max;

  const isocraticOk = (
    windowGap >= 4.0
    && p10Max >= 2.0
    && p10Max <= 92.0
    && (constraints.mode === 'auto' || constraints.mode === 'isocratic')
  );
  const useIsocratic = constraints.mode === 'isocratic' ? true : isocraticOk;

  const rationale = [];
  const risks = [];
  rationale.push(...phChoice.notes);
  rationale.push(...wavelengthChoice.notes);

  let conditions;
  let result;
  let summary;

  if (useIsocratic) {
    // Search B-phase percentage with the physical model instead of a single midpoint.
    const grid = new Set();
    for (let value = 2.0; value <= 95.01; value += 2.0) {
      grid.add(pyRound(value, 1));
    }
    grid.add(pyRound(clampNumber((p10Max + p1Min) / 2.0, 2.0, 95.0), 1));
    let percentB = pyRound(clampNumber((p10Max + p1Min) / 2.0, 2.0, 95.0), 1);
    let best = null;
    for (const candidateB of Array.from(grid).sort((a, b) => a - b)) {
      const trial = buildConditions({
        mode: 'isocratic', organic, ph, wavelength, column, percentB: candidateB,
      });
      const trialResult = simulate(compounds, trial);
      const trialSummary = simulationSummary(trialResult);
      const score = scoreIsocratic(trialSummary, constraints.max_run_min);
      if (best === null || score > best.score) {
        best = {
          score, percentB: candidateB, result: trialResult, summary: trialSummary,
        };
      }
    }
    percentB = best.percentB;
    result = best.result;
    summary = best.summary;
    conditions = buildConditions({
      mode: 'isocratic', organic, ph, wavelength, column, percentB,
    });
    rationale.push(
      `通过物理模型扫描 B 相比例，选定 ${percentB.toFixed(1)}% ${organic} 等度，`
      + `预测最小分离度 ${summary.min_rs === null ? '—' : summary.min_rs.toFixed(2)}。`,
    );
    if (constraints.mode === 'isocratic' && !isocraticOk) {
      risks.push('等度无法同时满足所有组分的保留窗口，实际建议改用梯度洗脱。');
    }
  } else {
    const start = pyRound(clampNumber(p1Min - 12.0, 2.0, 30.0), 1);
    const end = pyRound(clampNumber(p10Max + 25.0, Math.max(35.0, start + 20.0), 98.0), 1);
    let candidates = [6.0, 8.0, 10.0, 12.0, 15.0, 18.0, 22.0, 26.0, 30.0, 35.0, 40.0, 50.0];
    candidates = candidates.filter((value) => value + 6.0 <= constraints.max_run_min);
    if (!candidates.length) {
      candidates = [Math.max(3.0, constraints.max_run_min - 6.0)];
    }

    let best = null;
    for (const gradientTime of candidates) {
      const points = gradientPoints(start, end, gradientTime);
      const trial = buildConditions({
        mode: 'gradient', organic, ph, wavelength, column, gradient: points,
      });
      const trialResult = simulate(compounds, trial);
      const trialSummary = simulationSummary(trialResult);
      const score = scoreGradient(trialSummary, gradientTime, constraints.max_run_min);
      if (best === null || score > best.score) {
        best = {
          score, gradientTime, points, result: trialResult, summary: trialSummary,
        };
      }
    }

    const gradientTime = best.gradientTime;
    result = best.result;
    summary = best.summary;
    conditions = buildConditions({
      mode: 'gradient', organic, ph, wavelength, column, gradient: best.points,
    });
    rationale.push(
      `组分疏水性跨度较大，等度无法同时满足 k=1–10，采用 ${start.toFixed(1)}→${end.toFixed(1)}% ${organic} 线性梯度。`,
    );
    rationale.push(
      `通过物理模型搜索梯度时间，选定 ${gradientTime.toFixed(0)} min（最晚峰约在梯度终点），后接 3–5 min 保持。`,
    );
    if (!summary.all_eluted) {
      risks.push('在当前有机相上限下仍有组分未洗脱，需提高末端有机相比例或使用更强溶剂。');
    }
    if (end >= 95.0) {
      risks.push('梯度末端接近 100% 有机相，注意缓冲盐在纯有机相中的溶解度与析出风险。');
    }
  }

  rationale.push(
    `检测波长 ${wavelength.toFixed(0)} nm：在 200–360 nm 范围内使各组分吸光度之和最大，兼顾灵敏度与基线噪声。`,
  );
  rationale.push(
    `色谱柱 ${column.label}，流速 ${column.flow.toFixed(2)} mL/min，柱温 30 °C，进样 ${column.injection.toFixed(0)} µL。`,
  );
  if (ph > 8.0) {
    risks.push('方法 pH 偏高，需选用耐碱色谱柱（杂化硅胶/聚合物载体）并评估柱寿命。');
  }
  if (compounds.some((c) => c.acid_base === 'base') && ph < 4.0) {
    risks.push('碱性组分在低 pH 下部分电离，若保留不足可考虑离子对试剂或提高 pH。');
  }

  const bufferText = bufferFor(ph, detector);
  rationale.push(`水相（A）：${bufferText}；有机相（B）：${organic === 'ACN' ? '乙腈' : '甲醇'}。`);

  result.warnings.push(...risks);
  rationalityMetricPush(rationale, result);

  const method = buildMethod(conditions, column, bufferText);

  return {
    source: 'rule',
    ai_model: null,
    llm_error: null,
    conditions,
    result,
    method,
    rationale,
    risks,
    expected_order: expectedOrder(result),
  };
}

function rationalityMetricPush(rationale, result) {
  const t0 = result.metrics.t0_min;
  const pressure = result.metrics.pressure_bar;
  rationale.push(
    `模型预测：死时间 ${t0.toFixed(2)} min，柱压约 ${pressure.toFixed(0)} bar，理论塔板数约 ${result.metrics.plates}。`,
  );
}

function buildMethod(conditions, column, bufferText) {
  const isNormal = conditions.phase === 'normal';
  const chemistry = CHEMISTRY_LABELS[conditions.column.chemistry] || 'C18';
  return {
    name: `${conditions.mode === 'gradient' ? '梯度' : '等度'} ${isNormal ? 'NPLC' : 'RPLC'} 方法`
      + `（${chemistry} / ${conditions.organic}）`,
    phase: conditions.phase || 'reversed',
    column_label: column.label,
    eluent_a: isNormal ? '正己烷 (n-hexane)' : bufferText,
    eluent_b: SOLVENT_LABELS[conditions.organic] || conditions.organic,
    buffer: isNormal ? '无（正相，不使用缓冲盐）' : bufferText,
    gradient: conditions.mode === 'gradient'
      ? conditions.gradient.map((p) => ({ time_min: p.time_min, percent_b: p.percent_b }))
      : [],
    isocratic_percent: conditions.mode === 'isocratic' ? conditions.percent_b : null,
    ph: conditions.ph,
    flow_ml_min: conditions.flow_ml_min,
    temperature_c: conditions.temperature_c,
    wavelength_nm: conditions.wavelength_nm,
    injection_volume_ul: conditions.injection_volume_ul,
  };
}

function expectedOrder(result) {
  return result.peaks
    .filter((p) => p.tr_min !== null)
    .slice()
    .sort((a, b) => a.tr_min - b.tr_min)
    .map((p) => ({ name: p.name, tr_min: p.tr_min }));
}

function coerceAiConditions(raw, fallback) {
  const phaseRaw = String(raw.phase !== undefined ? raw.phase : fallback.phase).toLowerCase();
  const phase = (phaseRaw.includes('normal') || phaseRaw.includes('正相')) ? 'normal' : 'reversed';
  const organicRaw = String(raw.organic !== undefined ? raw.organic : fallback.organic).toUpperCase();
  let organic;
  if (phase === 'normal') {
    organic = (organicRaw.includes('ETOAC') || organicRaw.includes('乙酸乙酯')) ? 'EtOAc' : 'IPA';
  } else {
    organic = (organicRaw.includes('MEOH') || organicRaw.includes('甲醇')) ? 'MeOH' : 'ACN';
  }
  const modeRaw = String(raw.mode !== undefined && raw.mode !== null ? raw.mode : 'gradient').toLowerCase();
  const mode = (modeRaw.startsWith('iso') || modeRaw.includes('等度')) ? 'isocratic' : 'gradient';

  const columnRaw = isPlainObject(raw.column) ? raw.column : {};
  const chemistryRaw = String(columnRaw.chemistry !== undefined ? columnRaw.chemistry : '').toLowerCase();
  let chemistry = ['c18', 'silica', 'diol', 'amino'].includes(chemistryRaw)
    ? chemistryRaw : (phase === 'normal' ? 'silica' : 'c18');
  if (phase === 'normal' && chemistry === 'c18') chemistry = 'silica';
  if (phase === 'reversed' && chemistry !== 'c18') chemistry = 'c18';
  const column = {
    length_mm: numberOr(columnRaw.length_mm, fallback.column.length_mm, 30, 300),
    inner_diameter_mm: numberOr(
      columnRaw.inner_diameter_mm !== undefined ? columnRaw.inner_diameter_mm : columnRaw.id_mm,
      fallback.column.inner_diameter_mm, 1.0, 10.0,
    ),
    particle_um: numberOr(
      columnRaw.particle_um !== undefined ? columnRaw.particle_um : columnRaw.dp_um,
      fallback.column.particle_um, 1.2, 10.0,
    ),
    porosity: 0.65,
    chemistry,
  };

  const rawGradient = raw.gradient;
  let points = [];
  if (Array.isArray(rawGradient)) {
    for (const item of rawGradient) {
      if (!isPlainObject(item)) {
        continue;
      }
      const timeValue = item.time_min !== undefined
        ? item.time_min
        : (item.time !== undefined ? item.time : item.t);
      const percentValue = item.percent_b !== undefined
        ? item.percent_b
        : (item.b_percent !== undefined ? item.b_percent : item.b);
      if (timeValue === undefined || timeValue === null || percentValue === undefined || percentValue === null) {
        continue;
      }
      points.push({
        time_min: numberOr(timeValue, 0.0, 0.0, 300.0),
        percent_b: numberOr(percentValue, 5.0, 0.0, 100.0),
      });
    }
  }
  points.sort((a, b) => a.time_min - b.time_min);
  // remove duplicate times
  const deduped = [];
  for (const point of points) {
    if (deduped.length && Math.abs(point.time_min - deduped[deduped.length - 1].time_min) < 1e-6) {
      deduped[deduped.length - 1] = point;
    } else {
      deduped.push(point);
    }
  }
  points = deduped;
  if (!points.length) {
    points = fallback.gradient.map((p) => ({ time_min: p.time_min, percent_b: p.percent_b }));
  }
  if (points[0].time_min > 0) {
    points.unshift({ time_min: 0.0, percent_b: points[0].percent_b });
  }
  if (points.length === 1) {
    points.push({ time_min: points[0].time_min + 10.0, percent_b: points[0].percent_b });
  }

  const percentB = numberOr(
    raw.percent_b,
    fallback.mode === 'isocratic' ? fallback.percent_b : points[0].percent_b,
    0.0, 100.0,
  );

  return {
    phase,
    mode,
    organic,
    percent_b: percentB,
    gradient: points,
    flow_ml_min: numberOr(
      raw.flow_ml_min !== undefined ? raw.flow_ml_min : raw.flow,
      fallback.flow_ml_min, 0.05, 5.0,
    ),
    temperature_c: numberOr(
      raw.temperature_c !== undefined ? raw.temperature_c : raw.temperature,
      30.0, 15.0, 60.0,
    ),
    ph: phase === 'normal' ? 7.0 : numberOr(
      raw.ph !== undefined ? raw.ph : raw.pH,
      2.5, 1.0, 12.0,
    ),
    wavelength_nm: numberOr(
      raw.wavelength_nm !== undefined ? raw.wavelength_nm : raw.wavelength,
      254.0, 190.0, 400.0,
    ),
    column,
    dwell_volume_ml: numberOr(raw.dwell_volume_ml, 1.0, 0.0, 3.0),
    injection_volume_ul: numberOr(
      raw.injection_volume_ul !== undefined ? raw.injection_volume_ul : raw.injection_ul,
      10.0, 0.1, 100.0,
    ),
    total_time_min: null,
    noise_mau: 0.12,
  };
}

async function aiConditions(compounds, constraints, override) {
  const config = aiClient.resolveConfig(override || null);
  if (!config.configured) {
    throw new aiClient.AIError('未配置大模型 API Key，已使用本地规则专家系统');
  }

  const payload = {
    task: '为下列组分设计一套科学、可上机的液相色谱条件（反相或正相）',
    constraints: {
      detector: constraints.detector,
      preferred_phase: constraints.phase,
      preferred_organic: constraints.organic,
      preferred_mode: constraints.mode,
      max_run_min: constraints.max_run_min,
    },
    system: {
      model: 'LSS: log10 k = log10 k0 - S*phi; 系统延迟体积已计入梯度',
      normal_phase: 'A=正己烷，B=异丙醇或乙酸乙酯，pH 不适用',
      note: '梯度表时间指泵程序时间；模拟器会自动加入 dwell volume 延迟',
    },
    compounds: compounds.map((c) => ({
      name: c.name,
      logP: c.log_p,
      pKa: c.pka,
      acid_base: c.acid_base,
      lambda_max_nm: c.lambda_max_nm,
      log_kw: pyRound(logKw(c), 3),
      S_default: pyRound(sValue(c, 'ACN'), 2),
      log_k_np_ref: pyRound(npLogKRef(c), 3),
      S_np: pyRound(npS(c), 2),
      concentration_mg_L: c.concentration_mg_l,
    })),
  };
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(payload) },
  ];
  const content = await aiClient.chat(config, messages, { temperature: 0.2, jsonMode: true });
  const raw = aiClient.extractJson(content);
  const fallbackPhase = choosePhase(compounds, constraints);
  const fallback = {
    ...defaultConditions(),
    phase: fallbackPhase,
    organic: fallbackPhase === 'normal' ? 'IPA' : 'ACN',
    ph: fallbackPhase === 'normal' ? 7.0 : 2.5,
    column: {
      ...defaultConditions().column,
      chemistry: fallbackPhase === 'normal' ? 'silica' : 'c18',
    },
  };
  const conditions = coerceAiConditions(raw, fallback);

  // Respect explicit user preferences
  if (constraints.mode === 'gradient') {
    conditions.mode = 'gradient';
  } else if (constraints.mode === 'isocratic') {
    conditions.mode = 'isocratic';
    if (!(conditions.percent_b >= 0.0 && conditions.percent_b <= 100.0)) {
      conditions.percent_b = 100.0;
    }
  }
  if (constraints.phase !== 'auto' && conditions.phase !== constraints.phase) {
    conditions.phase = constraints.phase;
    conditions.ph = conditions.phase === 'normal' ? 7.0 : 2.5;
    conditions.column.chemistry = conditions.phase === 'normal' ? 'silica' : 'c18';
    conditions.organic = conditions.phase === 'normal' ? 'IPA' : 'ACN';
  }
  if (constraints.organic !== 'auto') {
    if (conditions.phase === 'normal' && ['IPA', 'EtOAc'].includes(constraints.organic)) {
      conditions.organic = constraints.organic;
    } else if (conditions.phase === 'reversed' && ['ACN', 'MeOH'].includes(constraints.organic)) {
      conditions.organic = constraints.organic;
    }
  }

  const result = simulate(compounds, conditions);
  let rationale = Array.isArray(raw.rationale)
    ? raw.rationale.map((x) => String(x)).filter((x) => x.trim())
    : [];
  const risks = Array.isArray(raw.risks)
    ? raw.risks.map((x) => String(x)).filter((x) => x.trim())
    : [];
  if (!rationale.length) {
    const reasoning = raw.reasoning;
    if (typeof reasoning === 'string' && reasoning.trim()) {
      rationale = [reasoning.trim()];
    }
  }
  if (!rationale.length) {
    rationale = ['大模型未返回结构化设计依据，结果已通过物理模型复核。'];
  }

  const isNormal = conditions.phase === 'normal';
  const bufferText = isNormal
    ? '无（正相，不使用缓冲盐）'
    : String(raw.buffer_system || bufferFor(conditions.ph, constraints.detector));
  const chemistry = CHEMISTRY_LABELS[conditions.column.chemistry] || 'C18';
  const method = {
    name: String(raw.method_name || (isNormal ? 'AI 设计 NPLC 方法' : 'AI 设计 RPLC 方法')),
    phase: conditions.phase,
    column_label: `${chemistry}, ${conditions.column.length_mm.toFixed(0)} × ${conditions.column.inner_diameter_mm.toFixed(1)} mm, `
      + `${conditions.column.particle_um.toFixed(1)} µm`,
    eluent_a: isNormal ? '正己烷 (n-hexane)' : bufferText,
    eluent_b: SOLVENT_LABELS[conditions.organic] || conditions.organic,
    buffer: bufferText,
    gradient: conditions.mode === 'gradient'
      ? conditions.gradient.map((p) => ({ time_min: p.time_min, percent_b: p.percent_b }))
      : [],
    isocratic_percent: conditions.mode === 'isocratic' ? conditions.percent_b : null,
    ph: conditions.ph,
    flow_ml_min: conditions.flow_ml_min,
    temperature_c: conditions.temperature_c,
    wavelength_nm: conditions.wavelength_nm,
    injection_volume_ul: conditions.injection_volume_ul,
  };

  if (!result.peaks.every((p) => p.tr_min !== null)) {
    risks.push('AI 条件下仍有组分未在运行时间内洗脱，已保留模拟结果供复核。');
  }
  result.warnings.push(...risks);

  return {
    source: 'llm',
    ai_model: config.model,
    llm_error: null,
    conditions,
    result,
    method,
    rationale,
    risks,
    expected_order: expectedOrder(result),
  };
}

function resultQuality(result) {
  const peaks = result.peaks || [];
  if (!peaks.length || peaks.some((p) => p.tr_min === null)) {
    return -1.0;
  }
  if (!peaks.some((p) => p.visible)) {
    return -1.0;
  }
  const value = result.metrics ? result.metrics.min_resolution : null;
  return value === null || value === undefined ? 2.0 : Number(value);
}

async function recommend(compounds, constraints, override) {
  const config = aiClient.resolveConfig(override || null);

  if (config.configured) {
    try {
      const aiResult = await aiConditions(compounds, constraints, override);
      const ruleResult = ruleConditions(compounds, constraints);
      const aiQuality = resultQuality(aiResult);
      const ruleQuality = resultQuality(ruleResult);
      if (aiQuality < 0 || (aiQuality < 1.2 && ruleQuality > aiQuality + 0.25)) {
        ruleResult.llm_error = '大模型方案经物理模型复核存在未洗脱组分或分离度不足，'
          + '已自动改用规则专家系统方案。';
        return ruleResult;
      }
      return aiResult;
    } catch (exc) {
      const ruleResult = ruleConditions(compounds, constraints);
      ruleResult.llm_error = `大模型调用失败，已使用规则专家系统：${exc.message || exc}`;
      return ruleResult;
    }
  }

  const ruleResult = ruleConditions(compounds, constraints);
  ruleResult.llm_error = null;
  return ruleResult;
}

module.exports = {
  PH_CANDIDATES,
  SYSTEM_PROMPT,
  bufferFor,
  choosePh,
  chooseWavelength,
  columnFor,
  ruleConditions,
  aiConditions,
  coerceAiConditions,
  recommend,
};
