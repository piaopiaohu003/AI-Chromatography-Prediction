'use strict';

/* Inverse identification of compounds from observed chromatographic peaks.
 * Every candidate is simulated under the supplied conditions, then observed
 * retention times are matched to predicted retention times with a global
 * one-to-one assignment (Hungarian algorithm, implemented locally). */

const { COMPOUNDS } = require('./compounds');
const { ValidationError } = require('./models');
const { simulate } = require('./simulation');
const { pyRound } = require('./util');

const MAX_CANDIDATES = 200;
const PAD_COST = 1e6;

function defaultLibrary() {
  return COMPOUNDS.map((item) => ({
    id: item.id,
    name: item.name,
    name_en: item.name_en !== undefined ? item.name_en : null,
    category: item.category !== undefined ? item.category : null,
    log_p: item.log_p,
    pka: item.pka !== undefined ? item.pka : null,
    acid_base: item.acid_base || 'neutral',
    lambda_max_nm: item.lambda_max_nm !== undefined ? item.lambda_max_nm : 254.0,
    concentration_mg_l: 100.0,
    log_kw: item.log_kw !== undefined ? item.log_kw : null,
    s_value: item.s_value !== undefined ? item.s_value : null,
    epsilon_max: 1.0,
  }));
}

function candidatePool(request) {
  const pool = (request.candidates && request.candidates.length)
    ? request.candidates
    : defaultLibrary();
  if (pool.length > MAX_CANDIDATES) {
    throw new ValidationError(`候选组分最多 ${MAX_CANDIDATES} 个，当前 ${pool.length} 个`);
  }
  return pool;
}

function predictionsFor(pool, request) {
  return pool.map((compound) => {
    try {
      const result = simulate([compound], request.conditions);
      return result.peaks.length ? result.peaks[0] : null;
    } catch (err) {
      // a bad candidate must not break the search
      return null;
    }
  });
}

function uvSimilarity(observed, compound) {
  if (observed.lambda_max_nm === null || observed.lambda_max_nm === undefined) {
    return 1.0;
  }
  const sigma = 12.0;
  return Math.exp(-0.5 * Math.pow((observed.lambda_max_nm - compound.lambda_max_nm) / sigma, 2));
}

function pairMetrics(observed, compound, peak, toleranceMin, tolerancePct) {
  if (!peak || peak.tr_min === null || peak.tr_min === undefined) {
    return null;
  }
  const predicted = peak.tr_min;
  const delta = Math.abs(predicted - observed.tr_min);
  const tolerance = Math.max(toleranceMin, tolerancePct * Math.max(predicted, 1.0));
  const trScore = Math.exp(-0.5 * Math.pow(delta / tolerance, 2));
  const uvScore = uvSimilarity(observed, compound);
  const visible = Boolean(peak.visible);
  const score = trScore * (0.75 + 0.25 * uvScore) * (visible ? 1.0 : 0.35);
  return {
    predicted_tr_min: predicted,
    delta_min: delta,
    tolerance_min: tolerance,
    score,
    uv_score: uvScore,
    visible,
  };
}

function confidence(metrics) {
  if (metrics.delta_min <= metrics.tolerance_min && metrics.score >= 0.75) {
    return 'high';
  }
  if (metrics.score >= 0.45) {
    return 'medium';
  }
  return 'low';
}

function publicCandidate(compound, metrics) {
  return {
    compound_id: compound.id,
    name: compound.name,
    name_en: compound.name_en,
    category: compound.category,
    predicted_tr_min: pyRound(metrics.predicted_tr_min, 3),
    delta_min: pyRound(metrics.delta_min, 3),
    score: pyRound(metrics.score, 4),
    confidence: confidence(metrics),
    uv_score: pyRound(metrics.uv_score, 3),
    visible: metrics.visible,
    lambda_max_nm: compound.lambda_max_nm,
  };
}

function peakLabel(observed, index) {
  return observed.label || `峰 ${index + 1}`;
}

/* Hungarian algorithm (Kuhn-Munkres) for a square cost matrix.
 * Returns assignment[row] = col. */
function hungarian(cost) {
  const n = cost.length;
  if (n === 0) {
    return [];
  }
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j += 1) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= n; j += 1) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const assignment = new Array(n).fill(-1);
  for (let j = 1; j <= n; j += 1) {
    if (p[j] > 0) {
      assignment[p[j] - 1] = j - 1;
    }
  }
  return assignment;
}

