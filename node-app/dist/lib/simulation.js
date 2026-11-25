'use strict';

/* Reversed-phase HPLC retention and chromatogram simulation.
 *
 * Scientific model (identical to the Python engine):
 *  1. LSS retention: log10 k = log10 k_w - S * phi
 *  2. Ionisation: effective k scaled by the neutral fraction at the given pH.
 *  3. Temperature: van 't Hoff correction of k_w.
 *  4. Plate height: Knox-like reduced van Deemter form.
 *  5. Gradient elution: numerical integration of solute migration including the
 *     system dwell volume (no numpy/scipy dependency).
 *  6. Peak shape: exponentially modified Gaussian (EMG), as scipy exponnorm
 *     with K = TAIL_RATIO, implemented through a stable erfc approximation. */

const {
  clamp, pyRound, interp, linspace, mean, maxOf, minOf, NormalRng, exponnormPdf,
} = require('./util');

const R_GAS = 8.314462618;
const WATER_VISC = 0.00089; // Pa.s at 25 C
const ORGANIC_PROPS = {
  ACN: { visc: 0.00037, dm: 0.060, label: '乙腈' }, // Dm in mm^2/min
  MeOH: { visc: 0.00055, dm: 0.052, label: '甲醇' },
  IPA: { visc: 0.00240, dm: 0.045, label: '异丙醇' },
  EtOAc: { visc: 0.00043, dm: 0.070, label: '乙酸乙酯' },
  THF: { visc: 0.00046, dm: 0.065, label: '四氢呋喃' },
  EtOH: { visc: 0.00109, dm: 0.050, label: '乙醇' },
};
const AQUEOUS_PROPS = {
  water: { visc: WATER_VISC, label: '水' },
  buffer: { visc: 0.00095, label: '缓冲水相' },
  hexane: { visc: 0.00030, label: '正己烷' },
  heptane: { visc: 0.00039, label: '正庚烷' },
  cyclohexane: { visc: 0.00098, label: '环己烷' },
};
const PHASE_PROPS = {
  reversed: { base_visc: WATER_VISC },
  normal: { base_visc: 0.00030 }, // n-hexane at 25 C
};
const HEXANE_FAMILY = ['hexane', 'heptane', 'cyclohexane'];
const AQUEOUS_FAMILY = ['water', 'buffer'];

function organicKey(conditions) {
  if (conditions.organic === 'custom') {
    return conditions.phase === 'normal' ? 'IPA' : 'ACN';
  }
  return conditions.organic;
}

function organicLabel(conditions) {
  if (conditions.organic === 'custom' && conditions.organic_label) {
    return String(conditions.organic_label).trim();
  }
  return ORGANIC_PROPS[organicKey(conditions)].label;
}

function aqueousKey(conditions) {
  if (conditions.aqueous === 'auto' || conditions.aqueous === undefined) {
    return conditions.phase === 'normal' ? 'hexane' : 'water';
  }
  return conditions.aqueous;
}

function aqueousLabel(conditions) {
  if (conditions.aqueous === 'custom') {
    return conditions.aqueous_label ? String(conditions.aqueous_label).trim() : '自定义非有机相';
  }
  return AQUEOUS_PROPS[aqueousKey(conditions)].label;
}

function aqueousViscosity(conditions) {
  const key = aqueousKey(conditions);
  if (key === 'custom') {
    return PHASE_PROPS[conditions.phase].base_visc;
  }
  return AQUEOUS_PROPS[key].visc;
}

// Relative elution strength of auxiliary solvents (1.0 = primary modifier).
const MODIFIER_STRENGTH = {
  reversed: {
    ACN: 1.00, MeOH: 0.86, THF: 1.30, EtOH: 0.76, IPA: 0.98, EtOAc: 1.12,
  },
  normal: {
    IPA: 1.00, EtOAc: 0.88, THF: 1.22, EtOH: 1.01, MeOH: 1.25, ACN: 1.12,
  },
};

function channelKey(value, phase) {
  if (!value || value === 'none') {
    return null;
  }
  if (value === 'custom') {
    return phase === 'normal' ? 'IPA' : 'ACN';
  }
  return value;
}

