/* Structure test (added 15 Nov 2026): does waiting for a 4H market structure shift (build/structure.js) make the
   dashboard's spot buys better? Two ways of buying the page's own 1D spot buy zone are replayed on closed 4H candles:

     Zone only   a limit buy at the middle of the 1D buy zone, with the page's own stop and Target 1.
     Zone + MSS  wait for a bullish 4H MSS whose sweep low reached the buy zone (at or below the zone top); then a
                 limit buy at its entry (middle of the displacement FVG, or a retest of the broken lower high) for up
                 to 12 4H candles, stop below the sweep low; same Target 1 as the page.

   The buy zone, stop and Target 1 for each day are what the ORIGINAL page showed that day: its own engine runs in
   jsdom on the candles that had closed by the end of that day (the same 1000 4H, daily, weekly and monthly candles
   its Refresh uses). Those day plans never change, so they are kept in history/plans.json and only new days are
   worked out on each build (the cache is thrown away if the page file changes).
   Trades: one at a time per method and coin; a candle that touches both stop and target counts as a loss; a trade
   still open after 60 4H candles (10 days) is closed at that close. Result: win rate to Target 1 and average R.
   Spot only; past results do not promise future ones; not financial advice.

   usage: node build/structure_test.js <node_modules dir with jsdom and d3> <market-data dir> [--from YYYY-MM-DD]
   Prints the summary as JSON and writes it to history/structure_test.json (read by build/checklist.js). */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const S = require('./structure.js');
const ROOT = path.resolve(__dirname, '..'), PUB = path.join(ROOT, 'public'), HIST = path.join(ROOT, 'history');
const FROM_DEFAULT = '2025-01-01', DAY = 86400, H4 = 14400, FILL_WAIT = 12, MAX_HOLD = 60;
const COINS = { BTC: 'btc', ETH: 'eth', SOL: 'sol', BNB: 'bnb' };

const round = (v) => (Math.abs(v) < 100 ? Math.round(v * 1e4) / 1e4 : Math.round(v * 100) / 100);
const iso = (t) => new Date(t * 1000).toISOString();
const dayOf = (t) => iso(t).slice(0, 10);

function loadCsv(md, id) {
  const [src, sym, tf] = id.split('/'), f = path.join(md, 'data', src, `${sym}_${tf}.csv`);
  if (!fs.existsSync(f)) return null;
  const L = fs.readFileSync(f, 'utf8').trim().split('\n'); L.shift();
  return L.map((ln) => { const p = ln.split(','); return { t: +p[0], o: +p[1], h: +p[2], l: +p[3], c: +p[4], v: +p[5] }; });
}
function chain(md, a, b) {                               // stored history, then a second series for every later candle
  const A = loadCsv(md, a), B = b ? loadCsv(md, b) : null;
  if (!A) return B; if (!B) return A;
  const last = A[A.length - 1].t; return A.concat(B.filter((r) => r.t > last));
}
const agg = (t, rs) => ({ t, o: rs[0].o, h: Math.max(...rs.map((r) => r.h)), l: Math.min(...rs.map((r) => r.l)), c: rs[rs.length - 1].c, v: rs.reduce((s, r) => s + r.v, 0) });
function groupBy(rows, keyOf) { const out = []; let cur = null; for (const r of rows) { const k = keyOf(r.t); if (!cur || cur.k !== k) { cur = { k, rs: [] }; out.push(cur); } cur.rs.push(r); } return out; }
const weekStart = (t) => { const d = Math.floor(t / DAY) * DAY, wd = (new Date(d * 1000).getUTCDay() + 6) % 7; return d - wd * DAY; };
const monthStart = (t) => { const d = new Date(t * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000; };

function histories(md) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'dashboard.json'), 'utf8')).sources, out = {};
  for (const [C, k] of Object.entries(COINS)) {
    const s4 = cfg[k + '_4h'], sd = cfg[k + '_daily'];
    const b4 = chain(md, s4.series_4h, s4.then_4h), d1 = chain(md, sd.series, sd.then);
    if (b4 && d1) out[C] = { b4, d1 };
  }
  return out;
}

