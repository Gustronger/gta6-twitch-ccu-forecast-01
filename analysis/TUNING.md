# Tuning log — gta6-twitch-ccu-forecast-01 (Worker B, main.ts)

Backtest: Worker A's `analysis/backtest.mjs` — leave-one-out over the comparables
of the 4 practice cases (148 pseudo-cases, 17,020 scored items), pinball loss on
the log scale exactly as the grader scores it. Baseline = house persistence
(`q = p1 * exp(z * 0.15 * sqrt(h-1))`). My own scratch lab in /tmp (pooled 37
unique comparables, same scorer) agreed with the harness to 4 decimals on every
variant I cross-checked, so the numbers below quote the harness where stated.

Headline data facts (from the comparables, pooled, 37 launches with valid hour 1):
- Hour-1 prints span 164–875,155 viewers.
- Median log-ratio curve r_h = ln(viewers_h / viewers_1): dips to 0.73x at h4,
  rises to ~2.4x at h19–20 (evening peak), ~2.0x at h24. The diurnal shape is
  inside the per-hour fits, so no separate diurnal correction was needed.
- r_h correlates with log(p1) at up to −0.92 by h19: big hour-1 launches decay
  relative to hour 1, small ones grow several-fold. This level effect is the
  whole game — it is why the plain median-ratio model barely beats baseline.
- Raw cross-comparable dispersion of r_h grows from σ≈0.19 (h2) to σ≈1.5 (h15+);
  after the level fit the residual σ is ~0.3 (early) to ~0.8–1.1 (late).

## Variants tried (LOO backtest mean loss / typical miss / 90% coverage)

| variant | loss | miss | cov90 | note |
|---|---|---|---|---|
| V0 baseline persistence | 0.9297 | 213.3% | 0.624 | harness; practice loss is 0.387, comparables are harder |
| V1 plain per-hour median of r_h | 0.8032 | 187.0% | 0.793 | lab |
| V2 global per-hour OLS slope on log(p1), κ=1, residual-σ spread | 0.4482 | 98.0% | 0.904 | lab |
| V2 κ=0.75 / κ=0.5 | 0.4792 / 0.5648 | 103% / 127% | 0.863 / 0.831 | shrinking the slope hurts |
| V2 κ=1.1 | 0.4524 | 99.9% | 0.893 | no gain from overshooting |
| V2 unclamped log(p1) | 0.4396 | 95.8% | 0.911 | slightly better in-range; kept the clamp anyway (extrapolation guard) |
| V2 robust intercept (median residual) | 0.4542 | 100.3% | 0.895 | no gain |
| V2 spread mult 0.7 / 0.85 / 1.15 / 1.3 | 0.4550 / 0.4477 / 0.4538 / 0.4625 | — | 0.792 / 0.863 / 0.929 / 0.946 | mult 1.0 ≈ best, coverage-centred |
| V4 slope on rolling-midnight-only subset | 0.7557 | 172.7% | 0.689 | subset too small/noisy — rejected |
| V5 slope excluding early-access-contaminated | 0.4637 | 100.8% | 0.904 | slightly worse than full pool — rejected |
| V6 kernel weighted median, τ=1.0 / 0.7 / 1.5 | 0.4553 / 0.4784 / 0.4673 | 83.6% / 89.3% / 87.3% | 0.878 / 0.864 / 0.863 | best median of any single model, but IQR spread too wide |
| Blend slope/NN 50/50 (v1 shipped) | **0.4104** | 80.9% | 0.912 | harness-confirmed; trim-2 (excl. 2 worst) 0.3441 |
| Blend 70/30 | 0.4213 | 86.3% | 0.918 | |
| Blend 50/50, blend-residual spread | 0.4116 | 80.9% | 0.872 | spread source doesn't matter much |
| Local-linear τ=1.0, slope-σ spread | 0.4134 | 79.1% | 0.914 | |
| Local-linear τ=1.0, resid-σ spread | 0.4106 | 79.1% | 0.871 | |
| Local-linear τ=0.7, resid-σ spread | 0.4272 | 82.9% | 0.861 | too local |
| Local-linear τ=1.25, resid-σ spread | 0.4060 | 78.5% | 0.882 | |
| Local-linear τ=1.5, resid-σ spread | 0.4039 | 78.7% | 0.885 | lab |
| Local-linear τ=2.0, resid-σ spread | 0.4030 | 80.1% | 0.892 | plateau with τ=1.5 |
| Local-linear τ=3.0, resid-σ spread | 0.4114 | 85.4% | 0.899 | too global |
| Local-linear τ=1.5, mult 0.9 / 1.1 | 0.4028 / 0.4070 | 78.7% | 0.851 / 0.902 | mult 0.9 marginally better loss but coverage at the band edge |
| **FINAL (v3): local-linear τ=1.5, LOCAL resid-σ, mult 1.0, clamp pad 0.5** | **0.3823** | **78.6%** | **0.888** | harness; tertiles lo 0.635 / mid 0.279 / hi 0.212; worst Black Myth: Wukong 1.625; ELDEN RING 0.119, Cyberpunk 0.123; mult 0.9 → 0.3835, mult 1.1 → 0.3831 (1.0 kept) |
| **POLISH (v4): v3 + LOO median-residual bias correction, shrunk ×0.5** | **0.3763** | **75.5%** | **0.891** | harness; tertiles lo 0.623 / mid 0.276 / hi 0.210; worst Black Myth: Wukong 1.659; median launch loss 0.257; see § "Polish pass (v4)" below — the only variant in this pass that fixes a measured defect instead of tuning a knob |

