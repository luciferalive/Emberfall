// Settlement map: a blueprint of the whole settlement. Every building has its own line-drawn
// glyph; buildings are placed in district sectors around the campfire, on concentric ring roads
// that appear as the settlement grows. Landmarks (forest, mine, cave, ruins, sea) come out of
// the fog as they are unlocked, and the plan widens to take them in. Nothing is saved: the
// picture is derived from the game state, so it always matches.
import { BUILDING_GROUPS, BUILDING_BY_ID } from './buildings.js';

export const SQ = 0.84;                       // vertical squash of the plan (gives a tilted, map-table look)
export const FOOT = { w: 92, h: 104 };        // footprint of one plot (used by the layout test)
const SECTOR_SPAN = 24;                       // degrees either side of a sector's centre line
const ringRadius = k => 195 + 140 * (k - 1);
const roadRadius = k => ringRadius(k) - 70;

export const DISTRICTS = {
  fire: { name: 'Hearth', color: '#ffb347', angle: 0 },
  housing: { name: 'Housing & comfort', color: '#7fd1a0', angle: 210 },
  production: { name: 'Food & materials', color: '#e0c36a', angle: 270 },
  trade: { name: 'Workshops & trade', color: '#6fb4ff', angle: 330 },
  defence: { name: 'Defence & heroes', color: '#ff8f8f', angle: 30 },
  knowledge: { name: 'Knowledge & magic', color: '#b79cff', angle: 90 },
  stores: { name: 'Stores', color: '#d2bd9c', angle: 150 }
};
const GROUP_KEYS = ['housing', 'production', 'trade', 'defence', 'knowledge'];
const districtOf = (() => {
  const map = {};
  BUILDING_GROUPS.forEach(([, ids], i) => ids.forEach(id => { map[id] = GROUP_KEYS[i]; }));
  map.campfire = 'fire';
  return id => map[id] || (BUILDING_BY_ID[id]?.tier === 'Storage' ? 'stores' : 'trade');
})();
export { districtOf };

const rad = d => (d * Math.PI) / 180;
const riverAt = (deg, R) => { const t = rad(deg); return R + 16 * Math.sin(3 * t + 0.5) + 9 * Math.sin(7 * t + 1.3); };
const polar = (deg, r) => ({ x: Math.round(r * Math.cos(rad(deg))), y: Math.round(r * SQ * Math.sin(rad(deg))) });

// Plot positions are worked out once, up front: districts take turns claiming the first free spot
// (inner rings first, centre line of the sector first) that does not overlap anything already
// claimed. The result is a fixed table, so a building never moves once it is placed.
const SLOT_COUNT = 16;
const GAP = 8;
const SLOTS = (() => {
  const table = {}, taken = [];
  const names = Object.keys(DISTRICTS).filter(d => d !== 'fire');
  names.forEach(d => { table[d] = []; });
  const candidates = d => {
    const list = [];
    for (let ring = 1; ring <= 9; ring++) {
      const offsets = [];
      for (let o = 0; o <= SECTOR_SPAN; o += 2) { offsets.push(o); if (o) offsets.push(-o); }
      offsets.forEach(o => list.push({ ring, angle: DISTRICTS[d].angle + o }));
    }
    return list;
  };
  const lists = Object.fromEntries(names.map(d => [d, candidates(d)]));
  for (let n = 0; n < SLOT_COUNT; n++) {
    names.forEach(d => {
      const pick = lists[d].find(c => {
        const p = polar(c.angle, ringRadius(c.ring));
        return !taken.some(t => Math.abs(t.x - p.x) < FOOT.w + GAP && Math.abs(t.y - p.y) < FOOT.h + GAP);
      });
      const p = polar(pick.angle, ringRadius(pick.ring));
      taken.push(p);
      table[d].push({ ...p, ring: pick.ring, angle: pick.angle });
    });
  }
  return table;
})();

// The nth plot (0-based) in a district: which ring it sits on and where.
export function slotPosition(district, n) {
  if (district === 'fire') return { x: 0, y: 0, ring: 0, angle: 0 };
  const list = SLOTS[district];
  if (n < list.length) return list[n];
  const last = list[list.length - 1];
  const extra = n - list.length + 1;
  return { ...last, ring: last.ring + Math.ceil(extra / 2), x: last.x + (extra % 2 ? FOOT.w + GAP : -FOOT.w - GAP), y: last.y + Math.ceil(extra / 2) * (FOOT.h + GAP) };
}

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------
const LANDMARKS = [
  { id: 'forest', name: 'The Forest', angle: 195, feature: 'forest' },
  { id: 'mine', name: 'Old Mine', angle: 345, feature: 'oldMine' },
  { id: 'cave', name: 'Dark Cave', angle: 15, feature: 'darkCave' },
  { id: 'ruins', name: 'Ancient Ruins', angle: 165, feature: 'ancientRuins' },
  { id: 'sea', name: 'The Shore', angle: 90, test: g => g.hasBuilding('harbour') || g.hasBuilding('fishermanHut') }
];

