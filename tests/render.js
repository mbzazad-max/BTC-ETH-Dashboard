/* Render check: public/index.html (the original page + shim.js + cloud.js) opened with the built public/snapshot.json,
   once with each coin (BTC, ETH, SOL, BNB) selected. Fails on any page error, a missing number, or a futures section.
   usage: node tests/render.js <node_modules dir that has jsdom and d3> */
'use strict';
const fs = require('fs'), path = require('path');
const NM = path.resolve(process.argv[2]);
const { JSDOM, VirtualConsole } = require(path.join(NM, 'jsdom'));
const PUB = path.resolve(__dirname, '..', 'public');
async function view(asset) {
  const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8')
    .replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>', () => '<script>' + fs.readFileSync(path.join(NM, 'd3/dist/d3.min.js'), 'utf8') + '</script>')
    .replace('<script src="shim.js"></script>', () => '<script>' + fs.readFileSync(path.join(PUB, 'shim.js'), 'utf8') + '</script>')
    .replace('<script src="cloud.js"></script>', () => '<script>' + fs.readFileSync(path.join(PUB, 'cloud.js'), 'utf8') + '</script>')
    .replace(/<link[^>]+>/g, '');
  const errors = [], vc = new VirtualConsole(); vc.on('error', (...a) => errors.push(a.map(String).join(' '))); vc.on('jsdomError', (e) => errors.push('jsdom: ' + e.message));
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'https://dashboards.example/btc-eth/', beforeParse(w) {
    try { w.localStorage.setItem('bd_asset', asset); } catch (e) { /* none */ }
    w.fetch = async (u) => { const f = String(u);
      if (f.includes('/api/')) return { ok: false, status: 302, json: async () => ({}) };             // visitor without the owner login
      const b = fs.readFileSync(path.join(PUB, f.replace(/^.*\//, '').split('?')[0]), 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(b) }; };
    w.SVGElement.prototype.getComputedTextLength = function () { return (this.textContent || '').length * 7; };
    Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return 900; } });
  } });
  const w = dom.window, d = w.document, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(2500);
  for (const tab of ['patterns', 'plan', 'forecast']) { d.getElementById(tab).click(); await sleep(400); }
  const t = (s) => { const e = d.querySelector(s); return e ? e.textContent.trim().replace(/\s+/g, ' ') : ''; };
  const rows = (src) => [...d.querySelectorAll(`table[data-source="${src}"] tbody tr`)].length;
  const v = { asset, h1: t('h1'), lede: t('#lede'), status: t('#rfAt'), cg: t('#rfCg'), cmc: t('#rfCr'), fc1w: t('#fc-7 .big'), price4h: t('.tp-strip .v'),
    levels: rows('tp_levels'), spot: rows('tp_spot'), derivs: rows('derivs'), signals: rows('fc_signals'), sentiment: rows('mkt_sentiment'), events: rows('fc_events'),
    monthly: rows('monthly_grid'), checklist: [...d.querySelectorAll('table[data-source="derivs"] tbody tr')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()).filter((x) => /checklist|Flush over|Leverage steady|Funding reset|Price confirms|Squeeze over|Leverage piling in|Funding hot|Price stalls|Structure shift|Structure breaks|Structure test/.test(x)).length, futures: !!d.getElementById('plan-futures'), refresh_hidden: d.getElementById('rfBtn').hidden && d.getElementById('ghRefresh').hidden,
    fresh: t('#fresh summary'), errors,
    // the artifact host's head must be there: UTF-8 and "hidden" really hides (else the loading box and empty pills show)
    loading_box_shown: !d.getElementById('rfEmpty').hidden || !/\[hidden\]:not\(\[hidden=until-found i\]\)\{display:none!important\}/.test(d.head.innerHTML),
    utf8: d.characterSet === 'UTF-8' && t('#rfAt').indexOf('Â') < 0 };
  w.close(); return v;
}
(async () => {
  const out = [await view('BTC'), await view('ETH'), await view('SOL'), await view('BNB')];
  const noCg = (v) => (v.asset === 'SOL' || v.asset === 'BNB') && /not saved yet/.test(v.cg);   // until the CoinGlass load includes SOL and BNB
  const bad = out.filter((v) => v.errors.length || /—/.test(v.fc1w + v.price4h) || !v.fc1w || v.levels < 3 || v.spot < 3 || (v.derivs < 6 && !noCg(v)) || v.signals < 8 || v.sentiment < 6 || v.monthly < 5 || (v.checklist < 15 && !noCg(v)) || v.futures || !v.refresh_hidden || v.loading_box_shown || !v.utf8);
  console.log(JSON.stringify(out, null, 1));
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
