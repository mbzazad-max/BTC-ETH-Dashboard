/* USDT.D tab (21 Nov 2026) and BTC cycle tab (21 Nov 2026): one renderer for both. Draws public/usdtd.json and
   public/btccycle.json (both built by build/usdtd.js, the second with --asset=btc) into the "USDT.D" and "BTC cycle" pages.
   The page calls window.__usdtd() / window.__btccyc() when the tab is shown (tools/page.js edits). Read-only. */
(function () {
  'use strict';
function make(A) {
  const B = !!A.btc, NM = B ? 'BTC' : 'USDT.D';
  let J = null, loading = null, tf = 'daily', span = '3y';
  const NS = [20, 50, 100, 200];
  const COL = { close: 'var(--ink)', 20: 'var(--acc)', 50: 'var(--warn)', 100: '#9b59b6', 200: 'var(--dn)' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dd = (s) => { if (!s) return '—'; const d = new Date(s + 'T00:00:00Z'); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
  const f2 = (v) => (v == null ? '—' : B ? '$' + Math.round(v).toLocaleString('en-US') : v.toFixed(2));
  const fp = (v) => (B ? f2(v) : f2(v) + '%');          // a level with its unit
  // colours of a sign: for USDT.D a top is good for crypto (green); for BTC a top is bad (red)
  const goodTop = !B, tc = (top) => (top === goodTop ? 'var(--up)' : 'var(--dn)'), tbg = (top) => (top === goodTop ? 'var(--up-bg)' : 'var(--dn-bg)');
  const sp = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%');
  const usd = (v) => (v == null ? '—' : '$' + Math.round(v).toLocaleString('en-US'));
  const el = (tag, attrs, html) => { const e = document.createElement(tag); if (attrs) Object.assign(e, attrs); if (html != null) e.innerHTML = html; return e; };
  const cls = (v) => (v == null ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const frac = (a) => (a && a[1] ? `${a[0]}/${a[1]}` : '—');
  const fracPct = (a) => (a && a[1] ? ` <span style="color:var(--muted)">(${Math.round(a[0] / a[1] * 100)}%)</span>` : '');
  const root = () => document.getElementById(A.root);

  function load() {
    if (J) return Promise.resolve(J);
    if (!loading) loading = fetch(A.json, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((j) => (J = j));
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
    const c = card(`This week's read for ${B ? 'BTC' : 'crypto'}: ${vpill(R.verdict)}`,
      `From ${NM}'s weekly close (week of ${dd(R.week)}, ${f2(R.week_close)}) and the last daily close (${dd(R.day)}, ${f2(R.usdtd)}). ${B ? "BTC's own weekly SMAs: below the 100W = bear, above the 50W and 100W = bull." : 'USDT.D up = money moving into USDT = crypto down.'} Updates on its own; the weekly part changes each Monday 11:00 Sydney.`);
    c.append(el('p', null, `<b>${R.verdict}.</b> ${R.why}`));
    if (R.prev_verdict && R.prev_verdict !== R.verdict) c.append(el('p', { className: 'rf-note' }, `Changed from <b>${R.prev_verdict}</b> last week.`));
    if (R.changed && R.changed.length) c.append(el('p', { className: 'rf-note' }, 'Since last week: ' + R.changed.join('; ') + '.'));
    const order = ['w100', 'w50_100', 'w50', 'w20', 'w200', 'd50', 'd20', 'reject'];
    c.append(el('ul', { className: 'rf-note' }, order.filter((k) => R.checks[k]).map((k) => { const x = R.checks[k]; return `<li style="margin:2px 0;list-style:none;margin-left:-18px">${x.ok ? '<b class="neg">✓</b>' : '<b style="color:var(--muted)">✗</b>'} ${x.label}${k !== 'reject' && x.v != null ? ` <span style="color:var(--muted)">(${f2(x.v)})</span>` : ''}</li>`; }).join('')));
    c.append(el('p', { className: 'rf-note' }, '<b style="color:var(--ink)">Last 8 weeks:</b> ' + R.history.map((h) => `${dd(h.week).replace(/ \d{4}$/, '')} ${vpill(h.verdict)}`).join(' ')));
    const rules = el('details');
    rules.append(el('summary', { className: 'rf-note' }, `The rules, and how they did since ${B ? '2016' : '2017'}`));
    rules.append(el('ul', { className: 'rf-note' }, (B ? [
      '<b>Bear</b>: weekly close below the 100W (2022: from May 2022 to Oct 2023).',
      '<b>Bear, possibly ending</b>: below the 100W, but held near the prior year\'s low (20-day low at or within 2% of it, last close 5%+ above it) and a daily close back above the 20D or 50D: how the 2018 and 2022 bottoms started.',
      '<b>Turning bear</b>: weekly close below the 50W, still above the 100W (how the 2018, 2021–22 and 2025 tops turned).',
      '<b>Turning bull</b>: above the 50W and 100W, but the 50W still under the 100W.',
      '<b>Bull</b>: above the 50W and 100W, with the 50W over the 100W.'
    ] : [
      '<b>Bull</b>: weekly close below the 100W (2023–25: under it the whole bull).',
      '<b>Turning bull</b>: weekly close below the 50W, still above the 100W (the 2022 bear never closed a week below the 50W).',
      '<b>Bear, possibly ending</b>: still above the 50W, turned back near the prior year\'s peak (20-day high at or within 2% of it, last close 5%+ below it) and a daily close below the 20D or 50D: how the 2022 peak unwound.',
      '<b>Bear</b>: above the 50W and 100W, with the 50W over the 100W.',
      '<b>Turning bear</b>: above the 100W but the 50W still under the 100W.'
    ]).map((x) => `<li style="margin:2px 0">${x}</li>`).join('')));
    rules.append(el('p', { className: 'rf-note' }, B ? 'Every change of the read since 2016 (week, BTC weekly close). It called the 2018, 2022 and 2025 bears and the 2023 bull, late but steadily; "possibly ending" came near the 2018 and 2022 bottoms ($3.9k in Dec 2018; $17–21k in Jul–Nov 2022) and in Jun 2026.'
      : 'Every change of the read since Jun 2017 (week, USDT.D weekly close, BTC at that week\'s close). ⚠ Before 2020 it does not work: in the USDT launch years USDT.D stayed above its 100W, so the read said Bear even through the 2017 bull and the 2019 rally. Since 2021 it caught the turns, but 2023 flipped back and forth while USDT.D sat on its 50W, and "possibly ending" also fired on pullbacks that were not the top (2021, Dec 2025, Jun 2026).'));
    rules.append(table(['Week', 'Read', NM, ...(B ? [] : ['BTC'])], R.record.map((x) => [dd(x.week) + (!B && x.week < '2020-03-01' ? ' <span style="color:var(--warn)">⚠</span>' : ''), vpill(x.verdict), f2(x.close), ...(B ? [] : [usd(x.btc)])])));
    c.append(rules);
    return c;
  }

  const starOf = (F) => (F ? F.signs.filter((x) => x.id !== 'div' && x.n >= 15).reduce((a, x) => (!a || x.moved > a.moved ? x : a), null) : null);
  // ---------- 0b. top watch / bottom watch ----------
  function fastSection(F, top) {
    const box = el('div'); box.style.cssText = 'border:1px dashed var(--line);border-radius:8px;padding:10px 12px;margin:4px 0 12px';
    const X = F.extreme, col = /confirmed|Best/.test(F.status) ? tc(top) : /warning|Setup|possible/.test(F.status) ? 'var(--warn)' : 'var(--muted)';
    box.append(el('p', { className: 'rf-note' }, `<b style="color:var(--ink);font-size:14px">⚡ Early warning (daily)</b> · fast signs after the latest ${NM} <b>30-day ${top ? 'high' : 'low'}</b>: ${f2(X.v)} on ${dd(X.day)}${X.days_ago ? ` (${X.days_ago} days ago)` : ' (today)'}${B ? '' : `, BTC ${usd(X.btc)}`}. Earlier than the signs below, with more false alarms: they call a short-term ${B ? (top ? 'BTC pullback' : 'BTC bounce') : (top ? 'crypto bounce' : 'crypto pullback')}, not the cycle turn.`));
    const dv = F.divergence;
    box.append(el('p', null, `<b style="color:${col}">${F.status}.</b>` + (dv ? ` <span style="color:var(--muted)">Daily RSI: ${dd(dv.prev_day)} ${top ? 'high' : 'low'} ${dv.prev_rsi} → ${dd(X.day)} ${dv.rsi}${dv.divergence ? (top ? ' (weaker: divergence)' : ' (stronger: divergence)') : ' (no divergence)'}.</span>` : '')));
    const fmtRow = (lab, s, isBase) => [
      `<span style="white-space:nowrap">${lab}${!F.expired && s.level != null ? ` <span style="color:var(--muted)">(${f2(s.level)})</span>` : ''}</span>`,
      isBase ? '<span style="color:var(--muted)">—</span>' : s.fired ? `<b style="color:${tc(top)}">✓ ${dd(s.fired)}</b>` : '<span style="color:var(--muted)">not yet</span>',
      !isBase && s.fired && s.btc != null ? `${usd(s.btc)} <span class="${cls(s.btc_chg)}">(${sp(s.btc_chg)})</span>` : '—',
      s.n ? `${s.moved}%` : '—', s.n ? `${s.held}%` : '—', s.n ? `${s.lag} d` : '—',
      s.n && s.btc_by != null ? `<span class="${cls(s.btc_by)}">${sp(s.btc_by)}</span>` : '—',
      s.n && s.btc30 != null ? `<span class="${cls(s.btc30)}">${sp(s.btc30)}</span> <span style="color:var(--muted)">(up ${s.btc30_up}%)</span>` : '—', s.n || '—'];
    // ★ = the sign with the best record here (USDT.D or BTC moved 10%+ the other way), among those seen 15+ times
    const star = starOf(F);
    const rows = F.signs.map((x) => fmtRow((star && x.id === star.id ? '★ ' : '') + x.label, x, false));
    rows.push(fmtRow('<span style="color:var(--muted)">For comparison: any 30-day ' + (top ? 'high' : 'low') + ', no sign</span>', F.base, true));
    const PB = B ? 'Price' : 'BTC';
    box.append(table(['Sign', 'Fired', `${PB} then (vs ${usd(X.btc)})`, `Then ${NM} ${top ? '−' : '+'}10%`, 'Held 60 d', 'Fires after', `${PB} by then (typ.)`, `${PB} 30 d after (typ.)`, 'Seen'], rows));
    box.append(el('p', { className: 'rf-note' }, `Past record since ${B ? 'Sep 2015' : 'Jun 2017'} (every ${NM} 30-day ${top ? 'high' : 'low'}, each sign counted once within 30 days of it): <b>Then ${NM} ${top ? '−' : '+'}10%</b> = moved 10%+ ${top ? 'down' : 'up'} from the ${top ? 'high' : 'low'} within 60 days; <b>Held 60 d</b> = no ${top ? 'higher' : 'lower'} close in the 60 days after the sign; <b>${PB} 30 d after</b> = BTC's median move over the next 30 days and how often it was up. ` +
      (star ? `★ = the best record here: ${star.label.charAt(0).toLowerCase() + star.label.slice(1)} (${star.moved}% then moved 10%+ ${top ? 'down' : 'up'}, seen ${star.n} times).` : '')));
    return box;
  }

  function watchCard(w) {
    if (!w) return null;
    const top = w.kind === 'top', X = w.extreme;
    const c = card(B ? (top ? 'Top watch: has BTC peaked? <span style="font-weight:400;color:var(--muted);font-size:13px">(time to protect profits)</span>' : 'Bottom watch: has BTC bottomed? <span style="font-weight:400;color:var(--muted);font-size:13px">(where buyers step in)</span>')
      : top ? 'Top watch: has USDT.D peaked? <span style="font-weight:400;color:var(--muted);font-size:13px">(USDT.D top = crypto bottom or relief rally)</span>'
      : 'Bottom watch: has USDT.D bottomed? <span style="font-weight:400;color:var(--muted);font-size:13px">(USDT.D bottom = crypto top or pullback)</span>',
    `Two layers: a fast daily early warning (30-day ${top ? 'highs' : 'lows'}) and the slower cycle confirmation (90-day ${top ? 'highs' : 'lows'}, daily and weekly signs). Use the first for timing, the second to judge whether it is the real turn. Signs usually fire in the order listed.`);
    const col = /likely in|confirmed/.test(w.status) ? tc(top) : /warning|setup/.test(w.status) ? 'var(--warn)' : 'var(--muted)';
    if (w.fast) c.append(fastSection(w.fast, top));
    const T2 = w.since_turn, opp = top ? 'low' : 'high', own = top ? 'high' : 'low';
    const bt = (v) => (B ? '' : `, BTC ${usd(v)}`);
    const track = w.mode === 'waiting' ? `nothing to track yet: ${NM} made a new 90-day ${opp} on ${dd(T2.day)} (${f2(T2.v)}${bt(T2.btc)})`
      : w.mode === 'since_turn' ? `the ${own} since the ${dd(T2.day)} ${NM} ${opp} (${f2(T2.v)}): <b>${f2(X.v)}</b> on ${dd(X.day)}${X.days_ago ? ` (${X.days_ago} days ago)` : ' (today)'}${bt(X.btc)}`
      : `the latest ${NM} <b>90-day ${own}</b>: ${f2(X.v)} on ${dd(X.day)}${X.days_ago ? ` (${X.days_ago} days ago)` : ' (today)'}${bt(X.btc)}`;
    c.append(el('p', { className: 'rf-note' }, `<b style="color:var(--ink);font-size:14px">🧭 Cycle confirmation (daily + weekly)</b> · slower signs after ${track}. Is it turning into the real cycle ${top ? 'top' : 'bottom'}? (It restarts by itself after each opposite turn.)`));
    c.append(el('p', null, `<b style="color:${col}">${w.status}.</b> ${w.fired} of 6 signs fired.` + (X ? ` <span style="color:var(--muted)">BTC: ${usd(X.btc)} at the ${B ? '' : 'USDT.D '}${own} → ${usd(w.btc_now)} now (<span class="${cls(w.btc_now_chg)}">${sp(w.btc_now_chg)}</span>).</span>` : '')));
    if (w.previous) { const P = w.previous; c.append(el('p', { className: 'rf-note' }, `Previous episode: ${NM} ${own} ${f2(P.extreme.v)} on ${dd(P.extreme.day)}${B ? '' : ` (BTC ${usd(P.extreme.btc)})`}, ${P.fired} of 6 signs fired, ended as: ${P.status}. Full record in "Every ${NM} top and bottom" below.`)); }
    const rows = w.steps.map((s) => [
      `<span style="white-space:nowrap">${s.label}${s.level != null ? ` <span style="color:var(--muted)">(${f2(s.level)})</span>` : ''}</span>`,
      s.fired ? `<b style="color:${tc(top)}">✓ ${dd(s.fired)}</b>${s.on_now ? '' : ' <span style="color:var(--muted)">(since reversed)</span>'}` : '<span style="color:var(--muted)">not yet</span>',
      s.fired && s.btc != null ? `${usd(s.btc)} <span class="${cls(s.btc_chg)}">(${sp(s.btc_chg)})</span>` : '—',
      s.n ? `${s.moved}%` : '—', s.n ? `${s.stayed}%` : '—', s.n ? `${s.days} d` : '—', s.btc_typ != null ? `<span class="${cls(s.btc_typ)}">${sp(s.btc_typ)}</span>` : '—', s.n || '—'
    ]);
    const PB2 = B ? 'Price' : 'BTC';
    c.append(table(['Sign', 'Fired', X ? `${PB2} then (vs ${usd(X.btc)})` : `${PB2} then`, `Then ${NM} ${top ? '−' : '+'}20%`, `${top ? 'High' : 'Low'} held 4 mo`, 'Fires after', `${PB2} by then (typ.)`, 'Seen'], rows));
    const d = w.divergence;
    if (d) {
      const what = top
        ? `Weekly RSI: strongest prior week ${dd(d.prev_week)} closed ${f2(d.prev_close)} with RSI ${d.prev_rsi}; week of ${dd(d.week)}${d.forming ? ' (forming)' : ''} ${f2(d.close)} with RSI ${d.rsi}. ` +
          (d.divergence ? (B ? '<b style="color:var(--dn)">Bearish divergence</b>: near or above the prior peak on weaker momentum (a classic BTC topping sign).' : '<b style="color:var(--up)">Bearish divergence</b>: near or above the prior peak on weaker momentum, the clue that marked the final top in Nov 2022 (RSI 83.8 in Jun 2022 vs 65.5 at the higher Nov 2022 peak).')
            : d.near ? 'Near the prior peak but momentum is not weaker: no divergence.' : `Not near the prior peak yet (within 3% would be ${f2(d.prev_close * 0.97)}+). A move there with RSI still under ${d.prev_rsi} would be a divergence${B ? '' : ' like Nov 2022'}.`)
        : `Weekly RSI: weakest prior week ${dd(d.prev_week)} closed ${f2(d.prev_close)} with RSI ${d.prev_rsi}; week of ${dd(d.week)}${d.forming ? ' (forming)' : ''} ${f2(d.close)} with RSI ${d.rsi}. ` +
          (d.divergence ? (B ? '<b style="color:var(--up)">Bullish divergence</b>: near or below the prior low on stronger momentum (a classic BTC bottoming sign).' : '<b style="color:var(--dn)">Bullish divergence for USDT.D</b>: near or below the prior low on stronger momentum (crypto top warning).') : d.near ? 'Near the prior low but momentum is not stronger: no divergence.' : 'Not near the prior low: no divergence check yet.');
      c.append(el('p', { className: 'rf-note' }, what));
    }
    const PB3 = B ? 'Price' : 'BTC';
    c.append(el('p', { className: 'rf-note' }, `Columns: <b>${PB3} then</b> = BTC's close the day the sign fired, and its change since the ${B ? '' : 'USDT.D '}${top ? 'high' : 'low'}. Past record over every case: <b>Then ${NM} ${top ? '−' : '+'}20%</b> = ${NM} went on to move 20%+ ${top ? 'down' : 'up'} within 6 months; <b>${top ? 'High' : 'Low'} held 4 mo</b> = that ${top ? 'high' : 'low'} stayed the ${top ? 'top' : 'bottom'}; <b>Fires after</b> = typical days after the ${top ? 'high' : 'low'}; <b>${PB3} by then</b> = BTC's typical move by the time the sign fired (what waiting for it cost).<br>How to read it: the early daily signs are good at calling a ${NM} ${top ? 'pullback' : 'bounce'}${B ? '' : (top ? ' (crypto relief rally)' : ' (crypto pullback)')} but often not THE ${top ? 'top' : 'bottom'}: ${B ? (top ? 'in bulls BTC tops in waves (Mar 2024, Dec 2024, then Oct 2025)' : 'in bears BTC bottoms in waves (Jun 2022 then Nov 2022; Feb 2026, Jun 2026 and now)') : (top ? 'in bears USDT.D tops in waves (Jun 2022 then Nov 2022; Jun 2026 then now)' : 'in bulls USDT.D bottoms in waves (Mar 2024 then Dec 2024)')}. The weekly signs are later but surer (weekly dates = the Sunday the week closed). Past record = every ${NM} 90-day ${top ? 'high' : 'low'} since ${B ? 'Sep 2015' : 'Jun 2017 (the 2017–19 launch years are included; they make the numbers a little noisier)'}.`));
    return c;
  }

  // ---------- 0c. every top and bottom ----------
  function swingsCard() {
    const SW = J.swings; if (!SW || !SW.length) return null;
    const c = card(`Every ${NM} top and bottom since ${B ? '2015' : '2017'}`,
      B ? 'Each swing between a BTC 90-day high and the next 90-day low (and back). For each: the extreme, when the best early sign and the cycle signs fired (BTC change since the extreme), and what happened up to the next swing. New swings and signs are added on their own; ● = written to the permanent log when it happened (history/btc_log.json).'
        : 'Each swing between a USDT.D 90-day high and the next 90-day low (and back). <b>USDT.D top</b> = crypto low, <b>USDT.D bottom</b> = crypto high. For each: the extreme with BTC that day, when the best early sign and the cycle signs fired (BTC change since the extreme), and what happened up to the next swing. New swings and signs are added on their own; ● = written to the permanent log when it happened (history/usdtd_log.json).');
    const STAR = { top: starOf(J.top_watch && J.top_watch.fast), bottom: starOf(J.bottom_watch && J.bottom_watch.fast) };
    const ds = (x) => { const d = new Date(x + 'T00:00:00Z'); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + " '" + String(d.getUTCFullYear()).slice(2); };
    const sg = (w, id, layer) => { const x = (layer === 'fast' ? w.fast : w.slow).find((y) => y.id === id); if (!x || !x.day) return '<span style="color:var(--muted)">—</span>'; const live = w.live && w.live[layer + '|' + id]; return `${ds(x.day)} <span class="${cls(x.btc_chg)}">${sp(x.btc_chg)}</span>${live ? ' <span title="logged live ' + live + '" style="color:var(--acc)">●</span>' : ''}`; };
    const rows = SW.slice().reverse().map((w) => {
      const top = w.kind === 'top', E = w.extreme;
      const pill = `<span class="rf-pill" style="color:${tc(top)};background:${tbg(top)}">${NM} ${top ? 'top' : 'bottom'}</span>`;
      const nFast = w.fast.filter((x) => x.day).length;
      const after = B ? (w.next ? `→ ${dd(w.next.day)} (${w.next.days} d): BTC <span class="${cls(w.next.btc_chg)}">${sp(w.next.btc_chg)}</span> to ${usd(w.next.btc)}` : `<b>open</b>, ${w.so_far.days} d so far: BTC <span class="${cls(w.so_far.btc_chg)}">${sp(w.so_far.btc_chg)}</span>`)
        : w.next ? `→ ${dd(w.next.day)} (${w.next.days} d): USDT.D <span class="${top ? 'pos' : 'neg'}">${sp(w.next.usdtd_chg)}</span>, BTC <span class="${cls(w.next.btc_chg)}">${sp(w.next.btc_chg)}</span>`
        : `<b>open</b>, ${w.so_far.days} d so far: USDT.D ${sp(w.so_far.usdtd_chg)}, BTC <span class="${cls(w.so_far.btc_chg)}">${sp(w.so_far.btc_chg)}</span>`;
      const st = STAR[w.kind];
      return [pill + (w.open ? ' <b style="color:var(--warn)">now</b>' : ''), `<b>${dd(E.day)}</b><br>${B ? usd(E.btc) : `${f2(E.usdtd)}% · BTC ${usd(E.btc)}`}`,
        `★ ${st ? sg(w, st.id, 'fast') : '—'}<br><span style="color:var(--muted)">${nFast}/6 fast signs</span>`,
        ['d20', 'd50', 'w20', 'w50'].map((id) => `<span style="color:var(--muted)">${id.replace('d', '').replace('w', '') + (id[0] === 'd' ? 'D' : 'W')}</span> ${sg(w, id, 'slow')}`).join('<br>'), after];
    });
    const head = ['Swing', B ? 'Extreme' : 'Extreme (BTC that day)', 'Early ★ (daily)', 'Cycle signs: 20D · 50D · 20W · 50W', 'Then (to the next swing)'];
    c.append(table(head, rows.slice(0, 10)));
    if (rows.length > 10) { const d = el('details'); d.append(el('summary', { className: 'rf-note' }, `Show all ${rows.length} swings since ${B ? '2015' : '2017'}`)); d.append(table(head, rows.slice(10))); c.append(d); }
    c.append(el('p', { className: 'rf-note' }, `★ = the fast sign with the best record: for ${NM} tops, ${STAR.top ? STAR.top.label.charAt(0).toLowerCase() + STAR.top.label.slice(1) : '—'}; for ${NM} bottoms, ${STAR.bottom ? STAR.bottom.label.charAt(0).toLowerCase() + STAR.bottom.label.slice(1) : '—'}. Signs are crosses (${NM} had to be on the other side of the level after the extreme).${B ? '' : ' Dates before 2020 are in the USDT launch years.'}`));
    return c;
  }

  // ---------- 1. now ----------
  function nowCard() {
    const N = J.now, L = N.last, up100 = N.weekly[100].pct > 0;
    const c = card(`${NM} now: ${fp(N.usdtd)} <span style="font-weight:400;color:var(--muted);font-size:13px">(closed day ${dd(N.day)}${B ? '' : ` · BTC ${usd(N.btc)}`})</span>`,
      `Where ${NM} sits against its 20/50/100/200 SMAs. Daily = last closed day. Weekly = last closed week (Monday weeks), and the week still forming.`);
    const read = [];
    if (B) {
      const u200 = N.weekly[200].pct > 0;
      read.push(`<b>Weekly 100 SMA:</b> BTC is ${up100 ? '<b class="pos">above</b>' : '<b class="neg">below</b>'} it (${f2(N.weekly[100].sma)}): ${up100 ? 'not in a bear by the weekly read.' : 'the bear pattern (2022: below it from May 2022 to Oct 2023).'}` + (L.price_100w ? ` Last weekly cross: ${L.price_100w.dir} on ${dd(L.price_100w.day)} at ${usd(L.price_100w.usdtd)}.` : ''));
      read.push(`<b>Weekly 200 SMA:</b> BTC is ${u200 ? 'above' : '<b class="neg">below</b>'} it (${f2(N.weekly[200].sma)}). In 2018, Mar 2020 and 2022 the bear bottoms came near or below the 200W.` + (L.price_200w ? ` Last weekly cross: ${L.price_200w.dir} on ${dd(L.price_200w.day)}.` : ''));
      if (L.w50_w100) read.push(`<b>50W vs 100W:</b> 50W ${L.w50_w100.dir === 'up' ? 'crossed above' : 'crossed below'} the 100W on ${dd(L.w50_w100.day)} at ${usd(L.w50_w100.usdtd)}${L.w50_w100.dir === 'down' ? ': the bear setup.' : ': the bull setup.'}`);
      if (L.price_50w) read.push(`<b>Weekly 50 SMA:</b> last weekly close ${L.price_50w.dir === 'up' ? 'back above' : 'below'} it on ${dd(L.price_50w.day)} at ${usd(L.price_50w.usdtd)}.`);
      if (L.d50_d200) read.push(`<b>Daily 50 vs 200:</b> ${L.d50_d200.dir === 'up' ? 'golden cross (50D above the 200D)' : 'death cross (50D below the 200D)'} since ${dd(L.d50_d200.day)}.`);
    } else {
    read.push(`<b>Weekly 100 SMA (the cycle line):</b> USDT.D is ${up100 ? '<b class="neg">above</b>' : '<b class="pos">below</b>'} it (${f2(N.weekly[100].sma)}), ` +
      (up100 ? 'the BTC <b>bear</b> pattern (2022: above all bear; 2023–25 bull: below and rejected there).' : 'the BTC <b>bull</b> pattern (2023–25: below it, rejected on rallies).') +
      (L.price_100w ? ` Last weekly cross: ${L.price_100w.dir} on ${dd(L.price_100w.day)} (BTC ${usd(L.price_100w.btc)}).` : ''));
    if (L.w50_w100) read.push(`<b>50W vs 100W:</b> 50W ${L.w50_w100.dir === 'up' ? 'crossed above' : 'crossed below'} the 100W on ${dd(L.w50_w100.day)} (BTC ${usd(L.w50_w100.btc)}). ` +
      (L.w50_w100.dir === 'up' ? 'Same as 7 Feb 2022, the bear setup.' : 'Same as 26 Feb 2024, the bull setup.'));
    if (L.price_50w) read.push(`<b>Weekly 50 SMA:</b> last weekly close ${L.price_50w.dir === 'up' ? 'back above' : 'below'} it on ${dd(L.price_50w.day)} (BTC ${usd(L.price_50w.btc)}). In the 2022 bear USDT.D never closed a week below the 50W.`);
    if (L.d50_d200) read.push(`<b>Daily 50 vs 200:</b> 50D ${L.d50_d200.dir === 'up' ? 'above' : 'below'} the 200D since ${dd(L.d50_d200.day)}. ` +
      (L.d50_d200.dir === 'down' && up100 ? 'Differs from 2022, when the 50D stayed above the 200D for the whole bear.' : ''));
    }
    c.append(el('ul', { className: 'rf-note' }, read.map((x) => `<li style="margin:3px 0">${x}</li>`).join('')));
    const fw = N.forming_week;
    const rows = NS.map((n) => [
      `SMA ${n}`,
      f2(N.daily[n].sma), `<span class="${cls(N.daily[n].pct)}">${sp(N.daily[n].pct)}</span>`,
      f2(N.weekly[n].sma), `<span class="${cls(N.weekly[n].pct)}">${sp(N.weekly[n].pct)}</span>`
    ].concat(fw ? [f2(fw.sma[n]), `<span class="${cls(fw.pct[n])}">${sp(fw.pct[n])}</span>`] : []));
    const head = ['', 'Daily SMA', `${NM} vs it`, `Weekly SMA (wk of ${dd(N.weekly.week)}, close ${f2(N.weekly.close)})`, 'vs it'].concat(fw ? [`This week (forming, ${f2(fw.close)})`, 'vs it'] : []);
    c.append(table(head, rows));
    return c;
  }

  // ---------- 2. chart ----------
  function chartCard() {
    const c = card(`${NM} with its 20 / 50 / 100 / 200 SMAs`, B ? 'Shaded: <span style="color:var(--dn)">BTC bear</span> (top to bottom) and <span style="color:var(--up)">BTC bull</span>. Log scale. In bulls BTC rides above its SMAs (the 50D/20W are the floor on dips); in bears it stays under them (the 50D/100D and the 20W/50W are the ceiling on rallies).' :
      'Shaded: <span style="color:var(--dn)">BTC bear</span> (top to bottom) and <span style="color:var(--up)">BTC bull</span>. In bears USDT.D rides above its SMAs (the 200D is the floor on dips); in bulls it stays under them (the 100/200 are the ceiling on bounces).');
    const bar = el('div'); bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:8px';
    const tabs = (opts, cur, set) => { const n = el('div', { className: 'br-tabs' }); n.style.alignSelf = 'center'; opts.forEach(([v, l]) => { const b = el('button', { type: 'button' }, l); b.setAttribute('aria-selected', String(v === cur)); b.onclick = () => { set(v); render(); }; n.append(b); }); return n; };
    bar.append(tabs([['daily', 'Daily'], ['weekly', 'Weekly']], tf, (v) => { tf = v; }), tabs([['1y', '1Y'], ['3y', '3Y'], ['all', 'Since 2020'], ['2017', B ? 'Since 2015' : 'Since 2017 (log)']], span, (v) => { span = v; }));
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
    const all = J.series[tf], cut = span === '2017' ? (B ? '2015-01-01' : '2017-01-01') : span === 'all' ? '2020-01-01' : new Date(Date.now() - (span === '1y' ? 1 : 3) * 365.25 * 864e5).toISOString().slice(0, 10);
    const rows = all.filter((r) => r[0] >= cut).map((r) => ({ d: new Date(r[0] + 'T00:00:00Z'), day: r[0], c: r[1], 20: r[2], 50: r[3], 100: r[4], 200: r[5], btc: r[6] }));
    if (!rows.length) return;
    const W = Math.max(320, box.clientWidth || 900), H = Math.round(Math.min(420, Math.max(260, W * 0.42))), m = { t: 10, r: 46, b: 24, l: 8 };
    const x = d3.scaleUtc().domain(d3.extent(rows, (r) => r.d)).range([m.l, W - m.r]);
    const vals = rows.flatMap((r) => [r.c, r[20], r[50], r[100], r[200]]).filter((v) => v != null);
    const logY = B || span === '2017';
    const y = (logY ? d3.scaleLog() : d3.scaleLinear()).domain(d3.extent(vals)).nice().range([H - m.b, m.t]);
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
    svg.append('g').attr('transform', `translate(${W - m.r},0)`).call(B ? d3.axisRight(y).tickValues([100, 200, 500, 1e3, 2e3, 5e3, 1e4, 2e4, 3e4, 5e4, 7e4, 1e5, 1.5e5, 2e5].filter((v) => v >= y.domain()[0] && v <= y.domain()[1])).tickFormat((v) => '$' + (v >= 1e3 ? v / 1e3 + 'k' : v)) : span === '2017' ? d3.axisRight(y).tickValues([0.1, 0.2, 0.5, 1, 2, 5, 10].filter((v) => v >= y.domain()[0] && v <= y.domain()[1])).tickFormat((v) => v + '%') : d3.axisRight(y).ticks(6).tickFormat((v) => v + '%')).call((g) => g.select('.domain').remove()).call((g) => g.selectAll('line').attr('stroke', 'var(--line)')).call((g) => g.selectAll('text').attr('fill', 'var(--muted)'));
    svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(W / 110)))).call((g) => g.select('.domain').attr('stroke', 'var(--line)')).call((g) => g.selectAll('line').attr('stroke', 'var(--line)')).call((g) => g.selectAll('text').attr('fill', 'var(--muted)'));
    [200, 100, 50, 20].forEach((n) => svg.append('path').datum(rows.filter((r) => r[n] != null)).attr('fill', 'none').attr('stroke', COL[n]).attr('stroke-width', 1.3).attr('opacity', 0.9)
      .attr('d', d3.line().x((r) => x(r.d)).y((r) => y(r[n]))));
    svg.append('path').datum(rows).attr('fill', 'none').attr('stroke', COL.close).attr('stroke-width', 1.8).attr('d', d3.line().x((r) => x(r.d)).y((r) => y(r.c)));
    const cross = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'var(--muted)').attr('stroke-dasharray', '3 3').style('display', 'none');
    const bis = d3.bisector((r) => r.d).center;
    const say = (r) => { const s = tf === 'daily' ? 'D' : 'W'; info.innerHTML = `<b>${dd(r.day)}${tf === 'weekly' ? ' (week)' : ''}</b> · ${NM} <b>${fp(r.c)}</b> · ` + NS.map((n) => `${n}${s} ${f2(r[n])} (<span class="${cls(r[n] ? r.c / r[n] - 1 : null)}">${r[n] ? sp((r.c / r[n] - 1) * 100) : '—'}</span>)`).join(' · ') + (r.btc && !B ? ` · BTC ${usd(r.btc)}` : ''); };
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', (ev) => { const r = rows[bis(rows, x.invert(d3.pointer(ev)[0]))]; cross.attr('x1', x(r.d)).attr('x2', x(r.d)).style('display', null); say(r); })
      .on('pointerleave', () => { cross.style('display', 'none'); say(rows[rows.length - 1]); });
    say(rows[rows.length - 1]);
  }

  // ---------- 3. behaviour by regime ----------
  function behaveCard() {
    const c = card(`How ${NM} treated each SMA, by BTC market`,
      `<b>Above</b> = share of closes above the SMA. <b>Support held</b> = times ${NM} came down to the SMA from above (low within ${J.tolerance_pct}%) and closed back above it. <b>Resistance held</b> = came up to it from below and closed back under it.${B ? '' : ' Bears: USDT.D rises (BTC falls); bulls: USDT.D falls.'}`);
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
    if (B) c.append(el('p', { className: 'rf-note' }, 'What stands out: in bulls BTC held above its weekly 50 about 9 weeks in 10 (2020–21: 90%, 2023–25: 89%) and in bears it stayed under its daily 100/200 most days (2018: 20–23% above; 2022: 12–13%). The weekly 100 is less clean for BTC: after the huge 2017 run, BTC stayed above it for most of the 2018 bear, which is why the weekly read waits for the 100W.'));
    else { c.append(el('p', { className: 'rf-note' }, 'What stands out: in all three bears (2018, 2022, now) USDT.D held above the weekly 50 and 100 almost every week, and the daily 200 was a floor (2022: 13 of 16 touches held). In the 2023–25 bull the weekly 100 capped nearly every rally. Shock weeks (Aug 2024, Apr 2025) are the exceptions.'));
    c.append(el('p', { className: 'rf-note' }, '<b style="color:var(--warn)">⚠ Launch years (2017 bull, 2018 bear, 2019 rally):</b> ' + (J.regimes.find((R) => R.caveat) || {}).caveat + ' So the weekly 100 only became a clean bull/bear divider from about 2021; the daily SMAs (share of closes above the 20D/50D) separated bulls from bears in every period.')); }
    return c;
  }

  // ---------- 4. cycle signals ----------
  function signalsCard() {
    const C = J.crosses;
    const c = card('Cycle signals: the slow weekly crosses', 'Few crosses, close to BTC cycle turns. Weekly closes; BTC = close of that week.');
    const mk = (list, what) => list.map((x) => [dd(x.day), what(x), f2(x.usdtd), ...(B ? [] : [usd(x.btc)])]);
    const U = B ? 'pos' : 'neg', Dn = B ? 'neg' : 'pos';      // for BTC, crossing up is good; for USDT.D it is bad for crypto
    const rows = []
      .concat(mk(C.w50_w100, (x) => (x.dir === 'up' ? `<b class="${U}">50W above 100W</b> (${B ? 'bull' : 'bear'} setup)` : `<b class="${Dn}">50W below 100W</b> (${B ? 'bear' : 'bull'} setup)`)))
      .concat(mk(C.price_100w, (x) => (x.dir === 'up' ? `<span class="${U}">Weekly close above 100W</span>` : `<span class="${Dn}">Weekly close below 100W</span>`)))
      .concat(B ? mk(C.price_200w, (x) => (x.dir === 'up' ? `<span class="${U}">Weekly close above 200W</span>` : `<span class="${Dn}">Weekly close below 200W</span>`)) : [])
      .sort((a, b) => (a[0] === b[0] ? 0 : new Date(a[0]) - new Date(b[0])));
    const byDate = rows.map((r) => ({ r, t: Date.parse(r[0]) })).sort((a, b) => a.t - b.t).map((x) => x.r);
    const HD = B ? ['Week', 'Signal', 'BTC'] : ['Week', 'Signal', 'USDT.D', 'BTC'];
    c.append(table(HD, byDate));
    c.append(el('p', { className: 'rf-note' }, B ? 'Since the 100W first exists (Nov 2016) and the 200W (Oct 2018).' : 'Since the 100W first exists (Feb 2017). There are no crosses before Dec 2020: in the USDT launch years USDT.D stayed above its 100W through the 2017 bull, the 2018 bear and the 2019 rally.'));
    const d = el('details'); d.append(el('summary', { className: 'rf-note' }, `All weekly 50W crosses and daily 50D/200D crosses since ${B ? '2015' : '2017'}`));
    d.append(table(HD, mk(C.price_50w, (x) => 'Weekly close ' + (x.dir === 'up' ? 'above' : 'below') + ' 50W')));
    d.append(table(['Day', ...HD.slice(1)], mk(C.d50_d200, (x) => '50D ' + (x.dir === 'up' ? 'above' : 'below') + ' 200D')));
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

  function analogCardBtc() {
    const A = J.analog, PS = A.pasts || [], P = PS[PS.length - 1], N = A.now, NW = J.now;
    const c = card('Past bears vs now: 2018, 2022 and this one',
      `Weeks counted from each BTC top (${PS.map((p) => dd(p.top)).join(', ')} and ${dd(N.top)}). Distance = % above (+) or below (−) the SMA on the day of the low (weekly: last closed week's SMA; the 200W did not exist yet in 2018).`);
    const st = (o, k) => (o ? NS.map((n) => (o[k][n] == null ? `${n}: —` : `${n}: <span class="${cls(o[k][n])}">${sp(o[k][n])}</span>`)).join('<br>') : '—');
    const nowObj = { d: Object.fromEntries(NS.map((n) => [n, NW.daily[n].pct])), w: Object.fromEntries(NS.map((n) => [n, NW.weekly[n].pct])) };
    const col = (f, nowTxt) => PS.map(f).concat([nowTxt]);
    const wkOf = (d) => Math.round((Date.parse(d) - Date.parse(N.top)) / 6048e5);
    c.append(table(['', ...PS.map((p) => p.label + ' bear'), 'Now'], [
      ['BTC top → bottom', ...col((p) => `${dd(p.top)} → ${dd(p.bottom)} (<b>${p.weeks_top_to_bottom} weeks</b>)`, `top ${dd(N.top)}; <b>${N.weeks_since_top} weeks</b> so far`)],
      ['The low', ...col((p) => `<b>${usd(p.peak.usdtd)}</b> on ${dd(p.peak.day)}, week ${p.weeks_top_to_peak}: <b class="neg">${sp(p.drawdown)}</b> from the top`,
        N.peak ? `lowest so far <b>${usd(N.peak.usdtd)}</b> on ${dd(N.peak.day)} (week ${wkOf(N.peak.day)}): <b class="neg">${sp(N.drawdown)}</b>; today ${usd(NW.usdtd)} (${sp(N.now_vs_top)})` : '—')],
      ['Distance from daily SMAs', ...col((p) => 'at the low:<br>' + st(p.peak, 'd'), 'today:<br>' + st(nowObj, 'd'))],
      ['Distance from weekly SMAs', ...col((p) => 'at the low:<br>' + st(p.peak, 'w'), `last closed week (${dd(NW.weekly.week)}, ${usd(NW.weekly.close)}):<br>` + st(nowObj, 'w'))],
      ['After the low: first daily close above', ...col((p) => NS.map((n) => `${n}D ${dd(p.unwind['d' + n])}`).join('<br>'), N.peak ? NS.map((n) => `${n}D ${dd(N.unwind['d' + n])}`).join('<br>') + '<br><span style="color:var(--muted)">(after the ' + dd(N.peak.day) + ' low)</span>' : '—')],
      ['…and first weekly close above', ...col((p) => NS.map((n) => `${n}W ${dd(p.unwind['w' + n])}`).join('<br>'), N.peak ? NS.map((n) => `${n}W ${dd(N.unwind['w' + n])}`).join('<br>') : '—')]
    ]));
    const w = [];
    w.push(`Timing: the 2018 and 2022 bears bottomed ${PS.map((p) => p.weeks_top_to_bottom).join(' and ')} weeks after the top. This bear is in week ${N.weeks_since_top}: past that point, so the clock says "late", not "when".`);
    w.push(`Depth: ${PS.map((p) => `${p.label} fell ${sp(p.drawdown)}`).join(', ')}; this one is ${sp(N.drawdown)} at its lowest so far. Each cycle's fall has been shallower than the last.`);
    if (P && P.peak && P.peak.w[200] != null) w.push(`The 200W: at the 2022 low BTC was ${sp(P.peak.w[200])} from its 200W; today it is ${sp(NW.weekly[200].pct)} at the last weekly close (200W ${usd(NW.weekly[200].sma)}).`);
    w.push(`How 2022 turned up: daily close above the 20D (now ${usd(NW.daily[20].sma)}) → 50D (${usd(NW.daily[50].sma)}) → 200D (${usd(NW.daily[200].sma)}) → weekly close above the 50W (${usd(NW.weekly[50].sma)}) and later the 100W (${usd(NW.weekly[100].sma)}).`);
    c.append(el('p', { className: 'rf-note' }, '<b style="color:var(--ink)">What to watch</b>'));
    c.append(el('ul', { className: 'rf-note' }, w.map((x) => `<li style="margin:3px 0">${x}</li>`).join('')));
    return c;
  }

  // ---------- 6. turning points ----------
  function turnCard() {
    const c = card('Turning points and the SMA they turned at',
      (B ? 'Bears: BTC swing highs (relief-rally tops). Bulls: BTC swing lows (dips).' : 'Bears: USDT.D swing lows (= BTC relief-rally tops). Bulls: USDT.D swing highs (= BTC dips).') + ' Daily swings = lowest/highest of 21 days; weekly = 7 weeks. Nearest SMA and how far the turn was from it.');
    J.turning.slice().reverse().forEach((G, i) => {
      const d = el('details'); if (i === 0) d.open = true;
      d.append(el('summary', { className: 'rf-note' }, `<b class="${G.kind === 'bear' ? 'neg' : 'pos'}">${G.name}</b>: ${G.daily.length} daily and ${G.weekly.length} weekly ${(G.kind === 'bear') !== B ? 'lows' : 'highs'}`));
      const rows = G.daily.map((p) => [dd(p.day), 'D', f2(p.v), `${p.near}D (${sp(p.near_pct)})`, NS.map((n) => (p.dist[n] == null ? '' : `${n}: ${sp(p.dist[n])}`)).join(' · '), ...(B ? [] : [usd(p.btc)])])
        .concat(G.weekly.map((p) => [dd(p.day), 'W', f2(p.v), `${p.near}W (${sp(p.near_pct)})`, NS.map((n) => (p.dist[n] == null ? '' : `${n}: ${sp(p.dist[n])}`)).join(' · '), ...(B ? [] : [usd(p.btc)])]))
        .sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]));
      d.append(table(['Date', 'TF', (G.kind === 'bear') !== B ? 'Low' : 'High', 'Nearest SMA', 'Distance to each', ...(B ? [] : ['BTC'])], rows));
      c.append(d);
    });
    return c;
  }

  function render() {
    const R = root(); if (!R) return;
    if (!J) { R.replaceChildren(el('div', { className: 'br-card' }, '<p class="note">Loading ' + NM + ' analysis…</p>')); return; }
    const foot = el('p', { className: 'rf-note' }, `Built ${J.generated}. ${J.source} BTC cycle dates (closes): top 16 Dec 2017, bottom 15 Dec 2018, 2019 rally high 26 Jun 2019, bottom 12 Mar 2020, top 8 Nov 2021, bottom 21 Nov 2022, top 6 Oct 2025. ${B ? 'BTC history starts 1 Dec 2014; the 100W exists from Nov 2016 and the 200W from Oct 2018.' : 'USDT.D history starts 8 Mar 2015; the 100W exists from Feb 2017 and the 200W from Jan 2019.'} Patterns from past cycles, not a forecast; not financial advice.`);
    R.replaceChildren(...[readCard(), watchCard(B ? J.bottom_watch : J.top_watch), watchCard(B ? J.top_watch : J.bottom_watch), swingsCard()].filter(Boolean), nowCard(), chartCard(), behaveCard(), signalsCard(), B ? analogCardBtc() : analogCard(), turnCard(), foot);
  }
  let rs = null;
  window.addEventListener('resize', () => { clearTimeout(rs); rs = setTimeout(() => { const R = root(); if (J && R && !R.closest('[hidden]')) render(); }, 200); });
  return function () {
    if (J) { if (!root().dataset.drawn) { root().dataset.drawn = '1'; render(); } return; }
    render();
    load().then(() => { root().dataset.drawn = '1'; render(); }).catch((e) => { root().replaceChildren(el('div', { className: 'br-card' }, '<p class="note">Could not load the ' + NM + ' analysis (' + e.message + ').</p>')); });
  };
}
  window.__usdtd = make({ json: 'usdtd.json', root: 'usdtd-root' });
  window.__btccyc = make({ btc: true, json: 'btccycle.json', root: 'btccyc-root' });
})();
