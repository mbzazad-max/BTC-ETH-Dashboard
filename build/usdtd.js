/* USDT.D tab (added 21 Nov 2026 at the owner's request): how USDT dominance behaves around its 20/50/100/200 SMAs on the
   daily and weekly charts, in BTC bull and bear markets (2022 bear vs 2023-25 bull vs the bear since Oct 2025).

   Data (closed candles only, from market-data):
     USDT.D daily = tv/CRYPTOCAP_USDT.D/1D (stored history, frozen 13 Nov 2026) then days made from tv/CRYPTOCAP_USDT.D/4H
                    (a UTC day counts once its 20:00 candle has closed, the same rule as build.js)
     USDT.D weekly = Monday weeks of those days; the last week is "forming" until its Sunday has closed
     BTC daily     = tv/COINBASE_BTCUSD/1D then binance/BTCUSDT/1D (same chain as build.js), for context only
   Regimes are fixed BTC cycle dates (closing prices): top 8 Nov 2021, bottom 21 Nov 2022, top 6 Oct 2025.
   The last regime runs to today until a new BTC cycle date is added to REGIMES.

   Measures (per regime, per timeframe, per SMA):
     above       share of closes above the SMA
     support     bars that came from above (previous close above) and reached the SMA (low within 1%): held = closed above
     resistance  bars that came from below and reached it (high within 1%): held = closed below
     crosses     weekly closes through the 50W / 100W / 200W, and the 20W/50W, 50W/100W, 20W/100W and 50D/200D crosses
     turning pts daily swing lows in bears / highs in bulls (10 days each side) and weekly (3 weeks), with the nearest SMA
   usage: node build/usdtd.js <market-data dir>   -> public/usdtd.json
   Any failure keeps the last good public/usdtd.json and exits 0 with a warning, so the dashboard still deploys. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'public', 'usdtd.json');
const MD = path.resolve(process.argv[2] || '../market-data');
const DAY = 86400, NS = [20, 50, 100, 200], TOL = 0.01;
const REGIMES = [
  { id: 'bull21', name: 'Bull 2020–21', kind: 'bull', from: '2020-03-12', to: '2021-11-08' },
  { id: 'bear22', name: 'Bear 2022', kind: 'bear', from: '2021-11-08', to: '2022-11-21' },
  { id: 'bull23', name: 'Bull 2023–25', kind: 'bull', from: '2022-11-21', to: '2025-10-06' },
  { id: 'bear26', name: 'Bear 2025–26 (so far)', kind: 'bear', from: '2025-10-06', to: null }
];
const ANALOG = { past: { top: '2021-11-08', bottom: '2022-11-21', label: '2022' }, now: { top: '2025-10-06', label: 'now' } };

const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const T = (d) => Date.parse(d + 'T00:00:00Z') / 1000;
const r2 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 1e4) / 1e4);
const pc = (a, b) => (a == null || b == null ? null : Math.round((a / b - 1) * 1000) / 10);

function load(id) {
  const [src, sym, tf] = id.split('/'), f = path.join(MD, 'data', src, `${sym}_${tf}.csv`);
  if (!fs.existsSync(f)) throw new Error('missing ' + id);
  const L = fs.readFileSync(f, 'utf8').trim().split('\n'); L.shift();
  return L.map((ln) => { const p = ln.split(','); return { t: +p[0], o: +p[1], h: +p[2], l: +p[3], c: +p[4] }; });
}
function groupBy(rows, keyOf) { const out = []; let cur = null; for (const r of rows) { const k = keyOf(r.t); if (!cur || cur.k !== k) { cur = { k, rs: [] }; out.push(cur); } cur.rs.push(r); } return out; }
const agg = (t, rs) => ({ t, o: rs[0].o, h: Math.max(...rs.map((r) => r.h)), l: Math.min(...rs.map((r) => r.l)), c: rs[rs.length - 1].c });
const weekStart = (t) => { const d = Math.floor(t / DAY) * DAY; return d - ((new Date(d * 1000).getUTCDay() + 6) % 7) * DAY; };
function sma(rows, n) { let s = 0; return rows.map((r, i) => { s += r.c; if (i >= n) s -= rows[i - n].c; return i >= n - 1 ? s / n : null; }); }

function build() {
  const d1 = load('tv/CRYPTOCAP_USDT.D/1D'), h4 = load('tv/CRYPTOCAP_USDT.D/4H');
  const last1 = d1[d1.length - 1].t;
  const fromH4 = groupBy(h4, (t) => Math.floor(t / DAY) * DAY).filter((g) => g.rs[g.rs.length - 1].t === g.k + 72000 && g.k > last1).map((g) => agg(g.k, g.rs));
  const D = d1.concat(fromH4);
  const btcA = load('tv/COINBASE_BTCUSD/1D'), btcB = load('binance/BTCUSDT/1D');
  const btc = new Map(btcA.concat(btcB.filter((r) => r.t > btcA[btcA.length - 1].t)).map((r) => [r.t, r.c]));
  const lastDay = D[D.length - 1].t;
  const Wall = groupBy(D, weekStart).map((g) => agg(g.k, g.rs));
  const formingWeek = Wall[Wall.length - 1].t + 7 * DAY - DAY > lastDay;     // its Sunday has not closed yet
  const W = formingWeek ? Wall.slice(0, -1) : Wall;
  for (const [X, all] of [[D, D], [Wall, Wall]]) for (const n of NS) { const s = sma(all, n); X.forEach((r, i) => { r['s' + n] = s[i]; }); }
  D.forEach((r) => { r.btc = btc.get(r.t) ?? null; });
  W.forEach((r) => { const e = r.t + 6 * DAY; r.btc = btc.get(e <= lastDay ? e : lastDay) ?? null; });

  const inR = (X, R) => X.filter((r) => r.t >= T(R.from) && (R.to == null || r.t < T(R.to)));
  // one regime x one timeframe: how the bars treated each SMA
  function behave(X) {
    const out = {};
    for (const n of NS) {
      const k = 's' + n; let above = 0, cnt = 0, cross = 0, sh = 0, sb = 0, rh = 0, rb = 0, prevSide = null;
      for (const r of X) {
        if (r[k] == null) continue;
        const side = Math.sign(r.c - r[k]); cnt++; if (side > 0) above++;
        if (prevSide != null) {
          if (side !== prevSide && side !== 0) cross++;
          if (prevSide > 0 && r.l <= r[k] * (1 + TOL)) { if (r.c >= r[k]) sh++; else sb++; }
          if (prevSide < 0 && r.h >= r[k] * (1 - TOL)) { if (r.c <= r[k]) rh++; else rb++; }
        }
        prevSide = side;
      }
      out[n] = { bars: cnt, above: cnt ? Math.round(above / cnt * 100) : null, crosses: cross, support: [sh, sh + sb], resistance: [rh, rh + rb] };
    }
    const full = X.filter((r) => r.s200 != null);
    const up = full.filter((r) => r.s20 > r.s50 && r.s50 > r.s100 && r.s100 > r.s200).length, dn = full.filter((r) => r.s20 < r.s50 && r.s50 < r.s100 && r.s100 < r.s200).length;
    out.stack = { up: full.length ? Math.round(up / full.length * 100) : null, down: full.length ? Math.round(dn / full.length * 100) : null };
    return out;
  }
  const regimes = REGIMES.map((R) => {
    const dX = inR(D, R), wX = inR(W, R), hi = dX.reduce((a, r) => (r.h > a.h ? r : a), dX[0]), lo = dX.reduce((a, r) => (r.l < a.l ? r : a), dX[0]);
    return { ...R, days: dX.length, weeks: wX.length, high: { day: day(hi.t), v: r2(hi.h) }, low: { day: day(lo.t), v: r2(lo.l) }, daily: behave(dX), weekly: behave(wX) };
  });

  // crosses since 2020: price through 50W/100W/200W, SMA vs SMA (weekly), 50D vs 200D
  const since = T('2020-01-01');
  function crossList(X, a, b) {
    const out = []; let prev = null;
    for (const r of X) {
      const A = typeof a === 'number' ? r['s' + a] : r.c, B = r['s' + b];
      if (A == null || B == null) continue;
      const s = Math.sign(A - B);
      if (prev != null && s !== 0 && s !== prev && r.t >= since) out.push({ day: day(r.t), dir: s > 0 ? 'up' : 'down', usdtd: r2(r.c), level: r2(B), btc: r.btc != null ? Math.round(r.btc) : null });
      if (s !== 0) prev = s;
    }
    return out;
  }
  const crosses = {
    price_50w: crossList(W, null, 50), price_100w: crossList(W, null, 100), price_200w: crossList(W, null, 200),
    w20_w50: crossList(W, 20, 50), w50_w100: crossList(W, 50, 100), w20_w100: crossList(W, 20, 100), d50_d200: crossList(D, 50, 200)
  };

  // turning points: swing lows in bears (USDT.D dips = BTC relief tops), swing highs in bulls (USDT.D spikes = BTC dips)
  function pivots(X, R, k) {
    const s = inR(X, R), lowK = R.kind === 'bear', col = lowK ? 'l' : 'h', out = [];
    for (let i = k; i < s.length - k; i++) {
      const w = s.slice(i - k, i + k + 1).map((r) => r[col]), v = s[i][col];
      if (v !== (lowK ? Math.min(...w) : Math.max(...w))) continue;
      const dist = {}; NS.forEach((n) => { if (s[i]['s' + n] != null) dist[n] = pc(v, s[i]['s' + n]); });
      const ks = Object.keys(dist); if (!ks.length) continue;
      const near = ks.reduce((a, b) => (Math.abs(dist[b]) < Math.abs(dist[a]) ? b : a));
      out.push({ day: day(s[i].t), v: r2(v), near: +near, near_pct: dist[near], dist, btc: s[i].btc != null ? Math.round(s[i].btc) : null });
    }
    return out;
  }
  const turning = REGIMES.filter((R) => R.id !== 'bull21').map((R) => ({ id: R.id, name: R.name, kind: R.kind, daily: pivots(D, R, 10), weekly: pivots(W, R, 3) }));

  // stretch at the big turns: % above/below each SMA on the day (daily) and vs the last closed week's SMAs (weekly)
  const stretchAt = (d) => {
    const r = D.find((x) => x.t === T(d)); if (!r) return null;
    const wk = W.filter((x) => x.t <= r.t).pop() || {};
    const o = { day: d, usdtd: r2(r.c), btc: r.btc != null ? Math.round(r.btc) : null, d: {}, w: {} };
    NS.forEach((n) => { o.d[n] = pc(r.c, r['s' + n]); o.w[n] = pc(r.c, wk['s' + n]); });
    return o;
  };
  const maxIn = (a, b) => { const s = D.filter((r) => r.t >= T(a) && (!b || r.t < T(b))); return day(s.reduce((x, r) => (r.c > x.c ? r : x), s[0]).t); };
  const peak22 = maxIn('2022-01-01', '2023-01-01'), peak26 = maxIn('2025-10-06');
  const marks = [
    ['BTC top Nov 2021', '2021-11-08'], ['USDT.D peak 2022', peak22], ['BTC bottom Nov 2022', '2022-11-21'],
    ['BTC top Oct 2025', '2025-10-06'], ['USDT.D peak since Oct 2025', peak26]
  ].map(([label, d]) => ({ label, ...stretchAt(d) })).filter((x) => x.day);

  // how the 2022 peak unwound: first daily close below each SMA after the peak, then the weekly ones
  const after = (pk) => {
    const o = {}, s = D.filter((r) => r.t > T(pk)), w = W.filter((r) => r.t > weekStart(T(pk)));
    NS.forEach((n) => { const x = s.find((r) => r['s' + n] != null && r.c < r['s' + n]); o['d' + n] = x ? day(x.t) : null; });
    NS.forEach((n) => { const x = w.find((r) => r['s' + n] != null && r.c < r['s' + n]); o['w' + n] = x ? day(x.t) : null; });
    return o;
  };

  // now
  const L = D[D.length - 1], LW = W[W.length - 1], FW = formingWeek ? Wall[Wall.length - 1] : null;
  const state = (X) => { const r = X[X.length - 1], o = {}; NS.forEach((n) => { o[n] = { sma: r2(r['s' + n]), pct: pc(r.c, r['s' + n]) }; }); return o; };
  const sinceOf = (list) => (list.length ? list[list.length - 1] : null);
  const weeksSince = (d) => Math.floor((lastDay - T(d)) / (7 * DAY));
  const now = {
    day: day(L.t), usdtd: r2(L.c), btc: L.btc != null ? Math.round(L.btc) : null,
    daily: state(D), weekly: { week: day(LW.t), close: r2(LW.c), ...state(W) },
    forming_week: FW ? { week: day(FW.t), close: r2(FW.c), sma: Object.fromEntries(NS.map((n) => [n, r2(FW['s' + n])])), pct: Object.fromEntries(NS.map((n) => [n, pc(FW.c, FW['s' + n])])) } : null,
    last: { price_50w: sinceOf(crosses.price_50w), price_100w: sinceOf(crosses.price_100w), price_200w: sinceOf(crosses.price_200w), w50_w100: sinceOf(crosses.w50_w100), d50_d200: sinceOf(crosses.d50_d200) }
  };
  const analog = {
    past: { ...ANALOG.past, peak: stretchAt(peak22), weeks_top_to_peak: Math.round((T(peak22) - T(ANALOG.past.top)) / (7 * DAY)), weeks_top_to_bottom: Math.round((T(ANALOG.past.bottom) - T(ANALOG.past.top)) / (7 * DAY)), unwind: after(peak22) },
    now: { ...ANALOG.now, weeks_since_top: weeksSince(ANALOG.now.top), peak: stretchAt(peak26), unwind: after(peak26) }
  };

  // chart series: daily from 2020, weekly from 2019 (SMAs included); compact arrays
  const ser = (X, from) => X.filter((r) => r.t >= T(from)).map((r) => [day(r.t), r2(r.c), r2(r.s20), r2(r.s50), r2(r.s100), r2(r.s200), r.btc != null ? Math.round(r.btc) : null]);
  return {
    generated: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
    source: 'USDT.D: TradingView CRYPTOCAP:USDT.D daily to ' + day(last1) + ', then days from closed 4H candles; BTC: Coinbase BTCUSD then Binance BTCUSDT (closing prices).',
    tolerance_pct: TOL * 100, regimes, crosses, turning, marks, analog, now,
    series: { cols: ['day', 'close', 's20', 's50', 's100', 's200', 'btc'], daily: ser(D, '2020-01-01'), weekly: ser(Wall, '2019-01-01'), forming_week: !!FW }
  };
}

try {
  const o = build();
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  const same = prev && JSON.stringify({ ...prev, generated: 0 }) === JSON.stringify({ ...o, generated: 0 });
  if (same) console.log('usdtd.json unchanged (' + o.now.day + ')');
  else { fs.writeFileSync(OUT, JSON.stringify(o)); console.log('usdtd.json written: ' + o.now.day + ' USDT.D ' + o.now.usdtd + ' (' + o.series.daily.length + ' days)'); }
} catch (e) {
  console.log('::warning::USDT.D tab not rebuilt, last good kept: ' + (e.stack || e));
}
