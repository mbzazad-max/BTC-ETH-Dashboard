/* Spot buy checklist (added 13 Nov 2026 at the owner's request): four checks per coin, scored on every build and
   added as rows at the end of that coin's CoinGlass table (Trade plan tab -> "Derivatives context (CoinGlass)").

     1. Flush over      CoinGlass: that coin's long liquidations in the last 4h < $20M and in the last 1h < $5M
     2. Leverage steady CoinGlass: open interest 4h change between -1% and +1%
     3. Funding reset   CoinGlass: OI-weighted funding <= 0%
     4. Price confirms  the page's own engine: last closed 4H close at or above the floor of the 1D spot buy zone
                        (Trade plan "Spot setup by timeframe", 1D row) and 4H RSI back above 30 (Trade plan, timeframe table)

     5. Structure shift a bullish 4H market structure shift (build/structure.js: sweep of a swing low, close above the
                        last lower high, with displacement) whose sweep low reached the 1D buy zone (added 15 Nov 2026).
                        Required: without it the verdict is Wait (a tiny starter only when 3+ other checks and the weekly
                        trend are up). With it: 3-4 green = starter buy at the MSS entry (middle of its FVG), 5 = main buy;
                        against a down 1D trend the size is halved. Its entry and stop replace the zone's while it stands.
   When the page finds no support zone below price ("No qualified support", e.g. SOL at new lows on 15 Nov 2026) there is
   no 1D plan: checks 4 and 5 are red with that reason and the verdict is Wait, and the sell list uses the nearest
   resistance zone of the page's engine instead of the 1D sell zone.

   A mirror SPOT SELL / TRIM checklist (spot only: it means take some profit, never short) is added below it:
     1. Squeeze over    CoinGlass: short liquidations were large in 24h (>= $50M) and have faded (4h < $20M, 1h < $5M)
     2. Leverage piling OI 4h change >= +2% (late longs piling in)
     3. Funding hot     OI-weighted funding >= 0.03% (3x the 0.01% baseline)
     4. Price stalls    last closed 4H close at or above the floor of the page's 1D sell zone and 4H RSI >= 70
     5. Structure breaks a bearish 4H MSS whose sweep high reached the 1D sell zone; a bigger profit needs it (5/5)

   Thresholds 1-3 of both lists are rules of thumb chosen with the owner (not backtested: free open-interest and
   funding history is not available; the daily CoinGlass readings kept in market-data build that history). Check 4 reads the numbers the page itself
   shows: the original page runs in jsdom on the snapshot this build just wrote, so the buy zone and RSI are the page's.
   A check whose input is missing shows "no data" and is not counted as green. Spot only; not financial advice.

   Below both, the Structure test rows: zone only vs zone + MSS replayed since 2025 (build/structure_test.js, read
   from history/structure_test.json when it is there).

   usage: node build/checklist.js <node_modules dir with jsdom and d3>   (after build/build.js; edits public/snapshot.json)
   If anything fails, the snapshot is left exactly as build.js wrote it (no checklist rows) and the script exits 0
   with a warning, so the dashboard still deploys. */
'use strict';
const fs = require('fs'), path = require('path');
const ST = require('./structure.js');
const NM = path.resolve(process.argv[2] || 'node_modules');
const ROOT = path.resolve(__dirname, '..'), PUB = path.join(ROOT, 'public');
const SNAP = path.join(PUB, 'snapshot.json');
const RULES = { flush4h: 20e6, flush1h: 5e6, oiBand: 1, funding: 0, rsi: 30,
  squeeze24h: 50e6, oiPile: 2, fundingHot: 0.03, rsiHot: 70 };