export function layoutSettlement(game, { ghosts = 4 } = {}) {
  const used = {};
  const nodes = [];
  const order = [...game.state.buildings].sort((a, b) => (a.id === 'campfire' ? -1 : b.id === 'campfire' ? 1 : 0));
  order.forEach(inst => {
    const def = BUILDING_BY_ID[inst.id];
    if (!def) return;
    const district = districtOf(inst.id);
    const n = used[district] = (used[district] ?? -1) + 1;
    nodes.push({ key: `b:${inst.uid}`, uid: inst.uid, id: inst.id, name: def.name, level: inst.level, district, cap: game.capacityOf(inst), ...slotPosition(district, n) });
  });
  const options = Object.values(BUILDING_BY_ID)
    .filter(def => game.buildingAvailable(def) && game.countBuilt(def.id) === 0)
    .sort((a, b) => game.canAfford(game.buildCost(b)) - game.canAfford(game.buildCost(a)))
    .slice(0, ghosts);
  const plots = options.map(def => {
    const district = districtOf(def.id);
    const n = used[district] = (used[district] ?? -1) + 1;
    return { key: `d:${def.id}`, id: def.id, name: def.name, level: 0, district, ghost: true, affordable: game.canAfford(game.buildCost(def)), ...slotPosition(district, n) };
  });
  const all = [...nodes, ...plots];

  // Ring roads (solid once something real stands on them, dotted while only planned) and spokes.
  const maxRing = all.reduce((m, p) => Math.max(m, p.ring), 1);
  const rings = [];
  for (let k = 1; k <= maxRing; k++) {
    if (all.some(p => p.ring === k)) rings.push({ k, r: roadRadius(k), planned: !nodes.some(p => p.ring === k) });
  }
  const spokes = [];
  [180, 240, 300, 0, 60, 120].forEach(b => {
    const touching = Object.keys(DISTRICTS).filter(d => d !== 'fire' && Math.abs(((DISTRICTS[d].angle - b + 540) % 360) - 180) <= 31);
    const real = Math.max(0, ...nodes.filter(p => touching.includes(p.district)).map(p => p.ring));
    const planned = Math.max(0, ...all.filter(p => touching.includes(p.district)).map(p => p.ring));
    if (planned) spokes.push({ angle: b, from: 52, to: roadRadius(planned) + 6, solidTo: real ? roadRadius(real) + 6 : 52 });
  });

  const perim = ringRadius(maxRing) + 60;
  const riverR = ringRadius(maxRing) + 140;
  const lmR = riverR + 150;
  const landmarks = LANDMARKS.map(l => {
    const known = l.feature ? game.unlocked(l.feature) : l.test(game);
    return { ...l, known, ...polar(l.angle, lmR), from: polar(l.angle, perim), to: polar(l.angle, lmR - 52), bridge: { ...polar(l.angle, riverAt(l.angle, riverR)), rot: Math.round((Math.atan2(SQ * Math.sin(rad(l.angle)), Math.cos(rad(l.angle))) * 180) / Math.PI) } };
  });
  const wall = game.unlocked('estate') ? { rx: ringRadius(maxRing) + 100, ry: (ringRadius(maxRing) + 100) * SQ } : null;

  const halfW = Math.max(470, ...all.map(p => Math.abs(p.x) + FOOT.w / 2 + 40), ...landmarks.map(l => Math.abs(l.x) + 90), riverR + 90);
  const halfH = Math.max(300, ...all.map(p => Math.abs(p.y) + FOOT.h / 2 + 30), ...landmarks.map(l => Math.abs(l.y) + 80), (riverR + 60) * SQ);
  return { nodes, plots, rings, spokes, landmarks, wall, perim, riverR, view: { x: -halfW, y: -halfH, w: halfW * 2, h: halfH * 2 } };
}

// ---------------------------------------------------------------------------------------------
// Glyphs: one hand-built line drawing per building, in a 60x60 box (ground line at y = 12).
// Classes: l line, f dark panel, a amber, w lit window, k black opening, rd red.
// ---------------------------------------------------------------------------------------------
const R = (x, y, w, h, c = 'f') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${c}"/>`;
const P = (d, c = 'f') => `<path d="${d}" class="${c}"/>`;
const C = (x, y, r, c = 'f') => `<circle cx="${x}" cy="${y}" r="${r}" class="${c}"/>`;
const E = (x, y, rx, ry, c = 'f', extra = '') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" class="${c}" ${extra}/>`;
const roof = (x1, x2, y, top) => P(`M${x1} ${y} L${(x1 + x2) / 2} ${top} L${x2} ${y}Z`, 'rf');
const gear = (x, y, r) => C(x, y, r, 'l') + `<circle cx="${x}" cy="${y}" r="${r + 3}" class="l teeth"/>` + C(x, y, 2.5, 'a');
const waves = (y, x0 = -30) => P(`M${x0} ${y} q5 -4 10 0 t10 0 t10 0 t10 0 t10 0 t10 0`, 'l');
const flame = (x, y, s = 1) => P(`M${x} ${y} c${-6 * s} ${-4 * s} ${-4 * s} ${-12 * s} 0 ${-20 * s} c${2 * s} ${8 * s} ${8 * s} ${10 * s} ${4 * s} ${16 * s} c${-1 * s} ${4 * s} ${-3 * s} ${4 * s} ${-4 * s} ${4 * s}Z`, 'a');
const crenel = (x1, x2, y, h = 6, step = 8) => { let d = `M${x1} ${y}`; for (let x = x1; x < x2; x += step * 2) d += ` V${y - h} H${Math.min(x + step, x2)} V${y} H${Math.min(x + step * 2, x2)}`; return P(d, 'l'); };

