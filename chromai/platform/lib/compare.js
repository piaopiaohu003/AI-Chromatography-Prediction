'use strict';

/* Compare a simulated chromatogram with experimental peak measurements.
 *
 * The comparison is deliberately conservative: it reports per-peak retention,
 * resolution and plate-count deviations, then aggregates bias / MAE / RMSE /
 * Bland-Altman limits and an A/B/C agreement grade.  It never changes the
 * simulation itself, so the same measurements can be re-used against a new
 * set of conditions. */

const { ValidationError } = require('./models');
const { pyRound } = require('./util');

const MAX_PEAKS = 50;
const TR_ABS_TOL = 0.2; // min
const TR_REL_TOL = 5.0; // %
const RS_TOL = 0.3;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberOrNull(value, field, { min = -Infinity, max = Infinity, required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError(`${field} 不能为空`);
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${field} 必须是数字`);
  }
  if (parsed < min || parsed > max) {
    throw new ValidationError(`${field} 超出允许范围（${min}–${max}）`);
  }
  return parsed;
}

function roundOrNull(value, digits) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? null
    : pyRound(value, digits);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function normalizePredicted(payload) {
  if (!isPlainObject(payload) || !Array.isArray(payload.peaks)) {
    throw new ValidationError('predicted.peaks 必须是数组');
  }
  if (payload.peaks.length > MAX_PEAKS * 4) {
    throw new ValidationError(`模拟峰数量过多（上限 ${MAX_PEAKS * 4}）`);
  }
  const metrics = isPlainObject(payload.metrics) ? payload.metrics : {};
  return {
    t0: numberOrNull(metrics.t0_min, 'predicted.metrics.t0_min', { min: 0.001, max: 100 }),
    pressure: numberOrNull(metrics.pressure_bar, 'predicted.metrics.pressure_bar', { min: 0, max: 5000 }),
    peaks: payload.peaks.map((peak, index) => {
      if (!isPlainObject(peak)) {
        throw new ValidationError(`predicted.peaks[${index}] 必须是对象`);
      }
      const name = String(peak.name || '').trim();
      if (!name) throw new ValidationError(`predicted.peaks[${index}].name 不能为空`);
      return {
        name: name.slice(0, 120),
        tr_min: numberOrNull(peak.tr_min, `predicted.peaks[${index}].tr_min`, { min: 0, max: 1000 }),
        k: numberOrNull(peak.k, `predicted.peaks[${index}].k`, { min: -1, max: 1e6 }),
        width_min: numberOrNull(peak.width_min, `predicted.peaks[${index}].width_min`, { min: 0, max: 1000 }),
        plates: numberOrNull(peak.plates, `predicted.peaks[${index}].plates`, { min: 0, max: 1e8 }),
        resolution_prev: numberOrNull(
          peak.resolution_prev,
          `predicted.peaks[${index}].resolution_prev`,
          { min: -100, max: 100 },
        ),
        visible: peak.visible !== false,
      };
    }).filter((peak) => peak.visible && peak.tr_min !== null),
  };
}

function normalizeMeasured(payload) {
  if (!isPlainObject(payload) || !Array.isArray(payload.peaks)) {
    throw new ValidationError('measured.peaks 必须是数组');
  }
  if (payload.peaks.length > MAX_PEAKS) {
    throw new ValidationError(`实测峰数量过多（上限 ${MAX_PEAKS}）`);
  }
  const names = new Set();
  const peaks = payload.peaks.map((peak, index) => {
    if (!isPlainObject(peak)) {
      throw new ValidationError(`measured.peaks[${index}] 必须是对象`);
    }
    const name = String(peak.name || '').trim();
    if (!name) throw new ValidationError(`measured.peaks[${index}].name 不能为空`);
    if (names.has(name)) {
      throw new ValidationError(`实测峰名称重复：${name}`);
    }
    names.add(name);
    return {
      name: name.slice(0, 120),
      tr_min: numberOrNull(peak.tr_min, `measured.peaks[${index}].tr_min`, {
        min: 0.001, max: 1000, required: true,
      }),
      width_min: numberOrNull(peak.width_min, `measured.peaks[${index}].width_min`, { min: 0, max: 1000 }),
      plates: numberOrNull(peak.plates, `measured.peaks[${index}].plates`, { min: 0, max: 1e8 }),
      resolution_prev: numberOrNull(
        peak.resolution_prev,
        `measured.peaks[${index}].resolution_prev`,
        { min: -100, max: 100 },
      ),
    };
  });
  return {
    pressure: numberOrNull(payload.pressure_bar, 'measured.pressure_bar', { min: 0, max: 5000 }),
    peaks,
  };
}

function compareResults(payload) {
  if (!isPlainObject(payload)) {
    throw new ValidationError('请求体必须是 JSON 对象');
  }
  const predicted = normalizePredicted(payload.predicted);
  const measured = normalizeMeasured(payload.measured);
  if (!predicted.peaks.length) {
    throw new ValidationError('当前模拟结果没有可对比的可见峰');
  }

  const predictedByName = new Map(predicted.peaks.map((peak) => [peak.name, peak]));
  const measuredByName = new Map(measured.peaks.map((peak) => [peak.name, peak]));
  const names = [
    ...predicted.peaks.map((peak) => peak.name),
    ...measured.peaks.filter((peak) => !predictedByName.has(peak.name)).map((peak) => peak.name),
  ];

  const rows = names.map((name) => {
    const pred = predictedByName.get(name) || null;
    const meas = measuredByName.get(name) || null;
    const predictedTr = pred ? pred.tr_min : null;
    const measuredTr = meas ? meas.tr_min : null;
    const deltaTr = predictedTr !== null && measuredTr !== null ? measuredTr - predictedTr : null;
    const percentError = predictedTr !== null && measuredTr !== null && measuredTr !== 0
      ? (deltaTr / measuredTr) * 100
      : null;
    const predictedK = pred && pred.k !== null
      ? pred.k
      : (predicted.t0 && predictedTr !== null ? (predictedTr - predicted.t0) / predicted.t0 : null);
    const measuredK = predicted.t0 && measuredTr !== null
      ? (measuredTr - predicted.t0) / predicted.t0
      : null;
    const deltaK = predictedK !== null && measuredK !== null ? measuredK - predictedK : null;
    const predictedRs = pred ? pred.resolution_prev : null;
    const measuredRs = meas ? meas.resolution_prev : null;
    const deltaRs = predictedRs !== null && measuredRs !== null ? measuredRs - predictedRs : null;
    const trPass = percentError !== null
      ? Math.abs(percentError) <= TR_REL_TOL || Math.abs(deltaTr) <= TR_ABS_TOL
      : null;
    const rsPass = deltaRs !== null ? Math.abs(deltaRs) <= RS_TOL : null;

    let status = 'good';
    let label = '一致';
    if (!meas) {
      status = 'missing';
      label = '未录入';
    } else if (!pred) {
      status = 'unmatched';
      label = '未匹配';
    } else if (!trPass) {
      status = 'bad';
      label = '保留偏差';
    } else if (rsPass === false) {
      status = 'warn';
      label = 'Rs 偏差';
    }

    return {
      name,
      predicted_tr_min: roundOrNull(predictedTr, 3),
      measured_tr_min: roundOrNull(measuredTr, 3),
      delta_tr_min: roundOrNull(deltaTr, 3),
      percent_error: roundOrNull(percentError, 2),
      predicted_k: roundOrNull(predictedK, 3),
      measured_k: roundOrNull(measuredK, 3),
      delta_k: roundOrNull(deltaK, 3),
      predicted_width_min: pred ? roundOrNull(pred.width_min, 4) : null,
      measured_width_min: meas ? roundOrNull(meas.width_min, 4) : null,
      predicted_plates: pred ? roundOrNull(pred.plates, 0) : null,
      measured_plates: meas ? roundOrNull(meas.plates, 0) : null,
      predicted_rs: roundOrNull(predictedRs, 2),
      measured_rs: roundOrNull(measuredRs, 2),
      delta_rs: roundOrNull(deltaRs, 2),
      tr_pass: trPass,
      rs_pass: rsPass,
      status,
      label,
    };
  });

  const matched = rows.filter((row) => row.predicted_tr_min !== null && row.measured_tr_min !== null);
  const deltas = matched.map((row) => row.delta_tr_min).filter((value) => value !== null);
  const bias = mean(deltas);
  const mae = mean(deltas.map((value) => Math.abs(value)));
  const rmse = deltas.length
    ? Math.sqrt(deltas.reduce((sum, value) => sum + value * value, 0) / deltas.length)
    : null;
  const percentErrors = matched.map((row) => Math.abs(row.percent_error)).filter((value) => value !== null);
  const mape = mean(percentErrors);
  const sd = deltas.length > 1 && bias !== null
    ? Math.sqrt(deltas.reduce((sum, value) => sum + (value - bias) ** 2, 0) / (deltas.length - 1))
    : null;
  const loaLower = sd !== null ? bias - 1.96 * sd : null;
  const loaUpper = sd !== null ? bias + 1.96 * sd : null;

  const trRows = rows.filter((row) => row.tr_pass !== null);
  const passRate = trRows.length ? trRows.filter((row) => row.tr_pass).length / trRows.length : 0;
  const rsRows = rows.filter((row) => row.rs_pass !== null);
  const rsPassRate = rsRows.length ? rsRows.filter((row) => row.rs_pass).length / rsRows.length : null;
  const coverage = matched.length / predicted.peaks.length;

  const measuredOrder = matched.slice().sort((a, b) => a.measured_tr_min - b.measured_tr_min).map((row) => row.name);
  const predictedOrder = predicted.peaks
    .filter((peak) => measuredOrder.includes(peak.name))
    .sort((a, b) => a.tr_min - b.tr_min)
    .map((peak) => peak.name);
  const rank = new Map(predictedOrder.map((name, index) => [name, index]));
  let concordant = 0;
  let orderPairs = 0;
  for (let i = 0; i < measuredOrder.length; i += 1) {
    for (let j = i + 1; j < measuredOrder.length; j += 1) {
      orderPairs += 1;
      if (rank.get(measuredOrder[i]) < rank.get(measuredOrder[j])) concordant += 1;
    }
  }
  const orderAccuracy = orderPairs ? concordant / orderPairs : 1;

  const enoughData = coverage >= 0.6
    && matched.length >= Math.min(2, predicted.peaks.length);
  let grade = null;
  if (enoughData) {
    grade = 'C';
    if (coverage >= 0.8 && orderAccuracy >= 0.9 && passRate >= 0.8
      && (rsPassRate === null || rsPassRate >= 0.8)) {
      grade = 'A';
    } else if (coverage >= 0.6 && orderAccuracy >= 0.7 && passRate >= 0.5) {
      grade = 'B';
    }
  }

  const pressureDelta = predicted.pressure !== null && measured.pressure !== null
    ? measured.pressure - predicted.pressure
    : null;
  const pressurePercent = pressureDelta !== null && measured.pressure
    ? (pressureDelta / measured.pressure) * 100
    : null;

  const notes = [];
  if (!grade) {
    notes.push('实测数据不足，暂不评级；至少覆盖 60% 的可见峰后再判断。');
  }
  if (coverage < 0.8) {
    notes.push(`实测数据仅覆盖 ${matched.length}/${predicted.peaks.length} 个可见峰，结论代表性有限。`);
  }
  if (orderAccuracy < 0.9) {
    notes.push('出峰顺序与模拟不一致，优先检查 pH、pKa、离子化或固定相选择性差异。');
  }
  if (bias !== null && Math.abs(bias) > 0.05) {
    notes.push(`保留时间整体${bias > 0 ? '晚于' : '早于'}模拟 ${Math.abs(bias).toFixed(2)} min，优先校准 t0、延迟体积与流速。`);
  }
  if (mae !== null && mae > 0.2) {
    notes.push('平均绝对偏差超过 0.2 min，建议检查梯度延迟、柱死体积或溶剂强度匹配。');
  }
  if (rsPassRate !== null && rsPassRate < 0.8) {
    notes.push('部分峰分离度偏差超过 0.3，建议核查峰宽、柱效与相邻峰归属。');
  }
  if (pressurePercent !== null && Math.abs(pressurePercent) > 15) {
    notes.push('柱压偏差超过 15%，建议检查黏度、柱温、柱批或系统压力零点。');
  }
  if (!notes.length) {
    notes.push('各峰保留时间与分离度偏差均在建议范围内，可用于方法确认。');
  }

  return {
    grade,
    grade_label: grade === 'A' ? '可接受' : grade === 'B' ? '需微调' : grade === 'C' ? '偏差较大' : '数据不足',
    coverage: pyRound(coverage, 3),
    matched: matched.length,
    predicted_count: predicted.peaks.length,
    measured_count: measured.peaks.length,
    order_accuracy: pyRound(orderAccuracy, 3),
    bias_min: roundOrNull(bias, 3),
    mae_min: roundOrNull(mae, 3),
    rmse_min: roundOrNull(rmse, 3),
    mape_percent: roundOrNull(mape, 2),
    loa_lower_min: roundOrNull(loaLower, 3),
    loa_upper_min: roundOrNull(loaUpper, 3),
    pass_rate: pyRound(passRate, 3),
    rs_pairs: rsRows.length,
    rs_pass_rate: rsPassRate === null ? null : pyRound(rsPassRate, 3),
    pressure: {
      predicted_bar: roundOrNull(predicted.pressure, 1),
      measured_bar: roundOrNull(measured.pressure, 1),
      delta_bar: roundOrNull(pressureDelta, 1),
      percent_error: roundOrNull(pressurePercent, 2),
    },
    notes,
    rows,
  };
}

module.exports = {
  compareResults,
  TR_ABS_TOL,
  TR_REL_TOL,
  RS_TOL,
};