// the snapshot documents the page would have had at the end of UTC day D (closed candles only)
function docsAt(H, D) {
  const end = Date.parse(D + 'T00:00:00Z') / 1000 + DAY, docs = {}, sources = {}, at = iso(end);
  const put = (id, col, rows) => {
    const parts = Math.max(1, Math.ceil(rows.length / 1200));
    for (let p = 0; p < parts; p++) docs[`snap/${id}-${p}`] = { columns: [col, 'open', 'high', 'low', 'close', 'volume'], rows: rows.slice(p * 1200, (p + 1) * 1200), part: p, parts, at };
    sources[id] = { at, rows: rows.length, parts };
  };
  const row = (key) => (r) => [key(r.t), round(r.o), round(r.h), round(r.l), round(r.c), round(r.v)];
  for (const [C, k] of Object.entries(COINS)) {
    if (!H[C]) continue;
    const b4 = H[C].b4.filter((r) => r.t + H4 <= end).slice(-1000), d1 = H[C].d1.filter((r) => r.t + DAY <= end);
    if (b4.length < 60 || d1.length < 60) continue;
    put(k + '_4h', 'time', b4.map(row((t) => iso(t).slice(0, 16))));
    put(k + '_daily', 'day', d1.slice(-8000).map(row((t) => iso(t).slice(0, 10))));
    put(k + '_weekly', 'week', groupBy(d1, weekStart).map((g) => agg(g.k, g.rs)).slice(-2000).map(row((t) => iso(t).slice(0, 10))));
    put(k + '_monthly', 'month', groupBy(d1, monthStart).map((g) => agg(g.k, g.rs)).slice(-500).map(row((t) => iso(t).slice(0, 7))));
  }
  docs['snap/meta'] = { at, sources, failed: [], v: 1 };
  return { generated: D, docs };
}

// the page's own 1D spot setup for every coin, from its engine running in jsdom on `snapshot`
function pagePlans(NM, snapshot) {
  const { JSDOM } = require(path.join(NM, 'jsdom'));
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8')
    .replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>', () => '<script>' + fs.readFileSync(path.join(NM, 'd3/dist/d3.min.js'), 'utf8') + '</script>')
    .replace('<script src="shim.js"></script>', () => '<script>' + fs.readFileSync(path.join(PUB, 'shim.js'), 'utf8') + '</script>')
    .replace('<script src="cloud.js"></script>', '').replace(/<link[^>]+>/g, '');
  const vc = new (require(path.join(NM, 'jsdom')).VirtualConsole)();     // the page's warnings about missing gauges stay quiet
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://build.local/btc-eth/', virtualConsole: vc, beforeParse(w) {
    w.fetch = async () => ({ ok: true, json: async () => snapshot });
    w.SVGElement.prototype.getComputedTextLength = function () { return (this.textContent || '').length * 7; };
  } });
  const w = dom.window;
  return new Promise((resolve) => {
    let tries = 0;
    const tick = () => {
      const st = w.__snap && w.dash && w.dash.data('tp_engine').status;
      if (st !== 'ok') { if (++tries > 100) { w.close(); return resolve({}); } return setTimeout(tick, 50); }
      const out = {};
      for (const C of Object.keys(COINS)) {
        if (!snapshot.docs[`snap/${COINS[C]}_4h-0`]) continue;
        w.__snap.setAsset(C);
        const e = w.dash.data('tp_engine');
        const s = e.status === 'ok' && e.data[0].spot_setups.find((x) => x.tf === '1D');
        out[C] = s && s.entry != null ? { lo: s.buy_lo, hi: s.buy_hi, entry: s.entry, stop: s.stop, t1: s.t1, n: s.buy_count } : null;
      }
      w.close(); resolve(out);
    };
    setTimeout(tick, 50);
  });
}

// replay one coin: plans[day] = the 1D plan shown at the end of that day, used for the 4H candles of the next day
function simulate(b4, plans, ev) {
  const B = { o: b4.map((r) => r.o), h: b4.map((r) => r.h), l: b4.map((r) => r.l), c: b4.map((r) => r.c) };
  const planFor = (i) => plans[dayOf(b4[i].t - DAY)] || null;     // yesterday's closed plan
  const evAt = {}; for (const e of ev) if (e.dir > 0) (evAt[e.conf_i] = evAt[e.conf_i] || []).push(e);
  const res = { zone: [], mss: [] };
  const run = (kind, i0, entry, stop, t1) => {               // pending limit from candle i0; returns the candle the trade ended on
    const wait = kind === 'zone' ? 6 : FILL_WAIT;
    let fill = -1;
    for (let i = i0; i < Math.min(b4.length, i0 + wait); i++) if (B.l[i] <= entry) { fill = i; break; }
    if (fill < 0) return i0;
    const px = Math.min(entry, B.o[fill]), risk = px - stop;
    if (!(risk > 0) || !(t1 > px)) return fill;
    for (let i = fill; i < Math.min(b4.length, fill + MAX_HOLD); i++) {
      const hitS = B.l[i] <= stop, hitT = i > fill && B.h[i] >= t1;   // the fill candle can stop out but not count a target
      if (hitS) { res[kind].push({ at: b4[fill].t, r: (stop - px) / risk, out: 'stop' }); return i; }
      if (hitT) { res[kind].push({ at: b4[fill].t, r: (t1 - px) / risk, out: 't1' }); return i; }
    }
    const last = Math.min(b4.length, fill + MAX_HOLD) - 1;
    if (last - fill + 1 >= MAX_HOLD) res[kind].push({ at: b4[fill].t, r: (B.c[last] - px) / risk, out: 'time' });
    return last;                                              // still open at the end of the data: not counted
  };
  let freeZ = 0, freeM = 0;
  for (let i = 0; i < b4.length; i++) {
    const p = planFor(i); if (!p || p.t1 == null) continue;
    if (i >= freeZ && i > 0 && B.l[i] <= p.entry && B.l[i - 1] > p.entry) freeZ = run('zone', i, p.entry, p.stop, p.t1) + 1;
    if (i >= freeM && evAt[i]) {
      for (const e of evAt[i]) {
        if (e.sweep > p.hi + 0.25 * e.atr) continue;          // the sweep must have reached the buy zone
        freeM = run('mss', i + 1, e.entry, e.stop, p.t1) + 1; break;
      }
    }
  }
  return res;
}

