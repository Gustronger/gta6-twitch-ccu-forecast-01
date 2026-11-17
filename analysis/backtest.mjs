// backtest.mjs — leave-one-out backtest harness for gta6-twitch-ccu-forecast-01.
//
// Scores a forecaster against the 38 comparables in each practice case by
// building a pseudo-case out of each comparable launch L (hour-1 print = L's
// release-day hour-1 viewers, pre-history = L's hourly points before
// day_start+1h, comparables = the other launches), running the forecaster on
// it, and scoring hours 2-24 against L's actuals with the grader's exact
// pinball loss on the log scale. The house baseline (persistence, spread
// 0.15*sqrt(h-1)) is scored on the same LOO set for an apples-to-apples
// comparison.
//
// Usage:
//   node analysis/backtest.mjs [--forecaster <path>] [--cases p00,p03]
//                              [--kit <input-dir>] [--launch <substring>]
//                              [--baseline-only] [--self-test] [--quiet]
//   --forecaster defaults to the repo's main.ts (../main.ts). The harness
//   dynamically imports it and calls its exported pure function
//   forecastCase(caseObj) -> {hours: [{hour, q: [q05,q25,q50,q75,q95]}]}.
//   If the module has no forecastCase export, the forecaster is treated as
//   the house baseline (so a run against the starter main.ts scores
//   baseline-vs-baseline as a sanity check).
//   --self-test checks the scorer against the RULES worked example and the
//   baseline formula against the RULES example rows, then exits.
//
// Deterministic: no randomness, no Date.now(), no network. Reads the kit's
// input files read-only; never writes into the kit. Any top-level code the
// imported forecaster module runs on import is contained by pointing
// MAKEFUN_INPUT_DIR at an empty temp dir and MAKEFUN_OUTPUT_DIR at a temp
// dir before importing (the forecaster is only ever called via forecastCase).

import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DEFAULT_KIT = resolve(REPO, '..', 'gta6-twitch-ccu-forecast-01-kit', 'input');
const DEFAULT_FORECASTER = join(REPO, 'main.ts');

/** The quantile levels the contest scores, in the order each row lists them. */
const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
/** The standard normal's quantile at each level. */
const Z = [-1.645, -0.674, 0, 0.674, 1.645];
/** House baseline spread, in natural-log units per square-root hour. */
const BASE_SIGMA = 0.15;
/** A print below 1 viewer counts as 1 (the log of 0 is no number). */
const MIN_VIEWERS = 1;

/** x rounded to 2 decimals (half up), as the baseline does. */
const round2 = (x) => Math.round(x * 100) / 100;

/** The house baseline's five quantiles for hour h around hour-1 print p1. */
function baselineQuantiles(p1, h) {
  const p = Math.max(MIN_VIEWERS, p1);
  return Z.map((z) => round2(p * Math.exp(z * BASE_SIGMA * Math.sqrt(h - 1))));
}

/**
 * One pinball item: 2 * max(tau*d, (tau-1)*d), d = ln(y) - ln(q).
 * Exactly the grader's formula (RULES, Scoring). y is clamped to >= 1.
 */
function pinball(y, q, tau) {
  const d = Math.log(Math.max(MIN_VIEWERS, y)) - Math.log(q);
  return 2 * Math.max(tau * d, (tau - 1) * d);
}

/**
 * Score one forecast against actuals.
 * @param {Array<{hour:number,q:number[]}>} rows forecast rows
 * @param {Map<number,number>} actuals hour -> actual viewers print
 * @returns {{loss:number, items:number, scoredHours:number, missSum:number,
 *            missN:number, covered:number, perHour:Map<number,{lossSum:number,items:number}>}}
 * missSum accumulates |ln(y) - ln(median)| for the typical-miss stat;
 * covered counts scored hours with q05 <= y <= q95; perHour accumulates
 * pinball loss per hour so the summary can show where the loss sits.
 */
