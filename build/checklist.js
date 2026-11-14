/* Spot buy checklist (added 13 Nov 2026 at the owner's request): four checks per coin, scored on every build and
   added as rows at the end of that coin's CoinGlass table (Trade plan tab -> "Derivatives context (CoinGlass)").

     1. Flush over      CoinGlass: that coin's long liquidations in the last 4h < $20M and in the last 1h < $5M
     2. Leverage steady CoinGlass: open interest 4h change between -1% and +1%
     3. Funding reset   CoinGlass: OI-weighted funding <= 0%
     4. Price confirms  the page's own engine: last closed 4H close at or above the floor of the 1D spot buy zone
                        (Trade plan "Spot setup by timeframe", 1D row) and 4H RSI back above 30 (Trade plan, timeframe table)

   A mirror SPOT SELL / TRIM checklist (spot only: it means take some profit, never short) is added below it:
     1. Squeeze over    CoinGlass: short liquidations were large in 24h (>= $50M) and have faded (4h < $20M, 1h < $5M)
     2. Leverage piling OI 4h change >= +2% (late longs piling in)
     3. Funding hot     OI-weighted funding >= 0.03% (3x the 0.01% baseline)
     4. Price stalls    last closed 4H close at or above the floor of the page's 1D sell zone and 4H RSI >= 70

   Thresholds 1-3 of both lists are rules of thumb chosen with the owner (not backtested: free open-interest and
   funding history is not available; the daily CoinGlass readings kept in market-data build that history). Check 4 reads the numbers the page itself
   shows: the original page runs in jsdom on the snapshot this build just wrote, so the buy zone and RSI are the page's.
   A check whose input is missing shows "no data" and is not counted as green. Spot only; not financial advice.

   usage: node build/checklist.js <node_modules dir with jsdom and d3>   (after build/build.js; edits public/snapshot.json)
   If anything fails, the snapshot is left exactly as build.js wrote it (no checklist rows) and the script exits 0
   with a warning, so the dashboard still deploys. */
'use strict';
const fs = require('fs'), path = require('path');
const NM = path.resolve(process.argv[2] || 'node_modules');
const ROOT = path.resolve(__dirname, '..'), PUB = path.join(ROOT, 'public');
const SNAP = path.join(PUB, 'snapshot.json');
const RULES = { flush4h: 20e6, flush1h: 5e6, oiBand: 1, funding: 0, rsi: 30,
  squeeze24h: 50e6, oiPile: 2, fundingHot: 0.03, rsiHot: 70 };
const usd = (v) => (v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : '$' + Math.round(v / 1e3) + 'K');
const money = (v) => (Math.abs(v) < 100 ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(v).toLocaleString('en-US'));   // as the page shows prices

function pageNumbers(snapshot) {   // the original page's own spot plan and timeframe table, per coin
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
      const ready = w.__snap && w.dash && w.dash.data('tp_spot').status === 'ok';
      if (!ready) { if (++tries > 100) { w.close(); return reject(new Error('page engine did not produce a spot plan')); } return setTimeout(tick, 100); }
      const out = {};
      for (const a of ['BTC', 'ETH', 'SOL', 'BNB']) {
        w.__snap.setAsset(a);
        const spot = w.dash.data('tp_spot'), mtf = w.dash.data('tp_mtf'), sum = w.dash.data('tp_summary');
        if (spot.status !== 'ok' || mtf.status !== 'ok' || sum.status !== 'ok') { out[a] = null; continue; }
        const d1 = spot.data.find((r) => r.tf === '1D'), h4 = mtf.data.find((r) => r.tf === '4H');
        const m = d1 && String(d1.buy_zone).match(/([\d,.]+)\s*[–-]\s*([\d,.]+)/);
        const ms = d1 && String(d1.sell_zone).match(/([\d,.]+)\s*[–-]\s*([\d,.]+)/);   // first sell zone ("A–B then C–D")
        out[a] = { lo: m ? Number(m[1].replace(/,/g, '')) : null, hi: m ? Number(m[2].replace(/,/g, '')) : null, zone: d1 ? d1.buy_zone : null,
          slo: ms ? Number(ms[1].replace(/,/g, '')) : null, shi: ms ? Number(ms[2].replace(/,/g, '')) : null,
          close4h: sum.data[0].spot, rsi4h: h4 ? h4.rsi : null };
      }
      w.close(); resolve(out);
    };
    setTimeout(tick, 200);
  });
}

