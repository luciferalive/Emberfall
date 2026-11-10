import { Game } from './state.js';
import {
  RESOURCES, PROFESSIONS, BUILDINGS, REGIONS, ENEMIES, BOSSES, RELICS, BLESSINGS,
  PETS, MOUNTS, RECIPES, RESEARCH, QUESTS, ACHIEVEMENTS, ACTIONS, RESOURCE_BY_ID
} from './data.js';

const game = new Game();
const root = document.querySelector('#app');
const tabs = ['Cave','Village','Forest','Estate','Map','Achievements','Events','Dungeon','Research','Crafting','Heroes','Pets','Quests'];
let modal = null;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[char]));
const fmt = value => game.format(value);
const cost = object => game.describeCost(object);
const time = ms => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return seconds >= 60 ? `${Math.floor(seconds/60)}m ${seconds%60}s` : `${seconds}s`;
};
const pct = value => `${Math.max(0, Math.min(100,value)).toFixed(0)}%`;
const progress = (current,target,cls='') => `<div class="progress ${cls}"><span style="width:${Math.min(100,current/target*100)}%"></span></div>`;
const attribute = (name, value) => `data-${name}="${esc(value)}"`;

function renderResourceRows(stats) {
  return RESOURCES.map(resource => {
    const rate = stats.production[resource.id] || 0;
    const rateText = Math.abs(rate) < .04 ? '' : `${rate > 0 ? '+' : ''}${fmt(rate)}/m`;
    return `<div class="resource-row"><span class="resource-name">${resource.name}</span><span class="amount">${fmt(game.resource(resource.id))}</span><span class="rate ${rate>0?'positive':'negative'}">${rateText}</span></div>`;
  }).join('');
}

function sidebar() {
  const stats = game.getStats();
  const relics = game.state.relics.map(id=>RELICS.find(r=>r.id===id)).filter(Boolean);
  const blessingItems = BLESSINGS.filter(b=>game.blessingLevel(b.id)>0);
  return `<aside class="sidebar">
    <div class="section"><div class="section-title">Resources <span class="dim">cap ${fmt(game.storageCap())}</span></div>${renderResourceRows(stats)}</div>
    <div class="section"><div class="section-title">Population</div>
      <div class="stat-row"><span>Villagers</span><span>${game.usedHousing()} / ${game.housing()}</span><span class="dim">homes</span></div>
      <div class="stat-row"><span>Happiness</span><span class="${stats.happiness>80?'positive':'warning'}">${pct(stats.happiness)}</span><span class="dim">${game.state.morale>=0?'+':''}${game.state.morale} morale</span></div>
      <div class="stat-row"><span>Arrival chance</span><span>${stats.recruitChance}%</span><span class="dim">/ min</span></div>
      <div class="stat-row"><span>Guards</span><span>${stats.guard}</span><span class="dim">watch</span></div>
    </div>
    <div class="section"><div class="section-title">Relics <span class="dim">${relics.length}/40</span></div>
      ${relics.length ? relics.map(r=>`<div class="mini-list"><li title="${esc(r.description)}">${esc(r.name)} <span class="dim">+${r.value}% ${esc(r.kind)}</span></li></div>`).join('') : '<div class="empty">Nothing strange has been found.</div>'}
    </div>
    <div class="section"><div class="section-title">Blessings</div>
      ${blessingItems.length ? blessingItems.map(b=>`<div class="stat-row"><span>${b.name}</span><span>Lv ${game.blessingLevel(b.id)}</span><span></span></div>`).join('') : '<div class="empty">The old powers are quiet.</div>'}
    </div>
    <div class="section"><div class="section-title">Settlement bonuses</div>
      <div class="stat-row"><span>Building levels</span><span>${game.totalBuildingLevels()}</span><span class="dim">total</span></div>
      <div class="stat-row"><span>Research</span><span>${game.totalResearch()}</span><span class="dim">theories</span></div>
      <div class="stat-row"><span>Travel</span><span>${stats.travel.toFixed(0)}%</span><span class="dim">faster</span></div>
      <div class="stat-row"><span>Prestige</span><span>${game.state.prestigeCount}</span><span class="dim">cycles</span></div>
    </div>
  </aside>`;
}

