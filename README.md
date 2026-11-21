# BTC & ETH dashboard

The BTC & ETH dashboard (originally the Claude artifact "Bitcoin Dashboard"), rebuilt on GitHub and shown on Cloudflare.
Claude only loads data; it does not run the dashboard's logic. Spot only: there are no futures plans.

- **Data**: read from the shared repo `mbzazad-max/market-data`, closed candles only.
  - BTC: the stored Coinbase BTCUSD history (TradingView, loaded once on 13 Nov 2026: 1D from Dec 2014, 4H from Aug 2024), then every newer candle from Binance BTCUSDT (laptop upload). No TradingView calls for BTC after the first load.
  - ETH: Binance ETHUSDT 1D and 4H, from your laptop upload.
  - SOL and BNB (added 14 Nov 2026): Binance SOLUSDT and BNBUSDT 1D and 4H, from your laptop upload. The coin switch and these coins come from the fixed edits in tools/page.js; the original page file is unchanged.
  - Gauges: CRYPTOCAP USDT.D, USDC.D and TOTAL2ES (4H, made into daily), the same files the daily 11:30 TradingView task already loads for other dashboards. The page's "Alt market cap (TOTAL2)" gauge shows TOTAL2ES (alts without stablecoins); BTC dominance is left out (context only on the page).
  - Readings: US macro calendar and CoinMarketCap (daily 11:30 Claude task), and CoinGlass BTC and ETH (daily CoinGlass Claude task).
  - Nothing is fetched twice: series used by other dashboards are shared.
- **Logic**: all of it stays in the original page, which runs unchanged in the browser. `public/index.html` is the artifact page plus two script tags: `shim.js` (the saved snapshot, read-only, in place of the claude.ai database) and `cloud.js` (Refresh button and freshness strip). The original is `reference/index.original.html`, and every run checks it against `reference/PAGE_SHA256SUMS` (`node tools/check_page.js`).
- **Build**: `build/build.js` turns the shared candles and readings into the documents the page's own Refresh saves (`public/snapshot.json`), using the page's own rules. Weekly and monthly bars are made from closed days, and gauge days from closed 4H candles.
- **Address**: none of its own. It opens at `/btc-eth/` on the home site (repo `dashboards`), which holds the one login lock.
- **Runs**: when market-data gets new candles or readings, once a day as a safety net (01:15 UTC), or when Refresh is pressed. If nothing new arrived, nothing is rebuilt.
- **Safety**: a source that cannot be built keeps its last good version. It is listed in `public/freshness.json` and the page shows "kept from an older refresh". If validation fails, nothing is written.
- **Spot buy checklist** (`build/checklist.js`, after the build): four checks per coin added at the end of the CoinGlass table on the Trade plan tab:
  1. Flush over: long liquidations under $20M in 4h and $5M in 1h.
  2. Leverage steady: open interest 4h change within ±1%.
  3. Funding reset: OI-weighted funding at or below 0%.
  4. Price confirms: the last closed 4H close at or above the floor of the page's own 1D buy zone, with the page's 4H RSI above 30.
  5. Structure shift (added 15 Nov 2026, **required**): a bullish 4H market structure shift (`build/structure.js`): price swept a swing low inside the 1D buy zone, then a 4H candle closed above the last lower high, with displacement (a fair value gap, or a candle body of 1.2× ATR). It shows the entry (middle of the FVG, or a retest of the broken level) and the stop (below the sweep low), and stays valid 5 days unless a 4H close goes below the sweep low.
  Verdict: no structure shift = **Wait** (a tiny starter only when 3+ other checks are green and the weekly trend is up). With it: 3–4 green = starter buy at the MSS entry, 5/5 = main buy; half size when the 1D trend is down.
  When the page finds no support zone below price ("No qualified support", e.g. SOL at new lows), there is no 1D plan: checks 4 and 5 turn red with that reason and the verdict is **Wait: no support zone below price**; the sell list then uses the nearest resistance zone from Key levels.
  Below it, a mirror **spot sell / trim checklist** (take some profit, never short):
  1. Squeeze over: short liquidations of at least $50M in 24h that have faded below $20M in 4h and $5M in 1h.
  2. Leverage piling in: open interest up 2% or more in 4h.
  3. Funding hot: funding at or above 0.03%.
  4. Price stalls: a 4H close at or above the floor of the page's 1D sell zone, with 4H RSI at or above 70.
  5. Structure breaks: a bearish 4H MSS from the sell zone; a bigger profit needs it (5/5).
  Thresholds 1–3 of both lists are rules of thumb, not backtested: free open-interest and funding history isn't available, and the daily CoinGlass readings kept in market-data build that history. Spot only, not financial advice.
- **Structure test** (`build/structure_test.js`, before the checklist): replays two ways of buying the page's own 1D buy zone on closed 4H candles since 1 Jan 2025: *zone only* (limit buy at the middle of the zone, the page's stop) and *zone + MSS* (buy only after a 4H structure shift whose sweep reached the zone, at its FVG entry, stop below the sweep low), both to the page's Target 1. Each day's zone, stop and target are what the original page's engine showed that day (run in jsdom on that day's closed candles; checked identical to the build's own documents). Day plans are kept in `history/plans.json`, so a build only works out new days. Results (win rate to Target 1, average R, and the average without the single best trade) are shown as "Structure test" rows under the checklists. First run, 15 Nov 2026, all 4 coins: zone + MSS 25% to T1, avg +0.91R (24 trades; +0.18R without its best trade) vs zone only 7%, −0.06R (180 trades). The MSS sample is small: a lean, not proof.
- **Closed candles only**: prices are the last closed 4H and daily candles. This week, month and year run to the last closed day.