function rowsFor(coin, cg, px) {
  const find = (id) => (cg.rows || []).find((r) => r.id === id) || {};
  const liq = find('liq_btc_24h'), oi = find('oi_total'), fund = find('funding_oiw');
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const checks = [];
  // 1. flush over
  const l4 = num(liq.long_4h), l1 = num(liq.long_1h);
  checks.push({ id: 'chk_flush', metric: '1. Flush over', ok: l4 == null || l1 == null ? null : l4 < RULES.flush4h && l1 < RULES.flush1h,
    value: l4 == null || l1 == null ? 'no data yet' : `longs 4h ${usd(l4)} · 1h ${usd(l1)}`,
    note: `Green when ${coin} long liquidations are under $20M in the last 4h and under $5M in the last hour (CoinGlass).` });
  // 2. leverage steady
  const o4 = num(oi.num);
  checks.push({ id: 'chk_oi', metric: '2. Leverage steady', ok: o4 == null ? null : Math.abs(o4) <= RULES.oiBand,
    value: o4 == null ? 'no data yet' : `OI 4h ${o4 > 0 ? '+' : ''}${o4.toFixed(1)}%`,
    note: 'Green when open interest has stopped falling hard: its 4h change is between −1% and +1% (CoinGlass).' });
  // 3. funding reset
  const f = num(fund.num);
  checks.push({ id: 'chk_funding', metric: '3. Funding reset', ok: f == null ? null : f <= RULES.funding,
    value: f == null ? 'no data yet' : `funding ${f > 0 ? '+' : ''}${f.toFixed(4)}%`,
    note: 'Green at or below 0%: negative funding while price holds means shorts are crowding in, the classic spot-entry setup.' });
  // 4. price confirms
  const okPx = px && px.lo != null && px.close4h != null && px.rsi4h != null;
  checks.push({ id: 'chk_price', metric: '4. Price confirms', ok: okPx ? px.close4h >= px.lo && px.rsi4h > RULES.rsi : null,
    value: okPx ? `RSI ${px.rsi4h.toFixed(0)} · 4H ${money(px.close4h)} · zone ${money(px.lo)}–${money(px.hi)}` : 'no data yet',
    note: 'Green when the last closed 4H candle is at or above the floor of the 1D spot buy zone (Trade plan tab) and 4H RSI is back above 30.' +
      (okPx && px.close4h > px.hi ? ' Price is above the zone: a pullback toward it is the better entry.' : '') });
  const greens = checks.filter((c) => c.ok === true).length, known = checks.filter((c) => c.ok !== null).length;
  const verdict = greens === 4 ? 'All green: main buy' : greens >= 2 ? 'Starter buy at the zone floor only' : 'Wait';
  const sum = { group: 'Spot buy checklist', id: 'chk_sum', metric: 'Spot buy checklist', value: `${greens} / 4 green` + (known < 4 ? ` (${4 - known} no data)` : ''),
    num: greens, signal: verdict,
    note: checks.map((c) => c.metric.replace(/^\d\. /, '') + (c.ok === true ? ' ✓' : c.ok === false ? ' ✗' : ' –')).join(' · ') +
      '. 0–1 green: wait. 2–3: a small starter buy at the bottom of the buy zone. 4: add the main part. A daily close below the plan\'s stop means the zone failed. Rules of thumb, spot only, not financial advice.' };
  // the mark and verdict lead the value, so they show on a phone without scrolling the table sideways
  sum.value = `${greens}/4 green · ${verdict}` + (known < 4 ? ` (${4 - known} no data)` : '');
  return [sum].concat(checks.map((c) => ({ group: 'Spot buy checklist', id: c.id, metric: c.metric, value: (c.ok === true ? '✓ ' : c.ok === false ? '✗ ' : '– ') + c.value, num: c.ok === null ? null : c.ok ? 1 : 0,
    signal: c.ok === true ? '✓ Green' : c.ok === false ? '✗ Not yet' : '– No data', note: c.note })));
}

