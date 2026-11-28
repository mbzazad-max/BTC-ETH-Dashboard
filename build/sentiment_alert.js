/* Market sentiment email alert (added 28 Nov 2026 at the owner's request).

   What it watches: the "Overall" row of the Forecast tab's Market sentiment card (BTC view). The page sums the tilts of
   its scoring gauges (stablecoin dominance, alt market cap TOTAL2, Fear & Greed) and labels the total:
       >= +1  Risk-on      <= -1  Risk-off      otherwise  Neutral
   The page's own engine works this out: the original page runs in jsdom on the snapshot this build just wrote, exactly
   as build/checklist.js does, so the label is the one the board shows.

   On every build:
     - reads the Overall label, the total and every gauge row;
     - when the label differs from the last one saved in history/sentiment.json (or on the first run), writes an alert to
       /tmp/sentiment_alerts.json; the workflow's "Email ..." step opens a GitHub issue that mentions the owner, and
       GitHub emails it. The email explains what changed, each gauge's reading and tilt, and how to read the label;
     - keeps a log of every label change (last 500) in history/sentiment.json.
   Labels can only change at a build (new 4H candles, the daily CoinMarketCap load, a Refresh).

   usage: node build/sentiment_alert.js <node_modules dir with jsdom and d3>   (after build/build.js)
          SENT_STATE / SENT_ALERTS env vars override the state and alert file paths (for tests).
   Any failure exits 0 with a warning, so the dashboard still deploys. Not financial advice. */
'use strict';
const fs = require('fs'), path = require('path');
const NM = path.resolve(process.argv[2] || 'node_modules');
const ROOT = path.resolve(__dirname, '..'), PUB = path.join(ROOT, 'public');
const SNAP = path.join(PUB, 'snapshot.json');
const STATE = process.env.SENT_STATE || path.join(ROOT, 'history', 'sentiment.json');
const ALERTS = process.env.SENT_ALERTS || '/tmp/sentiment_alerts.json';
const URL = 'https://dashboards.mbzazad.workers.dev/btc-eth/#forecast';

function pageSentiment(snapshot) {   // the original page's own Market sentiment rows, BTC view
  const { JSDOM } = require(path.join(NM, 'jsdom'));
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8')
    .replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>', () => '<script>' + fs.readFileSync(path.join(NM, 'd3/dist/d3.min.js'), 'utf8') + '</script>')
    .replace('<script src="shim.js"></script>', () => '<script>' + fs.readFileSync(path.join(PUB, 'shim.js'), 'utf8') + '</script>')
    .replace('<script src="cloud.js"></script>', '').replace(/<link[^>]+>/g, '');
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://build.local/btc-eth/', beforeParse(w) {
    w.fetch = async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(snapshot)) });
    w.SVGElement.prototype.getComputedTextLength = function () { return (this.textContent || '').length * 7; };
  } });
  const w = dom.window;
  return new Promise((resolve, reject) => {
    let tries = 0;
    const tick = () => {
      const ms = w.__snap && w.dash && w.dash.data('mkt_sentiment');
      const ok = ms && ms.status === 'ok' && ms.data.some((r) => r.id === 'overall');
      if (!ok) { if (++tries > 100) { w.close(); return reject(new Error('page engine did not produce the Market sentiment card')); } return setTimeout(tick, 100); }
      w.__snap.setAsset('BTC');
      const rows = JSON.parse(JSON.stringify(w.dash.data('mkt_sentiment').data));
      w.close(); resolve(rows);
    };
    setTimeout(tick, 200);
  });
}

const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
const pct = (v) => (v == null ? '' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(1) + '%');
const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '/').replace(/\n/g, ' ');

const MEANING = {
  'Risk-on': 'The scoring gauges lean **bullish for BTC** over the next couple of weeks. This is mostly a *contrarian* reading: fear is high and/or lots of cash sits in stablecoins, and historically that has been a better-than-usual time to buy. It is **not** a sign the market is calm or rising.\n\n' +
    '**How to use it:** a better-than-usual time to *add in stages* (for example a larger DCA step). The edge is modest: from these conditions BTC was higher 14 days later about 61% of the time vs 54% normally, so roughly 4 times in 10 it was still lower. Fear can last weeks. Works best when price is also at support or the trend is turning up (check the Trade plan tab).',
  'Risk-off': 'The scoring gauges lean **bearish for BTC**: greed is high, stablecoin dominance is low (cash already deployed) and/or alts are falling hard. Historically forward returns have been weaker from here.\n\n' +
    '**How to use it:** a time to *stop adding and consider trimming some profit*, not a signal to sell everything. Sentiment can stay euphoric for a while in a bull run. Check trend and structure on the Trade plan tab before acting.',
  'Neutral': 'The gauges are not leaning either way (total between −1 and +1).\n\n**How to use it:** no tilt. Stick to your normal plan (regular DCA, your own levels).'
};