Tests (need `npm i jsdom@24 d3@7.9.0` in some folder):
- Parity, the original page's own Refresh vs build.js on identical data: `node tests/parity.js <market-data dir> <node_modules dir>`. 13 Nov 2026: all 20 saved documents identical.
- Render, the Cloudflare page for BTC and ETH: `node tests/render.js <node_modules dir>`.

## Bull case / Bear case email alerts (18 Nov 2026)

**Minor levels in the Bull / Bear case (20 Nov 2026, tools/page.js edit 6).** Where there is no qualified zone (3+ methods) on a side, or price or the next qualified zone is more than 1.5 daily ATR away, the Trade plan's Bull / Bear lines list the nearest minor levels (1–2 methods, within 35%, up to 4) with what each is and its timeframes, e.g. "No qualified support (3+ methods) below. Nearest minor levels (1–2 methods): price gap 1,646–1,695 (1D); swing low 1,506 (1D+1W+1M, 1-year low)". The Forecast's breakdown/breakout targets use them when no qualified zone lies beyond the trigger. Buy zones, Key levels, the checklists and the Bull / Bear alert levels still use 3+ method zones only.

`build/levels.js` runs on every build after `signals.js`. For BTC, ETH, SOL and BNB it runs the original page's engine (in jsdom, like `structure_test.js`) on the candles closed by the end of each UTC day and stores the Trade plan's two lines with their exact levels in `history/levels.json`. When a new daily candle closes **above the Bull case level** or **below the Bear case level** that the page showed the day before, the case is logged as active. Only on such a day (owner's choice) the workflow opens ONE GitHub issue that mentions the owner, so GitHub emails it (same as the checklist alerts): the active cases in the title, and for each such coin the close, the line it broke and the new lines. Quiet days send nothing; never twice for the same close; the first run only sets the starting point. Test: `node tests/levels.js <node_modules> <market-data>`.

## USDT.D row (20 Nov 2026)

Owner's request: USDT.D on its own in the Market sentiment card, right under Stablecoin dominance (USDT + USDC), same columns (now, 1D/7D/30D change, trend, 90-day range read). Context only (tilt 0), so the overall tilt and the Forecast are unchanged and stablecoin dominance is not counted twice. One edit in tools/page.js; data is the gauge_usdtd series the page already loads.

## USDT.D tab (21 Nov 2026)

Owner's request: a tab after Forecast that shows how USDT.D behaves around its 20/50/100/200 SMAs on the daily and weekly charts in BTC bull and bear markets (2020–21 bull, 2022 bear, 2023–25 bull, the bear since Oct 2025), and 2022 vs now.

- `build/usdtd.js` (every build, after levels.js) writes `public/usdtd.json` from market-data only: USDT.D daily = the stored `tv/CRYPTOCAP_USDT.D/1D` history, then days made from closed `tv/CRYPTOCAP_USDT.D/4H` candles (same rule as build.js); weekly = Monday weeks of those days (the current week shown as forming); BTC closes (Coinbase BTCUSD, then Binance BTCUSDT) for context. It writes nothing when the result is unchanged, and keeps the last good file on any failure.
- Regimes are fixed BTC cycle dates (closes): top 8 Nov 2021, bottom 21 Nov 2022, top 6 Oct 2025; the last one runs to today until a new date is added to `REGIMES`.
- Measures: share of closes above each SMA; "support held" / "resistance held" (a bar that came from one side and reached the SMA, low/high within 1%, then closed back on its side); weekly 50W/100W/200W closes and SMA crosses since 2020; swing lows (bears) and highs (bulls) with the nearest SMA; stretch over the SMAs at the 2022 peak and today; how the 2022 peak unwound.
- `public/usdtd.js` draws it (d3 chart with Daily/Weekly and 1Y/3Y/since-2020). `tools/page.js` edits: the tab button, the page section, draw() hands the tab to `window.__usdtd`, `#usdtd` opens it. The original page is unchanged.
- **This week's read** (box at the top of the tab): a rule-based verdict for crypto from USDT.D: Bull (weekly close below the 100W), Turning bull (below the 50W, above the 100W), Bear, possibly ending (above the 50W, turned back near the prior peaks and a daily close below the 20D or 50D), Bear (above the 50W and 100W, 50W over 100W), Turning bear (above the 100W, 50W still under it). Uses the last closed week and the last closed day; shows the checks, what changed since last week, the last 8 weeks and every change since Jun 2021.
- **Top watch / Bottom watch** (owner, 21 Nov 2026): after the latest USDT.D 90-day closing high (top watch; USDT.D top = crypto bottom or relief rally) or low (bottom watch; USDT.D bottom = crypto top or pullback), six signs in the order they usually fire: daily close beyond the 20D, the 50D, 20D crossing the 50D, weekly close beyond the 20W, daily close beyond the 200D, weekly close beyond the 50W. Each shows when it fired and its past record since Apr 2019 (counted once per 90-day extreme, within 120 days): USDT.D then moved 20%+ the other way within 180 days, and the extreme stayed the top/bottom for 4 months. Plus a weekly RSI(14) divergence check against the strongest (weakest) week 8-52 weeks earlier, the clue that marked the Nov 2022 final top.
- **2018 bear and the launch years** (owner, 21 Nov 2026): regimes now start with Bull 2017, Bear 2018 and Rally 2019 (flagged "launch years": USDT supply grew many times over, so USDT.D rose whatever crypto did and never closed a week below its 100W from 2017 to Dec 2020). "Past bears vs now" compares 2018, 2022 and now (USDT.D peaked in week 52 after the BTC top both times, within 0-2 weeks of the BTC bottom). Crosses, the read's record and the watch records start in 2017 (the 100W exists from Feb 2017); the chart has a "Since 2017 (log)" view.
- `tests/render.js` now also opens the USDT.D tab for every coin.