function scoreForecast(rows, actuals) {
  const byHour = new Map(rows.map((r) => [r.hour, r.q]));
  let lossSum = 0;
  let items = 0;
  let missSum = 0;
  let missN = 0;
  let covered = 0;
  let scoredHours = 0;
  const perHour = new Map();
  for (const [h, y] of actuals) {
    const q = byHour.get(h);
    if (q === undefined) continue; // forecaster did not return this hour: unscored here
    scoredHours += 1;
    let hourLoss = 0;
    for (let j = 0; j < LEVELS.length; j += 1) {
      const item = pinball(y, q[j], LEVELS[j]);
      hourLoss += item;
      lossSum += item;
      items += 1;
    }
    const slot = perHour.get(h) ?? { lossSum: 0, items: 0 };
    slot.lossSum += hourLoss;
    slot.items += LEVELS.length;
    perHour.set(h, slot);
    missSum += Math.abs(Math.log(Math.max(MIN_VIEWERS, y)) - Math.log(q[2]));
    missN += 1;
    if (q[0] <= Math.max(MIN_VIEWERS, y) && Math.max(MIN_VIEWERS, y) <= q[4]) covered += 1;
  }
  return {
    loss: items === 0 ? NaN : lossSum / items,
    items,
    scoredHours,
    missSum,
    missN,
    covered,
    perHour,
  };
}

/** Typical miss % from accumulated |log error| of the median. */
const typicalMissPct = (missSum, missN) => (missN === 0 ? NaN : 100 * (Math.exp(missSum / missN) - 1));

/** ISO timestamp of day_start + (h-1) hours, the `from` of hour h. */
const hourISO = (dayStart, h) => new Date(Date.parse(dayStart) + (h - 1) * 3600e3).toISOString().replace('.000Z', 'Z');

/** Index a comparable's hourly points by their `from` timestamp. */
function indexHourly(comp) {
  const m = new Map();
  for (const p of comp.hourly) m.set(p.from, p);
  return m;
}

/**
 * Build the LOO pseudo-cases for one practice case.
 * Each comparable launch L with a valid hour-1 print (viewers > 0) becomes
 * one pseudo-case; the GTA VI comparable has no hour-1 print (its data ends
 * 2026-11-17, before its release) and is skipped as a target — it stays in
 * the comparables list, so the forecaster must cope with a comparable that
 * has no usable hour-1. Only hours where L has an actual print are scored;
 * sparse/missing points are never interpolated.
 */
function buildPseudoCases(caseObj) {
  const out = [];
  caseObj.comparables.forEach((launch, idx) => {
    const m = indexHourly(launch);
    const p1pt = m.get(launch.day_start);
    if (!p1pt || !(p1pt.viewers > 0)) return; // no hour-1 print: not a LOO target
    const checkpoint = hourISO(launch.day_start, 2); // day_start + 1h
    const actuals = new Map();
    for (let h = 2; h <= 24; h += 1) {
      const pt = m.get(hourISO(launch.day_start, h));
      if (pt && typeof pt.viewers === 'number') actuals.set(h, pt.viewers);
    }
    if (actuals.size === 0) return;
    const pre = launch.hourly.filter((p) => p.from < checkpoint);
    const pseudo = {
      schema: 'makefun/twitch-ccu-case/v1',
      id: `${caseObj.id}-loo-${idx}`,
      game: { name: launch.name, twitch_id: '' },
      day_start: launch.day_start,
      checkpoint,
      levels: [...LEVELS],
      known: [{
        hour: 1,
        from: launch.day_start,
        until: checkpoint,
        viewers: p1pt.viewers,
        channels: p1pt.channels ?? null,
        reads: 1,
      }],
      forecast: Array.from({ length: 23 }, (_, i) => ({
        hour: i + 2,
        from: hourISO(launch.day_start, i + 2),
        until: hourISO(launch.day_start, i + 3),
      })),
      history: pre.map((p) => ({ at: p.from, viewers: p.viewers, channels: p.channels ?? null })),
      history_hourly: pre.map((p) => ({ from: p.from, viewers: p.viewers, channels: p.channels ?? null, reads: 1 })),
      streams: null,
      categories_hourly: null,
      comparables: caseObj.comparables.filter((_, j) => j !== idx),
      notes: launch.unlock ?? '',
    };
    out.push({ launch: launch.name, p1: p1pt.viewers, pseudo, actuals });
  });
  return out;
}