function sellRowsFor(coin, cg, px) {
  const find = (id) => (cg.rows || []).find((r) => r.id === id) || {};
  const liq = find('liq_btc_24h'), oi = find('oi_total'), fund = find('funding_oiw');
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const checks = [];
  const s24 = num(liq.short_24h), s4 = num(liq.short_4h), s1 = num(liq.short_1h);
  checks.push({ id: 'chs_squeeze', metric: '1. Squeeze over', ok: s24 == null || s4 == null || s1 == null ? null : s24 >= RULES.squeeze24h && s4 < RULES.flush4h && s1 < RULES.flush1h,
    value: s24 == null || s4 == null || s1 == null ? 'no data yet' : `shorts 24h ${usd(s24)} · 4h ${usd(s4)} · 1h ${usd(s1)}`,
    note: `Green when ${coin} short liquidations were large over 24h (at least $50M) and have faded (under $20M in 4h, under $5M in 1h): the squeeze fuel is used up.` });
  const o4 = num(oi.num);
  checks.push({ id: 'chs_oi', metric: '2. Leverage piling in', ok: o4 == null ? null : o4 >= RULES.oiPile,
    value: o4 == null ? 'no data yet' : `OI 4h ${o4 > 0 ? '+' : ''}${o4.toFixed(1)}%`,
    note: 'Green when open interest jumps 2% or more in 4h: late leveraged buyers piling in near the top.' });
  const f = num(fund.num);
  checks.push({ id: 'chs_funding', metric: '3. Funding hot', ok: f == null ? null : f >= RULES.fundingHot,
    value: f == null ? 'no data yet' : `funding ${f > 0 ? '+' : ''}${f.toFixed(4)}%`,
    note: 'Green at 0.03% or more (three times the 0.01% baseline): longs are paying heavily to stay in.' });
  const okPx = px && px.slo != null && px.close4h != null && px.rsi4h != null;
  checks.push({ id: 'chs_price', metric: '4. Price stalls', ok: okPx ? px.close4h >= px.slo && px.rsi4h >= RULES.rsiHot : null,
    value: okPx ? `RSI ${px.rsi4h.toFixed(0)} · 4H ${money(px.close4h)} · sell zone ${money(px.slo)}–${money(px.shi)}` : 'no data yet',
    note: 'Green when the last closed 4H candle is at or above the floor of the 1D sell zone (Trade plan tab) and 4H RSI is 70 or higher.' });
  const greens = checks.filter((c) => c.ok === true).length, known = checks.filter((c) => c.ok !== null).length;
  const verdict = greens === 4 ? 'All green: take a bigger profit' : greens >= 2 ? 'Trim a little' : 'Hold';
  const sum = { group: 'Spot sell / trim checklist', id: 'chs_sum', metric: 'Spot sell / trim checklist', value: `${greens}/4 green · ${verdict}` + (known < 4 ? ` (${4 - known} no data)` : ''),
    num: greens, signal: verdict,
    note: checks.map((c) => c.metric.replace(/^\d\. /, '') + (c.ok === true ? ' ✓' : c.ok === false ? ' ✗' : ' –')).join(' · ') +
      '. 0–1 green: hold. 2–3: trim a little (take partial profit) into the sell zone. 4: take a bigger profit; don\'t buy here. Spot only: this means selling some of what you hold, never shorting. Rules of thumb, not financial advice.' };
  return [sum].concat(checks.map((c) => ({ group: 'Spot sell / trim checklist', id: c.id, metric: c.metric, value: (c.ok === true ? '✓ ' : c.ok === false ? '✗ ' : '– ') + c.value, num: c.ok === null ? null : c.ok ? 1 : 0,
    signal: c.ok === true ? '✓ Green' : c.ok === false ? '✗ Not yet' : '– No data', note: c.note })));
}

(async () => {
  const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  let px;
  try { px = await pageNumbers(snap); } catch (e) { console.log('::warning::Spot checklists skipped: ' + e.message); return; }
  const report = {};
  for (const [coin, doc] of [['BTC', 'snap/derivs'], ['ETH', 'snap/derivs_eth'], ['SOL', 'snap/derivs_sol'], ['BNB', 'snap/derivs_bnb']]) {
    const cg = snap.docs[doc];
    if (!cg || !Array.isArray(cg.rows)) { report[coin] = 'no CoinGlass reading'; continue; }
    cg.rows = cg.rows.filter((r) => !/^ch[ks]_/.test(String(r.id))).concat(rowsFor(coin, cg, px[coin]), sellRowsFor(coin, cg, px[coin]));
    report[coin] = cg.rows.filter((r) => /^ch[ks]_/.test(r.id)).map((r) => r.metric + ': ' + r.value + ' [' + r.signal + ']');
  }
  fs.writeFileSync(SNAP, JSON.stringify(snap));
  console.log(JSON.stringify(report, null, 1));
})().catch((e) => { console.log('::warning::Spot checklists skipped: ' + (e && e.message || e)); process.exit(0); });