const stats = (T) => {
  const w = T.filter((x) => x.out === 't1').length, s = T.filter((x) => x.out === 'stop').length, tm = T.length - w - s;
  const sumR = T.reduce((a, x) => a + x.r, 0);
  const best = T.length ? Math.max(...T.map((x) => x.r)) : 0;   // one lucky trade can carry a small sample: shown without it too
  return { trades: T.length, t1: w, stop: s, timeout: tm, win_rate: T.length ? w / T.length : null, avg_r: T.length ? sumR / T.length : null, total_r: sumR,
    avg_r_ex_best: T.length > 1 ? (sumR - best) / (T.length - 1) : null, best_r: T.length ? best : null };
};

async function main() {
  const NM = path.resolve(process.argv[2] || 'node_modules'), MD = path.resolve(process.argv[3] || '../market-data');
  const fi = process.argv.indexOf('--from'), FROM = fi > 0 ? process.argv[fi + 1] : FROM_DEFAULT;
  const H = histories(MD);
  const pageHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(PUB, 'index.html'))).update(fs.readFileSync(path.join(PUB, 'shim.js'))).digest('hex').slice(0, 16);
  const cacheF = path.join(HIST, 'plans.json');
  let cache = fs.existsSync(cacheF) ? JSON.parse(fs.readFileSync(cacheF, 'utf8')) : null;
  if (!cache || cache.page !== pageHash) cache = { _about: 'The 1D spot plan the original page showed at the end of each UTC day (build/structure_test.js). Thrown away when the page changes.', page: pageHash, days: {} };
  const lastT = Math.min(...Object.values(H).map((x) => x.b4[x.b4.length - 1].t + H4));
  const lastDay = dayOf(lastT - DAY);                        // the newest fully closed UTC day in every coin's 4H data
  const want = [];
  for (let t = Date.parse(FROM + 'T00:00:00Z') / 1000 - DAY; dayOf(t) <= lastDay; t += DAY) if (!cache.days[dayOf(t)]) want.push(dayOf(t));
  const t0 = Date.now();
  for (const [k, D] of want.entries()) {
    cache.days[D] = await pagePlans(NM, docsAt(H, D));
    if (k % 25 === 0 || k === want.length - 1) { process.stderr.write(`plans ${k + 1}/${want.length} (${D}) ${((Date.now() - t0) / 1000).toFixed(0)}s\n`); fs.mkdirSync(HIST, { recursive: true }); fs.writeFileSync(cacheF, JSON.stringify(cache)); }
  }
  fs.mkdirSync(HIST, { recursive: true }); fs.writeFileSync(cacheF, JSON.stringify(cache));

  const from = Date.parse(FROM + 'T00:00:00Z') / 1000, summary = { _about: 'build/structure_test.js', from: FROM, to: lastDay, coins: {} };
  const all = { zone: [], mss: [] };
  for (const C of Object.keys(COINS)) {
    if (!H[C]) continue;
    const plans = {}; for (const [D, v] of Object.entries(cache.days)) if (v && v[C]) plans[D] = v[C];
    // structure is detected on the whole 4H history (it only looks back), then trades start at FROM
    const b4 = H[C].b4.filter((r) => r.t >= from - 200 * H4 && r.t + H4 <= lastT);
    const Bx = { o: b4.map((r) => r.o), h: b4.map((r) => r.h), l: b4.map((r) => r.l), c: b4.map((r) => r.c) };
    const r = simulate(b4, plans, S.detect(Bx));
    for (const k of ['zone', 'mss']) { r[k] = r[k].filter((x) => x.at >= from); all[k] = all[k].concat(r[k]); }
    summary.coins[C] = { zone: stats(r.zone), mss: stats(r.mss) };
  }
  summary.all = { zone: stats(all.zone), mss: stats(all.mss) };
  fs.writeFileSync(path.join(HIST, 'structure_test.json'), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary, null, 1));
}

if (require.main === module) main().catch((e) => { console.log('::warning::Structure test skipped: ' + (e && e.stack || e)); process.exit(0); });
module.exports = { simulate, stats, docsAt, histories };