const GLYPHS = {
  campfire: () => E(0, 12, 20, 6, 'l') + C(-16, 11, 3) + C(16, 11, 3) + C(-8, 15, 3) + C(9, 15, 3) + P('M-15 12 L13 4 M15 12 L-13 4', 'l') + P('M0 6 C-14 -2 -9 -16 0 -34 C3 -20 15 -14 10 -2 C8 5 3 6 0 6Z', 'a') + P('M0 4 C-6 -2 -4 -10 0 -20 C3 -10 8 -6 4 0 C3 3 1 4 0 4Z', 'w'),
  smallHouse: () => R(-18, -8, 36, 20) + roof(-23, 23, -8, -30) + R(-4, 0, 8, 12) + R(8, -3, 7, 7, 'w') + R(9, -30, 6, 13) + R(-15, -3, 7, 7, 'w'),
  lumberYard: () => [-18, -6, 6, 18].map(x => C(x, 6, 6)).join('') + [-12, 0, 12].map(x => C(x, -5, 6)).join('') + [-6, 6].map(x => C(x, -16, 6)).join('') + C(0, -27, 6) + [-18, -6, 6, 18].map(x => C(x, 6, 2, 'a')).join('') + P('M-30 14 H30 M-28 14 V4 M28 14 V4', 'l'),
  stoneyard: () => P('M-27 12 L-21 -4 L-7 -9 L3 12Z') + P('M0 12 L6 -14 L18 -19 L27 12Z') + P('M-13 -8 L-7 -22 L5 -23 L10 -15 L6 -12', 'f') + P('M-18 2 L-8 4 M10 -2 L20 0', 'l') + P('M24 -22 L18 -8 M21 -24 L27 -20', 'l'),
  granary: () => R(-14, -18, 28, 30) + P('M-14 -18 A14 13 0 0 1 14 -18Z') + P('M-14 -8 H14 M-14 2 H14', 'l') + R(-30, -4, 15, 16) + P('M-30 -4 A7.5 8 0 0 1 -15 -4Z') + P('M19 12 V-14 M26 12 V-14 M19 -6 H26 M19 2 H26 M19 8 H26', 'l'),
  coalStore: () => P('M-27 12 V-6 L24 -17 V12Z') + P('M-12 12 C-10 -4 6 -6 14 12Z', 'k') + [[-2, 2], [4, 6], [8, 9], [-6, 8]].map(([x, y]) => C(x, y, 1.6, 'a')).join('') + P('M18 -14 q-4 -6 0 -10', 'l'),
  oreDepot: () => R(-27, -6, 32, 18) + P('M-29 -6 L7 -6 L1 -16 L-23 -16Z') + P('M9 -2 L29 -2 L25 10 L13 10Z') + C(15, 12, 3) + C(24, 12, 3) + [[14, -5], [20, -7], [25, -4]].map(([x, y]) => C(x, y, 3.5, 'a')).join('') + P('M5 16 H32', 'l') + R(-18, 0, 12, 12, 'k'),
  hideStore: () => P('M-25 12 L0 -30 L25 12Z') + P('M0 -8 L-8 12 H8Z', 'k') + P('M-5 -36 L5 -26 M5 -36 L-5 -26', 'l') + P('M22 -8 L30 -8 L28 4 L25 8 L22 3Z', 'a') + P('M-25 12 L-30 16 M25 12 L30 16', 'l'),
  woodcutterHut: () => R(-22, -10, 30, 22) + P('M-22 -2 H8 M-22 5 H8', 'l') + roof(-26, 12, -10, -28) + R(-8, 2, 8, 10, 'k') + R(14, 4, 11, 8) + E(19.5, 4, 5.5, 2, 'f') + P('M19 4 V-10 M15 -10 H24 L24 -5 H15Z', 'l') + P('M-18 14 H24', 'l'),
  farm: () => P('M-30 14 L-15 -2 L30 -2 L15 14Z') + P('M-22 10 L-8 -2 M-14 12 L2 -2 M-5 13 L11 -2 M3 13 L19 -2 M10 12 L22 0', 'l') + R(-6, -22, 22, 16) + roof(-9, 19, -22, -34) + R(2, -12, 6, 6, 'k') + P('M-28 -6 Q-24 -20 -14 -6Z', 'a'),
  quarry: () => P('M-30 -4 H30 L24 3 H-24Z') + P('M-23 3 H23 L17 9 H-17Z') + P('M-15 9 H15 L10 14 H-10Z', 'k') + P('M-24 -4 V-28 H8 M-24 -18 L-9 -28 M8 -28 V-12', 'l') + R(4, -12, 8, 7, 'a') + P('M20 -8 L26 -14 M22 -14 L28 -8', 'l'),
  hunterLodge: () => R(-22, -6, 44, 18) + roof(-27, 27, -6, -26) + P('M-9 -13 L-7 -22 M-7 -18 L-13 -21 M9 -13 L7 -22 M7 -18 L13 -21 M-9 -13 H9', 'l') + R(-4, 2, 8, 10, 'k') + R(10, -2, 7, 7, 'w') + R(-17, -2, 7, 7, 'w'),
  well: () => E(0, 7, 17, 7) + E(0, 6, 12, 4, 'w') + R(-17, -18, 3, 24, 'l') + R(14, -18, 3, 24, 'l') + roof(-23, 23, -17, -32) + P('M0 -16 V-4', 'l') + R(-3, -5, 6, 6, 'a'),
  workshop: () => R(-24, -6, 48, 18) + P('M-24 -6 V-18 L-8 -6 V-18 L8 -6 V-18 L24 -6') + R(-5, 2, 10, 10, 'k') + R(12, 0, 8, 7, 'w') + gear(12, -27, 8),
  tavern: () => R(-22, -22, 38, 34) + roof(-27, 21, -22, -40) + R(-16, -15, 8, 8, 'w') + R(-2, -15, 8, 8, 'w') + R(-16, -1, 8, 8, 'w') + R(-2, 0, 10, 12, 'k') + P('M16 -12 H27 M27 -12 V-8', 'l') + R(22, -8, 8, 10, 'a'),
  fishermanHut: () => P('M-22 12 V4 M-9 12 V4 M5 12 V4 M18 12 V4', 'l') + R(-28, 0, 52, 4) + R(-18, -18, 26, 18) + roof(-22, 12, -18, -32) + R(-8, -10, 8, 10, 'k') + P('M14 -6 Q20 -14 28 -6 Q20 2 14 -6Z M28 -6 L33 -10 V-2Z', 'a') + waves(15),
  blacksmith: () => R(-25, -6, 30, 18) + P('M-29 -6 L-8 -22 L9 -6Z') + R(-14, -32, 7, 14) + C(-9, -37, 3, 'l') + C(-5, -43, 2, 'l') + R(-18, 0, 10, 12, 'w') + P('M12 4 H29 L27 8 H23 V12 H18 V8 H14Z', 'a'),
  barracks: () => R(-28, -10, 56, 22) + crenel(-28, 28, -10) + P('M-20 -16 V-38', 'l') + P('M-20 -38 L-4 -33 L-20 -28Z', 'a') + P('M-6 -2 L6 10 M6 -2 L-6 10', 'l') + R(12, 0, 10, 12, 'k') + R(-24, 0, 8, 7, 'w'),
  hospital: () => R(-24, -14, 48, 26) + P('M-24 -14 L0 -26 L24 -14', 'l') + P('M-4 -10 H4 V-4 H10 V4 H4 V10 H-4 V4 H-10 V-4 H-4Z', 'rd') + R(14, 2, 8, 10, 'k') + R(-22, 2, 8, 10, 'k'),
  marketplace: () => P('M-28 -16 H28 L24 -4 H-24Z') + P('M-14 -16 L-12 -4 M0 -16 V-4 M14 -16 L12 -4', 'l') + P('M-24 -4 V12 M24 -4 V12', 'l') + R(-22, 5, 44, 7) + C(-12, 3, 3.5, 'a') + C(-4, 3, 3.5, 'a') + R(6, -2, 10, 7) + P('M0 -16 V-30 M0 -30 L10 -27 L0 -24Z', 'l'),
  library: () => P('M-27 -14 L0 -31 L27 -14Z') + P('M-21 -14 V12 M-9 -14 V12 M9 -14 V12 M21 -14 V12', 'l') + R(-27, 12, 54, 4) + P('M-9 -21 Q0 -25 0 -21 Q0 -25 9 -21 V-17 Q0 -20 0 -17 Q0 -20 -9 -17Z', 'a') + R(-5, -2, 10, 14, 'k'),
  mageTower: () => R(-9, -30, 18, 42) + roof(-15, 15, -30, -52) + R(-3, -22, 6, 8, 'w') + R(-3, -6, 6, 8, 'w') + C(0, -57, 2.5, 'a') + E(0, -20, 22, 6, 'l', 'stroke-dasharray="3 4"') + P('M-9 12 H9 V6 H-9Z', 'k'),
  watchtower: () => P('M-14 12 L-8 -14 M14 12 L8 -14 M-12 3 H12 M-10 -6 H10 M-12 12 L10 -6 M12 12 L-10 -6', 'l') + R(-15, -19, 30, 5) + R(-10, -31, 20, 12) + roof(-15, 15, -31, -42) + R(-3, -27, 6, 6, 'w') + flame(19, -22, 0.6),
  stable: () => R(-24, -12, 40, 24) + P('M-28 -12 L-20 -26 L-4 -33 L12 -26 L20 -12Z') + P('M-12 -2 H4 V12 H-12Z M-12 -2 L4 12 M4 -2 L-12 12', 'l') + P('M-8 -18 a4 4 0 1 0 8 0', 'a') + P('M20 12 V0 M30 12 V0 M18 4 H32 M18 9 H32', 'l'),
  guildHall: () => R(-20, -8, 40, 20) + roof(-23, 23, -8, -26) + R(-31, -22, 11, 34) + roof(-33, -18, -22, -36) + R(20, -22, 11, 34) + roof(18, 33, -22, -36) + P('M-6 -8 V10 L0 6 L6 10 V-8Z', 'a') + R(-29, -12, 7, 7, 'w') + R(22, -12, 7, 7, 'w'),
  trainingGrounds: () => E(0, 6, 29, 11, 'l', 'stroke-dasharray="4 3"') + P('M-14 8 V-14 M-21 -8 H-7', 'l') + C(-14, -18, 4) + C(13, -8, 11) + C(13, -8, 6, 'a') + C(13, -8, 2.5, 'k') + P('M13 3 V12 M7 12 H19', 'l'),
  alchemistLab: () => R(-26, -4, 28, 16) + roof(-30, 6, -4, -20) + R(-6, 2, 8, 10, 'k') + P('M-18 -14 V-26 H-10', 'l') + P('M10 -30 H20 V-18 L29 2 Q31 11 24 12 H6 Q-1 11 2 3 L10 -18Z', 'w') + C(14, -35, 2) + C(19, -40, 1.5),
  castle: () => R(-14, -28, 28, 40) + crenel(-14, 14, -28) + R(-32, -18, 14, 30) + roof(-34, -16, -18, -34) + R(18, -18, 14, 30) + roof(16, 34, -18, -34) + P('M-6 12 V2 A6 6 0 0 1 6 2 V12Z', 'k') + R(-3, -20, 6, 8, 'w') + P('M0 -34 V-52', 'l') + P('M0 -52 L12 -48 L0 -44Z', 'a'),
  treasury: () => R(-23, -8, 46, 20) + P('M-23 -8 A23 22 0 0 1 23 -8Z') + C(0, -33, 5, 'a') + P('M-17 -8 V12 M17 -8 V12', 'l') + R(-7, 0, 14, 12, 'k') + C(0, 6, 2.5, 'a'),
  bakery: () => R(-24, -6, 30, 18) + roof(-28, 10, -6, -24) + R(-6, 2, 8, 10, 'k') + P('M12 12 A11 15 0 0 1 28 12Z') + P('M16 5 H24', 'l') + R(-18, -36, 6, 14) + C(-15, -41, 2.5, 'l') + E(-15, -2, 5, 3, 'a'),
  sawmill: () => R(-27, -8, 34, 20) + P('M-29 -8 H9 L3 -18 H-23Z') + C(20, -2, 10, 'l') + `<circle cx="20" cy="-2" r="13" class="l teeth"/>` + C(20, -2, 2.5, 'a') + P('M-30 16 H30', 'l') + E(-24, 14, 3, 2.2, 'a') + R(-14, 0, 10, 12, 'k'),
  mine: () => P('M-30 12 L-8 -26 L4 -10 L12 -22 L30 12Z') + R(-10, 0, 18, 12, 'k') + P('M-10 12 V-2 H8 V12 M-10 -2 L-6 -6 H4 L8 -2', 'l') + P('M-14 15 H20', 'l') + C(14, 12, 2.5),
  jeweller: () => R(-22, -6, 44, 18) + P('M-25 -6 H25 L20 -15 H-20Z') + R(-16, 0, 12, 12, 'w') + R(6, 0, 10, 12, 'k') + P('M-7 -22 H7 L11 -28 L0 -40 L-11 -28Z', 'a') + P('M-11 -28 H11 M-4 -22 L-3 -28 L0 -40 M4 -22 L3 -28 L0 -40', 'l'),
  temple: () => R(-27, 9, 54, 4) + R(-24, 5, 48, 4) + P('M-20 -12 V5 M-10 -12 V5 M0 -12 V5 M10 -12 V5 M20 -12 V5', 'l') + P('M-27 -12 L0 -29 L27 -12Z') + C(0, -19, 4.5, 'a'),
  harbour: () => P('M-30 12 H30 M-30 6 H30', 'l') + P('M-18 -2 H18 L12 9 H-12Z') + P('M0 -2 V-32', 'l') + P('M0 -30 L18 -6 H0Z', 'a') + waves(15) + P('M26 6 V-8 M23 -8 H29', 'l'),
  animalSanctuary: () => E(0, 6, 29, 11, 'l') + P('M-29 6 V-2 M-14 15 V7 M14 15 V7 M29 6 V-2', 'l') + P('M0 6 V-14', 'l') + C(0, -22, 11) + C(-6, -20, 5) + C(7, -19, 5) + C(-13, 8, 2, 'a') + C(-9, 5, 1.3, 'a') + C(-17, 5, 1.3, 'a'),
  monsterSanctuary: () => P('M-28 12 V-8 M-18 12 V-8 M-8 12 V-8 M8 12 V-8 M18 12 V-8 M28 12 V-8 M-30 -2 H30', 'l') + P('M-9 6 Q-9 -14 0 -14 Q9 -14 9 6 Z') + P('M-9 -8 Q-18 -10 -17 -24 M9 -8 Q18 -10 17 -24', 'l') + C(-4, -4, 2, 'w') + C(4, -4, 2, 'w'),
  dungeonEntrance: () => P('M-23 12 V-6 A23 22 0 0 1 23 -6 V12Z') + P('M-13 12 V-4 A13 13 0 0 1 13 -4 V12Z', 'k') + P('M-10 4 H10 M-8 8 H8 M-6 12 H6', 'l') + C(0, -25, 4.5, 'l') + flame(-28, 8, 0.5) + flame(28, 8, 0.5),
  warehouse: () => R(-29, -12, 58, 24) + P('M-31 -12 Q0 -36 31 -12Z') + R(-12, -2, 24, 14, 'k') + P('M-12 -2 L12 12 M12 -2 L-12 12', 'l') + R(-27, 4, 8, 8, 'a') + R(19, 4, 8, 8, 'a'),
  tradingPost: () => R(-22, -8, 32, 14) + P('M-22 -8 Q-6 -30 10 -8Z') + C(-14, 9, 6) + C(4, 9, 6) + P('M22 12 V-28', 'l') + P('M22 -24 H34 L38 -20 L34 -16 H22Z', 'a') + P('M22 -13 H11 L7 -9 L11 -5 H22Z'),
  farmingEstate: () => R(-30, -8, 30, 20) + roof(-34, 4, -8, -26) + R(-6, 2, 8, 10, 'k') + R(-26, -2, 7, 6, 'w') + R(6, -22, 14, 34) + P('M6 -22 A7 8 0 0 1 20 -22Z') + P('M25 12 L30 4 M22 12 L27 4 M19 12 L24 4', 'l'),
  academy: () => R(-26, -4, 52, 16) + R(-9, -26, 18, 22) + P('M-9 -26 A9 9 0 0 1 9 -26Z') + C(0, -17, 5.5, 'l') + P('M0 -17 V-21 M0 -17 L3 -15', 'l') + P('M0 -35 V-44 M0 -44 L9 -41 L0 -38', 'a') + R(-22, 2, 7, 6, 'w') + R(15, 2, 7, 6, 'w') + R(-4, 2, 8, 10, 'k'),
  magicObservatory: () => R(-18, -6, 36, 18) + P('M-18 -6 A18 18 0 0 1 18 -6Z') + P('M-3 -24 L3 -24 L5 -6 L-5 -6Z', 'k') + P('M0 -17 L15 -35 L20 -31 L5 -13Z', 'a') + P('M-26 -30 v6 M-29 -27 h6 M26 -22 v5 M23.5 -19.5 h5', 'l') + R(-4, 2, 8, 10, 'k'),
  dragonRoost: () => P('M-26 12 L-14 -10 L-6 -2 L2 -26 L10 -6 L18 -12 L28 12Z') + P('M2 -28 L-18 -42 L-12 -30 L-17 -24 L1 -26Z M4 -28 L24 -42 L18 -30 L23 -24 L5 -26Z', 'a') + E(3, -29, 5, 3.5, 'a') + E(14, 8, 12, 5) + C(9, 5, 3, 'a') + C(16, 6, 2.5, 'a'),
  researchLab: () => R(-24, -6, 34, 18) + R(-6, 2, 8, 10, 'k') + R(-20, 0, 8, 7, 'w') + E(17, -22, 14, 5, 'l') + `<ellipse cx="17" cy="-22" rx="14" ry="5" class="l" transform="rotate(60 17 -22)"/><ellipse cx="17" cy="-22" rx="14" ry="5" class="l" transform="rotate(-60 17 -22)"/>` + C(17, -22, 3, 'a')
};
const FALLBACK = () => R(-20, -14, 40, 26) + roof(-24, 24, -14, -30);

