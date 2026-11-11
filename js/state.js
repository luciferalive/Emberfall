import {
  VERSION, RESOURCES, RESOURCE_BY_ID, PROFESSIONS, PROFESSION_BY_ID, PERSONALITIES, BUILDINGS, BUILDING_BY_ID,
  REGIONS, ENEMIES, BOSSES, RELICS, BLESSINGS, HERO_CLASSES, PETS, MOUNTS,
  RECIPES, RESEARCH, QUESTS, ACHIEVEMENTS, MERCHANT_ITEMS, SELL_VALUES, ACTIONS, NAMES, BASE_STORAGE, CLASS_OF
} from './data.js';
import { FEATURES, conditionMet, allMet } from './unlocks.js';
import { STORAGE_CLASSES } from './buildings.js';
import {
  DAY_SECONDS, HOUR_SECONDS, START_CLOCK, dayNumber, hourOfDay, isDaytime, seasonIndex, seasonName,
  formatClock, isWorking, SCHEDULES, SEASONS, activityAt
} from './time.js';

export const SAVE_KEY = 'emberfall-save-v1'; // key kept so existing players keep their progress
const BACKUP_KEY = 'emberfall-save-v1-backup';
const ORIGINAL_KEY = 'emberfall-save-v1-original';
export const MAX_OFFLINE_SECONDS = 8 * 3600;
const STEP_SECONDS = HOUR_SECONDS / 2; // simulation never crosses a half-hour boundary within a step
const FOOD_PER_VILLAGER_DAY = 2;
const HUNGER_LEAVE_AFTER = 900;   // seconds of continuous starvation before anyone may leave
const HUNGER_LEAVE_EVERY = 450;
// Jobs the auto-hire system may fill, in priority order, with how much of the workforce each deserves.
const AUTO_JOBS = [['farmer', 2], ['woodcutter', 2], ['miner', 1.5], ['stoneMason', 1], ['hunter', 1], ['fisherman', 1], ['researcher', 1.5], ['lumberjack', 1.5], ['blacksmith', 1], ['herbalist', 1], ['alchemist', .8], ['furHunter', .8], ['merchant', .6], ['trader', .6], ['guard', .6], ['cook', .5], ['builder', .5]];
const FOOD_JOBS = new Set(['farmer', 'fisherman', 'hunter']);
const FAMILY_CHECK_SECONDS = 300;   // every 5 real minutes the settlement may grow a family
const CHILD_GROWTH_SECONDS = DAY_SECONDS; // a child becomes a villager after one in-game day

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const rint = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = list => list[Math.floor(Math.random() * list.length)];
const number = n => Number((n || 0).toFixed(3));
const num = v => (Number.isFinite(v) ? v : 0);

// ------------------------------------------------------------------------------------------
// State
// ------------------------------------------------------------------------------------------
export function createNewState() {
  const now = Date.now();
  return {
    version: VERSION,
    lastSaved: now,
    lastTick: now,
    clock: START_CLOCK,
    resources: Object.fromEntries(RESOURCES.map(r => [r.id, 0])),
    lifetime: {},
    overflow: {},
    unlocks: {},
    flags: {},
    buildings: [],
    nextUid: 1,
    villagers: [],
    heroes: [],
    relics: [],
    blessings: {},
    pets: [],
    petLevels: {},
    mounts: [],
    monsters: [],
    equipment: [],
    research: Object.fromEntries(Object.keys(RESEARCH).map(k => [k, 0])),
    quests: {},
    claimedAchievements: [],
    tracking: { actions: 0, builds: 0, wins: 0, relics: 0, expedition: 0, gatherWood: 0, mineStone: 0, buildSmallHouse: 0, craftTorch: 0, tracks: 0, ruinsSearch: 0, events: 0, peakVillagers: 0 },
    logs: [{ at: now, text: 'Dawn is cold and grey. The nearest trees are within reach.' }],
    selectedTab: 'Main',
    selectedHero: null,
    expeditions: [],
    caveDepth: 0,
    dungeon: null,
    pendingEvent: null,
    nextRecruitment: START_CLOCK + 60,
    nextEvent: START_CLOCK + rint(180, 300),
    nextWeather: START_CLOCK + 300,
    merchantRefresh: START_CLOCK + 180,
    weather: 'Sunny',
    seasonSeen: 0,
    morale: 0,
    hunger: 0,
    hungerLeave: 0,
    hungerFlags: {},
    fullWarned: {},
    market: [],
    families: [],
    prestigeCount: 0,
    actionCooldowns: {},
    autoHire: true,
    nextFamily: START_CLOCK + FAMILY_CHECK_SECONDS
  };
}

export function validateSave(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!value.resources || typeof value.resources !== 'object') return false;
  if (!Array.isArray(value.villagers)) return false;
  if (!(Array.isArray(value.buildings) || (value.buildings && typeof value.buildings === 'object'))) return false;
  if (value.version !== undefined && !Number.isFinite(Number(value.version))) return false;
  return true;
}

function toClock(msOrClock, nowMs, clock) {
  // Version 1 stored absolute millisecond timestamps; version 2 stores game seconds.
  if (msOrClock > 1e11) return clock + Math.max(0, (msOrClock - nowMs) / 1000);
  return msOrClock;
}

function migrateV1(old, now, fresh) {
  const out = { ...old };
  // Buildings: {id: level} -> [{uid,id,level}]
  const list = [];
  let uid = 1;
  if (old.buildings && !Array.isArray(old.buildings)) {
    for (const [id, level] of Object.entries(old.buildings)) {
      if ((BUILDING_BY_ID[id] || id === 'storage') && level > 0) list.push({ uid: `b${uid++}`, id, level: clamp(Math.floor(level), 1, 10) });
    }
  }
  out.buildings = list;
  out.nextUid = uid;
  // Existing progress is preserved as lifetime totals so the unlock manager sees it.
  out.lifetime = {};
  for (const [id, amount] of Object.entries(old.resources || {})) out.lifetime[id] = Math.max(0, num(amount));
  out.tracking = { ...fresh.tracking, ...(old.tracking || {}) };
  out.tracking.peakVillagers = (old.villagers || []).length;
  out.tracking.events = Math.max(1, out.tracking.events || 0);
  out.tracking.tracks = (old.pets || []).length ? 3 : 0;
  out.tracking.ruinsSearch = (old.relics || []).length ? 3 : 0;
  // The old game started a Small House counter at 1; the new one counts constructions.
  out.tracking.buildSmallHouse = Math.max(0, (out.tracking.buildSmallHouse || 1) - 1);
  out.flags = { traveller: (old.villagers || []).length > 0, merchantMet: true };
  out.unlocks = {};
  out.clock = fresh.clock;
  const clock = out.clock;
  out.expeditions = (old.expeditions || []).map(e => ({ ...e, villagerId: null, endsAt: toClock(e.endsAt, now, clock), startedAt: clock }));
  out.heroes = (old.heroes || []).map(h => ({ ...h, recovering: h.recovering ? toClock(h.recovering, now, clock) : null }));
  out.nextRecruitment = clock + 60;
  out.nextEvent = clock + rint(180, 300);
  out.nextWeather = clock + 300;
  out.merchantRefresh = clock + 180;
  out.market = [];
  out.hunger = 0;
  out.version = 2;
  return out;
}

export function normaliseState(value) {
  const fresh = createNewState();
  if (!validateSave(value)) return fresh;
  const now = Date.now();
  let src = value;
  if ((Number(value.version) || 1) < 2) src = migrateV1(value, now, fresh);
  // Version 3 replaced the single generic Storage with specialised stores. Keep what players had:
  // every old Storage becomes a Lumber Yard, Stoneyard and Granary of the same level.
  if (Array.isArray(src.buildings) && src.buildings.some(b => b && b.id === 'storage')) {
    const converted = [];
    for (const b of src.buildings) {
      if (b && b.id === 'storage') for (const id of ['lumberYard', 'stoneyard', 'granary']) converted.push({ uid: `${b.uid || 'b'}-${id}`, id, level: b.level });
      else converted.push(b);
    }
    src = { ...src, buildings: converted };
  }
  const merged = { ...fresh, ...src, version: VERSION };
  merged.resources = { ...fresh.resources };
  for (const [id, amount] of Object.entries(src.resources || {})) if (RESOURCE_BY_ID[id]) merged.resources[id] = clamp(num(Number(amount)), 0, 1e12);
  merged.lifetime = { ...(src.lifetime || {}) };
  for (const id of Object.keys(merged.resources)) merged.lifetime[id] = Math.max(num(merged.lifetime[id]), 0);
  merged.tracking = { ...fresh.tracking, ...(src.tracking || {}) };
  merged.research = { ...fresh.research, ...(src.research || {}) };
  merged.buildings = (Array.isArray(src.buildings) ? src.buildings : []).filter(b => b && BUILDING_BY_ID[b.id] && b.level > 0)
    .map((b, i) => ({ uid: b.uid || `b${i + 1}`, id: b.id, level: clamp(Math.floor(b.level), 1, 10) }));
  const uidNumbers = merged.buildings.map(b => Number(String(b.uid).replace(/\D/g, '')) || 0);
  merged.nextUid = Math.max(num(src.nextUid), ...uidNumbers, 0) + 1;
  merged.villagers = src.villagers.filter(v => v && typeof v === 'object').map(v => ({
    id: v.id || `v-${merged.nextUid++}`, name: v.name || pick(NAMES), age: v.age || rint(18, 52), profession: PROFESSION_BY_ID[v.profession] ? v.profession : 'idle',
    schedule: SCHEDULES[v.schedule] ? v.schedule : 'day', personality: v.personality || { ...pick(PERSONALITIES) },
    productivity: num(v.productivity) || 1, happiness: num(v.happiness) || 70, experience: num(v.experience), skill: v.skill || 1, family: v.family || null, away: v.away || null
  }));
  merged.tracking.peakVillagers = Math.max(merged.tracking.peakVillagers || 0, merged.villagers.length);
  merged.autoHire = src.autoHire !== false;
  merged.families = (Array.isArray(src.families) ? src.families : []).filter(f => f && Array.isArray(f.members)).map(f => ({
    id: f.id || `f-${merged.nextUid++}`, members: f.members,
    kids: Array.isArray(f.kids) ? f.kids.filter(Number.isFinite) : Array.from({ length: Math.max(0, Math.min(3, Number(f.children) || 0)) }, () => merged.clock)
  }));
  merged.logs = Array.isArray(src.logs) ? src.logs.slice(0, 50) : fresh.logs;
  merged.market = Array.isArray(src.market) ? src.market : [];
  for (const key of ['heroes', 'relics', 'pets', 'mounts', 'monsters', 'equipment', 'expeditions', 'claimedAchievements']) if (!Array.isArray(merged[key])) merged[key] = [];
  for (const key of ['quests', 'blessings', 'petLevels', 'actionCooldowns', 'unlocks', 'flags', 'overflow', 'hungerFlags', 'fullWarned']) if (!merged[key] || typeof merged[key] !== 'object') merged[key] = {};
  if (!Number.isFinite(merged.clock)) merged.clock = START_CLOCK;
  for (const key of ['nextRecruitment', 'nextEvent', 'nextWeather', 'merchantRefresh', 'nextFamily']) if (!Number.isFinite(merged[key]) || merged[key] > merged.clock + 3600) merged[key] = fresh[key] - START_CLOCK + merged.clock;
  merged.hunger = Math.max(0, num(merged.hunger));
  merged.seasonSeen = seasonIndex(merged.clock);
  merged.lastTick = now;
  return merged;
}

