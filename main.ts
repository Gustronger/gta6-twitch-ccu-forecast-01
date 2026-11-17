// gta6-twitch-ccu-forecast-01 — Grand Theft Auto VI launch-day Twitch viewers, hours 2-24.
// Forecast model (fitted on the case's own comparables at run time; no shipped data file):
//
//   For each hour h = 2..24, let r_h = ln(viewers_h / viewers_1) over the comparables.
//   Hour-1 prints vary by three orders of magnitude across launches, and r_h depends
//   strongly on log(viewers_1): big hour-1 launches (simultaneous global unlocks) decay
//   relative to hour 1, small hour-1 launches (rolling midnight unlocks, where hour 1 is
//   only New Zealand) grow several-fold by the evening peak. A plain median of r_h
//   ignores that and scores ~0.80 on the leave-one-out backtest; a global per-hour
//   linear fit of r_h on log(viewers_1) scores ~0.45. The median below is a per-hour
//   LOCAL-linear fit — Gaussian-kernel weighted least squares of r_h on log(viewers_1),
//   bandwidth 1.5 in log viewers — which captures both the global level trend and
//   local curvature: 0.382 on the same backtest, typical miss 79% (baseline: 0.930 /
//   213%), 90% coverage 0.888. A 50/50 blend of the global fit with a kernel weighted
//   median scored 0.410 on the same backtest and was the v1 model; the local-linear
//   fit beat it on loss, miss and coverage, so v2 uses it; v3 keeps the local-linear
//   median and makes the spread local too (see Spreads below), 0.382 vs 0.404 pooled.
//
//   v4 adds a leave-one-out median-residual bias correction (see looBiasCorrection
//   below), shrunk by BIAS_SHRINK = 0.5. Weighted least squares predicts the
//   conditional MEAN of r_h, but the scored tau = 0.5 pinball wants the conditional
//   MEDIAN, and the residual distribution is right-skewed (small launches whose
//   evenings explode x100-x2000), so the mean sits above the median and v3's median
//   forecast over-predicts the typical launch by +10-20% at most hours (median
//   signed log error +0.10 to +0.20; hi-tertile +0.215 at h10). The correction
//   centres the median: LOO backtest 0.382 -> 0.376 overall, hi-tertile 0.212 ->
//   0.210, typical miss 78.6% -> 75.5%, coverage 0.888 -> 0.891. The gain is small
//   and not statistically significant (paired t = -1.31 overall, -0.42 hi, n = 37
//   unique launches); it is shipped on mechanism plus a consistent small win, not
//   on a significant test. Everything else stays at v3 (tau 1.5, pad 0.5, local
//   spread x1.0, no pre-release anchor, no console weight, no quadratic median).
//
//   Spreads: per-hour residual sigma of the local-linear fit (residuals evaluated at
//   each comparable's own log hour-1 print), times SPREAD_MULT. q_tau is then
//   median * exp(z_tau * sigma_h). The log(viewers_1) the fit is evaluated at is
//   clamped to the comparables' observed range widened by 0.5, so an hour-1 print
//   outside the historical range cannot extrapolate the fit without bound.
//
//   The spread is LOCAL, not pooled: sigma_h is the kernel-weighted residual SD
//   at the target's own (clamped) log hour-1 print, same bandwidth as the median
//   fit. Big launches have much tighter curves than small ones, and a pooled
//   sigma over-covers them (hi-tertile 90% coverage 0.997 with a pooled sigma);
//   the local sigma scores 0.382 on the same backtest vs 0.404 pooled, with
//   coverage 0.888, and improves every p1 tertile (lo 0.635, mid 0.279,
//   hi 0.212) and every hour. Falls back to the pooled residual SD when the
//   local weights degenerate (effective n < 3).
//
//   The Grand Theft Auto VI comparable ("Not a launch" in its unlock note) is not a
//   launch at all — its day_start is the 2026-08-27 premiere — so it is excluded from
//   the fits, as is any comparable without a valid hour-1 print. Missing hourly points
//   are skipped, never interpolated. The target's own pre-release history is NOT used
//   for similarity: its pre-release level relative to hour 1 sits far outside the
//   comparables' range for GTA VI (category ~1.7k viewers pre-release vs an hour-1
//   print in the hundreds of thousands), so a pre-history similarity weight would
//   collapse onto the least similar launches.
//
//   No randomness, no clock, no network: a pure function of the case file.
//   Fitted constants (LOCAL_TAU, LEVEL_PAD, SPREAD_MULT, BIAS_SHRINK) were chosen on the
//   leave-one-out backtest over the kit's comparables (see analysis/TUNING.md).

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The quantile levels the contest scores, in the order each row lists them. */
const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
/** The standard normal's quantile at each level. */
const Z = [-1.645, -0.674, 0, 0.674, 1.645];
/** Hours to forecast. */
const HOURS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];

