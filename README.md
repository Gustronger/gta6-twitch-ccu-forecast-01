# gta6-twitch-ccu-forecast-01

[![make.fun · gta6-twitch-ccu-forecast-01](https://make.fun/badge/gta6-twitch-ccu-forecast-01.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![rank](https://make.fun/badge/gta6-twitch-ccu-forecast-01/Gustronger/gta6-twitch-ccu-forecast-01/rank.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![reward](https://make.fun/badge/gta6-twitch-ccu-forecast-01/Gustronger/gta6-twitch-ccu-forecast-01/reward.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)

Forecast how many people watch Grand Theft Auto VI live on Twitch in each hour of its
release day (2026-11-19 UTC), given only the first hour's viewer count: for hours 2–24,
five quantiles (5%, 25%, 50%, 75%, 95%) each. Scored by mean pinball loss on the log
scale; the lowest loss wins.

## How it works

`main.ts` (Node 22, standard library only) reads the case file and forecasts from the
launch-day shapes of past big game launches. The key structure in the data is the
**level effect**: how a release day grows relative to hour 1 depends strongly on
hour 1's size — small hour-1 launches (rolling midnight unlocks, where hour 1 is
only New Zealand) grow several-fold into the evening peak, while huge hour-1
launches are flat-to-U-shaped and never exceed hour 1. A plain median of the
comparables' ratio curves scores only 0.80 on the leave-one-out backtest; the
level-aware model scores 0.38.

- Every comparable launch in the case contributes its log-ratio curve
  `ln(viewers_h / viewers_hour1)` for hours 2–24. Missing points are skipped,
  never interpolated; the Grand Theft Auto VI comparable ("Not a launch") is
  excluded from the fits.
- The median forecast for each hour is a **per-hour local-linear fit**: a
  Gaussian-kernel weighted least squares of the log ratio on log(hour-1 viewers),
  bandwidth 1.5 in log viewers, evaluated at the target's log hour-1 print,
  clamped to the comparables' range widened by 0.5 (so an hour-1 print above
  the historical range cannot extrapolate the steep slope without bound).
- The quantile spread for each hour is the **local residual sigma** of that fit:
  the kernel-weighted residual SD at the target's own log hour-1 print, same
  bandwidth — big launches have tighter curves than small ones, so a pooled
  spread over-covers them. Spreads are floored at 0.05 and fall back to the
  pooled residual SD when the local weights degenerate.
- Everything is computed from the case file at run time; the fitted constants
  (bandwidth 1.5, clamp pad 0.5, spread multiplier 1.0) were tuned on the
  leave-one-out backtest over the comparables (see `analysis/`). With fewer
  than 8 usable comparables the model falls back to persistence with the
  house baseline's spread.

Leave-one-out backtest over the comparables (148 pseudo-cases, 17,020 items):
mean pinball loss **0.382** (house baseline **0.930** on the same launches),
typical miss 78.6% (baseline 213%), 90% coverage 0.888. By hour-1 size:
small launches 0.635, mid 0.279, big 0.212 — the big-launch slice is the one
most relevant to GTA VI.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Reads every `*.in` case in the input directory and writes `<id>.out` per case:
`{"hours":[{"hour":2,"q":[q05,q25,q50,q75,q95]}, …]}`.

## Layout

- `main.ts` — the forecaster (entrypoint).
- `analysis/` — backtest harness and notes (not part of the entry program).
- `LICENSE` — MIT.
