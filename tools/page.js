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
     6. Bull / Bear case (and the Forecast targets): where no qualified zone (3+ methods) is beyond the nearest one, or the
        next one is more than 1.5 daily ATR away, the nearest minor levels (1-2 methods, within 35%, up to 4) are listed with
        what they are and their timeframes; also those between price and a qualified zone more than 1.5 ATR away (20 Nov 2026). Buy zones, Key levels and the checklists still use 3+ method zones only.
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
  // Bull / Bear case: nearest minor levels (1-2 methods) where no qualified zone is close (owner, 20 Nov 2026); buy zones and checklist check 4 still use 3+ method zones only
  ["    let bull, bear;\n    if (nR) { const n2 = P3.filter((z) => z.role === 'R' && z.lo > nR.hi).sort((a, b) => a.lo - b.lo); bull = `A daily close above ${fmt(nR.hi)} (top of the ${zt(nR)} resistance, ${nR.count} methods) hands control to buyers` + (n2.length ? `; next stop ${zt(n2[0])}.` : '; no qualified resistance above, so price would be in open air up to the next weekly level.'); }\n    else bull = 'No qualified resistance overhead: holding the current range is the bull case.';\n    if (nS) { const n2 = P3.filter((z) => z.role === 'S' && z.hi < nS.lo).sort((a, b) => b.hi - a.hi); bear = `A daily close below ${fmt(nS.lo)} (floor of the ${zt(nS)} support, ${nS.count} methods) hands control to sellers` + (n2.length ? `; next support ${zt(n2[0])}.` : '; no qualified support below, so risk is open until a new base forms.'); }\n    else bear = 'No qualified support below: a new base has to form first.';\n",
   "    // minor levels (1–2 methods, within 35%, events no wider than 2 daily ATR): listed in the Bull / Bear case wherever the\n    // nearest or next qualified zone is missing or more than 1.5 daily ATR away (tools/page.js edit, 20 Nov 2026)\n    const mName = (e) => {\n      const L = e.lab;\n      if (e.m === 'SWING') return L.replace(/^Equal (high|low)s x\\d+ \\((.*)\\)$/, 'equal $1s $2').replace(/^Swing /, 'swing ');\n      if (e.m === 'FVG') return 'price gap ' + L.replace(/^\\w+ FVG (\\S+).*$/, '$1');\n      if (e.m === 'OB') return 'order block ' + L.replace(/^\\w+ order block /, '');\n      if (e.m === 'EMA') return L.replace(/^(EMA\\d+) \\S+ at (.*)$/, '$1 $2');\n      if (e.m === 'FIB') return L.replace(/^Fib (\\S+) of .*\\((.*)\\)$/, 'fib $1 at $2');\n      if (e.m === 'HVN') return L.replace(/^High-volume node /, 'volume node ');\n      return 'retest shelf ' + L.replace(/^Breakout-retest shelf (\\S+).*$/, '$1');\n    };\n    const mDesc = (z, role) => {\n      const mid = (z.lo + z.hi) / 2, by = {};\n      const off = (e) => Math.abs((e.lo + e.hi) / 2 - mid);\n      z.mem.forEach((e) => { const b = by[e.m]; if (!b || off(e) < off(b) - 1e-9 || (Math.abs(off(e) - off(b)) <= 1e-9 && TFS.indexOf(e.tf) > TFS.indexOf(b.tf))) by[e.m] = e; });\n      const yr = role === 'S' ? lo365 : hi365, tfs = TFS.filter((t) => z.tfs.has(t)).join('+');\n      const ext = yr >= z.lo - 0.35 * ad && yr <= z.hi + 0.35 * ad ? (role === 'S' ? ', 1-year low ' : ', 1-year high ') + fmt(yr) : '';\n      const nm = Object.values(by).map(mName).join(' + ').replace(/(\\d)-(\\d)/g, '$1–$2');\n      return nm + ' (' + tfs + (ext && nm.includes(' ' + fmt(yr)) ? ext.replace(/ \\S+$/, '') : ext) + ')';\n    };\n    const MINOR = zones(E.filter((e) => e.hi - e.lo <= 2 * ad), ad, spot, 30, 1).filter((z) => z.ms.size < 3 && Math.abs((z.lo + z.hi) / 2 / spot - 1) <= 0.35 && !P3.some((q) => Math.min(z.hi, q.hi) > Math.max(z.lo, q.lo)));\n    const spaced = (list, n) => { const out = []; list.forEach((z) => { if (out.length < n && out.every((o) => Math.min(Math.abs(z.lo - o.hi), Math.abs(o.lo - z.hi)) >= 0.5 * ad)) out.push(z); }); return out; };\n    const minorS = spaced(MINOR.filter((z) => (z.lo + z.hi) / 2 < spot).sort((a, b) => b.hi - a.hi).map((z) => ({ lo: z.lo, hi: z.hi, count: z.ms.size, txt: mDesc(z, 'S') })), 1e9);\n    const minorR = spaced(MINOR.filter((z) => (z.lo + z.hi) / 2 >= spot).sort((a, b) => a.lo - b.lo).map((z) => ({ lo: z.lo, hi: z.hi, count: z.ms.size, txt: mDesc(z, 'R') })), 1e9);\n    const MINOR_TAG = 'minor levels (1–2 methods)';\n    let bull, bear;\n    if (nR) {\n      const n2 = P3.filter((z) => z.role === 'R' && z.lo > nR.hi).sort((a, b) => a.lo - b.lo), q = n2[0];\n      const mm = !q || q.lo - nR.hi > 1.5 * ad ? spaced(minorR.filter((z) => z.lo > nR.hi && (!q || z.hi < q.lo)), q ? 3 : 4) : [];\n      const pre = nR.lo - spot > 1.5 * ad ? spaced(minorR.filter((z) => z.hi < nR.lo), 3) : [];\n      bull = (pre.length ? `Nearest ${MINOR_TAG}: ${pre.map((z) => z.txt).join('; ')}. Qualified resistance: a` : 'A') + ` daily close above ${fmt(nR.hi)} (top of the ${zt(nR)} resistance, ${nR.count} methods) hands control to buyers` +\n        (mm.length ? `; next ${MINOR_TAG}: ${mm.map((z) => z.txt).join('; ')}` + (q ? `; then the ${zt(q)} resistance (${q.count} methods).` : '; no qualified resistance beyond them.')\n          : q ? `; next stop ${zt(q)}.` : '; no qualified resistance above, so price would be in open air up to the next weekly level.');\n    } else {\n      const mm = spaced(minorR, 4);\n      bull = mm.length ? `No qualified resistance (3+ methods) overhead. Nearest ${MINOR_TAG}: ${mm.map((z) => z.txt).join('; ')}.` : 'No qualified resistance overhead: holding the current range is the bull case.';\n    }\n    if (nS) {\n      const n2 = P3.filter((z) => z.role === 'S' && z.hi < nS.lo).sort((a, b) => b.hi - a.hi), q = n2[0];\n      const mm = !q || nS.lo - q.hi > 1.5 * ad ? spaced(minorS.filter((z) => z.hi < nS.lo && (!q || z.lo > q.hi)), q ? 3 : 4) : [];\n      const pre = spot - nS.hi > 1.5 * ad ? spaced(minorS.filter((z) => z.lo > nS.hi), 3) : [];\n      bear = (pre.length ? `Nearest ${MINOR_TAG}: ${pre.map((z) => z.txt).join('; ')}. Qualified support: a` : 'A') + ` daily close below ${fmt(nS.lo)} (floor of the ${zt(nS)} support, ${nS.count} methods) hands control to sellers` +\n        (mm.length ? `; next ${MINOR_TAG}: ${mm.map((z) => z.txt).join('; ')}` + (q ? `; then the ${zt(q)} support (${q.count} methods).` : '; no qualified support below them.')\n          : q ? `; next support ${zt(q)}.` : '; no qualified support below, so risk is open until a new base forms.');\n    } else {\n      const mm = spaced(minorS, 4);\n      bear = mm.length ? `No qualified support (3+ methods) below. Nearest ${MINOR_TAG}: ${mm.map((z) => z.txt).join('; ')}.` : 'No qualified support below: a new base has to form first.';\n    }\n", ONE],
  ["long: plan('LONG'), short: plan('SHORT'), bull, bear, mtf,", "long: plan('LONG'), short: plan('SHORT'), bull, bear, mtf, minor_s: minorS, minor_r: minorR,", ONE],
  // Forecast: when no qualified zone lies beyond the trigger, the targets name the nearest minor levels instead
  ["bull_targets: bullT.map((z) => `${f(z.lo)}–${f(z.hi)}`), bear_targets: bearT.map((z) => `${f(z.lo)}–${f(z.hi)}`),",
   "bull_targets: bullT.length ? bullT.map((z) => `${f(z.lo)}–${f(z.hi)}`) : (E.minor_r || []).filter((z) => z.lo > up).slice(0, 2).map((z) => z.txt + ', minor'), bear_targets: bearT.length ? bearT.map((z) => `${f(z.lo)}–${f(z.hi)}`) : (E.minor_s || []).filter((z) => z.hi < dn).slice(0, 2).map((z) => z.txt + ', minor'),", ONE],
  // prices: whole dollars from $100 up (unchanged), two decimals below $100
  // Market sentiment card: USDT.D on its own (owner, 20 Nov 2026), next to the USDT.D + USDC.D row, same columns and the same
  // 90-day-range read; context only (score 0), so the tilt sum and the Forecast are unchanged and stablecoin dominance is not counted twice
  ["      out[out.length - 1].range_pos = pos;\n    }\n",
   "      out[out.length - 1].range_pos = pos;\n    }\n    if (gauge_usdtd.length) {\n      const ut = gauge_usdtd.map((x) => ({ day: x.day, close: x.close }));\n      const w = ut.slice(-90).map((x) => x.close), hi = Math.max(...w), lo = Math.min(...w), pos = hi > lo ? (w[w.length - 1] - lo) / (hi - lo) : 0.5;\n      const pp = Math.round(pos * 100) + '% of its 90-day range';\n      row('usdtd', 'USDT dominance (USDT.D)', ut[ut.length - 1].close.toFixed(2) + '%', ut,\n        (pos >= 0.85 ? `Near the top (${pp}): cash parked in USDT, fear high.` : pos <= 0.15 ? `Near the bottom (${pp}): little USDT on the sidelines.` : `Mid-range (${pp}).`) + ' Context only: scored through stablecoin dominance above.', 0);\n      out[out.length - 1].range_pos = pos;\n    }\n", ONE],
  // USDT.D tab (owner, 21 Nov 2026): a tab after Forecast that shows public/usdtd.json (build/usdtd.js) through public/usdtd.js;
  // the page's own show() already switches any .br-page, draw() hands the new tab to window.__usdtd, and #usdtd opens it
  ['    <button id="forecast" role="tab" aria-selected="false">Forecast</button>\n',
   '    <button id="forecast" role="tab" aria-selected="false">Forecast</button>\n    <button id="usdtd" role="tab" aria-selected="false">USDT.D</button>\n', ONE],
  ['  <section class="br-page" data-page="daily" hidden>',
   '  <section class="br-page" data-page="usdtd" hidden><div id="usdtd-root" style="display:flex;flex-direction:column;gap:var(--cds-gap-md)"></div><script src="usdtd.js"></script></section>\n\n  <section class="br-page" data-page="daily" hidden>', ONE],
  ["    } else {\n      const yd = dash.data('yearly_roi');",
   "    } else if (current === 'usdtd') {\n      if (window.__usdtd) window.__usdtd();\n    } else {\n      const yd = dash.data('yearly_roi');", ONE],
  ["'patterns', 'plan', 'forecast'].includes(named)", "'patterns', 'plan', 'forecast', 'usdtd'].includes(named)", ONE],
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
