import { Game } from './state.js';
import {
  RESOURCES, PROFESSIONS, BUILDINGS, REGIONS, ENEMIES, BOSSES, RELICS, BLESSINGS, PETS, MOUNTS, RECIPES,
  RESEARCH, QUESTS, ACHIEVEMENTS, ACTIONS, RESOURCE_BY_ID, TRADABLE, PROFESSION_BY_ID, VILLAGE_TIERS,
  STORAGE_CLASSES, CLASS_OF, BUILDING_GROUPS
} from './data.js';
import { TABS } from './unlocks.js';
import { SCHEDULES } from './time.js';

// A reload of the module (or a second import) must never leave a second game loop running.
if (window.__emberfallGame) window.__emberfallGame.stop();
const game = new Game();
window.__emberfallGame = game;

const root = document.querySelector('#app');
let modal = null;

// ---------------------------------------------------------------------------------------------
// Viewer preferences (kept apart from the game save): text size and which dropdowns are open.
// ---------------------------------------------------------------------------------------------
const UI_KEY = 'emberfall-ui-scale';
const PANELS_KEY = 'emberfall-ui-panels';
const UI_MIN = 70, UI_MAX = 200, UI_STEP = 10;
let uiScale = 100;
let panels = {};
try { const v = Number(localStorage.getItem(UI_KEY)); if (v >= UI_MIN && v <= UI_MAX) uiScale = Math.round(v); } catch { /* storage unavailable */ }
try { const p = JSON.parse(localStorage.getItem(PANELS_KEY) || '{}'); if (p && typeof p === 'object') panels = p; } catch { /* ignore */ }
function applyScale() { document.documentElement.style.setProperty('--ui-scale', String(uiScale / 100)); }
function setScale(value) {
  uiScale = Math.min(UI_MAX, Math.max(UI_MIN, Math.round(value)));
  try { localStorage.setItem(UI_KEY, String(uiScale)); } catch { /* ignore */ }
  applyScale();
  render();
}
function savePanels() { try { localStorage.setItem(PANELS_KEY, JSON.stringify(panels)); } catch { /* ignore */ } }
const isOpen = (id, fallback = false) => (id in panels ? !!panels[id] : fallback);
applyScale();

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------
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
const rate = v => (Math.abs(v) < .05 ? '' : `${v > 0 ? '+' : '−'}${fmt(Math.abs(v))}`);
const clockTime = at => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// A dropdown that remembers whether the player left it open.
function drop(id, summary, body, { open = false, cls = '' } = {}) {
  return `<details class="drop ${cls}" data-panel="${esc(id)}" ${isOpen(id, open) ? 'open' : ''}><summary>${summary}</summary><div class="drop-body">${body}</div></details>`;
}

const EFFECT_LABELS = {
  happiness: 'happiness', recruit: '% arrival chance', craft: 'crafting', combat: 'combat strength', guard: 'guards', recovery: '% hero recovery',
  trade: '% trade profit', research: '% research speed', magic: 'magic', travel: '% travel speed', production: '% production', heroXp: '% hero XP',
  petXp: '% pet XP', explore: '% exploration rewards', blessing: 'blessings', monster: 'monster sanctuary', dungeon: 'dungeon access',
  alchemy: 'alchemy', dragon: 'dragon bond', rare: '% rare finds'
};

// ---------------------------------------------------------------------------------------------
// Building cards: a bordered card with the essentials, and an Info dropdown for the rest.
// ---------------------------------------------------------------------------------------------
function storeGoods(def) {
  const info = def.capClass && def.capClass !== 'all' ? STORAGE_CLASSES[def.capClass] : null;
  return info ? info.items.map(id => RESOURCE_BY_ID[id].name.toLowerCase()).join(', ') : 'every bulk good';
}
function statsAt(def, level) {
  const parts = [];
  if (def.capTable) {
    const n = def.capTable[Math.min(level, def.capTable.length) - 1].toLocaleString();
    parts.push(def.capKey === 'housing' ? `housing ${n}` : `holds ${n} (${storeGoods(def)})`);
  }
  for (const [key, value] of Object.entries(def.effect)) parts.push(`+${value * level} ${EFFECT_LABELS[key] || key}`);
  for (const [id, amount] of Object.entries(def.passive)) parts.push(`+${fmt(amount * level)} ${RESOURCE_BY_ID[id].name}/h ${def.allDay ? '(all day)' : '(day shift)'}`);
  const jobs = PROFESSIONS.filter(p => p.requires.includes(def.id));
  if (jobs.length) parts.push(`${2 * level} seats for ${jobs.map(j => j.name.toLowerCase()).join('/')}`);
  return parts.join(' · ') || 'a necessary foundation';
}
const buy = (label, price, attr, enabled) => `<button class="buy" ${attr} ${enabled ? '' : 'disabled'}>${label}<small>${esc(price)}</small></button>`;

