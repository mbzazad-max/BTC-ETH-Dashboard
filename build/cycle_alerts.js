'use strict';
/* Cycle early-sign email alerts (owner, 27 Nov 2026): "any asset from the cycle tabs that gives at least two early bottom or
   top signals, I get an email".
   Reads the "⚡ Early warning (daily)" block (bottom_watch.fast / top_watch.fast) of every cycle tab built by build/usdtd.js:
   BTC, ETH, SOL, BNB, the 7 Alts, S&P 500, USDT.D and TOTAL2ES. An episode = one live 30-day closing low (bottom) or high
   (top); a sign counts once it has fired (the RSI divergence setup included, the "any 30-day low, no sign" baseline not).
   Emails (a GitHub issue that mentions the owner, opened by build.yml) when, for a live episode:
     1. 2 or more signs have fired (once per episode), and
     2. later, the ★ sign (swing break, the best record) fires, if it was not in the first email.
   Expired episodes (no new extreme for 30+ days) never alert.
   Also (owner, 27 Nov 2026) the slower "🧭 Swing confirmation (daily + weekly)" signs after the 90-day extreme (bottom_watch /
   top_watch steps: 20D, 50D, 20D/50D cross, 20W, 200D, 50W): one email when 2+ have fired, one more when the first weekly sign
   (20W or 50W) fires later. A swing episode can stay open for months, so it emails only if its newest sign fired within the
   last 10 days (older ones are recorded without an email). State: history/cycle_alerts.json (per episode: count, signs,
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
const DAY = 864e5;
for (const [name, file, hash] of ASSETS) {
  const J = read(path.join(ROOT, 'public', file));
  if (!J) { console.warn('cycle_alerts: ' + file + ' missing, skipped'); continue; }
  // the sign records carry BTC's price on the day (for the BTC context column); the asset's own close comes from its daily series
  const daily = (J.series && J.series.daily) || [];
  const close = new Map(daily.map((r) => [r[0], r[1]]));
  const own = (d) => (close.has(d) ? close.get(d) : null);
  const lastDay = daily.length ? daily[daily.length - 1][0] : null;
  for (const side of ['bottom', 'top']) {
    const W = J[side + '_watch']; if (!W) continue;
    const word = side === 'bottom' ? 'low' : 'high';
    // two layers, as on the tab: ⚡ fast daily signs after the 30-day extreme; 🧭 swing confirmation (daily + weekly) after the 90-day extreme
    const layers = [
      { id: 'fast', F: W.fast, signs: W.fast && W.fast.signs, live: W.fast && !W.fast.expired, title: 'early', head: '⚡ Early warning (daily)', days: 30, mv: side === 'bottom' ? '+10%' : '−10%', within: '60 days', held: 'Held 60 d', heldKey: 'held',
        extra: (es) => (es.some((s) => s.id === 'swing') ? null : 'swing'), extraName: '★ swing break', fresh: null },
      { id: 'swing', F: W, signs: W.steps, live: W.mode === 'own' || W.mode === 'since_turn', title: 'daily/weekly swing', head: '🧭 Swing confirmation (daily + weekly)', days: 90, mv: side === 'bottom' ? '+20%' : '−20%', within: '6 months', held: side === 'bottom' ? 'Low held 4 mo' : 'High held 4 mo', heldKey: 'stayed',
        extra: (es) => (es.some((s) => s.id === 'w20' || s.id === 'w50') ? null : 'weekly'), extraName: 'first weekly sign (20W/50W)', fresh: 10 },
    ];
    for (const L of layers) {
      const F = L.F;
      if (!F || !F.extreme || !Array.isArray(L.signs) || !L.live) continue;
      const key = name + '|' + side + '|' + (L.id === 'fast' ? '' : 'swing|') + F.extreme.day;
      const fired = L.signs.filter((s) => s.fired);
      const ep = state.episodes[key] || (state.episodes[key] = { first_seen: now, alerts: [] });
      ep.count = fired.length; ep.signs = fired.map((s) => s.id + ' ' + s.fired); ep.updated = now;
      // swing episodes can stay open for months: alert only while the newest sign is recent (no email about weeks-old signs)
      const newest = fired.reduce((m, s) => (s.fired > m ? s.fired : m), '');
      const recent = !L.fresh || (lastDay && newest && (Date.parse(lastDay) - Date.parse(newest)) / DAY <= L.fresh);
      const isExtra = (s) => (L.id === 'fast' ? s.id === 'swing' : s.id === 'w20' || s.id === 'w50');
      let why = null;
      if (fired.length >= 2 && !ep.alerts.length) { if (recent) why = fired.length + ' ' + L.title + ' ' + side + ' signs'; else { ep.alerts.push({ at: now, count: fired.length, extra: fired.some(isExtra), silent: 'newest sign ' + newest + ' older than ' + L.fresh + ' days' }); continue; } }
      else if (ep.alerts.length && fired.some(isExtra) && !ep.alerts.some((a) => a.extra)) why = L.extraName;
      if (!why) continue;
      ep.alerts.push({ at: now, count: fired.length, extra: fired.some(isExtra) });
      state.log.push({ at: now, asset: name, side, layer: L.id, extreme: F.extreme.day, count: fired.length, why });

      const chg = (v) => (v == null || !F.extreme.v ? null : (v / F.extreme.v - 1) * 100);
      const rows = L.signs.map((s) => `| ${s.id === 'swing' ? '★ ' : ''}${s.label}${s.level != null && !s.fired ? ' (' + px(name, s.level) + ')' : ''} | ${s.fired ? '✓ ' + dd(s.fired) : 'not yet'} | ${s.fired ? px(name, own(s.fired)) + ' (' + pct(chg(own(s.fired))) + ')' : '—'} | ${s.moved}% | ${s[L.heldKey] != null ? s[L.heldKey] + '%' : '—'} | ${s.n} |`);
      const title = `${name}: ${why} (${fired.length}/${L.signs.length} fired) after the ${dd(F.extreme.day)} ${L.days}-day ${word}`;
      const body = [
        `**${name} ${L.head}: ${fired.length} of ${L.signs.length} ${side} signs have fired** after its ${L.days}-day closing ${word} of ${px(name, F.extreme.v)} on ${dd(F.extreme.day)} (${F.extreme.days_ago} days ago).`,
        why === L.extraName ? `New: the ${L.extraName} fired.` : '',
        '',
        `| Sign | Fired | Price then (vs the ${word}) | Then moved ${L.mv} within ${L.within} (past record) | ${L.held} | Seen |`,
        '|---|---|---|---|---|---|',
        ...rows,
        '',
        F.status ? F.status : '',
        L.id === 'fast' && F.divergence ? `Daily RSI: ${F.divergence.prev_day} ${F.divergence.prev_rsi} → ${dd(F.extreme.day)} ${F.divergence.rsi}${F.divergence.divergence ? ' (divergence)' : ''}.` : '',
        '',
        L.id === 'fast' ? `These are the fast daily signs: they call a short-term ${side === 'bottom' ? 'bounce' : 'pullback'}, with more false alarms than the slower swing signs; check the weekly read and the swing confirmation on the tab before acting.`
          : `These are the slower swing signs (daily and weekly): later than the early warning but surer. Whether this is the cycle ${side} is shown by the weekly read on the tab.`,
        `Open: ${SITE}${hash}`,
        '',
        `_Automatic alert from the BTC & ETH dashboard build (build/cycle_alerts.js). Per ${word}: one email when 2 signs have fired, one more when the ${L.extraName} fires later. Past record, not a forecast; not financial advice._`,
      ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
      alerts.push({ title, body });
    }
  }
}
state.log = state.log.slice(-500);
fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
fs.writeFileSync(OUT, JSON.stringify(alerts));
console.log('cycle_alerts: ' + alerts.length + ' new alert(s)' + (alerts.length ? ': ' + alerts.map((a) => a.title).join(' | ') : ''));
