// Run with: node tests/run.mjs   (no dependencies)
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); }
};

const { Game, createNewState, SAVE_KEY } = await import('../js/state.js');
const { BUILDINGS, BUILDING_BY_ID, HOUSING_TABLE, STORAGE_TABLE } = await import('../js/buildings.js').then(m => ({ ...m, BUILDINGS: m.BUILDINGS, BUILDING_BY_ID: m.BUILDING_BY_ID }));
const { TABS } = await import('../js/unlocks.js');
const { DAY_SECONDS, HOUR_SECONDS, isDaytime, dayNumber } = await import('../js/time.js');

let passed = 0;
const failures = [];
function test(name, fn) {
  try { store.clear(); fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push(name); console.log(`  FAIL ${name}\n       ${e.message}`); }
}
const fresh = () => new Game({ autoLoad: false });
const give = (g, r) => { for (const [k, v] of Object.entries(r)) { g.state.resources[k] = v; g.state.lifetime[k] = Math.max(g.state.lifetime[k] || 0, v); } g.checkUnlocks({ silent: true }); };
const visibleIds = g => g.visibleTabs(TABS).map(t => t.id);

console.log('Emberfall tests');

test('new game: no buildings, no villagers, no heroes, no pets', () => {
  const g = fresh();
  assert.equal(g.state.buildings.length, 0);
  assert.equal(g.state.villagers.length, 0);
  assert.equal(g.state.heroes.length, 0);
  assert.equal(g.state.pets.length, 0);
  assert.equal(g.housing(), 0);
});
test('new game: wood, stone, food all zero', () => {
  const g = fresh();
  for (const id of ['wood', 'stone', 'food']) assert.equal(g.resource(id), 0);
  assert.equal(Object.values(g.state.resources).reduce((a, b) => a + b, 0), 0);
});
test('new game: only Chop Trees is available, no tabs, only 3 resources revealed', () => {
  const g = fresh();
  assert.deepEqual(g.actionsFor('Camp'), ['chopTrees']);
  for (const t of ['Forest', 'Mine', 'Cave']) assert.deepEqual(g.actionsFor(t), []);
  assert.deepEqual(visibleIds(g), []);
  assert.deepEqual(['wood', 'stone', 'food', 'gold', 'iron', 'crystal'].filter(id => g.isRevealed(id)), ['wood', 'stone', 'food']);
});
test('chopping trees gives wood and resources unlock progressively', () => {
  const g = fresh();
  g.doAction('chopTrees');
  assert.ok(g.resource('wood') >= 6);
  assert.equal(g.actionAvailable('gatherStones'), false);
  give(g, { wood: 20 });
  assert.equal(g.actionAvailable('gatherStones'), true);
  assert.equal(g.actionAvailable('forage'), false);
});
test('campfire needs 50 wood, deducts cost, unlocks camp tab and foraging', () => {
  const g = fresh();
  give(g, { wood: 49 });
  g.build('campfire');
  assert.equal(g.hasBuilding('campfire'), false);
  give(g, { wood: 60 });
  g.build('campfire');
  assert.equal(g.countBuilt('campfire'), 1);
  assert.equal(g.resource('wood'), 10);
  assert.ok(g.actionAvailable('forage'));
  assert.ok(visibleIds(g).includes('Camp'));
});
test('insufficient resources never build', () => {
  const g = fresh();
  give(g, { wood: 100, stone: 10 });
  g.state.unlocks.b_smallHouse = true;
  g.build('smallHouse');
  assert.equal(g.countBuilt('smallHouse'), 0);
  assert.equal(g.resource('wood'), 100);
});
test('traveller story fires at campfire + 30 food, welcome unlocks villagers', () => {
  const g = fresh();
  give(g, { wood: 200, food: 40 });
  g.build('campfire');
  g.checkUnlocks();
  assert.equal(g.state.pendingEvent?.kind, 'story_traveller');
  assert.equal(g.state.villagers.length, 0);
  g.resolveEvent('accept');
  assert.equal(g.state.villagers.length, 1);
  assert.ok(g.unlocked('villagerMgmt'));
  assert.ok(visibleIds(g).includes('Villagers'));
});
test('small hut costs 50 wood + 20 stone and adds housing 2', () => {
  const g = fresh();
  give(g, { wood: 300, stone: 100 });
  g.state.unlocks.b_smallHouse = true;
  g.build('smallHouse');
  assert.equal(g.resource('wood'), 250);
  assert.equal(g.resource('stone'), 80);
  assert.equal(g.housing(), 2);
  assert.ok(g.unlocked('housingMgmt'));
  assert.ok(visibleIds(g).includes('Village'));
});
test('upgrades follow housing table 2/4/6/8/12', () => {
  const g = fresh();
  give(g, { wood: 1e5, stone: 1e5 });
  g.state.storageBoost = 1;
  g.state.unlocks.b_smallHouse = true;
  g.build('smallHouse');
  const uid = g.state.buildings[0].uid;
  const seen = [g.capacityOf(g.state.buildings[0])];
  for (let i = 0; i < 4; i++) { give(g, { wood: 1e5, stone: 1e5 }); g.upgradeBuilding(uid); seen.push(g.capacityOf(g.state.buildings[0])); }
  assert.deepEqual(seen, [2, 4, 6, 8, 12]);
});
test('lumber yard adds 500 to wood only; other goods keep their own limits', () => {
  const g = fresh();
  assert.equal(g.capOf('wood'), 150);
  give(g, { wood: 100 });
  g.state.unlocks.b_lumberYard = true;
  g.build('lumberYard');
  assert.equal(g.capOf('wood'), 150 + 500);
  assert.equal(g.capOf('stone'), 150);
  assert.equal(g.capOf('coal'), 150);
});
test('gold, silver, gems and other special items are not stored: no limit', () => {
  const g = fresh();
  for (const id of ['gold', 'silver', 'gems', 'crystal', 'ancientCoins', 'torch', 'research', 'dragonScales']) assert.equal(g.capOf(id), Infinity, id);
  g.addResources({ gold: 1e6, gems: 5000 });
  assert.equal(g.resource('gold'), 1e6);
  assert.equal(g.state.overflow.gold || 0, 0);
});
test('each store class serves its own goods (granary: food/meat/seeds/herbs/water, ore depot: iron/steel)', () => {
  const g = fresh();
  g.state.buildings.push({ uid: 'g1', id: 'granary', level: 1 }, { uid: 'o1', id: 'oreDepot', level: 2 }, { uid: 'c1', id: 'coalStore', level: 1 });
  for (const id of ['food', 'meat', 'seeds', 'herbs', 'water']) assert.equal(g.capOf(id), 650, id);
  for (const id of ['iron', 'steel']) assert.equal(g.capOf(id), 1150, id);
  assert.equal(g.capOf('coal'), 650);
  assert.equal(g.capOf('wood'), 150);
});
test('warehouse adds room to every store class', () => {
  const g = fresh();
  g.state.buildings.push({ uid: 'w1', id: 'warehouse', level: 1 });
  assert.equal(g.capOf('wood'), 150 + 800);
  assert.equal(g.capOf('coal'), 150 + 800);
  assert.equal(g.capOf('gold'), Infinity);
});
test('multiple stores of one class stack', () => {
  const g = fresh();
  give(g, { wood: 1000 });
  g.state.unlocks.b_lumberYard = true;
  g.build('lumberYard'); g.build('lumberYard');
  assert.equal(g.capOf('wood'), 150 + 1000);
});
test('storage cap is respected and overflow is counted, not discarded silently', () => {
  const g = fresh();
  g.state.resources.wood = 140;
  g.addResources({ wood: 100 }, '', { passive: true });
  assert.equal(g.resource('wood'), 150);
  assert.ok(Math.abs(g.state.overflow.wood - 90) < .01);
});
test('ledger reports accepted 0 and overflow when full', () => {
  const g = fresh();
  give(g, { wood: 100, food: 100 });
  g.state.unlocks.b_smallHouse = true; g.state.unlocks.b_woodcutterHut = true;
  g.state.buildings.push({ uid: 'b1', id: 'woodcutterHut', level: 1 });
  g.state.resources.wood = g.capOf('wood');
  const l = g.ledger().wood;
  assert.ok(l.prod > 0);
  assert.equal(l.accepted, 0);
  assert.ok(Math.abs(l.overflow - l.net) < 1e-6);
  assert.equal(l.cap, 150);
  assert.ok(l.full);
});
test('villagers consume 2 food per day and food net shows negative', () => {
  const g = fresh();
  g.addVillager(); g.addVillager(); g.addVillager();
  const l = g.ledger().food;
  assert.ok(Math.abs(l.cons - 6) < 1e-6);
  assert.ok(l.net < 0);
});
test('food consumed over one full day equals 2 per villager', () => {
  const g = fresh();
  g.state.buildings.push({ uid: 'b1', id: 'lumberYard', level: 1 });
  g.addVillager(); g.addVillager();
  g.state.resources.food = 100;
  g.advance(DAY_SECONDS);
  assert.ok(Math.abs(g.resource('food') - 96) < .1, `food ${g.resource('food')}`);
});
test('starvation: hunger, lower happiness, slower work, then leaving, no death, no negatives', () => {
  const g = fresh();
  g.state.buildings.push({ uid: 'b1', id: 'smallHouse', level: 2 });
  g.addVillager(); g.addVillager(); g.addVillager();
  const before = g.happinessInfo().value;
  g.advance(60);
  assert.ok(g.state.hunger > 0);
  assert.ok(g.happinessInfo().value < before);
  g.advance(3 * 3600);
  assert.ok(g.state.villagers.length < 3);
  assert.ok(g.state.villagers.length >= 1, 'not everyone leaves');
  for (const v of Object.values(g.state.resources)) assert.ok(v >= 0);
});
test('hunger recovers when food returns', () => {
  const g = fresh();
  g.addVillager();
  g.advance(100);
  assert.ok(g.state.hunger > 0);
  g.state.resources.food = 100;
  g.advance(400);
  assert.equal(g.state.hunger, 0);
});
test('day/night: 20 min day, 14 min daylight, 6 min night', () => {
  assert.equal(DAY_SECONDS, 1200);
  let day = 0;
  for (let s = 0; s < DAY_SECONDS; s++) if (isDaytime(s)) day++;
  assert.ok(Math.abs(day - 840) <= 1, `daylight seconds ${day}`);
  assert.equal(dayNumber(DAY_SECONDS * 2 + 5), 3);
});
test('clock advances with game time', () => {
  const g = fresh();
  const c = g.state.clock;
  g.advance(100);
  assert.ok(Math.abs(g.state.clock - c - 100) < 1e-6);
});
test('production respects working hours', () => {
  const g = fresh();
  g.state.buildings.push({ uid: 'b1', id: 'woodcutterHut', level: 1 }, { uid: 'b2', id: 'lumberYard', level: 3 });
  g.state.unlocks.professions = true;
  const v = g.addVillager(); g.addVillager(); g.addVillager();
  g.assignVillager(v.id, 'woodcutter');
  const night = g.ratesAt(2).prod.wood || 0;
  const day = g.ratesAt(10).prod.wood || 0;
  assert.equal(night, 0);
  assert.ok(day > 0);
  const lunchOver = g.ratesAt(18).prod.wood || 0;
  assert.equal(lunchOver, 0);
});
test('guards may work the night shift; others cannot', () => {
  const g = fresh();
  g.state.buildings.push({ uid: 'b1', id: 'barracks', level: 1 });
  const v = g.addVillager();
  g.state.unlocks.professions = true;
  assert.ok(!g.availableSchedules(v).includes('night'));
  g.assignVillager(v.id, 'guard');
  assert.ok(g.availableSchedules(v).includes('night'));
});
test('manual assignment (auto-hire off) needs a free seat', () => {
  const g = fresh();
  g.state.unlocks.professions = true;
  g.state.autoHire = false;
  const v = g.addVillager();
  assert.equal(v.profession, 'idle');
  g.assignVillager(v.id, 'farmer');
  assert.equal(v.profession, 'idle');
  g.state.buildings.push({ uid: 'b1', id: 'farm', level: 1 });
  g.assignVillager(v.id, 'farmer');
  assert.equal(v.profession, 'farmer');
  const w = g.addVillager();
  g.addVillager();
  g.assignVillager(w.id, 'farmer');
  assert.equal(w.profession, 'farmer');
  const x = g.addVillager();
  g.assignVillager(x.id, 'farmer');
  assert.equal(x.profession, 'idle', 'only 2 seats per level');
});
test('villagers require housing: no recruitment without a free bed', () => {
  const g = fresh();
  g.state.unlocks.villagerMgmt = true;
  g.state.flags.traveller = true;
  let seen = 0;
  const original = Math.random; Math.random = () => 0;
  try { for (let i = 0; i < 20; i++) g.tryRecruit(); seen = g.state.pendingEvent ? 1 : 0; } finally { Math.random = original; }
  assert.equal(seen, 0);
  g.state.buildings.push({ uid: 'b1', id: 'smallHouse', level: 1 });
  Math.random = () => 0;
  try { g.tryRecruit(); } finally { Math.random = original; }
  assert.equal(g.state.pendingEvent?.kind, 'traveller');
});
test('recruitment chance: base 25, never above 40', () => {
  const g = fresh();
  g.state.buildings.push({ uid: 'b1', id: 'smallHouse', level: 1 });
  g.addVillager();
  g.state.buildings.push({ uid: 'b2', id: 'well', level: 1 });
  const base = g.recruitChance(70);
  assert.equal(base, 25);
  for (let i = 0; i < 12; i++) g.state.buildings.push({ uid: `x${i}`, id: 'smallHouse', level: 1 });
  g.state.buildings.push({ uid: 't', id: 'tavern', level: 3 });
  assert.equal(g.recruitChance(95), 40);
});
test('unlock chain: wood -> forest, quarry+stone -> old mine -> iron, workshop -> crafting, library -> research, barracks -> heroes', () => {
  const g = fresh();
  assert.ok(!g.unlocked('forest'));
  give(g, { wood: 400 });
  g.state.buildings.push({ uid: 'b1', id: 'campfire', level: 1 });
  g.checkUnlocks({ silent: true });
  assert.ok(g.unlocked('forest'));
  assert.ok(!visibleIds(g).includes('Mine'));
  g.state.buildings.push({ uid: 'b2', id: 'quarry', level: 1 });
  give(g, { stone: 150 });
  assert.ok(g.unlocked('oldMine'));
  assert.ok(visibleIds(g).includes('Mine'));
  give(g, { iron: 12 });
  assert.ok(g.unlocked('coal'));
  assert.ok(!visibleIds(g).includes('Crafting'));
  g.state.buildings.push({ uid: 'b3', id: 'workshop', level: 1 });
  g.checkUnlocks({ silent: true });
  assert.ok(visibleIds(g).includes('Crafting'));
  assert.ok(!visibleIds(g).includes('Research') && !visibleIds(g).includes('Heroes'));
  g.state.buildings.push({ uid: 'b4', id: 'library', level: 1 }, { uid: 'b5', id: 'barracks', level: 1 });
  g.checkUnlocks({ silent: true });
  assert.ok(visibleIds(g).includes('Research'));
  assert.ok(visibleIds(g).includes('Heroes'));
});
test('locked tabs stay hidden: pets, dungeon, estate, map, quests, achievements, events', () => {
  const g = fresh();
  give(g, { wood: 30 });
  for (const t of ['Pets', 'Dungeon', 'Estate', 'Map', 'Quests', 'Achievements', 'Events', 'Heroes', 'Research', 'Crafting']) assert.ok(!visibleIds(g).includes(t), t);
});
test('pets unlock through animal tracks; relics through ruins', () => {
  const g = fresh();
  give(g, { wood: 400 });
  g.state.buildings.push({ uid: 'b1', id: 'campfire', level: 1 });
  g.state.tracking.peakVillagers = 3;
  g.checkUnlocks({ silent: true });
  assert.ok(g.actionAvailable('trackAnimals'));
  for (let i = 0; i < 8; i++) { g.state.actionCooldowns = {}; g.doAction('trackAnimals'); }
  assert.ok(g.unlocked('animalTracks'));
  assert.ok(visibleIds(g).includes('Pets'));
  assert.equal(g.findRelic(), false === g.unlocked('ancientRuins') ? false : true);
});
test('findRelic refuses until ancient ruins are unlocked', () => {
  const g = fresh();
  assert.equal(g.findRelic(), false);
  g.state.unlocks.ancientRuins = true;
  assert.equal(g.findRelic(), true);
});
test('at least 40 buildings exist with cost, description, requirements; 10 levels', () => {
  assert.ok(BUILDINGS.length >= 40, `${BUILDINGS.length} buildings`);
  for (const b of BUILDINGS) { assert.ok(Object.keys(b.cost).length, b.id); assert.ok(b.description); assert.ok(Array.isArray(b.requires)); }
  const costs = { smallHouse: { wood: 50, stone: 20 }, lumberYard: { wood: 40 }, woodcutterHut: { wood: 60, stone: 20 }, farm: { wood: 50, stone: 30 }, quarry: { wood: 80, stone: 40 }, hunterLodge: { wood: 70, stone: 30 }, well: { stone: 50 }, workshop: { wood: 100, stone: 50 }, tavern: { wood: 120, stone: 60 }, blacksmith: { wood: 100, stone: 100, iron: 30 }, barracks: { wood: 150, stone: 100 }, library: { wood: 150, stone: 100 }, stable: { wood: 200, stone: 100 }, mageTower: { stone: 200, crystal: 50 }, castle: { wood: 500, stone: 500, iron: 100 }, campfire: { wood: 50 } };
  for (const [id, c] of Object.entries(costs)) assert.deepEqual(BUILDING_BY_ID[id].cost, c, id);
});
test('a building whose cost exceeds storage is flagged', () => {
  const g = fresh();
  assert.ok(g.costExceedsStorage({ wood: 500 }));
  assert.ok(!g.costExceedsStorage({ wood: 50 }));
});
test('offline: respects 8h cap, storage, housing, and never goes negative', () => {
  const g = fresh();
  g.state.buildings.push({ uid: 'b1', id: 'smallHouse', level: 1 }, { uid: 'b2', id: 'lumberYard', level: 1 }, { uid: 'b3', id: 'woodcutterHut', level: 1 }, { uid: 'b4', id: 'farm', level: 1 });
  g.state.unlocks.villagerMgmt = true; g.state.unlocks.professions = true; g.state.flags.traveller = true;
  g.addVillager(); g.addVillager();
  g.state.villagers.forEach((v, i) => { v.profession = i ? 'farmer' : 'woodcutter'; });
  g.state.resources.food = 50;
  const report = g.runOffline(30 * 3600);
  assert.equal(report.capped, true);
  assert.equal(report.minutes, 480);
  for (const [id, v] of Object.entries(g.state.resources)) { assert.ok(v >= 0, id); assert.ok(v <= g.capOf(id) + .01, `${id} ${v} > ${g.capOf(id)}`); }
  assert.ok(g.state.villagers.length <= g.housing());
  assert.ok(report.wasted.wood > 0 || report.wasted.food > 0, 'overflow reported');
});
test('offline: no resources from nowhere without producers', () => {
  const g = fresh();
  g.runOffline(8 * 3600);
  for (const v of Object.values(g.state.resources)) assert.equal(v, 0);
});
test('offline: recruitment capped by housing', () => {
  const g = fresh();
  g.state.buildings.push({ uid: 'b1', id: 'smallHouse', level: 1 }, { uid: 'b2', id: 'lumberYard', level: 1 });
  g.state.unlocks.villagerMgmt = true;
  g.state.resources.food = 500;
  const orig = Math.random; Math.random = () => 0;
  try { g.runOffline(8 * 3600); } finally { Math.random = orig; }
  assert.ok(g.state.villagers.length <= 2);
});
test('save and load preserve progression', () => {
  const g = fresh();
  give(g, { wood: 100 });
  g.state.unlocks.b_lumberYard = true;
  g.build('lumberYard');
  g.addVillager();
  g.state.clock += 500;
  g.save();
  const h = new Game();
  assert.equal(h.countBuilt('lumberYard'), 1);
  assert.equal(h.state.villagers.length, 1);
  assert.ok(h.state.clock >= g.state.clock);
});
test('v1 save migrates: keeps buildings and villagers, grants nothing extra, no free village for new games', () => {
  const old = { version: 1, lastSaved: Date.now() - 1000, resources: { wood: 120, stone: 40, food: 80, gold: 100 }, buildings: { campfire: 2, smallHouse: 3, storage: 1 }, villagers: [{ id: 'v1', name: 'Alden', profession: 'farmer', personality: { name: 'Hardworking', bonus: 'production', value: .15 }, productivity: 1, happiness: 70, experience: 0, skill: 1 }], heroes: [], relics: [], pets: [], expeditions: [], logs: [] };
  store.set(SAVE_KEY, JSON.stringify(old));
  const g = new Game();
  assert.equal(g.state.version, 3);
  assert.equal(g.countBuilt('smallHouse'), 1);
  assert.equal(g.buildingLevel('smallHouse'), 3);
  assert.equal(g.state.villagers.length, 1);
  assert.equal(g.resource('wood') <= g.capOf('wood'), true);
  assert.equal(g.countBuilt('stoneyard'), 1);
  assert.equal(g.countBuilt('granary'), 1);
  assert.ok(g.unlocked('villagerMgmt') && g.unlocked('camp'));
  assert.ok(store.has('emberfall-save-v1-original'), 'original kept');
  const brand = new Game({ autoLoad: false });
  assert.equal(brand.state.buildings.length, 0);
});
test('corrupt save falls back to backup, then to a clean new game', () => {
  const g = fresh();
  give(g, { wood: 100 });
  g.state.unlocks.b_lumberYard = true; g.build('lumberYard');
  g.save(); g.save();
  store.set(SAVE_KEY, '{not json');
  const h = new Game();
  assert.equal(h.countBuilt('lumberYard'), 1);
  store.set(SAVE_KEY, '{not json'); store.set('emberfall-save-v1-backup', '"nope"');
  const k = new Game();
  assert.equal(k.state.buildings.length, 0);
});
test('import rejects invalid data and keeps the current game', () => {
  const g = fresh();
  give(g, { wood: 33 });
  assert.equal(g.importSave('garbage'), false);
  assert.equal(g.importSave('{"version":2}'), false);
  assert.equal(g.resource('wood'), 33);
  const ok = g.importSave(g.exportSave());
  assert.equal(ok, true);
});
test('reset returns to empty world', () => {
  const g = fresh();
  give(g, { wood: 500 });
  g.state.buildings.push({ uid: 'b1', id: 'campfire', level: 1 });
  g.reset();
  assert.equal(g.state.buildings.length, 0);
  assert.equal(g.resource('wood'), 0);
});
test('no duplicate timers: start() twice yields one interval', () => {
  const g = fresh();
  g.start(); const first = g.timer; g.start();
  assert.equal(g.timer, first);
  g.stop();
  assert.equal(g.timer, null);
});
test('no negative resources after heavy random play', () => {
  const g = fresh();
  give(g, { wood: 1000, stone: 1000, food: 300, iron: 100 });
  g.state.buildings.push({ uid: 'b1', id: 'lumberYard', level: 3 }, { uid: 'b2', id: 'smallHouse', level: 3 });
  for (let i = 0; i < 4; i++) g.addVillager();
  g.advance(5 * DAY_SECONDS);
  for (const [id, v] of Object.entries(g.state.resources)) { assert.ok(v >= 0 && Number.isFinite(v), id); }
});
test('resources only come from sources: lifetime >= stock', () => {
  const g = fresh();
  g.state.buildings.push({ uid: 'b1', id: 'woodcutterHut', level: 2 }, { uid: 'b2', id: 'lumberYard', level: 1 });
  g.state.unlocks.professions = true;
  const v = g.addVillager(); g.assignVillager(v.id, 'woodcutter');
  g.state.resources.food = 100;
  g.advance(DAY_SECONDS);
  assert.ok(g.state.lifetime.wood >= g.resource('wood') - .001);
  assert.ok(g.resource('wood') > 0);
});
test('combat/dungeon/expedition work without crashing', () => {
  const g = fresh();
  g.state.unlocks = { ...g.state.unlocks, heroes: true, map: true, dungeonTab: true };
  g.state.buildings.push({ uid: 'b1', id: 'lumberYard', level: 5 }, { uid: 'b2', id: 'dungeonEntrance', level: 1 }, { uid: 'b3', id: 'barracks', level: 1 });
  give(g, { gold: 500, food: 300, torch: 20 });
  g.recruitHero();
  assert.equal(g.state.heroes.length, 1);
  g.state.tracking.peakVillagers = 3; g.state.buildings.push({ uid: 'b9', id: 'stable', level: 1 });
  g.startExpedition('greenForest');
  assert.equal(g.state.expeditions.length, 1);
  g.advance(15 * 60);
  assert.equal(g.state.expeditions.length, 0);
  g.startDungeon();
  for (let i = 0; i < 6; i++) g.dungeonStep('continue');
  assert.ok(g.state.tracking.actions > 0);
});