function nav() { return `<nav class="nav">${tabs.map(tab=>`<button ${attribute('tab',tab)} class="${game.state.selectedTab===tab?'active':''}">${tab}</button>`).join('')}</nav>`; }

function actionCard(id) {
  const action = ACTIONS[id]; const waiting = game.state.actionCooldowns[id] - Date.now();
  const enabled = !waiting && (!action.rewards.torch || game.resource('torch') >= Math.abs(action.rewards.torch));
  return `<article class="action-card"><h3>${action.name}</h3><p>${action.description}</p><div class="cost">${Object.entries(action.rewards).map(([resource,amount])=>`${amount>0?'+':''}${amount} ${RESOURCE_BY_ID[resource]?.name || resource}`).join(' · ')}</div><button ${attribute('action',id)} ${enabled?'':'disabled'}>${waiting>0?time(waiting):action.name}</button></article>`;
}

function caveTab() {
  const stats=game.getStats();
  return `<div class="tab-kicker">The first shelter</div><h1 class="headline">Cave</h1><p class="subline">The fire keeps the worst of the dark at bay. Deeper passages wait beyond its glow.</p>
    <div class="callout fire">Campfire level ${game.buildingLevel('campfire')} · cave depth ${game.state.caveDepth} · ${game.state.weather} ${game.state.season.toLowerCase()}</div>
    <div class="section"><div class="section-title">Gathering & mining</div><div class="action-grid">${['gather','mineStone','mineIron','mineCoal','caveExplore'].map(actionCard).join('')}</div></div>
    <div class="section two-col"><div><div class="section-title">Survival</div><div class="card"><h3>Keep the fire supplied</h3><p>Food is consumed at ${fmt(stats.foodUse)} per minute. Houses, wells, food and a tavern keep happiness high.</p><button ${attribute('build','campfire')}>Improve Campfire (${game.buildingCostText(BUILDINGS.find(b=>b.id==='campfire'))})</button></div></div>
    <div><div class="section-title">Cave discoveries</div><ul class="mini-list"><li>Shallow deposits yield stone and iron.</li><li>Depth ${game.state.caveDepth >= 5 ? 'reveals coal seams.' : 'will reveal coal seams soon.'}</li><li>Deep passages may hold relics, chambers, monsters, and treasure.</li></ul></div></div>`;
}

function buildingCard(building) {
  const level=game.buildingLevel(building.id), unlocked=game.unlockedBuilding(building), max=level>=10;
  const effects=Object.entries(building.effect).map(([key,value]) => `${value>0?'+':''}${value}${RESOURCE_BY_ID[key] ? ` ${RESOURCE_BY_ID[key].name}/m` : ` ${key}`}`).join(' · ');
  return `<article class="card"><div class="card-row"><h3>${building.name} <span class="dim">Lv ${level}/10</span></h3><span class="pill">${building.tier}</span></div><p>${building.description}</p><div class="cost">${effects || 'A necessary foundation.'}<br>${unlocked?game.buildingCostText(building):`Unlocks at ${building.tier==='Advanced'?6:building.tier==='Estate'?14:building.tier==='Royal'?24:35} building levels`}</div><button ${attribute('build',building.id)} ${!unlocked||max?'disabled':''}>${max?'Fully improved':level?'Upgrade':'Build'}</button></article>`;
}

