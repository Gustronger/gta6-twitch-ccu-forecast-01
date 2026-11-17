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
launch-day shapes of past big game launches:

- Every comparable launch in the case contributes its log-ratio curve
  `ln(viewers_h / viewers_hour1)` for hours 2–24, i.e. how a release day grows and
  decays relative to its first hour.
- The median forecast for each hour is hour 1's print times the (similarity-weighted)
  median ratio across comparables, with a diurnal correction for the rolling midnight
  unlocks (New Zealand first, then Europe, the UK, then the US coasts).
- The quantile spread for each hour comes from the cross-comparable dispersion of the
  ratios, calibrated so the 5%–95% band covers about 90% of past launch days.
- Everything is computed from the case file at run time; the only fitted constants are
  the spread calibration and the similarity weights, tuned on a leave-one-out backtest
  over the comparables (see `analysis/`).

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
