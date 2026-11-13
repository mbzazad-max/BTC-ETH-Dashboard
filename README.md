# BTC & ETH dashboard

The BTC & ETH dashboard (originally the Claude artifact "Bitcoin Dashboard"), rebuilt on GitHub and shown on Cloudflare.
Claude only loads data; it does not run the dashboard's logic. Spot only: there are no futures plans.

- **Data**: read from the shared repo `mbzazad-max/market-data`, closed candles only.
  - BTC: the stored Coinbase BTCUSD history (TradingView, loaded once on 13 Nov 2026: 1D from Dec 2014, 4H from Aug 2024), then every newer candle from Binance BTCUSDT (laptop upload). No TradingView calls for BTC after the first load.
  - ETH: Binance ETHUSDT 1D and 4H, from your laptop upload.
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
  Below it, a mirror **spot sell / trim checklist** (take some profit, never short):
  1. Squeeze over: short liquidations of at least $50M in 24h that have faded below $20M in 4h and $5M in 1h.
  2. Leverage piling in: open interest up 2% or more in 4h.
  3. Funding hot: funding at or above 0.03%.
  4. Price stalls: a 4H close at or above the floor of the page's 1D sell zone, with 4H RSI at or above 70.
  Thresholds 1–3 of both lists are rules of thumb, not backtested: free open-interest and funding history isn't available, and the daily CoinGlass readings kept in market-data build that history. Spot only, not financial advice.
- **Closed candles only**: prices are the last closed 4H and daily candles. This week, month and year run to the last closed day.

Tests (need `npm i jsdom@24 d3@7.9.0` in some folder):
- Parity, the original page's own Refresh vs build.js on identical data: `node tests/parity.js <market-data dir> <node_modules dir>`. 13 Nov 2026: all 20 saved documents identical.
- Render, the Cloudflare page for BTC and ETH: `node tests/render.js <node_modules dir>`.
