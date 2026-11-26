/* S&P 500 -> BTC outlook (owner, 26 Nov 2026): "a statement at the beginning: what BTC can do next based on the S&P position",
   and an early sign that BTC is about to drop. Called by build/usdtd.js --asset=spx with the S&P daily rows (closes and SMAs) and
   BTC's daily closes; returns the btc_link block of public/spxcycle.json. Past behaviour only, never a forecast.

   Since 1 Sep 2015 (BTC context from Dec 2014, S&P 200D from 2011), on every S&P trading day:
     state      Up = close above the 50D and the 200D; Pullback = at/below the 50D but above the 200D; Risk-off = at/below the 200D
     drawdown   close vs the highest close of the last 250 trading days (about a year)
     corr60     correlation of daily % moves over the last 60 S&P trading days (BTC measured over the same UTC days)
     BTC next   BTC's % move over the next 7 and 30 calendar days from the UTC day of that S&P close; drop10 = BTC fell 10%+ below
                that close at some point within the 30 days
   Early signs (events), each counted once and re-armed only after the opposite condition:
     x50   first S&P close below its 50D after 5+ closes above        dd5   S&P closes 5%+ below its 20-day closing high
     x200  first S&P close below its 200D after 10+ closes above      big   an S&P day of -2% or worse (10-day cooldown)
     rc50  first S&P close back above its 50D after 5+ below (the all-clear side)
   Medians, not averages. Small samples (under 10) are flagged. */