function channelViscosity(key, phase) {
  if (!key) {
    return 0.0;
  }
  if (ORGANIC_PROPS[key]) {
    return ORGANIC_PROPS[key].visc;
  }
  return (AQUEOUS_PROPS[key] || { visc: PHASE_PROPS[phase].base_visc }).visc;
}

function auxLabel(value, customLabel) {
  if (value === 'custom') {
    return customLabel ? String(customLabel).trim() : '自定义溶剂';
  }
  if (ORGANIC_PROPS[value]) {
    return ORGANIC_PROPS[value].label;
  }
  return (AQUEOUS_PROPS[value] || {}).label || value;
}

function channelStrength(key, phase) {
  if (!key || MODIFIER_STRENGTH[phase][key] === undefined) {
    return 0.0;
  }
  return MODIFIER_STRENGTH[phase][key];
}

function modifierPhi(percentB, percentC, percentD, conditions) {
  const phase = conditions.phase;
  const pB = Number(percentB) || 0.0;
  const pC = Number(percentC) || 0.0;
  const pD = Number(percentD) || 0.0;
  const contributions = [
    [Math.max(pB, 0.0) / 100.0, channelStrength(organicKey(conditions), phase)],
    [Math.max(pC, 0.0) / 100.0, channelStrength(channelKey(conditions.solvent_c, phase), phase)],
    [Math.max(pD, 0.0) / 100.0, channelStrength(channelKey(conditions.solvent_d, phase), phase)],
  ];
  const total = contributions.reduce((sum, [fraction]) => sum + fraction, 0.0);
  const scale = total <= 1.0 ? 1.0 : 1.0 / total;
  return contributions.reduce((sum, [fraction, strength]) => sum + fraction * strength, 0.0) * scale;
}
const NP_REF_PHI = 0.10; // normal-phase reference: 10% polar modifier
const RESPONSE_SCALE = 6.0; // mAU*min per ug of injected mass at full absorptivity
const TAIL_RATIO = 0.18;

function neutralFraction(compound, ph) {
  if (compound.pka === null || compound.pka === undefined) {
    return 1.0;
  }
  if (compound.acid_base === 'acid') {
    return 1.0 / (1.0 + Math.pow(10.0, ph - compound.pka));
  }
  if (compound.acid_base === 'base') {
    return 1.0 / (1.0 + Math.pow(10.0, compound.pka - ph));
  }
  return 1.0;
}

function logKw(compound) {
  if (compound.log_kw !== null && compound.log_kw !== undefined) {
    return compound.log_kw;
  }
  // QSRR fallback for user-defined analytes
  return 0.55 * compound.log_p + 1.25;
}

function sValue(compound, organic) {
  if (compound.s_value !== null && compound.s_value !== undefined) {
    return compound.s_value;
  }
  if (organic === 'ACN') {
    return clamp(4.15 + 0.13 * compound.log_p, 3.2, 6.0);
  }
  return clamp(3.0 + 0.10 * compound.log_p, 2.4, 4.8);
}

function npLogKRef(compound) {
  if (compound.log_k_np !== null && compound.log_k_np !== undefined) {
    return compound.log_k_np;
  }
  // QSRR: polar analytes (low logP) are retained more strongly in NPLC.
  return clamp(1.55 - 0.42 * compound.log_p, -1.0, 3.2);
}

function npS(compound) {
  if (compound.s_np !== null && compound.s_np !== undefined) {
    return compound.s_np;
  }
  return clamp(7.5 + 0.25 * compound.log_p, 5.0, 11.0);
}

function tempFactor(compound, temperatureC, phase = 'reversed') {
  // Exothermic retention: dH is negative, so k falls as T rises.
  const baseDH = phase === 'reversed' ? 13.0e3 : 8.0e3;
  const dH = -(baseDH + 2.0e3 * clamp(compound.log_p, -1.0, 6.0));
  const t = temperatureC + 273.15;
  return Math.exp(dH / R_GAS * (1.0 / 298.15 - 1.0 / t));
}

function epsRel(compound, wavelengthNm) {
  const bandwidth = 22.0;
  return compound.epsilon_max
    * Math.exp(-0.5 * Math.pow((wavelengthNm - compound.lambda_max_nm) / bandwidth, 2));
}

