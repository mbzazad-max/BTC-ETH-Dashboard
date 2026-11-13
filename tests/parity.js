/* Parity test: the ORIGINAL page (reference/index.original.html, its own "Refresh from TradingView") versus
   build/build.js, fed the SAME closed candles and readings from market-data.
   usage: node tests/parity.js <market-data dir> <node_modules dir that has jsdom and d3>
   The page asks for: per coin 4H x1000, 1D x8000, 1W x2000, M x500; per gauge 1D x400; the US calendar; CoinMarketCap.
   The mock answers 4H and 1D with the stored closed candles, 1W / M with weeks and months made from those closed days,
   gauge 1D with days made from closed 4H candles (the same rule build.js uses), and the calendar and CoinMarketCap
   with the stored readings. Every document the page saves is compared with build.js output.
   Not compared (by design): the save time stamps ("at"), and the CoinMarketCap "as_of" time, which the page takes
   from the clock when it calls CoinMarketCap and build.js takes from the reading's fetch time. CoinGlass documents
   are not made by the page's Refresh at all; build.js passes the stored readings through unchanged, which is checked. */
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const MD = path.resolve(process.argv[2]), NM = path.resolve(process.argv[3]);
const { JSDOM, VirtualConsole } = require(path.join(NM, 'jsdom'));
const ROOT = path.resolve(__dirname, '..'), REF = path.join(ROOT, 'reference');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/dashboard.json'), 'utf8'));
const load = (id) => fs.readFileSync(path.join(MD, 'data', id.split('/')[0], id.split('/')[1] + '_' + id.split('/')[2] + '.csv'), 'utf8').trim().split('\n').slice(1)
  .map((x) => { const p = x.split(',').map(Number); return { t: p[0], o: p[1], h: p[2], l: p[3], c: p[4], v: p[5] }; });
