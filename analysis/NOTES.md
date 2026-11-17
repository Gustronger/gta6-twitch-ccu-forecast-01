# GTA VI Twitch CCU forecast — analysis notes (Worker A)

Competition: `gta6-twitch-ccu-forecast-01`. Kit:
`~/workspace/makefun/gta6-twitch-ccu-forecast-01/gta6-twitch-ccu-forecast-01-kit/`.
Repo: `~/workspace/makefun/gta6-twitch-ccu-forecast-01/repo/` (branch main).
All numbers below were computed from the kit's `input/p00.in`–`p03.in`
(read-only) on 2026-11-17. Scripts used live in `/tmp/gta6-analysis/`
(`probe.mjs`, `analyze.mjs`, `analyze2.mjs`); the durable deliverable is
`analysis/backtest.mjs` in the repo.

## 1. Case shape (verified, not assumed)

- Each practice case: `id`, `game`, `day_start` (00:00 UTC of release day),
  `checkpoint` (day_start + 1h), `levels` [0.05, 0.25, 0.5, 0.75, 0.95],
  `known` (one row, hour 1), `forecast` (23 rows, hours 2–24),
  `history` / `history_hourly`, `streams` = null, `categories_hourly` = null,
  `comparables` (38), `notes` (a **string**, 895–1022 chars — it is the
  launch's unlock story + SullyGnome sourcing note, not a list).
- Hour-1 prints: p00 Marvel's Wolverine 23,357 (ch 619); p01 Red Dead
  Redemption 2 116,550 (ch 2,435); p02 God of War Ragnarök 269,517 (ch 2,709);
  p03 Marvel's Spider-Man 2 119,087 (ch 1,784).
- `history`/`history_hourly` are **sparse**: p00 has 167 points over 14 days
  (last 7 days: 126 of 168 hours), p01 330, p02 271, p03 240. SullyGnome
  does not sample every hour; a missing hour is a gap, never a zero.
  `history` and `history_hourly` are identical in the practice cases
  (same points, same counts).
- Comparable `hourly` arrays are also sparse: lengths range 117–408 points
  (408 = full 17 days × 24 h). 1,144 adjacent pairs across all comparables
  are non-contiguous (gaps). 388 of 55,032 comparable hourly points have
  `viewers == 0` (0.7%, pre-release dead hours); `channels` is never null.
  **Never interpolate across a missing hour** — index by `from` timestamp.
- The 38 comparables are the **same 38 launches in all 4 cases** (only the
  four practice launches are excluded from each case's own list — the RULES
  say comparables leave out every practice launch, and the 38 are identical
  across p00–p03). Consequence: the LOO set is 37 distinct launches × 4
  identical copies = 148 pseudo-cases. The mean is valid, but "n = 148"
  overstates independent evidence; the effective sample is 37 launches.
- The final case has 42 comparables (38 + the 4 practice launches).

## 2. Hour-1 prints across comparables

148 valid hour-1 prints (of 152; the 4 missing are the GTA VI comparable,
once per case — it has no hour-1 print, see §6).

| stat | viewers |
|---|---|
| min | 164 (Hollow Knight: Silksong) |
| p10 | 1,393 |
| p25 | 10,639 |
| median | 53,526 |
| p75 | 146,993 |
| p90 | 387,358 |
| max | 875,155 (ELDEN RING) |

log10(p1): median 4.73, IQR 1.14 — three orders of magnitude of spread.
Largest: ELDEN RING 875,155; Cyberpunk 2077 851,999; Diablo IV 533,455.
Smallest: Silksong 164; Kingdom Come: Deliverance II 414; Marathon 1,393;
Baldur's Gate 3 3,447; Black Myth: Wukong 4,941.
9 of 38 launches are console-only (no PC): Ghost of Yōtei, Saros, Zelda:
Tears of the Kingdom, Death Stranding 2, FF VII Rebirth, The Last of Us
Part II, Ghost of Tsushima, Stellar Blade, and the GTA VI category itself.
Unlock strings mention "rolling" for 6/38, "simultaneous" for 7/38.

## 3. The log-ratio curves r_h = ln(viewers_h / viewers_1), h = 2..24

Pooled over all 148 launch-cases (every comparable has all 23 release-day
hours present with viewers > 0):

| h (UTC) | median r | p25 | p75 | IQR | mean | sd | ratio exp(median) |
|---|---|---|---|---|---|---|---|
| 2 (01:00) | −0.138 | −0.257 | −0.005 | 0.253 | −0.081 | 0.299 | 0.87 |
| 3 (02:00) | −0.283 | −0.477 | −0.069 | 0.408 | −0.227 | 0.715 | 0.75 |
| 4 (03:00) | −0.310 | −0.642 | −0.121 | 0.521 | −0.265 | 0.760 | 0.73 |
| 5 (04:00) | −0.292 | −0.486 | −0.074 | 0.412 | −0.239 | 0.787 | 0.75 |
| 6 (05:00) | −0.238 | −0.676 | 0.067 | 0.743 | −0.171 | 0.839 | 0.79 |
| 7 (06:00) | −0.220 | −0.541 | 0.111 | 0.652 | −0.101 | 0.852 | 0.80 |
| 8 (07:00) | −0.107 | −0.594 | 0.223 | 0.817 | −0.003 | 0.887 | 0.90 |
| 9 (08:00) | −0.126 | −0.683 | 0.281 | 0.964 | 0.126 | 1.056 | 0.88 |
| 10 (09:00) | −0.092 | −0.677 | 0.283 | 0.960 | 0.308 | 1.406 | 0.91 |
| 11 (10:00) | −0.075 | −0.693 | 0.493 | 1.186 | 0.387 | 1.517 | 0.93 |
| 12 (11:00) | −0.022 | −0.565 | 0.647 | 1.213 | 0.494 | 1.577 | 0.98 |
| 13 (12:00) | 0.057 | −0.475 | 0.953 | 1.428 | 0.723 | 1.683 | 1.06 |
| 14 (13:00) | 0.166 | −0.300 | 1.152 | 1.452 | 0.934 | 1.834 | 1.18 |
| 15 (14:00) | 0.418 | −0.252 | 1.478 | 1.730 | 1.149 | 1.994 | 1.52 |
| 16 (15:00) | 0.502 | −0.082 | 1.958 | 2.040 | 1.356 | 2.111 | 1.65 |
| 17 (16:00) | 0.571 | 0.180 | 2.134 | 1.953 | 1.485 | 2.160 | 1.77 |
| 18 (17:00) | 0.668 | 0.234 | 2.162 | 1.929 | 1.604 | 2.173 | 1.95 |
| 19 (18:00) | 0.876 | 0.230 | 2.320 | 2.089 | 1.714 | 2.168 | 2.40 |
| 20 (19:00) | 0.864 | 0.246 | 2.410 | 2.165 | 1.743 | 2.170 | 2.37 |
| 21 (20:00) | 0.846 | 0.245 | 2.341 | 2.097 | 1.760 | 2.176 | 2.33 |
| 22 (21:00) | 0.832 | 0.201 | 2.293 | 2.092 | 1.721 | 2.158 | 2.30 |
| 23 (22:00) | 0.780 | 0.053 | 2.116 | 2.063 | 1.638 | 2.124 | 2.18 |
| 24 (23:00) | 0.712 | 0.108 | 1.945 | 1.838 | 1.511 | 2.111 | 2.04 |

Shape of the **pooled median** curve: dip to 0.73× hour 1 at h4 (03:00 UTC),
recovery through the morning, evening peak 2.40× at h19 (18:00 UTC),
gentle fall to 2.04× at h24. But the pooled median is a **mixture** — see §4.
The dispersion explodes with h: IQR 0.25 at h2 → ~2.1 at h19–24; the raw
cross-launch sd at h19–24 is ~2.1 log units. A single median curve with a
fixed spread cannot represent this: the spread is almost entirely the
level effect (§4), not hour noise.

Representative individual curves (ratio to hour 1):
- ELDEN RING (p1 875,155): 0.92, 0.80, 0.69, 0.66, 0.63, 0.61, 0.55, 0.53,
  0.53, 0.55, 0.57, 0.62, 0.69, 0.76, 0.83, 0.89, 0.91, **0.95**, 0.90, 0.90,
  0.86, 0.78, 0.72 — U-shaped, trough h9–10, peak h19, never above hour 1.
- Cyberpunk 2077 (p1 851,999): 1.26, 1.17, 1.00, 0.82, 0.71, 0.58, 0.51,
  0.45, 0.43, 0.44, 0.47, 0.57, 0.66, 0.76, 0.92, 0.96, 0.98, 0.94, 0.90,
  0.94, 0.87, 0.75, 0.55 — same U, deeper trough (0.43× at h10).
- Elden Ring Nightreign (p1 319,909): trough 0.48× at h9–11, peak 1.00× h19,
  0.82× at h24.
- Baldur's Gate 3 (p1 3,447): 0.76, 0.79, 0.59, 0.36, 0.25, 0.41, 0.60,
  0.94, 1.13, 1.29, 1.91, 10.80, 19.79, 39.71, 86.69, 121.56, 134.30,
  133.52, 131.83, 122.84, 103.33, 92.84, 78.09 — the evening explosion.
- Hollow Knight: Silksong (p1 164): rises to **2,120×** hour 1 at h16
  (r = 7.66), still 1,088× at h24. Kingdom Come: Deliverance II (p1 414):
  max r 7.01 at h21 (~1,100×).

## 4. THE level effect: r_h depends strongly on log(p1)

This is the dominant structure in the data. Per-hour OLS
r_h = a_h + b_h·ln(p1) (n = 148 each hour):

| h | a | b | resid SD | raw SD | R² | pred r at p1=25k | 100k | 500k | 1M |
|---|---|---|---|---|---|---|---|---|---|
| 2 | −0.308 | 0.022 | 0.295 | 0.299 | 0.03 | −0.089 | −0.059 | −0.024 | −0.009 |
| 3 | −0.253 | 0.002 | 0.715 | 0.715 | 0.00 | −0.228 | −0.224 | −0.220 | −0.218 |
| 4 | 0.153 | −0.040 | 0.755 | 0.760 | 0.01 | −0.251 | −0.306 | −0.370 | −0.398 |
| 6 | 0.277 | −0.043 | 0.834 | 0.839 | 0.01 | −0.156 | −0.215 | −0.284 | −0.314 |
| 8 | 1.807 | −0.173 | 0.804 | 0.887 | 0.18 | 0.059 | −0.180 | −0.457 | −0.577 |
| 10 | 5.257 | −0.472 | 0.962 | 1.406 | 0.53 | 0.479 | −0.175 | −0.935 | −1.262 |
| 12 | 6.261 | −0.550 | 1.031 | 1.577 | 0.57 | 0.692 | −0.070 | −0.955 | −1.336 |
| 14 | 8.219 | −0.695 | 1.044 | 1.834 | 0.68 | 1.185 | 0.222 | −0.896 | −1.377 |
| 16 | 10.319 | −0.855 | 1.006 | 2.111 | 0.77 | 1.665 | 0.480 | −0.895 | −1.488 |
| 18 | 11.176 | −0.913 | 0.892 | 2.173 | 0.83 | 1.933 | 0.668 | −0.801 | −1.433 |
| 20 | 11.558 | −0.936 | 0.759 | 2.170 | 0.88 | 2.081 | 0.783 | −0.723 | −1.372 |
| 22 | 11.493 | −0.932 | 0.751 | 2.158 | 0.88 | 2.058 | 0.766 | −0.733 | −1.379 |
| 24 | 11.002 | −0.905 | 0.770 | 2.111 | 0.87 | 1.838 | 0.583 | −0.873 | −1.500 |

- Correlation corr(log p1, r_h): ≈0 at h2–6, −0.28 at h7, −0.63 at h9,
  −0.73 at h10, −0.80 at h13, −0.88 at h16, **−0.93 to −0.94 at h19–24**.
  Pooled corr −0.644 (n = 3,404).
- Median r by p1 tertile (cutoffs 27,057 / 131,910): at h20, low tertile
  **+4.80** (×121), mid +0.64, high +0.01; at h12, low +1.36, mid −0.05,
  high −0.61; at h24, low +4.36, mid +0.47, high −0.08.
- Mechanism: hour 1 (00:00–01:00 UTC) is **before most unlocks** — only NZ
  (11:00Z prev day), EU (23:00Z) and UK (00:00Z) are live; US East unlocks
  05:00Z, US West 08:00Z. For a small launch, hour 1 is nearly empty and the
  day grows into the evening as the world unlocks and wakes up. For a huge
  launch, pre-release hype already fills hour 1 (NZ/EU/UK) near its peak,
  so the day is flat-to-U-shaped. Only 3 launches peak at hour 1–2
  (Cyberpunk 2077, Starfield, Borderlands 4; median p1 156,828 vs 53,526
  overall) — the big-launch signature.
- **Saturation warning**: the linear-in-log(p1) fit is pulled by the tiny
  launches (Silksong/BG3/KCD2 have r up to +7.6) and **over-predicts the
  decline for huge p1**. At p1 = 875k it predicts r_19 ≈ −1.26, but ELDEN
  RING's actual r_19 is −0.05 and Cyberpunk's −0.06; the hi-tertile median
  r_20 is +0.01 while OLS at 500k predicts −0.72. A global linear fit is
  badly biased at the top end. A local/kernel fit, or a fit on binned
  medians, or a saturating form, is needed — the relationship flattens
  above p1 ≈ 150k. This matters most for the final: GTA VI's hour-1 print
  will very likely be **above the comparables' observed range**
  (max 875,155), so whatever the model does at the top end, it must not
  extrapolate the steep linear slope without bound.
- After the level effect, residual SD is still 0.75–1.07 log units at
  late hours (mean 0.846 vs raw 1.546) — that is the spread the
  forecaster's quantiles must carry. At h3 the residual SD is 0.715 with
  R² = 0: hour 3 is noisy for everyone (r_3 range −1.71…+3.27).

## 5. Diurnal pattern

- Median curve (§3): trough h4 (03:00 UTC, 0.73×), peak h19 (18:00 UTC,
  2.40×). Individual launches: peak hour most often h21 (28/148), h19 (24),
  h20/h22 (20 each), h18 (16); trough hour most often h5 (28), h3/h4 (20
  each). Median peak hour 20 (19:00 UTC), median trough hour 5 (04:00 UTC).
- Pre-release diurnal (14 days before day_start, per-launch log viewers
  normalised by that launch's median): trough 08:00–09:00 UTC (−0.29),
  peak 20:00 UTC (+0.47), amplitude ≈ 0.76 log units — the ordinary Twitch
  day. The release-day evening peak (h19–21) sits on top of this diurnal
  peak, and the early-morning trough (h3–5) on top of the diurnal trough.
- The unlock schedule is visible in the raw pre-release history: in the
  24 h before day_start, viewership is near-zero for ~11 h then jumps at
  ~11:00–12:00 UTC the day before — the NZ midnight unlock. E.g. Wolverine
  (p00): hourly 5, 20, 25, 45, 80, 97, 74, 83, 70, 102, 153, **4,288**,
  14,020, 20,715, 29,903, …; ELDEN RING last-24h median 103,962 vs
  prior-24h median 1,529 (×68 jump, almost all of it the unlock).

## 6. GTA VI's own pre-release history (the GTA VI comparable)

Name: `Grand Theft Auto VI category before release (2026-08-27 extended-look
premiere onward)`. day_start 2026-08-27, platforms PS5 / Xbox Series X|S.
632 hourly points, 2026-08-27T17:00Z → 2026-11-17T02:00Z. It is **not a
launch** (no hour-1 print, no release-day curve) and must be excluded from
any r_h fit — it is the only comparable without a valid hour-1 print.

- First point 2026-08-27T17:00Z: 37,647 viewers; all-time peak
  **1,418,094 at 2026-08-27T19:00Z** (2,247 channels) — the premiere.
- First-week mean 16,764 → last-week mean 940 (ratio 0.056): hype decayed
  ~18× from the premiere week.
- Last-24h (to 2026-11-17T02:00Z) mean 1,623, median 1,553, max 5,785.
  Daily means: 11-10: 1,422 (with a one-hour spike to 24,131 at 20:00Z on
  32 channels — a single big stream/event), 11-11: 251, 11-12: 908,
  11-13: 641, 11-14: 673, 11-15: 943, 11-16: 1,639, 11-17: 1,789 (3 pts).
  Trend in the last week is **up** (673 → 943 → 1,639), channels growing
  steadily (8–40 on 11-10 → 60–70 on 11-12/13 → 80–116 on 11-14/15 →
  156 at 11-17T02:00Z).
- Implication: GTA VI's pre-release category level (~1.5k) is a different
  regime from the comparables' pre-release levels (their last-24h medians
  are gameplay/hype-driven and correlate 0.855 with log p1). Do **not** use
  pre-release-level similarity for the final — the target's pre-history
  sits far outside the comparables' range relative to its hour-1 print.
  The hour-1 print itself is the anchor; the pre-history is useful only
  as a sanity check, not as a similarity weight.

## 7. Channels vs viewers

- Hour 1: median viewers/channel 39.2 (p25 29.6, p75 53.9, range 11.7–
  322.5); corr(log viewers, log channels) = 0.946.
- Viewers/channel over the day (median): h1 39.2 → h4 29.9 → h6 **20.1**
  (many small channels join early, viewers spread thin) → h12 35.4 →
  h16 40.3 → h20 39.0 → h24 33.9.
- corr(log v, log c) falls through the day: 0.94–0.96 at h1–8, 0.86 at
  h14, 0.82 at h16, 0.66 at h20 — the evening is dominated by a few big
  streamers, so channels stop tracking viewers.
- Channels ratio ln(ch_h/ch_1), median: h2 −0.07, h4 −0.10, h6 +0.31,
  h8 +0.20, h12 0.00, h16 +0.74, h20 **+1.13** (×3.1 channels), h24 +0.96.
  IQR widens to ~2.2 by h16–24.
- **Channels add no signal beyond log(p1)**: pooled corr of OLS residuals
  (§4) with log(ch1) is −0.018; per-hour −0.06…+0.07. The target's hour-1
  channels are not a useful extra predictor of the curve shape.

## 8. Pre-release level / growth as predictors (weak)

- corr(log pre-24h-median, log p1) = 0.855 across comparables (n = 148);
  p1 / pre-24h-median ratio: median 2.02, p25 1.15, p75 8.42 (very wide).
- Practice targets' own p1 / pre-24h-median: 1.67 (Wolverine), 1.60 (RDR2),
  1.59 (GOW), 1.48 (Spider-Man 2) — strikingly consistent, but that is the
  targets' own history, not a comparable-based predictor.
- Growth into launch (log last-24h-median / prior-24h-median): median
  2.08 (×8), IQR 5.26 — dominated by the NZ unlock landing inside the
  last 24 h, i.e. mechanical, not a launch-quality signal. Its correlation
  with the OLS residuals is only +0.17…+0.24 per hour (h10–24); with
  log(p1) 0.363. Pre-24h-median correlates −0.08…−0.17 with residuals.
  Verdict: after log(p1), neither pre-level nor growth earns a place in
  the model; at most a small growth term could be tried in tuning, with
  the backtest as judge.

## 9. Baseline LOO numbers (house baseline, scored by analysis/backtest.mjs)

LOO set: 148 pseudo-cases (37 distinct launches × 4), 17,020 items
(3,404 hours × 5 quantiles). Scorer verified against the RULES worked
example (loss 0.112545, typical miss 19.52%, coverage 1) — see
`--self-test` (12/12 PASS).

| | mean loss | typical miss | 90% coverage | median launch loss |
|---|---|---|---|---|
| Baseline (LOO) | **0.9297** | 213.32% | 0.6240 | 0.3248 |

By p1 tertile (cutoffs 27,057 / 131,910): low (n=52) mean loss **2.087**,
median 2.177, miss 2,168%, coverage 0.283 — **78.9% of the total loss**;
mid (n=48) 0.344, miss 81.6%, coverage 0.786; high (n=48) 0.262, miss
51.6%, coverage 0.830. Worst launches: Silksong (p1 164) 3.941, miss
7,052%, coverage 0.17; Kingdom Come: Deliverance II (414) 3.464, coverage
0.00; Black Myth: Wukong (4,941) 3.434, coverage 0.00. Best: Diablo IV
(533,455) 0.125; CoD: Modern Warfare III (114,417) 0.152.
Note the LOO mean (0.930) is far above the baseline's **practice** loss
(~0.387 per RULES) because the practice targets are all big launches
(p1 23k–270k) while the LOO set includes the tiny launches whose evenings
explode ×100–×2000. The two numbers are not comparable; the LOO mean is
the tuning target, the practice 0.387 is the house's headline number.

## 10. Forecaster LOO numbers (Worker B's main.ts, as scored by this harness)

Scored 2026-11-17 ~16:25 WIB. main.ts sha256
`be4418ec0c9d5bb7778655a2ae32c8593966ea18d21e5af55decb5df0beb8862`
(242 lines; local-linear kernel fit, v2 — see its header). 0 failures
(invalid shape / throws). Runtime 0.9 s for 148 pseudo-cases (deterministic:
two runs give byte-identical summary JSON).

| | mean loss | typical miss | 90% coverage | median launch loss |
|---|---|---|---|---|
| Forecaster (LOO) | **0.4035** | 78.59% | 0.8837 | 0.2622 |
| Baseline (LOO) | 0.9297 | 213.32% | 0.6240 | 0.3248 |
| Improvement | −0.5261 (−56.6%) | | | |

By p1 tertile: low mean loss 0.653 (baseline 2.087), miss 201.7%,
coverage 0.747, 56.9% of forecaster loss; mid 0.292 (0.344), miss 60.5%,
coverage 0.920; high 0.244 (0.262), miss 43.8%, coverage **0.997**
(over-covered — spreads too wide for big launches). Loss distribution:
p10 0.185, median 0.262, p90 0.762. Worst launches: Black Myth: Wukong
(p1 4,941) 1.699, miss 743%, coverage 0.26; Marathon (1,393) 1.451, miss
556%, coverage 0.48. The remaining loss is concentrated in small
launches whose evenings explode far beyond what their neighbours predict.

Mean loss by hour (forecaster vs baseline) — the forecaster flattens the
baseline's evening blow-up; its own loss peaks mid-day, not in the
evening:

| h | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| forecaster | 0.155 | 0.346 | 0.361 | 0.386 | 0.423 | 0.415 | 0.412 | 0.440 | 0.509 | 0.540 | 0.531 |
| baseline | 0.159 | 0.367 | 0.400 | 0.394 | 0.427 | 0.421 | 0.434 | 0.553 | 0.727 | 0.776 | 0.816 |

| h | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| forecaster | 0.500 | 0.513 | 0.537 | 0.478 | 0.453 | 0.393 | 0.332 | 0.313 | 0.315 | 0.309 | 0.310 | 0.315 |
| baseline | 0.925 | 1.029 | 1.158 | 1.295 | 1.351 | 1.408 | 1.483 | 1.505 | 1.514 | 1.482 | 1.417 | 1.342 |

Spot check with `--launch silksong` (4 pseudo-cases, same launch × 4):
forecaster 0.4635, miss 106.8%, coverage 0.826 vs baseline 3.9411, miss
7,052%, coverage 0.174 — the level-aware model handles even the most
extreme launch; its worst hour is h15 (2.05), the hour Silksong's
explosion steepens fastest (ratio 0.84× → 2,024× between h6 and h15).
Caveat: an earlier harness run during Worker B's editing scored 0.4104 —
the file was mid-edit then; 0.4035 is the number for the sha above.
These numbers are for the LOO set; the final case is one big launch, so
the hi-tertile behaviour (loss 0.244, coverage 0.997) is the most
relevant slice for GTA VI, not the overall mean.

## 11. Backtest harness (analysis/backtest.mjs)

- `node analysis/backtest.mjs [--forecaster <path>] [--cases p00,p03]
  [--kit <dir>] [--launch <substring>] [--baseline-only] [--self-test]
  [--quiet]`.
  Default forecaster = repo `main.ts`; default kit = the kit's `input/`.
  `--launch` restricts the LOO set to launches whose name contains the
  substring (e.g. `--launch silksong` scores 4 pseudo-cases).
- LOO construction: for each comparable L with a valid hour-1 print,
  pseudo-case hour-1 = L's day_start point, pre-history = L's hourly
  points before day_start+1h, comparables = the other 37 launches
  (GTA VI included as a comparable — the forecaster must skip it, it has
  no hour-1), scored hours = hours 2–24 where L has an actual print
  (all 23 for the 148; missing points skipped, never interpolated).
- Scorer: pinball 2·max(τ·d, (τ−1)·d), d = ln(y) − ln(q), y clamped to ≥1,
  τ ∈ {0.05, 0.25, 0.5, 0.75, 0.95}; mean over all items; also typical
  miss % and 90% coverage. Verified by `--self-test` against the RULES
  worked example and baseline example rows (12/12 PASS).
- Forecaster interface: the harness dynamically imports the forecaster
  path (Node 24 strips erasable TS natively) and calls exported
  `forecastCase(caseObj)` → `{hours: [{hour, q: [q05,q25,q50,q75,q95]}]}`.
  If the module exports no `forecastCase`, the forecaster is scored as
  the baseline (so a run against the starter main.ts is a sanity check).
  Invalid shape / throw → scored as persistence (all quantiles = p1),
  counted as a failure, and reported.
- Before importing, the harness points MAKEFUN_INPUT_DIR/OUTPUT_DIR at
  empty temp dirs, so any top-level code the module runs on import is
  contained (Worker B's main.ts guards its CLI with
  `import.meta.url === pathToFileURL(process.argv[1]).href`; note that
  guard throws under `node -e` because `process.argv[1]` is undefined —
  harmless for the harness and the grader, but don't import main.ts from
  a `-e` snippet).
- Deterministic, no network, no randomness; whole run ~0.9–1.3 s
  (limit ~60 s). Prints a per-launch table + summary + mean loss by hour
  + mean launch loss by p1 tertile + a JSON summary line for machine use
  (keys: forecaster/baseline meanLoss, typicalMissPct, coverage90,
  medianLaunchLoss, failures; worstForecaster; tertiles; meanLossByHour;
  runtimeSecs).

## 12. What I could NOT verify

- The practice cases' own answers (hours 2–24 of p00–p03) are not in the
  kit (server-side), so the baseline's practice loss ~0.387 and any
  forecaster's practice loss cannot be reproduced locally — LOO on
  comparables is the only local validation.
- Whether the final's hour-1 print will land inside the comparables'
  p1 range (max 875,155): GTA VI is plausibly bigger; the top-end
  extrapolation behaviour (§4) is untestable on the practice data.
- The final case's `streams` / `categories_hourly` fields (null in
  practice) — the forecaster must handle them present or absent; the
  harness's pseudo-cases set them null, as in practice.
- The house model forecast (superbot one-shot) — no local visibility.

## Tuning log

(For Worker B: variant, backtest mean loss, typical miss, 90% coverage,
median launch loss, worst launch. Add rows as tuning proceeds.)

| variant | mean loss | typical miss % | coverage | median launch loss | worst launch | notes |
|---|---|---|---|---|---|---|
| baseline (house) | 0.9297 | 213.32 | 0.6240 | 0.3248 | Silksong 3.941 | LOO, 148 pseudo-cases |
| main.ts v2 local-linear (sha be4418ec) | 0.4035 | 78.59 | 0.8837 | 0.2622 | Black Myth: Wukong 1.699 | scored 2026-11-17 ~16:25 WIB; per-hour loss peaks h11–15 (0.51–0.54), evening h19–24 down to 0.31 |
| main.ts v3 local-linear + LOCAL spread (coordinator) | 0.3823 | 78.59 | 0.8884 | 0.2536 | Black Myth: Wukong 1.625 | scored 2026-11-17 ~16:30 WIB; every tertile and every hour better than v2; hi-tertile 0.212 (was 0.244); mult 0.9 → 0.3835, 1.1 → 0.3831, 1.0 kept |
| | | | | | | |