## Polish pass (v4) — Worker A diagnosis, Worker B implementation (2026-11-17 ~17:15 WIB)

Worker A re-ran the diagnosis on v3 (see `analysis/DIAGNOSIS.md`): v3's median
is systematically too HIGH — median signed log error +0.10 to +0.20 at most
hours (hi-tertile +0.215 at h10, +0.199 at h11) — because weighted least
squares predicts the conditional MEAN while pinball at τ=0.5 wants the
conditional MEDIAN, and residuals are right-skewed. Spread and bandwidth
tweaks were re-tested and do NOT beat v3 (mult 0.8 → 0.3870, τ=2.0 → 0.3842).
The pre-release-history anchor was rejected again (helps overall at τ=2.0 but
hurts hi-tertile). The kitchen-sink variant (quadratic median + console ×5)
was NOT shipped: its hi gain is nil and its console weight needs a
`platforms` field the case schema does not carry for the target.

The shipped fix, per hour h: leave-one-out residuals
r_i = r_h,i − pred_{−i}(log p1_i) over the comparables (each comparable
predicted from the others only, same local-linear fit, bandwidth 1.5, clamp
pad 0.5), then the Gaussian-kernel-weighted median of those residuals at the
target's clamped log p1 (same bandwidth), × 0.5 shrink, added to the median
log-ratio. Everything else stays at v3 (τ=1.5, pad 0.5, local spread ×1.0,
in-sample residuals for the spread, all fallbacks and guards). The correction
is computed from the case's own comparables at run time — no new data, no
leakage of the target launch. The shrink sweep (0.25 / 0.5 / 0.75) is a flat
plateau (0.3783 / 0.3763 / 0.3764); 0.5 halves the unshrunk correction's
hi-tertile h3–h4 overshoot while keeping most of the h9–h13 fix.

Harness numbers for v4 (official `analysis/backtest.mjs`, 148 pseudo-cases,
17,020 items), reproduced exactly by my own implementation of the spec —
0.37632 overall, hi 0.2098, lo 0.6231, mid 0.2755, miss 75.52%, coverage
0.8907, median launch loss 0.2574, worst Black Myth: Wukong 1.6588 (was
1.6254 in v3 — the correction slightly worsens the worst launch). The
numbers match Worker A's lab variant (`/tmp/gta6-lab/variant.mts`,
LAB_BIAS=med, LAB_BIAS_SHRINK=0.5) to 4 decimals on every reported stat,
including the per-hour loss line. Practice medians shift down vs v3 as
predicted: p00 −8.5% (A: −8.4%), p01 −6.0% (−5.9%), p02 −3.4% (−3.4%),
p03 −5.7% (−5.6%) mean over hours; 90% interval widths are unchanged
(spread untouched). Plausibly practice 0.188 → ~0.186, if practice tracks
the hi-tertile LOO proportionally.

