'use strict';
/* Levels to watch next: shared rules (identical copy in mbzazad-max/BTC-ETH-Dashboard and mbzazad-max/Metal, build/levels_core.js).
   The list is the Metal Cycle page's own levels() (owner, 28 Nov 2026: "added these ... whenever any of these triggers I need
   email, applicable for metals as well"):
     Upside (above the last close, nearest first)
       - the live early bottom signs not fired yet: 10D close, key reversal, 20D close, ★ swing break
       - the bottom swing-confirmation signs not fired yet: 20D, 50D, 20W, 200D, 50W
       - "Weekly close back above the 100W (ends the Bear read)" while the weekly close is below the 100W
     Downside (below the last close, nearest first)
       - "Close under the latest 30-day low (<date>) restarts the bottom watch"
       - the prior-year low (only where the asset gives it: metals)
       - "Weekly close under the 200W" while the weekly close is above it
       - the live early top signs not fired yet: 10D close, key reversal, 20D close, ★ swing break
     Same label twice (e.g. "Daily close above the 20D" in both bottom layers) = listed once, the first kept.
   An item TRIGGERS when a later build shows it happened, judged on the asset's own closed candles:
     sign items       -> that sign has now fired in the same episode (same extreme day), on a day after the last check
     100W / 200W      -> a newly closed week closed above its 100W / below its 200W
     30-day low, prior-year low -> a newly closed day closed below the level
   Usage: const L = require('./levels_core.js');
     L.list(A) -> {price, day, up:[item], down:[item]}; item = {id, label, level, dir:'up'|'down', tf:'D'|'W', kind, ep?}
     L.triggers(prevList, A) -> [{item, day, close, level_then}]
   A = normalized asset (each repo's adapter builds it):
     {name, price, day, week:{day, close, s100, s200},
      bottomFast:{live, extreme:{day, v}, signs:[{key, label, level, fired}]}, bottomSwing:{live, extreme:{day}, signs:[...]},
      topFast:{live, extreme:{day, v}, signs:[...]}, priorLow?, daily:[[day, close]], weekly:[[weekDay, close, s100, s200]]}
     sign keys: early c10, keyrev, c20, swing; swing confirmation c20, c50, w20, c200, w50 (each adapter maps its own ids). */

const FAST = ['c10', 'keyrev', 'c20', 'swing'];
const SWING = ['c20', 'c50', 'w20', 'c200', 'w50'];
const WEEKLY_SIGNS = new Set(['w20', 'w50']);

function list(A) {
  const c = A.price, up = [], dn = [];
  const signItems = (L, keys, dir, kind) => {
    if (!L || !L.signs) return;
    for (const k of keys) {
      const s = L.signs.find((x) => x.key === k);
      if (s && !s.fired && s.level != null) (dir === 'up' ? up : dn).push({ id: kind + ':' + k, label: s.label, level: s.level, dir, tf: kind.endsWith('swing') && WEEKLY_SIGNS.has(k) ? 'W' : 'D', kind, ep: L.extreme && L.extreme.day });
    }
  };
  if (A.bottomFast && A.bottomFast.live) signItems(A.bottomFast, FAST, 'up', 'bottom_fast');
  if (A.bottomSwing && A.bottomSwing.live !== false) signItems(A.bottomSwing, SWING, 'up', 'bottom_swing');
  if (A.week && A.week.s100 != null && A.week.close < A.week.s100) up.push({ id: 'w100', label: 'Weekly close back above the 100W (ends the Bear read)', level: A.week.s100, dir: 'up', tf: 'W', kind: 'w100' });
  const seen = new Set();
  const U = up.filter((x) => { if (seen.has(x.label)) return false; seen.add(x.label); return x.level > c; }).sort((a, b) => a.level - b.level);
  if (A.bottomFast && A.bottomFast.extreme) dn.push({ id: 'low30', label: 'Close under the latest 30-day low (' + A.bottomFast.extreme.day + ') restarts the bottom watch', level: A.bottomFast.extreme.v, dir: 'down', tf: 'D', kind: 'low30', ep: A.bottomFast.extreme.day });
  if (A.priorLow != null) dn.push({ id: 'prior_low', label: 'Prior-year low (the "held near the prior low" test)', level: A.priorLow, dir: 'down', tf: 'D', kind: 'prior_low' });
  if (A.week && A.week.s200 != null && A.week.close > A.week.s200) dn.push({ id: 'w200', label: 'Weekly close under the 200W', level: A.week.s200, dir: 'down', tf: 'W', kind: 'w200' });
  if (A.topFast && A.topFast.live) signItems(A.topFast, FAST, 'down', 'top_fast');
  const D = dn.filter((x) => x.level < c).sort((a, b) => b.level - a.level);
  return { price: c, day: A.day, week: A.week ? A.week.day : null, up: U, down: D };
}

function triggers(prev, A) {
  if (!prev || !prev.day) return [];
  const out = [];
  const newDays = (A.daily || []).filter((r) => r[0] > prev.day);
  const newWeeks = (A.weekly || []).filter((r) => prev.week == null || r[0] > prev.week);
  const layer = { bottom_fast: A.bottomFast, bottom_swing: A.bottomSwing, top_fast: A.topFast };
  for (const it of [].concat(prev.up || [], prev.down || [])) {
    let hit = null;
    if (layer[it.kind] !== undefined) {
      const L = layer[it.kind], k = it.id.split(':')[1];
      if (L && L.extreme && L.extreme.day === it.ep) {
        const s = (L.signs || []).find((x) => x.key === k);
        if (s && s.fired && s.fired > prev.day) {
          const row = (A.daily || []).find((r) => r[0] === s.fired);
          hit = { day: s.fired, close: row ? row[1] : null };
        }
      }
    } else if (it.kind === 'w100') {
      const r = newWeeks.find((w) => w[2] != null && w[1] > w[2]); if (r) hit = { day: r[0], close: r[1], level_now: r[2] };
    } else if (it.kind === 'w200') {
      const r = newWeeks.find((w) => w[3] != null && w[1] < w[3]); if (r) hit = { day: r[0], close: r[1], level_now: r[3] };
    } else if (it.kind === 'low30' || it.kind === 'prior_low') {
      const r = newDays.find((d) => d[1] < it.level); if (r) hit = { day: r[0], close: r[1] };
    }
    if (hit) out.push(Object.assign({ item: it, level_then: it.level }, hit));
  }
  return out;
}

module.exports = { list, triggers, FAST, SWING };