/**
 * Validate a forecaster's return value. Returns the rows, or null with a
 * reason when the shape is wrong (the grader would score such a case as if
 * every quantile equalled hour 1's print; the harness does the same).
 */
function validateForecast(out) {
  if (!out || !Array.isArray(out.hours) || out.hours.length !== 23) {
    return { rows: null, reason: `expected 23 rows, got ${out && Array.isArray(out.hours) ? out.hours.length : 'no hours'}` };
  }
  const seen = new Set();
  for (const r of out.hours) {
    if (typeof r.hour !== 'number' || r.hour < 2 || r.hour > 24 || seen.has(r.hour)) {
      return { rows: null, reason: `bad or duplicate hour ${JSON.stringify(r.hour)}` };
    }
    seen.add(r.hour);
    if (!Array.isArray(r.q) || r.q.length !== 5) return { rows: null, reason: `hour ${r.hour}: expected 5 quantiles` };
    for (let j = 0; j < 5; j += 1) {
      const v = r.q[j];
      if (!Number.isFinite(v) || v <= 0 || v > 1e9) return { rows: null, reason: `hour ${r.hour}: quantile ${j} not in (0, 1e9]` };
      if (j > 0 && v < r.q[j - 1]) return { rows: null, reason: `hour ${r.hour}: quantiles not non-decreasing` };
    }
  }
  return { rows: out.hours, reason: null };
}

/** Persistence fallback rows (all quantiles = p1), the grader's invalid-case score. */
const persistenceRows = (p1) => Array.from({ length: 23 }, (_, i) => ({ hour: i + 2, q: [p1, p1, p1, p1, p1] }));

const median = (a) => {
  const s = [...a].filter(Number.isFinite).sort((x, y) => x - y);
  if (s.length === 0) return NaN;
  const i = (s.length - 1) / 2;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
};

const fmt = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');