// Landmarks (drawn larger, outside the settlement).
const tree = (x, y, s = 1) => P(`M${x} ${y - 30 * s} L${x - 9 * s} ${y - 12 * s} H${x + 9 * s}Z M${x} ${y - 20 * s} L${x - 12 * s} ${y} H${x + 12 * s}Z M${x} ${y} V${y + 6 * s}`);
const LANDMARK_GLYPH = {
  forest: () => [[-34, 6, 1], [-10, 14, 1.2], [18, 4, 1.1], [40, 14, 0.9], [-22, 32, 0.9], [8, 36, 1], [32, 34, 1]].map(([x, y, s]) => tree(x, y, s)).join(''),
  mine: () => P('M-46 20 L-18 -34 L0 -10 L16 -30 L46 20Z') + P('M-12 20 V-2 A12 10 0 0 1 12 -2 V20Z', 'k') + P('M-16 22 H22', 'l') + C(22, 22, 3),
  cave: () => P('M-44 20 Q-40 -30 0 -32 Q40 -30 44 20Z') + P('M-20 20 Q-18 -8 0 -8 Q18 -8 20 20Z', 'k') + P('M-8 -12 L-6 -2 M8 -12 L6 -2', 'l'),
  ruins: () => P('M-36 20 V-6 M-26 -6 V20', 'l') + R(-38, -10, 14, 4) + P('M-6 20 V-20', 'l') + R(-10, -24, 12, 4) + P('M20 20 V0 L26 -8 L30 -2 V20', 'l') + P('M-40 24 H44', 'l') + P('M36 22 L42 16 L46 22Z') + P('M8 22 L12 16 L18 22Z'),
  sea: () => waves(0, -50) + waves(12, -50) + waves(24, -50) + P('M-20 -8 H40 M-20 -2 H40', 'l') + P('M-40 30 H50', 'l')
};

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
const short = (name, n = 14) => (name.length > n ? `${name.slice(0, n - 1)}…` : name);
const ell = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"`;

