# GTA VI Twitch CCU forecast — polish-pass diagnosis (Worker A)

Competition: `gta6-twitch-ccu-forecast-01`. Shipped model v3 (commit 241317e):
per-hour local-linear fit of log-ratios r_h on log(hour-1 viewers), Gaussian
kernel bandwidth 1.5, level clamp ±0.5, LOCAL residual spread × 1.0.
Practice score (server-side, verified live 17 Nov, re-checked 17:12 WIB):
**loss 0.188, rank 855 of 2,892, typical miss 32.42%, 90% coverage 1.0**,
all 4 cases valid. (Rank was 818/2,773 at 16:59 WIB; the board has grown since.)

All numbers below are leave-one-out backtests over the kit's comparables
(148 pseudo-cases = 37 distinct launches × 4 practice cases, 17,020 scored
items), run with `analysis/backtest.mjs` and a variant lab
(`/tmp/gta6-lab/lab.mjs` + `variant.mts`, a parameterised copy of `main.ts`).
The lab reproduces the harness exactly (v3: 0.3823 / hi 0.2122 / cov 0.8884).
Caveat that governs everything here: **the effective sample is 37 launches,
not 148** — each launch appears 4×. Paired differences are reported with SEs
across the 37 unique launches; nothing in this pass clears p < 0.05.

## 1. Reproduction + where v3 loses

v3 reproduced exactly: **overall 0.3823, typical miss 78.59%, coverage 0.8884**,
tertiles lo 0.6348 / mid 0.2789 / hi 0.2122; worst launch Black Myth: Wukong
1.6254 (p1 4,941), then Marathon 1.3316.

Loss by hour (overall): peaks **h11–15 (0.47–0.50)**, h6–10 0.40–0.47,
evening h19–24 0.30–0.33, h2 0.153. Hi-tertile loss by hour is flat,
0.18–0.26, worst h7 (0.250), h9–11 (0.248–0.257), best h2 (0.126) and h23
(0.182). The recommended variant (§5) moves hi loss by hour only slightly —
it trades a small early-hour cost for a mid-day gain: h2 0.126→0.129,
h3 0.161→0.164, h4 0.175→0.173, h10 0.257→0.250, h11 0.254→0.249,
h13 0.224→0.224, h15 0.222→0.223, h19 0.214→0.204, h20 0.211→0.207.
Its hi mean signed error ends up within ±0.10 at every hour (mostly ±0.05),
vs v3's −0.06 early / +0.02…+0.08 daytime pattern — better centred, with the
h3 overshoot halved by the ×0.5 shrink but not eliminated. Loss share: **lo
tertile carries 58.3% of v3's loss** (mean 0.635) — but the final is one big
launch, so lo-tertile gains do not transfer.
The hi tertile (18.0% of the loss) is the only slice that matters for GTA VI.

Coverage by tertile (v3): **lo 0.8395 (under), mid 0.8949, hi 0.9348 (over)**.
The practice coverage of 1.0 is consistent with hi over-coverage plus 4-case
luck — it is not evidence the spreads are right. Hi coverage by hour: h2
**0.75 (under-covered)**, h3–h14 0.83–0.92, h15–h20 and h23–h24 **1.00
(over-covered)**. The h2 under-coverage is a spread problem (the
LOO-residual spread was tried and gave no loss gain, §3); the late-hour
over-coverage is a median problem (next subsection).

### The main finding: v3's median is systematically too high

WOLS predicts the **conditional mean** of r_h, but the scored τ=0.5 pinball
wants the conditional **median**, and the residual distribution is strongly
right-skewed (small launches whose evenings explode ×100–×2000), so
mean > median. The MEAN signed log error looked small (+0.05 at h10) only
because the exploding launches drag the mean down; the MEDIAN signed error —
the right diagnostic for the median forecast — shows v3 over-predicts the
typical launch by **+10–20% at most hours**:

| h | 2 | 3 | 8 | 9 | 10 | 11 | 12 | 18 | 19 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|
| v3 median err (all) | +0.102 | +0.090 | +0.125 | +0.151 | **+0.198** | **+0.188** | +0.142 | +0.160 | +0.170 | +0.120 |
| v3 median err (hi) | +0.008 | +0.001 | +0.080 | +0.142 | **+0.215** | **+0.199** | +0.170 | −0.025 | −0.050 | −0.056 |

Hi-tertile: v3 over-predicts big launches' daytime (h9–h13) by 14–22%, while
h2–h3 and the evening are roughly centred. That is a genuine, systematic
miscalibration — not a hyperparameter accident — and it is what the winning
variant fixes (see §3). With the (unshrunk) correction the overall median
error falls to within ±0.08 at every hour (mostly ±0.04, worst +0.076 at
h12); for hi launches it fixes h9–h13 but overshoots h3–h4 (median error
−0.21 there) — the ×0.5 shrink in the recommendation halves that overshoot.

