/* USDT.D tab (21 Nov 2026): draws public/usdtd.json (built by build/usdtd.js) into the "USDT.D" page.
   The page calls window.__usdtd() when the tab is shown (tools/page.js edit). Read-only; no effect on other tabs. */
(function () {
  'use strict';
  let J = null, loading = null, tf = 'daily', span = '3y';
  const NS = [20, 50, 100, 200];
  const COL = { close: 'var(--ink)', 20: 'var(--acc)', 50: 'var(--warn)', 100: '#9b59b6', 200: 'var(--dn)' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dd = (s) => { if (!s) return '—'; const d = new Date(s + 'T00:00:00Z'); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
  const f2 = (v) => (v == null ? '—' : v.toFixed(2));
  const sp = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%');
  const usd = (v) => (v == null ? '—' : '$' + Math.round(v).toLocaleString('en-US'));
  const el = (tag, attrs, html) => { const e = document.createElement(tag); if (attrs) Object.assign(e, attrs); if (html != null) e.innerHTML = html; return e; };
  const cls = (v) => (v == null ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const frac = (a) => (a && a[1] ? `${a[0]}/${a[1]}` : '—');
  const fracPct = (a) => (a && a[1] ? ` <span style="color:var(--muted)">(${Math.round(a[0] / a[1] * 100)}%)</span>` : '');
  const root = () => document.getElementById('usdtd-root');

  function load() {
    if (J) return Promise.resolve(J);
    if (!loading) loading = fetch('usdtd.json', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((j) => (J = j));
    return loading;
  }

  function card(title, note) {
    const c = el('div', { className: 'br-card' });
    c.append(el('h2', null, title));
    if (note) c.append(el('p', { className: 'note' }, note));
    return c;
  }
  function table(head, rows) {
    const t = el('table', { className: 'tp-t' });
    t.append(el('thead', null, '<tr>' + head.map((h) => `<th>${h}</th>`).join('') + '</tr>'));
    const tb = el('tbody'); rows.forEach((r) => tb.append(el('tr', null, r.map((c) => `<td>${c}</td>`).join('')))); t.append(tb);
    const w = el('div', { className: 'br-scroll' }); w.style.overflowX = 'auto'; w.append(t); return w;
  }

  // ---------- 0. this week's read ----------
  const VCOL = { 'Bear': ['var(--dn)', 'var(--dn-bg)'], 'Turning bear': ['var(--warn)', 'var(--warn-bg)'], 'Bear, possibly ending': ['var(--warn)', 'var(--warn-bg)'], 'Turning bull': ['var(--acc)', 'var(--acc-bg)'], 'Bull': ['var(--up)', 'var(--up-bg)'] };
  const vpill = (v) => { const c = VCOL[v] || ['var(--muted)', 'var(--soft)']; return `<span class="rf-pill" style="color:${c[0]};background:${c[1]}">${v}</span>`; };
  function readCard() {
    const R = J.read; if (!R) return null;
    const c = card(`This week's read for crypto: ${vpill(R.verdict)}`,
      `From USDT.D's weekly close (week of ${dd(R.week)}, ${f2(R.week_close)}) and the last daily close (${dd(R.day)}, ${f2(R.usdtd)}). USDT.D up = money moving into USDT = crypto down. Updates on its own; the weekly part changes each Monday 11:00 Sydney.`);
    c.append(el('p', null, `<b>${R.verdict}.</b> ${R.why}`));
    if (R.prev_verdict && R.prev_verdict !== R.verdict) c.append(el('p', { className: 'rf-note' }, `Changed from <b>${R.prev_verdict}</b> last week.`));
    if (R.changed && R.changed.length) c.append(el('p', { className: 'rf-note' }, 'Since last week: ' + R.changed.join('; ') + '.'));
    const order = ['w100', 'w50_100', 'w50', 'w20', 'd50', 'd20', 'reject'];
    c.append(el('ul', { className: 'rf-note' }, order.filter((k) => R.checks[k]).map((k) => { const x = R.checks[k]; return `<li style="margin:2px 0;list-style:none;margin-left:-18px">${x.ok ? '<b class="neg">✓</b>' : '<b style="color:var(--muted)">✗</b>'} ${x.label}${k !== 'reject' && x.v != null ? ` <span style="color:var(--muted)">(${f2(x.v)})</span>` : ''}</li>`; }).join('')));
    c.append(el('p', { className: 'rf-note' }, '<b style="color:var(--ink)">Last 8 weeks:</b> ' + R.history.map((h) => `${dd(h.week).replace(/ \d{4}$/, '')} ${vpill(h.verdict)}`).join(' ')));
    const rules = el('details');
    rules.append(el('summary', { className: 'rf-note' }, 'The rules, and how they did since 2021'));
    rules.append(el('ul', { className: 'rf-note' }, [
      '<b>Bull</b>: weekly close below the 100W (2023–25: under it the whole bull).',
      '<b>Turning bull</b>: weekly close below the 50W, still above the 100W (the 2022 bear never closed a week below the 50W).',
      '<b>Bear, possibly ending</b>: still above the 50W, turned back near the prior peaks (20-day high within 2%, last close 5%+ below it) and a daily close below the 20D or 50D: how the 2022 peak unwound.',
      '<b>Bear</b>: above the 50W and 100W, with the 50W over the 100W.',
      '<b>Turning bear</b>: above the 100W but the 50W still under the 100W.'
    ].map((x) => `<li style="margin:2px 0">${x}</li>`).join('')));
    rules.append(el('p', { className: 'rf-note' }, 'Every change of the read since Jun 2017 (week, USDT.D weekly close, BTC at that week\'s close). ⚠ Before 2020 it does not work: in the USDT launch years USDT.D stayed above its 100W, so the read said Bear even through the 2017 bull and the 2019 rally. Since 2021 it caught the turns, but 2023 flipped back and forth while USDT.D sat on its 50W, and "possibly ending" in Jun 2026 was followed by a relief rally, not the bottom.'));
    rules.append(table(['Week', 'Read', 'USDT.D', 'BTC'], R.record.map((x) => [dd(x.week) + (x.week < '2020-03-01' ? ' <span style="color:var(--warn)">⚠</span>' : ''), vpill(x.verdict), f2(x.close), usd(x.btc)])));
    c.append(rules);
    return c;
  }

  // ---------- 0b. top watch / bottom watch ----------
  function watchCard(w) {
    if (!w) return null;
    const top = w.kind === 'top', X = w.extreme;
    const c = card(top ? 'Top watch: has USDT.D peaked? <span style="font-weight:400;color:var(--muted);font-size:13px">(USDT.D top = crypto bottom or relief rally)</span>'
      : 'Bottom watch: has USDT.D bottomed? <span style="font-weight:400;color:var(--muted);font-size:13px">(USDT.D bottom = crypto top or pullback)</span>',
    `Tracks the signs after the latest USDT.D 90-day ${top ? 'high' : 'low'}: <b>${f2(X.v)}</b> on ${dd(X.day)}${X.days_ago ? ` (${X.days_ago} days ago)` : ' (today)'}, BTC ${usd(X.btc)}. Signs usually fire in this order; each is counted from that ${top ? 'high' : 'low'}.`);
    const col = /likely in|confirmed/.test(w.status) ? (top ? 'var(--up)' : 'var(--dn)') : /warning|setup/.test(w.status) ? 'var(--warn)' : 'var(--muted)';
    c.append(el('p', null, `<b style="color:${col}">${w.status}.</b> ${w.fired} of 6 signs fired.`));
    const rows = w.steps.map((s) => [
      s.label + (s.level != null ? ` <span style="color:var(--muted)">(${f2(s.level)})</span>` : ''),
      s.fired ? `<b style="color:${top ? 'var(--up)' : 'var(--dn)'}">✓ ${dd(s.fired)}</b>${s.on_now ? '' : ' <span style="color:var(--muted)">(since reversed)</span>'}` : '<span style="color:var(--muted)">not yet</span>',
      s.n ? `${s.moved}%` : '—', s.n ? `${s.stayed}%` : '—', s.n ? `${s.days} d` : '—', s.n || '—'
    ]);
    c.append(table(['Sign', 'Fired since the ' + (top ? 'high' : 'low'), `USDT.D then moved 20%+ ${top ? 'down' : 'up'}`, `That ${top ? 'high' : 'low'} stayed the ${top ? 'top' : 'bottom'} (4 months)`, 'Typically fires', 'Times seen'], rows));
    const d = w.divergence;
    if (d) {
      const what = top
        ? `Weekly RSI: strongest prior week ${dd(d.prev_week)} closed ${f2(d.prev_close)} with RSI ${d.prev_rsi}; week of ${dd(d.week)}${d.forming ? ' (forming)' : ''} ${f2(d.close)} with RSI ${d.rsi}. ` +
          (d.divergence ? '<b style="color:var(--up)">Bearish divergence</b>: near or above the prior peak on weaker momentum, the clue that marked the final top in Nov 2022 (RSI 83.8 in Jun 2022 vs 65.5 at the higher Nov 2022 peak).'
            : d.near ? 'Near the prior peak but momentum is not weaker: no divergence.' : `Not near the prior peak yet (within 3% would be ${f2(d.prev_close * 0.97)}+). A move there with RSI still under ${d.prev_rsi} would be a divergence like Nov 2022.`)
        : `Weekly RSI: weakest prior week ${dd(d.prev_week)} closed ${f2(d.prev_close)} with RSI ${d.prev_rsi}; week of ${dd(d.week)}${d.forming ? ' (forming)' : ''} ${f2(d.close)} with RSI ${d.rsi}. ` +
          (d.divergence ? '<b style="color:var(--dn)">Bullish divergence for USDT.D</b>: near or below the prior low on stronger momentum (crypto top warning).' : d.near ? 'Near the prior low but momentum is not stronger: no divergence.' : 'Not near the prior low: no divergence check yet.');
      c.append(el('p', { className: 'rf-note' }, what));
    }
    c.append(el('p', { className: 'rf-note' }, `How to read it: the early daily signs are good at calling a USDT.D ${top ? 'pullback (crypto relief rally)' : 'bounce (crypto pullback)'} but often not THE ${top ? 'top' : 'bottom'}: ${top ? 'in bears USDT.D tops in waves (Jun 2022 then Nov 2022; Jun 2026 then now)' : 'in bulls USDT.D bottoms in waves (Mar 2024 then Dec 2024)'}. The weekly signs are later but surer (weekly dates = the Sunday the week closed). Past record = every USDT.D 90-day ${top ? 'high' : 'low'} since Jun 2017 (the 2017–19 launch years are included; they make the numbers a little noisier).`));
    return c;
  }

  // ---------- 1. now ----------
  function nowCard() {
    const N = J.now, L = N.last, up100 = N.weekly[100].pct > 0;
    const c = card(`USDT.D now: ${f2(N.usdtd)}% <span style="font-weight:400;color:var(--muted);font-size:13px">(closed day ${dd(N.day)} · BTC ${usd(N.btc)})</span>`,
      'Where USDT.D sits against its 20/50/100/200 SMAs. Daily = last closed day. Weekly = last closed week (Monday weeks), and the week still forming.');
    const read = [];
    read.push(`<b>Weekly 100 SMA (the cycle line):</b> USDT.D is ${up100 ? '<b class="neg">above</b>' : '<b class="pos">below</b>'} it (${f2(N.weekly[100].sma)}), ` +
      (up100 ? 'the BTC <b>bear</b> pattern (2022: above all bear; 2023–25 bull: below and rejected there).' : 'the BTC <b>bull</b> pattern (2023–25: below it, rejected on rallies).') +
      (L.price_100w ? ` Last weekly cross: ${L.price_100w.dir} on ${dd(L.price_100w.day)} (BTC ${usd(L.price_100w.btc)}).` : ''));
    if (L.w50_w100) read.push(`<b>50W vs 100W:</b> 50W ${L.w50_w100.dir === 'up' ? 'crossed above' : 'crossed below'} the 100W on ${dd(L.w50_w100.day)} (BTC ${usd(L.w50_w100.btc)}). ` +
      (L.w50_w100.dir === 'up' ? 'Same as 7 Feb 2022, the bear setup.' : 'Same as 26 Feb 2024, the bull setup.'));
    if (L.price_50w) read.push(`<b>Weekly 50 SMA:</b> last weekly close ${L.price_50w.dir === 'up' ? 'back above' : 'below'} it on ${dd(L.price_50w.day)} (BTC ${usd(L.price_50w.btc)}). In the 2022 bear USDT.D never closed a week below the 50W.`);
    if (L.d50_d200) read.push(`<b>Daily 50 vs 200:</b> 50D ${L.d50_d200.dir === 'up' ? 'above' : 'below'} the 200D since ${dd(L.d50_d200.day)}. ` +
      (L.d50_d200.dir === 'down' && up100 ? 'Differs from 2022, when the 50D stayed above the 200D for the whole bear.' : ''));
    c.append(el('ul', { className: 'rf-note' }, read.map((x) => `<li style="margin:3px 0">${x}</li>`).join('')));
    const fw = N.forming_week;
    const rows = NS.map((n) => [
      `SMA ${n}`,
      f2(N.daily[n].sma), `<span class="${cls(N.daily[n].pct)}">${sp(N.daily[n].pct)}</span>`,
      f2(N.weekly[n].sma), `<span class="${cls(N.weekly[n].pct)}">${sp(N.weekly[n].pct)}</span>`
    ].concat(fw ? [f2(fw.sma[n]), `<span class="${cls(fw.pct[n])}">${sp(fw.pct[n])}</span>`] : []));
    const head = ['', 'Daily SMA', 'USDT.D vs it', `Weekly SMA (wk of ${dd(N.weekly.week)}, close ${f2(N.weekly.close)})`, 'vs it'].concat(fw ? [`This week (forming, ${f2(fw.close)})`, 'vs it'] : []);
    c.append(table(head, rows));
    return c;
  }

  // ---------- 2. chart ----------
  function chartCard() {
    const c = card('USDT.D with its 20 / 50 / 100 / 200 SMAs',
      'Shaded: <span style="color:var(--dn)">BTC bear</span> (top to bottom) and <span style="color:var(--up)">BTC bull</span>. In bears USDT.D rides above its SMAs (the 200D is the floor on dips); in bulls it stays under them (the 100/200 are the ceiling on bounces).');
    const bar = el('div'); bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:8px';
    const tabs = (opts, cur, set) => { const n = el('div', { className: 'br-tabs' }); n.style.alignSelf = 'center'; opts.forEach(([v, l]) => { const b = el('button', { type: 'button' }, l); b.setAttribute('aria-selected', String(v === cur)); b.onclick = () => { set(v); render(); }; n.append(b); }); return n; };
    bar.append(tabs([['daily', 'Daily'], ['weekly', 'Weekly']], tf, (v) => { tf = v; }), tabs([['1y', '1Y'], ['3y', '3Y'], ['all', 'Since 2020'], ['2017', 'Since 2017 (log)']], span, (v) => { span = v; }));
    const key = el('span', { className: 'rf-note' }, ['close', ...NS].map((k) => `<span style="white-space:nowrap"><i style="display:inline-block;width:14px;height:3px;vertical-align:middle;background:${COL[k]};${k === 200 ? 'opacity:.85' : ''}"></i> ${k === 'close' ? 'USDT.D' : (tf === 'daily' ? k + 'D' : k + 'W')}</span>`).join(' &nbsp;'));
    bar.append(key);
    c.append(bar);
    const info = el('div', { className: 'rf-note' }); info.style.minHeight = '1.4em'; c.append(info);
    const box = el('div'); c.append(box);
    requestAnimationFrame(() => drawChart(box, info));
    return c;
  }
  function drawChart(box, info) {
    if (typeof d3 === 'undefined') { box.textContent = 'Chart library not loaded.'; return; }
    const all = J.series[tf], cut = span === '2017' ? '2017-01-01' : span === 'all' ? '2020-01-01' : new Date(Date.now() - (span === '1y' ? 1 : 3) * 365.25 * 864e5).toISOString().slice(0, 10);
    const rows = all.filter((r) => r[0] >= cut).map((r) => ({ d: new Date(r[0] + 'T00:00:00Z'), day: r[0], c: r[1], 20: r[2], 50: r[3], 100: r[4], 200: r[5], btc: r[6] }));
    if (!rows.length) return;
    const W = Math.max(320, box.clientWidth || 900), H = Math.round(Math.min(420, Math.max(260, W * 0.42))), m = { t: 10, r: 46, b: 24, l: 8 };
    const x = d3.scaleUtc().domain(d3.extent(rows, (r) => r.d)).range([m.l, W - m.r]);
    const vals = rows.flatMap((r) => [r.c, r[20], r[50], r[100], r[200]]).filter((v) => v != null);
    const y = (span === '2017' ? d3.scaleLog() : d3.scaleLinear()).domain(d3.extent(vals)).nice().range([H - m.b, m.t]);
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').style('display', 'block').style('font-size', '11px');
    const x0 = rows[0].d, x1 = rows[rows.length - 1].d;
    J.regimes.forEach((R) => {
      const a = new Date(R.from + 'T00:00:00Z'), b = R.to ? new Date(R.to + 'T00:00:00Z') : x1;
      if (b < x0 || a > x1) return;
      svg.append('rect').attr('x', x(a < x0 ? x0 : a)).attr('y', m.t).attr('width', Math.max(0, x(b > x1 ? x1 : b) - x(a < x0 ? x0 : a))).attr('height', H - m.t - m.b)
        .attr('fill', R.kind === 'bear' ? 'var(--dn)' : 'var(--up)').attr('opacity', 0.07);
      const lx = x(a < x0 ? x0 : a) + 4;
      if (x(b > x1 ? x1 : b) - lx > 60) svg.append('text').attr('x', lx).attr('y', m.t + 12).attr('fill', R.kind === 'bear' ? 'var(--dn)' : 'var(--up)').text(R.name);
    });
    svg.append('g').attr('transform', `translate(${W - m.r},0)`).call(span === '2017' ? d3.axisRight(y).tickValues([0.1, 0.2, 0.5, 1, 2, 5, 10].filter((v) => v >= y.domain()[0] && v <= y.domain()[1])).tickFormat((v) => v + '%') : d3.axisRight(y).ticks(6).tickFormat((v) => v + '%')).call((g) => g.select('.domain').remove()).call((g) => g.selectAll('line').attr('stroke', 'var(--line)')).call((g) => g.selectAll('text').attr('fill', 'var(--muted)'));
    svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(W / 110)))).call((g) => g.select('.domain').attr('stroke', 'var(--line)')).call((g) => g.selectAll('line').attr('stroke', 'var(--line)')).call((g) => g.selectAll('text').attr('fill', 'var(--muted)'));
    [200, 100, 50, 20].forEach((n) => svg.append('path').datum(rows.filter((r) => r[n] != null)).attr('fill', 'none').attr('stroke', COL[n]).attr('stroke-width', 1.3).attr('opacity', 0.9)
      .attr('d', d3.line().x((r) => x(r.d)).y((r) => y(r[n]))));
    svg.append('path').datum(rows).attr('fill', 'none').attr('stroke', COL.close).attr('stroke-width', 1.8).attr('d', d3.line().x((r) => x(r.d)).y((r) => y(r.c)));
    const cross = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'var(--muted)').attr('stroke-dasharray', '3 3').style('display', 'none');
    const bis = d3.bisector((r) => r.d).center;
    const say = (r) => { const s = tf === 'daily' ? 'D' : 'W'; info.innerHTML = `<b>${dd(r.day)}${tf === 'weekly' ? ' (week)' : ''}</b> · USDT.D <b>${f2(r.c)}%</b> · ` + NS.map((n) => `${n}${s} ${f2(r[n])} (<span class="${cls(r[n] ? r.c / r[n] - 1 : null)}">${r[n] ? sp((r.c / r[n] - 1) * 100) : '—'}</span>)`).join(' · ') + (r.btc ? ` · BTC ${usd(r.btc)}` : ''); };
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', (ev) => { const r = rows[bis(rows, x.invert(d3.pointer(ev)[0]))]; cross.attr('x1', x(r.d)).attr('x2', x(r.d)).style('display', null); say(r); })
      .on('pointerleave', () => { cross.style('display', 'none'); say(rows[rows.length - 1]); });
    say(rows[rows.length - 1]);
  }

  // ---------- 3. behaviour by regime ----------
  function behaveCard() {
    const c = card('How USDT.D treated each SMA, by BTC market',
      `<b>Above</b> = share of closes above the SMA. <b>Support held</b> = times USDT.D came down to the SMA from above (low within ${J.tolerance_pct}%) and closed back above it. <b>Resistance held</b> = came up to it from below and closed back under it. Bears: USDT.D rises (BTC falls); bulls: USDT.D falls.`);
    ['daily', 'weekly'].forEach((k) => {
      c.append(el('p', { className: 'rf-note' }, `<b style="color:var(--ink)">${k === 'daily' ? 'Daily' : 'Weekly'}</b>`));
      const s = k === 'daily' ? 'D' : 'W';
      const rows = J.regimes.map((R) => [
        `<b class="${R.kind === 'bear' ? 'neg' : 'pos'}">${R.name}</b>${R.caveat ? ' <span title="' + R.caveat.replace(/"/g, '') + '" style="color:var(--warn)">⚠ launch years</span>' : ''}<br><span style="color:var(--muted)">${dd(R.from)} → ${R.to ? dd(R.to) : 'now'}</span>`,
        ...NS.map((n) => { const b = R[k][n]; return b.bars ? `${b.above}% above<br>sup ${frac(b.support)}${fracPct(b.support)}<br>res ${frac(b.resistance)}${fracPct(b.resistance)}` : '—'; }),
        R[k].stack.up != null ? `${R[k].stack.up}% / ${R[k].stack.down}%` : '—'
      ]);
      c.append(table(['BTC market', ...NS.map((n) => n + s), 'SMA stack 20>50>100>200 / reversed'], rows));
    });
    c.append(el('p', { className: 'rf-note' }, 'What stands out: in all three bears (2018, 2022, now) USDT.D held above the weekly 50 and 100 almost every week, and the daily 200 was a floor (2022: 13 of 16 touches held). In the 2023–25 bull the weekly 100 capped nearly every rally. Shock weeks (Aug 2024, Apr 2025) are the exceptions.'));
    c.append(el('p', { className: 'rf-note' }, '<b style="color:var(--warn)">⚠ Launch years (2017 bull, 2018 bear, 2019 rally):</b> ' + (J.regimes.find((R) => R.caveat) || {}).caveat + ' So the weekly 100 only became a clean bull/bear divider from about 2021; the daily SMAs (share of closes above the 20D/50D) separated bulls from bears in every period.'));
    return c;
  }

  // ---------- 4. cycle signals ----------
  function signalsCard() {
    const C = J.crosses;
    const c = card('Cycle signals: the slow weekly crosses', 'Few crosses, close to BTC cycle turns. Weekly closes; BTC = close of that week.');
    const mk = (list, what) => list.map((x) => [dd(x.day), what(x), f2(x.usdtd), usd(x.btc)]);
    const rows = []
      .concat(mk(C.w50_w100, (x) => (x.dir === 'up' ? '<b class="neg">50W above 100W</b> (bear setup)' : '<b class="pos">50W below 100W</b> (bull setup)')))
      .concat(mk(C.price_100w, (x) => (x.dir === 'up' ? '<span class="neg">Weekly close above 100W</span>' : '<span class="pos">Weekly close below 100W</span>')))
      .sort((a, b) => (a[0] === b[0] ? 0 : new Date(a[0]) - new Date(b[0])));
    const byDate = rows.map((r) => ({ r, t: Date.parse(r[0]) })).sort((a, b) => a.t - b.t).map((x) => x.r);
    c.append(table(['Week', 'Signal', 'USDT.D', 'BTC'], byDate));
    c.append(el('p', { className: 'rf-note' }, 'Since the 100W first exists (Feb 2017). There are no crosses before Dec 2020: in the USDT launch years USDT.D stayed above its 100W through the 2017 bull, the 2018 bear and the 2019 rally.'));
    const d = el('details'); d.append(el('summary', { className: 'rf-note' }, 'All weekly 50W crosses and daily 50D/200D crosses since 2017'));
    d.append(table(['Week', 'Signal', 'USDT.D', 'BTC'], mk(C.price_50w, (x) => 'Weekly close ' + (x.dir === 'up' ? 'above' : 'below') + ' 50W')));
    d.append(table(['Day', 'Signal', 'USDT.D', 'BTC'], mk(C.d50_d200, (x) => '50D ' + (x.dir === 'up' ? 'above' : 'below') + ' 200D')));
    c.append(d);
    return c;
  }

  // ---------- 5. past bears vs now ----------
  function analogCard() {
    const A = J.analog, PS = A.pasts || [A.past], P = PS[PS.length - 1], N = A.now, NW = J.now;
    const c = card('Past bears vs now: 2018, 2022 and this one',
      `Weeks counted from each BTC top (${PS.map((p) => dd(p.top)).join(', ')} and ${dd(N.top)}). Stretch = % above the SMA on the day (weekly: last closed week's SMA; the 200W did not exist yet in 2018).`);
    const st = (o, k) => (o ? NS.map((n) => (o[k][n] == null ? `${n}: —` : `${n}: <span class="${cls(o[k][n])}">${sp(o[k][n])}</span>`)).join('<br>') : '—');
    const nowObj = { d: Object.fromEntries(NS.map((n) => [n, NW.daily[n].pct])), w: Object.fromEntries(NS.map((n) => [n, NW.weekly[n].pct])) };
    const col = (f, nowTxt) => PS.map(f).concat([nowTxt]);
    c.append(table(['', ...PS.map((p) => p.label + ' bear' + (p.label === '2018' ? ' <span style="color:var(--warn)">⚠</span>' : '')), 'Now'], [
      ['BTC top → bottom', ...col((p) => `${dd(p.top)} → ${dd(p.bottom)} (<b>${p.weeks_top_to_bottom} weeks</b>)`, `top ${dd(N.top)}; <b>${N.weeks_since_top} weeks</b> so far`)],
      ['USDT.D peak', ...col((p) => `<b>${f2(p.peak.usdtd)}</b> on ${dd(p.peak.day)}: <b>week ${p.weeks_top_to_peak}</b>, ${p.days_peak_to_bottom === 0 ? 'the day BTC bottomed' : p.days_peak_to_bottom + ' days before BTC bottomed'} (BTC ${usd(p.peak.btc)})`,
        `${f2(N.peak.usdtd)} on ${dd(N.peak.day)} (week ${Math.round((Date.parse(N.peak.day) - Date.parse(N.top)) / 6048e5)}, BTC ${usd(N.peak.btc)}); today <b>${f2(NW.usdtd)}</b>`)],
      ['Stretch over daily SMAs', ...col((p) => 'at the peak:<br>' + st(p.peak, 'd'), 'today:<br>' + st(nowObj, 'd'))],
      ['Stretch over weekly SMAs', ...col((p) => 'at the peak:<br>' + st(p.peak, 'w'), `last closed week (${dd(NW.weekly.week)}, ${f2(NW.weekly.close)}):<br>` + st(nowObj, 'w'))],
      ['After the peak: first daily close below', ...col((p) => NS.map((n) => `${n}D ${dd(p.unwind['d' + n])}`).join('<br>'), NS.map((n) => `${n}D ${dd(N.unwind['d' + n])}`).join('<br>') + '<br><span style="color:var(--muted)">(after the ' + dd(N.peak.day) + ' peak)</span>')],
      ['…and first weekly close below', ...col((p) => NS.map((n) => `${n}W ${dd(p.unwind['w' + n])}`).join('<br>'), NS.map((n) => `${n}W ${dd(N.unwind['w' + n])}`).join('<br>'))]
    ]));
    const w = [];
    const wk = PS.map((p) => p.weeks_top_to_peak);
    w.push(`Timing: in ${PS.map((p) => p.label).join(' and ')} USDT.D peaked in week ${new Set(wk).size === 1 ? wk[0] + ' both times' : wk.join(' and ')} after the BTC top, within 0–2 weeks of the BTC bottom. This bear is in week ${N.weeks_since_top}: past that point, so the clock alone says "late", not "when".`);
    w.push(`Prior peaks: <b>${f2(N.peak.usdtd)}</b> (${dd(N.peak.day)}) and <b>${f2(P.peak.usdtd)}</b> (${dd(P.peak.day)}). A daily close above both = new cycle high for USDT.D (more BTC downside); a rejection there = a double top.`);
    w.push(`2022 topped with USDT.D ${sp(P.peak.d[20])} over its 20D and ${sp(P.peak.w[20])} over its 20W; today it is ${sp(NW.daily[20].pct)} over the 20D and ${sp(NW.weekly[20].pct)} over the 20W at the last weekly close. (2018's stretch was bigger, ${sp(PS[0].peak.w[20])} over the 20W, partly from USDT supply growth.)`);
    w.push(`The 2022 unwind (BTC bottoming) went: daily close below the 20D (now ${f2(NW.daily[20].sma)}) → 50D (${f2(NW.daily[50].sma)}) → 100D/200D (${f2(NW.daily[100].sma)} / ${f2(NW.daily[200].sma)}) → weekly close below the 50W (${f2(NW.weekly[50].sma)}). The weekly 100 (${f2(NW.weekly[100].sma)}) was lost only months later, as the bull got going.`);
    c.append(el('p', { className: 'rf-note' }, '<b style="color:var(--ink)">What to watch</b>'));
    c.append(el('ul', { className: 'rf-note' }, w.map((x) => `<li style="margin:3px 0">${x}</li>`).join('')));
    return c;
  }

  // ---------- 6. turning points ----------
  function turnCard() {
    const c = card('Turning points and the SMA they turned at',
      'Bears: USDT.D swing lows (= BTC relief-rally tops). Bulls: USDT.D swing highs (= BTC dips). Daily swings = lowest/highest of 21 days; weekly = 7 weeks. Nearest SMA and how far the turn was from it.');
    J.turning.slice().reverse().forEach((G, i) => {
      const d = el('details'); if (i === 0) d.open = true;
      d.append(el('summary', { className: 'rf-note' }, `<b class="${G.kind === 'bear' ? 'neg' : 'pos'}">${G.name}</b>: ${G.daily.length} daily and ${G.weekly.length} weekly ${G.kind === 'bear' ? 'lows' : 'highs'}`));
      const rows = G.daily.map((p) => [dd(p.day), 'D', f2(p.v), `${p.near}D (${sp(p.near_pct)})`, NS.map((n) => (p.dist[n] == null ? '' : `${n}: ${sp(p.dist[n])}`)).join(' · '), usd(p.btc)])
        .concat(G.weekly.map((p) => [dd(p.day), 'W', f2(p.v), `${p.near}W (${sp(p.near_pct)})`, NS.map((n) => (p.dist[n] == null ? '' : `${n}: ${sp(p.dist[n])}`)).join(' · '), usd(p.btc)]))
        .sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]));
      d.append(table(['Date', 'TF', G.kind === 'bear' ? 'Low' : 'High', 'Nearest SMA', 'Distance to each', 'BTC'], rows));
      c.append(d);
    });
    return c;
  }

  function render() {
    const R = root(); if (!R) return;
    if (!J) { R.replaceChildren(el('div', { className: 'br-card' }, '<p class="note">Loading USDT.D analysis…</p>')); return; }
    const foot = el('p', { className: 'rf-note' }, `Built ${J.generated}. ${J.source} BTC cycle dates (closes): top 16 Dec 2017, bottom 15 Dec 2018, 2019 rally high 26 Jun 2019, bottom 12 Mar 2020, top 8 Nov 2021, bottom 21 Nov 2022, top 6 Oct 2025. USDT.D history starts 8 Mar 2015; the 100W exists from Feb 2017 and the 200W from Jan 2019. Patterns from past cycles, not a forecast; not financial advice.`);
    R.replaceChildren(...[readCard(), watchCard(J.top_watch), watchCard(J.bottom_watch)].filter(Boolean), nowCard(), chartCard(), behaveCard(), signalsCard(), analogCard(), turnCard(), foot);
  }
  let rs = null;
  window.addEventListener('resize', () => { clearTimeout(rs); rs = setTimeout(() => { const R = root(); if (J && R && !R.closest('[hidden]')) render(); }, 200); });
  window.__usdtd = function () {
    if (J) { if (!root().dataset.drawn) { root().dataset.drawn = '1'; render(); } return; }
    render();
    load().then(() => { root().dataset.drawn = '1'; render(); }).catch((e) => { root().replaceChildren(el('div', { className: 'br-card' }, '<p class="note">Could not load the USDT.D analysis (' + e.message + ').</p>')); });
  };
})();