function buildingCard(def) {
  const insts = game.instances(def.id);
  const built = insts.length;
  const canMore = built < def.max;
  const buildCost = game.buildCost(def);
  const head = !built ? 'not built' : built === 1 ? `Lv ${insts[0].level}/10` : `${built} built`;
  const rows = insts.map((inst, i) => {
    const maxed = inst.level >= 10;
    const up = maxed ? null : game.upgradeCost(inst);
    const cap = game.capacityOf(inst);
    return `<div class="inst"><span>${built > 1 ? `#${i + 1} ` : ''}Lv ${inst.level}/10${cap ? ` · ${cap.toLocaleString()}` : ''}</span>${maxed ? '<span class="dim">finest level</span>' : buy(`Upgrade → ${inst.level + 1}`, cost(up), attribute('upgrade', inst.uid), game.canAfford(up))}</div>`;
  }).join('');
  const manage = built > 2 ? drop(`manage:${def.id}`, `Manage all ${built}`, rows) : rows;
  const info = [`<p>${def.description}</p>`, `<div class="tiny dim">Each level: ${statsAt(def, 1)}</div>`];
  if (built) { const inst = insts[0]; if (inst.level < 10) info.push(`<div class="tiny dim">Next level: ${statsAt(def, inst.level + 1)}</div>`); }
  info.push(`<div class="tiny dim">Up to ${def.max} may be built. Upgrades go to level 10.</div>`);
  const exceeds = canMore && game.costExceedsStorage(buildCost);
  return `<article class="card building ${built ? 'built' : ''}"><div class="card-head"><h3>${def.name}</h3><span class="pill">${head}</span></div>
    <div class="card-line">${statsAt(def, built ? insts[0].level : 1)}</div>${manage}
    ${canMore ? buy(built ? 'Build another' : 'Build', cost(buildCost), attribute('build', def.id), game.canAfford(buildCost)) : `<div class="tiny dim">${def.max === 1 ? 'Only one can be built.' : 'No more can be built.'}</div>`}
    ${exceeds ? '<div class="tiny warning">Needs a bigger store to hold the materials.</div>' : ''}
    ${drop(`info:${def.id}`, 'Info', info.join(''), { cls: 'info' })}</article>`;
}

function availableBuildings(tiers) { return BUILDINGS.filter(b => tiers.includes(b.tier) && game.buildingAvailable(b)); }
function readyCount(defs) {
  return defs.filter(def => (game.countBuilt(def.id) < def.max && game.canAfford(game.buildCost(def))) || game.instances(def.id).some(i => i.level < 10 && game.canAfford(game.upgradeCost(i)))).length;
}

// ---------------------------------------------------------------------------------------------
// Sidebar: only what matters at a glance. Detail lives in dropdowns and on the Stores tab.
// ---------------------------------------------------------------------------------------------
function warnings(stats) {
  const s = game.state;
  const out = [];
  if (s.hunger > 0) out.push('Villagers are starving. Work is slow and some may leave.');
  else if (s.hungerFlags.low) out.push('Food is running low.');
  RESOURCES.filter(r => game.isRevealed(r.id) && stats.ledger[r.id].full && stats.ledger[r.id].overflow > 0.05).forEach(r => out.push(`${game.storeName(r.id)} is full: ${r.name} is overflowing.`));
  if (stats.pop > stats.housing) out.push('Some villagers have no proper housing.');
  if (stats.pop && stats.happiness < 40) out.push('The settlement is unhappy. Work and arrivals suffer.');
  return out;
}