function villageTab() {
  const stats=game.getStats();
  return `<div class="tab-kicker">Settlement management</div><h1 class="headline">Village</h1><p class="subline">Assign work, make room by the fire, and turn a camp into a refuge.</p>
  <div class="two-col"><div class="card"><h3>Life at the fire</h3><div class="stat-row"><span>Population</span><span>${game.usedHousing()} / ${game.housing()}</span><span>housing</span></div>${progress(game.usedHousing(),game.housing())}<div class="stat-row"><span>Happiness</span><span>${pct(stats.happiness)}</span><span>arrival ${stats.recruitChance}%</span></div>${progress(stats.happiness,100)}<p class="tiny">A recruitment check happens every minute when a house is free. Houses add 2% each, the Tavern adds 5%, and happiness above 80% adds 5%.</p></div>
  <div class="card"><h3>Families <span class="pill">optional</span></h3><p>${game.state.families.length ? `${game.state.families.length} family${game.state.families.length>1?'ies':'y'} established.` : 'Friendships can grow naturally without replacing new arrivals.'}</p><button ${attribute('family','join')}>Encourage a friendship</button>${game.state.families.some(f=>f.children>0)?` <button ${attribute('family','grow')}>Welcome grown children</button>`:''}</div></div>
  <div class="section"><div class="section-title">Workers</div>${workersTable()}</div>
  <div class="section"><div class="section-title">Construction</div><div class="card-grid">${BUILDINGS.filter(b=>['Basic','Advanced'].includes(b.tier)).map(buildingCard).join('')}</div></div>`;
}