'use strict';
module.exports = function spxLink(D, btcAll, { day, T, DAY }) {
  const bt = new Map(btcAll.map((r) => [r.t, r.c]));
  const fwd = (t, k) => { const a = bt.get(t), b = bt.get(t + k * DAY); return a && b ? b / a - 1 : null; };
  const low30 = (t) => { const a = bt.get(t); if (!a) return null; let m = Infinity; for (let j = 1; j <= 30; j++) { const v = bt.get(t + j * DAY); if (v == null) return null; m = Math.min(m, v); } return m / a - 1; };
  const med = (a) => { const s = a.filter((v) => v != null && isFinite(v)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const p1 = (v) => (v == null ? null : Math.round(v * 1000) / 10);
  const i0 = D.findIndex((r) => r.t >= T('2015-09-01'));
  const n = D.length, L = D[n - 1];

  // daily % moves and the rolling 60-day correlation
  const rs = D.map((r, i) => (i ? r.c / D[i - 1].c - 1 : null));
  const rb = D.map((r, i) => { if (!i) return null; const a = bt.get(D[i - 1].t), b = bt.get(r.t); return a && b ? b / a - 1 : null; });
  const corr = (i, N, lag) => {
    const xs = [], ys = [];
    for (let k = i - N + 1; k <= i; k++) { const x = rs[k - (lag || 0)], y = rb[k]; if (k - (lag || 0) < 1 || x == null || y == null) continue; xs.push(x); ys.push(y); }
    if (xs.length < N * 0.8) return null;
    const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    let sxy = 0, sxx = 0, syy = 0; xs.forEach((x, j) => { sxy += (x - mx) * (ys[j] - my); sxx += (x - mx) ** 2; syy += (ys[j] - my) ** 2; });
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  };
  const c60 = D.map((r, i) => (i >= i0 ? corr(i, 60) : null));
  const hist60 = c60.filter((v) => v != null).sort((a, b) => a - b);
  const pctile = (v) => (v == null || !hist60.length ? null : Math.round(hist60.filter((x) => x <= v).length / hist60.length * 100));

  // states, drawdown and BTC's next moves on every day
  const hi250 = D.map((r, i) => Math.max(...D.slice(Math.max(0, i - 249), i + 1).map((x) => x.c)));
  const stateOf = (r) => (r.s50 == null || r.s200 == null ? null : r.c > r.s50 && r.c > r.s200 ? 'up' : r.c > r.s200 ? 'pullback' : 'riskoff');
  const ddOf = (i) => D[i].c / hi250[i] - 1;
  const ddBucket = (v) => (v > -0.05 ? 'near' : v > -0.10 ? 'dip' : v > -0.20 ? 'corr' : 'bear');
  const rows = [];
  for (let i = i0; i < n; i++) {
    const r = D[i], s = stateOf(r); if (!s) continue;
    rows.push({ i, s, dd: ddBucket(ddOf(i)), hc: c60[i] != null && c60[i] >= 0.3, f7: fwd(r.t, 7), f30: fwd(r.t, 30), lo: low30(r.t) });
  }
  const stats = (list) => {
    const done = list.filter((x) => x.f30 != null && x.lo != null);
    const k = done.length;
    return { n: k, few: k < 10, btc7: p1(med(done.map((x) => x.f7))), btc30: p1(med(done.map((x) => x.f30))),
      up30: k ? Math.round(done.filter((x) => x.f30 > 0).length / k * 100) : null,
      drop10: k ? Math.round(done.filter((x) => x.lo <= -0.10).length / k * 100) : null,
      low30: p1(med(done.map((x) => x.lo))) };
  };
  const base = stats(rows);
  const STATE = { up: 'Up (above the 50D and 200D)', pullback: 'Pullback (below the 50D, above the 200D)', riskoff: 'Risk-off (below the 200D)' };
  const DD = { near: 'Within 5% of its 1-year high', dip: '5–10% below its 1-year high', corr: '10–20% below (correction)', bear: '20%+ below (bear market)' };
  const sNow = stateOf(L), ddNow = ddOf(n - 1), bNow = ddBucket(ddNow), cNow = c60[n - 1], hcNow = cNow != null && cNow >= 0.3;
  const byState = Object.keys(STATE).map((k) => ({ id: k, label: STATE[k], now: k === sNow, ...stats(rows.filter((x) => x.s === k)),
    hi_corr: stats(rows.filter((x) => x.s === k && x.hc)), lo_corr: stats(rows.filter((x) => x.s === k && !x.hc)) }));
  const byDD = Object.keys(DD).map((k) => ({ id: k, label: DD[k], now: k === bNow, ...stats(rows.filter((x) => x.dd === k)) }));

  // early signs (events)
  const EV = [
    { id: 'x50', label: 'S&P closes below its 50D (first close after 5+ above)', bad: true },
    { id: 'dd5', label: 'S&P closes 5%+ below its 20-day closing high', bad: true },
    { id: 'big', label: 'S&P falls 2% or more in one day', bad: true },
    { id: 'x200', label: 'S&P closes below its 200D (first close after 10+ above)', bad: true },
    { id: 'rc50', label: 'S&P closes back above its 50D (first close after 5+ below)', bad: false }
  ];
  const hits = Object.fromEntries(EV.map((e) => [e.id, []]));
  let above50 = 0, below50 = 0, above200 = 0, armedDD = true, lastBig = -99;
  for (let i = Math.max(1, i0 - 260); i < n; i++) {
    const r = D[i]; if (r.s50 == null || r.s200 == null) continue;
    const hi20 = Math.max(...D.slice(Math.max(0, i - 19), i + 1).map((x) => x.c));
    const fire = (id) => { if (i >= i0) hits[id].push(i); };
    if (r.c <= r.s50) { if (above50 >= 5) fire('x50'); above50 = 0; below50++; } else { if (below50 >= 5) fire('rc50'); below50 = 0; above50++; }
    if (r.c <= r.s200) { if (above200 >= 10) fire('x200'); above200 = 0; } else above200++;
    if (r.c >= hi20) armedDD = true; else if (armedDD && r.c <= hi20 * 0.95) { fire('dd5'); armedDD = false; }
    if (rs[i] != null && rs[i] <= -0.02 && i - lastBig >= 10) { fire('big'); lastBig = i; }
  }
  const evOut = EV.map((e) => {
    const list = hits[e.id], st = stats(list.map((i) => ({ f7: fwd(D[i].t, 7), f30: fwd(D[i].t, 30), lo: low30(D[i].t) })));
    const last = list.length ? list[list.length - 1] : null, ago = last == null ? null : n - 1 - last;
    const b0 = last != null ? bt.get(D[last].t) : null, bL = bt.get(L.t) || btcAll[btcAll.length - 1].c;
    return { ...e, ...st, last: last != null ? day(D[last].t) : null, ago, live: ago != null && ago <= 20, btc_then: b0 ? Math.round(b0) : null, btc_since: b0 && bL ? p1(bL / b0 - 1) : null };
  });

  // the read and the statement
  const cur = byState.find((x) => x.now), curDD = byDD.find((x) => x.now), curC = hcNow ? cur.hi_corr : cur.lo_corr;
  const pick = curC && curC.n >= 30 ? curC : cur;
  const d30 = pick.btc30 - base.btc30, dUp = pick.up30 - base.up30, dDrop = pick.drop10 - base.drop10;
  const bias = d30 <= -2 || dUp <= -6 || dDrop >= 8 ? 'Headwind' : d30 >= 2 || dUp >= 6 ? 'Tailwind' : 'Neutral';
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dd = (t) => { const d = new Date(t * 1000); return d.getUTCDate() + ' ' + MO[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
  const pct = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%');
  const lv = (v) => Math.round(v).toLocaleString('en-US');
  const gap = (v) => pct((L.c / v - 1) * 100);
  const live = evOut.filter((e) => e.live && e.bad), ok = evOut.find((e) => e.id === 'rc50');
  const corrWord = cNow == null ? 'unknown' : cNow >= 0.5 ? 'high' : cNow >= 0.3 ? 'moderate' : cNow >= 0.1 ? 'low' : 'very low';
  const evLine = (e) => `${e.label.replace(/ \(first close.*\)$/, '')} (${dd(T(e.last))}, ${e.ago} trading day${e.ago === 1 ? '' : 's'} ago): after the ${e.n} past cases BTC's next 30 days were ${pct(e.btc30)} (median), with a 10%+ drop in ${e.drop10}% (all days ${base.drop10}%)${e.few ? ', few cases' : ''}; BTC ${pct(e.btc_since)} since`;
  const lede = bias === 'Headwind' ? 'Headwind for BTC: from where the S&P is now, BTC\'s next 30 days have usually been weaker than normal.'
    : bias === 'Tailwind' ? 'Tailwind for BTC: from where the S&P is now, BTC\'s next 30 days have usually been stronger than normal.'
    : 'Neutral for BTC: from where the S&P is now, BTC\'s next 30 days have been about normal, so the S&P is not giving a clear early sign either way.';
  const lines = [
    `Where the S&P is: ${lv(L.c)} on ${dd(L.t)}, ${pct(ddNow * 100)} from its 1-year closing high, ${sNow === 'up' ? 'above' : 'below'} its 50D (${lv(L.s50)}) and ${sNow === 'riskoff' ? 'below' : 'above'} its 200D (${lv(L.s200)}): ${STATE[sNow].split(' (')[0]}.`,
    `What BTC did next from here: since 2015, on S&P days like this${pick === curC ? ` (with the BTC–S&P link ${hcNow ? 'at 0.3 or more' : 'under 0.3'})` : ''}, BTC's next 30 days were ${pct(pick.btc30)} (median), up ${pick.up30}% of the time, with a 10%+ drop at some point in ${pick.drop10}% (all days: ${pct(base.btc30)}, ${base.up30}% up, ${base.drop10}%; ${pick.n} days).`,
    `How closely BTC follows: the 60-day correlation is ${cNow != null ? cNow.toFixed(2) : '—'} (${corrWord}; higher than ${pctile(cNow)}% of days since 2015)` + (hcNow ? ', so S&P down days are BTC down days right now. The S&P does not lead BTC by a day; the link is same-day.' : ', so BTC is mostly moving on its own and the S&P is a weak guide.'),
    live.length ? `Live early signs: ` + live.map(evLine).join('. ') + '.' : 'No S&P early sign has fired in the last 20 trading days.'
  ];
  const watch = [];
  if (sNow !== 'riskoff') watch.push({ bad: true, text: `S&P daily close below the 200D (${lv(L.s200)}, ${gap(L.s200)} away) = Risk-off. BTC's next 30 days in Risk-off: median ${pct(byState[2].btc30)}, a 10%+ drop in ${byState[2].drop10}% (${byState[2].n} days).` });
  if (sNow === 'up') watch.push({ bad: true, text: `S&P daily close below the 50D (${lv(L.s50)}, ${gap(L.s50)} away) = the first early sign. After it, BTC's next 30 days: median ${pct(evOut[0].btc30)}, a 10%+ drop in ${evOut[0].drop10}% (${evOut[0].n} cases).` });
  else watch.push({ bad: false, text: `S&P daily close back above the 50D (${lv(L.s50)}, ${gap(L.s50)} away) = the all-clear sign. After it, BTC's next 30 days: median ${pct(ok.btc30)}, up ${ok.up30}% of the time (${ok.n} cases).` });
  watch.push({ bad: false, text: `S&P 20D: ${lv(L.s20)} (${gap(L.s20)} away). A close back above it is the first sign the S&P selling is easing.` });

  return {
    lede, lines, bias, state: sNow, state_label: STATE[sNow], drawdown: p1(ddNow), dd_label: DD[bNow],
    corr60: cNow != null ? Math.round(cNow * 100) / 100 : null, corr60_pctile: pctile(cNow), corr250: (() => { const v = corr(n - 1, 250); return v != null ? Math.round(v * 100) / 100 : null; })(),
    lead1: (() => { const v = corr(n - 1, 250, 1); return v != null ? Math.round(v * 100) / 100 : null; })(),
    corr_series: D.map((r, i) => [day(r.t), c60[i] != null ? Math.round(c60[i] * 100) / 100 : null]).filter((x, i) => i >= i0 && x[1] != null && i % 5 === (n - 1) % 5),
    base, by_state: byState, by_drawdown: byDD, events: evOut, live: live.map((e) => e.id), watch,
    levels: { close: L.c, s20: L.s20, s50: L.s50, s200: L.s200, hi250: hi250[n - 1] },
    note: 'BTC next = BTC\'s move over the next 7 / 30 calendar days from the UTC day of the S&P close. Medians. Days in a state overlap, so the day counts are not independent cases; the early signs are counted once each. Since 1 Sep 2015. Past behaviour, not a forecast.'
  };
};