function sidebar(stats) {
  const s = game.state;
  const resources = RESOURCES.filter(r => game.isRevealed(r.id));
  const relics = s.relics.map(id => RELICS.find(r => r.id === id)).filter(Boolean);
  const warn = warnings(stats);
  const parts = [];
  parts.push(`<div class="section"><div class="section-title">Resources</div>${resources.map(r => {
    const l = stats.ledger[r.id];
    const tip = `${r.name}: ${rate(l.net) || 'no change'}/day${Number.isFinite(l.cap) ? ` · limit ${fmt(l.cap)} (${game.storeName(r.id)})` : ' · no storage limit'}`;
    return `<div class="resource-row r2" title="${esc(tip)}"><span class="resource-name">${r.name}</span><span class="amount ${l.full ? 'warning' : ''}">${fmt(l.stock)}${l.full ? ' full' : ''}</span></div>`;
  }).join('')}</div>`);
  if (warn.length) parts.push(`<div class="section"><div class="section-title">Warnings</div>${warn.map(w => `<div class="notice">${esc(w)}</div>`).join('')}</div>`);
  if (game.unlocked('villagerMgmt')) {
    const foodDays = stats.foodUse ? game.resource('food') / stats.foodUse : null;
    parts.push(`<div class="section"><div class="section-title">People</div>
      <div class="stat-row r2"><span>Villagers</span><span>${stats.pop} / ${stats.housing}</span></div>
      <div class="stat-row r2"><span>Working</span><span>${stats.employed}</span></div>
      <div class="stat-row r2"><span>Unemployed</span><span class="${stats.unemployed ? 'warning' : ''}">${stats.unemployed}</span></div>
      <div class="stat-row r2"><span>Mood</span><span class="${stats.happiness > 80 ? 'positive' : stats.happiness < 40 ? 'negative' : ''}">${pct(stats.happiness)}</span></div>
      ${drop('side:people', 'More', `<div class="stat-row r2"><span>Arrival chance</span><span>${stats.housing > stats.pop ? `${stats.recruitChance}%/min` : 'no free bed'}</span></div>
        <div class="stat-row r2"><span>Food eaten</span><span>${fmt(stats.foodUse)}/day${foodDays !== null ? ` · ${foodDays.toFixed(1)}d left` : ''}</span></div>
        ${stats.children ? `<div class="stat-row r2"><span>Children</span><span>${stats.children}</span></div>` : ''}${stats.away ? `<div class="stat-row r2"><span>Away</span><span>${stats.away}</span></div>` : ''}
        ${stats.guard ? `<div class="stat-row r2"><span>Guards</span><span>${stats.guard}</span></div>` : ''}`, { cls: 'small' })}</div>`);
  }
  const bonusRows = [];
  if (s.buildings.length) bonusRows.push(`<div class="stat-row r2"><span>Building levels</span><span>${game.totalBuildingLevels()}</span></div>`);
  if (game.unlocked('research')) bonusRows.push(`<div class="stat-row r2"><span>Research</span><span>${game.totalResearch()} theories</span></div>`);
  if (game.unlocked('map')) bonusRows.push(`<div class="stat-row r2"><span>Travel speed</span><span>+${stats.travel.toFixed(0)}%</span></div>`);
  if (game.costDiscount() > 0) bonusRows.push(`<div class="stat-row r2"><span>Build discount</span><span>${(game.costDiscount() * 100).toFixed(0)}%</span></div>`);
  if (s.prestigeCount) bonusRows.push(`<div class="stat-row r2"><span>Prestige cycles</span><span>${s.prestigeCount}</span></div>`);
  if (game.hasBuilding('temple')) BLESSINGS.filter(b => game.blessingLevel(b.id) > 0).forEach(b => bonusRows.push(`<div class="stat-row r2"><span>${b.name}</span><span>Lv ${game.blessingLevel(b.id)}</span></div>`));
  if (bonusRows.length) parts.push(`<div class="section">${drop('side:bonuses', 'Bonuses', bonusRows.join(''))}</div>`);
  if (game.unlocked('ancientRuins')) {
    parts.push(`<div class="section">${drop('side:relics', `Relics <span class="dim">${relics.length}/${RELICS.length}</span>`, relics.length
      ? `<ul class="mini-list">${relics.map(r => `<li title="${esc(r.description)}">${esc(r.name)} <span class="dim">+${r.value}% ${esc(r.kind)}</span></li>`).join('')}</ul>`
      : '<div class="empty">Nothing strange has been found.</div>')}</div>`);
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
  return shown.map(([resource, amount]) => `${amount > 0 ? '+' : ''}${amount} ${RESOURCE_BY_ID[resource]?.name || resource}`).join(' · ') + (hidden ? ' · more' : '');
}

function actionCard(id) {
  const action = ACTIONS[id];
  const waiting = (game.state.actionCooldowns[id] || 0) - Date.now();
  const enabled = waiting <= 0 && (!action.rewards.torch || game.resource('torch') >= Math.abs(action.rewards.torch));
  return `<article class="action-card" title="${esc(action.description)}"><button class="act" ${attribute('action', id)} ${enabled ? '' : 'disabled'}>${waiting > 0 ? `${action.name} <small>${time(waiting)}</small>` : action.name}</button><div class="cost">${rewardText(action)}</div></article>`;
}
function actionGrid(tab) {
  const ids = game.actionsFor(tab === 'Main' ? 'Camp' : tab);
  return ids.length ? `<div class="action-grid">${ids.map(actionCard).join('')}</div>` : '';
}
const head = (title, sub = '') => `<h1 class="headline">${title}</h1>${sub ? `<p class="subline">${sub}</p>` : ''}`;

function baseView() {
  const campfire = BUILDINGS.find(b => b.id === 'campfire');
  const intro = game.state.tracking.actions < 3
    ? 'You stand alone at the edge of the dark. Cold air, the sound of leaves, and trees close at hand. A fire would change everything, and a fire needs wood.'
    : game.buildingAvailable(campfire) ? 'You have enough wood to make a fire.' : 'The wood pile grows. Keep going.';
  return `${head('EMBERFALL', intro)}${actionGrid('Main')}
    ${game.buildingAvailable(campfire) && !game.hasBuilding('campfire') ? `<div class="card-grid">${buildingCard(campfire)}</div>` : ''}`;
}

function mainTab(stats) {
  if (!game.unlocked('camp')) return baseView();
  const campfire = BUILDINGS.find(b => b.id === 'campfire');
  const notes = `<ul class="mini-list"><li>Every villager eats 2 food per day. Food use now: ${fmt(stats.foodUse)}/day.</li><li>One day lasts 20 minutes: 14 of daylight, 6 of night.</li><li>${game.state.villagers.length ? 'Villagers work from 08:00 to 17:00 by default.' : 'Someone may come to the fire if it stays warm and there is food.'}</li></ul>`;
  return `${head('Camp', 'The fire keeps the worst of the dark at bay.')}${actionGrid('Main')}
    <div class="card-grid" style="margin-top:10px">${buildingCard(campfire)}</div>${drop('main:notes', 'Notes', notes)}`;
}

function villageTab(stats) {
  const all = availableBuildings(VILLAGE_TIERS);
  const housing = game.unlocked('housingMgmt') ? drop('village:housing', `Housing <span class="dim">${stats.pop} / ${stats.housing}</span>`, `${progress(stats.pop, Math.max(1, stats.housing))}<p class="tiny">Villagers need a bed. A recruitment check runs every minute while one is free (${stats.recruitChance}% now): +2% per extra hut, +5% Tavern, +5% above 80% mood, 40% at most.</p>`) : '';
  const groups = BUILDING_GROUPS.map(([name, ids]) => {
    const defs = all.filter(b => ids.includes(b.id));
    if (!defs.length) return '';
    const ready = readyCount(defs);
    const builtCount = defs.filter(b => game.hasBuilding(b.id)).length;
    return drop(`grp:${name}`, `${name} <span class="dim">${builtCount}/${defs.length}${ready ? ` · ${ready} ready` : ''}</span>`, `<div class="card-grid">${defs.map(buildingCard).join('')}</div>`, { open: ready > 0, cls: 'group' });
  }).join('');
  const blessings = game.hasBuilding('temple') ? drop('village:blessings', 'Blessings', `<div class="card-grid">${BLESSINGS.map(b => {
    const lv = game.blessingLevel(b.id);
    return `<article class="card"><div class="card-head"><h3>${b.name}</h3><span class="pill">Lv ${lv}/5</span></div>${lv >= 5 ? '<div class="tiny dim">Fully awakened</div>' : buy('Improve', cost({ essence: 2 + lv * 2, ancientDust: 1 + lv }), attribute('blessing', b.id), true)}${drop(`info:bless:${b.id}`, 'Info', `<p>${b.description}. Each level adds a small permanent improvement.</p>`, { cls: 'info' })}</article>`;
  }).join('')}</div>`) : '';
  return `${head('Village', 'Raise shelters and workplaces. Everything here must be built before it helps.')}${housing}${groups || '<div class="empty">Nothing to build yet.</div>'}${blessings}`;
}

function storesTab(stats) {
  const defs = availableBuildings(['Storage']);
  const classLines = Object.entries(STORAGE_CLASSES).map(([cls, info]) => {
    const items = info.items.filter(id => game.isRevealed(id));
    if (!items.length) return '';
    return `<div class="store-line"><span class="muted">${info.name}</span><span>${items.map(id => `${RESOURCE_BY_ID[id].name} ${fmt(game.resource(id))}/${fmt(stats.ledger[id].cap)}`).join(' · ')}</span></div>`;
  }).join('');
  const rows = RESOURCES.filter(r => game.isRevealed(r.id)).map(r => {
    const l = stats.ledger[r.id];
    const limited = Number.isFinite(l.cap);
    return `<tr><td>${r.name}</td><td>${fmt(l.stock)}${limited ? ` / ${fmt(l.cap)}` : ' <span class="dim">no limit</span>'}</td><td class="positive">${l.prod ? `+${fmt(l.prod)}` : '—'}</td><td class="negative">${l.cons ? `−${fmt(l.cons)}` : '—'}</td><td class="${l.net >= 0 ? 'positive' : 'negative'}">${l.net ? `${l.net > 0 ? '+' : '−'}${fmt(Math.abs(l.net))}` : '—'}</td><td class="${l.overflow > .05 ? 'warning' : 'dim'}">${l.overflow > .05 ? `+${fmt(l.overflow)}` : '—'}</td></tr>`;
  }).join('');
  const anyFull = RESOURCES.some(r => stats.ledger[r.id].full && stats.ledger[r.id].overflow > .05);
  return `${head('Stores', 'Each kind of good needs its own store. Gold and other special items need none.')}
    ${anyFull ? '<div class="notice">A store is full. Upgrade it or build another to stop losing production.</div>' : ''}
    <div class="panel-box">${classLines || '<div class="empty">Build a store to see what it holds.</div>'}</div>
    ${drop('stores:accounts', 'Accounts <span class="dim">per in-game day</span>', `<table class="wide-table"><thead><tr><th>Resource</th><th>Stored</th><th>Made</th><th>Used</th><th>Net</th><th>Overflow</th></tr></thead><tbody>${rows}</tbody></table>`, { open: true })}
    ${drop('stores:build', 'Build stores', `<div class="card-grid">${defs.map(buildingCard).join('') || '<div class="empty">No stores available yet.</div>'}</div>`, { open: true })}`;
}

function villagersTab(stats) {
  const s = game.state;
  const chips = PROFESSIONS.filter(p => p.id !== 'idle' && (game.jobSlots(p) > 0 || s.villagers.some(v => v.profession === p.id))).map(p => {
    const filled = s.villagers.filter(v => v.profession === p.id).length;
    const slots = game.jobSlots(p);
    return `<span class="chip ${Number.isFinite(slots) && filled >= slots ? 'full' : ''}" title="${esc(p.description)}">${p.name} ${filled}/${Number.isFinite(slots) ? slots : '∞'}</span>`;
  }).join('');
  const roster = s.villagers.length ? `<table class="wide-table"><thead><tr><th>Name</th><th>Nature</th><th>Lv</th><th>Work</th><th>Hours</th><th>Mood</th></tr></thead><tbody>${s.villagers.map(v => {
    const options = PROFESSIONS.filter(p => p.id === v.profession || game.jobAvailable(p)).map(p => {
      const taken = s.villagers.filter(x => x.profession === p.id).length;
      const slots = game.jobSlots(p);
      return `<option value="${p.id}" ${p.id === v.profession ? 'selected' : ''}>${p.name}${p.id === 'idle' ? '' : ` (${taken}/${Number.isFinite(slots) ? slots : '∞'})`}</option>`;
    }).join('');
    const schedules = game.availableSchedules(v);
    return `<tr><td>${esc(v.name)} <span class="dim">${v.age}</span>${v.away ? ' <span class="dim">away</span>' : ''}</td><td><span class="pill">${esc(v.personality?.name)}</span></td><td>${v.skill}</td>
      <td><select ${attribute('assign', v.id)}>${options}</select></td>
      <td>${schedules.length > 1 ? `<select ${attribute('schedule', v.id)}>${schedules.map(id => `<option value="${id}" ${id === v.schedule ? 'selected' : ''}>${SCHEDULES[id].name}</option>`).join('')}</select>` : `<span class="dim">${SCHEDULES[v.schedule]?.name || ''}</span>`}</td>
      <td class="${v.happiness < 40 ? 'negative' : ''}">${pct(v.happiness)}</td></tr>`;
  }).join('')}</tbody></table>` : '<div class="empty">No villagers yet.</div>';
  const mood = stats.happinessParts.map(([label, d]) => `<div class="stat-row r2"><span>${label}</span><span class="${d > 0 ? 'positive' : d < 0 ? 'negative' : ''}">${d > 0 ? '+' : ''}${d}</span></div>`).join('');
  const families = `<p class="tiny">Villagers pair up and have children by themselves when the settlement is happy, well fed and has a spare bed. Children join the workforce after a day.</p>
    <div class="stat-row r2"><span>Families</span><span>${s.families.length}</span></div><div class="stat-row r2"><span>Children growing up</span><span>${stats.children}</span></div>`;
  return `${head('Villagers')}
    <div class="strip"><span><b>${stats.pop}</b> villagers</span><span><b>${stats.employed}</b> working</span><span class="${stats.unemployed ? 'warning' : ''}"><b>${stats.unemployed}</b> unemployed</span><span>housing <b>${stats.pop}/${stats.housing}</b></span></div>
    <div class="inline-actions"><button ${attribute('autohire', s.autoHire ? 'off' : 'on')} class="${s.autoHire ? 'important' : ''}">Auto-hire: ${s.autoHire ? 'ON' : 'OFF'}</button></div>
    <p class="tiny dim">${s.autoHire ? 'Idle villagers take open job seats on their own, food first when stores run low.' : 'Auto-hire is off. Assign villagers yourself in the roster.'}${stats.unemployed ? ' Unemployed villagers need free seats: build or upgrade workplaces.' : ''}</p>
    ${chips ? `<div class="chips">${chips}</div>` : ''}
    ${drop('villagers:roster', `Roster <span class="dim">${stats.pop}</span>`, roster)}
    ${drop('villagers:mood', `Mood <span class="dim">${pct(stats.happiness)}</span>`, `${mood}<p class="tiny dim">${game.timeInfo().activity} now. Routine: 06-08 breakfast, 08-17 work, 17-19 rest, 19-22 dinner, 22-06 sleep. Guards may take the night watch.</p>`)}
    ${game.unlocked('villagerEvents') ? drop('villagers:families', 'Families', families) : ''}`;
}

function actionTab(tab, title, sub, extra = '') { return `${head(title, sub)}${actionGrid(tab)}${extra}`; }
function forestTab() { return actionTab('Forest', 'Forest', 'Food and timber, and quiet places that are never empty.'); }
function mineTab() { return actionTab('Mine', 'Mine', 'Iron lies behind the quarry wall.'); }
function caveTab() {
  const torch = RECIPES.find(r => r.id === 'torch');
  return actionTab('Cave', 'Cave', 'Every descent burns a torch. Deeper means better rewards.',
    `<div class="card-grid" style="margin-top:10px"><article class="card"><div class="card-head"><h3>Torches</h3><span class="pill">${fmt(game.resource('torch'))} held</span></div><div class="card-line">Depth ${game.state.caveDepth}</div>${buy('Make torches', `${cost(torch.cost)} → ${torch.result.torch}`, attribute('craft', 'torch'), game.canAfford(torch.cost))}</article></div>`);
}

function estateTab() {
  const list = availableBuildings(['Estate', 'Royal', 'Arcane']);
  const chain = ['ironIngot', 'steelBar', 'healingPotion', 'travelRations'].map(id => RECIPES.find(r => r.id === id)).filter(r => r && game.recipeVisible(r) && game.hasBuilding('workshop'));
  const prestige = game.unlocked('prestige') ? drop('estate:prestige', 'Prestige: New Flame+', `<p class="tiny">At 45 building levels you may begin again, keeping some relics and gaining Ember Shards (+2% production each). Optional.</p><button class="important" ${attribute('prestige', 'now')} ${game.totalBuildingLevels() < 45 ? 'disabled' : ''}>Rekindle (${game.totalBuildingLevels()}/45)</button>`) : '';
  return `${head('Estate', 'Production chains and the grand works of a growing realm.')}
    ${chain.length ? drop('estate:chain', 'Production chains', `<p class="tiny">Iron + coal make steel; herbs + water make potions.</p><div class="inline-actions">${chain.map(r => buy(r.name, cost(r.cost), attribute('craft', r.id), game.canAfford(r.cost))).join('')}</div>`) : ''}
    ${prestige}
    ${drop('estate:build', `Construction <span class="dim">${list.length}</span>`, list.length ? `<div class="card-grid">${list.map(buildingCard).join('')}</div>` : '<div class="empty">Nothing new is within reach yet.</div>', { open: true })}`;
}

function mapTab() {
  const s = game.state;
  const levels = game.totalBuildingLevels();
  const regions = REGIONS.filter(r => levels >= r.unlock);
  const hidden = REGIONS.length - regions.length;
  const hero = game.readyHero();
  const walker = hero ? hero.name : game.freeVillagers()[0]?.name;
  return `${head('Map', 'Send a hero or a villager out. Expeditions take 1–10 minutes.')}
  ${s.expeditions.length ? `<div class="callout good">${s.expeditions.map(e => { const r = REGIONS.find(x => x.id === e.regionId); return `${r.name} · ${time((e.endsAt - s.clock) * 1000)}`; }).join(' &nbsp;|&nbsp; ')}</div>` : ''}
  ${game.resource('maps') >= 1 ? `<div class="callout">You hold ${fmt(game.resource('maps'))} treasure map${game.resource('maps') >= 2 ? 's' : ''}. <button ${attribute('usemap', '1')}>Follow a map</button></div>` : ''}
  <div class="card-grid">${regions.map(region => {
    const full = s.expeditions.length >= game.maxParties();
    return `<article class="card building"><div class="card-head"><h3>${region.name}</h3><span class="pill">${Math.round(game.expeditionSeconds(region) / 6) / 10} min</span></div>
      <button class="buy" ${attribute('expedition', region.id)} ${full || !walker ? 'disabled' : ''}>${full ? 'Parties away' : walker ? `Send ${esc(walker)}` : 'Nobody free'}</button>
      ${drop(`info:region:${region.id}`, 'Info', `<p>${region.description}</p><div class="tiny dim">Find: ${region.rewards.map(id => RESOURCE_BY_ID[id].name).join(', ')}<br>Threat: ${ENEMIES.find(e => e.id === region.enemy)?.name || 'Unknown'}</div>`, { cls: 'info' })}</article>`;
  }).join('')}</div>
  ${hidden ? `<div class="empty">${hidden} more region${hidden > 1 ? 's' : ''} lie beyond what the settlement can reach.</div>` : ''}
  ${game.unlocked('worldBosses') ? drop('map:bosses', 'World bosses', `<div class="card-grid">${BOSSES.map(boss => `<article class="card"><div class="card-head"><h3>${boss.name}</h3></div><div class="card-line">${boss.hp} health · ${boss.attack} attack</div><button class="buy" ${attribute('boss', boss.id)} ${hero ? '' : 'disabled'}>Challenge</button></article>`).join('')}</div>`) : ''}`;
}

function tradeTab() {
  const s = game.state;
  const sellable = TRADABLE.filter(id => game.isRevealed(id) && game.resource(id) >= 10).slice(0, 12);
  return `${head('Trade', `The merchant’s stock changes in ${time((s.merchantRefresh - s.clock) * 1000)}.`)}
    <div class="panel-box">${game.marketItems().map(item => `<div class="store-line"><span>${item.amount} ${RESOURCE_BY_ID[item.resource].name}</span>${buy('Buy', `${item.cost} ${RESOURCE_BY_ID[item.currency].name}`, attribute('buy', item.id), game.canAfford({ [item.currency]: item.cost }))}</div>`).join('') || '<div class="empty">Nothing on offer.</div>'}</div>
    ${drop('trade:sell', 'Sell goods', sellable.length ? `<div class="inline-actions">${sellable.map(id => `<button ${attribute('sell', id)} title="Sell 10 for ${game.sellPrice(id, 10)} gold">${RESOURCE_BY_ID[id].name} <small>${game.sellPrice(id, 10)}g</small></button>`).join('')}</div><p class="tiny dim">Each button sells 10.</p>` : '<div class="empty">You have nothing worth selling yet.</div>', { open: true })}`;
}

function achievementsTab() {
  const s = game.state;
  const pending = ACHIEVEMENTS.filter(a => game.achievementVisible(a) && !s.claimedAchievements.includes(a.id))
    .map(a => ({ a, current: game.achievementProgress(a) }))
    .sort((x, y) => (y.current >= y.a.target) - (x.current >= x.a.target) || y.current / y.a.target - x.current / x.a.target);
  const shown = pending.slice(0, 8);
  return `${head('Achievements', `${s.claimedAchievements.length}/${ACHIEVEMENTS.length} claimed. Finished ones disappear.`)}
  <div class="card-grid">${shown.map(({ a, current }) => {
    const ready = current >= a.target;
    return `<article class="card"><div class="card-head"><h3>${a.name}</h3><span class="pill">${fmt(Math.min(current, a.target))}/${a.target}</span></div>${progress(current, a.target)}<div class="tiny dim">${a.description}</div>${buy(ready ? 'Claim' : 'In progress', cost(Object.fromEntries(Object.entries(a.reward).filter(([, n]) => n > 0))), attribute('achievement', a.id), ready)}</article>`;
  }).join('') || '<div class="empty">Nothing left to claim for now.</div>'}</div>
  ${pending.length > shown.length ? `<div class="empty">${pending.length - shown.length} more are still out of sight.</div>` : ''}`;
}

function eventsTab() {
  return `${head('Events')}${drop('events:list', 'Recent events', `<ul class="mini-list">${game.state.logs.slice(0, 50).map(item => `<li><span class="dim">${clockTime(item.at)}</span> ${esc(item.text)}</li>`).join('')}</ul>`, { open: true })}`;
}

function dungeonTab() {
  const d = game.state.dungeon;
  return `${head('Dungeon', 'Heroes recover after defeat; no one is lost.')}
  ${d ? `<div class="callout fire"><h3 class="headline">Floor ${d.floor}</h3><p>You hear something moving ahead. ${d.cleared}/${d.rooms} rooms searched, ${d.treasure} treasures found.</p><div class="inline-actions"><button class="important" ${attribute('dungeon', 'continue')}>Continue</button><button ${attribute('dungeon', 'retreat')}>Retreat</button></div></div>` : `<div class="card-grid"><article class="card building"><div class="card-head"><h3>Forgotten dungeon</h3></div><div class="card-line">${fmt(game.resource('torch'))} torches · ${game.state.heroes.filter(h => !h.recovering).length} ready heroes</div><button class="buy" ${attribute('dungeon', 'start')} ${game.resource('torch') ? '' : 'disabled'}>Descend</button></article></div>`}`;
}

function researchTab() {
  return `${head('Research', 'Researchers and libraries generate research points.')}<div class="card-grid">${Object.entries(RESEARCH).map(([branch, nodes]) => {
    const level = game.state.research[branch];
    const max = level >= nodes.length;
    const c = game.researchCost(level);
    return `<article class="card building"><div class="card-head"><h3>${branch[0].toUpperCase() + branch.slice(1)}</h3><span class="pill">${level}/${nodes.length}</span></div>${progress(level, nodes.length)}<div class="card-line">${max ? 'Complete' : `Next: ${nodes[level]}`}</div>${max ? '' : buy('Study', cost(c), attribute('research', branch), game.canAfford(c))}
      ${drop(`info:research:${branch}`, 'Info', nodes.map((n, i) => `<div class="tiny ${i < level ? 'positive' : 'dim'}">${i < level ? '✓' : '·'} ${n}</div>`).join(''), { cls: 'info' })}</article>`;
  }).join('')}</div>`;
}

function craftingTab() {
  const visible = RECIPES.filter(r => game.recipeVisible(r));
  const categories = [...new Set(visible.map(r => r.category))];
  const hiddenCount = RECIPES.length - visible.length;
  return `${head('Crafting', `${visible.length} recipes known. Research reveals more.`)}
  ${categories.map((category, i) => drop(`craft:${category}`, `${category} <span class="dim">${visible.filter(r => r.category === category).length}</span>`, `<div class="card-grid">${visible.filter(r => r.category === category).map(recipe => `<article class="card"><div class="card-head"><h3>${recipe.name}</h3></div><div class="card-line">${recipe.result.equipment ? recipe.result.equipment : Object.entries(recipe.result).map(([id, n]) => `+${n} ${RESOURCE_BY_ID[id]?.name}`).join(', ')}</div>${buy('Craft', cost(recipe.cost), attribute('craft', recipe.id), game.canAfford(recipe.cost))}</article>`).join('')}</div>`, { open: i === 0 })).join('')}
  ${hiddenCount ? `<div class="empty">${hiddenCount} more recipes are still unknown.</div>` : ''}`;
}

function heroesTab() {
  const s = game.state;
  const c = game.heroCost();
  return `${head('Heroes', 'Automatic text combat. Heroes level up and recover after a defeat.')}
  <div class="inline-actions">${buy('Recruit a hero', cost(c), attribute('hero', 'recruit'), game.canAfford(c))}</div>
  <div class="card-grid" style="margin-top:8px">${s.heroes.map(hero => `<article class="card building"><div class="card-head"><h3>${esc(hero.name)}</h3><span class="pill ${hero.rarity.toLowerCase()}">${hero.rarity}</span></div><div class="card-line">Lv ${hero.level} ${hero.class} · ${hero.recovering ? `recovering ${time((hero.recovering - s.clock) * 1000)}` : 'ready'}</div>${progress(hero.health, hero.maxHealth, 'hero-health')}<button class="buy" ${attribute('selecthero', hero.id)} ${s.selectedHero === hero.id ? 'disabled' : ''}>${s.selectedHero === hero.id ? 'Selected' : 'Select'}</button>${drop(`info:hero:${hero.id}`, 'Stats', `<div class="tiny dim">${Math.ceil(hero.health)}/${hero.maxHealth} health · ${hero.attack} attack · ${hero.defence} defence · speed ${hero.speed}<br>Experience ${hero.experience}</div>`, { cls: 'info' })}</article>`).join('') || '<div class="empty">No hero has yet come to the settlement.</div>'}</div>
  ${s.equipment.length ? drop('heroes:gear', `Equipment <span class="dim">${s.equipment.length}</span>`, `<ul class="mini-list">${s.equipment.map((item, index) => `<li>${esc(item.name)} <span class="pill ${item.rarity.toLowerCase()}">${item.rarity}</span> <span class="dim">Lv ${item.level || 1}/10</span> <button ${attribute('equipment', index)} ${(item.level || 1) >= 10 ? 'disabled' : ''}>Improve</button></li>`).join('')}</ul>`) : ''}`;
}

function petsTab() {
  const s = game.state;
  const pets = game.unlocked('animalTracks') ? drop('pets:pets', `Pets <span class="dim">${s.pets.length}/${PETS.length}</span>`, `<div class="card-grid">${PETS.map(pet => {
    const owned = s.pets.includes(pet.id);
    const level = s.petLevels[pet.id] || 1;
    return `<article class="card"><div class="card-head"><h3>${pet.name}</h3><span class="pill">${owned ? `Lv ${level}/10` : 'wild'}</span></div><div class="card-line">${pet.bonus}</div>${owned ? buy('Train', cost({ food: 8 + level * 2, herbs: 1 }), attribute('feedpet', pet.id), level < 10) : buy('Foster', '30 Gold, 20 Food', attribute('pet', pet.id), game.canAfford({ gold: 30, food: 20 }))}</article>`;
  }).join('')}</div>`, { open: true }) : '';
  const mounts = game.hasBuilding('stable') ? drop('pets:mounts', `Mounts <span class="dim">${s.mounts.length}/${MOUNTS.length}</span>`, `<div class="card-grid">${MOUNTS.map(mount => { const owned = s.mounts.includes(mount.id); return `<article class="card"><div class="card-head"><h3>${mount.name}</h3><span class="pill">${owned ? 'trained' : 'wild'}</span></div><div class="card-line">${mount.bonus}</div>${owned ? '' : buy('Acquire', '110 Gold, 12 Leather, 30 Food', attribute('mount', mount.id), game.canAfford({ gold: 110, leather: 12, food: 30 }))}</article>`; }).join('')}</div>`) : '';
  const monsters = game.hasBuilding('monsterSanctuary') ? drop('pets:monsters', 'Monster sanctuary', s.monsters.length ? `<ul class="mini-list">${s.monsters.map(m => `<li>${esc(typeof m === 'string' ? m : m.name)} <span class="dim">${typeof m === 'string' ? 'settled safely' : m.bonus}</span></li>`).join('')}</ul>` : '<div class="empty">Defeated creatures can sometimes be calmed rather than driven away.</div>') : '';
  return `${head('Companions', 'Their quiet bonuses stack.')}${pets}${mounts}${monsters}`;
}

function questsTab() {
  const list = QUESTS.filter(q => game.questVisible(q) && !game.state.quests[q.id]);
  return `${head('Quests', 'Finished quests disappear.')}<div class="card-grid">${list.map(q => {
    const current = game.progressQuest(q);
    return `<article class="card"><div class="card-head"><h3>${q.name}</h3><span class="pill">${fmt(Math.min(current, q.target))}/${q.target}</span></div>${progress(current, q.target)}<div class="tiny dim">${q.text}</div>${buy(current >= q.target ? 'Claim' : 'In progress', cost(q.reward), attribute('quest', q.id), current >= q.target)}</article>`;
  }).join('') || '<div class="empty">No quests right now.</div>'}</div>`;
}

const TAB_RENDERERS = { Main: mainTab, Village: villageTab, Villagers: villagersTab, Stores: storesTab, Forest: forestTab, Mine: mineTab, Cave: caveTab, Estate: estateTab, Map: mapTab, Trade: tradeTab, Crafting: craftingTab, Dungeon: dungeonTab, Research: researchTab, Heroes: heroesTab, Pets: petsTab, Quests: questsTab, Achievements: achievementsTab, Events: eventsTab };

function content(stats) {
  // "Main" is always there so the player can return from any tab. The nav bar only appears
  // once a second tab has been earned, which keeps the very first screen bare.
  const earned = game.visibleTabs(TABS).filter(t => t.id !== 'Camp');
  const tabs = [{ id: 'Main' }, ...earned];
  if (game.state.selectedTab === 'Camp' || !tabs.some(t => t.id === game.state.selectedTab)) game.state.selectedTab = 'Main';
  const current = game.state.selectedTab;
  const nav = tabs.length > 1 ? `<nav class="nav">${tabs.map(t => `<button ${attribute('tab', t.id)} class="${current === t.id ? 'active' : ''}">${t.id}</button>`).join('')}</nav>` : '';
  return { nav, body: TAB_RENDERERS[current](stats) };
}

// ---------------------------------------------------------------------------------------------
// Header, settings, log, dialogs
// ---------------------------------------------------------------------------------------------
function eventCard(e) {
  const labels = { story_traveller: ['Welcome', 'Turn away'], story_merchant: ['Greet them', 'Send away'], traveller: ['Welcome', 'Decline'], merchant: ['Accept gift', 'Decline'], festival: ['Hold festival', 'Skip'], chest: ['Open chest', 'Leave it'], threat: ['Defend', 'Stay inside'] };
  const [yes, no] = labels[e.kind] || ['Accept', 'Decline'];
  return `<div class="callout fire event-card"><h3 class="headline">${esc(e.title)}</h3><p>${esc(e.body)}</p><div class="inline-actions"><button class="important" ${attribute('event', 'accept')}>${yes}</button><button ${attribute('event', 'decline')}>${no}</button></div></div>`;
}

function settingsMenu() {
  const body = `<div class="text-size"><span class="dim">Text size</span><button ${attribute('ui', 'down')} ${uiScale <= UI_MIN ? 'disabled' : ''} aria-label="Smaller text">A−</button><span class="size-value">${uiScale}%</span><button ${attribute('ui', 'up')} ${uiScale >= UI_MAX ? 'disabled' : ''} aria-label="Larger text">A+</button>${uiScale !== 100 ? `<button ${attribute('ui', 'reset')}>Reset</button>` : ''}</div>
    <div class="inline-actions"><button ${attribute('manage', 'save')}>Save</button><button ${attribute('manage', 'export')}>Export</button><button ${attribute('manage', 'import')}>Import</button><button class="danger" ${attribute('manage', 'reset')}>Reset game</button></div>`;
  return `<details class="drop settings" data-panel="settings" ${isOpen('settings') ? 'open' : ''}><summary>Settings</summary><div class="pop">${body}</div></details>`;
}

function logPanel() {
  const logs = game.state.logs;
  const latest = logs[0];
  return `<details class="drop log-panel" data-panel="log" ${isOpen('log') ? 'open' : ''}><summary><span class="section-title">Log</span> <span class="log-latest">${latest ? esc(latest.text) : ''}</span></summary><div class="log-body">${logs.slice(0, 20).map(item => `<div class="log-entry"><span class="log-time">${clockTime(item.at)}</span><span>${esc(item.text)}</span></div>`).join('')}</div></details>`;
}

function offlineReportMarkup(r) {
  const list = obj => Object.entries(obj).map(([id, n]) => `${n.toLocaleString()} ${RESOURCE_BY_ID[id].name}`);
  const gains = list(r.gains);
  const losses = list(r.losses);
  const wasted = list(r.wasted);
  return `<div class="modal-layer"><div class="modal"><h2 class="headline">Welcome back</h2><p class="subline">While you were away${r.capped ? ' (the first 8 hours count)' : ''}: ${r.minutes} minutes.</p>
    ${gains.length ? `<ul class="mini-list">${gains.map(x => `<li class="positive">+${x}</li>`).join('')}</ul>` : '<p class="dim">Nothing was gathered.</p>'}
    ${losses.length ? `<p class="tiny dim">Used: ${losses.join(', ')}</p>` : ''}
    ${wasted.length ? `<p class="notice">A store was full. Lost: ${wasted.join(', ')}.</p>` : ''}
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
// Rendering and input
// ---------------------------------------------------------------------------------------------
const SCROLLERS = ['.sidebar', '.tab-content', '.log-body', '.modal'];

function render() {
  const active = document.activeElement;
  // Do not tear down a control the player is using (an open drop-down or a text box).
  if (active && /^(SELECT|TEXTAREA|INPUT)$/.test(active.tagName) && root.contains(active)) return;
  const saved = SCROLLERS.map(sel => { const el = root.querySelector(sel); return el ? el.scrollTop : 0; });
  const stats = game.getStats();
  const { nav, body } = content(stats);
  const info = game.timeInfo();
  const pending = game.state.pendingEvent ? eventCard(game.state.pendingEvent) : '';
  root.innerHTML = `<div class="game-shell"><header class="masthead"><div><span class="logo">EMBERFALL</span> <span class="tagline">a settlement in the dark</span></div>
    <div class="masthead-right">${game.unlocked('camp') ? `<div class="clock">Day ${info.day} · ${info.time} · ${info.daytime ? 'day' : 'night'} · ${info.season} · ${info.weather}</div>` : ''}${settingsMenu()}</div></header>
    <div class="layout">${sidebar(stats)}<main class="main">${nav}<section class="tab-content">${pending}${body}</section></main></div>${logPanel()}</div>${modalMarkup()}`;
  SCROLLERS.forEach((sel, i) => { const el = root.querySelector(sel); if (el) el.scrollTop = saved[i]; });
}

root.addEventListener('click', event => {
  // Dropdowns are toggled here (not natively) so the open state survives the once-a-second redraw.
  const summary = event.target.closest('summary');
  if (summary) {
    const details = summary.parentElement;
    if (details?.dataset?.panel) { event.preventDefault(); panels[details.dataset.panel] = !details.open; savePanels(); render(); }
    return;
  }
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
  else if (data.autohire) game.setAutoHire(data.autohire === 'on');
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
