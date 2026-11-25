'use strict';

/* Small numeric helpers shared by the simulation / design / identification
 * engines.  Everything here mirrors the NumPy / Python semantics used by the
 * original FastAPI implementation (round-half-even, np.interp clamping). */

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

// Python round(): ties-to-even on the exact binary value.
function pyRound(value, digits = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
    return value;
  }
  const p = Math.pow(10, digits);
  const scaled = value * p;
  if (!Number.isFinite(scaled)) {
    return value;
  }
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let rounded;
  if (diff > 0.5) {
    rounded = floor + 1;
  } else if (diff < 0.5) {
    rounded = floor;
  } else {
    rounded = (floor % 2 === 0) ? floor : floor + 1;
  }
  return rounded / p;
}

// numpy.interp with clamped endpoints; returns NaN for a NaN query.
function interp(xq, xs, ys) {
  const n = xs.length;
  if (!Number.isFinite(xq)) {
    return NaN;
  }
  if (xq <= xs[0]) {
    return ys[0];
  }
  if (xq >= xs[n - 1]) {
    return ys[n - 1];
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= xq) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const x0 = xs[lo];
  const x1 = xs[hi];
  if (x1 === x0) {
    return ys[lo];
  }
  const slope = (ys[hi] - ys[lo]) / (x1 - x0);
  return ys[lo] + slope * (xq - x0);
}

function linspace(start, stop, num) {
  if (num <= 1) {
    return [start];
  }
  const step = (stop - start) / (num - 1);
  const out = new Array(num);
  for (let i = 0; i < num; i += 1) {
    out[i] = start + step * i;
  }
  return out;
}

function mean(values) {
  if (!values.length) {
    return NaN;
  }
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    total += values[i];
  }
  return total / values.length;
}

function maxOf(values) {
  let best = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] > best) {
      best = values[i];
    }
  }
  return best;
}

function minOf(values) {
  let best = Infinity;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] < best) {
      best = values[i];
    }
  }
  return best;
}

/* Deterministic PRNG + Box-Muller normal.  The amplitude distribution matches
 * numpy's normal(0, noise_mau) but the random sequence itself is not identical. */
class NormalRng {
  constructor(seed) {
    this.state = (seed >>> 0) || 0x9e3779b9;
    this.spare = null;
  }

  nextUniform() {
    // mulberry32
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  normal(meanValue, std) {
    if (this.spare !== null) {
      const value = this.spare;
      this.spare = null;
      return meanValue + std * value;
    }
    let u = 0;
    let v = 0;
    while (u <= Number.MIN_VALUE) {
      u = this.nextUniform();
    }
    v = this.nextUniform();
    const radius = Math.sqrt(-2.0 * Math.log(u));
    const theta = 2.0 * Math.PI * v;
    this.spare = radius * Math.sin(theta);
    return meanValue + std * radius * Math.cos(theta);
  }
}

/* log(erfc(y)) in a numerically stable form, based on the Numerical Recipes
 * erfc rational approximation (|rel. error| < 1.2e-7). */
const ERFC_COEFFS = [
  0.17087277, -0.82215223, 1.48851587, -1.13520398,
  0.27886807, -0.18628806, 0.09678418, 0.37409196,
  1.00002368,
];

function erfcPoly(t) {
  let acc = ERFC_COEFFS[0];
  for (let i = 1; i < ERFC_COEFFS.length; i += 1) {
    acc = ERFC_COEFFS[i] + t * acc;
  }
  return acc;
}

function erfcExpLog(y) {
  // returns log(erfc(y)) without overflow/underflow
  if (y >= 0) {
    if (y > 26.0) {
      // asymptotic: erfc(y) ~ exp(-y^2) / (sqrt(pi) * y)
      return -y * y - Math.log(Math.sqrt(Math.PI) * y);
    }
    const t = 1.0 / (1.0 + 0.5 * y);
    return Math.log(t) - y * y - 1.26551223 + t * erfcPoly(t);
  }
  const az = -y;
  if (az > 6.0) {
    return Math.log(2.0);
  }
  const t = 1.0 / (1.0 + 0.5 * az);
  const tail = Math.exp(Math.log(t) - az * az - 1.26551223 + t * erfcPoly(t));
  return Math.log(2.0 - tail);
}

/* scipy.stats.exponnorm.pdf(x, K, loc, scale) */
function exponnormPdf(x, K, loc, scale) {
  if (!Number.isFinite(x) || scale <= 0) {
    return 0;
  }
  const z = (x - loc) / scale;
  const logPdf = -Math.log(2.0 * K) - Math.log(scale) + 1.0 / (2.0 * K * K) - z / K
    + erfcExpLog((1.0 / K - z) / Math.SQRT2);
  if (logPdf < -745.0) {
    return 0;
  }
  return Math.exp(logPdf);
}

module.exports = {
  clamp,
  pyRound,
  interp,
  linspace,
  mean,
  maxOf,
  minOf,
  NormalRng,
  exponnormPdf,
  erfcExpLog,
};
