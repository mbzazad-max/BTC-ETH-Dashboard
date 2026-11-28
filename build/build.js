/* BTC & ETH dashboard build: turns the shared closed candles and readings (repo mbzazad-max/market-data) into the
   saved snapshot the ORIGINAL page reads (the same documents its own "Refresh from TradingView" would save).
   All of the dashboard's logic (ROI grids, Patterns, levels, spot plans, Forecast) stays in the original page,
   which runs unchanged in the browser; this script only converts data, using the page's own rules:
     bars    -> rows {day|time|week|month, open, high, low, close, volume}, numbers rounded like the page's saveSource
                (|v| < 100: 4 decimals, else 2), saved in parts of 1200 rows with {columns, rows, part, parts, at}
     weekly / monthly -> built from closed daily candles (Monday weeks, calendar months, UTC); the current week and
                month are week-to-date / month-to-date from closed days only
     gauges  -> daily candles built from closed 4H candles (a UTC day is used once its 20:00 candle has closed)
     econ_cal -> the page's econ loader applied to the stored TradingView calendar answer
     sentiment -> the page's fetchCmc() applied to the stored CoinMarketCap answer (stamped with its fetch time)
     derivs / derivs_eth / derivs_sol / derivs_bnb -> the stored CoinGlass readings, as saved
     SOL / BNB CoinMarketCap rows -> added to the sentiment document from the stored get_crypto_quotes_latest answer
     ETF net flows -> context rows added to the sentiment document from the stored Farside / SoSoValue history (snap/etf_flows)
   usage: node build/build.js <market-data dir> [--force]
   Writes public/snapshot.json and public/freshness.json. A source that cannot be built keeps its last good
   documents and is listed (the page shows "N sources kept from an older refresh"). Nothing is invented.
   If the inputs are unchanged since the last build (and not --force), nothing is rebuilt. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..'), PUB = path.join(ROOT, 'public');
const MD = path.resolve(process.argv[2] || '../market-data'), FORCE = process.argv.includes('--force');
const NOW = process.env.BUILD_NOW ? Number(process.env.BUILD_NOW) : Math.floor(Date.now() / 1000);
const CHUNK = 1200;

const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const wr = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const cfg = rd(path.join(ROOT, 'config', 'dashboard.json'));
const man = rd(path.join(MD, 'manifest.json'));
const manifest = man.series || {}, readings = man.snapshots || {};
const prevSnap = fs.existsSync(path.join(PUB, 'snapshot.json')) ? rd(path.join(PUB, 'snapshot.json')) : { docs: {} };
const prevFresh = fs.existsSync(path.join(PUB, 'freshness.json')) ? rd(path.join(PUB, 'freshness.json')) : null;

// ---------- the page's own conversion rules ----------
const round = (v) => (typeof v === 'number' && isFinite(v) ? (Math.abs(v) < 100 ? Math.round(v * 1e4) / 1e4 : Math.round(v * 100) / 100) : v);
const iso = (t) => new Date(t * 1000).toISOString();
const KEY = { '1D': ['day', (t) => iso(t).slice(0, 10)], '1W': ['week', (t) => iso(t).slice(0, 10)], '1M': ['month', (t) => iso(t).slice(0, 7)], '4H': ['time', (t) => iso(t).slice(0, 16)], '1D_from_4H': ['day', (t) => iso(t).slice(0, 10)] };

function csvFile(id) { const [src, sym, tf] = id.split('/'); return path.join(MD, 'data', src, `${sym}_${tf}.csv`); }
function load(id) {                                   // [{t,o,h,l,c,v}] oldest first, closed candles only (market-data rule)
  const f = csvFile(id); if (!fs.existsSync(f)) return null;
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n'); lines.shift();
  return lines.map((ln) => { const p = ln.split(','); return { t: +p[0], o: +p[1], h: +p[2], l: +p[3], c: +p[4], v: +p[5] }; });
}
// a stored history followed by a second series for every later candle (BTC: Coinbase history, then Binance BTCUSDT)
function chain(first, then) {
  const A = load(first), B = then ? load(then) : null;
  if (!A) return B; if (!B) return A;
  const lastT = A[A.length - 1].t;
  return A.concat(B.filter((r) => r.t > lastT));
}
const agg = (t, rs) => ({ t, o: rs[0].o, h: Math.max(...rs.map((r) => r.h)), l: Math.min(...rs.map((r) => r.l)), c: rs[rs.length - 1].c, v: rs.reduce((s, r) => s + r.v, 0) });
function groupBy(rows, keyOf) { const out = []; let cur = null; for (const r of rows) { const k = keyOf(r.t); if (!cur || cur.k !== k) { cur = { k, rs: [] }; out.push(cur); } cur.rs.push(r); } return out; }
const weekStart = (t) => { const d = Math.floor(t / 86400) * 86400, wd = (new Date(d * 1000).getUTCDay() + 6) % 7; return d - wd * 86400; };
const monthStart = (t) => { const d = new Date(t * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000; };
const weekly = (daily) => groupBy(daily, weekStart).map((g) => agg(g.k, g.rs));
const monthly = (daily) => groupBy(daily, monthStart).map((g) => agg(g.k, g.rs));
function dailyFrom4h(b4) {                           // a UTC day counts once its 20:00 candle (the day's last 4H) has closed
  return groupBy(b4, (t) => Math.floor(t / 86400) * 86400).filter((g) => g.rs[g.rs.length - 1].t === g.k + 72000).map((g) => agg(g.k, g.rs));
}
function econRows(answer) {                           // the page's econ_cal loader
  const a = answer;
  if (a && a.status && a.status !== 'ok') throw new Error('calendar status ' + a.status);
  const list = (a && (a.result || a.data || a.events)) || [];
  if (!Array.isArray(list)) throw new Error('No event list in economic-calendar answer');
  return list.map((e) => ({ id: String(e.id), date: String(e.date).slice(0, 16), title: String(e.title || e.indicator || ''), importance: Number(e.importance),
    forecast: e.forecast == null ? null : Number(e.forecast), previous: e.previous == null ? null : Number(e.previous), actual: e.actual == null ? null : Number(e.actual), unit: e.unit || '' }));
}
// the page's fetchCmc() rows, given the stored answer p and its fetch time
const numOf = (txt) => { const m = String(txt || '').replace(/[,$+]/g, '').match(/(-?[\d.]+)\s*([TBMK])?/); if (!m) return null; return Number(m[1]) * ({ T: 1e12, B: 1e9, M: 1e6, K: 1e3 }[m[2]] || 1); };
const pctTxt = (txt) => { const v = parseFloat(String(txt || '').replace(/[+%]/g, '')); return isFinite(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + '%' : '—'; };
const asiLabel = (v) => (v <= 25 ? 'Bitcoin Season' : v >= 75 ? 'Altcoin Season' : 'Neutral');
function cmcDoc(p, fetchedAt) {
  const fg = p.sentiment && p.sentiment.fear_greed, as = p.rotation && p.rotation.altcoin_season, mc = p.market_size && p.market_size.total_crypto_market_cap_usd, dm = p.dominance || {}, etf = p.trad_fi_flows && p.trad_fi_flows.etf_aum && p.trad_fi_flows.etf_aum.btc;
  if (!fg || !fg.current || fg.current.index == null) throw new Error('CoinMarketCap answer had no Fear & Greed index');
  const now = new Date(fetchedAt * 1000), stamp = now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) + ' AEDT';
  const fgi = Number(fg.current.index), h = fg.history || {};
  const rows = [
    { id: 'as_of', metric: 'Snapshot time', value: stamp, num: null, change: '', note: `CoinMarketCap global metrics (connector). Fear & Greed and Altcoin Season are CMC's daily readings (${p.last_updated || 'latest 00:00 UTC'}); market cap and dominance are intraday.` },
    { id: 'fng', metric: 'Fear & Greed Index', value: `${fgi} (${fg.current.value || ''})`, num: fgi,
      change: [h.yesterday && `${h.yesterday.index} yday (${h.yesterday.value})`, h.last_week && `${h.last_week.index} last wk`, h.last_month && `${h.last_month.index} last mo`].filter(Boolean).join(' · '),
      note: `CoinMarketCap's index, 0 = extreme fear, 100 = extreme greed. Yearly range ${fg.yearly && fg.yearly.min ? fg.yearly.min.index : '?'}–${fg.yearly && fg.yearly.max ? fg.yearly.max.index : '?'}.` },
  ];
  if (as && as.current && as.current.index != null) {
    const ai = Number(as.current.index), ah = as.history || {};
    rows.push({ id: 'asi', metric: 'Altcoin Season Index', value: `${ai}/100 (${as.current.value || asiLabel(ai)})`, num: ai,
      change: [ah.yesterday && `${ah.yesterday.index} yday`, ah.last_week && `${ah.last_week.index} last wk`, ah.last_month && `${ah.last_month.index} last mo`].filter(Boolean).join(' · '),
      note: `CoinMarketCap's index: 0–25 Bitcoin Season, 75–100 Altcoin Season. Yearly range ${as.yearly && as.yearly.min ? as.yearly.min.index : '?'}–${as.yearly && as.yearly.max ? as.yearly.max.index : '?'}.` });
  }
  if (mc && mc.current) {
    const pc = mc.percent_change || {};
    rows.push({ id: 'mcap', metric: 'Total crypto market cap', value: '$' + String(mc.current).replace(/\s+/g, ''), num: numOf(mc.current),
      change: `${pctTxt(pc['24h'])} 24h · ${pctTxt(pc['7d'])} 7D · ${pctTxt(pc['30d'])} 30D`,
      note: `BTC dominance ${String((dm.btc || {}).current || '—').replace('+', '')} (last wk ${String(((dm.btc || {}).history || {}).last_week || '—').replace('+', '')}), ETH ${String((dm.eth || {}).current || '—').replace('+', '')}.` });
  }
  const etfRow = (id, metric, e) => {
    const eh = e.history || {};
    rows.push({ id, metric, value: '$' + String(e.current).replace(/\s+/g, ''), num: numOf(e.current),
      change: [eh.yesterday && `$${String(eh.yesterday).replace(/\s+/g, '')} yday`, eh.last_week && `$${String(eh.last_week).replace(/\s+/g, '')} last wk`, eh.last_month && `$${String(eh.last_month).replace(/\s+/g, '')} last mo`].filter(Boolean).join(' · '),
      note: 'Assets held, not flows: changes mix price moves with inflows and outflows.' });
  };
  if (etf && etf.current) etfRow('etf', 'US spot BTC ETF assets', etf);
  const etfE = (((p.trad_fi_flows || {}).etf_aum || {}).eth) || null;
  if (etfE && etfE.current) etfRow('etf_eth', 'US spot ETH ETF assets', etfE);
  return { as_of: now.toISOString(), source: 'CoinMarketCap connector (get_global_metrics_latest)', rows };
}
// SOL and BNB (added 14 Nov 2026): one CoinMarketCap row per coin from get_crypto_quotes_latest, shown in the
// Market sentiment card where BTC and ETH show their US spot ETF assets (no score, like the ETF rows)
const big = (v) => (v >= 1e12 ? (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : (v / 1e6).toFixed(2) + 'M');
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + '%';
function quoteRows(q) {
  const h = q.headers, out = [];
  for (const r of q.rows || []) {
    const g = (k) => r[h.indexOf(k)], sym = String(g('symbol')), price = Number(g('price'));
    if (!['SOL', 'BNB'].includes(sym) || !(price > 0)) continue;
    out.push({ id: 'coin_' + sym.toLowerCase(), metric: `${sym} on CoinMarketCap`, value: `$${price < 100 ? price.toFixed(2) : Math.round(price).toLocaleString('en-US')} · rank #${g('rank')}`, num: price,
      change: `${sgn(Number(g('percent_change_24h')))} 24h · ${sgn(Number(g('percent_change_7d')))} 7D · ${sgn(Number(g('percent_change_30d')))} 30D`,
      note: `Market cap $${big(Number(g('market_cap')))} (${Number(g('market_cap_dominance')).toFixed(2)}% of the crypto market), 24h volume $${big(Number(g('volume_24h')))}, ${sgn(Number(g('percent_change_ytd')))} this year. CoinMarketCap quote ${String(g('last_updated_time')).slice(0, 16).replace('T', ' ')} UTC.` });
  }
  return out;
}
// US spot ETF net flows (added 28 Nov 2026): one context row per coin (score 0 on the page) from the stored Farside /
// SoSoValue history (Market-Data snap/etf_flows, US$ millions per US trading day). BTC's read uses the owner's backtest
// (claude/btcdash/etf_flows_backtest.md, 28 Nov 2026): 5-day total in the lowest 15% since Jan 2024 -> BTC up 14 days later
// 39% of the time vs 51% (not a contrarian buy); inflows over 5 days while BTC fell over 7 days -> 59% vs 51%; top 15% -> no edge.
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayTxt = (d) => Number(d.slice(8)) + ' ' + MONS[Number(d.slice(5, 7)) - 1];
const musd = (v) => { const a = Math.abs(v), s = v < 0 ? '−' : v > 0 ? '+' : ''; return s + (a >= 1000 ? '$' + (a / 1000).toFixed(2) + 'B' : a >= 10 ? '$' + Math.round(a) + 'M' : a > 0 ? '$' + a.toFixed(1) + 'M' : '$0'); };
function flowRows(p, btcClose) {
  const out = [], A = p.assets || {}, stats = {};
  for (const [sym, a] of Object.entries(A)) {
    const d = (a.days || []).filter((x) => typeof x[1] === 'number').sort((x, y) => (x[0] < y[0] ? -1 : 1));
    if (!d.length) continue;
    const v = d.map((x) => x[1]), n = v.length, sum = (k) => (n >= k ? v.slice(-k).reduce((x, y) => x + y, 0) : null);
    let out_ = 0; for (let i = n - 1; i >= 0 && v[i] < 0; i--) out_++;
    let in_ = 0; for (let i = n - 1; i >= 0 && v[i] > 0; i--) in_++;
    stats[sym] = { last: d[n - 1], s5: sum(5), s20: sum(20), out_, in_, d, a };
  }
  const streak = (s) => (s.out_ >= 2 ? `${s.out_} days of outflows in a row` : s.in_ >= 2 ? `${s.in_} days of inflows in a row` : '');
  const change = (s) => [s.s5 != null && `5d ${musd(s.s5)}`, s.s20 != null && `20d ${musd(s.s20)}`, streak(s)].filter(Boolean).join(' · ');
  const B = stats.BTC;
  if (B) {
    let read;
    const sums = []; for (let i = 4; i < B.d.length; i++) sums.push(B.d.slice(i - 4, i + 1).reduce((x, y) => x + y[1], 0));
    const srt = [...sums].sort((x, y) => x - y), q = (f) => srt[Math.floor(f * (srt.length - 1))];
    const closes = btcClose || [], c0 = closes.length ? closes[closes.length - 1] : null, c7 = closes.length > 7 ? closes[closes.length - 8] : null;
    const btc7 = c0 && c7 ? c0 / c7 - 1 : null;
    if (sums.length < 250 || B.s5 == null) read = 'Not enough flow history yet to rank this week.';
    else if (B.s5 <= q(0.15)) read = `Heavy outflows (5-day total in the lowest 15% since Jan 2024${B.s5 <= srt[0] ? ', the lowest on record' : ''}): institutions are selling. In the backtest BTC was higher 14 days later only 39% of the time from here (vs 51% normally): not a contrarian buy.`;
    else if (B.s5 > 0 && btc7 != null && btc7 < 0) read = 'Inflows while BTC fell over the last week (dip buying). In the backtest BTC was higher 14 days later 59% of the time from here (vs 51% normally).';
    else if (B.s5 >= q(0.85)) read = 'Strong inflows (5-day total in the top 15%): institutions buying, but the backtest found no clear edge from here (54% vs 51%).';
    else read = 'Flows within their normal range: no signal.';
    out.push({ id: 'flow_btc', metric: 'US spot BTC ETF net flows', value: `${musd(B.last[1])} (${dayTxt(B.last[0])})`, num: B.last[1], change: change(B),
      note: read + ' Context only (score 0) until the edge is confirmed; re-test due Mar 2027. Farside, US$, per US trading day.' });
  }
  const ALTS = ['ETH', 'SOL', 'XRP', 'DOGE', 'LINK', 'ZEC', 'HYPE'];
  for (const sym of ALTS) {
    const s = stats[sym]; if (!s) continue;
    out.push({ id: 'flow_' + sym.toLowerCase(), metric: `US spot ${sym} ETF net flows`, value: `${musd(s.last[1])} (${dayTxt(s.last[0])})`, num: s.last[1], change: change(s),
      note: `${s.s5 == null ? 'Too few days stored for a 5-day total yet.' : s.s5 < 0 ? 'Money leaving the funds over the last 5 trading days.' : s.s5 > 0 ? 'Money coming into the funds over the last 5 trading days.' : 'No net flow over the last 5 trading days.'}` +
        (s.a.net_assets_musd ? ` Total net assets ${musd(s.a.net_assets_musd).replace('+', '')}.` : '') + ` Not backtested; context only. ${String(s.a.source || '').split(' (')[0]}.` });
  }
  const alts = ALTS.filter((k) => stats[k]);
  if (alts.length) out.push({ id: 'flow_alts', metric: 'Other US spot crypto ETFs (net flows)', value: alts.map((k) => `${k} ${musd(stats[k].last[1])}`).join(' · '), num: null,
    change: alts.filter((k) => stats[k].s5 != null).map((k) => `5d ${k} ${musd(stats[k].s5)}`).join(' · ') || 'building history',
    note: `Latest US trading day per coin (${[...new Set(alts.map((k) => dayTxt(stats[k].last[0])))].join(', ')}). Farside and SoSoValue. Not backtested; context only.` });
  return out;
}
function reading(id) { const f = path.join(MD, 'data', 'snap', id.split('/')[1] + '.json'); return fs.existsSync(f) ? rd(f) : null; }

// ---------- inputs and the skip check ----------
const usedSeries = new Set(), usedReadings = new Set();
for (const s of Object.values(cfg.sources)) { for (const k of ['series', 'series_4h', 'then', 'then_4h']) if (s[k]) usedSeries.add(s[k]); if (s.reading) usedReadings.add(s.reading); }
for (const s of Object.values(cfg.readings)) { usedReadings.add(s.reading); if (s.quotes) usedReadings.add(s.quotes); if (s.flows) usedReadings.add(s.flows); }
const pageSum = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'reference', 'index.original.html'))).digest('hex');
const buildSum = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
const inputsHash = crypto.createHash('sha256').update(JSON.stringify([pageSum, buildSum, cfg,
  [...usedSeries].sort().map((id) => [id, manifest[id] && manifest[id].last_open, manifest[id] && manifest[id].rows]),
  [...usedReadings].sort().map((id) => [id, readings[id] && readings[id].fetched_at])])).digest('hex');
// Stored history that newer candles continue from another series (Coinbase BTCUSD -> Binance BTCUSDT): never fetched again.
const historyOnly = new Set(Object.values(cfg.sources).flatMap((s) => [s.then && s.series, s.then_4h && s.series_4h]).filter(Boolean));
function freshnessRows() {
  return [...usedSeries].sort().map((id) => { const m = manifest[id] || null;
    return { id, history_only: historyOnly.has(id) || undefined, source: id.split('/')[0], symbol: m ? m.symbol : id.split('/')[1], tf: id.split('/')[2], period_s: m ? m.period_s : null,
      last_open: m ? m.last_open : null, last_close: m ? m.last_close : null, fetched_at: m ? m.fetched_at : null, rows: m ? m.rows : 0 }; });
}
const readingRows = () => [...usedReadings].sort().map((id) => ({ id, fetched_at: readings[id] ? readings[id].fetched_at : null }));
if (!FORCE && prevFresh && prevFresh.inputs_hash === inputsHash) {
  prevFresh.checked_at = NOW; prevFresh.series = freshnessRows(); prevFresh.readings = readingRows();
  prevFresh.last_result = 'No new candles or readings since the last build; dashboard unchanged.';
  wr(path.join(PUB, 'freshness.json'), prevFresh);
  console.log(JSON.stringify({ skipped: true, reason: 'inputs unchanged', checked_at: NOW }));
  process.exit(0);
}

// ---------- build every source; a failure keeps the last good documents ----------
const AT = new Date(NOW * 1000).toISOString();
const docs = {}, kept = [], sources = {}, failed = [];
const prevMeta = prevSnap.docs['snap/meta'] || null;
function keep(id, why) {
  kept.push({ id, why });
  const info = prevMeta && prevMeta.sources && prevMeta.sources[id];
  if (info) { for (let k = 0; k < info.parts; k++) docs[`snap/${id}-${k}`] = prevSnap.docs[`snap/${id}-${k}`]; sources[id] = info; }
  failed.push(id);
}
function rowsFor(s) {
  if (s.use === 'econ') { const r = reading(s.reading); if (!r) throw new Error('no reading ' + s.reading); return { rows: econRows(r.payload), columns: ['id', 'date', 'title', 'importance', 'forecast', 'previous', 'actual', 'unit'] }; }
  let bars;
  if (s.use === '4H') bars = chain(s.series_4h, s.then_4h);
  else if (s.use === '1D_from_4H') { const b = load(s.series_4h); bars = b && dailyFrom4h(b); }
  else { const d = chain(s.series, s.then); bars = d && (s.use === '1W' ? weekly(d) : s.use === '1M' ? monthly(d) : d); }
  if (!bars || bars.length < 30) throw new Error('missing or too few candles (' + (s.series || s.series_4h) + ')');
  bars = bars.slice(-s.last);
  if (!bars.every((b) => b.c > 0 && b.h >= b.l)) throw new Error('invalid candle values');
  const [k, f] = KEY[s.use];
  return { rows: bars.map((b) => ({ [k]: f(b.t), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v })), columns: [k, 'open', 'high', 'low', 'close', 'volume'] };
}
for (const [id, s] of Object.entries(cfg.sources)) {
  let got;
  try { got = rowsFor(s); } catch (e) { keep(id, String(e.message || e)); continue; }
  const arr = got.rows.map((r) => got.columns.map((c) => round(r[c])));       // the page's saveSource
  const parts = Math.max(1, Math.ceil(arr.length / CHUNK));
  for (let k = 0; k < parts; k++) docs[`snap/${id}-${k}`] = { columns: got.columns, rows: arr.slice(k * CHUNK, (k + 1) * CHUNK), part: k, parts, at: AT };
  sources[id] = { at: AT, rows: arr.length, parts };
}
// readings that the page receives as whole documents
for (const [doc, s] of Object.entries(cfg.readings)) {
  const r = reading(s.reading);
  try {
    if (!r) throw new Error('no reading ' + s.reading);
    docs['snap/' + doc] = s.use === 'cmc' ? cmcDoc(r.payload, r.fetched_at) : r.payload;
    if (s.flows) { const fr = reading(s.flows); try { if (fr) { const bc = Object.keys(docs).filter((k) => /^snap\/btc_daily-\d+$/.test(k)).sort((x, y) => Number(x.split('-')[1]) - Number(y.split('-')[1])).flatMap((k) => docs[k].rows.map((r) => r[4])); docs['snap/' + doc].rows.push(...flowRows(fr.payload, bc)); } else kept.push({ id: s.flows, why: 'no reading yet' }); } catch (e) { kept.push({ id: s.flows, why: String(e.message || e) }); } }
    if (s.quotes) { const q = reading(s.quotes); try { if (q) docs['snap/' + doc].rows.push(...quoteRows(q.payload)); else kept.push({ id: s.quotes, why: 'no reading yet' }); } catch (e) { kept.push({ id: s.quotes, why: String(e.message || e) }); } }
  } catch (e) { kept.push({ id: doc, why: String(e.message || e) }); if (prevSnap.docs['snap/' + doc]) docs['snap/' + doc] = prevSnap.docs['snap/' + doc]; }
}
docs['snap/meta'] = { at: AT, sources, failed: failed.concat(kept.some((k) => k.id === 'sentiment') ? ['cmc'] : []), v: 1 };

// ---------- validate before writing anything ----------
const problems = [];
for (const id of ['btc_daily', 'btc_4h', 'eth_daily', 'eth_4h']) if (!sources[id]) problems.push(id + ' has no data at all');
if (problems.length) { console.error('Validation failed, nothing written:\n' + problems.join('\n')); process.exit(1); }

const generated = AT.slice(0, 16).replace('T', ' ') + ' UTC';
wr(path.join(PUB, 'snapshot.json'), { generated, docs });
wr(path.join(PUB, 'freshness.json'), { built_at: NOW, checked_at: NOW, generated, inputs_hash: inputsHash, kept,
  last_result: kept.length ? `Built ${Object.keys(sources).length - failed.length} sources; ${kept.length} kept their last good version.` : `Built all ${Object.keys(cfg.sources).length} sources and ${Object.keys(cfg.readings).length} readings.`,
  series: freshnessRows(), readings: readingRows() });
console.log(JSON.stringify({ generated, built: Object.keys(sources).length - failed.length, kept, last: {
  btc_daily: docs['snap/btc_daily-' + (sources.btc_daily.parts - 1)].rows.slice(-1)[0], eth_4h: docs['snap/eth_4h-0'].rows.slice(-1)[0] } }));
