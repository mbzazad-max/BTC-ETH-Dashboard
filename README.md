# BTC & ETH dashboard

The BTC & ETH dashboard (originally the Claude artifact "Bitcoin Dashboard"), rebuilt on GitHub and shown on Cloudflare.
Claude only loads data; it does not run the dashboard's logic. Spot only: there are no futures plans.

- **Data**: read from the shared repo `mbzazad-max/market-data`, closed candles only.
  - BTC: TradingView COINBASE:BTCUSD 1D (from Dec 2014) and 4H.
  - ETH: Binance ETHUSDT 1D and 4H, from your laptop upload.
  - Gauges: TradingView CRYPTOCAP USDT.D, USDC.D, BTC.D and TOTAL2 (4H, made into daily).
  - Readings: US macro calendar and CoinMarketCap (daily 11:30 Claude task), and CoinGlass BTC and ETH (daily CoinGlass Claude task).
  - Nothing is fetched twice: series used by other dashboards are shared.
- **Logic**: all of it stays in the original page, which runs unchanged in the browser. `public/index.html` is the artifact page plus two script tags: `shim.js` (the saved snapshot, read-only, in place of the claude.ai database) and `cloud.js` (Refresh button and freshness strip). The original is `reference/index.original.html`, and every run checks it against `reference/PAGE_SHA256SUMS` (`node tools/check_page.js`).
- **Build**: `build/build.js` turns the shared candles and readings into the documents the page's own Refresh saves (`public/snapshot.json`), using the page's own rules. Weekly and monthly bars are made from closed days, and gauge days from closed 4H candles.
- **Address**: none of its own. It opens at `/btc-eth/` on the home site (repo `dashboards`), which holds the one login lock.
- **Runs**: when market-data gets new candles or readings, once a day as a safety net (01:15 UTC), or when Refresh is pressed. If nothing new arrived, nothing is rebuilt.
- **Safety**: a source that cannot be built keeps its last good version. It is listed in `public/freshness.json` and the page shows "kept from an older refresh". If validation fails, nothing is written.
- **Closed candles only**: prices are the last closed 4H and daily candles. This week, month and year run to the last closed day.

Tests (need `npm i jsdom@24 d3@7.9.0` in some folder):
- Parity, the original page's own Refresh vs build.js on identical data: `node tests/parity.js <market-data dir> <node_modules dir>`. 13 Nov 2026: all 20 saved documents identical.
- Render, the Cloudflare page for BTC and ETH: `node tests/render.js <node_modules dir>`.