// SOL and BNB (14 Nov 2026): the dollar limits of checks 1 (flush / squeeze) are scaled to each coin's liquidation size,
// set from CoinGlass on 14 Nov (24h liquidations: ETH ~$260M, SOL ~$53M, BNB ~$7.5M): SOL x0.25, BNB x0.05 of the BTC/ETH limits.
const SCALE = { BTC: 1, ETH: 1, SOL: 0.25, BNB: 0.05 };
const rulesFor = (coin) => { const k = SCALE[coin] || 1; return Object.assign({}, RULES, { flush4h: RULES.flush4h * k, flush1h: RULES.flush1h * k, squeeze24h: RULES.squeeze24h * k }); };
const usd = (v) => (v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : '$' + Math.round(v));
const lim = (v) => (v >= 1e6 ? '$' + +(v / 1e6).toFixed(2) + 'M' : '$' + +(v / 1e3).toFixed(0) + 'K');   // a checklist limit, e.g. $20M, $1.25M, $250K
const money = (v) => (Math.abs(v) < 100 ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(v).toLocaleString('en-US'));   // as the page shows prices

// the 4H market structure of a coin from the snapshot's own 4H candles (the ones the page shows)
function structureOf(snapshot, coin) {
  const d = snapshot.docs['snap/' + coin.toLowerCase() + '_4h-0'];
  if (!d || !Array.isArray(d.rows) || d.rows.length < 60) return null;
  const r = d.rows, B = { t: r.map((x) => x[0]), o: r.map((x) => x[1]), h: r.map((x) => x[2]), l: r.map((x) => x[3]), c: r.map((x) => x[4]) };
  const ev = ST.detect(B), at = (e) => e && Object.assign(e, { when: B.t[e.conf_i].replace('T', ' ') + ' UTC' });
  return { bull: at(ST.activeAt(B, ev, 1)), bear: at(ST.activeAt(B, ev, -1)), last: at(ev[ev.length - 1] || null) };
}
const mssTxt = (e) => `${e.dir > 0 ? 'closed above' : 'closed below'} ${money(e.level)} after a sweep to ${money(e.sweep)} (${e.when}, ${e.age} candles ago) · entry ${money(e.entry)}` +
  (e.fvg ? ` (FVG ${money(e.fvg.lo)}–${money(e.fvg.hi)})` : ' (retest of the broken level)') + ` · stop ${money(e.stop)}`;

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
        // no 1D plan row: the page found no support zone below price ("No qualified support"); the sell zone is then the
        // nearest resistance zone of the page's own engine (its Key levels), so the sell checklist still works
        const eng = w.dash.data('tp_engine'), E0 = eng.status === 'ok' ? eng.data[0] : null;
        const noZone = !m && !!E0 && !(E0.zones || []).some((z) => z.role === 'S' && z.lo <= E0.spot);
        const nr = !ms && E0 ? (E0.zones || []).filter((z) => z.role === 'R' && z.hi >= E0.spot).sort((x, y) => x.lo - y.lo)[0] : null;
        out[a] = { lo: m ? Number(m[1].replace(/,/g, '')) : null, hi: m ? Number(m[2].replace(/,/g, '')) : null, zone: d1 ? d1.buy_zone : null, noZone,
          lo365: E0 ? E0.lo365 : null,
          slo: ms ? Number(ms[1].replace(/,/g, '')) : nr ? nr.lo : null, shi: ms ? Number(ms[2].replace(/,/g, '')) : nr ? nr.hi : null,
          close4h: sum.data[0].spot, rsi4h: h4 ? h4.rsi : null,
          trend1d: (mtf.data.find((r) => r.tf === '1D') || {}).trend || null, trend1w: (mtf.data.find((r) => r.tf === '1W') || {}).trend || null };
      }
      w.close(); resolve(out);
    };
    setTimeout(tick, 200);
  });
}

