/* Signal history and email alerts for the spot checklists (added 16 Nov 2026 at the owner's request).

   Why: the checklists are worked out again on every build and only the latest score is shown, so a coin that reached
   3/5 between two looks at the board left no trace. This keeps a log of every change that touches 3/5 or more.

   On every build, after build/checklist.js, for each coin (BTC, ETH, SOL, BNB) and each list (spot buy, spot sell / trim):
     - reads the score and which checks are green from the checklist rows in public/snapshot.json;
     - adds an entry to history/signals.json when the score or the set of green checks changed AND the new or the old score
       is 3 or more (so the log shows a signal starting, stepping up or down, and ending);
     - adds a "Signal history" section under that coin's checklists (Trade plan -> Derivatives context (CoinGlass)),
       newest first;
     - when a score rises to 3, 4 or 5, writes it to /tmp/signal_alerts.json; the workflow then opens a GitHub issue that
       mentions the owner, and GitHub emails it.
   Before 15 Nov the lists had 4 checks (no structure shift), so those entries are out of 4.

   usage: node build/signals.js                     (live build: updates the log and the snapshot, writes the alerts file)
          node build/signals.js --backfill <dir>    (fills the log from old snapshots: <dir> holds <iso time>.json files;
                                                     no alerts, snapshot untouched)
   Any failure leaves the snapshot as checklist.js wrote it and exits 0 with a warning, so the dashboard still deploys. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SNAP = path.join(ROOT, 'public', 'snapshot.json'), LOGF = path.join(ROOT, 'history', 'signals.json');
const ALERTS = process.env.SIGNAL_ALERTS || '/tmp/signal_alerts.json';
const COINS = [['BTC', 'snap/derivs'], ['ETH', 'snap/derivs_eth'], ['SOL', 'snap/derivs_sol'], ['BNB', 'snap/derivs_bnb']];
const LISTS = { buy: { sum: 'chk_sum', pre: 'chk_', name: 'Spot buy' }, sell: { sum: 'chs_sum', pre: 'chs_', name: 'Spot sell / trim' } };
const LEVEL = 3, SHOW = 15;
const money = (v) => (Math.abs(v) < 100 ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(v).toLocaleString('en-US'));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const when = (iso) => { const d = new Date(iso); return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; };
const short = (iso) => { const d = new Date(iso); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.toISOString().slice(11, 16) + ' UTC'; };

// the state of every list in one snapshot: { 'BTC|buy': { score, of, verdict, green: [...], price } }
function read(snap) {
  const out = {};
  for (const [coin, doc] of COINS) {
    const d = snap.docs && snap.docs[doc];
    if (!d || !Array.isArray(d.rows)) continue;
    const c4 = snap.docs['snap/' + coin.toLowerCase() + '_4h-0'], last = c4 && c4.rows && c4.rows[c4.rows.length - 1];
    for (const [k, L] of Object.entries(LISTS)) {
      const sum = d.rows.find((r) => r.id === L.sum);
      if (!sum || typeof sum.num !== 'number') continue;
      const checks = d.rows.filter((r) => r.id !== L.sum && String(r.id).startsWith(L.pre));
      out[coin + '|' + k] = { score: sum.num, of: checks.length, verdict: String(sum.signal || ''),
        green: checks.filter((r) => r.num === 1).map((r) => r.metric.replace(/^\d\.\s*/, '')),
        nodata: checks.filter((r) => r.num == null).length, price: last ? last[4] : null, candle: last ? last[0] + ' UTC' : null };
    }
  }
  return out;
}

function load() {
  if (fs.existsSync(LOGF)) return JSON.parse(fs.readFileSync(LOGF, 'utf8'));
  return { _about: 'Spot checklist signal history (build/signals.js): every change of score or green checks that touches 3 or more. Times are UTC build times.', level: LEVEL, last: {}, log: [] };
}

// compare one snapshot with the last state; returns the new log entries
function step(H, now, at) {
  const added = [];
  for (const [key, s] of Object.entries(now)) {
    const p = H.last[key] || null;
    const changed = !p || p.score !== s.score || p.green.join('|') !== s.green.join('|');
    if (changed && (s.score >= LEVEL || (p && p.score >= LEVEL))) {
      const [coin, list] = key.split('|');
      const e = { at, coin, list, score: s.score, of: s.of, prev: p ? p.score : null, prev_of: p ? p.of : null, verdict: s.verdict, green: s.green, price: s.price, candle: s.candle };
      e.kind = s.score >= LEVEL && (p == null || s.score > p.score) ? 'up' : s.score < LEVEL ? 'end' : s.score < (p ? p.score : 0) ? 'down' : 'same';
      H.log.push(e); added.push(e);
    }
    H.last[key] = { score: s.score, of: s.of, green: s.green, at };
  }
  return added;
}

