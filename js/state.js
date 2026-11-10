import {
  VERSION, RESOURCES, RESOURCE_BY_ID, PROFESSIONS, PERSONALITIES, BUILDINGS, BUILDING_BY_ID,
  REGIONS, ENEMIES, BOSSES, RELICS, BLESSINGS, HERO_CLASSES, HERO_RARITIES, PETS, MOUNTS,
  RECIPES, RESEARCH, QUESTS, ACHIEVEMENTS, MERCHANT_ITEMS, ACTIONS, NAMES
} from './data.js';

const SAVE_KEY = 'emberfall-save-v1';
const MAX_OFFLINE_MINUTES = 8 * 60;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const rint = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = list => list[Math.floor(Math.random() * list.length)];
const number = n => Number((n || 0).toFixed(3));
const effectTotal = (game, key) => Object.entries(game.state.buildings).reduce((total, [id, level]) => total + ((BUILDING_BY_ID[id]?.effect[key] || 0) * level), 0);

function defaultVillager() {
  return { id: `v-${Date.now()}-${Math.random()}`, name: 'Alden', profession: 'idle', personality: {name:'Hardworking',bonus:'production',value:.15}, productivity: 1, happiness: 70, experience: 0, skill: 1, family: null };
}

export function createNewState() {
  const resources = Object.fromEntries(RESOURCES.map(r => [r.id, r.start]));
  return {
    version: VERSION,
    lastSaved: Date.now(),
    resources,
    buildings: {campfire:1, smallHouse:1, storage:1},
    villagers: [defaultVillager()],
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
    tracking: {actions:0,builds:0,wins:0,relics:0,expedition:0,gatherWood:0,mineStone:0,buildSmallHouse:1,craftTorch:0},
    logs: [{at:Date.now(), text:'A small fire burns in the darkness.'}, {at:Date.now(), text:'Alden tends the embers. The settlement has begun.'}],
    selectedTab: 'Cave',
    selectedHero: null,
    expeditions: [],
    caveDepth: 0,
    dungeon: null,
    pendingEvent: null,
    nextRecruitment: Date.now() + 60000,
    nextEvent: Date.now() + rint(180,300) * 1000,
    nextWeather: Date.now() + 300000,
    weather: 'Sunny',
    season: 'Spring',
    seasonIndex: 0,
    morale: 0,
    merchantRefresh: Date.now() + 180000,
    market: MERCHANT_ITEMS.map(x => ({...x})),
    families: [],
    prestigeCount: 0,
    actionCooldowns: {},
    lastTick: Date.now()
  };
}

function normaliseState(value) {
  const fresh = createNewState();
  if (!value || typeof value !== 'object') return fresh;
  const merged = {...fresh, ...value};
  merged.version = VERSION;
  merged.resources = {...fresh.resources, ...(value.resources || {})};
  merged.buildings = {...fresh.buildings, ...(value.buildings || {})};
  merged.research = {...fresh.research, ...(value.research || {})};
  merged.tracking = {...fresh.tracking, ...(value.tracking || {})};
  merged.villagers = Array.isArray(value.villagers) ? value.villagers : fresh.villagers;
  merged.logs = Array.isArray(value.logs) ? value.logs.slice(0,50) : fresh.logs;
  merged.market = Array.isArray(value.market) && value.market.length ? value.market : fresh.market;
  for (const key of ['heroes','relics','pets','mounts','monsters','equipment','expeditions','families','claimedAchievements']) if (!Array.isArray(merged[key])) merged[key] = [];
  if (!merged.quests || typeof merged.quests !== 'object') merged.quests = {};
  if (!merged.blessings || typeof merged.blessings !== 'object') merged.blessings = {};
  if (!merged.petLevels || typeof merged.petLevels !== 'object') merged.petLevels = {};
  if (!merged.actionCooldowns || typeof merged.actionCooldowns !== 'object') merged.actionCooldowns = {};
  return merged;
}