function solveAssignment(scores, minScore) {
  const nObs = scores.length;
  const nCand = nObs ? scores[0].length : 0;
  const assigned = new Map();
  if (!nObs || !nCand) {
    return assigned;
  }
  const size = Math.max(nObs, nCand);
  const cost = new Array(size);
  for (let i = 0; i < size; i += 1) {
    const row = new Array(size);
    for (let j = 0; j < size; j += 1) {
      row[j] = (i < nObs && j < nCand) ? -scores[i][j] : PAD_COST;
    }
    cost[i] = row;
  }
  const assignment = hungarian(cost);
  for (let i = 0; i < nObs; i += 1) {
    const col = assignment[i];
    if (col >= 0 && col < nCand && scores[i][col] >= minScore) {
      assigned.set(i, col);
    }
  }
  return assigned;
}

function identify(request) {
  const pool = candidatePool(request);
  const predictions = predictionsFor(pool, request);
  const observations = request.observed_peaks;

  const nObs = observations.length;
  const nCand = pool.length;
  const scores = new Array(nObs);
  const entries = new Array(nObs);
  for (let i = 0; i < nObs; i += 1) {
    scores[i] = new Array(nCand).fill(0.0);
    entries[i] = new Array(nCand).fill(null);
  }

  for (let i = 0; i < nObs; i += 1) {
    const observed = observations[i];
    for (let j = 0; j < nCand; j += 1) {
      const metrics = pairMetrics(
        observed,
        pool[j],
        predictions[j],
        request.tolerance_min,
        request.tolerance_pct,
      );
      if (metrics === null) {
        continue;
      }
      entries[i][j] = publicCandidate(pool[j], metrics);
      scores[i][j] = metrics.score;
    }
  }

  // Global one-to-one assignment between observed peaks and candidates.
  const assigned = solveAssignment(scores, request.min_score);

  const peakResults = [];
  const unmatched = [];
  const warnings = [];

  for (let i = 0; i < nObs; i += 1) {
    const observed = observations[i];
    const row = scores[i];
    const ranked = row.map((value, index) => index)
      .sort((a, b) => (row[b] - row[a]) || (a - b));
    const topIndices = ranked.filter((j) => row[j] > 0).slice(0, request.max_candidates);
    const candidates = topIndices
      .map((j) => entries[i][j])
      .filter((entry) => entry !== null);
    const positive = ranked.map((j) => row[j]).filter((value) => value > 0);
    const margin = positive.length >= 2
      ? positive[0] - positive[1]
      : (positive.length ? positive[0] : 0.0);
    const secondScore = positive.length >= 2 ? positive[1] : 0.0;
    const secondEntry = positive.length >= 2 ? entries[i][ranked[1]] : null;

    const chosen = assigned.has(i) ? entries[i][assigned.get(i)] : null;
    if (chosen === null) {
      unmatched.push(peakLabel(observed, i));
    } else if (margin < 0.10 && chosen.score < 0.95) {
      warnings.push(
        `「${peakLabel(observed, i)}」存在多个保留时间接近的候选，`
        + '建议补充 UV 光谱、质谱或标准品比对。',
      );
    } else if (secondScore >= 0.5 && secondEntry !== null) {
      if (chosen.confidence === 'high') {
        chosen.confidence = 'medium';
      }
      warnings.push(
        `「${peakLabel(observed, i)}」的次优候选「${secondEntry.name}」`
        + `得分 ${secondScore.toFixed(2)}，建议用标准品或质谱进一步确认。`,
      );
    }

    peakResults.push({
      peak_label: peakLabel(observed, i),
      observed_tr_min: observed.tr_min,
      assigned: chosen,
      margin: pyRound(margin, 4),
      candidates,
    });
  }

  const assignments = [];
  const matchedCompounds = [];
  const assignedKeys = Array.from(assigned.keys()).sort((a, b) => a - b);
  for (const i of assignedKeys) {
    const j = assigned.get(i);
    const entry = entries[i][j];
    if (entry === null) {
      continue;
    }
    assignments.push({
      peak_index: i,
      peak_label: peakLabel(observations[i], i),
      observed_tr_min: observations[i].tr_min,
      ...entry,
    });
    matchedCompounds.push(pool[j]);
  }

  if (!assignments.length) {
    warnings.push('没有候选组分与观测峰匹配，请检查色谱条件、保留时间或候选范围。');
  }
  if (unmatched.length) {
    warnings.push('以下观测峰未匹配到候选组分：' + unmatched.join('、') + '。');
  }
  if (nObs > nCand) {
    warnings.push('观测峰数量多于候选组分数量，部分峰无法完成一对一匹配。');
  }

  let reconstruction = null;
  if (matchedCompounds.length && request.include_reconstruction) {
    reconstruction = simulate(matchedCompounds, request.conditions);
  }

  return {
    conditions: request.conditions,
    candidate_count: nCand,
    peak_count: nObs,
    peaks: peakResults,
    assignments,
    unmatched_peaks: unmatched,
    reconstruction,
    warnings,
  };
}

module.exports = {
  MAX_CANDIDATES,
  defaultLibrary,
  identify,
  hungarian,
  solveAssignment,
};