function rowsFor(coin, cg, px, st) {
  const RULES = rulesFor(coin);
  const find = (id) => (cg.rows || []).find((r) => r.id === id) || {};
  const liq = find('liq_btc_24h'), oi = find('oi_total'), fund = find('funding_oiw');
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const checks = [];
  // 1. flush over
  const l4 = num(liq.long_4h), l1 = num(liq.long_1h);
  checks.push({ id: 'chk_flush', metric: '1. Flush over', ok: l4 == null || l1 == null ? null : l4 < RULES.flush4h && l1 < RULES.flush1h,
    value: l4 == null || l1 == null ? 'no data yet' : `longs 4h ${usd(l4)} · 1h ${usd(l1)}`,
    note: `Green when ${coin} long liquidations are under ${lim(RULES.flush4h)} in the last 4h and under ${lim(RULES.flush1h)} in the last hour (CoinGlass).` });
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
  const noZone = !!(px && px.noZone);
  checks.push({ id: 'chk_price', metric: '4. Price confirms', ok: okPx ? px.close4h >= px.lo && px.rsi4h > RULES.rsi : noZone ? false : null,
    value: okPx ? `RSI ${px.rsi4h.toFixed(0)} · 4H ${money(px.close4h)} · zone ${money(px.lo)}–${money(px.hi)}` :
      noZone ? `no buy zone: 4H ${money(px.close4h)} is below every support zone the page finds` : 'no data yet',
    note: 'Green when the last closed 4H candle is at or above the floor of the 1D spot buy zone (Trade plan tab) and 4H RSI is back above 30.' +
      (okPx && px.close4h > px.hi ? ' Price is above the zone: a pullback toward it is the better entry.' : '') });
  // 5. structure shift (required for a buy)
  const b = st && st.bull, inZone = b && px && px.hi != null && b.sweep <= px.hi + 0.25 * b.atr;
  const okS = !st || !px ? null : noZone ? false : px.hi == null ? null : !!inZone;
  checks.push({ id: 'chk_mss', metric: '5. Structure shift', ok: okS,
    value: okS == null ? 'no data yet' : noZone ? (b ? `4H MSS: ${mssTxt(b)}. With no support zone below, this may be a new base forming: not a buy until the page finds a zone` : 'no buy zone to confirm, and no bullish 4H MSS: price is still making new lows') : inZone ? '4H MSS: ' + mssTxt(b) : b ? `4H MSS at ${money(b.level)}, but its sweep (${money(b.sweep)}) never reached the buy zone` :
      st.bear ? `no bullish MSS: 4H shifted bearish below ${money(st.bear.level)} (${st.bear.when})` : 'no bullish MSS in the last 5 days: 4H structure has not turned up',
    note: 'Green when a 4H candle closed above the last lower high after price swept a swing low inside the 1D buy zone, with displacement (a fair value gap or a candle body of 1.2× ATR). ' +
      'Required for a buy: without a structure shift the zone may still be failing. Buy at the entry shown (middle of the FVG), stop below the sweep low. Stays valid 5 days unless a 4H close goes below the sweep low.' });
  const greens = checks.filter((c) => c.ok === true).length, known = checks.filter((c) => c.ok !== null).length;
  const others = checks.slice(0, 4).filter((c) => c.ok === true).length, mss = okS === true;
  let verdict = mss ? (greens === 5 ? 'All green: main buy' : greens >= 3 ? 'Starter buy at the MSS entry' : 'Wait: structure is up, other checks not yet')
    : noZone ? 'Wait: no support zone below price' : others >= 3 && px && px.trend1w === 'Up' ? 'Tiny starter only: no structure shift yet' : 'Wait: no structure shift yet';
  if (mss && greens >= 3 && px && px.trend1d === 'Down') verdict += ' (half size: 1D trend down)';
  const sum = { group: 'Spot buy checklist', id: 'chk_sum', metric: 'Spot buy checklist', value: '', num: greens, signal: verdict,
    note: checks.map((c) => c.metric.replace(/^\d\. /, '') + (c.ok === true ? ' ✓' : c.ok === false ? ' ✗' : ' –')).join(' · ') +
      '. A 4H structure shift (check 5) is required. Without it: wait (a tiny starter only if 3+ other checks are green and the weekly trend is up). ' +
      'With it: 3–4 green = a starter buy at the MSS entry, 5 = add the main part; half size when the 1D trend is down. A 4H close below the sweep low or a daily close below the plan\'s stop means the setup failed. Rules of thumb, spot only, not financial advice.' };
  // the mark and verdict lead the value, so they show on a phone without scrolling the table sideways
  sum.value = `${greens}/5 green · ${verdict}` + (known < 5 ? ` (${5 - known} no data)` : '');
  return [sum].concat(checks.map((c) => ({ group: 'Spot buy checklist', id: c.id, metric: c.metric, value: (c.ok === true ? '✓ ' : c.ok === false ? '✗ ' : '– ') + c.value, num: c.ok === null ? null : c.ok ? 1 : 0,
    signal: c.ok === true ? '✓ Green' : c.ok === false ? '✗ Not yet' : '– No data', note: c.note })));
}

