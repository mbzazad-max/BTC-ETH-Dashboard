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

`build/levels.js` runs on every build after `signals.js`. For BTC, ETH, SOL and BNB it runs the original page's engine (in jsdom, like `structure_test.js`) on the candles closed by the end of each UTC day and stores the Trade plan's two lines with their exact levels in `history/levels.json`. When a new daily candle closes **above the Bull case level** or **below the Bear case level** that the page showed the day before, the case is logged as active. Only on such a day (owner's choice) the workflow opens ONE GitHub issue that mentions the owner, so GitHub emails it (same as the checklist alerts): the active cases in the title, and for each such coin the close, the line it broke and the new lines. Quiet days send nothing; never twice for the same close; the first run only sets the starting point. Test: `node tests/levels.js <node_modules> <market-data>`.
