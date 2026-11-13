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
     derivs / derivs_eth -> the stored CoinGlass readings, as saved
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
function reading(id) { const f = path.join(MD, 'data', 'snap', id.split('/')[1] + '.json'); return fs.existsSync(f) ? rd(f) : null; }

// ---------- inputs and the skip check ----------
const usedSeries = new Set(), usedReadings = new Set();
for (const s of Object.values(cfg.sources)) { for (const k of ['series', 'series_4h', 'then', 'then_4h']) if (s[k]) usedSeries.add(s[k]); if (s.reading) usedReadings.add(s.reading); }
for (const s of Object.values(cfg.readings)) usedReadings.add(s.reading);
const pageSum = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'reference', 'index.original.html'))).digest('hex');
const buildSum = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
const inputsHash = crypto.createHash('sha256').update(JSON.stringify([pageSum, buildSum, cfg,
  [...usedSeries].sort().map((id) => [id, manifest[id] && manifest[id].last_open, manifest[id] && manifest[id].rows]),
  [...usedReadings].sort().map((id) => [id, readings[id] && readings[id].fetched_at])])).digest('hex');
function freshnessRows() {
  return [...usedSeries].sort().map((id) => { const m = manifest[id] || null;
    return { id, source: id.split('/')[0], symbol: m ? m.symbol : id.split('/')[1], tf: id.split('/')[2], period_s: m ? m.period_s : null,
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
