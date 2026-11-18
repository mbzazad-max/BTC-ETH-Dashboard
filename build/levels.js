/* Bull case / Bear case alerts (added 18 Nov 2026 at the owner's request: "email when any of these become active").

   The Trade plan's two lines come from the ORIGINAL page's engine:
     Bull case  "A daily close above <top of the nearest resistance> hands control to buyers; next stop <zone>."
     Bear case  "A daily close below <floor of the nearest support> hands control to sellers; next support <zone>."
   A case becomes ACTIVE when a daily candle closes beyond the level the page showed BEFORE that candle closed
   (the plan at the end of the previous UTC day), because once the candle closes the page redraws its zones around it.

   On every build, for BTC, ETH, SOL and BNB:
     - runs the page's engine in jsdom (like build/structure_test.js) on the candles closed by the end of each UTC day that
       is not yet in history/levels.json, and stores both lines with their exact levels (the cache is thrown away when the
       page changes);
     - for each newly closed day D: close(D) > bull level of D-1 -> "Bull case active"; close(D) < bear level of D-1 ->
       "Bear case active"; logged in history/levels.json;
     - ONLY when at least one case became active on the newest daily close (owner's choice), writes ONE email to
       /tmp/level_alerts.json: the active cases in the title (e.g. "BTC Bear case active, ETH Bear case active (14 Nov 2026
       daily close)"), and for each such coin the close, the line it broke and the new Bull / Bear lines. Quiet days send
       nothing. The workflow opens a GitHub issue that mentions the owner and GitHub emails it (same as the checklist
       alerts). Never twice for the same close; the very first run only sets the starting point.
   Daily candles are the dashboard's own (BTC: stored Coinbase history, then Binance; others: Binance), closed only.
   Any failure exits 0 with a warning, so the dashboard still deploys.

   usage: node build/levels.js <node_modules dir with jsdom and d3> <market-data dir> */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { docsAt, histories } = require('./structure_test.js');
const ROOT = path.resolve(__dirname, '..'), PUB = path.join(ROOT, 'public'), HIST = path.join(ROOT, 'history');
const LOGF = path.join(HIST, 'levels.json'), ALERTS = process.env.LEVEL_ALERTS || '/tmp/level_alerts.json';
const DAY = 86400, COINS = { BTC: 'btc', ETH: 'eth', SOL: 'sol', BNB: 'bnb' }, KEEP_DAYS = 120;
const iso = (t) => new Date(t * 1000).toISOString(), dayOf = (t) => iso(t).slice(0, 10);
const fmt = (v) => (v == null ? '-' : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(4));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nice = (D) => { const d = new Date(D + 'T00:00:00Z'); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };

// the page's Bull / Bear lines and their levels for every coin, from its own engine running in jsdom on `snapshot`
function pageLevels(NM, snapshot) {
  const { JSDOM, VirtualConsole } = require(path.join(NM, 'jsdom'));
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8')
    .replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>', () => '<script>' + fs.readFileSync(path.join(NM, 'd3/dist/d3.min.js'), 'utf8') + '</script>')
    .replace('<script src="shim.js"></script>', () => '<script>' + fs.readFileSync(path.join(PUB, 'shim.js'), 'utf8') + '</script>')
    .replace('<script src="cloud.js"></script>', '').replace(/<link[^>]+>/g, '');
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://build.local/btc-eth/', virtualConsole: new VirtualConsole(), beforeParse(w) {
    w.fetch = async () => ({ ok: true, json: async () => snapshot });
    w.SVGElement.prototype.getComputedTextLength = function () { return (this.textContent || '').length * 7; };
  } });
  const w = dom.window;
  return new Promise((resolve) => {
    let tries = 0;
    const tick = () => {
      const st = w.__snap && w.dash && w.dash.data('tp_engine').status;
      if (st !== 'ok') { if (++tries > 200) { w.close(); return resolve({}); } return setTimeout(tick, 50); }
      const out = {};
      for (const C of Object.keys(COINS)) {
        if (!snapshot.docs[`snap/${COINS[C]}_4h-0`]) continue;
        w.__snap.setAsset(C);
        const e = w.dash.data('tp_engine'); if (e.status !== 'ok') continue;
        const d = e.data[0], zs = d.zones || [], spot = d.spot;
        // the page's own nearest(): support = highest top among zones starting at or below spot; resistance = lowest floor among zones ending at or above
        const S = zs.filter((z) => z.role === 'S' && z.lo <= spot), R = zs.filter((z) => z.role === 'R' && z.hi >= spot);
        const nS = S.length ? S.reduce((a, b) => (b.hi > a.hi ? b : a)) : null, nR = R.length ? R.reduce((a, b) => (b.lo < a.lo ? b : a)) : null;
        out[C] = { spot, bull: d.bull, bear: d.bear, bull_level: nR ? nR.hi : null, bull_zone: nR ? [nR.lo, nR.hi] : null, bear_level: nS ? nS.lo : null, bear_zone: nS ? [nS.lo, nS.hi] : null };
      }
      w.close(); resolve(out);
    };
    setTimeout(tick, 50);
  });
}