/** Gaussian kernel bandwidth (in log viewers) for the local-linear fit. Fit on backtest. */
const LOCAL_TAU = 1.5;
/** How far (in log viewers) past the comparables' log hour-1 range the fit may extrapolate. Fit on backtest. */
const LEVEL_PAD = 0.5;
/** Global multiplier on the per-hour residual sigma. Fit on backtest (90% coverage ~0.89 at 1.0). */
const SPREAD_MULT = 1.0;
/** Shrink on the leave-one-out median-residual bias correction. 0.5 halves the
 *  unshrunk correction's hi-tertile h3-h4 overshoot while keeping most of the
 *  h9-h13 fix; the shrink sweep (0.25 / 0.5 / 0.75) is a flat plateau. */
const BIAS_SHRINK = 0.5;
/** Floor on the per-hour log spread, so a degenerate fit cannot produce equal quantiles. */
const SIGMA_FLOOR = 0.05;

interface Comparable {
  name?: unknown;
  unlock?: unknown;
  day_start?: unknown;
  hourly?: Array<{ from?: unknown; viewers?: unknown }>;
}

interface Case {
  levels: number[];
  known: Array<{ hour: number; viewers: number }>;
  forecast: Array<{ hour: number }>;
  comparables?: Comparable[];
  // Present in the final case, null in practice cases; read defensively, never required.
  history_hourly?: Array<{ from?: unknown; viewers?: unknown }> | null;
  streams?: unknown;
  categories_hourly?: unknown;
}

/** x rounded to 2 decimals (half up). */
const round2 = (x: number): number => Math.round(x * 100) / 100;

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

/**
 * Release-day hourly viewers for one comparable: index 0 is hour 1 of its day_start,
 * index 23 is hour 24. Null where the source has no valid point (never interpolated).
 * Returns null when the comparable is not a launch (e.g. the Grand Theft Auto VI
 * category history, whose unlock note says "Not a launch") or has no hour-1 print.
 */
function releaseDayHours(comp: Comparable): (number | null)[] | null {
  if (typeof comp.unlock === 'string' && /not a launch/i.test(comp.unlock)) return null;
  if (typeof comp.day_start !== 'string' || !Array.isArray(comp.hourly)) return null;
  const start = Date.parse(comp.day_start);
  if (!Number.isFinite(start)) return null;
  const hours: (number | null)[] = new Array(24).fill(null);
  for (const p of comp.hourly) {
    if (typeof p.from !== 'string' || typeof p.viewers !== 'number' || !(p.viewers > 0)) continue;
    const idx = Math.floor((Date.parse(p.from) - start) / 3_600_000);
    if (idx >= 0 && idx < 24 && hours[idx] === null) hours[idx] = p.viewers;
  }
  return hours[0] === null ? null : hours;
}

/** Per-hour training points: [log hour-1 viewers, log ratio to hour 1] for hours 2..24. */
function fitPoints(days: (number | null)[][]): [number, number][][] {
  const out: [number, number][][] = [];
  for (let h = 1; h < 24; h++) {
    const pts: [number, number][] = [];
    for (const day of days) {
      const v = day[h];
      if (v !== null && v !== undefined && v > 0) pts.push([Math.log(day[0] as number), Math.log(v / (day[0] as number))]);
    }
    out.push(pts);
  }
  return out;
}

