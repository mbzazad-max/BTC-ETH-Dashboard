'use strict';
/* "Levels to watch next" on every cycle tab + email alerts (owner, 28 Nov 2026: "added these ... whenever any of these
   triggers I need email"). Same list as the Metal Cycle page (build/levels_core.js, byte-identical copy in repo Metal):
   per tab, the nearest unfired bottom signs, swing-confirmation signs and the 100W above the last close, and the 30-day low,
   the 200W and the unfired top signs below it, all from the tab's own JSON (built by build/usdtd.js; nothing new fetched).
   Writes public/levels_next.json ({generated, assets: {<tab json>: list}}, drawn by public/usdtd.js under the two watch cards)
   only when a list changed. Each build compares the list saved last time (history/levels_next.json) with the new closed
   candles; every listed level that has now happened is reported, one email per tab per build (a GitHub issue mentioning the
   owner, opened by build.yml's email step). The first run only saves the lists.
   Output: /tmp/levels_alerts.json [{title, body}] (LEVELS_ALERTS=<file>). Run: node build/levels_next.js */
const fs = require('fs'), path = require('path');
const L = require('./levels_core.js');
const ROOT = path.join(__dirname, '..');
const OUT = process.env.LEVELS_ALERTS || '/tmp/levels_alerts.json';
const STATE = path.join(ROOT, 'history', 'levels_next.json');
const PUBF = path.join(ROOT, 'public', 'levels_next.json');
const SITE = 'https://dashboards.mbzazad.workers.dev/btc-eth/';
const ALTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'alts.json'), 'utf8')).order;
// name, JSON, link to its tab (same list as build/cycle_alerts.js)
const ASSETS = [
  ['BTC', 'btccycle.json', '#btccyc'], ['ETH', 'ethcycle.json', '#ethcyc'], ['SOL', 'solcycle.json', '#solcyc'], ['BNB', 'bnbcycle.json', '#bnbcyc'],
  ...ALTS.map((c) => [c, c.toLowerCase() + 'cycle.json', '#alts-' + c.toLowerCase()]),
  ['S&P 500', 'spxcycle.json', '#spx'], ['USDT.D', 'usdtd.json', '#usdtd'], ['TOTAL2ES', 'total2es.json', '#total2'],
];
const FAST_ID = { c10: 'd10', keyrev: 'rev', c20: 'd20', swing: 'swing' };
const SWING_ID = { c20: 'd20', c50: 'd50', w20: 'w20', c200: 'd200', w50: 'w50' };
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

function asset(name, J) {
  const daily = J.series.daily.map((r) => [r[0], r[1]]);
  const wk = J.series.forming_week ? J.series.weekly.slice(0, -1) : J.series.weekly;   // closed weeks only
  const lw = wk[wk.length - 1];
  const layer = (F, ids, ex, live) => F && { live, extreme: ex, signs: Object.entries(ids).map(([k, id]) => { const s = (F.signs || F.steps || []).find((x) => x.id === id);
    return { key: k, label: s ? s.label : k, level: s ? s.level : null, fired: s ? s.fired : null }; }) };
  const bw = J.bottom_watch, tw = J.top_watch;
  return {
    name, price: daily[daily.length - 1][1], day: daily[daily.length - 1][0],
    week: lw ? { day: lw[0], close: lw[1], s100: lw[4], s200: lw[5] } : null,
    bottomFast: bw && bw.fast && layer({ signs: bw.fast.signs }, FAST_ID, bw.fast.extreme && { day: bw.fast.extreme.day, v: bw.fast.extreme.v }, !bw.fast.expired),
    bottomSwing: bw && bw.steps && layer({ steps: bw.steps }, SWING_ID, bw.extreme && { day: bw.extreme.day }, bw.mode === 'own' || bw.mode === 'since_turn'),
    topFast: tw && tw.fast && layer({ signs: tw.fast.signs }, FAST_ID, tw.fast.extreme && { day: tw.fast.extreme.day, v: tw.fast.extreme.v }, !tw.fast.expired),
    priorLow: null,
    daily, weekly: wk.map((r) => [r[0], r[1], r[4], r[5]]),
  };
}

