import { L, B, V, U, LV, T, D } from './unlocks.js';

// Capacity tables, indexed by level - 1 (levels 1..10).
export const HOUSING_TABLE = [2, 4, 6, 8, 12, 16, 20, 26, 32, 40];
export const STORAGE_TABLE = [500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000];
export const WAREHOUSE_TABLE = [800, 1600, 3200, 6400, 12800, 25600, 51200, 102400, 204800, 409600];
export const CASTLE_HOUSING_TABLE = [10, 14, 18, 22, 26, 30, 34, 40, 46, 52];
export const BASE_STORAGE = 150; // open-air stockpile per storage class before any store is built

// Bulk goods are kept in specialised stores. Anything not listed here (gold, silver, gems,
// crystal, ancient coins, torches, potions, research and other special items) is NOT stored
// in a building and has no limit.
export const STORAGE_CLASSES = {
  lumber: { name: 'Lumber Yard', items: ['wood'] },
  stone: { name: 'Stoneyard', items: ['stone'] },
  food: { name: 'Granary', items: ['food', 'meat', 'seeds', 'herbs', 'water'] },
  coal: { name: 'Coal Shed', items: ['coal'] },
  ore: { name: 'Ore Depot', items: ['iron', 'steel', 'sulfur'] },
  hides: { name: 'Hide Store', items: ['fur', 'leather', 'bones', 'silk'] }
};
export const CLASS_OF = {};
for (const [cls, info] of Object.entries(STORAGE_CLASSES)) for (const id of info.items) CLASS_OF[id] = cls;

// Professions --------------------------------------------------------------------------------
// production is per WORKING hour. `requires` lists buildings whose levels provide job slots
// (2 per building level). A profession with `requiresUnlock` instead needs that feature.
export const PROFESSIONS = [
  ['idle', 'Idle', 'Waits for a task.', {}, [], null],
  ['woodcutter', 'Woodcutter', 'Brings timber from the tree line.', { wood: 5 }, ['woodcutterHut'], null],
  ['miner', 'Miner', 'Works the shaft and the quarry face.', { stone: 2.5, iron: .4 }, ['quarry', 'mine'], null],
  ['farmer', 'Farmer', 'Tends crops beside the huts.', { food: 6, seeds: .2 }, ['farm', 'farmingEstate'], null],
  ['hunter', 'Hunter', 'Tracks game in the forest.', { food: 3, leather: .6, fur: .3 }, ['hunterLodge'], null],
  ['fisherman', 'Fisherman', 'Fishes the underground lake.', { food: 4, water: .6 }, ['fishermanHut'], null],
  ['blacksmith', 'Blacksmith', 'Works the forge. Produces steel.', { steel: .2 }, ['blacksmith'], null],
  ['herbalist', 'Herbalist', 'Gathers useful plants.', { herbs: 1.4, essence: .08 }, [], 'forest'],
  ['builder', 'Builder', 'Cuts construction costs by 2% each.', {}, ['workshop'], null],
  ['guard', 'Guard', 'Keeps watch. Can take the night shift.', {}, ['barracks', 'watchtower'], null],
  ['researcher', 'Researcher', 'Studies the old world.', { research: 1.2 }, ['library'], null],
  ['merchant', 'Merchant', 'Earns gold and improves sale prices.', { gold: .7 }, ['marketplace', 'tradingPost'], null],
  ['cook', 'Cook', 'Warm meals lift everyone\'s spirits.', {}, ['tavern'], null],
  ['alchemist', 'Alchemist', 'Extracts magical compounds.', { magicEssence: .25 }, ['alchemistLab'], null],
  ['explorer', 'Explorer', 'Improves expedition rewards by 4% each.', {}, [], 'map'],
  ['lumberjack', 'Lumberjack', 'Clears large stands of timber.', { wood: 8 }, ['sawmill'], null],
  ['furHunter', 'Fur Hunter', 'Brings pelts and meat.', { fur: 1.2, meat: 1.5 }, ['hunterLodge'], null],
  ['stoneMason', 'Stone Mason', 'Cuts useful stone.', { stone: 5 }, ['quarry'], null],
  ['trader', 'Trader', 'Finds better offers; earns silver.', { silver: .4 }, ['tradingPost'], null]
].map(([id, name, description, production, requires, requiresUnlock]) => ({ id, name, description, production, requires, requiresUnlock }));

