'use strict';
/* Cycle early-sign email alerts (owner, 27 Nov 2026): "any asset from the cycle tabs that gives at least two early bottom or
   top signals, I get an email".
   Reads the "⚡ Early warning (daily)" block (bottom_watch.fast / top_watch.fast) of every cycle tab built by build/usdtd.js:
   BTC, ETH, SOL, BNB, the 7 Alts, S&P 500, USDT.D and TOTAL2ES. An episode = one live 30-day closing low (bottom) or high
   (top); a sign counts once it has fired (the RSI divergence setup included, the "any 30-day low, no sign" baseline not).
   Emails (a GitHub issue that mentions the owner, opened by build.yml) when, for a live episode:
     1. 2 or more signs have fired (once per episode), and
     2. later, the ★ sign (swing break, the best record) fires, if it was not in the first email.
   Expired episodes (no new extreme for 30+ days) never alert. State: history/cycle_alerts.json (per episode: count, signs,
   alerts sent). Alerts go to /tmp/cycle_alerts.json as [{title, body}] for the workflow's email step.
   Run: node build/cycle_alerts.js   (CYCLE_ALERTS=<file> to change the output) */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.CYCLE_ALERTS || '/tmp/cycle_alerts.json';
const STATE = path.join(ROOT, 'history', 'cycle_alerts.json');
const SITE = 'https://dashboards.mbzazad.workers.dev/btc-eth/';
const ALTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'alts.json'), 'utf8')).order;

// name, JSON, link to its tab
const ASSETS = [
  ['BTC', 'btccycle.json', '#btccyc'], ['ETH', 'ethcycle.json', '#ethcyc'], ['SOL', 'solcycle.json', '#solcyc'], ['BNB', 'bnbcycle.json', '#bnbcyc'],
  ...ALTS.map((c) => [c, c.toLowerCase() + 'cycle.json', '#alts-' + c.toLowerCase()]),
  ['S&P 500', 'spxcycle.json', '#spx'], ['USDT.D', 'usdtd.json', '#usdtd'], ['TOTAL2ES', 'total2es.json', '#total2'],
];

const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const state = read(STATE) || { about: 'Cycle early-sign email alerts (build/cycle_alerts.js). episodes: <asset>|<bottom/top>|<extreme day> -> signs fired and alerts sent; log: every alert, newest last.', episodes: {}, log: [] };
const pct = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%');
const px = (n, v) => (v == null ? '—' : n === 'USDT.D' ? v.toFixed(3) + '%' : n === 'S&P 500' || n === 'TOTAL2ES' ? (n === 'TOTAL2ES' ? '$' + (v / 1e9).toFixed(0) + 'B' : v.toLocaleString('en-US', { maximumFractionDigits: 0 })) : '$' + (v < 1 ? v.toFixed(4) : v < 100 ? v.toFixed(2) : Math.round(v).toLocaleString('en-US')));
const dd = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const alerts = [];
const now = new Date().toISOString().slice(0, 16) + 'Z';
for (const [name, file, hash] of ASSETS) {
  const J = read(path.join(ROOT, 'public', file));
  if (!J) { console.warn('cycle_alerts: ' + file + ' missing, skipped'); continue; }
  for (const side of ['bottom', 'top']) {
    const F = J[side + '_watch'] && J[side + '_watch'].fast;
    if (!F || !F.extreme || !Array.isArray(F.signs) || F.expired) continue;
    const key = name + '|' + side + '|' + F.extreme.day;
    const fired = F.signs.filter((s) => s.fired);
    const star = F.signs.find((s) => s.id === 'swing');
    const ep = state.episodes[key] || (state.episodes[key] = { first_seen: now, alerts: [] });
    ep.count = fired.length; ep.signs = fired.map((s) => s.id + ' ' + s.fired); ep.updated = now;
    let why = null;
    if (fired.length >= 2 && !ep.alerts.length) why = fired.length + ' early ' + side + ' signs';
    else if (ep.alerts.length && star && star.fired && !ep.alerts.some((a) => a.star)) why = '★ swing break';
    if (!why) continue;
    const isStar = !!(star && star.fired);
    ep.alerts.push({ at: now, count: fired.length, star: isStar });
    state.log.push({ at: now, asset: name, side, extreme: F.extreme.day, count: fired.length, star: isStar, why });

    // the sign records carry BTC's price on the day (for the BTC context column); the asset's own close comes from its daily series
    const close = new Map((J.series && J.series.daily || []).map((r) => [r[0], r[1]]));
    const own = (d) => (close.has(d) ? close.get(d) : null);
    const chg = (v) => (v == null || !F.extreme.v ? null : (v / F.extreme.v - 1) * 100);
    const word = side === 'bottom' ? 'low' : 'high';
    const mv = side === 'bottom' ? '+10%' : '−10%';
    const rows = F.signs.map((s) => `| ${s.id === 'swing' ? '★ ' : ''}${s.label}${s.level != null && !s.fired ? ' (' + px(name, s.level) + ')' : ''} | ${s.fired ? '✓ ' + dd(s.fired) : 'not yet'} | ${s.fired ? px(name, own(s.fired)) + ' (' + pct(chg(own(s.fired))) + ')' : '—'} | ${s.moved}% | ${s.n} |`);
    const title = `${name}: ${why} (${fired.length}/${F.signs.length} fired) after the ${dd(F.extreme.day)} 30-day ${word}`;
    const body = [
      `**${name} early ${side} warning: ${fired.length} of ${F.signs.length} fast signs have fired** after its 30-day closing ${word} of ${px(name, F.extreme.v)} on ${dd(F.extreme.day)} (${F.extreme.days_ago} days ago).`,
      why === '★ swing break' ? `New: the ★ swing break fired, the sign with the best record.` : '',
      '',
      `| Sign | Fired | Price then (vs the ${word}) | Then moved ${mv} (past record) | Seen |`,
      '|---|---|---|---|---|',
      ...rows,
      '',
      F.status ? F.status : '',
      F.divergence ? `Daily RSI: ${F.divergence.prev_day} ${F.divergence.prev_rsi} → ${F.divergence.day || dd(F.extreme.day)} ${F.divergence.rsi}${F.divergence.divergence ? ' (divergence)' : ''}.` : '',
      '',
      `These are the fast daily signs: they call a short-term ${side === 'bottom' ? 'bounce' : 'pullback'}, with more false alarms than the slower swing signs; check the weekly read and the swing confirmation on the tab before acting.`,
      `Open: ${SITE}${hash}`,
      '',
      '_Automatic alert from the BTC & ETH dashboard build (build/cycle_alerts.js). One email when an episode reaches 2 signs, one more if the ★ swing break fires later. Past record, not a forecast; not financial advice._',
    ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
    alerts.push({ title, body });
  }
}
state.log = state.log.slice(-500);
fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
fs.writeFileSync(OUT, JSON.stringify(alerts));
console.log('cycle_alerts: ' + alerts.length + ' new alert(s)' + (alerts.length ? ': ' + alerts.map((a) => a.title).join(' | ') : ''));
