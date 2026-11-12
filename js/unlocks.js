// Central unlock manager. Every feature, tab and building is gated by plain-data conditions
// so the UI never needs scattered "if (progress > x)" checks. The Game evaluates FEATURES
// each tick, stores the unlocked ids in state.unlocks and logs the notification once.

// Condition constructors -------------------------------------------------------------
export const L = (res, n) => ({ t: 'lifetime', res, n });     // lifetime amount gathered
export const B = (id, n = 1) => ({ t: 'built', id, n });      // n or more built instances of a building
export const V = n => ({ t: 'villagers', n });                // peak population reached
export const U = id => ({ t: 'unlock', id });                 // another feature is unlocked
export const F = id => ({ t: 'flag', id });                   // a story flag is set
export const LV = n => ({ t: 'levels', n });                  // total building levels
export const T = (key, n) => ({ t: 'track', key, n });        // a tracked statistic
export const D = n => ({ t: 'depth', n });                    // deepest cave depth
export const H = n => ({ t: 'heroes', n });                   // heroes recruited
export const ANY = (...of) => ({ t: 'any', of });             // any of several conditions
export const BUILDINGS_COUNT = n => ({ t: 'buildings', n });  // total buildings constructed

export function conditionMet(game, c) {
  const s = game.state;
  switch (c.t) {
    case 'lifetime': return (s.lifetime[c.res] || 0) >= c.n;
    case 'built': return game.countBuilt(c.id) >= c.n;
    case 'villagers': return (s.tracking.peakVillagers || 0) >= c.n;
    case 'unlock': return !!s.unlocks[c.id];
    case 'flag': return !!s.flags[c.id];
    case 'levels': return game.totalBuildingLevels() >= c.n;
    case 'track': return (s.tracking[c.key] || 0) >= c.n;
    case 'depth': return (s.caveDepth || 0) >= c.n;
    case 'heroes': return s.heroes.length >= c.n;
    case 'buildings': return s.buildings.length >= c.n;
    case 'any': return c.of.some(x => conditionMet(game, x));
    default: return false;
  }
}

export const allMet = (game, list) => list.every(c => conditionMet(game, c));

// Features -------------------------------------------------------------------------------
// `trigger` runs a scripted story event the first time the feature unlocks.
export const FEATURES = [
  { id: 'stones', requires: [L('wood', 20)], notify: 'Loose stones lie among the roots. You can gather stones.' },
  { id: 'camp', requires: [B('campfire')], notify: 'The fire holds. Survival actions are now within reach of its light.' },
  { id: 'foraging', requires: [B('campfire')], notify: 'In the firelight you spot berries and edible roots. You can forage for food.' },
  { id: 'villageTab', requires: [BUILDINGS_COUNT(1)], notify: 'Something stands where there was only dirt. The Village is taking shape.' },
  { id: 'travellerArrival', requires: [B('campfire'), L('food', 30)], trigger: 'traveller' },
  { id: 'villagerMgmt', requires: [F('traveller')], notify: 'Someone now shares your fire. You can look after your villagers.' },
  { id: 'housingMgmt', requires: [B('smallHouse')], notify: 'A roof of your own making. Housing can now be managed.' },
  { id: 'professions', requires: [V(3)], notify: 'With three pairs of hands, work can be assigned.' },
  { id: 'ledger', requires: [ANY(B('lumberYard'), B('stoneyard'), B('granary'), B('coalStore'), B('oreDepot'), B('hideStore'))], notify: 'With real stores built you can keep careful accounts of every resource. The Stores tab is open.' },
  { id: 'forest', requires: [B('campfire'), L('wood', 150)], notify: 'A game trail leads away from the fire, into the forest.' },
  { id: 'oldMine', requires: [B('quarry'), L('stone', 120)], notify: 'The quarry breaks into an old mine shaft. Something red glints inside. Iron!' },
  { id: 'coal', requires: [U('oldMine'), L('iron', 10)], notify: 'A black seam shows in the shaft wall. Coal burns hot.' },
  { id: 'darkCave', requires: [U('oldMine'), L('iron', 20)], notify: 'The shaft opens into a cave that breathes cold air. You will need torches.' },
  { id: 'villagerEvents', requires: [V(2)] },
  { id: 'merchantArrival', requires: [V(3)], trigger: 'merchant' },
  { id: 'trading', requires: [F('merchantMet')], notify: 'The merchant will return with new stock now and then. Trading is open.' },
  { id: 'animalTracks', requires: [T('tracks', 8), V(3)], notify: 'The tracks are clear now. Some of these animals might follow you home.' },
  { id: 'ancientRuins', requires: [U('oldMine'), T('ruinsSearch', 6), V(3)], notify: 'Under the moss: carved stone. Ancient ruins. Relics may be found here.' },
  { id: 'estate', requires: [ANY(LV(18), B('castle')), V(5)], notify: 'The settlement has outgrown the village. An Estate begins to form.' },
  { id: 'map', requires: [U('forest'), V(3), L('wood', 300)], notify: 'Scouts sketch the land beyond the trees. The Map is open.' },
  { id: 'crafting', requires: [B('workshop')], notify: 'Benches, tools, shavings. You can craft.' },
  { id: 'dungeonTab', requires: [B('dungeonEntrance')], notify: 'The stairwell is open. Something moves below.' },
  { id: 'research', requires: [B('library')], notify: 'Books, quiet, and a place to think. Research begins.' },
  { id: 'heroes', requires: [B('barracks')], notify: 'Fighters hear of a barracks. Heroes may now answer the call.' },
  { id: 'petsTab', requires: [ANY(U('animalTracks'), B('stable'), B('monsterSanctuary'))], notify: 'Creatures are drawn to the settlement.' },
  { id: 'quests', requires: [V(2)], notify: 'Small promises to keep. Quests are open.' },
  { id: 'achievements', requires: [T('actions', 15)], notify: 'The settlement starts keeping a record of its deeds.' },
  { id: 'eventsTab', requires: [T('events', 1)] },
  { id: 'worldBosses', requires: [LV(30), H(1), U('map')], notify: 'Rumours of titans reach the settlement. World bosses can be challenged on the Map.' },
  { id: 'prestige', requires: [LV(30)], notify: 'The old flame could be rekindled. A New Flame+ is possible from the Estate.' }
];

// Navigation tabs. A tab exists in the interface only once its feature is unlocked.
export const TABS = [
  { id: 'Camp', feature: 'camp' },
  { id: 'Village', feature: 'villageTab' },
  { id: 'Settlement', feature: 'villageTab' },
  { id: 'Villagers', feature: 'villagerMgmt' },
  { id: 'Stores', feature: 'ledger' },
  { id: 'Forest', feature: 'forest' },
  { id: 'Mine', feature: 'oldMine' },
  { id: 'Cave', feature: 'darkCave' },
  { id: 'Estate', feature: 'estate' },
  { id: 'Map', feature: 'map' },
  { id: 'Trade', feature: 'trading' },
  { id: 'Crafting', feature: 'crafting' },
  { id: 'Dungeon', feature: 'dungeonTab' },
  { id: 'Research', feature: 'research' },
  { id: 'Heroes', feature: 'heroes' },
  { id: 'Pets', feature: 'petsTab' },
  { id: 'Quests', feature: 'quests' },
  { id: 'Achievements', feature: 'achievements' },
  { id: 'Events', feature: 'eventsTab' }
];