function workersTable() {
  if (!game.state.villagers.length) return '<div class="empty">No villagers yet.</div>';
  return `<table class="wide-table"><thead><tr><th>Name</th><th>Nature</th><th>Skill</th><th>Work</th><th>Output</th></tr></thead><tbody>${game.state.villagers.map(v=>{
    const job=PROFESSIONS.find(p=>p.id===v.profession)||PROFESSIONS[0];
    return `<tr><td>${esc(v.name)}</td><td><span class="pill">${esc(v.personality?.name)}</span></td><td>${v.skill}</td><td><select ${attribute('assign',v.id)}>${PROFESSIONS.map(p=>`<option value="${p.id}" ${p.id===v.profession?'selected':''}>${p.name}</option>`).join('')}</select></td><td class="dim">${Object.entries(job.production).map(([id,n])=>`+${n} ${RESOURCE_BY_ID[id]?.name}`).join(', ') || '—'}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function forestTab() { return `<div class="tab-kicker">Beyond the warm stones</div><h1 class="headline">Forest</h1><p class="subline">The trees offer food and timber, but their quiet places are never empty.</p><div class="action-grid">${['gather','hunt','herbs','forestTreasure','caveExplore'].map(actionCard).join('')}</div>
<div class="section callout">Forest outings can uncover fur, leather, herbs, bones, treasure maps, rare pets and hostile animals. Build a Hunter Lodge to make hunting safer and richer.</div>`; }

function estateTab() { return `<div class="tab-kicker">A growing realm</div><h1 class="headline">Estate</h1><p class="subline">Production chains make the settlement more than the sum of its hands.</p>
<div class="two-col"><div class="card"><h3>Industrial work</h3><p>Iron and coal feed Steel; herbs and water make Healing Potions. Your Workshop, Blacksmith and Alchemist Laboratory unlock stronger work.</p><div class="inline-actions"><button ${attribute('craft','steelBar')}>Refine Steel</button><button ${attribute('craft','healingPotion')}>Brew Potion</button><button ${attribute('craft','travelRations')}>Make Rations</button></div></div><div class="card"><h3>Prestige: New Flame+</h3><p>At 45 building levels, kindle a new realm. Keep a selection of relics and gain Ember Shards.</p><button class="important" ${attribute('prestige','now')} ${game.totalBuildingLevels()<45?'disabled':''}>Rekindle (${game.totalBuildingLevels()}/45)</button></div></div>
<div class="section"><div class="section-title">Estate & royal construction</div><div class="card-grid">${BUILDINGS.filter(b=>!['Basic','Advanced'].includes(b.tier)).map(buildingCard).join('')}</div></div>`; }

function mapTab() {
  const expeditions=game.state.expeditions;
  return `<div class="tab-kicker">The wider world</div><h1 class="headline">Map</h1><p class="subline">Send parties into twelve regions. Expeditions take 1–10 minutes and return with meaningful finds.</p>
  ${expeditions.length?`<div class="callout good">${expeditions.map(e=>{const r=REGIONS.find(x=>x.id===e.regionId);return `${r.name} · ${time(e.endsAt-Date.now())}`}).join(' &nbsp; | &nbsp; ')}</div>`:''}
  <div class="card-grid">${REGIONS.map(region=>{const locked=game.totalBuildingLevels()<region.unlock;return `<article class="card"><div class="card-row"><h3>${region.name}</h3><span class="pill">${region.duration} min</span></div><p>${region.description}</p><div class="cost">Find: ${region.rewards.map(id=>RESOURCE_BY_ID[id].name).join(', ')}<br>Threat: ${ENEMIES.find(e=>e.id===region.enemy)?.name || 'Unknown'} · ${locked?`requires ${region.unlock} building levels`:'available'}</div><button ${attribute('expedition',region.id)} ${locked?'disabled':''}>Send expedition</button></article>`;}).join('')}</div>
  <div class="section"><div class="section-title">World bosses</div><div class="card-grid">${BOSSES.map(boss=>`<article class="card"><h3>${boss.name}</h3><p>${boss.hp} health · ${boss.attack} attack · rare rewards</p><button ${attribute('boss',boss.id)} ${!game.state.heroes.some(h=>!h.recovering)?'disabled':''}>Challenge</button></article>`).join('')}</div></div>`;
}

function achievementsTab() {
  const claimed=game.state.claimedAchievements.length;
  return `<div class="tab-kicker">Records of the flame</div><h1 class="headline">Achievements</h1><p class="subline">${claimed}/60 claimed. Every milestone returns supplies or research to the settlement.</p><div class="card-grid">${ACHIEVEMENTS.map(a=>{const current=game.achievementProgress(a), ready=current>=a.target, was=game.state.claimedAchievements.includes(a.id);return `<article class="card"><h3>${a.name} ${was?'<span class="positive">✓</span>':''}</h3><p>${a.description}</p><div class="cost">${a.kind}: ${fmt(current)}/${a.target} · reward ${cost(a.reward)}</div>${progress(current,a.target)}<button ${attribute('achievement',a.id)} ${!ready||was?'disabled':''}>${was?'Claimed':ready?'Claim reward':'In progress'}</button></article>`;}).join('')}</div>`;
}

function eventsTab() {
  const e=game.state.pendingEvent;
  return `<div class="tab-kicker">Things that happen in the dark</div><h1 class="headline">Events</h1><p class="subline">Most changes in EMBERFALL help the settlement. Expect one every three to five minutes.</p>
  ${e?eventCard(e):'<div class="callout">No urgent event. Keep working — travellers, merchants, festivals, chests and threats find their way to a growing fire.</div>'}
  <div class="section"><div class="section-title">Event log</div><div class="mini-list">${game.state.logs.slice(0,15).map(item=>`<li><span class="dim">${new Date(item.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span> ${esc(item.text)}</li>`).join('')}</div></div>`;
}

function eventCard(e) {
  const labels={traveller:['Welcome','Decline'],merchant:['Accept gift','Decline'],festival:['Hold festival','Skip'],chest:['Open chest','Leave it'],threat:['Defend','Stay inside']}; const [yes,no]=labels[e.kind]||['Accept','Decline'];
  return `<div class="callout fire"><h3 class="headline">${esc(e.title)}</h3><p>${esc(e.body)}</p><div class="inline-actions"><button class="important" ${attribute('event','accept')}>${yes}</button><button ${attribute('event','decline')}>${no}</button></div></div>`;
}

function dungeonTab() {
  const d=game.state.dungeon;
  return `<div class="tab-kicker">A cold stair beneath the settlement</div><h1 class="headline">Dungeon</h1><p class="subline">Procedural floors hold enemies, hidden rooms, mini-bosses and rare rewards. No villager is ever permanently harmed.</p>
  ${d?`<div class="callout fire"><h3 class="headline">Floor ${d.floor}</h3><p>You hear something moving ahead. ${d.cleared}/${d.rooms} rooms searched, ${d.treasure} treasures found.</p><div class="inline-actions"><button class="important" ${attribute('dungeon','continue')}>Continue</button><button ${attribute('dungeon','retreat')}>Retreat</button></div></div>`:`<div class="card"><h3>Forgotten dungeon</h3><p>${game.hasBuilding('dungeonEntrance')?'Bring torches and a ready hero below.':'Construct a Dungeon Entrance in the Estate first.'}</p><button ${attribute('dungeon','start')} ${!game.hasBuilding('dungeonEntrance')||!game.resource('torch')?'disabled':''}>Descend</button></div>`}
  <div class="section"><div class="section-title">Prepared supplies</div><div class="stat-row"><span>Torches</span><span>${fmt(game.resource('torch'))}</span><span class="dim">one is spent each room</span></div><div class="stat-row"><span>Ready heroes</span><span>${game.state.heroes.filter(h=>!h.recovering).length}</span><span class="dim">fighters</span></div></div>`;
}

function researchTab() {
  return `<div class="tab-kicker">What the old world knew</div><h1 class="headline">Research</h1><p class="subline">Affordable theory unlocks a faster, broader settlement. Researchers and libraries generate research points.</p><div class="card-grid">${Object.entries(RESEARCH).map(([branch,nodes])=>{const level=game.state.research[branch], next=nodes[level], max=level>=nodes.length; const researchCost={research:8+level*9,gold:10+level*12};return `<article class="card"><h3>${branch[0].toUpperCase()+branch.slice(1)} <span class="dim">${level}/${nodes.length}</span></h3><p>${nodes.map((node,i)=>`${i<level?'✓ ':i===level?'→ ':'· '}${node}`).join('<br>')}</p><div class="cost">${max?'The branch is complete.':`Next: ${next}<br>${cost(researchCost)}`}</div>${progress(level,nodes.length)}<button ${attribute('research',branch)} ${max?'disabled':''}>${max?'Complete':'Study next theory'}</button></article>`;}).join('')}</div>
  <div class="section"><div class="section-title">Blessings</div><div class="card-grid">${BLESSINGS.map(b=>`<article class="card"><h3>${b.name} <span class="dim">Lv ${game.blessingLevel(b.id)}/5</span></h3><p>${b.description}. Each level grants a small permanent improvement.</p><div class="cost">${game.blessingLevel(b.id)>=5?'Fully awakened':'Requires Ancient Dust and Essence'}</div><button ${attribute('blessing',b.id)} ${game.blessingLevel(b.id)>=5?'disabled':''}>Improve blessing</button></article>`).join('')}</div></div>`;
}

function craftingTab() {
  const categories=[...new Set(RECIPES.map(r=>r.category))];
  return `<div class="tab-kicker">Make the ordinary useful</div><h1 class="headline">Crafting</h1><p class="subline">${RECIPES.length} recipes across weapons, armour, tools, potions, food, materials and magical equipment. Research progressively reveals their methods.</p>
  ${categories.map(category=>`<div class="section"><div class="section-title">${category}</div><div class="card-grid">${RECIPES.filter(r=>r.category===category).map(recipe=>{const locked=game.totalResearch()<recipe.unlock;return `<article class="card"><h3>${recipe.name}</h3><p>${recipe.result.equipment?`${recipe.result.equipment} equipment; rarity is rolled when made.`:Object.entries(recipe.result).map(([id,n])=>`+${n} ${RESOURCE_BY_ID[id]?.name}`).join(', ')}</p><div class="cost">${locked?`Requires ${recipe.unlock} research`:cost(recipe.cost)}</div><button ${attribute('craft',recipe.id)} ${locked?'disabled':''}>Craft</button></article>`;}).join('')}</div></div>`).join('')}`;
}

function heroesTab() {
  return `<div class="tab-kicker">Those who walk into danger</div><h1 class="headline">Heroes</h1><p class="subline">Automatic text combat lets heroes gain levels, carry equipment and recover after a defeat.</p><div class="callout">${game.state.heroes.length?`${game.state.heroes.length} hero${game.state.heroes.length>1?'es':''} have heard of the ember.`:'No hero has yet come to the settlement.'} <button ${attribute('hero','recruit')}>Recruit a hero (${60+game.state.heroes.length*35} Gold, 25 Food)</button></div>
  <div class="card-grid">${game.state.heroes.length?game.state.heroes.map(hero=>`<article class="card"><div class="card-row"><h3>${hero.name} <span class="pill ${hero.rarity.toLowerCase()}">${hero.rarity}</span></h3><button ${attribute('selecthero',hero.id)} ${game.state.selectedHero===hero.id?'disabled':''}>${game.state.selectedHero===hero.id?'Selected':'Select'}</button></div><p>Level ${hero.level} ${hero.class} · ${hero.recovering?`recovering ${time(hero.recovering-Date.now())}`:'ready'}</p><div class="hero-health">${progress(hero.health,hero.maxHealth,'hero-health')}</div><div class="stat-row"><span>${Math.ceil(hero.health)}/${hero.maxHealth} health</span><span>${hero.attack} atk</span><span>${hero.defence} def</span></div><p class="tiny">Experience ${hero.experience} · speed ${hero.speed} · equipment ${hero.equipment.length}</p></article>`).join(''):'<div class="empty">Recruiting costs gold and food; heroes answer quickly in this kinder land.</div>'}</div>
  <div class="section"><div class="section-title">Equipment store</div>${game.state.equipment.length?`<ul class="mini-list">${game.state.equipment.map((item,index)=>`<li>${esc(item.name)} <span class="pill ${item.rarity.toLowerCase()}">${item.rarity}</span> <span class="dim">Lv ${item.level||1}/10</span> <button ${attribute('equipment',index)} ${(item.level||1)>=10?'disabled':''}>Improve</button></li>`).join('')}</ul>`:'<div class="empty">Craft weapons, armour, tools and magical items to build an equipment store.</div>'}</div>`;
}

function petsTab() {
  const pets=game.state.pets, mounts=game.state.mounts;
  return `<div class="tab-kicker">Creatures of the settlement</div><h1 class="headline">Pets & companions</h1><p class="subline">Collect twenty pets, six mounts, and friendly monsters. Their quiet bonuses stack.</p>
  <div class="section"><div class="section-title">Pets ${pets.length}/${PETS.length}</div><div class="card-grid">${PETS.map(pet=>{const owned=pets.includes(pet.id), level=game.state.petLevels[pet.id]||1;return `<article class="card"><h3>${pet.name} ${owned?'<span class="positive">✓</span>':''}</h3><p>${pet.bonus}${owned?` · level ${level}/10`:''}</p><button ${attribute('pet',pet.id)} ${owned?'disabled':''}>${owned?'At the fire':'Foster (30 Gold, 20 Food)'}</button>${owned?` <button ${attribute('feedpet',pet.id)} ${level>=10?'disabled':''}>Train</button>`:''}</article>`;}).join('')}</div></div>
  <div class="section"><div class="section-title">Mounts ${mounts.length}/${MOUNTS.length}</div><div class="card-grid">${MOUNTS.map(mount=>{const owned=mounts.includes(mount.id);return `<article class="card"><h3>${mount.name} ${owned?'<span class="positive">✓</span>':''}</h3><p>${mount.bonus}</p><button ${attribute('mount',mount.id)} ${owned?'disabled':''}>${owned?'Trained':'Acquire (110 Gold)'}</button></article>`;}).join('')}</div></div>
  <div class="section"><div class="section-title">Monster sanctuary</div>${game.state.monsters.length?`<ul class="mini-list">${game.state.monsters.map(monster=>`<li>${esc(typeof monster==='string'?monster:monster.name)} <span class="dim">${typeof monster==='string'?'settled safely':monster.bonus}</span></li>`).join('')}</ul>`:`<div class="empty">Build a Monster Sanctuary. Defeated creatures can sometimes be calmed rather than driven away.</div>`}</div>`;
}

function questsTab() {
  return `<div class="tab-kicker">Small promises, lasting change</div><h1 class="headline">Quests</h1><p class="subline">Daily, weekly, main, exploration, combat, building and collection goals keep the next reward close.</p><div class="card-grid">${QUESTS.map(q=>{const current=game.progressQuest(q),done=game.state.quests[q.id],ready=current>=q.target;return `<article class="card"><div class="card-row"><h3>${q.name}</h3><span class="pill">${q.type}</span></div><p>${q.text}</p><div class="cost">${fmt(current)}/${q.target} · reward ${cost(q.reward)}</div>${progress(current,q.target)}<button ${attribute('quest',q.id)} ${!ready||done?'disabled':''}>${done?'Completed':ready?'Claim reward':'In progress'}</button></article>`;}).join('')}</div>
  <div class="section"><div class="section-title">Family lives</div>${game.state.families.length?game.state.families.map(f=>`<div class="card"><p>A family has ${f.children} child${f.children===1?'':'ren'} in the settlement.</p><button ${attribute('child',f.id)}>Prepare for child (15 Food)</button></div>`).join(''):'<div class="empty">Families are optional. Recruitment keeps the settlement alive on its own.</div>'}</div>`;
}

function content() {
  const map={Cave:caveTab,Village:villageTab,Forest:forestTab,Estate:estateTab,Map:mapTab,Achievements:achievementsTab,Events:eventsTab,Dungeon:dungeonTab,Research:researchTab,Crafting:craftingTab,Heroes:heroesTab,Pets:petsTab,Quests:questsTab};
  return map[game.state.selectedTab]();
}

function contextPanel() {
  const current=game.state.pendingEvent;
  return `<aside class="context"><div class="section"><div class="section-title">Travelling merchant</div><p class="tiny muted">Stock changes in ${time(game.state.merchantRefresh-Date.now())}.</p>${game.state.market.map(item=>`<div class="card-row" style="margin:5px 0"><span>${item.amount} ${RESOURCE_BY_ID[item.resource].name}</span><button ${attribute('buy',item.id)}>${item.cost} ${RESOURCE_BY_ID[item.currency].name}</button></div>`).join('')}<div class="inline-actions"><button ${attribute('sell','wood')}>Sell 10 Wood</button><button ${attribute('sell','stone')}>Sell 10 Stone</button><button ${attribute('sell','food')}>Sell 10 Food</button></div></div>
  <div class="section"><div class="section-title">Active expeditions</div>${game.state.expeditions.length?game.state.expeditions.map(e=>{const r=REGIONS.find(x=>x.id===e.regionId); return `<div class="mini-list"><li>${r.name}<br><span class="dim">returns in ${time(e.endsAt-Date.now())}</span></li></div>`}).join(''):'<div class="empty">No party is away.</div>'}</div>
  <div class="section"><div class="section-title">Current event</div>${current?`<p>${esc(current.title)}</p><button ${attribute('tab','Events')}>Respond</button>`:'<div class="empty">The settlement is quiet.</div>'}</div>
  <div class="section"><div class="section-title">Save & manage</div><div class="footer-controls"><button ${attribute('manage','save')}>Save</button><button ${attribute('manage','export')}>Export</button><button ${attribute('manage','import')}>Import</button><button class="danger" ${attribute('manage','reset')}>Reset</button></div></div></aside>`;
}

function logPanel() {
  return `<section class="log-panel"><div class="section-title">Event log <span class="dim">latest ${game.state.logs.length}/50</span></div>${game.state.logs.slice(0,12).map(item=>`<div class="log-entry"><span class="log-time">${new Date(item.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span><span>${esc(item.text)}</span></div>`).join('')}</section>`;
}

function modalMarkup() {
  if (!modal) return '';
  if (modal.type==='export') return `<div class="modal-layer"><div class="modal"><h2 class="headline">Export EMBERFALL save</h2><p class="subline">Copy this text somewhere safe. It contains your whole settlement.</p><textarea readonly>${esc(game.exportSave())}</textarea><div class="inline-actions"><button ${attribute('modal','copy')}>Copy to clipboard</button><button ${attribute('modal','close')}>Close</button></div></div></div>`;
  if (modal.type==='import') return `<div class="modal-layer"><div class="modal"><h2 class="headline">Import save</h2><p class="subline">Paste a previously exported EMBERFALL save. Invalid data is rejected without changing the active game.</p><textarea id="save-import" placeholder="Paste save JSON here"></textarea><div class="inline-actions"><button class="important" ${attribute('modal','confirm-import')}>Import save</button><button ${attribute('modal','close')}>Cancel</button></div></div></div>`;
  return `<div class="modal-layer"><div class="modal"><h2 class="headline">Begin again?</h2><p class="subline">This removes the current local settlement. Export a save first if you may want it back.</p><div class="inline-actions"><button class="danger" ${attribute('modal','confirm-reset')}>Reset game</button><button ${attribute('modal','close')}>Cancel</button></div></div></div>`;
}

function render() {
  root.innerHTML = `<div class="game-shell"><header class="masthead"><div><span class="logo">EMBERFALL</span> <span class="tagline">a settlement in the dark</span></div><div class="clock">${game.state.season} · ${game.state.weather} · ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div></header><div class="layout">${sidebar()}<main class="main">${nav()}<section class="tab-content">${content()}</section></main>${contextPanel()}</div>${logPanel()}</div>${modalMarkup()}`;
}

root.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  const data = button.dataset;
  if (data.tab) { game.state.selectedTab=data.tab; game.emit(); return; }
  if (data.action) game.doAction(data.action);
  else if (data.build) game.build(data.build);
  else if (data.event) game.resolveEvent(data.event);
  else if (data.research) game.research(data.research);
  else if (data.craft) game.craft(data.craft);
  else if (data.expedition) game.startExpedition(data.expedition);
  else if (data.boss) game.fightWorldBoss(data.boss);
  else if (data.achievement) game.claimAchievement(data.achievement);
  else if (data.blessing) game.upgradeBlessing(data.blessing);
  else if (data.hero==='recruit') game.recruitHero();
  else if (data.selecthero) { game.state.selectedHero=data.selecthero; game.emit(); }
  else if (data.pet) game.adoptPet(data.pet);
  else if (data.feedpet) game.feedPet(data.feedpet);
  else if (data.mount) game.acquireMount(data.mount);
  else if (data.equipment) game.upgradeEquipment(Number(data.equipment));
  else if (data.quest) game.claimQuest(data.quest);
  else if (data.family==='join') game.joinFamily();
  else if (data.family==='grow') game.growChildren();
  else if (data.child) game.welcomeChild(data.child);
  else if (data.buy) game.buyMerchant(data.buy);
  else if (data.sell) game.sell(data.sell);
  else if (data.dungeon==='start') game.startDungeon();
  else if (data.dungeon) game.dungeonStep(data.dungeon);
  else if (data.prestige) game.prestige();
  else if (data.manage==='save') { game.save(); game.emit(); }
  else if (data.manage==='export') { modal={type:'export'}; render(); }
  else if (data.manage==='import') { modal={type:'import'}; render(); }
  else if (data.manage==='reset') { modal={type:'reset'}; render(); }
  else if (data.modal==='close') { modal=null; render(); }
  else if (data.modal==='copy') { navigator.clipboard?.writeText(game.exportSave()).then(()=>game.notify('Save copied to clipboard.')).catch(()=>game.notify('Copy was blocked; select the text manually.')); }
  else if (data.modal==='confirm-import') { const text=document.querySelector('#save-import')?.value || ''; if (game.importSave(text)) modal=null; render(); }
  else if (data.modal==='confirm-reset') { game.reset(); modal=null; }
});

root.addEventListener('change', event => {
  const el=event.target;
  if (el.matches('select[data-assign]')) game.assignVillager(el.dataset.assign,el.value);
});

game.subscribe(render);
render();
setInterval(()=>game.tick(),1000);
setInterval(()=>game.save(),30000);