// ------------------------------------------------------------------------------------------
// Game
// ------------------------------------------------------------------------------------------
export class Game {
  constructor({ autoLoad = true } = {}) {
    this.listeners = new Set();
    this.timer = null;
    this.silent = false;
    this.counters = null;
    this.offlineReport = null;
    this.lastAutoSave = Date.now();
    this.state = autoLoad ? this.load() : createNewState();
    this.checkUnlocks({ silent: true });
    this.applyOfflineProgress();
    this.checkUnlocks();
  }

  // --- plumbing ----------------------------------------------------------------------------
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit() { this.listeners.forEach(listener => listener(this.state)); }
  touch(save = false) { this.checkUnlocks(); if (save) this.save(); this.emit(); }
  log(text) {
    if (this.silent) return;
    this.state.logs.unshift({ at: Date.now(), text });
    this.state.logs = this.state.logs.slice(0, 50);
  }
  notify(message) { this.log(message); this.emit(); }
  // One timer for the whole game, however many times start() is called.
  start() {
    if (this.timer) return;
    this.state.lastTick = Date.now();
    this.timer = setInterval(() => this.tick(), 1000);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  // --- time ---------------------------------------------------------------------------------
  get clock() { return this.state.clock; }
  timeInfo() {
    const c = this.state.clock;
    return { day: dayNumber(c), time: formatClock(c), hour: hourOfDay(c), daytime: isDaytime(c), season: seasonName(c), weather: this.state.weather, activity: activityAt(hourOfDay(c)) };
  }
  tick(now = Date.now()) {
    const seconds = (now - (this.state.lastTick || now)) / 1000;
    this.state.lastTick = now;
    if (seconds > 0) {
      if (seconds > 90) this.runOffline(seconds, true);
      else this.advance(seconds);
    }
    this.checkUnlocks();
    if (now - this.lastAutoSave >= 30000) { this.lastAutoSave = now; this.save(); }
    this.emit();
  }
  advance(seconds, { offline = false } = {}) {
    let remaining = Math.max(0, seconds);
    let guard = 0;
    while (remaining > 1e-9 && guard++ < 200000) {
      const toBoundary = STEP_SECONDS - (this.state.clock % STEP_SECONDS);
      const dt = Math.min(remaining, toBoundary > 1e-6 ? toBoundary : STEP_SECONDS);
      this.step(dt, offline);
      remaining -= dt;
    }
  }

  // --- buildings ---------------------------------------------------------------------------
  instances(id) { return this.state.buildings.filter(b => b.id === id); }
  countBuilt(id) { return this.instances(id).length; }
  hasBuilding(id) { return this.countBuilt(id) > 0; }
  buildingLevel(id) { return this.instances(id).reduce((m, b) => Math.max(m, b.level), 0); }
  levelSum(id) { return this.instances(id).reduce((t, b) => t + b.level, 0); }
  totalBuildingLevels() { return this.state.buildings.reduce((t, b) => t + b.level, 0); }
  totalResearch() { return Object.values(this.state.research).reduce((a, b) => a + b, 0); }
  unlocked(id) { return !!this.state.unlocks[id]; }
  buildingAvailable(def) { return !!this.state.unlocks[`b_${def.id}`] || this.hasBuilding(def.id); }
  // Totals of every building effect, plus housing and storage capacity.
  fx() {
    const t = { housing: 0, store: {}, storeAll: 0 };
    for (const inst of this.state.buildings) {
      const def = BUILDING_BY_ID[inst.id];
      if (!def) continue;
      if (def.capTable) {
        const amount = def.capTable[clamp(inst.level, 1, def.capTable.length) - 1];
        if (def.capKey === 'storage') { if (def.capClass === 'all') t.storeAll += amount; else t.store[def.capClass] = (t.store[def.capClass] || 0) + amount; }
        else t[def.capKey] = (t[def.capKey] || 0) + amount;
      }
      for (const [key, value] of Object.entries(def.effect)) t[key] = (t[key] || 0) + value * inst.level;
    }
    return t;
  }
  housing() { return this.fx().housing; }
  // Storage limit for one resource. Specialised stores only raise their own goods; gold,
  // silver, gems and other special items live outside storage and have no limit at all.
  capOf(id, fx = this.fx()) {
    const cls = CLASS_OF[id];
    return cls ? BASE_STORAGE + (fx.store[cls] || 0) + fx.storeAll : Infinity;
  }
  storeName(id) { const cls = CLASS_OF[id]; return cls ? STORAGE_CLASSES[cls].name : null; }
  usedHousing() { return this.state.villagers.length; }
  freeHousing() { return Math.max(0, this.housing() - this.usedHousing()); }
  capacityOf(inst) {
    const def = BUILDING_BY_ID[inst.id];
    return def?.capTable ? def.capTable[clamp(inst.level, 1, def.capTable.length) - 1] : 0;
  }
  costDiscount() {
    const builders = this.state.villagers.filter(v => v.profession === 'builder' && !v.away).length;
    return clamp(this.blessingLevel('buildDiscount') * .015 + Math.min(.2, builders * .02) + this.state.research.construction * .02, 0, .5);
  }
  scaleCost(cost, multiplier = 1) {
    const discount = 1 - this.costDiscount();
    return Object.fromEntries(Object.entries(cost).filter(([id, amt]) => RESOURCE_BY_ID[id] && amt > 0).map(([id, amt]) => [id, Math.max(1, Math.ceil(amt * multiplier * discount))]));
  }
  buildCost(def) { return this.scaleCost(def.cost, Math.pow(1.25, this.countBuilt(def.id))); }
  upgradeCost(inst) { return this.scaleCost(BUILDING_BY_ID[inst.id].cost, Math.pow(1.55, inst.level)); }
  costExceedsStorage(cost) { const fx = this.fx(); return Object.entries(cost).some(([id, amt]) => amt > this.capOf(id, fx)); }
  describeCost(cost) {
    const entries = Object.entries(cost);
    return entries.length ? entries.map(([id, n]) => `${n} ${RESOURCE_BY_ID[id]?.name || id}`).join(', ') : 'No materials';
  }
  build(id) {
    const def = BUILDING_BY_ID[id];
    if (!def || !this.buildingAvailable(def)) return this.notify('That knowledge is still beyond the settlement.');
    if (this.countBuilt(id) >= def.max) return this.notify(`No room for another ${def.name}. Upgrade the existing one.`);
    const cost = this.buildCost(def);
    if (!this.spend(cost)) return this.notify(`Not enough materials: ${this.describeCost(cost)}.`);
    this.state.buildings.push({ uid: `b${this.state.nextUid++}`, id, level: 1 });
    this.state.tracking.builds++;
    if (id === 'smallHouse') this.state.tracking.buildSmallHouse++;
    this.log(`${def.name} constructed.`);
    this.touch(true);
  }
  upgradeBuilding(uid) {
    const inst = this.state.buildings.find(b => b.uid === uid);
    if (!inst) return;
    const def = BUILDING_BY_ID[inst.id];
    if (inst.level >= 10) return this.notify(`${def.name} is already at its finest level.`);
    const cost = this.upgradeCost(inst);
    if (!this.spend(cost)) return this.notify(`Not enough materials: ${this.describeCost(cost)}.`);
    inst.level++;
    this.state.tracking.builds++;
    const cap = this.capacityOf(inst);
    this.log(`${def.name} improved to level ${inst.level}${cap ? ` (capacity ${cap.toLocaleString()})` : ''}.`);
    this.touch(true);
  }

  // --- resources and accounting -----------------------------------------------------------
  resource(id) { return this.state.resources[id] || 0; }
  isRevealed(id) { return ['wood', 'stone', 'food'].includes(id) || (this.state.lifetime[id] || 0) > 0 || this.resource(id) > 0; }
  format(n) { return Math.abs(n) >= 1000 ? Math.floor(n).toLocaleString() : (Math.floor(n * 10) / 10).toString(); }
  canAfford(cost) { return Object.entries(cost).every(([id, amount]) => this.resource(id) >= amount); }
  spend(cost) {
    if (!this.canAfford(cost)) return false;
    Object.entries(cost).forEach(([id, amount]) => { this.state.resources[id] = number(Math.max(0, this.resource(id) - amount)); });
    return true;
  }
  // The only way resources enter the stockpile. Gains are limited by storage and the
  // refused amount is tallied in state.overflow so it is never silently discarded.
  addResources(rewards, reason = '', { passive = false } = {}) {
    const fx = this.fx();
    const gained = [];
    const lost = [];
    for (const [id, amount] of Object.entries(rewards)) {
      if (!RESOURCE_BY_ID[id] || !Number.isFinite(amount) || !amount) continue;
      const before = this.resource(id);
      if (amount < 0) { this.state.resources[id] = number(Math.max(0, before + amount)); continue; }
      const limit = this.capOf(id, fx);
      const accepted = Math.min(amount, Math.max(0, limit - before));
      const overflow = amount - accepted;
      if (accepted > 0) {
        this.state.resources[id] = number(before + accepted);
        this.state.lifetime[id] = number((this.state.lifetime[id] || 0) + accepted);
      }
      if (overflow > 0.001) {
        this.state.overflow[id] = number((this.state.overflow[id] || 0) + overflow);
        lost.push(`${Math.floor(overflow)} ${RESOURCE_BY_ID[id].name}`);
      }
      if (accepted > .04) gained.push(`${accepted >= 10 ? Math.floor(accepted) : accepted.toFixed(1)} ${RESOURCE_BY_ID[id].name}`);
    }
    if (reason && gained.length) this.log(`${reason}: +${gained.join(', +')}.`);
    if (!passive && lost.length && lost.some(x => !x.startsWith('0 '))) this.log(`Storage is full. Lost: ${lost.filter(x => !x.startsWith('0 ')).join(', ')}.`);
  }

  blessingLevel(id) { return this.state.blessings[id] || 0; }
  personalityBonus(key) { return Math.min(.5, this.state.villagers.filter(v => v.personality?.bonus === key).reduce((t, v) => t + (v.personality?.value || 0), 0)); }
  relicBonus(key) {
    return this.state.relics.reduce((t, id) => { const relic = RELICS.find(r => r.id === id); return t + (relic?.kind === key || relic?.kind === 'all' ? relic.value : 0); }, 0) / 100;
  }
  petBonus(key) {
    const names = this.state.pets.map(id => PETS.find(x => x.id === id)?.name);
    const map = { explore: ['Fox', 'Griffin'], hunt: ['Wolf'], research: ['Owl'], mine: ['Baby Dragon'], rare: ['Shadow Panther'], travel: ['Griffin'], combat: ['Baby Wyvern'], food: ['Rabbit'], herbs: ['Forest Sprite'] };
    return (map[key] || []).filter(name => names.includes(name)).reduce((total, name) => {
      const pet = PETS.find(x => x.name === name);
      return total + .1 + Math.max(0, (this.state.petLevels[pet?.id] || 1) - 1) * .01;
    }, 0);
  }
  countJob(id) { return this.state.villagers.filter(v => v.profession === id && !v.away).length; }

  // Per-resource production multiplier (buildings, relics, pets, research, weather, season).
  resourceMult(id, fx) {
    const s = this.state;
    let m = 1 + (fx.production || 0) / 100 + this.relicBonus('production') + s.monsters.length * .03 + (s.resources.prestige || 0) * .02;
    const extra = {
      wood: this.relicBonus('wood'), stone: this.relicBonus('stone'),
      food: this.relicBonus('farm') + this.petBonus('food') + s.research.agriculture * .04,
      iron: this.relicBonus('iron') + this.petBonus('mine'), coal: this.relicBonus('coal'),
      herbs: this.relicBonus('herbs') + this.petBonus('herbs'),
      research: this.relicBonus('research') + this.petBonus('research') + (fx.research || 0) / 100 + s.research.magic * .03,
      gold: this.relicBonus('gold')
    }[id] || 0;
    m *= 1 + extra;
    const w = s.weather, season = seasonName(s.clock);
    if (w === 'Rainy') { if (id === 'food') m *= 1.15; if (id === 'wood') m *= .9; }
    if (w === 'Snowy') { if (id === 'food') m *= .78; if (id === 'fur') m *= 1.18; }
    if (w === 'Stormy') { if (id === 'wood') m *= .8; if (id === 'water') m *= 1.25; }
    if (season === 'Summer' && id === 'food') m *= 1.1;
    if (season === 'Winter') { if (id === 'food') m *= .8; if (id === 'fur') m *= 1.15; }
    return m;
  }

  jobSlots(profession) {
    if (profession.id === 'idle') return Infinity;
    if (!profession.requires.length) return profession.requiresUnlock && this.unlocked(profession.requiresUnlock) ? Infinity : 0;
    return profession.requires.reduce((t, id) => t + this.levelSum(id) * 2, 0);
  }
  jobAvailable(profession) { return profession.id === 'idle' || this.jobSlots(profession) > 0; }
  // Efficiency bonus from upgraded workplaces: +10% per average level above 1.
  jobEfficiency(profession) {
    const insts = profession.requires.flatMap(id => this.instances(id));
    if (!insts.length) return 1;
    return 1 + (insts.reduce((t, b) => t + b.level, 0) / insts.length - 1) * .1;
  }

  // Resource production and consumption per in-game hour, for the given hour of the day.
  ratesAt(hour, fx = this.fx(), happiness = this.happinessInfo(fx).value) {
    const s = this.state;
    const prod = {};
    const cons = {};
    const add = (o, id, v) => { o[id] = (o[id] || 0) + v; };
    const happyMult = happiness < 40 ? .75 : happiness > 80 ? 1.1 : 1;
    const hungerMult = s.hunger > 0 ? .6 : 1;
    for (const v of s.villagers) {
      if (v.away || v.profession === 'idle') continue;
      if (!isWorking(v.schedule || 'day', hour)) continue;
      const job = PROFESSION_BY_ID[v.profession];
      if (!job) continue;
      const p = v.personality || {};
      const base = (v.productivity || 1) * (1 + .03 * ((v.skill || 1) - 1)) * happyMult * hungerMult * this.jobEfficiency(job);
      for (const [id, amount] of Object.entries(job.production)) {
        let bonus = p.bonus === 'production' ? p.value : 0;
        if (p.bonus === 'food' && id === 'food') bonus += p.value;
        if (p.bonus === 'research' && id === 'research') bonus += p.value;
        if (p.bonus === 'trade' && (id === 'gold' || id === 'silver')) bonus += p.value;
        add(prod, id, amount * base * (1 + bonus));
      }
    }
    const dayShift = isWorking('day', hour);
    for (const inst of s.buildings) {
      const def = BUILDING_BY_ID[inst.id];
      if (!def || !Object.keys(def.passive).length) continue;
      if (!def.allDay && !dayShift) continue;
      for (const [id, amount] of Object.entries(def.passive)) add(prod, id, amount * inst.level);
    }
    for (const id of Object.keys(prod)) prod[id] *= this.resourceMult(id, fx);
    if (s.villagers.length) cons.food = s.villagers.length * FOOD_PER_VILLAGER_DAY / 24;
    return { prod, cons };
  }

  happinessInfo(fx = this.fx()) {
    const s = this.state;
    const pop = s.villagers.length;
    const parts = [['Base', 60]];
    if (pop) {
      const need = pop * FOOD_PER_VILLAGER_DAY;
      if (s.hunger > 0) parts.push(['Starving', -25]);
      else if (this.resource('food') >= need * 2) parts.push(['Well fed', 8]);
      else if (this.resource('food') < need) parts.push(['Food is low', -6]);
      const over = Math.max(0, pop - (fx.housing || 0));
      if (over) parts.push(['Not enough housing', -Math.min(30, over * 10)]);
      else parts.push(['Everyone has a roof', 3]);
      if (this.hasBuilding('well')) parts.push(['Clean water', 6]);
      else if (pop >= 3) parts.push(['No well', -4]);
      const longShift = s.villagers.filter(v => v.schedule === 'long').length;
      if (longShift) parts.push(['Long working days', -Math.round(8 * longShift / pop)]);
    }
    if (fx.happiness) parts.push(['Buildings', Math.min(25, fx.happiness)]);
    const cooks = this.countJob('cook');
    if (cooks) parts.push(['Warm meals', Math.min(8, cooks * 1.5)]);
    if (s.morale) parts.push(['Festivities', Math.round(s.morale)]);
    const weatherBonus = { Sunny: 2, Rainy: -1, Snowy: -2, Stormy: -3, Foggy: 0 }[s.weather] || 0;
    if (weatherBonus) parts.push([`${s.weather} weather`, weatherBonus]);
    const value = clamp(Math.round(parts.reduce((t, [, d]) => t + d, 0)), 5, 100);
    return { value, parts };
  }

  recruitChance(happiness = this.happinessInfo().value) {
    const houses = this.countBuilt('smallHouse');
    let chance = 25 + Math.max(0, houses - 1) * 2 + (this.fx().recruit || 0) + (happiness > 80 ? 5 : 0) + this.blessingLevel('recruitment') * 2 + this.relicBonus('recruit') * 100 + this.state.research.construction;
    chance = Math.min(40, chance);
    if (happiness < 20) return 0;
    if (happiness < 40) chance *= .5;
    return Math.round(chance * 10) / 10;
  }

  // Daily accounting for every resource: stock, capacity, production, consumption, net, accepted and overflow.
  ledger(fx = this.fx()) {
    const hap = this.happinessInfo(fx).value;
    const prod = {};
    const cons = {};
    for (let h = 0; h < 24; h++) {
      const r = this.ratesAt(h, fx, hap);
      for (const [id, v] of Object.entries(r.prod)) prod[id] = (prod[id] || 0) + v;
      for (const [id, v] of Object.entries(r.cons)) cons[id] = (cons[id] || 0) + v;
    }
    const out = {};
    for (const r of RESOURCES) {
      const stock = this.resource(r.id);
      const cap = this.capOf(r.id, fx);
      const p = prod[r.id] || 0;
      const c = cons[r.id] || 0;
      const net = p - c;
      const accepted = net > 0 ? Math.min(net, Math.max(0, cap - stock)) : net;
      out[r.id] = { stock, cap, prod: p, cons: c, net, accepted, overflow: net > 0 ? net - accepted : 0, full: stock >= cap - .01, lost: this.state.overflow[r.id] || 0 };
    }
    return out;
  }

  getStats() {
    const fx = this.fx();
    const happy = this.happinessInfo(fx);
    const guards = this.countJob('guard');
    return {
      fx, ledger: this.ledger(fx), happiness: happy.value, happinessParts: happy.parts,
      recruitChance: this.recruitChance(happy.value), housing: fx.housing || 0, pop: this.state.villagers.length,
      employed: this.state.villagers.filter(v => v.profession !== 'idle' && !v.away).length,
      unemployed: this.state.villagers.filter(v => v.profession === 'idle' && !v.away).length,
      away: this.state.villagers.filter(v => v.away).length, children: this.childCount(),
      guard: guards + (fx.guard || 0), combat: (fx.combat || 0) + guards * 2 + this.state.research.military * 2,
      travel: (fx.travel || 0) + this.petBonus('travel') * 100,
      foodUse: this.state.villagers.length * FOOD_PER_VILLAGER_DAY
    };
  }

  // --- simulation --------------------------------------------------------------------------
  step(dt, offline) {
    const s = this.state;
    const hour = hourOfDay(s.clock);
    const fx = this.fx();
    const happiness = this.happinessInfo(fx).value;
    const { prod, cons } = this.ratesAt(hour, fx, happiness);
    const k = dt / HOUR_SECONDS;
    let shortfall = 0;
    for (const id of new Set([...Object.keys(prod), ...Object.keys(cons)])) {
      const net = ((prod[id] || 0) - (cons[id] || 0)) * k;
      if (net >= 0) this.addResources({ [id]: net }, '', { passive: true });
      else {
        const have = this.resource(id);
        const take = Math.min(have, -net);
        s.resources[id] = number(have - take);
        if (-net - take > 1e-6) shortfall += -net - take;
      }
    }
    // Workers learn on the job; villagers drift toward the settlement's mood.
    for (const v of s.villagers) {
      if (!v.away && v.profession !== 'idle' && isWorking(v.schedule || 'day', hour)) v.experience += .5 * k;
      v.happiness = number(v.happiness + (happiness - v.happiness) * Math.min(1, dt / 200));
      while (v.experience >= v.skill * 20 && v.skill < 20) { v.skill++; if (!offline) this.log(`${v.name} grows more skilled (level ${v.skill}).`); }
    }
    if (shortfall > 1e-6) s.hunger += dt;
    else if (s.hunger > 0) s.hunger = Math.max(0, s.hunger - dt * 2);
    this.processHunger(dt);
    s.morale = s.morale > 0 ? Math.max(0, s.morale - k) : Math.min(0, s.morale + k);
    s.clock += dt;
    this.afterStep(offline);
    this.updateFullWarnings(offline);
  }

  processHunger(dt) {
    const s = this.state;
    if (s.hunger <= 0) {
      if (s.hungerFlags.hungry) this.log('Food is on the table again. The hunger passes.');
      s.hungerFlags = {};
      s.hungerLeave = 0;
      return;
    }
    if (!s.hungerFlags.hungry) { s.hungerFlags.hungry = true; this.log('The food has run out. The villagers are hungry and work slowly.'); }
    if (s.hunger >= HUNGER_LEAVE_AFTER / 2 && !s.hungerFlags.warned) { s.hungerFlags.warned = true; this.log('Hunger wears on the settlement. If it lasts, villagers will leave.'); }
    if (s.hunger >= HUNGER_LEAVE_AFTER) {
      s.hungerLeave = (s.hungerLeave || 0) + dt;
      if (s.hungerLeave >= HUNGER_LEAVE_EVERY) { s.hungerLeave = 0; this.villagerLeaves(); }
    }
  }
  villagerLeaves() {
    const s = this.state;
    if (s.villagers.length <= 1) return; // the last villager never abandons the fire
    if (this.counters && this.counters.left >= Math.ceil(this.counters.startPop / 2)) return;
    const candidates = s.villagers.filter(v => !v.away).sort((a, b) => a.happiness - b.happiness);
    const leaver = candidates[0];
    if (!leaver) return;
    s.villagers = s.villagers.filter(v => v.id !== leaver.id);
    s.families = s.families.map(f => ({ ...f, members: f.members.filter(m => m !== leaver.id) })).filter(f => f.members.length > 0);
    s.villagers.forEach(v => { if (v.family === leaver.id) v.family = null; });
    if (this.counters) this.counters.left++;
    this.log(`${leaver.name} leaves the settlement, hungry and tired. Feed those who remain.`);
  }
  updateFullWarnings(offline) {
    if (offline) return;
    const fx = this.fx();
    for (const r of RESOURCES) {
      const cap = this.capOf(r.id, fx);
      if (!Number.isFinite(cap)) continue;
      const stock = this.resource(r.id);
      if (stock >= cap - .01 && (this.state.lifetime[r.id] || 0) > 0) {
        if (!this.state.fullWarned[r.id]) { this.state.fullWarned[r.id] = true; this.log(`${this.storeName(r.id)} is full: ${r.name} is overflowing.`); }
      } else if (stock < cap * .9) delete this.state.fullWarned[r.id];
    }
    const food = this.resource('food');
    const need = this.state.villagers.length * FOOD_PER_VILLAGER_DAY;
    if (need && food < need && this.state.hunger <= 0) {
      if (!this.state.hungerFlags.low) { this.state.hungerFlags.low = true; this.log('Food is running low. Less than a day of meals remains.'); }
    } else if (food >= need * 1.5) delete this.state.hungerFlags.low;
  }

  afterStep(offline) {
    const s = this.state;
    const season = seasonIndex(s.clock);
    if (season !== s.seasonSeen) {
      s.seasonSeen = season;
      this.log(`The season turns to ${SEASONS[season]}.`);
    }
    while (s.clock >= s.nextFamily) { s.nextFamily += FAMILY_CHECK_SECONDS; this.familyTick(); }
    this.growKids();
    this.autoAssign();
    while (s.clock >= s.nextRecruitment) {
      s.nextRecruitment += 60;
      if (offline) this.recruitOffline(); else this.tryRecruit();
    }
    if (s.clock >= s.nextWeather) this.changeWeather(offline);
    if (s.clock >= s.nextEvent) {
      if (!offline && this.unlocked('villagerEvents')) this.generateRandomEvent();
      s.nextEvent = s.clock + rint(180, 300);
    }
    if (s.clock >= s.merchantRefresh) {
      if (this.unlocked('trading')) { this.refreshMarket(offline); if (this.counters) this.counters.merchants++; }
      s.merchantRefresh += 180;
    }
    this.finishExpeditions();
    this.finishHeroRecovery();
    if (!offline) this.retryStories();
  }

  // --- offline -----------------------------------------------------------------------------
  applyOfflineProgress() {
    const elapsed = (Date.now() - (this.state.lastSaved || Date.now())) / 1000;
    if (elapsed < 60) return;
    this.runOffline(elapsed, false);
    this.state.lastTick = Date.now();
  }
  // Simulates the time that passed while the game was closed or the tab was frozen.
  runOffline(seconds, fromTick = false) {
    const secs = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, seconds));
    const s = this.state;
    const before = { ...s.resources };
    const lostBefore = { ...s.overflow };
    this.counters = { arrivals: 0, merchants: 0, expeditions: 0, left: 0, startPop: s.villagers.length };
    const expeditionsBefore = s.expeditions.length;
    this.silent = true;
    try { this.advance(secs, { offline: true }); } finally { this.silent = false; }
    const counters = this.counters;
    this.counters = null;
    const gains = {};
    const losses = {};
    for (const r of RESOURCES) {
      const diff = number(this.resource(r.id) - (before[r.id] || 0));
      if (diff > .5) gains[r.id] = Math.floor(diff);
      else if (diff < -.5) losses[r.id] = Math.floor(-diff);
    }
    const wasted = {};
    for (const [id, amount] of Object.entries(s.overflow)) { const d = amount - (lostBefore[id] || 0); if (d > .5) wasted[id] = Math.floor(d); }
    const minutes = Math.floor(secs / 60);
    this.offlineReport = { minutes, capped: seconds > MAX_OFFLINE_SECONDS, gains, losses, wasted, arrivals: counters.arrivals, merchants: counters.merchants, expeditions: expeditionsBefore - s.expeditions.length, left: counters.left };
    this.log(`Welcome back. ${minutes} minute${minutes === 1 ? '' : 's'} passed${counters.arrivals ? `; ${counters.arrivals} traveller${counters.arrivals > 1 ? 's' : ''} settled` : ''}${this.offlineReport.expeditions > 0 ? `; ${this.offlineReport.expeditions} expedition${this.offlineReport.expeditions > 1 ? 's' : ''} returned` : ''}.`);
    if (fromTick) this.emit();
    return this.offlineReport;
  }
  recruitOffline() {
    if (!this.unlocked('villagerMgmt') || this.freeHousing() <= 0) return;
    if (Math.random() * 100 < this.recruitChance()) { this.addVillager(); if (this.counters) this.counters.arrivals++; }
  }

  // --- actions -----------------------------------------------------------------------------
  actionAvailable(id) {
    const a = ACTIONS[id];
    return !!a && allMet(this, a.requires) && !(a.hideWhen && this.unlocked(a.hideWhen));
  }
  actionsFor(tab) { return Object.keys(ACTIONS).filter(id => ACTIONS[id].tab === tab && this.actionAvailable(id)); }
  readyHero() { return this.state.heroes.find(h => !h.recovering && !this.state.expeditions.some(e => e.heroId === h.id)) || null; }
  doAction(actionId) {
    const a = ACTIONS[actionId];
    if (!a || !this.actionAvailable(actionId)) return;
    const now = Date.now();
    if (this.state.actionCooldowns[actionId] > now) return this.notify('You need a moment before doing that again.');
    if (a.rewards.torch && this.resource('torch') < Math.abs(a.rewards.torch)) return this.notify('You need a torch for that descent.');
    const mult = 1 + this.relicBonus(a.bonus) + this.petBonus(a.bonus) + a.bless.reduce((t, b) => t + this.blessingLevel(b) * .05, 0);
    const rewards = { ...a.rewards };
    for (const key of Object.keys(rewards)) if (rewards[key] > 0) rewards[key] = Math.max(1, Math.round(rewards[key] * mult));
    if (Math.random() < .08 + this.blessingLevel('doubleGain') * .03) { for (const key of Object.keys(rewards)) if (rewards[key] > 0) rewards[key] *= 2; }
    if (a.mapChance && Math.random() < a.mapChance) rewards.maps = (rewards.maps || 0) + 1;
    if (actionId === 'caveExplore') {
      this.state.caveDepth += 1;
      if (a.relicChance && Math.random() < a.relicChance) this.findRelic();
    }
    if (a.track) this.state.tracking[a.track] = (this.state.tracking[a.track] || 0) + 1;
    this.addResources(rewards, a.name);
    if (a.combat && this.readyHero() && Math.random() < a.combat[2]) this.startCombat(pick(ENEMIES.slice(a.combat[0], a.combat[1])), actionId === 'hunt' ? 'hunt' : 'cave');
    this.state.actionCooldowns[actionId] = now + a.cooldown * 1000;
    this.state.tracking.actions++;
    if (rewards.wood && (actionId === 'chopTrees' || actionId === 'chopForest')) this.state.tracking.gatherWood += rewards.wood;
    if (actionId === 'mineStone') this.state.tracking.mineStone += rewards.stone || 0;
    this.touch(true);
  }

  // --- unlock manager ----------------------------------------------------------------------
  checkUnlocks({ silent = false } = {}) {
    const s = this.state;
    const wasSilent = this.silent;
    if (silent) this.silent = true;
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 12) {
      changed = false;
      for (const f of FEATURES) {
        if (s.unlocks[f.id] || !allMet(this, f.requires)) continue;
        s.unlocks[f.id] = true;
        changed = true;
        if (f.notify) this.log(f.notify);
        if (f.trigger && !silent) this.fireTrigger(f.trigger);
      }
      for (const b of BUILDINGS) {
        const key = `b_${b.id}`;
        if (s.unlocks[key]) continue;
        const revealed = Object.keys(b.cost).every(id => this.isRevealed(id));
        if (!revealed || !allMet(this, b.requires)) continue;
        s.unlocks[key] = true;
        changed = true;
        this.log(`You can now build: ${b.name}.`);
      }
    }
    for (const v of s.villagers) while (v.experience >= v.skill * 20 && v.skill < 20) v.skill++;
    s.tracking.peakVillagers = Math.max(s.tracking.peakVillagers || 0, s.villagers.length);
    this.autoAssign();
    this.silent = wasSilent;
  }
  visibleTabs(tabs) { return tabs.filter(t => this.unlocked(t.feature)); }

  // --- scripted story events ---------------------------------------------------------------
  fireTrigger(kind) {
    if (this.state.pendingEvent) return;
    if (kind === 'traveller' && !this.state.flags.traveller) {
      const prospect = { name: pick(NAMES), personality: pick(PERSONALITIES) };
      this.state.pendingEvent = { kind: 'story_traveller', title: 'A traveller at the edge of the light', body: `${prospect.name} stands just beyond the glow, cold and tired, asking to share your fire. They seem ${prospect.personality.name.toLowerCase()}.`, prospect };
      this.log('Someone is standing at the edge of the firelight.');
    } else if (kind === 'merchant' && !this.state.flags.merchantMet) {
      this.state.pendingEvent = { kind: 'story_merchant', title: 'A wagon creaks out of the dark', body: 'A travelling merchant steers a laden cart to your settlement. They offer a small gift and the promise of trade.', reward: { gold: 15, food: 20 } };
      this.log('A merchant’s wagon approaches.');
    }
  }
  retryStories() {
    const s = this.state;
    if (s.pendingEvent) return;
    if (s.unlocks.travellerArrival && !s.flags.traveller && s.clock >= (s.flags.travellerRetry || 0)) this.fireTrigger('traveller');
    else if (s.unlocks.merchantArrival && !s.flags.merchantMet && s.clock >= (s.flags.merchantRetry || 0)) this.fireTrigger('merchant');
  }

  // --- villagers ---------------------------------------------------------------------------
  addVillager({ name, personality, age, born } = {}) {
    const p = { ...(personality || pick(PERSONALITIES)) };
    const v = { id: `v-${this.state.nextUid++}`, name: name || pick(NAMES), age: age || rint(18, 52), profession: 'idle', schedule: 'day', personality: p, productivity: number(.9 + Math.random() * .25), happiness: 70, experience: 0, skill: 1, family: null, away: null };
    this.state.villagers.push(v);
    this.state.tracking.peakVillagers = Math.max(this.state.tracking.peakVillagers || 0, this.state.villagers.length);
    if (!born) this.log(`${v.name}, a ${p.name.toLowerCase()} traveller, joins the fire.`);
    return v;
  }
  tryRecruit() {
    const s = this.state;
    if (!this.unlocked('villagerMgmt') || this.freeHousing() <= 0 || s.pendingEvent) return;
    if (Math.random() * 100 < this.recruitChance()) {
      const prospect = { name: pick(NAMES), personality: pick(PERSONALITIES) };
      s.pendingEvent = { kind: 'traveller', title: 'A traveller approaches', body: `${prospect.name} is looking for a warm place to stay. They seem ${prospect.personality.name.toLowerCase()}.`, prospect };
      this.log('A traveller waits at the edge of the light.');
    }
  }
  availableSchedules(villager) {
    const list = ['day'];
    if (this.hasBuilding('guildHall')) list.push('long');
    if (villager.profession === 'guard') list.push('night');
    return list;
  }
  assignVillager(villagerId, professionId) {
    const v = this.state.villagers.find(x => x.id === villagerId);
    const job = PROFESSION_BY_ID[professionId];
    if (!v || !job || !this.unlocked('professions')) return;
    if (v.profession === professionId) return;
    if (!this.jobAvailable(job)) return this.notify(`${job.name} work needs a place to do it.`);
    const taken = this.state.villagers.filter(x => x.profession === professionId && x.id !== v.id).length;
    if (taken >= this.jobSlots(job)) return this.notify(`All ${job.name} places are filled. Build or upgrade a workplace.`);
    v.profession = professionId;
    if (!this.availableSchedules(v).includes(v.schedule)) v.schedule = 'day';
    this.log(`${v.name} is now ${professionId === 'idle' ? 'idle' : `a ${job.name}`}.`);
    this.touch(true);
  }
  setSchedule(villagerId, schedule) {
    const v = this.state.villagers.find(x => x.id === villagerId);
    if (!v || !this.availableSchedules(v).includes(schedule)) return;
    v.schedule = schedule;
    this.log(`${v.name} now keeps the ${SCHEDULES[schedule].name.toLowerCase()}.`);
    this.touch(true);
  }

  // --- events ------------------------------------------------------------------------------
  resolveEvent(choice) {
    const s = this.state;
    const event = s.pendingEvent;
    if (!event) return;
    const accept = choice === 'accept';
    switch (event.kind) {
      case 'story_traveller':
        if (accept) {
          const v = this.addVillager({ name: event.prospect.name, personality: event.prospect.personality });
          s.flags.traveller = true;
          this.log(`${v.name} warms their hands at your fire. You are no longer alone.`);
        } else { s.flags.travellerRetry = s.clock + 120; this.log('The stranger waits a little way off, watching the flames.'); }
        break;
      case 'story_merchant':
        if (accept) { s.flags.merchantMet = true; this.addResources(event.reward, 'The merchant’s gift'); this.refreshMarket(); s.morale += 2; }
        else { s.flags.merchantRetry = s.clock + 180; this.log('The merchant shrugs and drives on. Perhaps they will return.'); }
        break;
      case 'traveller':
        if (accept && this.freeHousing() > 0) { this.addVillager({ name: event.prospect.name, personality: event.prospect.personality }); }
        else this.log(accept ? 'There is no room. The traveller nods, then returns to the road.' : 'The traveller nods, then returns to the road.');
        break;
      case 'merchant':
        if (accept) { this.addResources(event.reward, 'The merchant’s gift'); s.morale += 2; } else this.log('The merchant packs their curious wares and leaves.');
        break;
      case 'festival':
        if (accept) { if (this.spend(event.cost)) { s.morale += 12; this.log('Lanterns glow around a lively festival. Spirits are high.'); } else this.log('There is not enough to hold the festival.'); }
        break;
      case 'chest':
        if (accept) { this.addResources(event.reward, 'Ancient chest opened'); if (this.unlocked('ancientRuins') && Math.random() < .45) this.findRelic(); }
        break;
      case 'threat':
        if (accept) this.defendSettlement(); else { this.addResources({ food: -8 }); this.log('The wolves melt back into the trees with some provisions.'); }
        break;
    }
    s.pendingEvent = null;
    this.touch(true);
  }
  defendSettlement() {
    if (this.readyHero()) return this.startCombat(pick(ENEMIES.slice(0, 12)), 'event');
    const guards = this.countJob('guard') + (this.fx().guard || 0);
    if (guards > 0) { this.addResources({ fur: rint(1, 3) }, 'Your guards drive the pack off'); return; }
    this.addResources({ food: -8 });
    this.log('Without guards, the wolves take some food before leaving.');
  }
  generateRandomEvent() {
    const s = this.state;
    if (s.pendingEvent) return;
    const pool = [];
    if (this.unlocked('trading')) pool.push('merchant', 'merchant');
    if (s.villagers.length >= 3) pool.push('festival');
    if (s.villagers.length >= 2) pool.push('chest', 'chest');
    if (s.villagers.length >= 3) pool.push('threat');
    if (!pool.length) return;
    const kind = pick(pool);
    const ruins = this.unlocked('ancientRuins');
    const events = {
      merchant: { kind, title: 'A curious merchant visits', body: 'Their wagon carries a little of everything. Accept a small gift?', reward: { gold: 10, food: 15 } },
      festival: { kind, title: seasonName(s.clock) === 'Autumn' ? 'A harvest festival begins' : 'A quiet festival begins', body: 'The villagers ask for 20 food and 10 wood for a proper celebration.', cost: { food: 20, wood: 10 } },
      chest: { kind, title: 'An ancient chest is uncovered', body: 'Roots have held this lockbox shut for ages. Open it?', reward: ruins ? { gold: 35, ancientCoins: 3, crystal: 1 } : { gold: 20, stone: 10 } },
      threat: { kind, title: 'A wolf pack circles the firelight', body: 'Defend the settlement, or lose a little food and stay inside.' }
    };
    s.pendingEvent = events[kind];
    s.tracking.events++;
    this.log(`${events[kind].title}.`);
  }
  changeWeather(offline) {
    const s = this.state;
    const season = seasonName(s.clock);
    const table = { Spring: ['Sunny', 'Rainy', 'Rainy', 'Foggy', 'Sunny'], Summer: ['Sunny', 'Sunny', 'Sunny', 'Stormy', 'Rainy'], Autumn: ['Rainy', 'Foggy', 'Foggy', 'Sunny', 'Stormy'], Winter: ['Snowy', 'Snowy', 'Foggy', 'Stormy', 'Sunny'] }[season];
    s.weather = pick(table);
    s.nextWeather = s.clock + 300;
    if (!offline) this.log(`The weather turns ${s.weather.toLowerCase()}.`);
  }

  // --- research / crafting -----------------------------------------------------------------
  researchCost(level) { return { research: 8 + level * 9, gold: 10 + level * 12 }; }
  research(branch) {
    if (!this.unlocked('research')) return;
    const level = this.state.research[branch];
    const entries = RESEARCH[branch];
    if (!entries || level >= entries.length) return this.notify('That field has reached its current limit.');
    const cost = this.researchCost(level);
    if (!this.spend(cost)) return this.notify(`Research requires ${this.describeCost(cost)}.`);
    this.state.research[branch]++;
    this.log(`Research completed: ${entries[level]}.`);
    this.touch(true);
  }
  recipeVisible(recipe) { return this.totalResearch() >= recipe.unlock && Object.keys(recipe.cost).every(id => this.isRevealed(id)); }
  craft(recipeId) {
    const recipe = RECIPES.find(x => x.id === recipeId);
    if (!recipe) return;
    if (this.totalResearch() < recipe.unlock) return this.notify('More research is needed to understand that recipe.');
    const simple = ['torch', 'travelRations', 'leather'].includes(recipe.id);
    if (!simple && !this.hasBuilding('workshop')) return this.notify('A Workshop is required for that craft.');
    const cost = { ...recipe.cost };
    const discount = 1 - this.blessingLevel('craftDiscount') * .02 - this.personalityBonus('craft');
    Object.keys(cost).forEach(id => { cost[id] = Math.max(1, Math.ceil(cost[id] * discount)); });
    if (!this.spend(cost)) return this.notify(`Crafting needs ${this.describeCost(cost)}.`);
    if (recipe.result.equipment) { this.state.equipment.push({ name: recipe.result.equipment, rarity: this.rarity(), level: 1 }); this.log(`Crafted ${recipe.result.equipment}.`); }
    else this.addResources(recipe.result, `Crafted ${recipe.name}`);
    if (recipe.id === 'torch') this.state.tracking.craftTorch += recipe.result.torch || 0;
    this.state.tracking.actions++;
    this.touch(true);
  }

  // --- expeditions -------------------------------------------------------------------------
  maxParties() { return 1 + Math.floor((this.fx().travel || 0) / 10); }
  expeditionSeconds(region) {
    const w = { Stormy: 1.2, Snowy: 1.1, Rainy: 1.05 }[this.state.weather] || 1;
    return region.duration * 60 * w * (1 - clamp(this.getStats().travel / 100, 0, .45));
  }
  freeVillagers() { return this.state.villagers.filter(v => !v.away); }
  startExpedition(regionId) {
    const s = this.state;
    const region = REGIONS.find(x => x.id === regionId);
    if (!region || !this.unlocked('map')) return;
    if (this.totalBuildingLevels() < region.unlock) return this.notify(`Requires ${region.unlock} total building levels.`);
    if (s.expeditions.length >= this.maxParties()) return this.notify('All available parties are already travelling.');
    const hero = this.readyHero();
    let villager = null;
    if (!hero) {
      villager = this.freeVillagers().sort((a, b) => (a.profession === 'idle' ? 0 : 1) - (b.profession === 'idle' ? 0 : 1))[0];
      if (!villager) return this.notify('Nobody is free to travel. Recruit a hero or free a villager.');
      villager.away = `e-${s.nextUid}`;
    }
    const id = `e-${s.nextUid++}`;
    if (villager) villager.away = id;
    s.expeditions.push({ id, regionId, heroId: hero?.id || null, villagerId: villager?.id || null, startedAt: s.clock, endsAt: s.clock + this.expeditionSeconds(region) });
    this.log(`${hero?.name || villager.name} leaves for ${region.name}.`);
    this.touch(true);
  }
  finishExpeditions() {
    const s = this.state;
    const done = s.expeditions.filter(e => e.endsAt <= s.clock);
    if (!done.length) return;
    s.expeditions = s.expeditions.filter(e => e.endsAt > s.clock);
    for (const expedition of done) {
      const region = REGIONS.find(r => r.id === expedition.regionId);
      const explorers = this.countJob('explorer');
      const mult = 1 + this.personalityBonus('explore') + this.relicBonus('explore') + this.petBonus('explore') + this.blessingLevel('exploration') * .05 + (this.fx().explore || 0) / 100 + explorers * .04;
      const rewards = { gold: Math.round(rint(10, 25) * mult), food: Math.round(rint(8, 22) * mult) };
      const special = pick(region.rewards);
      rewards[special] = (rewards[special] || 0) + Math.round(rint(2, 7) * mult);
      if (Math.random() < .22) rewards.maps = 1;
      if (this.unlocked('ancientRuins') && Math.random() < .16) this.findRelic(false);
      this.addResources(rewards, `Expedition returned from ${region.name}`);
      s.tracking.expedition++;
      s.tracking.actions++;
      if (this.counters) this.counters.expeditions++;
      const villager = s.villagers.find(v => v.id === expedition.villagerId);
      if (villager) { villager.away = null; villager.experience += 5; }
      if (Math.random() < .38 && expedition.heroId) this.startCombat(ENEMIES.find(x => x.id === region.enemy) || pick(ENEMIES), 'expedition', expedition.heroId);
    }
    if (!this.silent) this.checkUnlocks();
  }

  // --- heroes and combat -------------------------------------------------------------------
  rarity() { const roll = Math.random() * 100; return roll < 50 ? 'Common' : roll < 75 ? 'Uncommon' : roll < 90 ? 'Rare' : roll < 97 ? 'Epic' : roll < 99.4 ? 'Legendary' : 'Mythical'; }
  heroCost() { return { gold: 60 + this.state.heroes.length * 35, food: 25 }; }
  recruitHero() {
    if (!this.unlocked('heroes')) return;
    const cost = this.heroCost();
    if (!this.spend(cost)) return this.notify(`A hero answers for ${this.describeCost(cost)}.`);
    const rarity = this.rarity();
    const m = { Common: 1, Uncommon: 1.15, Rare: 1.35, Epic: 1.6, Legendary: 2, Mythical: 2.5 }[rarity];
    const hero = { id: `h-${this.state.nextUid++}`, name: pick(NAMES), class: pick(HERO_CLASSES), rarity, level: 1, experience: 0, maxHealth: Math.round(65 * m), health: Math.round(65 * m), attack: Math.round(11 * m), defence: Math.round(4 * m), speed: rint(4, 8), equipment: [], recovering: null };
    this.state.heroes.push(hero);
    this.state.selectedHero = hero.id;
    this.log(`${hero.name}, a ${rarity.toLowerCase()} ${hero.class}, answers the call.`);
    this.touch(true);
  }
  startCombat(enemy, source = 'wild', chosenHeroId = null) {
    if (!enemy) return;
    const s = this.state;
    const hero = s.heroes.find(h => h.id === (chosenHeroId || s.selectedHero) && !h.recovering) || s.heroes.find(h => !h.recovering);
    if (!hero) { this.log(`${enemy.name} appears, but no ready hero stands against it.`); return; }
    const log = [`A ${enemy.name} approaches!`];
    let hp = enemy.hp;
    let heroHp = hero.health;
    let rounds = 0;
    const equipmentPower = s.equipment.reduce((t, item) => t + (item.level || 1) * .5, 0);
    const attack = hero.attack + hero.level * 2 + (this.fx().combat || 0) + s.research.military * 2 + equipmentPower;
    const defence = hero.defence + this.petBonus('combat') * 10;
    while (hp > 0 && heroHp > 0 && rounds < 28) {
      rounds++;
      const dealt = Math.max(1, Math.round(attack * (.8 + Math.random() * .4)));
      hp -= dealt;
      log.push(`${hero.name} strikes for ${dealt}.`);
      if (hp <= 0) break;
      const taken = Math.max(1, Math.round(enemy.attack * (.75 + Math.random() * .35) - defence * .45));
      heroHp -= taken;
      if (rounds <= 5) log.push(`${enemy.name} hits for ${taken}.`);
    }
    hero.health = Math.max(0, heroHp);
    if (hp <= 0) {
      const reward = { food: rint(9, 22), gold: rint(8, 20) };
      if (source !== 'world') reward.fur = rint(1, 4);
      if (enemy.boss) { reward.gems = rint(2, 6); reward.magicEssence = rint(3, 8); if (enemy.id === 'ancientDragon') reward.dragonScales = 3; }
      this.addResources(reward, `${enemy.name} defeated`);
      hero.experience += enemy.boss ? 40 : 12;
      hero.level = 1 + Math.floor(hero.experience / 45);
      hero.maxHealth += enemy.boss ? 3 : 1;
      hero.health = Math.min(hero.maxHealth, hero.health + Math.round(hero.maxHealth * .18));
      s.tracking.wins++;
      s.tracking.actions++;
      log.push(`${enemy.name} has been defeated.`);
      if (Math.random() < .14 && this.hasBuilding('monsterSanctuary')) { s.monsters.push({ name: enemy.name, bonus: 'Settlement production +3%' }); log.push(`${enemy.name} was calmed and sent to the sanctuary.`); }
      if (this.unlocked('ancientRuins') && Math.random() < .08) this.findRelic(false);
    } else {
      hero.recovering = s.clock + 60 * Math.max(1, 5 - (this.fx().recovery || 0) / 10);
      log.push(`${hero.name} falls back to recover. No one is lost.`);
    }
    log.slice(0, 11).forEach(line => this.log(line));
    if (!this.silent) this.touch(true);
  }
  fightWorldBoss(id) {
    const boss = BOSSES.find(x => x.id === id);
    if (boss && this.unlocked('worldBosses')) this.startCombat(boss, 'world');
  }
  finishHeroRecovery() {
    this.state.heroes.forEach(hero => {
      if (hero.recovering && hero.recovering <= this.state.clock) { hero.recovering = null; hero.health = hero.maxHealth; this.log(`${hero.name} has recovered.`); }
    });
  }

  // --- relics, blessings, pets, mounts, equipment -------------------------------------------
  findRelic(announce = true) {
    if (!this.unlocked('ancientRuins')) return false;
    const choices = RELICS.filter(r => !this.state.relics.includes(r.id));
    if (!choices.length) return false;
    const relic = pick(choices);
    this.state.relics.push(relic.id);
    this.state.tracking.relics++;
    this.log(announce ? `Discovery: ${relic.name} — ${relic.description}` : `A returning party carries ${relic.name}.`);
    return true;
  }
  upgradeBlessing(id) {
    if (!this.hasBuilding('temple')) return;
    const blessing = BLESSINGS.find(b => b.id === id);
    const level = this.blessingLevel(id);
    if (!blessing || level >= 5) return;
    const cost = { essence: 2 + level * 2, ancientDust: 1 + level };
    if (!this.spend(cost)) return this.notify(`A blessing needs ${this.describeCost(cost)}.`);
    this.state.blessings[id] = level + 1;
    this.log(`${blessing.name} blessing reaches level ${level + 1}.`);
    this.touch(true);
  }
  adoptPet(id) {
    const pet = PETS.find(p => p.id === id);
    if (!pet || this.state.pets.includes(id) || !this.unlocked('animalTracks')) return;
    const cost = { gold: 30, food: 20 };
    if (!this.spend(cost)) return this.notify(`Fostering a pet needs ${this.describeCost(cost)}.`);
    this.state.pets.push(id);
    this.state.petLevels[id] = 1;
    this.log(`${pet.name} now lives beside the fire.`);
    this.touch(true);
  }
  feedPet(id) {
    const pet = PETS.find(p => p.id === id);
    const level = this.state.petLevels[id] || 1;
    if (!pet || !this.state.pets.includes(id) || level >= 10) return;
    const cost = { food: 8 + level * 2, herbs: 1 };
    if (!this.spend(cost)) return this.notify(`Training ${pet.name} needs ${this.describeCost(cost)}.`);
    this.state.petLevels[id] = level + 1;
    this.log(`${pet.name} reaches companion level ${level + 1}.`);
    this.touch(true);
  }
  upgradeEquipment(index) {
    const item = this.state.equipment[index];
    if (!item || (item.level || 1) >= 10) return;
    const level = item.level || 1;
    const cost = { iron: level * 2, gold: level * 5 };
    if (!this.spend(cost)) return this.notify(`Improving ${item.name} needs ${this.describeCost(cost)}.`);
    item.level = level + 1;
    this.log(`${item.name} improves to level ${item.level}.`);
    this.touch(true);
  }
  acquireMount(id) {
    const mount = MOUNTS.find(m => m.id === id);
    if (!mount || this.state.mounts.includes(id) || !this.hasBuilding('stable')) return;
    const cost = { gold: 110, leather: 12, food: 30 };
    if (!this.spend(cost)) return this.notify(`This mount needs ${this.describeCost(cost)}.`);
    this.state.mounts.push(id);
    this.log(`${mount.name} has been trained for the road.`);
    this.touch(true);
  }

  // --- families (automatic) ----------------------------------------------------------------
  // Villagers pair up and have children by themselves when the settlement is doing well:
  // happy, fed, and with a free bed for the new arrival. Natural recruitment is unaffected.
  familyTick() {
    const s = this.state;
    if (!this.unlocked('villagerMgmt') || s.villagers.length < 2 || s.hunger > 0) return;
    const happiness = this.happinessInfo().value;
    if (happiness < 60) return;
    if (this.resource('food') < s.villagers.length * FOOD_PER_VILLAGER_DAY * 1.5) return;
    const waiting = s.families.reduce((t, f) => t + f.kids.length, 0);
    if (this.housing() - s.villagers.length - waiting <= 0) return;
    const single = s.villagers.filter(v => !v.family && !v.away);
    if (single.length >= 2 && Math.random() < .6) {
      const [one, two] = single;
      one.family = two.id;
      two.family = one.id;
      s.families.push({ id: `f-${s.nextUid++}`, members: [one.id, two.id], kids: [] });
      s.morale += 3;
      this.log(`${one.name} and ${two.name} have grown close and started a family.`);
      return;
    }
    const open = s.families.filter(f => f.kids.length < 3);
    if (open.length && Math.random() < Math.min(.9, .15 + (happiness - 50) / 100)) {
      const family = pick(open);
      const names = family.members.map(id => s.villagers.find(v => v.id === id)?.name).filter(Boolean);
      family.kids.push(s.clock);
      s.morale += 1;
      this.log(`A child is born${names.length ? ` to ${names.join(' and ')}` : ''}. They will join the workforce in a day.`);
    }
  }
  growKids() {
    const s = this.state;
    for (const family of s.families) {
      while (family.kids.length && family.kids[0] + CHILD_GROWTH_SECONDS <= s.clock && this.freeHousing() > 0) {
        family.kids.shift();
        const v = this.addVillager({ age: rint(16, 18), born: true });
        this.log(`${v.name} has grown up and joins the workforce.`);
      }
    }
  }
  childCount() { return this.state.families.reduce((t, f) => t + f.kids.length, 0); }

  // --- jobs (automatic) --------------------------------------------------------------------
  // Idle villagers take open job seats on their own, spreading across the available work and
  // heading for food first when the stores run low. The player may still change anyone's job.
  autoAssign() {
    const s = this.state;
    if (!s.autoHire || !this.unlocked('villagerMgmt')) return;
    const idle = s.villagers.filter(v => v.profession === 'idle' && !v.away);
    if (!idle.length) return;
    const hungry = this.resource('food') < s.villagers.length * FOOD_PER_VILLAGER_DAY * 1.5;
    for (const villager of idle) {
      let best = null;
      let bestScore = Infinity;
      AUTO_JOBS.forEach(([id, weight], index) => {
        const job = PROFESSION_BY_ID[id];
        if (!job) return;
        const seats = Number.isFinite(this.jobSlots(job)) ? this.jobSlots(job) : 2;
        const filled = s.villagers.filter(v => v.profession === id).length;
        if (seats <= 0 || filled >= seats) return;
        const score = filled / weight + index * .01 - (hungry && FOOD_JOBS.has(id) ? 100 : 0);
        if (score < bestScore) { bestScore = score; best = job; }
      });
      if (!best) break;
      villager.profession = best.id;
      if (!this.availableSchedules(villager).includes(villager.schedule)) villager.schedule = 'day';
      this.log(`${villager.name} takes up work as a ${best.name.toLowerCase()}.`);
    }
  }
  setAutoHire(on) {
    this.state.autoHire = !!on;
    this.log(on ? 'Idle villagers will now find work on their own.' : 'Auto-hire is off. Assign villagers yourself.');
    this.touch(true);
  }

  // --- trade -------------------------------------------------------------------------------
  marketItems() { return this.state.market.filter(item => this.isRevealed(item.resource) || ['wood', 'stone', 'food'].includes(item.resource)); }
  buyMerchant(itemId) {
    if (!this.unlocked('trading')) return;
    const item = this.state.market.find(x => x.id === itemId);
    if (!item) return;
    const cost = { [item.currency]: item.cost };
    if (!this.spend(cost)) return this.notify(`That offer costs ${item.cost} ${RESOURCE_BY_ID[item.currency].name}.`);
    this.addResources({ [item.resource]: item.amount }, 'Bought from merchant');
    this.touch(true);
  }
  sellPrice(resourceId, amount) {
    const bonus = (this.fx().trade || 0) / 100 + this.personalityBonus('trade') + this.countJob('merchant') * .03 + this.state.research.economy * .04;
    return Math.max(1, Math.floor(amount * (SELL_VALUES[resourceId] || .5) * (1 + bonus)));
  }
  sell(resourceId, amount = 10) {
    if (!this.unlocked('trading') || !SELL_VALUES[resourceId]) return;
    if (this.resource(resourceId) < amount) return this.notify(`You need ${amount} ${RESOURCE_BY_ID[resourceId]?.name || resourceId}.`);
    const value = this.sellPrice(resourceId, amount);
    this.state.resources[resourceId] = number(this.resource(resourceId) - amount);
    this.addResources({ gold: value }, `Sold ${amount} ${RESOURCE_BY_ID[resourceId].name}`);
    this.touch(true);
  }
  refreshMarket(quiet = false) {
    this.state.market = MERCHANT_ITEMS.map(item => ({ ...item, amount: Math.max(1, Math.round(item.amount * (.75 + Math.random() * .75))), cost: Math.max(1, Math.round(item.cost * (.8 + Math.random() * .5))) }));
    if (!quiet) this.log('The travelling merchant changes their stock.');
  }

  // --- treasure maps -----------------------------------------------------------------------
  useMap() {
    if (!this.unlocked('map') || this.resource('maps') < 1) return this.notify('You have no treasure map to follow.');
    this.state.resources.maps = number(this.resource('maps') - 1);
    const roll = Math.random();
    if (roll < .4) this.addResources({ gold: rint(40, 90), ancientCoins: rint(2, 6) }, 'A buried strongbox');
    else if (roll < .65) this.addResources({ [pick(['crystal', 'gems', 'mithril'])]: rint(2, 5) }, 'A rare vein');
    else if (roll < .8 && this.unlocked('ancientRuins') && this.findRelic()) { /* relic found */ }
    else if (roll < .92) {
      const free = PETS.filter(p => !this.state.pets.includes(p.id));
      if (free.length && this.unlocked('animalTracks')) { const pet = pick(free); this.state.pets.push(pet.id); this.state.petLevels[pet.id] = 1; this.log(`A pet egg hatches. ${pet.name} joins the settlement.`); }
      else this.addResources({ gold: rint(50, 100) }, 'A buried strongbox');
    } else { this.state.equipment.push({ name: pick(['Starfall Blade', 'Kingsbane Mail', 'Warden’s Crown', 'Hollow Moon Bow']), rarity: 'Legendary', level: 1 }); this.log('Legendary equipment was buried here.'); }
    this.state.tracking.actions++;
    this.touch(true);
  }

  // --- dungeons ----------------------------------------------------------------------------
  startDungeon() {
    if (!this.hasBuilding('dungeonEntrance')) return this.notify('A Dungeon Entrance must be opened first.');
    if (!this.resource('torch')) return this.notify('A torch is needed beneath the earth.');
    this.state.dungeon = { floor: 1, rooms: rint(2, 4), cleared: 0, treasure: 0 };
    this.log('You descend into the forgotten dungeon. The air is cold.');
    this.touch(true);
  }
  dungeonStep(choice) {
    const d = this.state.dungeon;
    if (!d) return;
    if (choice === 'retreat') { this.log('The party returns from the dungeon with what it found.'); this.state.dungeon = null; return this.touch(true); }
    if (this.resource('torch') < 1) return this.notify('The last torch gutters out. Retreat or bring more.');
    this.addResources({ torch: -1 });
    d.cleared++;
    if (Math.random() < .58 && this.readyHero()) this.startCombat(pick(ENEMIES.slice(5, Math.min(ENEMIES.length, 14 + d.floor))), 'dungeon');
    else {
      const reward = { gold: rint(12, 32), ancientDust: rint(1, 3), bones: rint(1, 5) };
      if (Math.random() < .2) reward.maps = 1;
      this.addResources(reward, 'Dungeon chamber searched');
      d.treasure++;
    }
    if (d.cleared >= d.rooms) {
      if (d.floor % 3 === 0 && this.readyHero()) this.startCombat(pick(BOSSES.slice(0, Math.min(3, 1 + d.floor / 3))), 'dungeon');
      d.floor++;
      d.rooms = rint(2, 4);
      d.cleared = 0;
      this.log(`A stair leads down to dungeon floor ${d.floor}.`);
    }
    this.touch(true);
  }

  // --- prestige ----------------------------------------------------------------------------
  prestige() {
    const total = this.totalBuildingLevels();
    if (!this.unlocked('prestige') || total < 45) return this.notify('A lasting legacy needs at least 45 total building levels.');
    const shards = Math.max(1, Math.floor((total - 25) / 15) + this.state.relics.length);
    const keep = this.state.relics.slice(0, Math.max(1, Math.floor(this.state.relics.length * .35)));
    const count = this.state.prestigeCount + 1;
    const total_shards = (this.state.resources.prestige || 0) + shards;
    this.state = createNewState();
    this.state.prestigeCount = count;
    this.state.resources.prestige = total_shards;
    this.state.lifetime.prestige = total_shards;
    this.state.relics = keep;
    if (keep.length) this.state.unlocks.ancientRuins = true;
    this.log(`The flame is rekindled. ${shards} Ember Shards remain from the old kingdom.`);
    this.save();
    this.emit();
  }

  // --- quests and achievements -------------------------------------------------------------
  questVisible(q) { return !q.needs || this.unlocked(q.needs); }
  progressQuest(quest) { return this.state.tracking[quest.metric] || 0; }
  claimQuest(id) {
    const quest = QUESTS.find(q => q.id === id);
    if (!quest || this.state.quests[id]) return;
    if (this.progressQuest(quest) < quest.target) return this.notify('That quest is not finished yet.');
    this.state.quests[id] = true;
    this.addResources(quest.reward, `Quest complete: ${quest.name}`);
    this.touch(true);
  }
  achievementVisible(a) {
    const gate = { relics: 'ancientRuins', wins: 'heroes', expedition: 'map' }[a.kind];
    return !gate || this.unlocked(gate);
  }
  achievementProgress(achievement) { return this.state.tracking[achievement.kind] || 0; }
  claimAchievement(id) {
    const achievement = ACHIEVEMENTS.find(a => a.id === id);
    if (!achievement || this.state.claimedAchievements.includes(id)) return;
    if (this.achievementProgress(achievement) < achievement.target) return this.notify('That achievement is not ready to claim.');
    this.state.claimedAchievements.push(id);
    this.addResources(achievement.reward, `Achievement: ${achievement.name}`);
    this.touch(true);
  }

  // --- saving ------------------------------------------------------------------------------
  save(manual = false) {
    try {
      this.state.lastSaved = Date.now();
      const previous = localStorage.getItem(SAVE_KEY);
      const text = JSON.stringify(this.state);
      if (previous) localStorage.setItem(BACKUP_KEY, previous);
      localStorage.setItem(SAVE_KEY, text);
      if (manual) this.log('Game saved.');
      return true;
    } catch {
      if (manual) this.log('Saving is unavailable in this browser.');
      return false;
    }
  }
  load() {
    for (const key of [SAVE_KEY, BACKUP_KEY]) {
      let raw = null;
      try { raw = localStorage.getItem(key); } catch { return createNewState(); }
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (!validateSave(parsed)) continue;
        // Keep an untouched copy of any pre-2.0 save before it is migrated.
        if ((Number(parsed.version) || 1) < 2) { try { if (!localStorage.getItem(ORIGINAL_KEY)) localStorage.setItem(ORIGINAL_KEY, raw); } catch { /* ignore */ } }
        const state = normaliseState(parsed);
        if (key === BACKUP_KEY) state.logs.unshift({ at: Date.now(), text: 'The latest save was damaged; an earlier save was restored.' });
        return state;
      } catch { /* try the backup */ }
    }
    return createNewState();
  }
  exportSave() { return JSON.stringify({ ...this.state, lastSaved: Date.now() }, null, 2); }
  importSave(text) {
    try {
      const candidate = JSON.parse(text);
      if (!validateSave(candidate) || !candidate.version) throw new Error('Invalid');
      this.state = normaliseState(candidate);
      this.checkUnlocks({ silent: true });
      this.applyOfflineProgress();
      this.log('Save imported successfully.');
      this.save();
      this.emit();
      return true;
    } catch { this.notify('That save file could not be read.'); return false; }
  }
  reset() {
    this.state = createNewState();
    try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(BACKUP_KEY); } catch { /* ignore */ }
    this.offlineReport = null;
    this.emit();
  }
}