// --- terrain ------------------------------------------------------------------------------------
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const segDist = (px, py, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); };
const ellDist = (x, y, r) => Math.abs(Math.hypot(x, y / SQ) - r);
const TREES = {
  pine: (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-1.5" y="-1" width="3" height="6" class="trunk"/><path d="M0 -26 L-8 -12 H8Z M0 -18 L-10 -4 H10Z M0 -10 L-12 4 H12Z" class="pine"/></g>`,
  oak: (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-2" y="-4" width="4" height="9" class="trunk"/><circle cx="0" cy="-12" r="10" class="oak"/><circle cx="-6" cy="-8" r="6" class="oak2"/><circle cx="6" cy="-9" r="6" class="oak2"/></g>`,
  bush: (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="-4" cy="-3" r="5" class="oak2"/><circle cx="4" cy="-3" r="5" class="oak2"/><circle cx="0" cy="-6" r="5" class="oak"/></g>`,
  rock: (x, y, s) => `<path transform="translate(${x} ${y}) scale(${s})" d="M-7 2 L-4 -5 L3 -6 L8 2Z" class="rock"/>`,
  tuft: (x, y) => `<path d="M${x - 4} ${y} l1.5 -6 l1.5 6 m1 0 l2 -8 l1.5 8 m1 0 l2 -5 l1 5" class="tuft"/>`,
  flower: (x, y, c) => `<circle cx="${x}" cy="${y}" r="1.8" class="flower f${c}"/>`
};
let terrainCache = { key: '', html: '' };
function terrainMarkup(layout) {
  const { view, nodes, plots, rings, spokes, landmarks, perim, riverR } = layout;
  const key = JSON.stringify([view, [...nodes, ...plots].map(p => [p.x, p.y]), rings.length, spokes.length, landmarks.map(l => l.known), perim]);
  if (terrainCache.key === key) return terrainCache.html;
  const spots = [...nodes, ...plots];
  const out = [];
  const step = 44;
  for (let gx = Math.floor(view.x / step); gx * step < view.x + view.w; gx++) {
    for (let gy = Math.floor(view.y / step); gy * step < view.y + view.h; gy++) {
      const r1 = hash(gx, gy), r2 = hash(gy + 77, gx - 31), r3 = hash(gx * 3 + 5, gy * 7 + 9);
      const x = Math.round(gx * step + r1 * step), y = Math.round(gy * step + r2 * step);
      if (x < view.x + 20 || x > view.x + view.w - 20 || y < view.y + 20 || y > view.y + view.h - 20) continue;
      const polarR = Math.hypot(x, y / SQ), ang = ((Math.atan2(y / SQ, x) * 180) / Math.PI + 360) % 360;
      const rv = riverAt(ang, riverR);
      if (Math.abs(polarR - rv) < 38) continue;                                  // river
      if (spots.some(p => Math.abs(x - p.x) < 58 && y > p.y - 62 && y < p.y + 58)) continue; // plots
      if (rings.some(r => ellDist(x, y, r.r) < 22) || ellDist(x, y, perim) < 22) continue;     // ring roads
      if (spokes.some(sp => { const a = polar(sp.angle, sp.from), b = polar(sp.angle, sp.to); return segDist(x, y, a.x, a.y, b.x, b.y) < 20; })) continue;
      if (landmarks.some(l => Math.hypot(x - l.x, y - l.y) < 95 || (l.known && segDist(x, y, l.from.x, l.from.y, l.to.x, l.to.y) < 22))) continue;
      if (polarR < 70) continue;
      const beyond = polarR > rv;                                                  // wild country outside the river
      const dense = beyond ? 0.78 : polarR > perim - 20 ? 0.42 : 0.14;
      if (r3 < dense) {
        const kind = beyond ? (r1 < 0.55 ? 'pine' : r1 < 0.85 ? 'oak' : 'bush') : (r2 < 0.4 ? 'oak' : r2 < 0.75 ? 'bush' : 'pine');
        out.push([y, TREES[kind](x, y, 0.8 + r2 * 0.55)]);
      } else if (r3 < dense + 0.04) out.push([y, TREES.rock(x, y, 0.9 + r1 * 0.5)]);
      else if (r3 < dense + 0.5) out.push([y - 100000, TREES.tuft(x, y)]);
      else if (r3 < dense + 0.56) out.push([y - 100000, TREES.flower(x, y, Math.floor(r1 * 3))]);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  terrainCache = { key, html: out.map(o => o[1]).join('') };
  return terrainCache.html;
}

function riverMarkup(layout) {
  const pts = [];
  for (let d = 0; d <= 360; d += 3) { const r = riverAt(d, layout.riverR); const p = polar(d, r); pts.push(`${pts.length ? 'L' : 'M'}${p.x} ${p.y}`); }
  const d = pts.join(' ') + 'Z';
  return `<path d="${d}" class="river-bank"/><path d="${d}" class="river"/><path d="${d}" class="river-deep"/><path d="${d}" class="river-spark"/>`;
}

function bridgeMarkup(l) {
  const planks = Array.from({ length: 11 }, (_, i) => `<path d="M${-30 + i * 6} -11 V11" class="plank"/>`).join('');
  return `<g transform="translate(${l.bridge.x} ${l.bridge.y}) rotate(${l.bridge.rot})"><rect x="-34" y="-12" width="68" height="24" class="bridge"/>${planks}<path d="M-34 -12 H34 M-34 12 H34" class="rail"/><rect x="-36" y="-14" width="5" height="5" class="post"/><rect x="31" y="-14" width="5" height="5" class="post"/><rect x="-36" y="9" width="5" height="5" class="post"/><rect x="31" y="9" width="5" height="5" class="post"/></g>`;
}

function roadMarkup(layout) {
  const out = [];
  const road = d => `<path d="${d}" class="road-bed"/><path d="${d}" class="road-line"/>`;
  layout.spokes.forEach(s => {
    const a = polar(s.angle, s.from), b = polar(s.angle, s.to), c = polar(s.angle, Math.max(s.from, s.solidTo));
    out.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="road-planned"/>`);
    out.push(road(`M${a.x} ${a.y} L${c.x} ${c.y}`));
  });
  layout.rings.forEach(r => {
    if (r.planned) out.push(`${ell(0, 0, r.r, r.r * SQ)} class="road-planned"/>`);
    else out.push(`${ell(0, 0, r.r, r.r * SQ)} class="road-bed"/>${ell(0, 0, r.r, r.r * SQ)} class="road-line"/>`);
  });
  out.push(`${ell(0, 0, layout.perim, layout.perim * SQ)} class="road-bed"/>${ell(0, 0, layout.perim, layout.perim * SQ)} class="road-line"/>`);
  layout.landmarks.filter(l => l.known).forEach(l => out.push(road(`M${l.from.x} ${l.from.y} L${l.to.x} ${l.to.y}`)));
  return out.join('');
}