Honest caveat (from DIAGNOSIS.md §3, kept here because it decides whether
this ships): the gain is **not statistically significant** — paired t −1.31
overall, −0.42 hi (n=37 unique launches; 23/37 better overall, 8/12 hi).
Recommended on mechanism (it fixes a measured +10–20% median
miscalibration) plus a consistent small win, not on a significant test. Two
hi launches regress (Monster Hunter Wilds +0.036, CoD: Black Ops +0.027);
if the final behaves like one of those, the polish costs ~0.03.

## Final model (main.ts v4 — polish pass, 2026-11-17 ~17:15 WIB)

Per hour h = 2..24, r_h = ln(viewers_h / viewers_1) across comparables (only
valid hour-1 + hour-h points; missing points skipped, never interpolated).
Median = per-hour local-linear fit: Gaussian-kernel weighted least squares of
r_h on log(viewers_1), bandwidth LOCAL_TAU = 1.5, evaluated at the target's
log(p1) clamped to the comparables' log(p1) range ± LEVEL_PAD = 0.5 — plus the
v4 bias correction: the kernel-weighted median of the leave-one-out residuals
at the target's clamped log(p1), × BIAS_SHRINK = 0.5 (see `looBiasCorrection`
in main.ts; full derivation in analysis/DIAGNOSIS.md §1/§5). The LOO
residuals are honest out-of-sample errors, so the correction centres the
median forecast without touching the spread.
Spread = per-hour residual σ of that fit (residuals at each comparable's own
log(p1)), × SPREAD_MULT = 1.0, floored at 0.05. q_τ = median · exp(z_τ · σ_h),
clamped to (0, 1e9], rounded to 2 decimals, forced non-decreasing.
The GTA VI comparable ("Not a launch" in its unlock note) is excluded from the
fits, as is any comparable without a valid hour-1 print. Fewer than 8 usable
comparables → persistence fallback with the house baseline's spread.
Robustness guard added in the v4 revision pass: an hour with zero usable
comparable points (found by a phase-locked sparse-hours edge test — see
Smoke test) now persists hour 1 for that hour instead of emitting NaN; v3
emitted null quantiles for such an hour, which would have made the whole case
invalid. The guard cannot change any harness or practice number (no empty
hour exists in the real data), and both were re-verified byte-identical after
adding it.

## Things tried and rejected (why)

- **Pre-release-history similarity.** Practice targets have pre-24h-median/p1
  ≈ 0.60–0.68; comparables span 0.006–2.30. GTA VI's category sits at ~1,687
  viewers pre-release, so its ratio in the final will be ~0.01–0.02 — far
  outside the practice range. A similarity weight on it would collapse onto
  the least-similar launches. Not used.
- **Rolling-midnight-only subset.** Unlock strings are unreliable (only 1 of
  38 literally says "rolling midnight"; most say "midnight local"), and the
  subset scores far worse (0.756). The log(p1) level effect already captures
  the unlock-type signal.
- **Separate diurnal correction.** The per-hour fits absorb the UTC-day shape
  by construction (residual mean ≈ 0 per hour); a separate correction would
  double-count it.
- **Slope shrinkage (κ < 1).** Monotonically worse; κ = 1 kept.
- **Unclamped extrapolation.** Slightly better in backtest (0.4396 vs 0.4482
  for the pure-slope model) but the final's p1 may exceed the comparable range;
  the ±0.5 clamp is cheap insurance and cost ~0.005 on the blend variant.