function gradientArrays(conditions, flow, runTime) {
  if (conditions.mode === 'gradient' && conditions.gradient.length >= 1) {
    const points = conditions.gradient.slice().sort((a, b) => a.time_min - b.time_min);
    const times = points.map((p) => p.time_min);
    const percents = points.map((p) => p.percent_b);
    if (times[0] > 0.0) {
      times.unshift(0.0);
      percents.unshift(percents[0]);
    }
    if (times[times.length - 1] < runTime) {
      times.push(runTime);
      percents.push(percents[percents.length - 1]);
    }
    return { times, percents };
  }
  let value;
  if (conditions.mode === 'isocratic') {
    value = conditions.percent_b;
  } else if (conditions.gradient.length) {
    value = conditions.gradient[0].percent_b;
  } else {
    value = 50.0;
  }
  return { times: [0.0, Math.max(runTime, 1.0)], percents: [value, value] };
}

function emptyResult(conditions, note) {
  const t = linspace(0.0, 10.0, 400);
  return {
    time: t.map((v) => pyRound(v, 4)),
    signal: t.map(() => 0.0),
    composition: t.map(() => conditions.percent_b),
    peaks: [],
    metrics: {
      t0_min: null,
      run_time_min: 10.0,
      plates: null,
      pressure_bar: null,
      num_peaks: 0,
      min_resolution: null,
      max_k: null,
    },
    warnings: note ? [note] : [],
  };
}