export class Game {
  constructor() {
    this.listeners = new Set();
    this.state = this.load();
    this.applyOfflineProgress();
    this.checkUnlocks();
  }

  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit() { this.listeners.forEach(listener => listener(this.state)); }
  touch(save = false) { this.checkUnlocks(); if (save) this.save(); this.emit(); }
  log(text) { this.state.logs.unshift({at:Date.now(),text}); this.state.logs = this.state.logs.slice(0,50); }
  resource(id) { return this.state.resources[id] || 0; }
  totalBuildingLevels() { return Object.values(this.state.buildings).reduce((a,b)=>a+b,0); }
  totalResearch() { return Object.values(this.state.research).reduce((a,b)=>a+b,0); }
  buildingLevel(id) { return this.state.buildings[id] || 0; }
  unlockedBuilding(building) {
    const total = this.totalBuildingLevels();
    return ({Basic:true, Advanced:total >= 6, Estate:total >= 14, Royal:total >= 24, Arcane:total >= 35})[building.tier] || false;
  }
  storageCap() { return 350 + effectTotal(this, 'storage'); }
  housing() { return 1 + effectTotal(this, 'housing'); }
  usedHousing() { return this.state.villagers.length; }
  hasBuilding(id) { return this.buildingLevel(id) > 0; }
  format(n) { return Math.abs(n) >= 1000 ? Math.floor(n).toLocaleString() : (Math.floor(n * 10) / 10).toString(); }
  costWithMultiplier(cost, multiplier = 1) {
    const discount = 1 - (this.blessingLevel('buildDiscount') * .015);
    return Object.fromEntries(Object.entries(cost).filter(([id, amt]) => RESOURCE_BY_ID[id] && amt > 0).map(([id, amt]) => [id, Math.ceil(amt * multiplier * discount)]));
  }
  canAfford(cost) { return Object.entries(cost).every(([id,amount]) => this.resource(id) >= amount); }
  spend(cost) { if (!this.canAfford(cost)) return false; Object.entries(cost).forEach(([id,amount]) => this.state.resources[id] = number(this.resource(id) - amount)); return true; }
  addResources(rewards, reason = '') {
    const cap = this.storageCap();
    const chunks = [];
    Object.entries(rewards).forEach(([id, amount]) => {
      if (!RESOURCE_BY_ID[id] || !Number.isFinite(amount) || !amount) return;
      const before = this.resource(id);
      const after = amount > 0 && !['gold','silver','research','prestige'].includes(id) ? Math.min(cap, before + amount) : Math.max(0, before + amount);
      this.state.resources[id] = number(after);
      const gained = after - before;
      if (gained > .04) chunks.push(`${gained >= 10 ? Math.floor(gained) : gained.toFixed(1)} ${RESOURCE_BY_ID[id].name}`);
    });
    if (reason && chunks.length) this.log(`${reason}: +${chunks.join(', +')}.`);
  }
  buildingCost(building) {
    const level = this.buildingLevel(building.id);
    return this.costWithMultiplier(building.cost, Math.pow(1.42, Math.max(0, level - (level ? 0 : 0))));
  }
  buildingCostText(building) { return this.describeCost(this.buildingCost(building)); }
  describeCost(cost) { const entries = Object.entries(cost); return entries.length ? entries.map(([id,n]) => `${n} ${RESOURCE_BY_ID[id]?.name || id}`).join(', ') : 'No materials'; }
  blessingLevel(id) { return this.state.blessings[id] || 0; }
  personalityBonus(key) { return this.state.villagers.filter(v => v.personality?.bonus === key).reduce((total,v) => total + (v.personality?.value || 0),0); }
  relicBonus(key) { return this.state.relics.reduce((total,id) => { const relic = RELICS.find(r=>r.id===id); return total + (relic?.kind===key || relic?.kind==='all' ? relic.value : 0); },0) / 100; }
  petBonus(key) {
    const names = this.state.pets.map(id => PETS.find(x=>x.id===id)?.name);
    const map = {explore:['Fox','Griffin'],hunt:['Wolf'],research:['Owl'],mine:['Baby Dragon'],rare:['Shadow Panther'],travel:['Griffin'],combat:['Baby Wyvern'],food:['Rabbit'],herbs:['Forest Sprite']};
    return (map[key] || []).filter(name => names.includes(name)).reduce((total, name) => {
      const pet = PETS.find(x=>x.name===name);
      return total + .1 + Math.max(0, (this.state.petLevels[pet?.id] || 1) - 1) * .01;
    }, 0);
  }
  getStats() {
    const production = Object.fromEntries(RESOURCES.map(r=>[r.id,0]));
    const hourly = {}; let guard = 0;
    for (const villager of this.state.villagers) {
      const job = PROFESSIONS.find(p => p.id === villager.profession) || PROFESSIONS[0];
      const jobMultiplier = (villager.productivity || 1) * (1 + (villager.personality?.bonus === 'production' ? villager.personality.value : 0));
      Object.entries(job.production).forEach(([id, amount]) => production[id] += amount * jobMultiplier);
      if (villager.profession === 'guard') guard += 1;
    }
    for (const resource of RESOURCES) production[resource.id] += effectTotal(this, resource.id);
    const allProduction = 1 + effectTotal(this,'production') / 100 + this.relicBonus('production') + this.state.monsters.length * .03;
    production.wood *= allProduction * (1 + this.relicBonus('wood'));
    production.stone *= allProduction * (1 + this.relicBonus('stone'));
    production.food *= allProduction * (1 + this.relicBonus('farm') + this.petBonus('food'));
    production.iron *= allProduction * (1 + this.relicBonus('iron') + this.petBonus('mine'));
    production.coal *= allProduction * (1 + this.relicBonus('coal'));
    production.herbs *= allProduction * (1 + this.relicBonus('herbs') + this.petBonus('herbs'));
    production.research *= 1 + this.personalityBonus('research') + this.relicBonus('research') + this.petBonus('research') + effectTotal(this,'research') / 100;
    if (this.state.weather === 'Rainy') { production.food *= 1.15; production.wood *= .9; }
    if (this.state.weather === 'Snowy') { production.food *= .78; production.fur *= 1.18; }
    if (this.state.weather === 'Stormy') { production.wood *= .8; production.water *= 1.25; }
    if (this.state.season === 'Summer') production.food *= 1.1;
    if (this.state.season === 'Winter') { production.food *= .8; production.fur *= 1.15; }
    const foodUse = this.state.villagers.length * .45;
    production.food -= foodUse;
    const happiness = clamp(65 + this.state.morale + effectTotal(this,'happiness') - (this.resource('food') < this.state.villagers.length * 4 ? 15 : 0), 5, 100);
    hourly.guard = guard + effectTotal(this,'guard');
    hourly.combat = effectTotal(this,'combat') + guard * 2;
    hourly.happiness = happiness;
    hourly.housing = this.housing();
    hourly.recruitChance = this.recruitChance(happiness);
    hourly.travel = effectTotal(this,'travel') + this.petBonus('travel') * 100;
    return {production, foodUse, happiness, guard:hourly.guard, combat:hourly.combat, recruitChance:hourly.recruitChance, travel:hourly.travel};
  }
  recruitChance(happiness = this.getStats().happiness) {
    return Math.min(40, 25 + Math.max(0, this.buildingLevel('smallHouse') - 1) * 2 + effectTotal(this,'recruit') + (happiness > 80 ? 5 : 0) + this.blessingLevel('recruitment') * 2 + this.relicBonus('recruit') * 100);
  }
  tick(now = Date.now()) {
    const last = this.state.lastTick || now;
    const seconds = clamp((now - last) / 1000, 0, 15);
    this.state.lastTick = now;
    if (seconds) {
      const stats = this.getStats();
      const rewards = {};
      Object.entries(stats.production).forEach(([id, rate]) => rewards[id] = rate * seconds / 60);
      this.addResources(rewards);
      this.finishExpeditions(now);
      this.finishHeroRecovery(now);
      if (now >= this.state.nextRecruitment) { this.tryRecruit(); this.state.nextRecruitment = now + 60000; }
      if (now >= this.state.nextEvent) { this.generateRandomEvent(); this.state.nextEvent = now + rint(180,300) * 1000; }
      if (now >= this.state.nextWeather) this.changeWeather(now);
      if (now >= this.state.merchantRefresh) { this.refreshMarket(); this.state.merchantRefresh = now + 180000; }
      Object.entries(this.state.actionCooldowns).forEach(([id,until]) => { if (until <= now) delete this.state.actionCooldowns[id]; });
    }
    this.checkUnlocks();
    this.emit();
  }
  applyOfflineProgress() {
    const elapsedMinutes = Math.min(MAX_OFFLINE_MINUTES, Math.max(0, (Date.now() - (this.state.lastSaved || Date.now())) / 60000));
    if (elapsedMinutes < .1) return;
    const stats = this.getStats();
    const rewards = {};
    Object.entries(stats.production).forEach(([id, rate]) => rewards[id] = rate * elapsedMinutes);
    this.addResources(rewards);
    const opportunities = Math.floor(elapsedMinutes);
    let arrivals = 0;
    for (let i=0; i<opportunities && this.usedHousing() < this.housing(); i++) if (Math.random() < stats.recruitChance / 100) { this.addVillager(); arrivals++; }
    const completed = this.state.expeditions.filter(x => x.endsAt <= Date.now()).length;
    this.finishExpeditions(Date.now());
    this.log(`Welcome back. ${Math.floor(elapsedMinutes)} minutes passed${arrivals ? `; ${arrivals} traveller${arrivals>1?'s':''} settled` : ''}${completed ? `; ${completed} expedition${completed>1?'s':''} returned` : ''}.`);
    this.state.lastTick = Date.now();
  }
  doAction(actionId) {
    const action = ACTIONS[actionId];
    if (!action) return;
    if (this.state.actionCooldowns[actionId] > Date.now()) return this.notify('You need a moment before doing that again.');
    const rewards = {...action.rewards};
    const bonusKey = actionId === 'gather' ? 'wood' : actionId === 'hunt' ? 'hunt' : actionId.includes('mine') ? 'mine' : actionId === 'caveExplore' ? 'explore' : actionId;
    const mult = 1 + this.relicBonus(bonusKey) + this.petBonus(bonusKey) + this.blessingLevel(bonusKey) * .05;
    if (rewards.torch && this.resource('torch') < Math.abs(rewards.torch)) return this.notify('You need a torch for that descent.');
    Object.keys(rewards).forEach(key => rewards[key] *= rewards[key] > 0 ? mult : 1);
    if (Math.random() < .08 + this.blessingLevel('doubleGain') * .03) Object.keys(rewards).forEach(key => { if (rewards[key] > 0) rewards[key] *= 2; });
    if (actionId === 'caveExplore') {
      this.state.caveDepth += 1;
      if (Math.random() < .18) this.findRelic();
      if (Math.random() < .22) this.startCombat(pick(ENEMIES.slice(0, 10)), 'cave');
    }
    if (actionId === 'forestTreasure' && Math.random() < .22) { rewards.maps = (rewards.maps || 0) + 1; }
    if (actionId === 'hunt' && Math.random() < .25) this.startCombat(pick(ENEMIES.slice(0, 8)), 'hunt');
    this.addResources(rewards, action.name);
    this.state.actionCooldowns[actionId] = Date.now() + action.cooldown * 1000;
    this.state.tracking.actions++;
    if (actionId === 'gather') this.state.tracking.gatherWood += rewards.wood || 0;
    if (actionId === 'mineStone') this.state.tracking.mineStone += rewards.stone || 0;
    this.touch(true);
  }
  build(id) {
    const building = BUILDING_BY_ID[id];
    if (!building || !this.unlockedBuilding(building)) return this.notify('That knowledge is still beyond the settlement.');
    const level = this.buildingLevel(id);
    if (level >= 10) return this.notify(`${building.name} is already at its finest level.`);
    const cost = this.buildingCost(building);
    if (!this.spend(cost)) return this.notify(`Not enough materials: ${this.describeCost(cost)}.`);
    this.state.buildings[id] = level + 1;
    this.state.tracking.builds++;
    if (id === 'smallHouse') this.state.tracking.buildSmallHouse++;
    this.log(`${level ? `${building.name} improved to level ${level + 1}` : `${building.name} constructed`}.`);
    this.touch(true);
  }
  addVillager() {
    const name = pick(NAMES); const personality = {...pick(PERSONALITIES)};
    const villager = {id:`v-${Date.now()}-${Math.random()}`,name,profession:'idle',personality,productivity:number(.9 + Math.random()*.25),happiness:rint(65,85),experience:0,skill:1,family:null};
    this.state.villagers.push(villager);
    this.log(`${name}, a ${personality.name.toLowerCase()} traveller, joins the fire.`);
    return villager;
  }
  tryRecruit() {
    if (this.usedHousing() >= this.housing() || this.state.pendingEvent) return;
    const chance = this.recruitChance();
    if (Math.random() * 100 < chance) {
      const prospect = {name:pick(NAMES),personality:pick(PERSONALITIES)};
      this.state.pendingEvent = {kind:'traveller',title:'A traveller approaches',body:`${prospect.name} is looking for a warm place to stay. They seem ${prospect.personality.name.toLowerCase()}.`,prospect};
      this.log('A traveller waits at the edge of the light.');
    }
  }
  resolveEvent(choice) {
    const event = this.state.pendingEvent;
    if (!event) return;
    if (event.kind === 'traveller') {
      if (choice === 'accept' && this.usedHousing() < this.housing()) {
        const villager = this.addVillager(); villager.name = event.prospect.name; villager.personality = {...event.prospect.personality};
      } else this.log('The traveller nods, then returns to the road.');
    } else if (event.kind === 'merchant') {
      if (choice === 'accept') { this.addResources(event.reward, 'The merchant’s gift'); this.state.morale += 2; }
      else this.log('The merchant packs their curious wares and leaves.');
    } else if (event.kind === 'festival') {
      if (choice === 'accept') { if (this.spend({food:20,gold:10})) { this.state.morale += 12; this.log('Lanterns glow around a lively festival.'); } else this.log('There is not enough to hold the festival.'); }
    } else if (event.kind === 'chest') {
      if (choice === 'accept') { this.addResources(event.reward, 'Ancient chest opened'); if (Math.random()<.45) this.findRelic(); }
    } else if (event.kind === 'threat') {
      if (choice === 'accept') this.startCombat(pick(ENEMIES.slice(0,12)), 'event'); else { this.addResources({food:-8}, 'The pack takes supplies'); this.log('The wolves melt back into the trees with some provisions.'); }
    }
    this.state.pendingEvent = null;
    this.touch(true);
  }
  generateRandomEvent() {
    if (this.state.pendingEvent) return;
    const kind = pick(['merchant','festival','chest','threat']);
    const events = {
      merchant:{kind,title:'A curious merchant visits',body:'Their wagon carries a little of everything. Accept a small trade-gift?',reward:{gold:10,herbs:4}},
      festival:{kind,title:'A quiet festival begins',body:'The villagers ask for 20 food and 10 gold to share a proper celebration.'},
      chest:{kind,title:'An ancient chest is uncovered',body:'Roots have held this lockbox shut for ages. Open it?',reward:{gold:35,ancientCoins:3,crystal:1}},
      threat:{kind,title:'A wolf pack circles the firelight',body:'Your guards can drive them away, or you can lose a little food and stay inside.'}
    };
    this.state.pendingEvent = events[kind]; this.log(`${events[kind].title}.`);
  }
  changeWeather(now) {
    this.state.weather = pick(['Sunny','Rainy','Snowy','Stormy','Foggy']);
    this.state.seasonIndex = (this.state.seasonIndex + 1) % 4;
    this.state.season = ['Spring','Summer','Autumn','Winter'][this.state.seasonIndex];
    this.growChildren(false);
    this.state.nextWeather = now + 300000;
    this.log(`The season turns to ${this.state.season}; the weather is ${this.state.weather.toLowerCase()}.`);
  }
  assignVillager(villagerId, profession) {
    const villager = this.state.villagers.find(v=>v.id===villagerId);
    if (!villager || !PROFESSIONS.some(x=>x.id===profession)) return;
    villager.profession = profession; villager.experience += 1; villager.skill = 1 + Math.floor(villager.experience/20);
    this.log(`${villager.name} is now a ${PROFESSIONS.find(x=>x.id===profession).name}.`);
    this.touch(true);
  }
  research(branch) {
    const level = this.state.research[branch];
    const entries = RESEARCH[branch];
    if (!entries || level >= entries.length) return this.notify('That field has reached its current limit.');
    const cost = {research: 8 + level * 9, gold: 10 + level * 12};
    if (!this.spend(cost)) return this.notify(`Research requires ${this.describeCost(cost)}.`);
    this.state.research[branch]++;
    this.log(`Research completed: ${entries[level]}.`);
    this.touch(true);
  }
  craft(recipeId) {
    const recipe = RECIPES.find(x=>x.id===recipeId);
    if (!recipe) return;
    if (this.totalResearch() < recipe.unlock) return this.notify('More research is needed to understand that recipe.');
    const isSimple = ['torch','travelRations','leather'].includes(recipe.id);
    if (!isSimple && !this.hasBuilding('workshop')) return this.notify('A Workshop is required for that craft.');
    let cost = {...recipe.cost};
    const discount = 1 - this.blessingLevel('craftDiscount')*.02 - this.personalityBonus('craft');
    Object.keys(cost).forEach(id => cost[id] = Math.max(1, Math.ceil(cost[id]*discount)));
    if (!this.spend(cost)) return this.notify(`Crafting needs ${this.describeCost(cost)}.`);
    if (recipe.result.equipment) { this.state.equipment.push({name:recipe.result.equipment,rarity:this.rarity(),level:1}); this.log(`Crafted ${recipe.result.equipment}.`); }
    else { this.addResources(recipe.result, `Crafted ${recipe.name}`); }
    if (recipe.id === 'torch') this.state.tracking.craftTorch += recipe.result.torch || 0;
    this.state.tracking.actions++;
    this.touch(true);
  }
  startExpedition(regionId) {
    const region = REGIONS.find(x=>x.id===regionId);
    if (!region) return;
    if (this.totalBuildingLevels() < region.unlock) return this.notify(`Requires ${region.unlock} total building levels.`);
    if (!this.state.heroes.length && this.state.villagers.length < 2) return this.notify('Recruit a hero or grow the village before sending an expedition.');
    const max = 1 + Math.floor(effectTotal(this,'travel')/10);
    if (this.state.expeditions.length >= max) return this.notify('All available parties are already travelling.');
    const hero = this.state.heroes.find(h=>!h.recovering && !this.state.expeditions.some(e=>e.heroId===h.id));
    const durationMs = region.duration * 60000 * (1 - clamp(this.getStats().travel/100,0,.45));
    this.state.expeditions.push({id:`e-${Date.now()}`,regionId,heroId:hero?.id||null,startedAt:Date.now(),endsAt:Date.now()+durationMs});
    this.log(`${hero?.name || 'A village party'} leaves for ${region.name}.`);
    this.touch(true);
  }
  finishExpeditions(now) {
    const done = this.state.expeditions.filter(e=>e.endsAt <= now);
    if (!done.length) return;
    this.state.expeditions = this.state.expeditions.filter(e=>e.endsAt > now);
    done.forEach(expedition => {
      const region = REGIONS.find(r=>r.id===expedition.regionId);
      const mult = 1 + this.personalityBonus('explore') + this.relicBonus('explore') + this.petBonus('explore') + this.blessingLevel('exploration')*.05;
      const rewards = {gold:rint(10,25)*mult,food:rint(8,22)*mult};
      pick(region.rewards) && (rewards[pick(region.rewards)] = rint(2,7)*mult);
      if (Math.random()<.22) rewards.maps = 1;
      if (Math.random()<.16) this.findRelic(false);
      this.addResources(rewards, `Expedition returned from ${region.name}`);
      this.state.tracking.expedition++;
      this.state.tracking.actions++;
      if (Math.random()<.38 && expedition.heroId) this.startCombat(ENEMIES.find(x=>x.id===region.enemy) || pick(ENEMIES), 'expedition', expedition.heroId);
    });
    this.touch(true);
  }
  recruitHero() {
    const cost = {gold:60 + this.state.heroes.length*35, food:25};
    if (!this.spend(cost)) return this.notify(`A hero answers for ${this.describeCost(cost)}.`);
    const rarity = this.rarity(); const multiplier = {Common:1,Uncommon:1.15,Rare:1.35,Epic:1.6,Legendary:2,Mythical:2.5}[rarity];
    const hero = {id:`h-${Date.now()}-${Math.random()}`,name:pick(NAMES),class:pick(HERO_CLASSES),rarity,level:1,experience:0,maxHealth:Math.round(65*multiplier),health:Math.round(65*multiplier),attack:Math.round(11*multiplier),defence:Math.round(4*multiplier),speed:rint(4,8),equipment:[],recovering:null};
    this.state.heroes.push(hero); this.state.selectedHero = hero.id;
    this.log(`${hero.name}, a ${rarity.toLowerCase()} ${hero.class}, answers the call.`);
    this.touch(true);
  }
  rarity() { const roll=Math.random()*100; return roll<50?'Common':roll<75?'Uncommon':roll<90?'Rare':roll<97?'Epic':roll<99.4?'Legendary':'Mythical'; }
  startCombat(enemy, source = 'wild', chosenHeroId = null) {
    if (!enemy) return;
    const hero = this.state.heroes.find(h=>h.id===(chosenHeroId || this.state.selectedHero) && !h.recovering) || this.state.heroes.find(h=>!h.recovering);
    if (!hero) { this.log(`${enemy.name} appears, but no ready hero stands against it.`); return this.notify('A ready hero is needed for combat.'); }
    const log = [`A ${enemy.name} approaches!`]; let hp = enemy.hp; let heroHp = hero.health; let rounds = 0;
    const equipmentPower = this.state.equipment.reduce((total,item) => total + (item.level || 1) * .5, 0);
    const attack = hero.attack + hero.level*2 + effectTotal(this,'combat') + equipmentPower;
    const defence = hero.defence + this.petBonus('combat')*10;
    while (hp > 0 && heroHp > 0 && rounds < 28) {
      rounds++; const dealt = Math.max(1, Math.round(attack * (.8+Math.random()*.4))); hp -= dealt;
      log.push(`${hero.name} strikes for ${dealt}.`); if (hp <= 0) break;
      const taken = Math.max(1, Math.round(enemy.attack * (.75+Math.random()*.35) - defence*.45)); heroHp -= taken;
      if (rounds <= 5) log.push(`${enemy.name} hits for ${taken}.`);
    }
    hero.health = Math.max(0,heroHp);
    if (hp <= 0) {
      const reward = {food:rint(9,22),gold:rint(8,20),experience:0};
      if (source !== 'world') reward.fur = rint(1,4);
      if (enemy.boss) { reward.gems=rint(2,6); reward.magicEssence=rint(3,8); reward.dragonScales=enemy.id==='ancientDragon'?3:0; }
      delete reward.experience; this.addResources(reward, `${enemy.name} defeated`);
      hero.experience += enemy.boss ? 40 : 12; hero.level = 1 + Math.floor(hero.experience/45); hero.maxHealth += enemy.boss ? 3:1; hero.health = Math.min(hero.maxHealth,hero.health+Math.round(hero.maxHealth*.18));
      this.state.tracking.wins++; this.state.tracking.actions++; log.push(`${enemy.name} has been defeated.`);
      if (Math.random() < .14 && this.hasBuilding('monsterSanctuary')) { this.state.monsters.push({name:enemy.name,bonus:'Settlement production +3%'}); log.push(`${enemy.name} was calmed and sent to the sanctuary.`); }
      if (Math.random() < .08) this.findRelic(false);
    } else {
      hero.recovering = Date.now() + (60000 * Math.max(1, 5 - effectTotal(this,'recovery')/10));
      log.push(`${hero.name} falls back to recover. No one is lost.`);
    }
    log.slice(0,11).forEach(line=>this.log(line));
    this.touch(true);
  }
  fightWorldBoss(id) { const boss=BOSSES.find(x=>x.id===id); if (boss) this.startCombat(boss,'world'); }
  finishHeroRecovery(now) { this.state.heroes.forEach(hero => { if (hero.recovering && hero.recovering <= now) { hero.recovering=null; hero.health=hero.maxHealth; this.log(`${hero.name} has recovered.`); } }); }
  findRelic(announce = true) {
    const choices = RELICS.filter(r=>!this.state.relics.includes(r.id));
    if (!choices.length) return;
    const relic = pick(choices); this.state.relics.push(relic.id); this.state.tracking.relics++;
    if (announce) this.log(`Discovery: ${relic.name} — ${relic.description}`); else this.log(`A returning party carries ${relic.name}.`);
  }
  upgradeBlessing(id) {
    const blessing = BLESSINGS.find(b=>b.id===id); const level = this.blessingLevel(id); if (!blessing || level>=5) return;
    const cost = {essence:2+level*2, ancientDust:1+level};
    if (!this.spend(cost)) return this.notify(`A blessing needs ${this.describeCost(cost)}.`);
    this.state.blessings[id] = level+1; this.log(`${blessing.name} blessing reaches level ${level+1}.`); this.touch(true);
  }
  adoptPet(id) {
    const pet=PETS.find(p=>p.id===id); if (!pet || this.state.pets.includes(id)) return;
    const cost={gold:30,food:20}; if (!this.spend(cost)) return this.notify(`Fostering a pet needs ${this.describeCost(cost)}.`);
    this.state.pets.push(id); this.state.petLevels[id] = 1; this.log(`${pet.name} now lives beside the fire.`); this.touch(true);
  }
  feedPet(id) {
    const pet=PETS.find(p=>p.id===id); const level=this.state.petLevels[id] || 1;
    if (!pet || !this.state.pets.includes(id) || level>=10) return;
    const cost={food:8+level*2,herbs:1}; if (!this.spend(cost)) return this.notify(`Training ${pet.name} needs ${this.describeCost(cost)}.`);
    this.state.petLevels[id] = level + 1; this.log(`${pet.name} reaches companion level ${level + 1}.`); this.touch(true);
  }
  upgradeEquipment(index) {
    const item=this.state.equipment[index]; if (!item || (item.level || 1)>=10) return;
    const level=item.level || 1; const cost={iron:level*2,gold:level*5};
    if (!this.spend(cost)) return this.notify(`Improving ${item.name} needs ${this.describeCost(cost)}.`);
    item.level=level+1; this.log(`${item.name} improves to level ${item.level}.`); this.touch(true);
  }
  acquireMount(id) {
    const mount=MOUNTS.find(m=>m.id===id); if (!mount || this.state.mounts.includes(id)) return;
    const cost={gold:110,leather:12,food:30}; if (!this.spend(cost)) return this.notify(`This mount needs ${this.describeCost(cost)}.`);
    this.state.mounts.push(id); this.log(`${mount.name} has been trained for the road.`); this.touch(true);
  }
  joinFamily() {
    const unpaired=this.state.villagers.filter(v=>!v.family); if (unpaired.length<2) return this.notify('Two unpaired villagers need time to become friends.');
    const [one,two]=unpaired; one.family=two.id; two.family=one.id; const family={id:`f-${Date.now()}`,members:[one.id,two.id],children:0}; this.state.families.push(family); this.state.morale+=5;
    this.log(`${one.name} and ${two.name} have formed a family.`); this.touch(true);
  }
  welcomeChild(familyId) {
    const family=this.state.families.find(f=>f.id===familyId); if (!family) return; const cost={food:15}; if (!this.spend(cost)) return this.notify('The family needs 15 food to prepare.');
    family.children++; this.state.morale+=2; this.log('A child is born into the settlement. They will grow into a villager after the next season.'); this.touch(true);
  }
  growChildren(announce = true) {
    let grown = 0;
    this.state.families.forEach(f=>{ while(f.children>0 && this.usedHousing()<this.housing()) { f.children--; this.addVillager(); grown++; } });
    if (grown) this.log(`${grown} child${grown>1?'ren have':' has'} grown into adulthood.`);
    if (announce) this.touch(true);
  }
  buyMerchant(itemId) {
    const item=this.state.market.find(x=>x.id===itemId); if (!item) return; const cost={[item.currency]:item.cost};
    if (!this.spend(cost)) return this.notify(`That offer costs ${item.cost} ${RESOURCE_BY_ID[item.currency].name}.`);
    this.addResources({[item.resource]:item.amount},`Bought from merchant`); this.touch(true);
  }
  sell(resourceId, amount=10) {
    if (!RESOURCE_BY_ID[resourceId] || this.resource(resourceId)<amount) return this.notify(`You need ${amount} ${RESOURCE_BY_ID[resourceId]?.name || resourceId}.`);
    const value=Math.max(1, Math.floor(amount * (resourceId==='wood'||resourceId==='food'? .28 : .55) * (1+effectTotal(this,'trade')/100+this.personalityBonus('trade'))));
    this.state.resources[resourceId]-=amount; this.addResources({gold:value},`Sold ${amount} ${RESOURCE_BY_ID[resourceId].name}`); this.touch(true);
  }
  refreshMarket() { this.state.market = MERCHANT_ITEMS.map(item => ({...item,amount:Math.round(item.amount*(.75+Math.random()*.75)),cost:Math.max(1,Math.round(item.cost*(.8+Math.random()*.5)))})); this.log('The travelling merchant changes their stock.'); }
  startDungeon() {
    if (!this.hasBuilding('dungeonEntrance')) return this.notify('A Dungeon Entrance must be opened first.');
    if (!this.resource('torch')) return this.notify('A torch is needed beneath the earth.');
    this.state.dungeon={floor:1,rooms:rint(2,4),cleared:0,treasure:0}; this.log('You descend into the forgotten dungeon. The air is cold.'); this.touch(true);
  }
  dungeonStep(choice) {
    const d=this.state.dungeon; if (!d) return; if (choice==='retreat') { this.log('The party returns from the dungeon with what it found.'); this.state.dungeon=null; return this.touch(true); }
    if (this.resource('torch')<1) return this.notify('The last torch gutters out. Retreat or bring more.');
    this.addResources({torch:-1}); d.cleared++;
    if (Math.random()<.58) this.startCombat(pick(ENEMIES.slice(5,Math.min(ENEMIES.length,14+d.floor))), 'dungeon');
    else { const reward={gold:rint(12,32),ancientDust:rint(1,3),bones:rint(1,5)}; if(Math.random()<.2) reward.maps=1; this.addResources(reward,'Dungeon chamber searched'); d.treasure++; }
    if (d.cleared>=d.rooms) { if (d.floor%3===0) this.startCombat(pick(BOSSES.slice(0,Math.min(3,1+d.floor/3))), 'dungeon'); d.floor++; d.rooms=rint(2,4); d.cleared=0; this.log(`A stair leads down to dungeon floor ${d.floor}.`); }
    this.touch(true);
  }
  prestige() {
    const total = this.totalBuildingLevels(); if (total < 45) return this.notify('A lasting legacy needs at least 45 total building levels.');
    const shards = Math.max(1,Math.floor((total-25)/15) + this.state.relics.length);
    const savedRelics=[...this.state.relics.slice(0,Math.max(1,Math.floor(this.state.relics.length*.35)))]; const count=this.state.prestigeCount+1;
    this.state=createNewState(); this.state.prestigeCount=count; this.state.resources.prestige=shards; this.state.relics=savedRelics; this.log(`The flame is rekindled. ${shards} Ember Shards remain from the old kingdom.`); this.save(); this.emit();
  }
  progressQuest(quest) { return this.state.tracking[quest.metric] || 0; }
  claimQuest(id) { const quest=QUESTS.find(q=>q.id===id); if(!quest || this.state.quests[id]) return; if(this.progressQuest(quest)<quest.target) return this.notify('That quest is not finished yet.'); this.state.quests[id]=true; this.addResources(quest.reward,`Quest complete: ${quest.name}`); this.touch(true); }
  achievementProgress(achievement) { return this.state.tracking[achievement.kind] || 0; }
  claimAchievement(id) { const achievement=ACHIEVEMENTS.find(a=>a.id===id); if(!achievement || this.state.claimedAchievements.includes(id)) return; if(this.achievementProgress(achievement)<achievement.target) return this.notify('That achievement is not ready to claim.'); this.state.claimedAchievements.push(id); this.addResources(achievement.reward,`Achievement: ${achievement.name}`); this.touch(true); }
  notify(message) { this.log(message); this.emit(); }
  checkUnlocks() {
    this.state.villagers.forEach(v=> { if(v.experience >= v.skill*20) v.skill++; });
  }
  save() { try { this.state.lastSaved=Date.now(); localStorage.setItem(SAVE_KEY,JSON.stringify(this.state)); this.log('Game saved.'); return true; } catch { this.log('Saving is unavailable in this browser.'); return false; } }
  load() { try { return normaliseState(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch { return createNewState(); } }
  exportSave() { return JSON.stringify({...this.state,lastSaved:Date.now()},null,2); }
  importSave(text) { try { const candidate=JSON.parse(text); if (!candidate || !candidate.resources || !candidate.version) throw new Error('Invalid'); this.state=normaliseState(candidate); this.applyOfflineProgress(); this.log('Save imported successfully.'); this.save(); this.emit(); return true; } catch { this.notify('That save file could not be read.'); return false; } }
  reset() { this.state=createNewState(); try { localStorage.removeItem(SAVE_KEY); } catch {} this.emit(); }
}