## Final backtest numbers (harness, 148 pseudo-cases, 17,020 items)

- Forecaster **v4: mean loss 0.3763**, typical miss **75.52%**, 90% coverage
  **0.8907**, median launch loss 0.2574, failures 0, runtime 2.0 s for the
  full backtest (~0.02 s/case). Tertiles lo 0.6231 / mid 0.2755 / hi 0.2098.
- v3 for comparison: 0.3823 / 78.59% / 0.8884, tertiles lo 0.635 / mid 0.279 /
  hi 0.212, median launch loss 0.2536. v4 improves every tertile and every
  hour except h16 (+0.012) and h23 (+0.001); biggest gains h10–h12
  (−0.011…−0.018) and h18–h19 (−0.017/−0.011).
- Baseline: mean loss 0.9297, typical miss 213.32%, coverage 0.624, median
  launch loss 0.3248. Improvement 0.5533 absolute (59.5% relative).
- v2 (pooled spread) scored 0.4035 / 78.59% / 0.8837, tertiles lo 0.653 / mid 0.292 / hi 0.244.
  v3 (local spread, adopted by the coordinator after the workers finished):
  0.3823 / 78.59% / 0.8884, tertiles lo 0.635 / mid 0.279 / hi 0.212 — every
  tertile and every hour improved; spread mult 0.9 → 0.3835 and 1.1 → 0.3831,
  so 1.0 kept. Big-launch spot checks: ELDEN RING 0.119, Cyberpunk 0.123
  (baseline ~0.23 each).
- Worst launch (v4): Black Myth: Wukong (p00) 1.6588 (p1 = 4,941 — simultaneous
  global unlock, China prime-time shape unlike the rest); 2nd worst Marathon
  ~1.2–1.3. One launch dominates the mean, but the median launch loss (0.257)
  is also far below the baseline's median (0.325), so the win is broad, not
  one-launch luck.
- Caveat: the backtest scores comparables as pseudo-targets; the 4 practice
  launches themselves are NOT in the pool, and the practice baseline loss
  (0.387) is much lower than the comparable-pool baseline (0.930), so the
  final-case loss will not be ~0.38 in absolute terms — what transfers is the
  ~59% relative improvement over baseline on the same launches.

## Smoke test (main.ts v4, 2026-11-17 ~17:15 WIB)

- `MAKEFUN_INPUT_DIR=<kit>/input MAKEFUN_OUTPUT_DIR=/tmp/gta-out-v4 node main.ts`:
  p00–p03.out written, all valid (23 rows, hours 2–24, q finite in (0, 1e9],
  non-decreasing, ≤ 1,550 bytes), 0.59 s for 4 cases (~0.15 s/case, far inside
  the 8 s limit). Second run byte-identical. Medians down vs v3 as predicted
  (p00 −8.5%, p01 −6.0%, p02 −3.4%, p03 −5.7%); 90% interval widths unchanged
  (ratio 1.000 — spread untouched). Spot values, v4 vs v3: p00 h19 median
  112,527 (was 134,099), h10 28,943 (was 32,535); p02 h19 304,324 (was
  331,244) — plausible vs the comparable curves: evening medians are
  1.1–4.8× hour 1 (p02 1.13×, p01 1.55×, p03 1.53×, p00 4.82×), scaling down
  with launch size exactly as the level effect predicts, and the biggest
  launch stays near its hour-1 level rather than exploding.
- Edge cases (copies in /tmp, kit untouched): streams + categories_hourly
  present → output byte-identical to p00 (fields ignored gracefully);
  p1 = 2,000,000 (above range) → valid, h19 median 1.69M; p1 = 50 → valid,
  h19 median 180k; 3 or 0 comparables → persistence fallback, valid
  (h2 median = p1); phase-locked sparse hourly points (whole hours missing
  across all comparables) → valid after the empty-hour guard: hours with no
  points persist hour 1, fitted hours unchanged; null viewer values → valid.
  (The sparse case is what exposed the v3 NaN — see Final model above.)