test('auto-hire: idle villagers take free seats by themselves and unemployed are counted', () => {
  const g = fresh();
  g.state.unlocks.villagerMgmt = true;
  g.state.buildings.push({ uid: 'b1', id: 'farm', level: 1 }, { uid: 'b2', id: 'woodcutterHut', level: 1 });
  for (let i = 0; i < 6; i++) g.addVillager();
  g.checkUnlocks({ silent: true });
  const st = g.getStats();
  assert.equal(st.employed, 4, 'two seats per building level, two buildings');
  assert.equal(st.unemployed, 2);
  assert.equal(g.countJob('farmer'), 2);
  assert.equal(g.countJob('woodcutter'), 2);
  g.state.buildings.push({ uid: 'b3', id: 'quarry', level: 1 });
  g.checkUnlocks({ silent: true });
  assert.equal(g.getStats().unemployed, 0, 'a new workplace is staffed automatically');
});
test('auto-hire heads for food first when food is low', () => {
  const g = fresh();
  g.state.unlocks.villagerMgmt = true;
  g.state.buildings.push({ uid: 'b1', id: 'farm', level: 1 }, { uid: 'b2', id: 'woodcutterHut', level: 1 });
  g.addVillager(); g.addVillager();
  g.state.resources.food = 0;
  g.checkUnlocks({ silent: true });
  assert.equal(g.countJob('farmer'), 2);
});
test('auto-hire can be switched off and nobody is hired', () => {
  const g = fresh();
  g.state.unlocks.villagerMgmt = true;
  g.state.buildings.push({ uid: 'b1', id: 'farm', level: 1 });
  g.setAutoHire(false);
  g.addVillager();
  g.checkUnlocks({ silent: true });
  assert.equal(g.getStats().unemployed, 1);
});
test('families form automatically only when happy, fed and housed', () => {
  const g = fresh();
  g.state.unlocks.villagerMgmt = true;
  g.state.buildings.push({ uid: 'b1', id: 'smallHouse', level: 5 }, { uid: 'w', id: 'well', level: 1 });
  g.addVillager(); g.addVillager();
  g.state.resources.food = 0;
  const rnd = Math.random; Math.random = () => 0;
  try {
    g.familyTick();
    assert.equal(g.state.families.length, 0, 'hungry settlements do not start families');
    g.state.resources.food = 100;
    g.familyTick();
    assert.equal(g.state.families.length, 1);
    g.familyTick();
    assert.equal(g.state.families[0].kids.length, 1, 'a child is born');
    g.state.buildings = g.state.buildings.filter(b => b.id !== 'smallHouse');
    g.state.buildings.push({ uid: 'b9', id: 'smallHouse', level: 1 });
    g.familyTick();
    assert.equal(g.state.families[0].kids.length, 1, 'no room means no second child');
  } finally { Math.random = rnd; }
});
test('children grow into villagers after a day, only when a bed is free', () => {
  const g = fresh();
  g.state.unlocks.villagerMgmt = true;
  g.state.buildings.push({ uid: 'b1', id: 'smallHouse', level: 1 });
  g.addVillager(); g.addVillager();
  g.state.families.push({ id: 'f1', members: [g.state.villagers[0].id, g.state.villagers[1].id], kids: [g.state.clock] });
  g.advance(DAY_SECONDS + 10);
  assert.equal(g.state.villagers.length, 2, 'housing full: child waits');
  g.state.buildings.push({ uid: 'b2', id: 'smallHouse', level: 1 });
  g.advance(60);
  assert.equal(g.state.villagers.length, 3);
  assert.equal(g.state.families[0].kids.length, 0);
});
test('v2 save with generic Storage migrates to Lumber Yard + Stoneyard + Granary', () => {
  const old = { version: 2, lastSaved: Date.now() - 1000, resources: { wood: 100, food: 20 }, buildings: [{ uid: 'b1', id: 'campfire', level: 1 }, { uid: 'b2', id: 'storage', level: 2 }], villagers: [], families: [{ id: 'f1', members: [], children: 2 }] };
  store.set(SAVE_KEY, JSON.stringify(old));
  const g = new Game();
  assert.equal(g.state.version, 3);
  assert.equal(g.countBuilt('lumberYard'), 1);
  assert.equal(g.buildingLevel('granary'), 2);
  assert.equal(g.capOf('wood'), 150 + 1000);
  assert.ok(g.unlocked('ledger'));
  assert.equal(g.state.families[0].kids.length, 2);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log('Failed:\n - ' + failures.join('\n - ')); process.exit(1); }