export const PROFESSION_BY_ID = Object.fromEntries(PROFESSIONS.map(p => [p.id, p]));

// Buildings ----------------------------------------------------------------------------------
// effect:  modifiers per level (summed over all instances).
// passive: resources produced per hour per level; only while the work shift runs unless allDay.
// capKey/capTable: housing or storage capacity per level, per instance.
// max: how many separate instances may be constructed.
const def = (id, name, tier, cost, description, o = {}) => ({
  id, name, tier, cost, description,
  effect: o.effect || {}, passive: o.passive || {}, allDay: !!o.allDay,
  max: o.max || 1, capKey: o.capKey || null, capTable: o.capTable || null, capClass: o.capClass || null,
  requires: o.requires || []
});

export const BUILDINGS = [
  // Basic
  def('campfire', 'Campfire', 'Basic', { wood: 50 }, 'The first claim against the dark. Warmth lifts spirits.', { effect: { happiness: 2 }, requires: [L('wood', 50)] }),
  def('smallHouse', 'Small Hut', 'Basic', { wood: 50, stone: 20 }, 'Shelter for villagers. Capacity rises with each upgrade.', { capKey: 'housing', capTable: HOUSING_TABLE, max: 12, requires: [L('wood', 100), L('stone', 50)] }),
  // Stores (shown on the Stores tab)
  def('lumberYard', 'Lumber Yard', 'Storage', { wood: 40 }, 'Keeps cut timber dry. Raises how much wood you can hold.', { capKey: 'storage', capTable: STORAGE_TABLE, max: 3, capClass: 'lumber', requires: [L('wood', 80)] }),
  def('stoneyard', 'Stoneyard', 'Storage', { wood: 40, stone: 20 }, 'Racks and pits for quarried stone. Raises the stone limit.', { capKey: 'storage', capTable: STORAGE_TABLE, max: 3, capClass: 'stone', requires: [L('stone', 60)] }),
  def('granary', 'Granary', 'Storage', { wood: 50, stone: 10 }, 'Cool, dry bins for food, meat, seeds, herbs and water.', { capKey: 'storage', capTable: STORAGE_TABLE, max: 3, capClass: 'food', requires: [L('food', 50)] }),
  def('coalStore', 'Coal Shed', 'Storage', { wood: 60, stone: 30 }, 'A roofed shed so the coal stays dry and safe.', { capKey: 'storage', capTable: STORAGE_TABLE, max: 3, capClass: 'coal', requires: [U('coal')] }),
  def('oreDepot', 'Ore Depot', 'Storage', { wood: 60, stone: 40 }, 'Bins for iron, steel and sulfur.', { capKey: 'storage', capTable: STORAGE_TABLE, max: 3, capClass: 'ore', requires: [L('iron', 10)] }),
  def('hideStore', 'Hide Store', 'Storage', { wood: 50, stone: 20 }, 'Hooks and racks for fur, leather, bones and silk.', { capKey: 'storage', capTable: STORAGE_TABLE, max: 3, capClass: 'hides', requires: [L('fur', 5)] }),
  def('woodcutterHut', 'Woodcutter Hut', 'Basic', { wood: 60, stone: 20 }, 'Automates timber. Trickles wood by day and seats 2 woodcutters per level.', { passive: { wood: 1.5 }, max: 3, requires: [B('smallHouse'), L('wood', 150)] }),
  def('farm', 'Farm', 'Basic', { wood: 50, stone: 30 }, 'Automates food. Trickles food by day and seats 2 farmers per level.', { passive: { food: 1.5 }, max: 4, requires: [B('smallHouse'), L('food', 50)] }),
  def('quarry', 'Quarry', 'Basic', { wood: 80, stone: 40 }, 'Exposes workable stone. Seats 2 miners or masons per level.', { passive: { stone: 1 }, max: 3, requires: [B('woodcutterHut'), L('stone', 60)] }),
  def('hunterLodge', 'Hunter Lodge', 'Basic', { wood: 70, stone: 30 }, 'Supports hunting parties. Seats hunters and fur hunters.', { passive: { food: .8, leather: .15 }, max: 2, requires: [U('forest'), B('farm')] }),
  def('well', 'Well', 'Basic', { stone: 50 }, 'Fresh water, day and night. Keeps the settlement content.', { passive: { water: 2 }, allDay: true, effect: { happiness: 1 }, max: 2, requires: [L('stone', 50), B('smallHouse')] }),
  def('workshop', 'Workshop', 'Basic', { wood: 100, stone: 50 }, 'Benches and tools. Unlocks crafting and builders.', { effect: { craft: 1 }, requires: [B('quarry'), B('woodcutterHut')] }),
  def('tavern', 'Tavern', 'Basic', { wood: 120, stone: 60 }, 'A warm room for newcomers. Raises arrival chance and spirits.', { effect: { recruit: 5, happiness: 3 }, requires: [B('workshop'), V(3)] }),
  def('fishermanHut', 'Fisherman’s Hut', 'Basic', { wood: 35, stone: 10 }, 'Opens the lake fishery.', { passive: { food: 1, water: .5 }, requires: [B('well'), V(4)] }),
  // Advanced
  def('blacksmith', 'Blacksmith', 'Advanced', { wood: 100, stone: 100, iron: 30 }, 'Refines iron and arms defenders.', { effect: { combat: 2 }, passive: { steel: .15 }, requires: [B('workshop'), L('iron', 10)] }),
  def('barracks', 'Barracks', 'Advanced', { wood: 150, stone: 100 }, 'Guards and heroes train here.', { effect: { guard: 2, combat: 3 }, requires: [B('workshop'), V(5)] }),
  def('hospital', 'Hospital', 'Advanced', { wood: 75, stone: 45, herbs: 20 }, 'Heroes recover more quickly.', { effect: { recovery: 20, happiness: 2 }, requires: [B('barracks'), L('herbs', 20)] }),
  def('marketplace', 'Marketplace', 'Advanced', { wood: 90, stone: 40, gold: 30 }, 'Merchants visit more often.', { effect: { trade: 10 }, requires: [U('trading')] }),
  def('library', 'Library', 'Advanced', { wood: 150, stone: 100 }, 'Knowledge survives here. Researchers work here.', { passive: { research: .4 }, requires: [B('workshop'), V(6)] }),
  def('mageTower', 'Mage Tower', 'Advanced', { stone: 200, crystal: 50 }, 'An observatory for strange energies.', { effect: { magic: 1 }, passive: { magicEssence: .1 }, allDay: true, requires: [B('library'), L('crystal', 1)] }),
  def('watchtower', 'Watchtower', 'Advanced', { wood: 70, stone: 80 }, 'Warns of danger. Guards stand watch here.', { effect: { combat: 2, rare: 2, guard: 1 }, requires: [B('barracks')] }),
  def('stable', 'Stable', 'Advanced', { wood: 200, stone: 100 }, 'Care for swift mounts. Parties travel faster.', { effect: { travel: 10 }, requires: [B('barracks'), B('hunterLodge')] }),
  def('guildHall', 'Guild Hall', 'Advanced', { wood: 120, stone: 80, gold: 50 }, 'Experts share their craft. Unlocks the long-day schedule.', { effect: { production: 3 }, requires: [B('tavern'), LV(14)] }),
  def('trainingGrounds', 'Training Grounds', 'Advanced', { wood: 80, stone: 60, iron: 20 }, 'Heroes gain experience faster.', { effect: { heroXp: 15 }, requires: [B('barracks'), L('iron', 20)] }),
  def('alchemistLab', 'Alchemist Laboratory', 'Advanced', { wood: 100, stone: 50, herbs: 30, crystal: 5 }, 'Brews potions and extracts.', { effect: { alchemy: 1 }, passive: { magicEssence: .1 }, allDay: true, requires: [B('library'), L('crystal', 1), L('herbs', 20)] }),
  // Royal
  def('castle', 'Castle', 'Royal', { wood: 500, stone: 500, iron: 100 }, 'The settlement becomes a realm. Great halls for many.', { capKey: 'housing', capTable: CASTLE_HOUSING_TABLE, effect: { happiness: 5 }, requires: [LV(24), B('blacksmith')] }),
  def('treasury', 'Treasury', 'Royal', { wood: 140, stone: 100, gold: 100, steel: 15 }, 'Protects and compounds wealth.', { passive: { gold: .5 }, allDay: true, requires: [B('castle'), L('steel', 1)] }),
  // Estate
  def('bakery', 'Bakery', 'Estate', { wood: 70, stone: 35, food: 20 }, 'Makes food go farther.', { passive: { food: 2.5 }, effect: { happiness: 2 }, requires: [B('farm'), B('workshop')] }),
  def('sawmill', 'Sawmill', 'Estate', { wood: 100, stone: 45, iron: 10 }, 'Processes timber efficiently. Seats lumberjacks.', { passive: { wood: 4 }, requires: [B('woodcutterHut'), L('iron', 10)] }),
  def('mine', 'Mine', 'Estate', { wood: 120, stone: 100, iron: 20 }, 'Reaches deeper ore veins. Works around the clock.', { passive: { iron: 1.2, coal: .7 }, allDay: true, requires: [U('oldMine'), B('quarry'), LV(10)] }),
  def('jeweller', 'Jeweller', 'Estate', { wood: 80, stone: 40, gold: 50, gems: 3 }, 'Cuts gems for value.', { passive: { gems: .2, gold: .5 }, requires: [L('gems', 1), B('workshop')] }),
  def('temple', 'Temple', 'Estate', { wood: 100, stone: 120, gold: 50 }, 'Offers blessings to the faithful.', { effect: { blessing: 1, happiness: 4 }, requires: [U('ancientRuins'), B('library')] }),
  def('harbour', 'Harbour', 'Estate', { wood: 180, stone: 100, gold: 60 }, 'Water trade expands.', { effect: { trade: 15, travel: 10 }, requires: [B('well'), LV(20), U('trading')] }),
  def('animalSanctuary', 'Animal Sanctuary', 'Estate', { wood: 100, stone: 50, food: 100 }, 'Pets are kept safe and learn faster.', { effect: { petXp: 10 }, requires: [U('animalTracks')] }),
  def('monsterSanctuary', 'Monster Sanctuary', 'Estate', { wood: 150, stone: 120, iron: 30 }, 'Captured creatures can rest here.', { effect: { monster: 1 }, requires: [B('barracks'), T('wins', 3)] }),
  def('dungeonEntrance', 'Dungeon Entrance', 'Estate', { wood: 100, stone: 150, torch: 10 }, 'A sealed stairwell below.', { effect: { dungeon: 1 }, requires: [D(3)] }),
  def('warehouse', 'Warehouse', 'Storage', { wood: 140, stone: 80, iron: 15 }, 'A great hall that adds room to every store at once.', { capKey: 'storage', capTable: WAREHOUSE_TABLE, capClass: 'all', max: 3, requires: [B('lumberYard'), LV(10)] }),
  def('tradingPost', 'Trading Post', 'Estate', { wood: 110, stone: 50, gold: 50 }, 'Trade routes take shape. Seats traders.', { effect: { trade: 20 }, requires: [U('trading'), LV(10)] }),
  def('farmingEstate', 'Farming Estate', 'Estate', { wood: 130, stone: 50, seeds: 20 }, 'Fields stretch beyond the firelight.', { passive: { food: 6 }, requires: [B('farm'), LV(14), L('seeds', 1)] }),
  // Arcane
  def('academy', 'Academy', 'Arcane', { wood: 160, stone: 140, gold: 120, research: 20 }, 'Advanced studies flourish.', { effect: { research: 10 }, passive: { research: .6 }, allDay: true, requires: [B('library'), LV(30)] }),
  def('magicObservatory', 'Magic Observatory', 'Arcane', { stone: 180, crystal: 25, magicEssence: 15 }, 'Stars reveal hidden paths.', { effect: { explore: 10 }, requires: [B('mageTower'), L('magicEssence', 1)] }),
  def('dragonRoost', 'Dragon Roost', 'Arcane', { wood: 220, stone: 180, dragonScales: 5, gold: 150 }, 'A home for a draconic companion.', { effect: { dragon: 1, combat: 5 }, requires: [L('dragonScales', 1)] }),
  def('researchLab', 'Research Laboratory', 'Arcane', { wood: 150, stone: 120, crystal: 15, research: 30 }, 'Experiments accelerate discovery.', { effect: { research: 15 }, passive: { research: 1 }, allDay: true, requires: [B('academy')] })
];