function simulate(compounds, conditions) {
  if (!compounds.length) {
    return emptyResult(conditions, '尚未选择任何组分');
  }

  const column = conditions.column;
  const flow = conditions.flow_ml_min;
  const areaMm2 = Math.PI * Math.pow(column.inner_diameter_mm / 2.0, 2);
  const voidVolumeMl = column.porosity * areaMm2 * column.length_mm / 1000.0;
  const t0 = voidVolumeMl / flow;
  const u = flow * 1000.0 / (column.porosity * areaMm2); // mm/min
  const dpMm = column.particle_um / 1000.0;
  const dm = ORGANIC_PROPS[organicKey(conditions)].dm;
  const reducedVelocity = Math.max(u * dpMm / dm, 1e-3);
  const plateHeightMm = dpMm * (1.75 + 1.25 / reducedVelocity + 0.06 * reducedVelocity);
  const plates = Math.max(250.0, column.length_mm / plateHeightMm);

  const n = compounds.length;
  const phase = conditions.phase || 'reversed';
  const sArr = new Array(n);
  const tempArr = new Array(n);
  const logK0 = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const c = compounds[i];
    tempArr[i] = tempFactor(c, conditions.temperature_c, phase);
    if (phase === 'normal') {
      // NPLC: reference point is 10% polar modifier; pH is not meaningful.
      sArr[i] = npS(c);
      logK0[i] = npLogKRef(c)
        + sArr[i] * NP_REF_PHI
        + Math.log10(Math.max(tempArr[i], 1e-9));
    } else {
      sArr[i] = sValue(c, organicKey(conditions));
      const neutral = neutralFraction(c, conditions.ph);
      // Combined intercept: log k at phi = 0 for the actual pH / temperature.
      logK0[i] = logKw(c)
        + Math.log10(Math.max(neutral, 1e-9))
        + Math.log10(Math.max(tempArr[i], 1e-9));
    }
  }

  // --- run length -------------------------------------------------------
  let runTime;
  if (conditions.total_time_min) {
    runTime = conditions.total_time_min;
  } else if (conditions.mode === 'gradient') {
    const programEnd = conditions.gradient.length
      ? maxOf(conditions.gradient.map((p) => p.time_min))
      : 20.0;
    runTime = Math.max(programEnd * 1.35, programEnd + 6.0);
  } else {
    const phiIso = modifierPhi(conditions.percent_b, conditions.percent_c, conditions.percent_d, conditions);
    const kValues = logK0.map((lk, i) => Math.pow(10.0, clamp(lk - sArr[i] * phiIso, -6.0, 8.0)));
    runTime = Math.min(240.0, Math.max(10.0, t0 * (1.0 + maxOf(kValues)) * 1.1 + 2.0));
  }

  const grad = gradientArrays(conditions, flow, runTime);
  const gradT = grad.times;
  const gradB = grad.percents;
  const gradPhi = gradB.map((pb) => modifierPhi(
    pb, conditions.percent_c, conditions.percent_d, conditions,
  ));
  const dwellT = flow > 0 ? conditions.dwell_volume_ml / flow : 0.0;
  let programEnd;
  if (conditions.mode === 'gradient' && conditions.gradient.length) {
    programEnd = maxOf(conditions.gradient.map((p) => p.time_min));
  } else {
    programEnd = 0.0;
  }

  let dt = Math.min(0.01, Math.max(0.0012, runTime / 12000.0));
  if (runTime / dt > 40000) {
    dt = runTime / 40000.0;
  }

  // --- integrate solute migration --------------------------------------
  const x = new Array(n).fill(0.0);
  const tr = new Array(n).fill(NaN);
  const length = column.length_mm;
  let t = 0.0;
  while (t < runTime - 1e-9) {
    let allDone = true;
    for (let i = 0; i < n; i += 1) {
      const shifted = t - dwellT - x[i] / u;
      const phi = interp(shifted, gradT, gradPhi);
      const k = Math.pow(10.0, clamp(logK0[i] - sArr[i] * phi, -9.0, 9.0));
      const velocity = u / (1.0 + k); // mm/min
      const nextX = x[i] + velocity * dt;
      if (nextX >= length && Number.isNaN(tr[i])) {
        tr[i] = t + (length - x[i]) / Math.max(velocity, 1e-12);
      }
      x[i] = nextX >= length ? length : nextX;
      if (x[i] < length) {
        allDone = false;
      }
    }
    t += dt;
    if (allDone) {
      break;
    }
  }

  // Composition seen by each solute at the column outlet
  const outletPercent = new Array(n);
  const kElution = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const outletTime = Number.isNaN(tr[i]) ? 0.0 : tr[i] - dwellT - length / u;
    outletPercent[i] = interp(outletTime, gradT, gradB);
    const outletPhi = interp(outletTime, gradT, gradPhi);
    kElution[i] = Math.pow(10.0, clamp(logK0[i] - sArr[i] * outletPhi, -9.0, 9.0));
  }

  // --- peak profile -----------------------------------------------------
  const epsRelArr = new Array(n);
  const massUg = new Array(n);
  const peakArea = new Array(n);
  const visible = new Array(n);
  const sigma = new Array(n);
  const tau = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const c = compounds[i];
    epsRelArr[i] = epsRel(c, conditions.wavelength_nm);
    massUg[i] = c.concentration_mg_l * conditions.injection_volume_ul / 1000.0;
    peakArea[i] = massUg[i] * epsRelArr[i] * RESPONSE_SCALE;
    visible[i] = Number.isFinite(tr[i]) && epsRelArr[i] >= 0.03;
    const rawSigma = Number.isFinite(tr[i]) ? tr[i] / Math.sqrt(plates) : 0.0;
    sigma[i] = Math.max(rawSigma, 0.0015);
    tau[i] = sigma[i] * TAIL_RATIO;
  }

  const finiteIdx = [];
  for (let i = 0; i < n; i += 1) {
    if (Number.isFinite(tr[i])) {
      finiteIdx.push(i);
    }
  }

  let displayEnd;
  if (finiteIdx.length) {
    const lastPeak = maxOf(finiteIdx.map((i) => tr[i]));
    const lastSigma = maxOf(finiteIdx.map((i) => sigma[i]));
    displayEnd = Math.max(
      programEnd * 1.02,
      lastPeak + Math.max(3.0 * lastSigma, 1.0),
      5.0,
    );
    displayEnd = Math.min(displayEnd, Math.max(runTime, displayEnd));
  } else {
    displayEnd = runTime;
  }
  displayEnd = Math.max(displayEnd, 1.0);

  const grid = linspace(0.0, displayEnd, 3200);
  const signal = new Array(grid.length).fill(0.0);
  for (let i = 0; i < n; i += 1) {
    if (!visible[i]) {
      continue;
    }
    const mu = tr[i] - tau[i];
    for (let g = 0; g < grid.length; g += 1) {
      signal[g] += peakArea[i] * exponnormPdf(grid[g], TAIL_RATIO, mu, sigma[i]);
    }
  }

  const rng = new NormalRng(7);
  for (let g = 0; g < grid.length; g += 1) {
    const baseline = 0.28
      + 0.12 * Math.sin(2.0 * Math.PI * grid[g] / 9.5 + 0.4)
      + 0.05 * Math.sin(2.0 * Math.PI * grid[g] / 3.1 + 1.7);
    signal[g] += baseline + rng.normal(0.0, conditions.noise_mau);
  }

  const composition = new Array(grid.length);
  for (let g = 0; g < grid.length; g += 1) {
    const q = clamp(grid[g] - dwellT, gradT[0], gradT[gradT.length - 1]);
    composition[g] = interp(q, gradT, gradB);
  }

  // --- peak table -------------------------------------------------------
  const order = new Array(n);
  for (let i = 0; i < n; i += 1) {
    order[i] = i;
  }
  order.sort((a, b) => (Number.isFinite(tr[a]) ? tr[a] : 1e9) - (Number.isFinite(tr[b]) ? tr[b] : 1e9));

  const peaks = [];
  for (const idx of order) {
    const c = compounds[idx];
    if (!Number.isFinite(tr[idx])) {
      peaks.push({
        name: c.name,
        compound_id: c.id,
        tr_min: null,
        k: null,
        phi_elution: null,
        height_mau: 0.0,
        area: 0.0,
        width_min: null,
        plates: pyRound(plates, 0),
        resolution_prev: null,
        visible: false,
        eps_rel: pyRound(epsRelArr[idx], 4),
        note: '运行时间内未洗脱',
      });
      continue;
    }
    const mu = tr[idx] - tau[idx];
    const height = peakArea[idx] * exponnormPdf(tr[idx], TAIL_RATIO, mu, sigma[idx]);
    peaks.push({
      name: c.name,
      compound_id: c.id,
      tr_min: pyRound(tr[idx], 3),
      k: pyRound(kElution[idx], 3),
      phi_elution: pyRound(outletPercent[idx], 1),
      height_mau: pyRound(height, 3),
      area: visible[idx] ? pyRound(peakArea[idx], 4) : 0.0,
      width_min: pyRound(4.0 * sigma[idx], 4),
      plates: pyRound(plates, 0),
      resolution_prev: null,
      visible: visible[idx],
      eps_rel: pyRound(epsRelArr[idx], 4),
      note: visible[idx] ? null : '该波长下紫外吸收弱',
    });
  }

  // Resolution between adjacent visible peaks
  const visiblePeaks = peaks.filter((p) => p.visible && p.tr_min !== null);
  const resolutions = [];
  for (let i = 1; i < visiblePeaks.length; i += 1) {
    const prev = visiblePeaks[i - 1];
    const cur = visiblePeaks[i];
    // recover sigmas from widths (width = 4 sigma)
    const s1 = prev.width_min / 4.0;
    const s2 = cur.width_min / 4.0;
    const rs = (cur.tr_min - prev.tr_min) / (2.0 * (s1 + s2));
    cur.resolution_prev = pyRound(rs, 2);
    resolutions.push(rs);
  }

  // --- pressure & warnings ---------------------------------------------
  const meanB = mean(composition) / 100.0;
  const baseVisc = aqueousViscosity(conditions);
  const cKey = channelKey(conditions.solvent_c, conditions.phase);
  const dKey = channelKey(conditions.solvent_d, conditions.phase);
  const fracC = cKey ? (Number(conditions.percent_c) || 0.0) / 100.0 : 0.0;
  const fracD = dKey ? (Number(conditions.percent_d) || 0.0) / 100.0 : 0.0;
  const fracA = Math.max(0.0, 1.0 - meanB - fracC - fracD);
  const mix = [[fracA, baseVisc], [meanB, ORGANIC_PROPS[organicKey(conditions)].visc]];
  if (cKey) {
    mix.push([fracC, channelViscosity(cKey, conditions.phase)]);
  }
  if (dKey) {
    mix.push([fracD, channelViscosity(dKey, conditions.phase)]);
  }
  const totalFrac = mix.reduce((sum, [weight]) => sum + weight, 0.0) || 1.0;
  let eta = mix.reduce((sum, [weight, visc]) => sum + weight * visc, 0.0) / totalFrac;
  eta *= Math.max(0.4, 1.0 - 0.021 * (conditions.temperature_c - 25.0));
  const pressureBar = 1600.0 * eta * column.length_mm * (u / 60.0) / Math.pow(dpMm, 2) / 1e5;

  const warnings = [];
  const notEluted = peaks.filter((p) => p.tr_min === null).map((p) => p.name);
  if (notEluted.length) {
    warnings.push(
      '以下组分在运行时间内未洗脱：' + notEluted.join('、')
      + '。建议提高强洗脱溶剂 B 的比例或延长运行时间。',
    );
  }
  for (const p of peaks) {
    if (p.visible && p.k !== null && p.k < 1.0) {
      warnings.push(
        `「${p.name}」保留因子 k=${p.k.toFixed(2)} < 1，接近死体积，易受基质干扰。`,
      );
    }
  }
  for (const p of peaks) {
    if (p.visible && p.k !== null && p.k > 20.0) {
      warnings.push(
        `「${p.name}」保留过强（k=${p.k.toFixed(1)}），峰形易展宽，建议增大 B 比例。`,
      );
    }
  }
  for (let i = 1; i < visiblePeaks.length; i += 1) {
    const cur = visiblePeaks[i];
    if (cur.resolution_prev !== null && cur.resolution_prev < 1.5) {
      warnings.push(
        `「${visiblePeaks[i - 1].name}」与「${cur.name}」分离度 Rs=${cur.resolution_prev.toFixed(2)} < 1.5，存在共洗脱风险。`,
      );
    }
  }
  for (let i = 0; i < compounds.length; i += 1) {
    const c = compounds[i];
    const eps = epsRelArr[i];
    if (eps < 0.05) {
      warnings.push(
        `「${c.name}」在 ${conditions.wavelength_nm.toFixed(0)} nm 处摩尔吸光系数仅 ${eps.toFixed(3)}，建议更换检测波长（λmax≈${c.lambda_max_nm.toFixed(0)} nm）或检测器。`,
      );
    }
  }
  if (phase === 'reversed') {
    for (const c of compounds) {
      if (c.pka !== null && c.pka !== undefined && Math.abs(conditions.ph - c.pka) < 0.5) {
        warnings.push(
          `pH ${conditions.ph.toFixed(1)} 接近「${c.name}」的 pKa ${c.pka.toFixed(1)}，保留时间对 pH 波动敏感。`,
        );
      }
    }
    if (column.chemistry && column.chemistry !== 'c18') {
      warnings.push(
        `反相模型按 C18 校准，当前固定相为 ${String(column.chemistry).toUpperCase()}，保留预测仅作相对参考。`,
      );
    }
    if (HEXANE_FAMILY.includes(aqueousKey(conditions))) {
      warnings.push('当前为反相模式，非有机相 A 通常应为水或缓冲水溶液；所选 A 相极性过低。');
    }
  } else {
    if (column.chemistry && !['silica', 'diol', 'amino'].includes(column.chemistry)) {
      warnings.push('正相模式建议使用硅胶、二醇或氨基柱；当前 C18 固定相不适合正相条件。');
    }
    const ionizable = compounds
      .filter((c) => c.pka !== null && c.pka !== undefined)
      .map((c) => c.name);
    if (ionizable.length) {
      warnings.push(
        '正相不使用 pH 控制，以下组分具有可电离基团，可能与硅醇基强吸附或拖尾：'
        + ionizable.join('、')
        + '。建议使用氨基/二醇柱或加入少量极性添加剂。',
      );
    }
    if (AQUEOUS_FAMILY.includes(aqueousKey(conditions))) {
      warnings.push('当前为正相模式，非有机相 A 通常应为正己烷或正庚烷；所选 A 相为水相，可能不兼容。');
    }
  }
  if (conditions.aqueous === 'custom') {
    warnings.push(
      `自定义非有机相「${aqueousLabel(conditions)}」按`
      + (phase === 'normal' ? '正己烷' : '水') + '的黏度估算柱压。',
    );
  }
  if (conditions.organic === 'custom') {
    warnings.push(
      `自定义有机相「${organicLabel(conditions)}」按`
      + (phase === 'normal' ? '异丙醇' : '乙腈') + '的物性与洗脱强度估算。',
    );
  }
  const maxB = conditions.mode === 'gradient'
    ? maxOf(conditions.gradient.map((p) => p.percent_b))
    : conditions.percent_b;
  if (maxB + (Number(conditions.percent_c) || 0.0) + (Number(conditions.percent_d) || 0.0) > 100.5) {
    warnings.push('B/C/D 相比例合计超过 100%，计算时已按比例归一化，请检查泵程序设置。');
  }
  for (const [slot, value, label] of [
    ['C', conditions.solvent_c, conditions.solvent_c_label],
    ['D', conditions.solvent_d, conditions.solvent_d_label],
  ]) {
    if (!value || value === 'none') {
      continue;
    }
    if (value === 'custom') {
      warnings.push(
        `自定义辅助相 ${slot}「${auxLabel(value, label)}」按`
        + (phase === 'normal' ? '异丙醇' : '乙腈') + '的物性与洗脱强度估算。',
      );
      continue;
    }
    if (phase === 'reversed' && HEXANE_FAMILY.includes(value)) {
      warnings.push(`反相模式下辅助相 ${slot} 为烷烃，可能与水相不互溶。`);
    }
    if (phase === 'normal' && AQUEOUS_FAMILY.includes(value)) {
      warnings.push(`正相模式下辅助相 ${slot} 为水相，可能与正己烷体系不兼容。`);
    }
  }
  const pressureLimit = column.particle_um <= 2.5 ? 1000.0 : 400.0;
  if (pressureBar > pressureLimit) {
    warnings.push(
      `预测柱压约 ${pressureBar.toFixed(0)} bar，超过该柱型的建议上限（${pressureLimit.toFixed(0)} bar），`
      + '建议降低流速、缩短柱长或检查粒径匹配。',
    );
  }
  if (conditions.mode === 'gradient') {
    const lastTr = visiblePeaks.length
      ? maxOf(visiblePeaks.map((p) => p.tr_min))
      : 0.0;
    if (lastTr > programEnd + 0.5) {
      warnings.push(
        '最后一个峰在梯度程序结束后才洗脱，可适当延长梯度时间或提高末端 B 比例。',
      );
    }
  }

  const metrics = {
    t0_min: pyRound(t0, 3),
    run_time_min: pyRound(displayEnd, 2),
    plates: pyRound(plates, 0),
    pressure_bar: pyRound(pressureBar, 1),
    num_peaks: visiblePeaks.length,
    min_resolution: resolutions.length ? pyRound(minOf(resolutions), 2) : null,
    max_k: finiteIdx.length ? pyRound(maxOf(finiteIdx.map((i) => kElution[i])), 2) : null,
    wavelength_nm: conditions.wavelength_nm,
    organic: conditions.organic,
    organic_label: organicLabel(conditions),
    aqueous: conditions.aqueous,
    aqueous_label: aqueousLabel(conditions),
    solvent_c: conditions.solvent_c,
    solvent_c_label: auxLabel(conditions.solvent_c, conditions.solvent_c_label),
    percent_c: Number(conditions.percent_c) || 0.0,
    solvent_d: conditions.solvent_d,
    solvent_d_label: auxLabel(conditions.solvent_d, conditions.solvent_d_label),
    percent_d: Number(conditions.percent_d) || 0.0,
    mode: conditions.mode,
    phase,
    chemistry: column.chemistry || 'c18',
  };

  return {
    time: grid.map((v) => pyRound(v, 4)),
    signal: signal.map((v) => pyRound(v, 4)),
    composition: composition.map((v) => pyRound(v, 2)),
    peaks,
    metrics,
    warnings,
  };
}

module.exports = {
  R_GAS,
  WATER_VISC,
  ORGANIC_PROPS,
  RESPONSE_SCALE,
  TAIL_RATIO,
  neutralFraction,
  logKw,
  sValue,
  npLogKRef,
  npS,
  tempFactor,
  epsRel,
  gradientArrays,
  emptyResult,
  simulate,
};