function rowsFor(coin, H) {
  const g = 'Signal history (3/5 and up)';
  const ev = H.log.filter((e) => e.coin === coin).slice().reverse();
  const tag = { up: '▲ Signal', down: '▼ Weaker', end: '■ Ended', same: '● Changed' };
  const day = (x) => { if (!x) return null; const d = new Date(x); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; };
  const since = day(H.from) || (H.log.length ? day(H.log[0].at) : 'the log started');
  const ups = ev.filter((e) => e.kind === 'up').length;
  const rows = [{ group: g, id: 'sig_sum', metric: 'Signal history', num: ev.length,
    value: ev.length ? `${ups} signal${ups === 1 ? '' : 's'} at 3/5 or more since ${since} · last ${short(ev[0].at)}` : `none at 3/5 or more since ${since}`,
    signal: ev.length ? tag[ev[0].kind] : '–',
    note: 'Every time this coin\'s spot buy or sell checklist reached 3 green or more, stepped up or down, or dropped back below 3, saved at the build that saw it ' +
      '(new candles or the daily CoinGlass reading). Newest first; the last ' + SHOW + ' are shown. A rise to 3, 4 or 5 is also emailed. ' +
      'Lists before 15 Nov had 4 checks (no structure shift). Rules of thumb, spot only, not financial advice.' }];
  ev.slice(0, SHOW).forEach((e, i) => {
    const L = LISTS[e.list].name;
    const from = e.prev == null ? 'first seen' : `from ${e.prev}/${e.prev_of}`;
    rows.push({ group: g, id: 'sig_' + i, metric: `${short(e.at)} · ${L}`, num: e.score,
      value: `${e.score}/${e.of} (${from}) · ${e.verdict}` + (e.price != null ? ` · 4H close ${money(e.price)}` : ''),
      signal: tag[e.kind],
      note: (e.green.length ? 'Green: ' + e.green.join(', ') + '.' : 'No checks green.') + (e.candle ? ` Last closed 4H candle ${e.candle}.` : '') });
  });
  return rows;
}

function alertText(e) {
  const L = LISTS[e.list].name;
  return {
    title: `${e.coin} ${L.toLowerCase()} checklist ${e.score}/${e.of}: ${e.verdict}`,
    body: `**${e.coin} · ${L} checklist reached ${e.score}/${e.of}** (${e.prev == null ? 'first reading' : 'was ' + e.prev + '/' + e.prev_of}) at the build of ${when(e.at)}.\n\n` +
      `- Verdict: ${e.verdict}\n- Green: ${e.green.join(', ') || 'none'}\n` + (e.price != null ? `- Last closed 4H close: ${money(e.price)} (${e.candle})\n` : '') +
      `\nDashboard: https://dashboards.mbzazad.workers.dev/btc-eth/ (Trade plan → Derivatives context → ${e.coin})\n\n` +
      `Rules of thumb, spot only, not financial advice. Sent by build/signals.js; close this issue when you've seen it.`,
  };
}

if (process.argv[2] === '--backfill') {
  const dir = process.argv[3], H = load();
  H.log = []; H.last = {};
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  for (const f of files) step(H, read(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))), f.replace(/\.json$/, ''));
  H.from = files.length ? files[0].replace(/\.json$/, '').slice(0, 10) : null;
  fs.writeFileSync(LOGF, JSON.stringify(H, null, 1));
  console.log(`${files.length} snapshots, ${H.log.length} entries`);
  for (const e of H.log) console.log(when(e.at), e.coin, e.list, `${e.prev}->${e.score}/${e.of}`, e.kind, e.verdict);
} else {
  try {
    const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8')), H = load();
    if (!H.from) H.from = new Date().toISOString().slice(0, 10);
    const added = step(H, read(snap), new Date().toISOString());
    for (const [coin, doc] of COINS) {
      const d = snap.docs[doc];
      if (d && Array.isArray(d.rows)) d.rows = d.rows.filter((r) => !/^sig_/.test(String(r.id))).concat(rowsFor(coin, H));
    }
    fs.writeFileSync(LOGF, JSON.stringify(H, null, 1));
    fs.writeFileSync(SNAP, JSON.stringify(snap));
    const alerts = added.filter((e) => e.kind === 'up').map(alertText);
    fs.writeFileSync(ALERTS, JSON.stringify(alerts));
    console.log(`${added.length} new log entries, ${alerts.length} alerts`);
    for (const e of added) console.log(e.coin, e.list, `${e.prev}->${e.score}/${e.of}`, e.kind, e.verdict);
  } catch (e) { console.log('::warning::Signal history skipped: ' + (e && e.message || e)); }
}