export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));
export const VILLAGE_TIERS = ['Basic', 'Advanced'];

// Actions ------------------------------------------------------------------------------------
// tab: where the action is shown. requires: unlock conditions. hideWhen: a feature that
// retires a pure discovery action. bonus/bless: multiplier sources. track: counted statistic.
export const ACTIONS = {
  chopTrees: { name: 'Chop Trees', description: 'Fell a few trees at the edge of the dark.', rewards: { wood: 6 }, cooldown: 1, tab: 'Camp', requires: [], bonus: 'wood', bless: ['chopWood'] },
  gatherStones: { name: 'Gather Stones', description: 'Pry loose stones from the soil.', rewards: { stone: 4 }, cooldown: 1.5, tab: 'Camp', requires: [U('stones')], bonus: 'stone', bless: ['mineStone'] },
  forage: { name: 'Forage', description: 'Look for berries and roots near the fire.', rewards: { food: 4 }, cooldown: 2, tab: 'Camp', requires: [U('foraging')], bonus: 'food', bless: [] },

  chopForest: { name: 'Chop Wood', description: 'Fell proper timber in the forest.', rewards: { wood: 14 }, cooldown: 3, tab: 'Forest', requires: [U('forest')], bonus: 'wood', bless: ['chopWood'] },
  hunt: { name: 'Hunt', description: 'Follow tracks in the woods.', rewards: { food: 9, fur: 2, leather: 1 }, cooldown: 5, tab: 'Forest', requires: [U('forest')], bonus: 'hunt', bless: ['hunt'], combat: [0, 8, .25] },
  herbs: { name: 'Gather Herbs', description: 'Search the shaded undergrowth.', rewards: { herbs: 4, water: 1 }, cooldown: 4, tab: 'Forest', requires: [U('forest')], bonus: 'herbs', bless: [] },
  forestTreasure: { name: 'Search for Treasure', description: 'Look for a glint beneath the leaves.', rewards: { gold: 8 }, cooldown: 8, tab: 'Forest', requires: [U('forest'), V(2)], bonus: 'gold', bless: [], mapChance: .22 },
  trackAnimals: { name: 'Track Animals', description: 'Follow unfamiliar prints. See where they lead.', rewards: { food: 3 }, cooldown: 6, tab: 'Forest', requires: [U('forest'), V(3)], bonus: 'food', bless: [], track: 'tracks', hideWhen: 'animalTracks' },
  hiddenRuins: { name: 'Search for Ruins', description: 'Something regular lies beneath the moss.', rewards: { stone: 5 }, cooldown: 10, tab: 'Forest', requires: [U('forest'), U('oldMine'), V(3)], bonus: 'stone', bless: [], track: 'ruinsSearch', hideWhen: 'ancientRuins' },

  mineStone: { name: 'Mine Stone', description: 'Cut stone from the shaft wall.', rewards: { stone: 8 }, cooldown: 3, tab: 'Mine', requires: [U('oldMine')], bonus: 'mine', bless: ['mine', 'mineStone'] },
  mineIron: { name: 'Mine Iron', description: 'Follow an exposed red vein.', rewards: { iron: 4, stone: 2 }, cooldown: 5, tab: 'Mine', requires: [U('oldMine')], bonus: 'mine', bless: ['mine', 'mineIron'] },
  mineCoal: { name: 'Mine Coal', description: 'Bring back fuel from the black seam.', rewards: { coal: 5, stone: 2 }, cooldown: 5, tab: 'Mine', requires: [U('coal')], bonus: 'mine', bless: ['mine', 'mineCoal'] },

  caveExplore: { name: 'Explore the Cave', description: 'Push a little farther into the deep. Costs a torch.', rewards: { torch: -1, iron: 3, coal: 3, ancientDust: 1 }, cooldown: 10, tab: 'Cave', requires: [U('darkCave')], bonus: 'explore', bless: ['caveExplore'], combat: [0, 10, .22], relicChance: .18 }
};

// Groups used to keep the Village screen tidy.
export const BUILDING_GROUPS = [
  ['Housing & comfort', ['smallHouse', 'castle', 'well', 'tavern', 'hospital', 'temple']],
  ['Food & materials', ['woodcutterHut', 'farm', 'quarry', 'hunterLodge', 'fishermanHut', 'bakery', 'sawmill', 'mine', 'farmingEstate']],
  ['Workshops & trade', ['workshop', 'blacksmith', 'jeweller', 'marketplace', 'tradingPost', 'harbour', 'guildHall', 'treasury', 'alchemistLab']],
  ['Defence & heroes', ['barracks', 'watchtower', 'trainingGrounds', 'stable', 'monsterSanctuary', 'animalSanctuary', 'dungeonEntrance', 'dragonRoost']],
  ['Knowledge & magic', ['library', 'academy', 'researchLab', 'mageTower', 'magicObservatory']]
];
