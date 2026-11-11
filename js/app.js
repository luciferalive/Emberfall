import { Game } from './state.js';
import {
  RESOURCES, PROFESSIONS, BUILDINGS, REGIONS, ENEMIES, BOSSES, RELICS, BLESSINGS,
  PETS, MOUNTS, RECIPES, RESEARCH, QUESTS, ACHIEVEMENTS, ACTIONS, RESOURCE_BY_ID, TRADABLE, PROFESSION_BY_ID, VILLAGE_TIERS
} from './data.js';
import { TABS } from './unlocks.js';
import { SCHEDULES } from './time.js';

// A reload of the module (or a second import) must never leave a second game loop running.
if (window.__emberfallGame) window.__emberfallGame.stop();
const game = new Game();
window.__emberfallGame = game;

const root = document.querySelector('#app');
let modal = null;

// Interface text size: a viewer preference stored apart from the game save.
const UI_KEY = 'emberfall-ui-scale';
const UI_MIN = 70, UI_MAX = 200, UI_STEP = 10;
let uiScale = 100;
try { const v = Number(localStorage.getItem(UI_KEY)); if (v >= UI_MIN && v <= UI_MAX) uiScale = Math.round(v); } catch { /* storage unavailable */ }
function applyScale() { document.documentElement.style.setProperty('--ui-scale', String(uiScale / 100)); }
function setScale(value) {
  uiScale = Math.min(UI_MAX, Math.max(UI_MIN, Math.round(value)));
  try { localStorage.setItem(UI_KEY, String(uiScale)); } catch { /* ignore */ }
  applyScale();
  render();
}
applyScale();

const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
const fmt = value => game.format(value);
const cost = object => game.describeCost(object);
const time = ms => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
};
const pct = value => `${Math.max(0, Math.min(100, value)).toFixed(0)}%`;
const progress = (current, target, cls = '') => `<div class="progress ${cls}"><span style="width:${Math.min(100, target ? current / target * 100 : 0)}%"></span></div>`;
const attribute = (name, value) => `data-${name}="${esc(value)}"`;
const rate = v => (Math.abs(v) < .05 ? '' : `${v > 0 ? '+' : '−'}${fmt(Math.abs(v))}/d`);
const clockTime = at => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const EFFECT_LABELS = {
  happiness: 'happiness', recruit: '% arrival chance', craft: 'crafting', combat: 'combat strength', guard: 'guards', recovery: '% hero recovery',
  trade: '% trade profit', research: '% research speed', magic: 'magic', travel: '% travel speed', production: '% production', heroXp: '% hero XP',
  petXp: '% pet XP', explore: '% exploration rewards', blessing: 'blessings', monster: 'monster sanctuary', dungeon: 'dungeon access',
  alchemy: 'alchemy', dragon: 'dragon bond', rare: '% rare finds'
};

// ---------------------------------------------------------------------------------------------
// Building cards
// ---------------------------------------------------------------------------------------------
function statsAt(def, level) {
  const parts = [];
  if (def.capTable) parts.push(`${def.capKey === 'housing' ? 'housing' : 'storage'} ${def.capTable[Math.min(level, def.capTable.length) - 1].toLocaleString()}`);
  for (const [key, value] of Object.entries(def.effect)) parts.push(`+${value * level} ${EFFECT_LABELS[key] || key}`);
  for (const [id, amount] of Object.entries(def.passive)) parts.push(`+${fmt(amount * level)} ${RESOURCE_BY_ID[id].name}/h ${def.allDay ? '(all day)' : '(day shift)'}`);
  const jobs = PROFESSIONS.filter(p => p.requires.includes(def.id));
  if (jobs.length) parts.push(`${2 * level} seats for ${jobs.map(j => j.name.toLowerCase()).join('/')}`);
  return parts.join(' · ') || 'a necessary foundation';
}

