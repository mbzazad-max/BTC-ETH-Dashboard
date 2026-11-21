/* USDT.D tab (added 21 Nov 2026 at the owner's request): how USDT dominance behaves around its 20/50/100/200 SMAs on the
   daily and weekly charts, in BTC bull and bear markets (2022 bear vs 2023-25 bull vs the bear since Oct 2025).

   Data (closed candles only, from market-data):
     USDT.D daily = tv/CRYPTOCAP_USDT.D/1D (stored history, frozen 13 Nov 2026) then days made from tv/CRYPTOCAP_USDT.D/4H
                    (a UTC day counts once its 20:00 candle has closed, the same rule as build.js)
     USDT.D weekly = Monday weeks of those days; the last week is "forming" until its Sunday has closed
     BTC daily     = tv/COINBASE_BTCUSD/1D then binance/BTCUSDT/1D (same chain as build.js), for context only
   Regimes are fixed BTC cycle dates (closing prices): 2017 bull from 1 Mar 2017, top 16 Dec 2017, 2019 rally to 26 Jun 2019, bottom 15 Dec 2018, top 8 Nov 2021, bottom 21 Nov 2022, top 6 Oct 2025.
   USDT.D history starts 8 Mar 2015; the 100W exists from Feb 2017 and the 200W from Jan 2019, so tests start in Jun 2017.
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
const LAUNCH = 'USDT launch years: USDT supply grew many times over, which pushed USDT.D up whatever crypto prices did (USDT.D never closed a week below its 100W from 2017 to Dec 2020).';
const REGIMES = [
  { id: 'bull17', name: 'Bull 2017', kind: 'bull', from: '2017-03-01', to: '2017-12-16', caveat: LAUNCH },
  { id: 'bear18', name: 'Bear 2018', kind: 'bear', from: '2017-12-16', to: '2018-12-15', caveat: LAUNCH + ' The bear pattern still showed (above the 100W every week, peak on the day BTC bottomed), but 2018 stretch figures run high.' },
  { id: 'rally19', name: 'Rally 2019', kind: 'bull', from: '2018-12-15', to: '2019-06-26', caveat: LAUNCH },
  { id: 'bull21', name: 'Bull 2020–21', kind: 'bull', from: '2020-03-12', to: '2021-11-08' },
  { id: 'bear22', name: 'Bear 2022', kind: 'bear', from: '2021-11-08', to: '2022-11-21' },
  { id: 'bull23', name: 'Bull 2023–25', kind: 'bull', from: '2022-11-21', to: '2025-10-06' },
  { id: 'bear26', name: 'Bear 2025–26 (so far)', kind: 'bear', from: '2025-10-06', to: null }
];
// past bears for the "past bears vs now" comparison (BTC closes): 2018 (USDT launch years, see the caveat) and 2022
const PASTS = [{ top: '2017-12-16', bottom: '2018-12-15', label: '2018' }, { top: '2021-11-08', bottom: '2022-11-21', label: '2022' }];
const ANALOG = { past: PASTS[1], now: { top: '2025-10-06', label: 'now' } };

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
  const since = T('2017-01-01');
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
  const turning = REGIMES.filter((R) => ['bear18', 'bear22', 'bull23', 'bear26'].includes(R.id)).map((R) => ({ id: R.id, name: R.name, kind: R.kind, daily: pivots(D, R, 10), weekly: pivots(W, R, 3) }));

  // stretch at the big turns: % above/below each SMA on the day (daily) and vs the last closed week's SMAs (weekly)
  const stretchAt = (d) => {
    const r = D.find((x) => x.t === T(d)); if (!r) return null;
    const wk = W.filter((x) => x.t <= r.t).pop() || {};
    const o = { day: d, usdtd: r2(r.c), btc: r.btc != null ? Math.round(r.btc) : null, d: {}, w: {} };
    NS.forEach((n) => { o.d[n] = pc(r.c, r['s' + n]); o.w[n] = pc(r.c, wk['s' + n]); });
    return o;
  };
  const maxIn = (a, b) => { const s = D.filter((r) => r.t >= T(a) && (!b || r.t < T(b))); return day(s.reduce((x, r) => (r.c > x.c ? r : x), s[0]).t); };
  const peak22 = maxIn('2022-01-01', '2023-01-01'), peak26 = maxIn('2025-10-06'), peak18 = maxIn('2017-12-16', '2019-01-15');
  const marks = [
    ['BTC top Dec 2017', '2017-12-16'], ['USDT.D peak 2018 (BTC bottom)', peak18],
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
  const pastOf = (P) => { const pk = maxIn(P.top, day(T(P.bottom) + 30 * DAY)); return { ...P, peak: stretchAt(pk), weeks_top_to_peak: Math.round((T(pk) - T(P.top)) / (7 * DAY)), weeks_top_to_bottom: Math.round((T(P.bottom) - T(P.top)) / (7 * DAY)), days_peak_to_bottom: Math.round((T(P.bottom) - T(pk)) / DAY), unwind: after(pk) }; };
  const analog = {
    pasts: PASTS.map(pastOf),
    past: { ...ANALOG.past, peak: stretchAt(peak22), weeks_top_to_peak: Math.round((T(peak22) - T(ANALOG.past.top)) / (7 * DAY)), weeks_top_to_bottom: Math.round((T(ANALOG.past.bottom) - T(ANALOG.past.top)) / (7 * DAY)), unwind: after(peak22) },
    now: { ...ANALOG.now, weeks_since_top: weeksSince(ANALOG.now.top), peak: stretchAt(peak26), unwind: after(peak26) }
  };

  // ---------- this week's read: fixed rules from the 2022 bear and the 2023-25 bull ----------
  //   Bull                 weekly close below the 100W (2023-25: under it the whole bull)
  //   Turning bull         weekly close below the 50W, still above the 100W (2022 bear: never closed a week below the 50W)
  //   Bear, possibly ending  above the 50W, but turned back near the prior peaks (20-day high within 2% of the lower peak,
  //                        last close 5%+ under that high) AND a daily close below the 20D or 50D (how the 2022 peak unwound)
  //   Bear                 above the 50W and 100W with the 50W above the 100W
  //   Turning bear         above the 100W but the 50W still under the 100W (the bear setup not confirmed yet)
  const PEAKS = [analog.past.peak, analog.now.peak].filter(Boolean).map((p) => p.usdtd);
  function readAt(di, wi) {
    const d = D[di], w = W[wi], last20 = D.slice(Math.max(0, di - 19), di + 1), hi20 = Math.max(...last20.map((r) => r.c));
    const zone = Math.min(...PEAKS);
    const ck = {
      w100: { ok: w.c > w.s100, label: 'Weekly close above the 100W', v: r2(w.s100) },
      w50_100: { ok: w.s50 > w.s100, label: '50W above the 100W', v: r2(w.s50) },
      w50: { ok: w.c > w.s50, label: 'Weekly close above the 50W', v: r2(w.s50) },
      w20: { ok: w.c > w.s20, label: 'Weekly close above the 20W', v: r2(w.s20) },
      d20: { ok: d.c > d.s20, label: 'Daily close above the 20D', v: r2(d.s20) },
      d50: { ok: d.c > d.s50, label: 'Daily close above the 50D', v: r2(d.s50) },
      reject: { ok: hi20 >= zone * 0.98 && d.c <= hi20 * 0.95, label: `Turned back near the prior peaks (20-day high ${hi20.toFixed(2)} vs ${zone.toFixed(2)}+, now 5%+ below it)`, v: r2(hi20) }
    };
    let verdict, why;
    if (!ck.w100.ok) { verdict = 'Bull'; why = 'USDT.D closed the week below its 100W: the 2023–25 bull pattern.'; }
    else if (!ck.w50.ok) { verdict = 'Turning bull'; why = 'Weekly close below the 50W while still above the 100W. In the 2022 bear USDT.D never closed a week below the 50W; it did in Jan 2023, two months after BTC bottomed. (Aug–Oct 2026 also did this during a relief rally, then went back above.)'; }
    else if (ck.reject.ok && (!ck.d20.ok || !ck.d50.ok)) { verdict = 'Bear, possibly ending'; why = 'Turned back near the prior peaks and lost the ' + (!ck.d50.ok ? '50D' : '20D') + ': how the 2022 peak started to unwind (BTC bottomed within days). Needs weekly closes below the 20W/50W to confirm.'; }
    else if (ck.w50_100.ok) { verdict = 'Bear'; why = 'Above the 50W and 100W with the 50W over the 100W: the 2022 bear pattern. Money is still moving into USDT.'; }
    else { verdict = 'Turning bear'; why = 'Above the 100W but the 50W is still under the 100W: the bear setup is not confirmed yet.'; }
    return { day: day(d.t), week: day(w.t), usdtd: r2(d.c), week_close: r2(w.c), verdict, why, checks: ck };
  }
  const weekRead = readAt(D.length - 1, W.length - 1);
  // previous weeks: the read at each of the last 8 closed weeks (daily state = that week's Sunday)
  // every closed week since Jun 2017: the last 8 for the strip, and each change of verdict for the "past record" list
  const all = [];
  for (let k = 0; k < W.length; k++) {
    if (W[k].t < T('2017-06-01') || W[k].s100 == null) continue;
    const sun = W[k].t + 6 * DAY, di = D.findIndex((r) => r.t === sun);
    if (di >= 0) { const r = readAt(di, k); all.push({ week: r.week, close: r.week_close, verdict: r.verdict, btc: D[di].btc != null ? Math.round(D[di].btc) : null }); }
  }
  const history = all.slice(-8), record = all.filter((x, i) => i === 0 || x.verdict !== all[i - 1].verdict);
  const prevR = W.length > 1 ? (() => { const sun = W[W.length - 2].t + 6 * DAY, di = D.findIndex((r) => r.t === sun); return di >= 0 ? readAt(di, W.length - 2) : null; })() : null;
  weekRead.changed = prevR ? Object.keys(weekRead.checks).filter((k) => weekRead.checks[k].ok !== prevR.checks[k].ok).map((k) => (weekRead.checks[k].ok ? 'now: ' : 'no longer: ') + weekRead.checks[k].label) : [];
  weekRead.prev_verdict = prevR ? prevR.verdict : null;
  weekRead.history = history;
  weekRead.record = record;

  // ---------- top watch / bottom watch (owner, 21 Nov 2026) ----------
  // An "extreme" = a daily close at a 90-day high (top watch) or low (bottom watch). After each one, six signs are tracked in
  // the order they usually fire. Past record (since Jun 2017, each sign counted once per extreme, within 120 days of it):
  //   moved  = USDT.D moved 20%+ the other way from the extreme within 180 days (top: fell = crypto relief rally)
  //   stayed = no close beyond the extreme in the 120 days after the sign (the extreme really was THE top / bottom)
  // (Since Jun 2017, the first full year with a 100W.) Weekly RSI(14) divergence: the extreme's week vs the strongest week 8-52 weeks earlier (the clue that marked Nov 2022).
  const rsiOf = (rows) => { let up = 0, dn = 0; return rows.map((r, i) => { if (i === 0) return null; const ch = r.c - rows[i - 1].c, a = 1 / 14; up = up * (1 - a) + Math.max(ch, 0) * a; dn = dn * (1 - a) + Math.max(-ch, 0) * a; return i < 14 ? null : (dn === 0 ? 100 : 100 - 100 / (1 + up / dn)); }); };
  const wr = rsiOf(Wall); Wall.forEach((r, i) => { r.rsi = wr[i]; });
  const wkBySun = new Map(W.map((w) => [w.t + 6 * DAY, w]));
  const hi90 = D.map((r, i) => (i >= 89 ? Math.max(...D.slice(i - 89, i + 1).map((x) => x.c)) : null));
  const lo90 = D.map((r, i) => (i >= 89 ? Math.min(...D.slice(i - 89, i + 1).map((x) => x.c)) : null));
  function watch(top) {
    const s = top ? -1 : 1;                                   // top watch: signs are closes BELOW; bottom watch: ABOVE
    const beyond = (a, b) => (top ? a > b : a < b);
    const wk = (i, n) => { const w = wkBySun.get(D[i].t); return w && w['s' + n] != null && s * (w.c - w['s' + n]) > 0; };
    const STEPS = [
      { id: 'd20', label: `Daily close ${top ? 'below' : 'above'} the 20D`, f: (i) => s * (D[i].c - D[i].s20) > 0, lvl: () => L.s20 },
      { id: 'd50', label: `Daily close ${top ? 'below' : 'above'} the 50D`, f: (i) => s * (D[i].c - D[i].s50) > 0, lvl: () => L.s50 },
      { id: 'x2050', label: `20D crosses ${top ? 'under' : 'over'} the 50D`, f: (i) => s * (D[i].s20 - D[i].s50) > 0, lvl: () => null },
      { id: 'w20', label: `Weekly close ${top ? 'below' : 'above'} the 20W`, f: (i) => wk(i, 20), lvl: () => LW.s20 },
      { id: 'd200', label: `Daily close ${top ? 'below' : 'above'} the 200D`, f: (i) => s * (D[i].c - D[i].s200) > 0, lvl: () => L.s200 },
      { id: 'w50', label: `Weekly close ${top ? 'below' : 'above'} the 50W`, f: (i) => wk(i, 50), lvl: () => LW.s50 }
    ];
    const isExt = (i) => (top ? hi90[i] != null && D[i].c >= hi90[i] : lo90[i] != null && D[i].c <= lo90[i]);
    const i0 = D.findIndex((r) => r.t >= T('2017-06-01'));
    const record = STEPS.map((st) => {
      let h = null, armed = false; const out = [];
      for (let i = i0; i < D.length - 121; i++) {
        if (isExt(i)) { h = i; armed = true; continue; }
        if (!armed || i - h > 120 || D[i].s200 == null || !st.f(i)) continue;
        armed = false;
        const stayed = !D.slice(i + 1, i + 121).some((r) => beyond(r.c, D[h].c));
        const after = D.slice(h, h + 181).map((r) => r.c), moved = top ? Math.min(...after) <= D[h].c * 0.8 : Math.max(...after) >= D[h].c * 1.2;
        out.push({ stayed, moved, days: i - h, btc: D[i].btc && D[h].btc ? (D[i].btc / D[h].btc - 1) * 100 : null });
      }
      const n = out.length, days = out.map((x) => x.days).sort((a, b) => a - b), bm = out.map((x) => x.btc).filter((v) => v != null).sort((a, b) => a - b);
      return { id: st.id, n, btc_typ: bm.length ? Math.round(bm[Math.floor(bm.length / 2)] * 10) / 10 : null, moved: n ? Math.round(out.filter((x) => x.moved).length / n * 100) : null, stayed: n ? Math.round(out.filter((x) => x.stayed).length / n * 100) : null, days: n ? days[Math.floor(n / 2)] : null };
    });
    // current episode: the latest extreme and which signs have fired since
    let h = -1; for (let i = D.length - 1; i >= 0; i--) if (isExt(i)) { h = i; break; }
    const steps = STEPS.map((st, k) => {
      let fired = null, btcAt = null; for (let i = h + 1; i < D.length; i++) if (st.f(i)) { fired = day(D[i].t); btcAt = D[i].btc != null ? Math.round(D[i].btc) : null; break; }
      const btcChg = btcAt != null && D[h].btc ? pc(btcAt, D[h].btc) : null;
      const weekly = st.id[0] === 'w', n = +st.id.slice(1);
      const onNow = weekly ? s * (LW.c - LW['s' + n]) > 0 : st.f(D.length - 1);   // weekly signs: the last closed week
      return { id: st.id, label: st.label, level: r2(st.lvl()), on_now: !!onNow, fired, btc: btcAt, btc_chg: btcChg, ...record[k] };
    });
    // weekly RSI divergence: the week of the extreme (or the forming week when the extreme is in it) vs the strongest prior week
    const wIdx = Wall.findIndex((w) => w.t === weekStart(D[h].t)), cur = Wall[wIdx];
    const win = Wall.slice(Math.max(0, wIdx - 52), Math.max(0, wIdx - 8)).filter((w) => w.rsi != null);
    const prev = win.length ? win.reduce((a, w) => (top ? (w.c > a.c ? w : a) : (w.c < a.c ? w : a))) : null;
    let div = null;
    if (prev && cur && cur.rsi != null) {
      const near = top ? cur.c >= prev.c * 0.97 : cur.c <= prev.c * 1.03;
      const weaker = top ? cur.rsi < prev.rsi - 2 : cur.rsi > prev.rsi + 2;
      div = { prev_week: day(prev.t), prev_close: r2(prev.c), prev_rsi: Math.round(prev.rsi * 10) / 10, week: day(cur.t), close: r2(cur.c), rsi: Math.round(cur.rsi * 10) / 10,
        forming: formingWeek && cur === Wall[Wall.length - 1], near, divergence: near && weaker };
    }
    const fired = steps.filter((x) => x.fired).length;
    const fw = steps.find((x) => x.id === 'w50').fired, f20w = steps.find((x) => x.id === 'w20').fired, fd = steps.filter((x) => x.fired && x.id[0] === 'd').length;
    const status = top
      ? (fw && steps.find((x) => x.id === 'w50').on_now ? 'Top likely in: weekly close below the 50W and still under it' : f20w ? 'Pullback confirmed on the weekly (below the 20W): relief rally for crypto; not yet proof the bear is over' : fd ? 'Early warning: USDT.D has started to turn down (crypto relief likely); many of these fail' : div && div.divergence ? 'Top setup: near the prior peak on weaker weekly momentum (like Nov 2022); no break yet' : 'No top signs yet: USDT.D still rising')
      : (fw && steps.find((x) => x.id === 'w50').on_now ? 'Bottom likely in: weekly close above the 50W and still over it (crypto top warning)' : f20w ? 'USDT.D bounce confirmed on the weekly (above the 20W): crypto pullback' : fd ? 'Early warning: USDT.D has started to turn up (crypto dip likely); many of these fail' : div && div.divergence ? 'Bottom setup: near the prior low on stronger weekly momentum; no break yet' : 'No bottom signs yet: USDT.D still falling');
    const btcNow = L.btc != null ? Math.round(L.btc) : null;
    return { kind: top ? 'top' : 'bottom', btc_now: btcNow, btc_now_chg: btcNow != null && D[h].btc ? pc(btcNow, D[h].btc) : null, extreme: { day: day(D[h].t), v: r2(D[h].c), btc: D[h].btc != null ? Math.round(D[h].btc) : null, days_ago: D.length - 1 - h }, steps, fired, divergence: div, status };
  }
  const topWatch = watch(true), bottomWatch = watch(false);

  // ---------- early warning (fast daily layer, owner 21 Nov 2026) ----------
  // Extreme = a daily close at a 30-day high (top) or low (bottom). Signs, each counted once per extreme within 30 days:
  //   div    RSI(14) divergence AT the extreme: the strongest (top) / weakest (bottom) 30-day extreme 5-40 days earlier had an
  //          RSI at least 3 points stronger (top) / weaker (bottom); fires on the extreme's own day (a setup, not a trigger)
  //   div10  divergence, then a daily close beyond the 10D (below for top, above for bottom)
  //   rev    key reversal: a close beyond the extreme day's low (top) / high (bottom)
  //   d10    a daily close beyond the 10D
  //   swing  a close beyond the lowest (top) / highest (bottom) close of the 7 days before the extreme
  //   d20    a daily close beyond the 20D
  // Past record since Jun 2017: moved = USDT.D moved 10%+ the other way within 60 days; held = no close beyond the extreme in
  // the 60 days after the sign; lag = days after the extreme; btc_by = BTC's move from the extreme to the sign; btc30 = BTC's
  // move in the 30 days after the sign (median) and how often it was up. Base = every 30-day extreme, for comparison.
  const dr = rsiOf(D); D.forEach((r, i) => { r.rsi = dr[i]; });
  const s10 = sma(D, 10); D.forEach((r, i) => { r.s10 = s10[i]; });
  const med = (a) => { const s = a.filter((v) => v != null && isFinite(v)).sort((x, y) => x - y); return s.length ? Math.round(s[Math.floor(s.length / 2)] * 10) / 10 : null; };
  function fast(top) {
    const sg = top ? 1 : -1, N = 30;
    const isExt = D.map((r, i) => i >= N - 1 && (top ? r.c >= Math.max(...D.slice(i - N + 1, i + 1).map((x) => x.c)) : r.c <= Math.min(...D.slice(i - N + 1, i + 1).map((x) => x.c))));
    const EXT = []; isExt.forEach((v, i) => { if (v) EXT.push(i); });
    const divAt = (h) => {
      const prev = EXT.filter((j) => j >= h - 40 && j <= h - 5 && D[j].rsi != null);
      if (!prev.length || D[h].rsi == null) return null;
      const j = prev.reduce((a, x) => (sg * D[x].rsi > sg * D[a].rsi ? x : a));
      return { prev_day: day(D[j].t), prev_rsi: Math.round(D[j].rsi * 10) / 10, rsi: Math.round(D[h].rsi * 10) / 10, divergence: sg * (D[j].rsi - D[h].rsi) >= 3 };
    };
    const beyond10 = (i) => D[i].s10 != null && sg * (D[i].s10 - D[i].c) > 0;
    const SIGNS = [
      { id: 'div', label: `RSI divergence at the ${top ? 'high' : 'low'} (setup)`, at: true },
      { id: 'div10', label: `Divergence, then a close ${top ? 'below' : 'above'} the 10D`, f: (i, h, dv) => dv && beyond10(i), lvl: () => L.s10 },
      { id: 'rev', label: `Key reversal: close ${top ? "below the high day's low" : "above the low day's high"}`, f: (i, h) => (top ? D[i].c < D[h].l : D[i].c > D[h].h), lvl: (h) => (top ? D[h].l : D[h].h) },
      { id: 'd10', label: `Daily close ${top ? 'below' : 'above'} the 10D`, f: (i) => beyond10(i), lvl: () => L.s10 },
      { id: 'swing', label: `Swing break: close ${top ? 'below' : 'above'} the 7-day ${top ? 'low' : 'high'} before it`, f: (i, h) => { const w = D.slice(Math.max(0, h - 7), h).map((r) => r.c); return top ? D[i].c < Math.min(...w) : D[i].c > Math.max(...w); }, lvl: (h) => { const w = D.slice(Math.max(0, h - 7), h).map((r) => r.c); return top ? Math.min(...w) : Math.max(...w); } },
      { id: 'd20', label: `Daily close ${top ? 'below' : 'above'} the 20D`, f: (i) => D[i].s20 != null && sg * (D[i].s20 - D[i].c) > 0, lvl: () => L.s20 }
    ];
    const i0 = D.findIndex((r) => r.t >= T('2017-06-01'));
    const outcome = (i, h) => {
      const fut = D.slice(i + 1, i + 61).map((r) => r.c);
      const b0 = D[h].btc, bi = D[i].btc, b30 = D[i + 30] && D[i + 30].btc;
      return { moved: top ? Math.min(...fut) <= D[h].c * 0.9 : Math.max(...fut) >= D[h].c * 1.1, held: !fut.some((v) => (top ? v > D[h].c : v < D[h].c)), lag: i - h,
        by: b0 && bi ? (bi / b0 - 1) * 100 : null, f30: bi && b30 ? (b30 / bi - 1) * 100 : null };
    };
    const summ = (out) => { const n = out.length; return n ? { n, moved: Math.round(out.filter((x) => x.moved).length / n * 100), held: Math.round(out.filter((x) => x.held).length / n * 100), lag: med(out.map((x) => x.lag)), btc_by: med(out.map((x) => x.by)), btc30: med(out.map((x) => x.f30)), btc30_up: Math.round(out.filter((x) => x.f30 != null && x.f30 > 0).length / Math.max(1, out.filter((x) => x.f30 != null).length) * 100) } : { n: 0 }; };
    const record = {}, base = [];
    for (const S of SIGNS) {
      const out = []; let h = null, armed = false, dv = false;
      for (let i = i0; i < D.length - 61; i++) {
        let fire = false;
        if (isExt[i]) { h = i; armed = true; const d = divAt(i); dv = !!(d && d.divergence); if (S.id === 'div' && dv) fire = true; else if (S.id === 'base') fire = true; else continue; }
        else { if (!armed || i - h > 30 || S.at) continue; fire = S.f(i, h, dv); }
        if (!fire) continue;
        armed = false; out.push(outcome(i, h));
      }
      record[S.id] = summ(out);
    }
    for (let i = i0; i < D.length - 61; i++) if (isExt[i]) base.push(outcome(i, i));
    // current episode
    let h = -1; for (let i = D.length - 1; i >= 0; i--) if (isExt[i]) { h = i; break; }
    const dvNow = divAt(h), dvOn = !!(dvNow && dvNow.divergence);
    const signs = SIGNS.map((S) => {
      let fired = null, bt = null;
      if (S.at) { if (dvOn) { fired = day(D[h].t); bt = D[h].btc; } }
      else for (let i = h + 1; i < D.length && i - h <= 30; i++) if (S.f(i, h, dvOn)) { fired = day(D[i].t); bt = D[i].btc; break; }
      return { id: S.id, label: S.label, level: S.lvl ? r2(S.lvl(h)) : null, fired, btc: bt != null ? Math.round(bt) : null, btc_chg: bt != null && D[h].btc ? pc(bt, D[h].btc) : null, ...record[S.id] };
    });
    const F = (id) => signs.find((x) => x.id === id).fired, expired = D.length - 1 - h > 30;
    const status = expired ? `No new 30-day ${top ? 'high' : 'low'} for ${D.length - 1 - h} days: the signs below are from the ${day(D[h].t)} ${top ? 'high' : 'low'} and are no longer live`
      : top ? (F('swing') ? 'Swing break: short-term USDT.D top confirmed (crypto bounce under way)' : F('div10') ? 'Best early sign: divergence + close below the 10D (crypto bounce likely)' : (F('rev') || F('d10') || F('d20')) ? 'Early warning: USDT.D turning down (crypto bounce possible; many of these fail)' : dvOn ? `Setup: new high on weaker RSI; a close below the 10D (${f2s(L.s10)}) would trigger the best early sign` : 'No early signs: USDT.D momentum still rising')
        : (F('swing') ? 'Swing break: short-term USDT.D bottom confirmed (crypto pullback under way)' : F('div10') ? 'Divergence + close above the 10D (crypto pullback possible)' : (F('rev') || F('d10') || F('d20')) ? 'Early warning: USDT.D turning up (crypto pullback possible; many of these fail)' : dvOn ? `Setup: new low on stronger RSI; a close above the 10D (${f2s(L.s10)}) would trigger` : 'No early signs: USDT.D still falling');
    return { kind: top ? 'top' : 'bottom', extreme: { day: day(D[h].t), v: r2(D[h].c), btc: D[h].btc != null ? Math.round(D[h].btc) : null, days_ago: D.length - 1 - h }, expired,
      rsi_now: D[D.length - 1].rsi != null ? Math.round(D[D.length - 1].rsi * 10) / 10 : null, divergence: dvNow, signs, base: summ(base), status };
  }
  const f2s = (v) => (v == null ? '—' : v.toFixed(2));
  const topFast = fast(true), bottomFast = fast(false);
  topWatch.fast = topFast; bottomWatch.fast = bottomFast;

  // chart series: daily from 2020, weekly from 2019 (SMAs included); compact arrays
  const ser = (X, from) => X.filter((r) => r.t >= T(from)).map((r) => [day(r.t), r2(r.c), r2(r.s20), r2(r.s50), r2(r.s100), r2(r.s200), r.btc != null ? Math.round(r.btc) : null]);
  return {
    generated: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
    source: 'USDT.D: TradingView CRYPTOCAP:USDT.D daily to ' + day(last1) + ', then days from closed 4H candles; BTC: Coinbase BTCUSD then Binance BTCUSDT (closing prices).',
    tolerance_pct: TOL * 100, read: weekRead, top_watch: topWatch, bottom_watch: bottomWatch, regimes, crosses, turning, marks, analog, now,
    series: { cols: ['day', 'close', 's20', 's50', 's100', 's200', 'btc'], daily: ser(D, '2017-01-01'), weekly: ser(Wall, '2016-01-01'), forming_week: !!FW }
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