/** Weighted least squares of y on x; returns {mx, my, slope}. Null when weights sum to ~0. */
function wols(pts: [number, number][], w: number[]): { mx: number; my: number; slope: number } | null {
  let sw = 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < pts.length; i++) {
    sw += w[i];
    mx += w[i] * pts[i][0];
    my += w[i] * pts[i][1];
  }
  if (!(sw > 1e-12)) return null;
  mx /= sw;
  my /= sw;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < pts.length; i++) {
    sxy += w[i] * (pts[i][0] - mx) * (pts[i][1] - my);
    sxx += w[i] * (pts[i][0] - mx) * (pts[i][0] - mx);
  }
  return { mx, my, slope: sxx > 0 ? sxy / sxx : 0 };
}

/**
 * Local-linear prediction of r_h at log hour-1 print x0: Gaussian-kernel weighted
 * least squares of r_h on log hour-1 viewers, bandwidth LOCAL_TAU. x0 is clamped to
 * the comparables' log hour-1 range widened by LEVEL_PAD. Falls back to the plain
 * median of r_h when there are too few points or the weights degenerate.
 */
function localLinearAt(pts: [number, number][], x0: number): number {
  if (pts.length === 0) return 0; // No comparable has this hour: no information, persist hour 1.
  if (pts.length < 5) return median(pts.map(([, r]) => r));
  const xs = pts.map(([x]) => x);
  const x = clamp(x0, Math.min(...xs) - LEVEL_PAD, Math.max(...xs) + LEVEL_PAD);
  const w = pts.map(([px]) => Math.exp(-((px - x) ** 2) / (2 * LOCAL_TAU * LOCAL_TAU)));
  const fit = wols(pts, w);
  if (fit === null) return median(pts.map(([, r]) => r));
  return fit.my + fit.slope * (x - fit.mx);
}

/**
 * Kernel-weighted median of a set of {value, weight} pairs: sort by value, walk
 * the cumulative weight, and return the first value where it reaches half the
 * total weight. The plain (unweighted) median is the equal-weight special case.
 */
function weightedMedian(pairs: { v: number; w: number }[]): number {
  const sorted = [...pairs].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((s, p) => s + p.w, 0);
  if (!(total > 0)) return 0;
  let acc = 0;
  for (const p of sorted) {
    acc += p.w;
    if (acc >= total / 2) return p.v;
  }
  return sorted[sorted.length - 1].v;
}

/**
 * Leave-one-out median-residual bias correction for one hour's fit, in log-ratio
 * units, already shrunk by BIAS_SHRINK (0 when there is too little data to
 * compute it honestly). For each comparable i, predict its r_h from the OTHER
 * comparables only (local-linear fit at i's own log hour-1 print, same bandwidth
 * and clamp as the main fit) and take the residual r_i = actual - predicted.
 * Those residuals are honest out-of-sample errors: a positive median means the
 * fit systematically under-predicts, a negative median means it over-predicts.
 * The correction is the Gaussian-kernel-weighted median of the residuals at the
 * target's (clamped) log hour-1 print, same bandwidth LOCAL_TAU — the bias near
 * the target's level, not the pooled bias across all levels. It is computed from
 * the case's own comparables at run time: no new data, and no leakage of the
 * target launch (each residual excludes its own launch, and the correction for a
 * target never uses that target's actuals). The spread is deliberately NOT
 * recomputed from these residuals — the in-sample local spread of v3 stands.
 */
function looBiasCorrection(pts: [number, number][], logP1: number): number {
  if (pts.length < 8) return 0;
  const loo: { x: number; r: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const others = pts.filter((_, j) => j !== i);
    if (others.length < 5) continue;
    loo.push({ x: pts[i][0], r: pts[i][1] - localLinearAt(others, pts[i][0]) });
  }
  if (loo.length < 8) return 0;
  const xs = pts.map(([x]) => x);
  const xc = clamp(logP1, Math.min(...xs) - LEVEL_PAD, Math.max(...xs) + LEVEL_PAD);
  const pairs = loo.map((e) => ({
    v: e.r,
    w: Math.exp(-((e.x - xc) ** 2) / (2 * LOCAL_TAU * LOCAL_TAU)),
  }));
  return BIAS_SHRINK * weightedMedian(pairs);
}