function sellRowsFor(coin, cg, px, st) {
  const RULES = rulesFor(coin);
  const find = (id) => (cg.rows || []).find((r) => r.id === id) || {};
  const liq = find('liq_btc_24h'), oi = find('oi_total'), fund = find('funding_oiw');
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const checks = [];
  const s24 = num(liq.short_24h), s4 = num(liq.short_4h), s1 = num(liq.short_1h);
  checks.push({ id: 'chs_squeeze', metric: '1. Squeeze over', ok: s24 == null || s4 == null || s1 == null ? null : s24 >= RULES.squeeze24h && s4 < RULES.flush4h && s1 < RULES.flush1h,
    value: s24 == null || s4 == null || s1 == null ? 'no data yet' : `shorts 24h ${usd(s24)} · 4h ${usd(s4)} · 1h ${usd(s1)}`,
    note: `Green when ${coin} short liquidations were large over 24h (at least ${lim(RULES.squeeze24h)}) and have faded (under ${lim(RULES.flush4h)} in 4h, under ${lim(RULES.flush1h)} in 1h): the squeeze fuel is used up.` });
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
    note: 'Green when the last closed 4H candle is at or above the floor of the 1D sell zone (Trade plan tab) and 4H RSI is 70 or higher.' +
      (px && px.noZone ? ' With no 1D plan (no support below), the sell zone is the nearest resistance zone in Key levels.' : '') });
  const e = st && st.bear, inZ = e && px && px.slo != null && e.sweep >= px.slo - 0.25 * e.atr;
  const okS = !st || !px || px.slo == null ? null : !!inZ;
  checks.push({ id: 'chs_mss', metric: '5. Structure breaks', ok: okS,
    value: okS == null ? 'no data yet' : inZ ? '4H bearish MSS: ' + mssTxt(e) : e ? `4H bearish MSS at ${money(e.level)}, but its sweep (${money(e.sweep)}) never reached the sell zone` : 'no bearish MSS from the sell zone in the last 5 days',
    note: 'Green when a 4H candle closed below the last higher low after price swept a swing high inside the 1D sell zone, with displacement. Needed for the bigger profit (5/5). Spot only: it means selling some of what you hold, never shorting.' });
  const greens = checks.filter((c) => c.ok === true).length, known = checks.filter((c) => c.ok !== null).length;
  const verdict = greens === 5 ? 'All green: take a bigger profit' : greens >= 2 ? 'Trim a little' : 'Hold';
  const sum = { group: 'Spot sell / trim checklist', id: 'chs_sum', metric: 'Spot sell / trim checklist', value: `${greens}/5 green · ${verdict}` + (known < 5 ? ` (${5 - known} no data)` : ''),
    num: greens, signal: verdict,
    note: checks.map((c) => c.metric.replace(/^\d\. /, '') + (c.ok === true ? ' ✓' : c.ok === false ? ' ✗' : ' –')).join(' · ') +
      '. 0–1 green: hold. 2–4: trim a little (take partial profit) into the sell zone. 5, including a 4H bearish structure shift: take a bigger profit; don\'t buy here. Spot only: this means selling some of what you hold, never shorting. Rules of thumb, not financial advice.' };
  return [sum].concat(checks.map((c) => ({ group: 'Spot sell / trim checklist', id: c.id, metric: c.metric, value: (c.ok === true ? '✓ ' : c.ok === false ? '✗ ' : '– ') + c.value, num: c.ok === null ? null : c.ok ? 1 : 0,
    signal: c.ok === true ? '✓ Green' : c.ok === false ? '✗ Not yet' : '– No data', note: c.note })));
}