function buildingCard(def) {
  const insts = game.instances(def.id);
  const canMore = insts.length < def.max;
  const buildCost = game.buildCost(def);
  const exceeds = game.costExceedsStorage(buildCost);
  const rows = insts.map(inst => {
    const maxed = inst.level >= 10;
    const upCost = maxed ? null : game.upgradeCost(inst);
    return `<div class="instance"><div class="card-row"><span>${insts.length > 1 ? `#${insts.indexOf(inst) + 1} ` : ''}Lv ${inst.level}/10</span>
      <button ${attribute('upgrade', inst.uid)} ${maxed || !game.canAfford(upCost) ? 'disabled' : ''}>${maxed ? 'Fully improved' : `Upgrade → Lv ${inst.level + 1}`}</button></div>
      <div class="tiny dim">Now: ${statsAt(def, inst.level)}</div>
      ${maxed ? '' : `<div class="tiny dim">Next: ${statsAt(def, inst.level + 1)}<br>${cost(upCost)}${game.costExceedsStorage(upCost) ? ' <span class="warning">(more storage needed)</span>' : ''}</div>`}</div>`;
  }).join('');
  const buildLine = canMore
    ? `<div class="cost">${insts.length ? 'Another' : 'Build'}: ${cost(buildCost)}${exceeds ? ' <span class="warning">(more storage needed)</span>' : ''}<br><span class="dim">${statsAt(def, 1)}</span></div><button ${attribute('build', def.id)} ${game.canAfford(buildCost) ? '' : 'disabled'}>${insts.length ? 'Build another' : 'Build'}</button>`
    : '<div class="cost dim">The most this settlement can hold.</div>';
  return `<article class="card"><div class="card-row"><h3>${def.name}${def.max > 1 ? ` <span class="dim">${insts.length}/${def.max}</span>` : ''}</h3><span class="pill">${def.tier}</span></div><p>${def.description}</p>${rows}${buildLine}</article>`;
}

function availableBuildings(tiers) { return BUILDINGS.filter(b => tiers.includes(b.tier) && game.buildingAvailable(b)); }

// ---------------------------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------------------------
function warnings(stats) {
  const s = game.state;
  const out = [];
  if (s.hunger > 0) out.push('Villagers are starving. Work is slow and some may leave.');
  else if (s.hungerFlags.low) out.push('Food is running low.');
  const full = RESOURCES.filter(r => game.isRevealed(r.id) && stats.ledger[r.id].full && r.id !== 'prestige' && stats.ledger[r.id].overflow > 0.05);
  full.forEach(r => out.push(`Storage is full: ${r.name} is overflowing.`));
  if (stats.pop > stats.housing) out.push('Some villagers have no proper housing.');
  if (stats.pop && stats.happiness < 40) out.push('The settlement is unhappy. Work and arrivals suffer.');
  return out;
}

function sidebar(stats) {
  const s = game.state;
  const info = game.timeInfo();
  const resources = RESOURCES.filter(r => game.isRevealed(r.id));
  const relics = s.relics.map(id => RELICS.find(r => r.id === id)).filter(Boolean);
  const warn = warnings(stats);
  const parts = [];
  if (game.unlocked('camp')) {
    parts.push(`<div class="section"><div class="section-title">Time</div>
      <div class="stat-row"><span>Day ${info.day}</span><span>${info.time}</span><span class="dim">${info.daytime ? 'day' : 'night'}</span></div>
      <div class="stat-row"><span>${info.season}</span><span>${info.weather}</span><span class="dim"></span></div>
      ${s.villagers.length ? `<div class="tiny dim">${info.activity}</div>` : ''}</div>`);
  }
  parts.push(`<div class="section"><div class="section-title">Resources ${game.unlocked('ledger') || stats.ledger.wood.cap < 1e6 ? `<span class="dim">cap ${fmt(stats.fx.storage)}</span>` : ''}</div>${resources.map(r => {
    const l = stats.ledger[r.id];
    const net = rate(l.net);
    return `<div class="resource-row"><span class="resource-name">${r.name}</span><span class="amount ${l.full && r.id !== 'prestige' ? 'warning' : ''}">${fmt(l.stock)}${l.full && r.id !== 'prestige' ? ' full' : ''}</span><span class="rate ${l.net > 0 ? 'positive' : 'negative'}">${net}</span></div>`;
  }).join('')}</div>`);
  if (warn.length) parts.push(`<div class="section"><div class="section-title">Warnings</div>${warn.map(w => `<div class="notice">${esc(w)}</div>`).join('')}</div>`);
  if (game.unlocked('villagerMgmt')) {
    const foodDays = stats.foodUse ? game.resource('food') / stats.foodUse : null;
    parts.push(`<div class="section"><div class="section-title">Population</div>
      <div class="stat-row"><span>Villagers</span><span>${stats.pop} / ${stats.housing}</span><span class="dim">housing</span></div>
      <div class="stat-row"><span>Happiness</span><span class="${stats.happiness > 80 ? 'positive' : stats.happiness < 40 ? 'negative' : ''}">${pct(stats.happiness)}</span><span class="dim"></span></div>
      <div class="stat-row"><span>Arrival chance</span><span>${stats.housing > stats.pop ? `${stats.recruitChance}%` : '—'}</span><span class="dim">/ min</span></div>
      <div class="stat-row"><span>Food eaten</span><span>${fmt(stats.foodUse)}</span><span class="dim">/ day${foodDays !== null ? `, ${foodDays.toFixed(1)}d left` : ''}</span></div>
      ${stats.guard ? `<div class="stat-row"><span>Guards</span><span>${stats.guard}</span><span class="dim">watch</span></div>` : ''}</div>`);
  }
  if (game.unlocked('ancientRuins')) {
    parts.push(`<div class="section"><div class="section-title">Relics <span class="dim">${relics.length}/${RELICS.length}</span></div>${relics.length
      ? `<ul class="mini-list">${relics.map(r => `<li title="${esc(r.description)}">${esc(r.name)} <span class="dim">+${r.value}% ${esc(r.kind)}</span></li>`).join('')}</ul>`
      : '<div class="empty">Nothing strange has been found.</div>'}</div>`);
  }
  if (game.hasBuilding('temple')) {
    const items = BLESSINGS.filter(b => game.blessingLevel(b.id) > 0);
    parts.push(`<div class="section"><div class="section-title">Blessings</div>${items.length ? items.map(b => `<div class="stat-row"><span>${b.name}</span><span>Lv ${game.blessingLevel(b.id)}</span><span></span></div>`).join('') : '<div class="empty">The old powers are quiet.</div>'}</div>`);
  }
  if (s.buildings.length) {
    parts.push(`<div class="section"><div class="section-title">Bonuses</div>
      <div class="stat-row"><span>Building levels</span><span>${game.totalBuildingLevels()}</span><span class="dim">total</span></div>
      ${game.unlocked('research') ? `<div class="stat-row"><span>Research</span><span>${game.totalResearch()}</span><span class="dim">theories</span></div>` : ''}
      ${game.unlocked('map') ? `<div class="stat-row"><span>Travel</span><span>${stats.travel.toFixed(0)}%</span><span class="dim">faster</span></div>` : ''}
      ${game.costDiscount() > 0 ? `<div class="stat-row"><span>Build discount</span><span>${(game.costDiscount() * 100).toFixed(0)}%</span><span class="dim"></span></div>` : ''}
      ${s.prestigeCount ? `<div class="stat-row"><span>Prestige</span><span>${s.prestigeCount}</span><span class="dim">cycles</span></div>` : ''}</div>`);
  }
  return `<aside class="sidebar">${parts.join('')}</aside>`;
}

// ---------------------------------------------------------------------------------------------
// Actions and tab content
// ---------------------------------------------------------------------------------------------
function rewardText(action) {
  const entries = Object.entries(action.rewards);
  const shown = entries.filter(([resource], i) => i === 0 || game.isRevealed(resource));
  const hidden = shown.length < entries.length;
  return shown.map(([resource, amount]) => `${amount > 0 ? '+' : ''}${amount} ${RESOURCE_BY_ID[resource]?.name || resource}`).join(' · ') + (hidden ? ' · and other finds' : '');
}

function actionCard(id) {
  const action = ACTIONS[id];
  const waiting = (game.state.actionCooldowns[id] || 0) - Date.now();
  const enabled = waiting <= 0 && (!action.rewards.torch || game.resource('torch') >= Math.abs(action.rewards.torch));
  return `<article class="action-card"><h3>${action.name}</h3><p>${action.description}</p><div class="cost">${rewardText(action)}</div><button ${attribute('action', id)} ${enabled ? '' : 'disabled'}>${waiting > 0 ? time(waiting) : action.name}</button></article>`;
}

function actionGrid(tab) {
  const ids = game.actionsFor(tab);
  return ids.length ? `<div class="action-grid">${ids.map(actionCard).join('')}</div>` : '';
}

function ledgerPanel(stats) {
  const rows = RESOURCES.filter(r => game.isRevealed(r.id) && r.id !== 'prestige').map(r => {
    const l = stats.ledger[r.id];
    return `<tr><td>${r.name}</td><td>${fmt(l.stock)} / ${fmt(l.cap)}</td><td class="positive">${l.prod ? `+${fmt(l.prod)}` : '—'}</td><td class="negative">${l.cons ? `−${fmt(l.cons)}` : '—'}</td><td class="${l.net >= 0 ? 'positive' : 'negative'}">${l.net >= 0 ? '+' : '−'}${fmt(Math.abs(l.net))}</td><td>${l.net > 0 ? `+${fmt(l.accepted)}` : '—'}</td><td class="${l.overflow > .05 ? 'warning' : 'dim'}">${l.overflow > .05 ? `+${fmt(l.overflow)}` : '—'}</td></tr>`;
  }).join('');
  return `<div class="section"><div class="section-title">Stores & accounts <span class="dim">per in-game day (20 min)</span></div>
    <table class="wide-table"><thead><tr><th>Resource</th><th>Stored</th><th>Produced</th><th>Used</th><th>Net</th><th>Accepted</th><th>Overflow</th></tr></thead><tbody>${rows}</tbody></table>
    ${RESOURCES.some(r => stats.ledger[r.id].full && stats.ledger[r.id].overflow > .05) ? '<div class="notice">Storage is full. Upgrade a Storage or build another to stop losing production.</div>' : ''}</div>`;
}

function campTab(stats) {
  const campfire = BUILDINGS.find(b => b.id === 'campfire');
  return `<div class="tab-kicker">The fire</div><h1 class="headline">Camp</h1><p class="subline">The fire keeps the worst of the dark at bay. What you gather here feeds everything else.</p>
    ${actionGrid('Camp')}
    <div class="section two-col"><div><div class="section-title">Survival</div>${buildingCard(campfire)}</div>
    <div><div class="section-title">Notes</div><ul class="mini-list"><li>Every villager eats ${fmt(2)} food per day. Food use now: ${fmt(stats.foodUse)}/day.</li><li>One day lasts 20 minutes: 14 of daylight, 6 of night.</li><li>${game.state.villagers.length ? 'Villagers work from 08:00 to 17:00 by default.' : 'Someone may come to the fire if it stays warm and there is food.'}</li></ul></div></div>`;
}

function villageTab(stats) {
  const housing = game.unlocked('housingMgmt') ? `<div class="card"><h3>Housing</h3><div class="stat-row"><span>Housing</span><span>${stats.pop} / ${stats.housing}</span><span>${Math.max(0, stats.housing - stats.pop)} free</span></div>${progress(stats.pop, Math.max(1, stats.housing))}<p class="tiny">Villagers need a roof. A recruitment check runs every minute while a bed is free (${stats.recruitChance}% now). Each extra hut adds 2%, a Tavern 5%, and happiness above 80% another 5%. The maximum is 40%.</p></div>` : '';
  const list = availableBuildings(VILLAGE_TIERS);
  const blessings = game.hasBuilding('temple') ? `<div class="section"><div class="section-title">Blessings</div><div class="card-grid">${BLESSINGS.map(b => `<article class="card"><h3>${b.name} <span class="dim">Lv ${game.blessingLevel(b.id)}/5</span></h3><p>${b.description}. Each level grants a small permanent improvement.</p><div class="cost">${game.blessingLevel(b.id) >= 5 ? 'Fully awakened' : `Needs ${cost({ essence: 2 + game.blessingLevel(b.id) * 2, ancientDust: 1 + game.blessingLevel(b.id) })}`}</div><button ${attribute('blessing', b.id)} ${game.blessingLevel(b.id) >= 5 ? 'disabled' : ''}>Improve blessing</button></article>`).join('')}</div></div>` : '';
  return `<div class="tab-kicker">Settlement management</div><h1 class="headline">Village</h1><p class="subline">Raise shelters, workplaces and stores. Everything here must be built before it helps.</p>
    ${housing}${game.unlocked('ledger') ? ledgerPanel(stats) : ''}
    <div class="section"><div class="section-title">Construction</div><div class="card-grid">${list.map(buildingCard).join('')}</div></div>${blessings}`;
}

function villagersTab(stats) {
  const s = game.state;
  const assignable = game.unlocked('professions');
  const parts = stats.happinessParts.map(([label, d]) => `<div class="stat-row"><span>${label}</span><span class="${d > 0 ? 'positive' : d < 0 ? 'negative' : ''}">${d > 0 ? '+' : ''}${d}</span><span></span></div>`).join('');
  const table = s.villagers.length ? `<table class="wide-table"><thead><tr><th>Name</th><th>Age</th><th>Nature</th><th>Lv</th><th>Work</th><th>Hours</th><th>Mood</th></tr></thead><tbody>${s.villagers.map(v => {
    const job = PROFESSION_BY_ID[v.profession] || PROFESSIONS[0];
    const options = PROFESSIONS.filter(p => p.id === v.profession || game.jobAvailable(p)).map(p => {
      const taken = s.villagers.filter(x => x.profession === p.id).length;
      const slots = game.jobSlots(p);
      return `<option value="${p.id}" ${p.id === v.profession ? 'selected' : ''}>${p.name}${p.id === 'idle' ? '' : ` (${taken}/${Number.isFinite(slots) ? slots : '∞'})`}</option>`;
    }).join('');
    const schedules = game.availableSchedules(v);
    return `<tr><td>${esc(v.name)}${v.away ? ' <span class="dim">away</span>' : ''}</td><td>${v.age}</td><td><span class="pill">${esc(v.personality?.name)}</span></td><td>${v.skill}</td>
      <td>${assignable ? `<select ${attribute('assign', v.id)}>${options}</select>` : '<span class="dim">idle</span>'}<div class="tiny dim">${Object.entries(job.production).map(([id, n]) => `+${n} ${RESOURCE_BY_ID[id]?.name}/h`).join(', ')}</div></td>
      <td>${schedules.length > 1 ? `<select ${attribute('schedule', v.id)}>${schedules.map(id => `<option value="${id}" ${id === v.schedule ? 'selected' : ''}>${SCHEDULES[id].name}</option>`).join('')}</select>` : `<span class="dim">${SCHEDULES[v.schedule]?.name || ''}</span>`}</td>
      <td class="${v.happiness < 40 ? 'negative' : ''}">${pct(v.happiness)}</td></tr>`;
  }).join('')}</tbody></table>` : '<div class="empty">No villagers yet.</div>';
  const families = `<div class="card"><h3>Families <span class="pill">optional</span></h3><p>${s.families.length ? `${s.families.length} famil${s.families.length > 1 ? 'ies' : 'y'} established.` : 'Friendships can grow without replacing new arrivals.'}</p><button ${attribute('family', 'join')} ${s.villagers.filter(v => !v.family).length < 2 ? 'disabled' : ''}>Encourage a friendship</button>${s.families.some(f => f.children > 0) ? ` <button ${attribute('family', 'grow')}>Welcome grown children</button>` : ''}${s.families.map(f => `<div class="card-row" style="margin-top:5px"><span class="tiny">${f.children} child${f.children === 1 ? '' : 'ren'}</span><button ${attribute('child', f.id)}>Prepare for child (15 Food)</button></div>`).join('')}</div>`;
  return `<div class="tab-kicker">The people of the fire</div><h1 class="headline">Villagers</h1><p class="subline">${assignable ? 'Choose each villager’s work yourself. Jobs need a workplace with free seats.' : 'Professions can be assigned once three people live here.'}</p>
    <div class="two-col"><div class="card"><h3>Mood ${pct(stats.happiness)}</h3>${parts}</div><div class="card"><h3>The day</h3><p>${game.timeInfo().activity} now. Default routine: 06-08 breakfast, 08-17 work, 17-19 rest, 19-22 dinner and company, 22-06 sleep. Guards may take the night watch.</p><div class="stat-row"><span>Food stored</span><span>${fmt(game.resource('food'))}</span><span>${fmt(stats.foodUse)}/day eaten</span></div></div></div>
    <div class="section"><div class="section-title">Roster</div>${table}</div>
    ${game.unlocked('villagerEvents') ? `<div class="section">${families}</div>` : ''}`;
}

function actionTab(tab, kicker, title, sub, extra = '') {
  return `<div class="tab-kicker">${kicker}</div><h1 class="headline">${title}</h1><p class="subline">${sub}</p>${actionGrid(tab)}${extra}`;
}

function forestTab() {
  return actionTab('Forest', 'Beyond the warm stones', 'Forest', 'The trees offer food and timber, but their quiet places are never empty.',
    `<div class="section callout">Hunts can turn up fur, leather, bones and treasure maps. ${game.readyHero() ? 'Your hero may meet wild animals on a hunt.' : 'Without a hero, animals simply slip away.'}</div>`);
}
function mineTab() {
  return actionTab('Mine', 'Dark and echoing', 'Mine', 'Iron lies behind the quarry wall. Take what the shaft will give.');
}
function caveTab() {
  const torch = RECIPES.find(r => r.id === 'torch');
  return actionTab('Cave', 'The cold below', 'Cave', 'Deeper passages hold better rewards, relics and danger. Every descent burns a torch.',
    `<div class="section two-col"><div class="card"><h3>Torches</h3><p>You have ${fmt(game.resource('torch'))}. Cave depth ${game.state.caveDepth}.</p><div class="cost">${cost(torch.cost)} → ${torch.result.torch} torches</div><button ${attribute('craft', 'torch')} ${game.canAfford(torch.cost) ? '' : 'disabled'}>Make torches</button></div>
    <div><div class="section-title">Cave discoveries</div><ul class="mini-list"><li>${game.state.caveDepth >= 3 ? 'A sealed stairwell can be opened. Build a Dungeon Entrance.' : 'Keep exploring. Something sealed lies below.'}</li><li>Deep passages may hold relics, chambers, monsters and treasure.</li></ul></div></div>`);
}

function estateTab(stats) {
  const list = availableBuildings(['Estate', 'Royal', 'Arcane']);
  const chain = ['ironIngot', 'steelBar', 'healingPotion', 'travelRations'].map(id => RECIPES.find(r => r.id === id)).filter(r => r && game.recipeVisible(r) && game.hasBuilding('workshop'));
  return `<div class="tab-kicker">A growing realm</div><h1 class="headline">Estate</h1><p class="subline">Production chains make the settlement more than the sum of its hands.</p>
    <div class="two-col">${chain.length ? `<div class="card"><h3>Production chains</h3><p>Iron + coal make steel; herbs + water make potions.</p><div class="inline-actions">${chain.map(r => `<button ${attribute('craft', r.id)} ${game.canAfford(r.cost) ? '' : 'disabled'} title="${esc(cost(r.cost))}">${r.name}</button>`).join('')}</div></div>` : ''}
    ${game.unlocked('prestige') ? `<div class="card"><h3>Prestige: New Flame+</h3><p>At 45 building levels you may begin again. Keep a share of relics and gain Ember Shards, each worth +2% production. This is optional.</p><button class="important" ${attribute('prestige', 'now')} ${game.totalBuildingLevels() < 45 ? 'disabled' : ''}>Rekindle (${game.totalBuildingLevels()}/45)</button></div>` : ''}</div>
    <div class="section"><div class="section-title">Estate & royal construction</div>${list.length ? `<div class="card-grid">${list.map(buildingCard).join('')}</div>` : '<div class="empty">Nothing new is within reach yet.</div>'}</div>`;
}

function mapTab() {
  const s = game.state;
  const levels = game.totalBuildingLevels();
  const regions = REGIONS.filter(r => levels >= r.unlock);
  const hidden = REGIONS.length - regions.length;
  const hero = game.readyHero();
  const walker = hero ? hero.name : game.freeVillagers()[0]?.name;
  return `<div class="tab-kicker">The wider world</div><h1 class="headline">Map</h1><p class="subline">Send a hero or a villager out. Expeditions take 1–10 minutes and return with finds.</p>
  ${s.expeditions.length ? `<div class="callout good">${s.expeditions.map(e => { const r = REGIONS.find(x => x.id === e.regionId); return `${r.name} · ${time((e.endsAt - s.clock) * 1000)}`; }).join(' &nbsp;|&nbsp; ')}</div>` : ''}
  ${game.resource('maps') >= 1 ? `<div class="callout">You hold ${fmt(game.resource('maps'))} treasure map${game.resource('maps') >= 2 ? 's' : ''}. <button ${attribute('usemap', '1')}>Follow a map</button></div>` : ''}
  <div class="card-grid">${regions.map(region => {
    const full = s.expeditions.length >= game.maxParties();
    return `<article class="card"><div class="card-row"><h3>${region.name}</h3><span class="pill">${Math.round(game.expeditionSeconds(region) / 6) / 10} min</span></div><p>${region.description}</p><div class="cost">Find: ${region.rewards.filter(id => game.isRevealed(id) || true).map(id => RESOURCE_BY_ID[id].name).join(', ')}<br>Threat: ${ENEMIES.find(e => e.id === region.enemy)?.name || 'Unknown'}</div><button ${attribute('expedition', region.id)} ${full || !walker ? 'disabled' : ''}>${full ? 'Parties away' : walker ? `Send ${esc(walker)}` : 'Nobody free'}</button></article>`;
  }).join('')}</div>
  ${hidden ? `<div class="empty">${hidden} more region${hidden > 1 ? 's' : ''} lie beyond what the settlement can reach.</div>` : ''}
  ${game.unlocked('worldBosses') ? `<div class="section"><div class="section-title">World bosses</div><div class="card-grid">${BOSSES.map(boss => `<article class="card"><h3>${boss.name}</h3><p>${boss.hp} health · ${boss.attack} attack · rare rewards</p><button ${attribute('boss', boss.id)} ${hero ? '' : 'disabled'}>Challenge</button></article>`).join('')}</div></div>` : ''}`;
}

function achievementsTab() {
  const list = ACHIEVEMENTS.filter(a => game.achievementVisible(a));
  return `<div class="tab-kicker">Records of the flame</div><h1 class="headline">Achievements</h1><p class="subline">${game.state.claimedAchievements.length}/${ACHIEVEMENTS.length} claimed. Every milestone returns supplies to the settlement.</p><div class="card-grid">${list.map(a => {
    const current = game.achievementProgress(a);
    const ready = current >= a.target;
    const was = game.state.claimedAchievements.includes(a.id);
    return `<article class="card"><h3>${a.name} ${was ? '<span class="positive">✓</span>' : ''}</h3><p>${a.description}</p><div class="cost">${a.kind}: ${fmt(Math.min(current, a.target))}/${a.target} · reward ${cost(Object.fromEntries(Object.entries(a.reward).filter(([, n]) => n > 0)))}</div>${progress(current, a.target)}<button ${attribute('achievement', a.id)} ${!ready || was ? 'disabled' : ''}>${was ? 'Claimed' : ready ? 'Claim reward' : 'In progress'}</button></article>`;
  }).join('')}</div>`;
}

function eventsTab() {
  return `<div class="tab-kicker">Things that happen in the dark</div><h1 class="headline">Events</h1><p class="subline">Most changes help the settlement. Expect one every three to five minutes.</p>
  <div class="section"><div class="section-title">Recent events</div><ul class="mini-list">${game.state.logs.slice(0, 50).map(item => `<li><span class="dim">${clockTime(item.at)}</span> ${esc(item.text)}</li>`).join('')}</ul></div>`;
}

function eventCard(e) {
  const labels = { story_traveller: ['Welcome', 'Turn away'], story_merchant: ['Greet them', 'Send away'], traveller: ['Welcome', 'Decline'], merchant: ['Accept gift', 'Decline'], festival: ['Hold festival', 'Skip'], chest: ['Open chest', 'Leave it'], threat: ['Defend', 'Stay inside'] };
  const [yes, no] = labels[e.kind] || ['Accept', 'Decline'];
  return `<div class="callout fire event-card"><h3 class="headline">${esc(e.title)}</h3><p>${esc(e.body)}</p><div class="inline-actions"><button class="important" ${attribute('event', 'accept')}>${yes}</button><button ${attribute('event', 'decline')}>${no}</button></div></div>`;
}

function dungeonTab() {
  const d = game.state.dungeon;
  return `<div class="tab-kicker">A cold stair beneath the settlement</div><h1 class="headline">Dungeon</h1><p class="subline">Floors hold enemies, hidden rooms, mini-bosses and rare rewards. Heroes recover after defeat; no one is lost.</p>
  ${d ? `<div class="callout fire"><h3 class="headline">Floor ${d.floor}</h3><p>You hear something moving ahead. ${d.cleared}/${d.rooms} rooms searched, ${d.treasure} treasures found.</p><div class="inline-actions"><button class="important" ${attribute('dungeon', 'continue')}>Continue</button><button ${attribute('dungeon', 'retreat')}>Retreat</button></div></div>` : `<div class="card"><h3>Forgotten dungeon</h3><p>Bring torches${game.readyHero() ? '' : ' and a ready hero (without one the party only searches rooms)'}.</p><button ${attribute('dungeon', 'start')} ${game.resource('torch') ? '' : 'disabled'}>Descend</button></div>`}
  <div class="section"><div class="section-title">Prepared supplies</div><div class="stat-row"><span>Torches</span><span>${fmt(game.resource('torch'))}</span><span class="dim">one per room</span></div><div class="stat-row"><span>Ready heroes</span><span>${game.state.heroes.filter(h => !h.recovering).length}</span><span class="dim">fighters</span></div></div>`;
}

function researchTab() {
  return `<div class="tab-kicker">What the old world knew</div><h1 class="headline">Research</h1><p class="subline">Affordable theory unlocks a faster, broader settlement. Researchers and libraries generate research points.</p><div class="card-grid">${Object.entries(RESEARCH).map(([branch, nodes]) => {
    const level = game.state.research[branch];
    const next = nodes[level];
    const max = level >= nodes.length;
    const c = game.researchCost(level);
    return `<article class="card"><h3>${branch[0].toUpperCase() + branch.slice(1)} <span class="dim">${level}/${nodes.length}</span></h3><p>${nodes.map((node, i) => `${i < level ? '✓ ' : i === level ? '→ ' : '· '}${node}`).join('<br>')}</p><div class="cost">${max ? 'The branch is complete.' : `Next: ${next}<br>${cost(c)}`}</div>${progress(level, nodes.length)}<button ${attribute('research', branch)} ${max || !game.canAfford(c) ? 'disabled' : ''}>${max ? 'Complete' : 'Study next theory'}</button></article>`;
  }).join('')}</div><p class="tiny dim">Agriculture: +4% food per level. Construction: −2% build costs and +1% arrivals. Military: +2 combat. Economy: +4% sale prices. Magic: +3% research speed.</p>`;
}

function craftingTab() {
  const visible = RECIPES.filter(r => game.recipeVisible(r));
  const categories = [...new Set(visible.map(r => r.category))];
  const hiddenCount = RECIPES.length - visible.length;
  return `<div class="tab-kicker">Make the ordinary useful</div><h1 class="headline">Crafting</h1><p class="subline">${visible.length} recipes known. Research and new discoveries reveal more.</p>
  ${categories.map(category => `<div class="section"><div class="section-title">${category}</div><div class="card-grid">${visible.filter(r => r.category === category).map(recipe => `<article class="card"><h3>${recipe.name}</h3><p>${recipe.result.equipment ? `${recipe.result.equipment}; rarity is rolled when made.` : Object.entries(recipe.result).map(([id, n]) => `+${n} ${RESOURCE_BY_ID[id]?.name}`).join(', ')}</p><div class="cost">${cost(recipe.cost)}</div><button ${attribute('craft', recipe.id)} ${game.canAfford(recipe.cost) ? '' : 'disabled'}>Craft</button></article>`).join('')}</div></div>`).join('')}
  ${hiddenCount ? `<div class="empty">${hiddenCount} more recipes are still unknown.</div>` : ''}`;
}

function heroesTab() {
  const s = game.state;
  const c = game.heroCost();
  return `<div class="tab-kicker">Those who walk into danger</div><h1 class="headline">Heroes</h1><p class="subline">Automatic text combat lets heroes gain levels, carry equipment and recover after a defeat.</p><div class="callout">${s.heroes.length ? `${s.heroes.length} hero${s.heroes.length > 1 ? 'es follow' : ' follows'} the ember.` : 'No hero has yet come to the settlement.'} <button ${attribute('hero', 'recruit')} ${game.canAfford(c) ? '' : 'disabled'}>Recruit a hero (${cost(c)})</button></div>
  <div class="card-grid">${s.heroes.map(hero => `<article class="card"><div class="card-row"><h3>${esc(hero.name)} <span class="pill ${hero.rarity.toLowerCase()}">${hero.rarity}</span></h3><button ${attribute('selecthero', hero.id)} ${s.selectedHero === hero.id ? 'disabled' : ''}>${s.selectedHero === hero.id ? 'Selected' : 'Select'}</button></div><p>Level ${hero.level} ${hero.class} · ${hero.recovering ? `recovering ${time((hero.recovering - s.clock) * 1000)}` : 'ready'}</p>${progress(hero.health, hero.maxHealth, 'hero-health')}<div class="stat-row"><span>${Math.ceil(hero.health)}/${hero.maxHealth} health</span><span>${hero.attack} atk</span><span>${hero.defence} def</span></div><p class="tiny">Experience ${hero.experience} · speed ${hero.speed}</p></article>`).join('')}</div>
  ${s.equipment.length ? `<div class="section"><div class="section-title">Equipment store</div><ul class="mini-list">${s.equipment.map((item, index) => `<li>${esc(item.name)} <span class="pill ${item.rarity.toLowerCase()}">${item.rarity}</span> <span class="dim">Lv ${item.level || 1}/10</span> <button ${attribute('equipment', index)} ${(item.level || 1) >= 10 ? 'disabled' : ''}>Improve</button></li>`).join('')}</ul></div>` : ''}`;
}

function petsTab() {
  const s = game.state;
  const pets = game.unlocked('animalTracks') ? `<div class="section"><div class="section-title">Pets ${s.pets.length}/${PETS.length}</div><div class="card-grid">${PETS.map(pet => {
    const owned = s.pets.includes(pet.id);
    const level = s.petLevels[pet.id] || 1;
    return `<article class="card"><h3>${pet.name} ${owned ? '<span class="positive">✓</span>' : ''}</h3><p>${pet.bonus}${owned ? ` · level ${level}/10` : ''}</p><button ${attribute('pet', pet.id)} ${owned || !game.canAfford({ gold: 30, food: 20 }) ? 'disabled' : ''}>${owned ? 'At the fire' : 'Foster (30 Gold, 20 Food)'}</button>${owned ? ` <button ${attribute('feedpet', pet.id)} ${level >= 10 ? 'disabled' : ''}>Train</button>` : ''}</article>`;
  }).join('')}</div></div>` : '';
  const mounts = game.hasBuilding('stable') ? `<div class="section"><div class="section-title">Mounts ${s.mounts.length}/${MOUNTS.length}</div><div class="card-grid">${MOUNTS.map(mount => { const owned = s.mounts.includes(mount.id); return `<article class="card"><h3>${mount.name} ${owned ? '<span class="positive">✓</span>' : ''}</h3><p>${mount.bonus}</p><button ${attribute('mount', mount.id)} ${owned || !game.canAfford({ gold: 110, leather: 12, food: 30 }) ? 'disabled' : ''}>${owned ? 'Trained' : 'Acquire (110 Gold, 12 Leather, 30 Food)'}</button></article>`; }).join('')}</div></div>` : '';
  const monsters = game.hasBuilding('monsterSanctuary') ? `<div class="section"><div class="section-title">Monster sanctuary</div>${s.monsters.length ? `<ul class="mini-list">${s.monsters.map(m => `<li>${esc(typeof m === 'string' ? m : m.name)} <span class="dim">${typeof m === 'string' ? 'settled safely' : m.bonus}</span></li>`).join('')}</ul>` : '<div class="empty">Defeated creatures can sometimes be calmed rather than driven away.</div>'}</div>` : '';
  return `<div class="tab-kicker">Creatures of the settlement</div><h1 class="headline">Companions</h1><p class="subline">Their quiet bonuses stack.</p>${pets}${mounts}${monsters}`;
}

function questsTab() {
  const list = QUESTS.filter(q => game.questVisible(q));
  return `<div class="tab-kicker">Small promises, lasting change</div><h1 class="headline">Quests</h1><p class="subline">Goals that keep the next reward close.</p><div class="card-grid">${list.map(q => {
    const current = game.progressQuest(q);
    const done = game.state.quests[q.id];
    const ready = current >= q.target;
    return `<article class="card"><div class="card-row"><h3>${q.name}</h3><span class="pill">${q.type}</span></div><p>${q.text}</p><div class="cost">${fmt(Math.min(current, q.target))}/${q.target} · reward ${cost(q.reward)}</div>${progress(current, q.target)}<button ${attribute('quest', q.id)} ${!ready || done ? 'disabled' : ''}>${done ? 'Completed' : ready ? 'Claim reward' : 'In progress'}</button></article>`;
  }).join('')}</div>`;
}

const TAB_RENDERERS = { Camp: campTab, Village: villageTab, Villagers: villagersTab, Forest: forestTab, Mine: mineTab, Cave: caveTab, Estate: estateTab, Map: mapTab, Crafting: craftingTab, Dungeon: dungeonTab, Research: researchTab, Heroes: heroesTab, Pets: petsTab, Quests: questsTab, Achievements: achievementsTab, Events: eventsTab };

function baseView() {
  const campfire = BUILDINGS.find(b => b.id === 'campfire');
  const intro = game.state.tracking.actions < 3
    ? 'You stand alone at the edge of the dark. Cold air, the sound of leaves, and trees close at hand. A fire would change everything, and a fire needs wood.'
    : game.buildingAvailable(campfire) ? 'You have enough wood to make a fire.' : 'The wood pile grows. Keep going.';
  return `<div class="tab-kicker">Beginning</div><h1 class="headline">EMBERFALL</h1><p class="subline">${intro}</p>${actionGrid('Camp')}
    ${game.buildingAvailable(campfire) && !game.hasBuilding('campfire') ? `<div class="section"><div class="section-title">Build</div><div class="card-grid">${buildingCard(campfire)}</div></div>` : ''}`;
}

function content(stats) {
  const tabs = game.visibleTabs(TABS);
  if (!tabs.length) return { nav: '', body: baseView() };
  if (!tabs.some(t => t.id === game.state.selectedTab)) game.state.selectedTab = tabs[0].id;
  const nav = `<nav class="nav">${tabs.map(t => `<button ${attribute('tab', t.id)} class="${game.state.selectedTab === t.id ? 'active' : ''}">${t.id}</button>`).join('')}</nav>`;
  return { nav, body: TAB_RENDERERS[game.state.selectedTab](stats) };
}

// ---------------------------------------------------------------------------------------------
// Right column and log
// ---------------------------------------------------------------------------------------------
function contextPanel() {
  const s = game.state;
  const sections = [];
  if (game.unlocked('trading')) {
    const sellable = TRADABLE.filter(id => game.isRevealed(id) && game.resource(id) >= 10).slice(0, 8);
    sections.push(`<div class="section"><div class="section-title">Travelling merchant</div><p class="tiny muted">Stock changes in ${time((s.merchantRefresh - s.clock) * 1000)}.</p>${game.marketItems().map(item => `<div class="card-row" style="margin:5px 0"><span>${item.amount} ${RESOURCE_BY_ID[item.resource].name}</span><button ${attribute('buy', item.id)} ${game.canAfford({ [item.currency]: item.cost }) ? '' : 'disabled'}>${item.cost} ${RESOURCE_BY_ID[item.currency].name}</button></div>`).join('') || '<div class="empty">Nothing on offer.</div>'}
      ${sellable.length ? `<div class="section-title" style="margin-top:8px">Sell 10</div><div class="inline-actions">${sellable.map(id => `<button ${attribute('sell', id)} title="${game.sellPrice(id, 10)} gold">${RESOURCE_BY_ID[id].name}</button>`).join('')}</div>` : ''}</div>`);
  }
  if (game.unlocked('map') && s.expeditions.length) {
    sections.push(`<div class="section"><div class="section-title">Active expeditions</div>${s.expeditions.map(e => { const r = REGIONS.find(x => x.id === e.regionId); return `<ul class="mini-list"><li>${r.name}<br><span class="dim">returns in ${time((e.endsAt - s.clock) * 1000)}</span></li></ul>`; }).join('')}</div>`);
  }
  return sections.length ? `<aside class="context">${sections.join('')}</aside>` : '';
}

function logPanel() {
  const s = game.state;
  return `<section class="log-panel"><div class="log-head"><div class="section-title">Event log <span class="dim">latest ${s.logs.length}/50</span></div><div class="footer-controls"><button ${attribute('manage', 'save')}>Save</button><button ${attribute('manage', 'export')}>Export</button><button ${attribute('manage', 'import')}>Import</button><button class="danger" ${attribute('manage', 'reset')}>Reset</button></div></div>${s.logs.slice(0, 12).map(item => `<div class="log-entry"><span class="log-time">${clockTime(item.at)}</span><span>${esc(item.text)}</span></div>`).join('')}</section>`;
}

function offlineReportMarkup(r) {
  const list = obj => Object.entries(obj).map(([id, n]) => `${n.toLocaleString()} ${RESOURCE_BY_ID[id].name}`);
  const gains = list(r.gains);
  const losses = list(r.losses);
  const wasted = list(r.wasted);
  return `<div class="modal-layer"><div class="modal"><h2 class="headline">Welcome back</h2><p class="subline">While you were away${r.capped ? ' (the first 8 hours count)' : ''}: ${r.minutes} minutes.</p>
    ${gains.length ? `<ul class="mini-list">${gains.map(x => `<li class="positive">+${x}</li>`).join('')}</ul>` : '<p class="dim">Nothing was gathered.</p>'}
    ${losses.length ? `<p class="tiny dim">Used: ${losses.join(', ')}</p>` : ''}
    ${wasted.length ? `<p class="notice">Storage was full. Lost: ${wasted.join(', ')}.</p>` : ''}
    ${r.arrivals ? `<p>${r.arrivals} new villager${r.arrivals > 1 ? 's' : ''} arrived.</p>` : ''}${r.expeditions > 0 ? `<p>${r.expeditions} expedition${r.expeditions > 1 ? 's' : ''} completed.</p>` : ''}${r.merchants ? `<p>${r.merchants} merchant visit${r.merchants > 1 ? 's' : ''}.</p>` : ''}${r.left ? `<p class="negative">${r.left} villager${r.left > 1 ? 's' : ''} left hungry.</p>` : ''}
    <div class="inline-actions"><button class="important" ${attribute('modal', 'dismiss-offline')}>Continue</button></div></div></div>`;
}

function modalMarkup() {
  if (modal) {
    if (modal.type === 'export') return `<div class="modal-layer"><div class="modal"><h2 class="headline">Export EMBERFALL save</h2><p class="subline">Copy this text somewhere safe. It contains your whole settlement.</p><textarea readonly>${esc(game.exportSave())}</textarea><div class="inline-actions"><button ${attribute('modal', 'copy')}>Copy to clipboard</button><button ${attribute('modal', 'close')}>Close</button></div></div></div>`;
    if (modal.type === 'import') return `<div class="modal-layer"><div class="modal"><h2 class="headline">Import save</h2><p class="subline">Paste a previously exported EMBERFALL save. Invalid data is rejected without changing the active game.</p><textarea id="save-import" placeholder="Paste save JSON here"></textarea><div class="inline-actions"><button class="important" ${attribute('modal', 'confirm-import')}>Import save</button><button ${attribute('modal', 'close')}>Cancel</button></div></div></div>`;
    return `<div class="modal-layer"><div class="modal"><h2 class="headline">Begin again?</h2><p class="subline">This permanently removes the current settlement and starts a new one with nothing. Export a save first if you may want it back.</p><div class="inline-actions"><button class="danger" ${attribute('modal', 'confirm-reset')}>Reset game</button><button ${attribute('modal', 'close')}>Cancel</button></div></div></div>`;
  }
  if (game.offlineReport) return offlineReportMarkup(game.offlineReport);
  return '';
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------
const SCROLLERS = ['.sidebar', '.tab-content', '.context', '.log-panel', '.modal'];

function render() {
  const active = document.activeElement;
  // Do not tear down a control the player is using (an open drop-down or a text box).
  if (active && /^(SELECT|TEXTAREA|INPUT)$/.test(active.tagName) && root.contains(active)) return;
  const saved = SCROLLERS.map(sel => { const el = root.querySelector(sel); return el ? el.scrollTop : 0; });
  const stats = game.getStats();
  const { nav, body } = content(stats);
  const info = game.timeInfo();
  const pending = game.state.pendingEvent ? eventCard(game.state.pendingEvent) : '';
  const context = contextPanel();
  root.innerHTML = `<div class="game-shell"><header class="masthead"><div><span class="logo">EMBERFALL</span> <span class="tagline">a settlement in the dark</span></div><div class="masthead-right"><div class="text-size" title="Text size"><span class="dim">Text</span><button ${attribute('ui', 'down')} ${uiScale <= UI_MIN ? 'disabled' : ''} aria-label="Smaller text">A\u2212</button><span class="size-value">${uiScale}%</span><button ${attribute('ui', 'up')} ${uiScale >= UI_MAX ? 'disabled' : ''} aria-label="Larger text">A+</button>${uiScale !== 100 ? `<button ${attribute('ui', 'reset')}>Reset</button>` : ''}</div>${game.unlocked('camp') ? `<div class="clock">Day ${info.day} · ${info.time} · ${info.daytime ? 'day' : 'night'} · ${info.season} · ${info.weather}</div>` : ''}</div></header>
    <div class="layout ${context ? '' : 'no-context'}">${sidebar(stats)}<main class="main">${nav}<section class="tab-content">${pending}${body}</section></main>${context}</div>${logPanel()}</div>${modalMarkup()}`;
  SCROLLERS.forEach((sel, i) => { const el = root.querySelector(sel); if (el) el.scrollTop = saved[i]; });
}

root.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  const data = button.dataset;
  if (data.ui) { setScale(data.ui === 'up' ? uiScale + UI_STEP : data.ui === 'down' ? uiScale - UI_STEP : 100); return; }
  if (data.tab) { game.state.selectedTab = data.tab; game.emit(); return; }
  if (data.action) game.doAction(data.action);
  else if (data.build) game.build(data.build);
  else if (data.upgrade) game.upgradeBuilding(data.upgrade);
  else if (data.event) game.resolveEvent(data.event);
  else if (data.research) game.research(data.research);
  else if (data.craft) game.craft(data.craft);
  else if (data.expedition) game.startExpedition(data.expedition);
  else if (data.usemap) game.useMap();
  else if (data.boss) game.fightWorldBoss(data.boss);
  else if (data.achievement) game.claimAchievement(data.achievement);
  else if (data.blessing) game.upgradeBlessing(data.blessing);
  else if (data.hero === 'recruit') game.recruitHero();
  else if (data.selecthero) { game.state.selectedHero = data.selecthero; game.emit(); }
  else if (data.pet) game.adoptPet(data.pet);
  else if (data.feedpet) game.feedPet(data.feedpet);
  else if (data.mount) game.acquireMount(data.mount);
  else if (data.equipment) game.upgradeEquipment(Number(data.equipment));
  else if (data.quest) game.claimQuest(data.quest);
  else if (data.family === 'join') game.joinFamily();
  else if (data.family === 'grow') game.growChildren();
  else if (data.child) game.welcomeChild(data.child);
  else if (data.buy) game.buyMerchant(data.buy);
  else if (data.sell) game.sell(data.sell);
  else if (data.dungeon === 'start') game.startDungeon();
  else if (data.dungeon) game.dungeonStep(data.dungeon);
  else if (data.prestige) game.prestige();
  else if (data.manage === 'save') { game.save(true); game.emit(); }
  else if (data.manage === 'export') { modal = { type: 'export' }; render(); }
  else if (data.manage === 'import') { modal = { type: 'import' }; render(); }
  else if (data.manage === 'reset') { modal = { type: 'reset' }; render(); }
  else if (data.modal === 'close') { modal = null; render(); }
  else if (data.modal === 'dismiss-offline') { game.offlineReport = null; render(); }
  else if (data.modal === 'copy') { navigator.clipboard?.writeText(game.exportSave()).then(() => game.notify('Save copied to clipboard.')).catch(() => game.notify('Copy was blocked; select the text manually.')); }
  else if (data.modal === 'confirm-import') { const text = document.querySelector('#save-import')?.value || ''; if (game.importSave(text)) modal = null; render(); }
  else if (data.modal === 'confirm-reset') { game.reset(); modal = null; render(); }
});

root.addEventListener('change', event => {
  const el = event.target;
  if (el.matches('select[data-assign]')) { el.blur(); game.assignVillager(el.dataset.assign, el.value); }
  else if (el.matches('select[data-schedule]')) { el.blur(); game.setSchedule(el.dataset.schedule, el.value); }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.save();
  else game.tick();
});
window.addEventListener('pagehide', () => game.save());

game.subscribe(render);
render();
game.start();