function landmarkMarkup(l) {
  if (!l.known) return `<g class="landmark unknown" transform="translate(${l.x} ${l.y})"><circle r="30" class="fog-ring"/><text y="9" class="fog-q">?</text></g>`;
  return `<g class="landmark" transform="translate(${l.x} ${l.y})"><g transform="scale(1.15)" class="glyph">${LANDMARK_GLYPH[l.id]()}</g><text y="52" class="map-name">${esc(l.name)}</text></g>`;
}

export function renderSettlementSvg(layout, { selected = null, night = false, day = 1, zoom = null } = {}) {
  const { view, nodes, plots, landmarks, wall } = layout;
  const plot = n => {
    const color = DISTRICTS[n.district].color;
    const isSel = selected === n.key;
    const scale = n.ghost ? 0.95 : 0.9 + 0.04 * n.level;
    const glyph = (GLYPHS[n.id] || FALLBACK)();
    const hit = `<rect x="${-FOOT.w / 2}" y="-52" width="${FOOT.w}" height="${FOOT.h}" class="hit"/>`;
    const pad = `${ell(0, 14, 40, 13)} class="pad" style="--c:${color}"/>`;
    if (n.ghost) {
      return `<g class="map-node ghost ${n.affordable ? 'ready' : ''} ${isSel ? 'selected' : ''}" transform="translate(${n.x} ${n.y})" data-mapnode="${esc(n.key)}" tabindex="0"><title>${esc(n.name)}: not built${n.affordable ? ' (you can afford it)' : ''}</title>${hit}${pad}
        <g class="glyph" transform="scale(${scale})">${glyph}</g>
        <text y="34" class="map-name">${esc(short(n.name))}</text><text y="47" class="map-sub">${n.affordable ? '+ build here' : 'empty plot'}</text></g>`;
    }
    const pips = Array.from({ length: 10 }, (_, i) => `<rect x="${-26 + i * 5.4}" y="51" width="4" height="2.4" class="${i < n.level ? 'on' : ''}" style="--c:${color}"/>`).join('');
    return `<g class="map-node ${n.id === 'campfire' ? 'hearth' : ''} ${isSel ? 'selected' : ''}" transform="translate(${n.x} ${n.y})" data-mapnode="${esc(n.key)}" tabindex="0"><title>${esc(n.name)}, level ${n.level}</title>${hit}${pad}
      ${n.id === 'campfire' ? '<circle r="72" class="fire-glow"/>' : ''}
      <g class="glyph" transform="scale(${scale})">${glyph}</g>
      <text y="34" class="map-name">${esc(short(n.name))}</text><text y="46" class="map-sub">Lv ${n.level}${n.cap ? ` · ${n.cap.toLocaleString()}` : ''}</text>${pips}</g>`;
  };
  const wallMarkup = wall ? `<g class="estate-wall">${ell(0, 0, wall.rx, wall.ry)} class="wall"/>${[0, 60, 120, 180, 240, 300].map(a => { const p = polar(a, wall.rx); return `<rect x="${p.x - 9}" y="${p.y - 9}" width="18" height="18" class="tower"/>`; }).join('')}<text y="${-Math.round(wall.ry) - 12}" class="map-sub">Estate wall</text></g>` : '';
  const left = view.x + 24, top = view.y + 30;
  const bw = 214, bh = 54, bx = view.x + view.w - bw - 18, by = view.y + view.h - bh - 16;
  const furniture = `
    <g class="compass" transform="translate(${left + 26} ${top + 30})"><circle r="22" class="cring"/><path d="M0 -26 L6 0 L0 -5 L-6 0Z" class="cn"/><path d="M0 26 L6 0 L0 5 L-6 0Z" class="cs"/><text y="-32" class="map-sub">N</text></g>
    <g class="titleblock"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" class="tb"/><text x="${bx + 12}" y="${by + 22}" class="tb-title">EMBERFALL</text><text x="${bx + 12}" y="${by + 41}" class="map-sub left">Day ${day} · ${nodes.length} buildings</text></g>`;
  const width = zoom ? `${Math.round(view.w * zoom)}px` : `max(100%, ${Math.round(view.w * 0.62)}px)`;
  return `<svg class="settlement-svg ${night ? 'is-night' : ''}" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" style="width:${width}" role="img" aria-label="Map of the settlement">
    <defs><radialGradient id="meadow" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="#2b4a27"/><stop offset="100%" stop-color="#18301d"/></radialGradient>
      <radialGradient id="fog" cx="50%" cy="50%" r="74%"><stop offset="58%" stop-color="#060d08" stop-opacity="0"/><stop offset="100%" stop-color="#060d08" stop-opacity=".8"/></radialGradient></defs>
    <rect x="${view.x}" y="${view.y}" width="${view.w}" height="${view.h}" fill="url(#meadow)"/>
    ${riverMarkup(layout)}${wallMarkup}<g>${roadMarkup(layout)}</g>${landmarks.filter(l => l.known).map(bridgeMarkup).join('')}
    <g class="terrain">${terrainMarkup(layout)}</g><g>${landmarks.map(landmarkMarkup).join('')}</g>
    <g>${[...plots, ...nodes].sort((a, b) => a.y - b.y).map(plot).join('')}</g>
    ${furniture}
    <rect x="${view.x}" y="${view.y}" width="${view.w}" height="${view.h}" fill="url(#fog)" pointer-events="none"/>
    ${night ? `<rect x="${view.x}" y="${view.y}" width="${view.w}" height="${view.h}" class="map-night" pointer-events="none"/>` : ''}</svg>`;
}