/** Self-test: scorer vs the RULES worked example; baseline vs RULES example rows. */
function selfTest() {
  let ok = true;
  const check = (name, got, want, tol = 1e-6) => {
    const pass = Math.abs(got - want) <= tol;
    if (!pass) ok = false;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: got ${got}, want ${want}`);
  };
  // RULES worked example: two hours, rows [600000, 800000, 900000, 1100000, 1500000],
  // prints 1,000,000 and 700,000 -> loss 0.112545, typical miss 19.52%, coverage 1.
  const rows = [
    { hour: 2, q: [600000, 800000, 900000, 1100000, 1500000] },
    { hour: 3, q: [600000, 800000, 900000, 1100000, 1500000] },
  ];
  const s = scoreForecast(rows, new Map([[2, 1000000], [3, 700000]]));
  check('worked-example loss', s.loss, 0.112545, 1e-6);
  check('worked-example typical miss %', typicalMissPct(s.missSum, s.missN), 19.52, 0.01);
  check('worked-example coverage', s.covered / s.scoredHours, 1, 0);
  check('worked-example items', s.items, 10, 0);
  // RULES baseline example: p1 = 100,000.
  const h2 = baselineQuantiles(100000, 2);
  const h24 = baselineQuantiles(100000, 24);
  check('baseline h2 q05', h2[0], 78133.6, 0.01);
  check('baseline h2 q95', h2[4], 127985.91, 0.01);
  check('baseline h24 q05', h24[0], 30624.45, 0.01);
  check('baseline h24 q95', h24[4], 326536.46, 0.01);
  check('baseline h2 median', h2[2], 100000, 0.01);
  // Pinball spot checks from the worked example's first hour, tau = 0.05 and 0.25.
  check('pinball tau=0.05 y=1e6 q=6e5', pinball(1000000, 600000, 0.05), 0.051083, 1e-6);
  check('pinball tau=0.25 y=1e6 q=8e5', pinball(1000000, 800000, 0.25), 0.111572, 1e-6);
  console.log(ok ? 'SELF-TEST: ALL PASS' : 'SELF-TEST: FAILURES — do not trust the scorer');
  return ok;
}

function parseArgs(argv) {
  const args = { forecaster: DEFAULT_FORECASTER, cases: null, kit: DEFAULT_KIT, baselineOnly: false, selfTest: false, quiet: false, launch: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--forecaster') args.forecaster = resolve(argv[++i]);
    else if (a === '--cases') args.cases = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--kit') args.kit = resolve(argv[++i]);
    else if (a === '--launch') args.launch = argv[++i].toLowerCase();
    else if (a === '--baseline-only') args.baselineOnly = true;
    else if (a === '--self-test') args.selfTest = true;
    else if (a === '--quiet') args.quiet = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    process.exit(selfTest() ? 0 : 1);
  }

  // Load the practice cases (read-only).
  const files = readdirSync(args.kit).filter((f) => f.endsWith('.in')).sort();
  const wanted = args.cases;
  const cases = files
    .filter((f) => !wanted || wanted.includes(f.slice(0, -3)))
    .map((f) => JSON.parse(readFileSync(join(args.kit, f), 'utf8')));
  if (cases.length === 0) throw new Error(`no practice cases found in ${args.kit}`);
  const pseudoCases = cases.flatMap((c) => buildPseudoCases(c).map((p) => ({ ...p, caseId: c.id })))
    .filter((p) => !args.launch || p.launch.toLowerCase().includes(args.launch));
  if (pseudoCases.length === 0) throw new Error('no pseudo-cases after filtering (check --cases / --launch)');
  console.log(`LOO set: ${pseudoCases.length} pseudo-cases from ${cases.length} practice case(s) (${cases.map((c) => c.id).join(', ')})${args.launch ? `, launch filter "${args.launch}"` : ''}`);

  // Load the forecaster. Contain any top-level code it runs on import by
  // pointing its input/output dirs at empty temp dirs first: the harness
  // only ever calls forecastCase, never the module's CLI path.
  let forecastFn = null;
  let forecasterNote = '';
  if (!args.baselineOnly) {
    process.env.MAKEFUN_INPUT_DIR = mkdtempSync(join(tmpdir(), 'bt-in-'));
    process.env.MAKEFUN_OUTPUT_DIR = mkdtempSync(join(tmpdir(), 'bt-out-'));
    const mod = await import(`${pathToFileURL(args.forecaster).href}`);
    if (typeof mod.forecastCase === 'function') {
      forecastFn = mod.forecastCase;
      forecasterNote = args.forecaster;
    } else {
      forecasterNote = `${args.forecaster} exports no forecastCase — scoring the forecaster as the house baseline`;
    }
  } else {
    forecasterNote = 'baseline-only run';
  }
  console.log(`Forecaster: ${forecasterNote}`);

  const t0 = performance.now();
  const perLaunch = [];
  let fLossSum = 0; let fItems = 0; let fMissSum = 0; let fMissN = 0; let fCovered = 0; let fScoredHours = 0;
  let bLossSum = 0; let bItems = 0; let bMissSum = 0; let bMissN = 0; let bCovered = 0; let bScoredHours = 0;
  let fFailures = 0;
  // Per-hour loss accumulators, for the by-hour breakdown in the summary.
  const fHour = new Map();
  const bHour = new Map();
  const addHour = (map, perHour) => {
    for (const [h, s] of perHour) {
      const slot = map.get(h) ?? { lossSum: 0, items: 0 };
      slot.lossSum += s.lossSum;
      slot.items += s.items;
      map.set(h, slot);
    }
  };
  for (const pc of pseudoCases) {
    // Baseline on the same pseudo-case.
    const bRows = Array.from({ length: 23 }, (_, i) => ({ hour: i + 2, q: baselineQuantiles(pc.p1, i + 2) }));
    const b = scoreForecast(bRows, pc.actuals);
    bLossSum += b.loss * b.items; bItems += b.items;
    bMissSum += b.missSum; bMissN += b.missN; bCovered += b.covered; bScoredHours += b.scoredHours;
    addHour(bHour, b.perHour);

    // Forecaster (or the baseline again when no forecastCase export exists).
    let fRows = bRows;
    let fReason = null;
    if (forecastFn) {
      try {
        const out = forecastFn(pc.pseudo);
        const v = validateForecast(out);
        if (v.rows) fRows = v.rows;
        else { fReason = v.reason; fFailures += 1; fRows = persistenceRows(Math.max(MIN_VIEWERS, pc.p1)); }
      } catch (e) {
        fReason = `threw: ${e.message}`;
        fFailures += 1;
        fRows = persistenceRows(Math.max(MIN_VIEWERS, pc.p1));
      }
    }
    const f = scoreForecast(fRows, pc.actuals);
    fLossSum += f.loss * f.items; fItems += f.items;
    fMissSum += f.missSum; fMissN += f.missN; fCovered += f.covered; fScoredHours += f.scoredHours;
    addHour(fHour, f.perHour);
    perLaunch.push({
      caseId: pc.caseId, launch: pc.launch, p1: pc.p1, nHours: pc.actuals.size,
      lossF: f.loss, lossB: b.loss,
      missF: typicalMissPct(f.missSum, f.missN), missB: typicalMissPct(b.missSum, b.missN),
      covF: f.scoredHours ? f.covered / f.scoredHours : NaN,
      covB: b.scoredHours ? b.covered / b.scoredHours : NaN,
      reason: fReason,
    });
  }
  const secs = (performance.now() - t0) / 1000;

  const meanLossF = fLossSum / fItems;
  const meanLossB = bLossSum / bItems;
  const worst = [...perLaunch].sort((a, b) => b.lossF - a.lossF)[0];
  const worstB = [...perLaunch].sort((a, b) => b.lossB - a.lossB)[0];

  if (!args.quiet) {
    console.log('\nPer-launch loss (forecaster vs baseline):');
    console.log('case  launch                                    p1        hrs  lossF    lossB    missF%  missB%  covF   covB');
    for (const r of perLaunch) {
      console.log(
        `${r.caseId}  ${r.launch.padEnd(40).slice(0, 40)}  ${String(r.p1).padStart(8)}  ${String(r.nHours).padStart(3)}  ${fmt(r.lossF)}  ${fmt(r.lossB)}  ${fmt(r.missF, 1).padStart(6)}  ${fmt(r.missB, 1).padStart(6)}  ${fmt(r.covF, 2)}  ${fmt(r.covB, 2)}${r.reason ? `  INVALID: ${r.reason}` : ''}`,
      );
    }
  }
  console.log('\n=== SUMMARY ===');
  console.log(`pseudo-cases: ${pseudoCases.length}, scored items per forecaster: ${fItems} (${fScoredHours} hours x 5 quantiles)`);
  console.log(`forecaster failures (invalid shape / threw, scored as persistence): ${fFailures}`);
  console.log(`FORECASTER  mean loss ${fmt(meanLossF)} | typical miss ${fmt(typicalMissPct(fMissSum, fMissN), 2)}% | 90% coverage ${fmt(fCovered / fScoredHours)} | median launch loss ${fmt(median(perLaunch.map((r) => r.lossF)))}`);
  console.log(`BASELINE    mean loss ${fmt(meanLossB)} | typical miss ${fmt(typicalMissPct(bMissSum, bMissN), 2)}% | 90% coverage ${fmt(bCovered / bScoredHours)} | median launch loss ${fmt(median(perLaunch.map((r) => r.lossB)))}`);
  console.log(`improvement: ${(meanLossB - meanLossF).toFixed(4)} absolute (${(100 * (meanLossB - meanLossF) / meanLossB).toFixed(1)}% relative)`);
  console.log(`worst launch (forecaster): ${worst.launch} (${worst.caseId}) loss ${fmt(worst.lossF)} p1=${worst.p1}`);
  console.log(`worst launch (baseline):   ${worstB.launch} (${worstB.caseId}) loss ${fmt(worstB.lossB)} p1=${worstB.p1}`);

  // Mean pinball loss by hour: shows which hours carry the loss.
  console.log('\nMean loss by hour (forecaster vs baseline):');
  const hourLine = [];
  for (let h = 2; h <= 24; h += 1) {
    const fs = fHour.get(h);
    const bs = bHour.get(h);
    hourLine.push(`h${h}:${fs ? fmt(fs.lossSum / fs.items) : 'n/a'}/${bs ? fmt(bs.lossSum / bs.items) : 'n/a'}`);
  }
  console.log(hourLine.join(' '));

  // Mean launch loss by hour-1 print tertile: the loss is dominated by
  // small launches (see NOTES.md §4), so the split shows where tuning pays.
  // Tertile cutoffs are the pooled p1 tertiles of this LOO set.
  const p1s = [...new Set(perLaunch.map((r) => r.p1))].sort((a, b) => a - b);
  const t1 = p1s[Math.floor(p1s.length / 3)];
  const t2 = p1s[Math.floor((2 * p1s.length) / 3)];
  console.log(`\nMean launch loss by p1 tertile (cutoffs ${t1} / ${t2}):`);
  const tertiles = [];
  for (const [label, pred] of [['lo ', (p) => p <= t1], ['mid', (p) => p > t1 && p <= t2], ['hi ', (p) => p > t2]]) {
    const g = perLaunch.filter((r) => pred(r.p1));
    const meanF = g.reduce((s, r) => s + r.lossF, 0) / g.length;
    const meanB = g.reduce((s, r) => s + r.lossB, 0) / g.length;
    const shareF = (100 * g.reduce((s, r) => s + r.lossF, 0)) / perLaunch.reduce((s, r) => s + r.lossF, 0);
    console.log(`  ${label} (n=${g.length}): forecaster ${fmt(meanF)} | baseline ${fmt(meanB)} | share of forecaster loss ${shareF.toFixed(1)}%`);
    tertiles.push({ label: label.trim(), n: g.length, meanLossF: +meanF.toFixed(4), meanLossB: +meanB.toFixed(4), shareOfForecasterLossPct: +shareF.toFixed(1) });
  }

  console.log(`runtime: ${secs.toFixed(1)}s for ${pseudoCases.length} pseudo-cases`);
  console.log(JSON.stringify({
    summary: 'backtest',
    pseudoCases: pseudoCases.length,
    items: fItems,
    forecaster: { meanLoss: +meanLossF.toFixed(6), typicalMissPct: +typicalMissPct(fMissSum, fMissN).toFixed(2), coverage90: +(fCovered / fScoredHours).toFixed(4), medianLaunchLoss: +median(perLaunch.map((r) => r.lossF)).toFixed(4), failures: fFailures },
    baseline: { meanLoss: +meanLossB.toFixed(6), typicalMissPct: +typicalMissPct(bMissSum, bMissN).toFixed(2), coverage90: +(bCovered / bScoredHours).toFixed(4), medianLaunchLoss: +median(perLaunch.map((r) => r.lossB)).toFixed(4) },
    worstForecaster: { launch: worst.launch, caseId: worst.caseId, loss: +worst.lossF.toFixed(4), p1: worst.p1 },
    tertiles,
    meanLossByHour: Object.fromEntries([...fHour.entries()].sort((a, b) => a[0] - b[0]).map(([h, s]) => [h, +(s.lossSum / s.items).toFixed(4)])),
    runtimeSecs: +secs.toFixed(1),
  }));
}

main().catch((e) => { console.error(e.stack ?? e.message); process.exit(1); });