## 2. Variant results (LOO backtest)

Ranked by overall loss; hi-tertile is the decision column for the final.

| variant | overall | hi | lo | mid | cov | covHi | miss % |
|---|---|---|---|---|---|---|---|
| v3 shipped | 0.3823 | 0.2122 | 0.6348 | 0.2789 | 0.8884 | 0.9348 | 78.6 |
| spread mult 0.9 | 0.3835 | 0.2115 | 0.6396 | 0.2781 | 0.8590 | 0.8877 | 78.6 |
| spread mult 0.8 | 0.3870 | 0.2122 | 0.6481 | 0.2790 | 0.8273 | 0.8587 | 78.6 |
| spread mult 0.7 / 0.6 / 0.5 | 0.3931 / 0.4026 / 0.4170 | 0.2151 / 0.2207 / 0.2307 | — | — | 0.790 / 0.720 / 0.624 | — | 78.6 |
| bandwidth 1.0 | 0.3921 | 0.2111 | 0.6657 | 0.2767 | 0.8590 | 0.8877 | 79.1 |
| bandwidth 1.25 | 0.3850 | 0.2113 | 0.6456 | 0.2764 | 0.8719 | 0.9022 | 78.5 |
| bandwidth 2.0 / 2.5 | 0.3842 / 0.3912 | 0.2189 / 0.2328 | 0.6261 / 0.6253 | 0.2874 / 0.2960 | 0.9025 / 0.9107 | 0.9710 / 0.9819 | 80.0 / 82.6 |
| clamp pad 0 | 0.3854 | 0.2121 | 0.6438 | 0.2789 | 0.8872 | 0.9348 | 79.2 |
| clamp pad 1.0 / inf | 0.3812 | 0.2122 | 0.6317 | 0.2789 | 0.8895 | 0.9348 | 78.4 |
| pooled spread (v2) | 0.4035 | 0.2441 | 0.6531 | 0.2924 | 0.8837 | 0.9964 | 78.6 |
| LOO-residual spread | 0.3829 | 0.2135 | 0.6338 | 0.2803 | 0.9095 | 0.9529 | 78.6 |
| global quadratic median | 0.3740 | 0.2133 | 0.6112 | 0.2778 | 0.8837 | 0.9348 | 76.4 |
| LOO bias, mean residual | 0.3813 | 0.2110 | 0.6342 | 0.2776 | 0.8907 | 0.9348 | 77.8 |
| LOO bias, median residual | 0.3784 | 0.2105 | 0.6254 | 0.2787 | 0.8848 | 0.9239 | 75.2 |
| anchor, similarity weight τ=1.0 | 0.3953 | 0.2238 | 0.6418 | 0.2997 | 0.8378 | 0.9239 | 80.8 |
| anchor, similarity weight τ=2.0 | 0.3791 | 0.2133 | 0.6226 | 0.2810 | 0.8790 | 0.9167 | 77.6 |
| anchor, 2nd covariate | 0.3848 | 0.2165 | 0.6287 | 0.2888 | 0.8942 | 0.9275 | 78.8 |
| console weight ×5 | 0.3793 | 0.2120 | 0.6320 | 0.2729 | 0.8895 | 0.9493 | 77.8 |
| bias-med + quad median | 0.3717 | 0.2115 | 0.6094 | 0.2742 | 0.8907 | 0.9275 | 75.0 |
| bias-med + console ×5 | 0.3745 | 0.2104 | 0.6241 | 0.2682 | 0.8766 | 0.9348 | 74.1 |
| bias-med, shrink 0.5 | **0.3763** | **0.2098** | 0.6231 | 0.2755 | 0.8907 | 0.9312 | 75.5 |
| bias-med + quad + console ×5, shrink 0.75 | 0.3680 | 0.2110 | 0.6038 | 0.2697 | 0.8966 | 0.9420 | 74.8 |
| bias-med + quad + console ×5, shrink 0.5 | 0.3683 | 0.2111 | 0.6038 | 0.2702 | 0.8954 | 0.9420 | 75.0 |

Notes on the table:
- The quad-median row is 0.3740 after the refactor (spread residuals now use
  the same estimator as the median); the pre-refactor number was 0.3758.
- The kitchen-sink row (bias-med + quad + console ×5) scores **0.3720 / hi
  0.2116 in the official harness** vs 0.3680 / 0.2110 in my lab: the harness's
  pseudo-cases carry no `game.platforms`, so the console flag falls back to
  the name check and is wrong for console-only LOO targets. In production
  the final case's name is "Grand Theft Auto VI", so the name fallback gives
  the right answer there — but the console weight's LOO evidence is weaker
  than the lab number suggests, and it depends on that fallback. See §5.