const reading = (id) => JSON.parse(fs.readFileSync(path.join(MD, 'data/snap', id.split('/')[1] + '.json'), 'utf8'));
const agg = (t, rs) => ({ t, o: rs[0].o, h: Math.max(...rs.map((r) => r.h)), l: Math.min(...rs.map((r) => r.l)), c: rs[rs.length - 1].c, v: rs.reduce((s, r) => s + r.v, 0) });
const group = (rows, key) => { const o = []; let c = null; for (const r of rows) { const k = key(r.t); if (!c || c.k !== k) { c = { k, rs: [] }; o.push(c); } c.rs.push(r); } return o; };
const wk = (t) => { const d = Math.floor(t / 86400) * 86400; return d - ((new Date(d * 1000).getUTCDay() + 6) % 7) * 86400; };
const mo = (t) => { const d = new Date(t * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000; };
const answer = (bars, n) => { const b = bars.slice(-n); return { success: true, format: 'columns', bars: { t: b.map((x) => x.t), o: b.map((x) => x.o), h: b.map((x) => x.h), l: b.map((x) => x.l), c: b.map((x) => x.c), v: b.map((x) => x.v) } }; };
const SYMS = { 'COINBASE:BTCUSD': 'btc', 'BINANCE:ETHUSDT': 'eth' }, GAUGE = { 'CRYPTOCAP:USDT.D': 'gauge_usdtd', 'CRYPTOCAP:USDC.D': 'gauge_usdcd', 'CRYPTOCAP:BTC.D': 'gauge_btcd', 'CRYPTOCAP:TOTAL2': 'gauge_total2' };
function tv(a) {
  if (GAUGE[a.symbol]) { const s = cfg.sources[GAUGE[a.symbol]]; return answer(group(load(s.series_4h), (t) => Math.floor(t / 86400) * 86400).filter((g) => g.rs[g.rs.length - 1].t === g.k + 72000).map((g) => agg(g.k, g.rs)), a.count); }
  const c = SYMS[a.symbol]; if (!c) throw { code: 'tool_error', message: 'no fixture for ' + a.symbol };
  if (a.interval === '4h') return answer(load(cfg.sources[c + '_4h'].series_4h), a.count);
  const d = load(cfg.sources[c + '_daily'].series);
  if (a.interval === '1D') return answer(d, a.count);
  if (a.interval === '1W') return answer(group(d, wk).map((g) => agg(g.k, g.rs)), a.count);
  if (a.interval === 'M') return answer(group(d, mo).map((g) => agg(g.k, g.rs)), a.count);
  throw { code: 'tool_error', message: 'no fixture for ' + a.symbol + ' ' + a.interval };
}
(async () => {
  const store = {}, calls = [];
  const html = fs.readFileSync(path.join(REF, 'index.original.html'), 'utf8')
    .replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>', () => '<script>' + fs.readFileSync(path.join(NM, 'd3/dist/d3.min.js'), 'utf8') + '</script>')
    .replace(/<link[^>]+>/g, '');
  const errors = [], vc = new VirtualConsole(); vc.on('error', (...a) => errors.push(a.map(String).join(' '))); vc.on('jsdomError', (e) => errors.push('jsdom: ' + e.message));
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'https://example.test/', beforeParse(w) {
    const snap = (p) => ({ id: p.split('/').pop(), exists: p in store, data: () => JSON.parse(JSON.stringify(store[p])), metadata: {} });
    const DB = { doc: (p) => ({ get: async () => snap(p), onSnapshot: (n) => { setTimeout(() => n(snap(p)), 1); return () => {}; }, set: async (o) => { store[p] = JSON.parse(JSON.stringify(o)); } }) };
    const MCP = { callTool: async (server, tool, a) => { calls.push(tool + ' ' + (a.symbol || '') + ' ' + (a.interval || ''));
      if (tool === 'get_global_metrics_latest') return { payload: reading(cfg.readings.sentiment.reading).payload };
      if (tool === 'mcp-tv-get-economic-calendar') return { payload: reading(cfg.sources.econ_cal.reading).payload };
      return { payload: tv(a) }; } };
    w.claude = { use: async (k) => (k === 'db' ? DB : k === 'mcp' ? MCP : k === 'user' ? { isOwner: async () => true, canEdit: async () => true } : null) };
    w.SVGElement.prototype.getComputedTextLength = function () { return (this.textContent || '').length * 7; };
  } });
  const w = dom.window, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 100 && w.document.getElementById('rfBtn').hidden; i++) await sleep(100);
  w.document.getElementById('rfBtn').click();
  for (let i = 0; i < 1200 && !/updated|did not load|could not|paused/i.test(w.document.getElementById('rfBanner').textContent); i++) await sleep(100);
  const banner = w.document.getElementById('rfBanner').textContent;
  if (!store['snap/meta']) throw new Error('page saved nothing: ' + banner);
  // build.js on the same data at the same moment
  const tmp = fs.mkdtempSync('/tmp/bed-parity-'); execFileSync('cp', ['-r', ROOT + '/.', tmp]);
  for (const f of ['public/snapshot.json', 'public/freshness.json']) try { fs.unlinkSync(path.join(tmp, f)); } catch (e) {}
  execFileSync('node', [path.join(tmp, 'build/build.js'), MD, '--force'], { env: { ...process.env, BUILD_NOW: String(Math.floor(Date.parse(store['snap/meta'].at) / 1000)) } });
  const ours = JSON.parse(fs.readFileSync(path.join(tmp, 'public/snapshot.json'), 'utf8')).docs;
  const norm = (k, d) => { const c = JSON.parse(JSON.stringify(d)); delete c.at;
    if (k === 'snap/meta') Object.values(c.sources).forEach((s) => delete s.at);
    if (k === 'snap/sentiment') { delete c.as_of; c.rows.forEach((r) => { if (r.id === 'as_of') delete r.value; }); }
    return c; };
  const res = { page_banner: banner, page_calls: calls.length, identical: [], different: {}, only_page: [], only_build: [] };
  for (const k of Object.keys(store)) {
    if (!(k in ours)) { res.only_page.push(k); continue; }
    if (JSON.stringify(norm(k, store[k])) === JSON.stringify(norm(k, ours[k]))) res.identical.push(k);
    else { const a = norm(k, store[k]), b = norm(k, ours[k]); res.different[k] = (a.rows && b.rows) ? a.rows.findIndex((r, i) => JSON.stringify(r) !== JSON.stringify(b.rows[i])) : 'fields'; }
  }
  for (const k of Object.keys(ours)) if (!(k in store)) res.only_build.push(k);
  // CoinGlass readings pass through unchanged
  res.coinglass_unchanged = ['derivs', 'derivs_eth'].every((d) => JSON.stringify(ours['snap/' + d]) === JSON.stringify(reading(cfg.readings[d].reading).payload));
  res.page_errors = errors;
  const ok = !Object.keys(res.different).length && !res.only_page.length && res.only_build.every((k) => k === 'snap/derivs' || k === 'snap/derivs_eth') && res.coinglass_unchanged && !errors.length && /All 13/.test(banner);
  console.log(JSON.stringify({ ok, compared: res.identical.length + Object.keys(res.different).length, ...res }, null, 1));
  w.close(); process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
