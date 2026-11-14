/* The served page = the original artifact page (reference/index.original.html, byte-identical, checked by its
   SHA-256) with a small fixed list of edits that add SOL and BNB to the coin switch (added 14 Nov 2026 at the owner's
   request). The design is unchanged: SOL and BNB use exactly the same tabs, cards and engine as ETH.
     1. coin switch: SOL and BNB buttons after ETH; the runtime maps btc_* / derivs to sol_* / derivs_sol and bnb_* / derivs_bnb
        the same way it already does for ETH; the coin's name, pair, listing date and typical daily move
     2. CoinGlass pill and documents per coin (snap/derivs_sol, snap/derivs_bnb); SOL and BNB in the page's source list
     3. wording that listed "BTC and ETH" now lists all four coins
     3b. Market sentiment card: SOL and BNB show their own CoinMarketCap row where BTC and ETH show ETF assets
     4. the Forecast runs without a CoinGlass reading (its derivatives signal then scores 0)
     5. for SOL and BNB, dollar amounts under $100 show two decimals instead of a whole dollar; $100 and above, and
        everything for BTC and ETH, are formatted exactly as before
   Every edit must match the original text exactly the stated number of times, or the build stops.
   usage: require('./page.js').edit(originalText) -> served page body */
'use strict';
const ONE = 1;
const EDITS = [
  ['<button type="button" data-asset="ETH" aria-pressed="false">ETH</button></div>',
   '<button type="button" data-asset="ETH" aria-pressed="false">ETH</button><button type="button" data-asset="SOL" aria-pressed="false">SOL</button><button type="button" data-asset="BNB" aria-pressed="false">BNB</button></div>', ONE],
  ['<p class="rf-note">BTC (Coinbase BTCUSD) and ETH (Binance ETHUSDT): 4H,',
   '<p class="rf-note">BTC (Coinbase BTCUSD), ETH (Binance ETHUSDT), SOL (Binance SOLUSDT) and BNB (Binance BNBUSDT): 4H,', ONE],
  ['<li><b>BTC / ETH switch.</b>', '<li><b>BTC / ETH / SOL / BNB switch.</b>', ONE],
  ["'eth_4h', 'eth_daily', 'eth_weekly', 'eth_monthly', 'econ_cal', 'derivs', 'derivs_eth',",
   "'eth_4h', 'eth_daily', 'eth_weekly', 'eth_monthly', 'sol_4h', 'sol_daily', 'sol_weekly', 'sol_monthly', 'bnb_4h', 'bnb_daily', 'bnb_weekly', 'bnb_monthly', 'econ_cal', 'derivs', 'derivs_eth', 'derivs_sol', 'derivs_bnb',", ONE],
  ["const rawId = (id) => (ASSET === 'ETH' ? (/^btc_(4h|daily|weekly|monthly)$/.test(id) ? 'eth_' + id.slice(4) : id === 'derivs' ? 'derivs_eth' : id) : id);",
   "const rawId = (id) => { const p = ASSET.toLowerCase(); return ASSET !== 'BTC' ? (/^btc_(4h|daily|weekly|monthly)$/.test(id) ? p + '_' + id.slice(4) : id === 'derivs' ? 'derivs_' + p : id) : id; };", ONE],
  ["setAsset(a) { ASSET = a === 'ETH' ? 'ETH' : 'BTC'; VER++; emit(); },",
   "setAsset(a) { ASSET = ['ETH', 'SOL', 'BNB'].includes(a) ? a : 'BTC'; VER++; emit(); },", ONE],
  ['const LOADERS = {}, CALCS = {}, CBS = [], RAW = {}, CACHE = {};',
   "const LOADERS = {}, CALCS = {}, CBS = [], RAW = {}, CACHE = {};\n  const small = (x) => typeof x === 'number' && isFinite(x) && Math.abs(x) < 100 && ASSET !== 'BTC' && ASSET !== 'ETH';\n  window.__px0 = (x) => (small(x) ? x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(x).toLocaleString(\"en-US\"));\n  window.__pxd = (v) => (small(v) ? d3.format(',.2f')(v) : d3.format(\",.0f\")(v));", ONE],
  ['CG = null, CR = null, CG_ETH = null;', 'CG = null, CR = null, CG_ETH = null, CG_SOL = null, CG_BNB = null;', ONE],
  ["cgv = S.asset() === 'ETH' ? CG_ETH : CG;", "cgv = { ETH: CG_ETH, SOL: CG_SOL, BNB: CG_BNB }[S.asset()] || (S.asset() === 'BTC' ? CG : null);", ONE],
  ["    DB.doc('snap/sentiment').onSnapshot(",
   "    [['derivs_sol', (v) => { CG_SOL = v; }], ['derivs_bnb', (v) => { CG_BNB = v; }]].forEach(([doc, put]) => DB.doc('snap/' + doc).onSnapshot((snap) => {\n      const d = snap.exists ? snap.data() : null;\n      if (d && Array.isArray(d.rows)) { S.setRaw(doc, d.rows, Object.keys(d.rows[0] || {})); const r = d.rows.find((x) => x.id === 'as_of'); put(r ? r.value : null); }\n      else { S.setMissing(doc); put(null); }\n      if (META) S.commit();\n      renderStatus();\n    }, () => {}));\n    DB.doc('snap/sentiment').onSnapshot(", ONE],
  ["    ETH: { name: 'Ethereum', sym: 'ETH', pair: 'Binance ETHUSDT', exch: 'Binance', list: 'Aug 2017', move: '4%' },\n",
   "    ETH: { name: 'Ethereum', sym: 'ETH', pair: 'Binance ETHUSDT', exch: 'Binance', list: 'Aug 2017', move: '4%' },\n    SOL: { name: 'Solana', sym: 'SOL', pair: 'Binance SOLUSDT', exch: 'Binance', list: 'Aug 2020', move: '5%' },\n    BNB: { name: 'BNB', sym: 'BNB', pair: 'Binance BNBUSDT', exch: 'Binance', list: 'Nov 2017', move: '4%' },\n", ONE],
  ["if (v === 'ETH' || v === 'BTC') startAsset = v;", "if (['BTC', 'ETH', 'SOL', 'BNB'].includes(v)) startAsset = v;", ONE],
  // the page loads exactly the sources in its SOURCES list from the snapshot (and its own Refresh pulls the same list)
  ["    ['econ_cal', 'US macro calendar', 'mcp-tv-get-economic-calendar',",
   "    ['sol_4h', 'SOL 4H bars', 'mcp-tv-get-ohlcv', () => ({ symbol: 'BINANCE:SOLUSDT', interval: '4h', count: 1000, format: 'columns' })],\n" +
   "    ['sol_daily', 'SOL daily bars', 'mcp-tv-get-ohlcv', () => ({ symbol: 'BINANCE:SOLUSDT', interval: '1D', count: 8000, format: 'columns' })],\n" +
   "    ['sol_weekly', 'SOL weekly bars', 'mcp-tv-get-ohlcv', () => ({ symbol: 'BINANCE:SOLUSDT', interval: '1W', count: 2000, format: 'columns' })],\n" +
   "    ['sol_monthly', 'SOL monthly bars', 'mcp-tv-get-ohlcv', () => ({ symbol: 'BINANCE:SOLUSDT', interval: 'M', count: 500, format: 'columns' })],\n" +
   "    ['bnb_4h', 'BNB 4H bars', 'mcp-tv-get-ohlcv', () => ({ symbol: 'BINANCE:BNBUSDT', interval: '4h', count: 1000, format: 'columns' })],\n" +
   "    ['bnb_daily', 'BNB daily bars', 'mcp-tv-get-ohlcv', () => ({ symbol: 'BINANCE:BNBUSDT', interval: '1D', count: 8000, format: 'columns' })],\n" +
   "    ['bnb_weekly', 'BNB weekly bars', 'mcp-tv-get-ohlcv', () => ({ symbol: 'BINANCE:BNBUSDT', interval: '1W', count: 2000, format: 'columns' })],\n" +
   "    ['bnb_monthly', 'BNB monthly bars', 'mcp-tv-get-ohlcv', () => ({ symbol: 'BINANCE:BNBUSDT', interval: 'M', count: 500, format: 'columns' })],\n" +
   "    ['econ_cal', 'US macro calendar', 'mcp-tv-get-economic-calendar',", ONE],
  ["const lid = id.replace(/^eth_/, 'btc_');", "const lid = id.replace(/^(eth|sol|bnb)_/, 'btc_');", ONE],
  // the Forecast still works for a coin with no CoinGlass reading yet (SOL, BNB): its derivatives signal scores 0, as the model already does for an empty reading
  ["  inputs: ['btc_daily', 'tp_engine', 'derivs', 'econ_cal', 'mkt_sentiment'],\n  optional: ['mkt_sentiment'],",
   "  inputs: ['btc_daily', 'tp_engine', 'derivs', 'econ_cal', 'mkt_sentiment'],\n  optional: ['mkt_sentiment', 'derivs'],", ONE],
  // Market sentiment card: SOL and BNB show their own CoinMarketCap row (price, rank, % changes) in the place where BTC and ETH show ETF assets
  ["const isEth = window.__snap && window.__snap.asset() === 'ETH', etf = isEth ? cr.etf_eth : cr.etf;\n    if (etf) out.push({ id: 'etf', gauge: isEth ? 'US spot ETH ETF assets' : 'US spot BTC ETF assets',",
   "const coinA = window.__snap ? window.__snap.asset() : 'BTC', isEth = coinA === 'ETH', isAlt = coinA === 'SOL' || coinA === 'BNB', etf = isAlt ? cr['coin_' + coinA.toLowerCase()] : isEth ? cr.etf_eth : cr.etf;\n    if (etf) out.push({ id: 'etf', gauge: isAlt ? etf.metric : isEth ? 'US spot ETH ETF assets' : 'US spot BTC ETF assets',", ONE],
  // prices: whole dollars from $100 up (unchanged), two decimals below $100
  [/Math\.round\((\w+)\)\.toLocaleString\('en-US'\)/g, '__px0($1)', 8],
  [/d3\.format\(',\.0f'\)\((\w+)\)/g, '__pxd($1)', 4],
];
function edit(src) {
  let out = src;
  for (const [find, repl, n] of EDITS) {
    const count = typeof find === 'string' ? out.split(find).length - 1 : (out.match(find) || []).length;
    if (count !== n) throw new Error(`page edit expected ${n} match(es), found ${count}: ${String(find).slice(0, 80)}`);
    out = typeof find === 'string' ? out.replace(find, () => repl) : out.replace(find, repl);
  }
  return out;
}
module.exports = { edit, EDITS };