- Shrink sweep on the bias correction (0.25 / 0.5 / 0.75) is flat: overall
  0.3783 / 0.3763 / 0.3764 (loclin) and 0.3693 / 0.3683 / 0.3680 (quad+console)
  — a plateau, not a peak. The full (unshrunk) correction overshoots the hi
  h3–h4 median error (−0.21); shrink 0.5 halves that overshoot while keeping
  most of the h9–h13 fix.

## 3. What works, what doesn't

- **Spread multiplier: 1.0 stands.** Every multiplier below 1.0 is worse
  overall (0.9 → 0.3835, 0.8 → 0.3870, 0.5 → 0.4170). The hi-tertile gain
  at 0.9 (−0.0007) is noise. This confirms the v3 tuning note and answers the
  practice over-coverage directly: narrowing the spreads does NOT buy
  practice loss — the practice coverage of 1.0 is a 4-case artefact on top
  of hi over-coverage, and the LOO-optimal spread is already ~1.0.
- **Bandwidth: 1.5 stands.** τ=1.0/1.25 are marginally better on hi
  (−0.001) but clearly worse overall (+0.010/+0.003); τ≥2.0 is worse on hi
  too. No change.
- **Clamp pad: keep 0.5.** Pad 1.0/inf gains −0.0011 overall with hi flat —
  noise, and it only matters if GTA VI's hour-1 print exceeds the comparable
  range by >0.5 log units (≈1.44M viewers). The insurance is worth more
  than a noise-level LOO gain.
- **Pre-release-history anchor: rejected again, properly this time.** As a
  similarity weight it hurts at τ≤1.0 (0.3953) and at τ=2.0 helps overall
  (−0.0032) but hurts hi (+0.0011); as a second covariate it is worse on
  both (0.3848 / hi 0.2165). GTA VI's anchor sits far outside the
  comparables' range, exactly as the build notes warned. Do not ship it.
- **LOO-residual spread: no loss gain** (0.3829, hi 0.2135) despite being
  the honest dispersion. It widens coverage to 0.9095 but does not fix the
  h2 hi under-coverage in loss terms. Reject.
- **Global quadratic median: helps overall (−0.008) but not hi (+0.001).**
  The gain is all lo-tertile. For the final it is a wash, and it swaps the
  local-linear estimator — the safer extrapolator above the p1 range — for a
  global quadratic. Not worth it on its own.
- **Console weighting (×5): helps overall (−0.003) and mid (−0.006), hi
  flat (−0.0002).** Directionally consistent with the board's "console-shape
  bias" idea, but the hi evidence is nil and it depends on detecting the
  target's console status from the game name in production (see §5).
- **LOO bias correction (median residual): the one real win.** It is the
  only variant that fixes the measured defect in §1 rather than tuning a
  knob: it centres the median forecast (median error ≈ 0 at nearly every
  hour, vs +0.10–0.20 for v3). Alone: 0.3784 / hi 0.2105. Shrunk ×0.5:
  **0.3763 / hi 0.2098**, miss 75.5% (from 78.6%), coverage 0.8907 (still at
  nominal). The correction is computed from the case's own comparables at
  run time (leave-one-out residuals, kernel-weighted median at the target's
  log p1) — no new data, no leakage of the target launch (each LOO residual
  excludes its own launch, and the correction for a target never uses that
  target's actuals).

Paired tests vs v3 (per-unique-launch, n=37; negative = candidate better):
- bias-med shrink 0.5: overall **−0.0060 ± 0.0046 (t=−1.31)**, 23/37 better;
  hi **−0.0023 ± 0.0056 (t=−0.42)**, 8/12 better. Worst hi regressions:
  Monster Hunter Wilds +0.036, CoD: Black Ops +0.027; the other 10 hi
  launches improve or are flat.
- kitchen-sink (bias-med + quad + console ×5, shrink 0.75): overall
  −0.0143 ± 0.0119 (t=−1.19), 18/37 better; hi −0.0012 ± 0.0099 (t=−0.12),
  6/12 better — bigger overall gain, but noisier and a coin flip on hi.

Neither clears significance. The honest expected effect on the final is
small: if practice loss tracks the hi-tertile LOO proportionally
(0.2122 → 0.2098, −1.1%), **practice 0.188 → ~0.186**. The mechanism is
real and the downside is bounded (one shrunk additive correction), but this
is a ~1% polish, not a step change toward the 0.10–0.12 top board.

## 4. Leaderboard hints (top 20 titles, fetched 17 Nov ~17:12 WIB)

- #1 "kernel log-log + console-shape bias" — console weighting tested (§3):
  small overall gain, hi flat.
- #2 "rolling-midnight log regression + GTA prior (v2: hourly-calibrated)" —
  the GTA prior is the pre-release anchor, tested and rejected (§3).
- #3 "Eve-anchored regime-weighted ridge (practice 0.1203)" — "regime-weighted"
  maps to the quad/ridge family (tested: overall gain, hi flat). "Eve" reads
  as an author name, not a testable feature.
- #7 "DST-aligned US-unlock step" — the US unlock step (05:00Z/08:00Z) is
  already inside the per-hour medians by construction; a separate step term
  would double-count it. Not tested separately.
- #9 "Bias-Corrected Local-Linear Forecaster v5" and #10 "9-feature
  hour-group ridge, LOO bias correction, calibrated spread" — the LOO bias
  correction is exactly the winning variant here; independent convergence.
- #13 "quadratic-OLS log-ratio + pre-release anchor + rolling-big bias (DEV
  0.129)" — quad tested (overall gain, hi flat); anchor rejected; the
  combination was tested as bias-med + quad (0.3717) and the kitchen sink.