function body(now, prev) {
  const rows = now.rows.filter((r) => r.id !== 'overall');
  const head = prev ? `Market sentiment changed from **${prev.label}** (${sgn(prev.total)}, since ${prev.since}) to **${now.label}** (${sgn(now.total)}).`
    : `Market sentiment alerts are now on. Current reading: **${now.label}** (${sgn(now.total)}). You will get an email each time the label changes.`;
  const tbl = ['| Gauge | Now | 7D / recent | Read | Tilt |', '|---|---|---|---|---|']
    .concat(rows.map((r) => `| ${cell(r.gauge)} | ${cell(r.now)} | ${r.d7 != null ? pct(r.d7) : cell(r.trend === '—' ? '' : r.trend)} | ${cell(r.read)} | ${r.score ? sgn(r.score) : '0 (context)'} |`))
    .concat([`| **Overall** | **${now.label}** | | Sum of tilts | **${sgn(now.total)}** |`]);
  const scoring = rows.filter((r) => r.score);
  const drivers = scoring.length ? scoring.map((r) => `${r.gauge} ${sgn(r.score)}`).join(', ') : 'no gauge leaning either way';
  const moved = prev && prev.scores ? scoring.concat(rows.filter((r) => !r.score && prev.scores[r.id]))
    .filter((r) => (prev.scores[r.id] || 0) !== (r.score || 0))
    .map((r) => `${r.gauge}: ${sgn(prev.scores[r.id] || 0)} → ${sgn(r.score || 0)}`) : [];
  return [
    '## ' + head, '',
    '**What drives it now:** ' + drivers + (moved.length ? '.  \n**What changed:** ' + moved.join('; ') + '.' : '.'), '',
    tbl.join('\n'), '',
    '### What this means', MEANING[now.label], '',
    '### Things to keep in mind',
    '- Labels: total ≥ +1 = Risk-on, ≤ −1 = Risk-off, otherwise Neutral. Only the gauges with a non-zero tilt count; the others are context.',
    '- It is a short-horizon (about 2 weeks) contrarian read. For long-term investing use it to pace buying and trimming, not to decide whether to own BTC.',
    '- Your own backtest (htf_structure_backtest) found the TOTAL2 tilt had no edge; the stablecoin edge is real but fading since 2023 (57% vs 55%).',
    '- ETF net flows are shown for context (score 0). Backtest (etf_flows_backtest): heavy BTC outflows were followed by more weakness (39% up after 14 days vs 51%), so they weaken a contrarian Risk-on; inflows while price falls (dip buying) leaned bullish (59%).',
    '- It does not show the trend. Check the daily/weekly trend and 4H structure on the Trade plan tab before acting.', '',
    `Board: ${URL}  ·  Build ${now.at}`, '',
    '_Not financial advice._'
  ].join('\n');
}

(async () => {
  try {
    const snapshot = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
    const rows = await pageSentiment(snapshot);
    const ov = rows.find((r) => r.id === 'overall');
    const at = (() => { try { return require(path.join(PUB, 'freshness.json')).generated; } catch (e) { return new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; } })();
    const now = { label: ov.now, total: Math.round(ov.score * 10) / 10, at, rows, scores: Object.fromEntries(rows.filter((r) => r.id !== 'overall').map((r) => [r.id, r.score || 0])) };
    const st = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { last: null, log: [] };
    const prev = st.last;
    console.log(`Market sentiment (BTC): ${now.label} ${sgn(now.total)}${prev ? ` (saved: ${prev.label} ${sgn(prev.total)})` : ' (first run)'}`);
    if (!prev || prev.label !== now.label) {
      const title = prev ? `Market sentiment: ${prev.label} → ${now.label} (${sgn(now.total)})` : `Market sentiment alerts on: ${now.label} (${sgn(now.total)})`;
      fs.writeFileSync(ALERTS, JSON.stringify([{ title, body: body(now, prev) }]));
      st.log.unshift({ at, from: prev ? prev.label : null, to: now.label, total: now.total, scores: now.scores });
      st.log = st.log.slice(0, 500);
      st.last = { label: now.label, total: now.total, since: at, scores: now.scores };
    } else {
      st.last.total = now.total; st.last.scores = now.scores;
    }
    st.last.checked = at;
    fs.writeFileSync(STATE, JSON.stringify(st, null, 1) + '\n');
  } catch (e) {
    console.log('::warning::Market sentiment alert skipped: ' + (e && e.message));
  }
  process.exit(0);
})();