// the replay of zone only vs zone + MSS (history/structure_test.json), as rows under the checklists
function testRows(coin, T) {
  if (!T || !T.coins || !T.coins[coin]) return [];
  const pct = (x) => (x == null ? '–' : Math.round(x * 100) + '%'), r = (x) => (x == null ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2) + 'R');
  const line = (s) => `${pct(s.win_rate)} hit Target 1 · avg ${r(s.avg_r)} (${s.trades} trades: ${s.t1} T1, ${s.stop} stopped, ${s.timeout} timed out)`;
  const c = T.coins[coin], a = T.all, g = 'Structure test';
  const better = (x, y) => x.avg_r != null && y.avg_r != null && x.trades >= 5 ? (x.avg_r > y.avg_r ? 'MSS better' : 'Zone only better') : 'Too few trades';
  const how = `Replayed on closed 4H candles from ${T.from} to ${T.to}, using the buy zone, stop and Target 1 the page itself showed each day. Zone only: limit buy at the middle of the 1D buy zone with the page's stop. ` +
    'Zone + MSS: buy only after a 4H structure shift whose sweep reached the zone, at its FVG entry, stop below the sweep low. One trade at a time; a candle touching stop and target counts as a loss; trades close after 10 days. Past results do not promise future ones.';
  return [
    { group: g, id: 'stt_mss', metric: `Structure test: zone + MSS (${coin})`, value: line(c.mss), num: c.mss.avg_r, signal: better(c.mss, c.zone),
      note: (c.mss.trades > 1 ? `Without its single best trade (${r(c.mss.best_r)}): avg ${r(c.mss.avg_r_ex_best)}. ` : '') + how },
    { group: g, id: 'stt_zone', metric: `Structure test: zone only (${coin})`, value: line(c.zone), num: c.zone.avg_r, signal: '–', note: how },
    { group: g, id: 'stt_all', metric: 'Structure test: all 4 coins', value: `MSS ${pct(a.mss.win_rate)} to T1, avg ${r(a.mss.avg_r)} (${a.mss.trades}) · zone only ${pct(a.zone.win_rate)}, avg ${r(a.zone.avg_r)} (${a.zone.trades})`,
      num: a.mss.avg_r, signal: better(a.mss, a.zone),
      note: `BTC, ETH, SOL and BNB together. Without the single best MSS trade (${r(a.mss.best_r)}) the MSS average is ${r(a.mss.avg_r_ex_best)}; zone only without its best: ${r(a.zone.avg_r_ex_best)}. The MSS sample is small, so treat it as a lean, not proof.` },
  ];
}

(async () => {
  const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  let px;
  try { px = await pageNumbers(snap); } catch (e) { console.log('::warning::Spot checklists skipped: ' + e.message); return; }
  const report = {};
  const TF = path.join(ROOT, 'history', 'structure_test.json'), T = fs.existsSync(TF) ? JSON.parse(fs.readFileSync(TF, 'utf8')) : null;
  for (const [coin, doc] of [['BTC', 'snap/derivs'], ['ETH', 'snap/derivs_eth'], ['SOL', 'snap/derivs_sol'], ['BNB', 'snap/derivs_bnb']]) {
    const cg = snap.docs[doc];
    if (!cg || !Array.isArray(cg.rows)) { report[coin] = 'no CoinGlass reading'; continue; }
    let st = null; try { st = structureOf(snap, coin); } catch (e) { console.log('::warning::' + coin + ' structure skipped: ' + e.message); }
    cg.rows = cg.rows.filter((r) => !/^(ch[ks]|stt)_/.test(String(r.id))).concat(rowsFor(coin, cg, px[coin], st), sellRowsFor(coin, cg, px[coin], st), testRows(coin, T));
    report[coin] = cg.rows.filter((r) => /^(ch[ks]|stt)_/.test(r.id)).map((r) => r.metric + ': ' + r.value + ' [' + r.signal + ']');
  }
  fs.writeFileSync(SNAP, JSON.stringify(snap));
  console.log(JSON.stringify(report, null, 1));
})().catch((e) => { console.log('::warning::Spot checklists skipped: ' + (e && e.message || e)); process.exit(0); });