- #20 "Ridge launch curves + pool calibration pass (shrink 0.6, bw 1.6)" —
  consistent with the shrink-0.5 finding and τ≈1.5.
- Ideas only; no other entry's code is visible or copied. The board's
  practice top is ~0.10–0.12 vs our 0.188; the gap is far larger than any
  variant found here, which suggests the top entries are doing something
  structurally different (or fitting the 4 practice cases harder) — nothing
  in the LOO backtest points at a 0.10-scale improvement from this model
  family.

## 5. Recommendation

**Ship the simple variant: v3 + LOO median-residual bias correction, shrunk
×0.5.** Concretely, in `localLinearFit`, per hour h: compute leave-one-out
residuals r_i = r_h,i − pred_{-i}(log p1_i) over the comparables, take the
kernel-weighted median at the target's (clamped) log p1 with the same
bandwidth 1.5, multiply by 0.5, and add it to the median log-ratio. Keep
everything else at v3 (τ=1.5, pad 0.5, local spread ×1.0, no anchor, no
console weight, no quad).

Expected gain: LOO 0.3823 → **0.3763** (−1.6%), hi-tertile 0.2122 → **0.2098**
(−1.1%), typical miss 78.6% → 75.5%, coverage 0.8884 → 0.8907. Practice
medians shift down 3–8% on p00–p03 (p00 −8.4%, p01 −5.9%, p02 −3.4%,
p03 −5.6% mean over hours), i.e. practice loss plausibly 0.188 → ~0.186.
Runtime: 2.7 s for 148 pseudo-cases in the harness (~0.02 s/case) — far
inside the 8 s limit. Verified through the official harness
(`backtest.mjs --forecaster variant.mts`, same numbers as the lab).

Risks / honesty notes:
- The gain is **not statistically significant** (paired t=−1.31 overall,
  −0.42 hi; n=37/12 launches). It is recommended on mechanism (it fixes a
  measured +10–20% median miscalibration) plus a consistent small LOO win,
  not on a significant test.
- The correction slightly worsens the worst launch (Black Myth: Wukong
  1.625 → 1.659) and two hi launches (Monster Hunter Wilds +0.036, CoD:
  Black Ops +0.027 in paired hi diffs). If the final behaves like one of
  those, the polish costs ~0.03; if it behaves like the other 10 hi
  launches, it gains ~0.01–0.02.
- Do NOT ship the kitchen sink (quad + console ×5 + bias-med): its overall
  LOO is better (0.3680 lab / 0.3720 harness) but its hi-tertile gain is
  nil (0.2110/0.2116 vs 0.2122), it adds a global-quadratic extrapolator
  above the p1 range, and its console weight depends on detecting the
  target as console-only from the game name — the case schema carries no
  `platforms` field for the target, so a renamed final case would silently
  boost the wrong group.
- Safety rule from the coordinator stands: resubmit the polished model, and
  if its practice loss comes back WORSE than 0.188, restore v1 commit
  241317e by resubmitting it before the 19 Nov 08:00 WIB deadline (quota
  used 1/20 so far).

## 6. Lab artefacts (not part of the entry)

- `/tmp/gta6-lab/lab.mjs` — LOO scorer with tertile/hour/coverage/bias
  breakdowns (reproduces the harness exactly on v3).
- `/tmp/gta6-lab/variant.mts` — parameterised main.ts (env knobs LAB_TAU,
  LAB_PAD, LAB_SPREAD_MULT, LAB_SPREAD, LAB_MEDIAN, LAB_BIAS,
  LAB_BIAS_SHRINK, LAB_ANCHOR, LAB_CONSOLE).
- `/tmp/gta6-lab/paired.mjs`, `diag.mjs` — paired per-launch tests and the
  median-vs-mean signed-error diagnostic.
- `/tmp/gta6-lab/grid{1..5}.txt` — full variant grids.