/**
 * Per-hour local-linear fit for hours 2..24 at the target's log hour-1 print:
 * predicted log ratios plus the per-hour residual sigma. Sigma is LOCAL: the
 * kernel-weighted residual SD at the target's clamped log hour-1 print (same
 * bandwidth as the median fit), floored at SIGMA_FLOOR; it falls back to the
 * pooled residual SD when the local weights degenerate (effective n < 3).
 */
function localLinearFit(ptsByHour: [number, number][][], logP1: number): { pred: number[]; sig: number[] } {
  const pred: number[] = [];
  const sig: number[] = [];
  for (const pts of ptsByHour) {
    // Median log-ratio: the local-linear fit, plus the shrunk LOO median-residual
    // bias correction (v4). The spread below is unchanged from v3.
    pred.push(localLinearAt(pts, logP1) + looBiasCorrection(pts, logP1));
    if (pts.length < 5) {
      sig.push(0.8);
      continue;
    }
    // Local residual spread at the target's clamped log hour-1 print.
    const xs = pts.map(([px]) => px);
    const xc = clamp(logP1, Math.min(...xs) - LEVEL_PAD, Math.max(...xs) + LEVEL_PAD);
    let ss = 0;
    let sw = 0;
    let sw2 = 0;
    let ssd = 0;
    for (const [x, y] of pts) {
      const d = y - localLinearAt(pts, x);
      ss += d * d;
      const w = Math.exp(-((x - xc) ** 2) / (2 * LOCAL_TAU * LOCAL_TAU));
      sw += w;
      sw2 += w * w;
      ssd += w * d * d;
    }
    const effN = sw2 > 0 ? (sw * sw) / sw2 : 0;
    const pooledSig = Math.sqrt(ss / Math.max(1, pts.length - 1));
    const localSig = sw > 1e-9 && effN >= 3 ? Math.sqrt(ssd / sw) : NaN;
    sig.push(Math.max(SIGMA_FLOOR, Number.isFinite(localSig) ? localSig : pooledSig));
  }
  return { pred, sig };
}

/**
 * Forecast one case: {hours: [{hour, q: [q05, q25, q50, q75, q95]}]} for hours 2..24.
 * Pure function of the case object. Falls back to the house persistence shape when a
 * case carries too few usable comparables to fit anything.
 */
export function forecastCase(caseObj: Case): { hours: { hour: number; q: number[] }[] } {
  const first = caseObj.known.find((k) => k.hour === 1);
  if (first === undefined) throw new Error('case has no hour-1 print');
  const p1 = Math.max(1, first.viewers);
  const logP1 = Math.log(p1);

  const days: (number | null)[][] = [];
  for (const comp of caseObj.comparables ?? []) {
    const day = releaseDayHours(comp);
    if (day !== null) days.push(day);
  }

  let medLog: number[];
  let sig: number[];
  if (days.length >= 8) {
    const ptsByHour = fitPoints(days);
    const fit = localLinearFit(ptsByHour, logP1);
    medLog = fit.pred.map((r) => logP1 + r);
    sig = fit.sig.map((s) => s * SPREAD_MULT);
  } else {
    // Too few comparables to fit: persistence with the house baseline's spread.
    medLog = HOURS.map(() => logP1);
    sig = HOURS.map((h) => 0.15 * Math.sqrt(h - 1));
  }

  const hours = HOURS.map((h, i) => {
    const qs = Z.map((z) => medLog[i] + z * sig[i]).map((v) => round2(clamp(Math.exp(v), 0.01, 1e9)));
    // Enforce non-decreasing after rounding (rounding can only tie, never invert, but be safe).
    for (let j = 1; j < qs.length; j++) if (qs[j] < qs[j - 1]) qs[j] = qs[j - 1];
    return { hour: h, q: qs };
  });
  return { hours };
}

/** CLI: read every *.in in the input dir, write one *.out per case. */
function main(): void {
  const levelsOk = (c: Case): boolean =>
    c.levels.length === LEVELS.length && c.levels.every((t, j) => t === LEVELS[j]);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
  for (const file of inputs) {
    const id = file.slice(0, -'.in'.length);
    const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
    if (!levelsOk(c)) throw new Error(`${file} asks for levels ${JSON.stringify(c.levels)}, not ${JSON.stringify(LEVELS)}`);
    writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify(forecastCase(c))}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
