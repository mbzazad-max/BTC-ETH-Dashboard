/* Test for build/levels.js on a copy of the repo: replays the last 14 closed days and checks that
   1. every stored level is the exact number the page's own Bull / Bear line shows (same rounding);
   2. a case is logged as active exactly when that day's daily close is beyond the PREVIOUS day's level;
   3. an email only when a case became active on the newest daily close (the cases in the title, only those coins in the
      body), never on the first run, never twice for the same close.
   usage: node tests/levels.js <node_modules dir with jsdom and d3> <market-data dir> */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), NM = path.resolve(process.argv[2]), MD = path.resolve(process.argv[3]), DAY = 86400;
const dayOf = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-')), REPO = path.join(tmp, 'r'); execFileSync('cp', ['-r', ROOT, REPO]);
const LF = path.join(REPO, 'history/levels.json'), AL = path.join(tmp, 'alerts.json');
const run = () => { fs.rmSync(AL, { force: true }); return execFileSync('node', [path.join(REPO, 'build/levels.js'), NM, MD], { env: { ...process.env, LEVEL_ALERTS: AL }, encoding: 'utf8' }); };
// first run: starting point, no alerts
fs.rmSync(LF, { force: true }); assert.match(run(), /first run/); assert(!fs.existsSync(AL), 'first run must not alert');
// rewind 14 days and replay
const L0 = JSON.parse(fs.readFileSync(LF, 'utf8')), last = L0.checked, from = dayOf(Date.parse(last + 'T00:00:00Z') / 1000 - 14 * DAY);
L0.checked = from; L0.log = []; fs.writeFileSync(LF, JSON.stringify(L0)); run();
const L = JSON.parse(fs.readFileSync(LF, 'utf8')), fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : null);
const { histories } = require(path.join(REPO, 'build/structure_test.js')), H = histories(MD);
let checked = 0, expect = [];
for (const [D, coins] of Object.entries(L.days)) for (const [C, x] of Object.entries(coins)) {
  if (x.bull_level != null && Math.abs(x.bull_level) >= 1000) assert(x.bull.includes('above ' + fmt(x.bull_level) + ' (top of'), C + ' ' + D + ' bull level is not the one in the page text');
  if (x.bear_level != null && Math.abs(x.bear_level) >= 1000) assert(x.bear.includes('below ' + fmt(x.bear_level) + ' (floor of'), C + ' ' + D + ' bear level is not the one in the page text');
  if (x.bull_level == null) assert.doesNotMatch(x.bull, /daily close above/); if (x.bear_level == null) assert.doesNotMatch(x.bear, /daily close below/);
  checked++;
}
for (let t = Date.parse(from + 'T00:00:00Z') / 1000 + DAY; dayOf(t) <= last; t += DAY) {
  const D = dayOf(t), p = L.days[dayOf(t - DAY)]; if (!p) continue;
  for (const C of Object.keys(p)) { const c = H[C].d1.find((r) => dayOf(r.t) === D); if (!c) continue;
    if (p[C].bull_level != null && c.c > p[C].bull_level) expect.push(D + ' ' + C + ' bull'); if (p[C].bear_level != null && c.c < p[C].bear_level) expect.push(D + ' ' + C + ' bear'); }
}
assert.deepEqual(L.log.map((e) => e.day + ' ' + e.coin + ' ' + e.side).sort(), expect.sort(), 'logged triggers differ from the daily closes');
const alerts = fs.existsSync(AL) ? JSON.parse(fs.readFileSync(AL, 'utf8')) : [];
const lastHits = L.log.filter((e) => e.day === last);
assert.equal(alerts.length, lastHits.length ? 1 : 0, 'an email only when a case became active on the newest close');
// the email for the busiest day in the replay
const { dailyEmail } = require(path.join(REPO, 'build/levels.js'));
const busy = Object.entries(L.log.reduce((m, e) => ((m[e.day] = (m[e.day] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1])[0][0];
const mail = dailyEmail(busy, L, H), hitsB = L.log.filter((e) => e.day === busy);
for (const e of hitsB) { assert(mail.title.includes(e.coin + ' ' + (e.side === 'bull' ? 'Bull' : 'Bear') + ' case active'), 'trigger missing from the title'); assert(mail.body.includes(e.case_text), 'broken line missing'); }
for (const C of ['BTC', 'ETH', 'SOL', 'BNB']) assert.equal(mail.body.includes('### ' + C), hitsB.some((e) => e.coin === C), C + ': only active coins belong in the email');
// running again on the same data sends nothing new
run(); assert(!fs.existsSync(AL), 'the same trigger was sent twice');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, days_checked: Object.keys(L.days).length, lines_matched_page_text: checked, triggers_last_14_days: L.log.map((e) => `${e.day} ${e.coin} ${e.side} (close ${e.close} vs ${Math.round(e.level * 100) / 100})`), example_email_title: mail.title, example_email_body: mail.body }, null, 1));
