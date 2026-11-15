/* Market structure on closed 4H candles (added 15 Nov 2026 at the owner's request): liquidity sweep -> market
   structure shift (MSS) with displacement -> entry on the fair value gap (FVG) the displacement left behind.

   Bullish MSS (a buy signal; the bearish one is the exact mirror and is used for trims, never for shorts):
     1. Swings     fractal pivots with K = 3 candles each side, usable only once the 3 candles after them have closed.
     2. Bearish    the last swing high before the break is a LOWER high (lower than the swing high before it),
        structure  so the move really was down: breaking it is a shift, not a continuation (BOS).
     3. Sweep      the lowest low between that lower high and the break took out an earlier swing low (liquidity).
     4. Shift      a 4H candle CLOSES above that lower high (the first close above it).
     5. Displace-  the leg from the sweep to the break leaves a bullish FVG (low of candle 3 above high of candle 1,
        ment       gap >= 0.1 x ATR), or the breaking candle's body is >= 1.2 x 4H ATR(14).
     Entry         the middle (50%) of the newest FVG in that leg; with no FVG, a retest of the broken lower high.
     Stop          the sweep low minus 0.25 x 4H ATR.
     Active        from the candle that confirms it for 30 4H candles (5 days), until a 4H close below the sweep
                   low (failed) or an opposite MSS.
   All of it reads closed candles only, so a signal never changes after it is shown. Rules of thumb, not
   financial advice. */
'use strict';
const K = 3, EXPIRY = 30, SL_ATR = 0.25, DISP_ATR = 1.2, GAP_ATR = 0.1;

function atrSeries(B, n = 14) {                          // Wilder ATR, same as the page; out[i] = ATR at candle i (null early)
  const { h, l, c } = B, out = new Array(c.length).fill(null);
  if (c.length < n + 1) return out;
  let a = 0;
  for (let i = 0; i < c.length; i++) {
    const tr = i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[i] - l[i];
    if (i < n) { a += tr; if (i === n - 1) out[i] = a / n; continue; }
    out[i] = (out[i - 1] * (n - 1) + tr) / n;
  }
  return out;
}

// every MSS in the series, both directions, in the order they were confirmed
function detect(B) {
  const { o, h, l, c } = B, n = c.length, A = atrSeries(B), ev = [];
  const PH = [], PL = [];                                // confirmed pivots [index, price], in order of confirmation
  let usedH = -1, usedL = -1;                            // pivot already broken (one MSS per swing)
  for (let j = 2 * K; j < n; j++) {
    const p = j - K;                                     // a pivot at p is confirmed once candle j = p + K has closed
    let isH = true, isL = true;
    for (let q = p - K; q <= p + K; q++) { if (h[q] > h[p]) isH = false; if (l[q] < l[p]) isL = false; }
    if (isH) PH.push([p, h[p]]);
    if (isL) PL.push([p, l[p]]);
    const a = A[j]; if (a == null) continue;
    for (const dir of [1, -1]) {
      const P = dir > 0 ? PH : PL, Q = dir > 0 ? PL : PH;
      if (P.length < 2) continue;
      const [hi, hp] = P[P.length - 1], prevP = P[P.length - 2][1];
      if ((dir > 0 ? usedH : usedL) === hi) continue;
      if (dir > 0 ? !(hp < prevP) : !(hp > prevP)) continue;                    // 2. lower high / higher low
      if (dir > 0 ? !(c[j] > hp && c[j - 1] <= hp) : !(c[j] < hp && c[j - 1] >= hp)) continue;   // 4. first close through
      let s = hi + 1;                                    // 3. the extreme of the leg between the swing and the break
      for (let q = hi + 1; q < j; q++) if (dir > 0 ? l[q] < l[s] : h[q] > h[s]) s = q;
      if (s >= j) continue;
      const sweepPx = dir > 0 ? l[s] : h[s];
      const prior = Q.filter(([qi]) => qi < s && qi + K <= s);
      if (!prior.length) continue;
      const lastQ = prior[prior.length - 1][1];
      if (dir > 0 ? !(sweepPx < lastQ) : !(sweepPx > lastQ)) continue;
      let gap = null;                                    // 5. newest FVG with its middle candle in the leg
      for (let i = Math.max(s + 1, 1); i <= j && i + 1 <= n - 1 && i + 1 <= j + 1; i++) {
        const lo = dir > 0 ? h[i - 1] : h[i + 1], hiG = dir > 0 ? l[i + 1] : l[i - 1];
        if (hiG - lo >= GAP_ATR * a) gap = { lo, hi: hiG, at: i + 1 };
      }
      const body = dir > 0 ? c[j] - o[j] : o[j] - c[j];
      if (!gap && !(body >= DISP_ATR * a)) continue;
      const conf = gap ? Math.max(j, gap.at) : j;
      const entry = gap ? (gap.lo + gap.hi) / 2 : hp;
      ev.push({ dir, swing_i: hi, level: hp, sweep_i: s, sweep: sweepPx, break_i: j, conf_i: conf, atr: a,
        fvg: gap ? { lo: gap.lo, hi: gap.hi } : null, entry, stop: sweepPx - dir * SL_ATR * a });
      if (dir > 0) usedH = hi; else usedL = hi;
    }
  }
  return ev.sort((x, y) => x.conf_i - y.conf_i);
}

// the MSS of direction dir still standing at candle `at` (default: the last closed candle), or null
function activeAt(B, ev, dir, at) {
  const { c } = B; at = at == null ? c.length - 1 : at;
  const mine = ev.filter((e) => e.dir === dir && e.conf_i <= at && at - e.conf_i < EXPIRY);
  for (let k = mine.length - 1; k >= 0; k--) {
    const e = mine[k];
    if (ev.some((x) => x.dir === -dir && x.conf_i > e.conf_i && x.conf_i <= at)) continue;   // an opposite shift came later
    let failed = false;
    for (let i = e.conf_i; i <= at; i++) if (dir > 0 ? c[i] < e.sweep : c[i] > e.sweep) { failed = true; break; }
    if (!failed) return Object.assign({}, e, { age: at - e.conf_i });
  }
  return null;
}

module.exports = { detect, activeAt, atrSeries, K, EXPIRY, SL_ATR, DISP_ATR, GAP_ATR };