const px = (n, v) => (v == null ? '—' : n === 'USDT.D' ? v.toFixed(3) + '%' : n === 'S&P 500' || n === 'TOTAL2ES' ? (n === 'TOTAL2ES' ? '$' + (v / 1e9).toFixed(0) + 'B' : v.toLocaleString('en-US', { maximumFractionDigits: 0 })) : '$' + (v < 1 ? v.toFixed(4) : v < 100 ? v.toFixed(2) : Math.round(v).toLocaleString('en-US')));
const pf = (a, b) => (a == null || !b ? '—' : ((a / b - 1) * 100 > 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%');
const dd = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const pretty = (s) => s.replace(/\((\d{4}-\d\d-\d\d)\)/, (_, d) => '(' + dd(d) + ')');

function main() {
  const state = read(STATE) || { about: 'Levels to watch next (build/levels_next.js): the list saved at the last build per cycle tab, and a log of every triggered level (newest last).', lists: {}, log: [] };
  const pub = { assets: {} }, alerts = [], now = new Date().toISOString().slice(0, 16) + 'Z';
  for (const [name, file, hash] of ASSETS) {
    const J = read(path.join(ROOT, 'public', file));
    if (!J || !J.series) { console.warn('levels_next: ' + file + ' missing, skipped'); if (state.lists[file]) pub.assets[file] = state.lists[file]; continue; }
    let A, cur;
    try { A = asset(name, J); cur = L.list(A); } catch (e) { console.warn('levels_next: ' + name + ' skipped: ' + e.message); if (state.lists[file]) pub.assets[file] = state.lists[file]; continue; }
    pub.assets[file] = cur;
    const prev = state.lists[file];
    if (prev && cur.day <= prev.day && prev.week === cur.week) { pub.assets[file] = prev; continue; }   // nothing new closed: keep the saved list
    const hits = prev ? L.triggers(prev, A) : [];
    state.lists[file] = cur;
    if (!hits.length) continue;
    for (const h of hits) state.log.push({ at: now, asset: name, id: h.item.id, label: h.item.label, level: h.level_then, day: h.day, close: h.close });
    const title = `${name}: ${hits.length === 1 ? pretty(hits[0].item.label) : hits.length + ' levels to watch triggered'} (close ${px(name, hits[0].close)}, ${dd(hits[0].day)})`;
    const li = (x) => `| ${pretty(x.label)} | ${px(name, x.level)} | ${pf(x.level, cur.price)} |`;
    const body = [
      `**${name}: ${hits.length} of the levels to watch ${hits.length === 1 ? 'has' : 'have'} triggered.**`,
      '',
      '| Level | Was at | Happened | Close then |', '|---|---|---|---|',
      ...hits.map((h) => `| ${pretty(h.item.label)} | ${px(name, h.level_then)}${h.level_now != null ? ' (that week ' + px(name, h.level_now) + ')' : ''} | ${h.item.tf === 'W' ? 'week of ' : ''}${dd(h.day)} | ${px(name, h.close)} |`),
      '',
      `Now: ${px(name, cur.price)} on ${dd(cur.day)} · weekly read ${J.read && J.read.verdict ? J.read.verdict : '—'}.`,
      '',
      '**Next levels, upside**', '', '| Level | Price | From now |', '|---|---|---|', ...(cur.up.length ? cur.up.map(li) : ['| None | | |']),
      '', '**Next levels, downside**', '', '| Level | Price | From now |', '|---|---|---|', ...(cur.down.length ? cur.down.map(li) : ['| None | | |']),
      '', `Open: ${SITE}${hash}`, '',
      `_Automatic alert from the BTC & ETH dashboard build (build/levels_next.js): one email per tab per build when any level in its "Levels to watch next" list is crossed on a closed day or week.${name === 'USDT.D' ? ' For USDT.D, upside = USDT.D rising (bad for crypto).' : ''} Past record, not a forecast; not financial advice._`,
    ].join('\n');
    alerts.push({ title, body });
  }
  state.log = state.log.slice(-500);
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');
  const old = read(PUBF);
  if (!old || JSON.stringify(old.assets) !== JSON.stringify(pub.assets)) fs.writeFileSync(PUBF, JSON.stringify(Object.assign({ generated: now }, pub)));
  fs.writeFileSync(OUT, JSON.stringify(alerts));
  console.log('levels_next: ' + Object.keys(pub.assets).length + ' tabs, ' + alerts.length + ' new alert(s)' + (alerts.length ? ': ' + alerts.map((a) => a.title).join(' | ') : ''));
}
if (require.main === module) main();
module.exports = { asset, ASSETS };