// the email for a daily close on which at least one case became active: those cases in the title; for each such coin the
// close, the level it broke, the line it came from, and the new Bull / Bear lines
function dailyEmail(D, L, H) {
  const prevD = dayOf(Date.parse(D + 'T00:00:00Z') / 1000 - DAY), now = L.days[D] || {}, before = L.days[prevD] || {};
  const hits = L.log.filter((e) => e.day === D), parts = [];
  const move = (a, b) => (a == null && b == null ? 'none' : a == null ? 'new ' + fmt(b) : b == null ? 'gone (was ' + fmt(a) + ')' : fmt(a) === fmt(b) ? 'unchanged at ' + fmt(b) : fmt(a) + ' → ' + fmt(b));
  for (const C of Object.keys(COINS)) {
    const x = now[C], p = before[C], c = H[C] && H[C].d1.find((r) => dayOf(r.t) === D); if (!x || !hits.some((e) => e.coin === C)) continue;
    const act = hits.filter((e) => e.coin === C).map((e) => (e.side === 'bull' ? '🟢 **Bull case became active**: closed ' + fmt(e.close) + ' above ' + fmt(e.level) : '🔴 **Bear case became active**: closed ' + fmt(e.close) + ' below ' + fmt(e.level)));
    parts.push(`### ${C}${c ? ' — daily close ' + fmt(c.c) : ''}\n` + (act.length ? act.join('\n\n') + '\n\n' : '') +
      hits.filter((e) => e.coin === C).map((e) => `What the Trade plan said before this close:\n> ${e.case_text}`).join('\n\n') + '\n\n' +
      `The Trade plan now says:\n- **Bull case:** ${x.bull}\n- **Bear case:** ${x.bear}\n\n` +
      `Bull level ${move(p && p.bull_level, x.bull_level)} · Bear level ${move(p && p.bear_level, x.bear_level)}`);
  }
  const tag = hits.map((e) => e.coin + ' ' + (e.side === 'bull' ? 'Bull' : 'Bear') + ' case active').join(', ');
  return { title: `${tag} (${nice(D)} daily close)`,
    body: `A case becomes active when a daily candle closes beyond the level the Trade plan showed the day before. ${nice(D)} daily close (11 AM Sydney):\n\n` +
      parts.join('\n\n---\n\n') + `\n\nDashboard: https://dashboards.mbzazad.workers.dev/btc-eth/ (Trade plan)\n\nSpot only. Not financial advice.` };
}

async function main() {
  const NM = path.resolve(process.argv[2] || 'node_modules'), MD = path.resolve(process.argv[3] || '../market-data');
  const H = histories(MD);
  const pageHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(PUB, 'index.html'))).update(fs.readFileSync(path.join(PUB, 'shim.js'))).digest('hex').slice(0, 16);
  const first = !fs.existsSync(LOGF);
  const L = first ? { _about: 'Bull case / Bear case levels the page showed at the end of each UTC day, and every daily close beyond them (build/levels.js).', page: pageHash, days: {}, log: [], checked: null } : JSON.parse(fs.readFileSync(LOGF, 'utf8'));
  if (L.page !== pageHash) { L.page = pageHash; L.days = {}; }                // page changed: levels are worked out again
  // newest UTC day whose daily candle has closed for every coin
  const lastDay = Object.values(H).map((x) => dayOf(x.d1[x.d1.length - 1].t)).sort()[0];
  const need = [];                                                              // the newest day and the day before it, plus any day still to check
  const start = L.checked ? Date.parse(L.checked + 'T00:00:00Z') / 1000 : Date.parse(lastDay + 'T00:00:00Z') / 1000;
  for (let t = start - DAY; dayOf(t) <= lastDay; t += DAY) if (!L.days[dayOf(t)]) need.push(dayOf(t));
  for (const D of need.slice(-15)) L.days[D] = await pageLevels(NM, docsAt(H, D));
  const alerts = []; let digest = null;
  for (let t = start + (L.checked ? DAY : 0); dayOf(t) <= lastDay; t += DAY) {
    const D = dayOf(t), prev = L.days[dayOf(t - DAY)];
    if (!prev) continue;
    for (const C of Object.keys(COINS)) {
      const p = prev[C], c = H[C] && H[C].d1.find((r) => dayOf(r.t) === D);
      if (!p || !c) continue;
      const hits = [];
      if (p.bull_level != null && c.c > p.bull_level) hits.push({ side: 'bull', level: p.bull_level, zone: p.bull_zone, text: p.bull });
      if (p.bear_level != null && c.c < p.bear_level) hits.push({ side: 'bear', level: p.bear_level, zone: p.bear_zone, text: p.bear });
      for (const h of hits) {
        if (L.log.some((e) => e.day === D && e.coin === C && e.side === h.side)) continue;
        L.log.push({ day: D, coin: C, side: h.side, close: c.c, level: h.level, zone: h.zone, case_text: h.text, at: iso(Math.floor(Date.now() / 1000)) });
      }
    }
    if (D === lastDay && !first) digest = D;
  }
  if (digest && L.log.some((e) => e.day === digest)) alerts.push(dailyEmail(digest, L, H));   // only when a case became active
  L.checked = lastDay;
  const keepFrom = dayOf(Date.parse(lastDay + 'T00:00:00Z') / 1000 - KEEP_DAYS * DAY);
  for (const D of Object.keys(L.days)) if (D < keepFrom) delete L.days[D];
  fs.mkdirSync(HIST, { recursive: true }); fs.writeFileSync(LOGF, JSON.stringify(L, null, 1));
  if (alerts.length) fs.writeFileSync(ALERTS, JSON.stringify(alerts));
  console.log(`levels: checked to ${lastDay}; ${alerts.length ? 'daily email: ' + alerts[0].title : 'no email'}${first ? ' (first run: starting point only, no email)' : ''}`);
  for (const C of Object.keys(COINS)) { const x = L.days[lastDay] && L.days[lastDay][C]; if (x) console.log(`  ${C}: bull above ${fmt(x.bull_level)}, bear below ${fmt(x.bear_level)}`); }
}

if (require.main === module) main().catch((e) => { console.log('::warning::Bull/Bear alerts skipped: ' + (e && e.stack || e)); process.exit(0); });
module.exports = { pageLevels, dailyEmail };
