export const VERSION = 1;

export const RESOURCES = [
  ['wood','Wood',100], ['stone','Stone',60], ['food','Food',100], ['gold','Gold',100],
  ['silver','Silver',0], ['iron','Iron',0], ['coal','Coal',0], ['herbs','Herbs',10],
  ['bones','Bones',0], ['fur','Fur',0], ['leather','Leather',0], ['steel','Steel',0],
  ['torch','Torch',0], ['crystal','Crystal',0], ['sulfur','Sulfur',0], ['mithril','Mithril',0],
  ['ancientDust','Ancient Dust',0], ['magicEssence','Magic Essence',0], ['dragonScales','Dragon Scales',0],
  ['meat','Meat',0], ['seeds','Seeds',0], ['gems','Gems',0], ['essence','Essence',0],
  ['silk','Silk',0], ['ancientCoins','Ancient Coins',0], ['water','Water',0], ['research','Research',0],
  ['healingPotion','Healing Potion',0], ['maps','Treasure Maps',0], ['prestige','Ember Shards',0]
].map(([id,name,start]) => ({ id, name, start }));

export const RESOURCE_BY_ID = Object.fromEntries(RESOURCES.map(x => [x.id, x]));

export const PROFESSIONS = [
  ['idle','Idle','Await a task.',{}],
  ['woodcutter','Woodcutter','Brings timber from the tree line.',{wood:5}],
  ['miner','Miner','Works the shallow deposits.',{stone:3, iron:.35}],
  ['farmer','Farmer','Tends crops around the fire.',{food:8,seeds:.4}],
  ['hunter','Hunter','Tracks game in the forest.',{food:3,leather:1,fur:.5}],
  ['fisherman','Fisherman','Fishes the underground lake.',{food:5,water:1}],
  ['blacksmith','Blacksmith','Refines rough metal.',{steel:.45}],
  ['herbalist','Herbalist','Gathers useful plants.',{herbs:2,essence:.15}],
  ['builder','Builder','Makes construction less costly.',{}],
  ['guard','Guard','Keeps the settlement safe.',{}],
  ['researcher','Researcher','Studies the old world.',{research:1.5}],
  ['merchant','Merchant','Improves sale prices.',{gold:1}],
  ['cook','Cook','Turns food into morale.',{}],
  ['alchemist','Alchemist','Extracts magical compounds.',{magicEssence:.35}],
  ['explorer','Explorer','Improves expedition rewards.',{}],
  ['lumberjack','Lumberjack','Clears larger stands.',{wood:8}],
  ['furHunter','Fur Hunter','Brings pelts and meat.',{fur:1.5,meat:2}],
  ['stoneMason','Stone Mason','Cuts useful stone.',{stone:6}],
  ['trader','Trader','Finds better offers.',{silver:.5}]
].map(([id,name,description,production]) => ({id,name,description,production}));

export const PERSONALITIES = [
  ['Hardworking','production',.15], ['Lucky','rare',.10], ['Brave','combat',.15],
  ['Intelligent','research',.15], ['Merchant','trade',.10], ['Farmer','food',.20],
  ['Adventurous','explore',.15], ['Inventive','craft',.15]
].map(([name,bonus,value]) => ({name,bonus,value}));

export const BUILDINGS = [
  ['campfire','Campfire','Basic',{wood:10,stone:5},'The small flame is your first claim against the dark.',{happiness:2}],
  ['smallHouse','Small House','Basic',{wood:20,stone:10},'Room for two more people.',{housing:2}],
  ['farm','Farm','Basic',{wood:30},'A dependable plot of food.',{food:4}],
  ['woodcutterHut','Woodcutter Hut','Basic',{wood:25},'Shelter for timber workers.',{wood:3}],
  ['quarry','Quarry','Basic',{wood:30,stone:15},'Exposes workable stone.',{stone:2}],
  ['storage','Storage','Basic',{wood:25},'Raises resource capacity.',{storage:250}],
  ['well','Well','Basic',{wood:20,stone:15},'Fresh water raises spirits.',{water:3,happiness:1}],
  ['workshop','Workshop','Basic',{wood:40,stone:20},'Allows basic fabrication.',{craft:1}],
  ['tavern','Tavern','Basic',{wood:60,stone:20},'A warm room for newcomers.',{recruit:5,happiness:3}],
  ['hunterLodge','Hunter Lodge','Basic',{wood:45,stone:10},'Supports hunting parties.',{food:2,leather:1}],
  ['fishermanHut','Fisherman’s Hut','Basic',{wood:35,stone:10},'Opens the lake fishery.',{food:3,water:1}],
  ['blacksmith','Blacksmith','Advanced',{wood:80,stone:50,iron:10},'Refines iron and arms defenders.',{steel:.7,combat:2}],
  ['barracks','Barracks','Advanced',{wood:100,stone:70,iron:15},'Guards and heroes train here.',{guard:2,combat:3}],
  ['hospital','Hospital','Advanced',{wood:75,stone:45,herbs:20},'Heroes recover more quickly.',{recovery:20,happiness:2}],
  ['marketplace','Marketplace','Advanced',{wood:90,stone:40,gold:30},'Merchants visit more often.',{trade:10}],
  ['library','Library','Advanced',{wood:80,stone:60,gold:20},'Knowledge survives here.',{research:2}],
  ['mageTower','Mage Tower','Advanced',{stone:120,crystal:10,magicEssence:5},'An observatory for strange energies.',{magic:1}],
  ['watchtower','Watchtower','Advanced',{wood:70,stone:80},'Warns of danger.',{combat:2,rare:2}],
  ['stable','Stable','Advanced',{wood:90,stone:30,leather:15},'Care for swift mounts.',{travel:10}],
  ['guildHall','Guild Hall','Advanced',{wood:120,stone:80,gold:50},'Experts share their work.',{production:3}],
  ['trainingGrounds','Training Grounds','Advanced',{wood:80,stone:60,iron:20},'Heroes gain experience faster.',{heroXp:15}],
  ['alchemistLab','Alchemist Laboratory','Advanced',{wood:100,stone:50,herbs:30,crystal:5},'Brews potions and extracts.',{alchemy:1}],
  ['castle','Castle','Royal',{wood:300,stone:400,steel:50,gold:200},'The settlement becomes a realm.',{housing:10,happiness:5}],
  ['treasury','Treasury','Royal',{wood:140,stone:100,gold:100,steel:15},'Protects and compounds wealth.',{gold:5}],
  ['bakery','Bakery','Estate',{wood:70,stone:35,food:20},'Makes food go farther.',{food:5,happiness:2}],
  ['sawmill','Sawmill','Estate',{wood:100,stone:45,iron:10},'Processes timber efficiently.',{wood:7}],
  ['mine','Mine','Estate',{wood:120,stone:100,iron:20},'Reaches deeper ore veins.',{iron:2,coal:1}],
  ['jeweller','Jeweller','Estate',{wood:80,stone:40,gold:50,gems:3},'Cuts gems for value.',{gems:.4,gold:2}],
  ['temple','Temple','Estate',{wood:100,stone:120,gold:50},'Offers blessings to the faithful.',{blessing:1,happiness:4}],
  ['harbour','Harbour','Estate',{wood:180,stone:100,gold:60},'Water trade expands.',{trade:15,travel:10}],
  ['animalSanctuary','Animal Sanctuary','Estate',{wood:100,stone:50,food:100},'Pets are kept safe.',{petXp:10}],
  ['monsterSanctuary','Monster Sanctuary','Estate',{wood:150,stone:120,iron:30},'Captured creatures can rest.',{monster:1}],
  ['dungeonEntrance','Dungeon Entrance','Estate',{wood:100,stone:150,torch:10},'A sealed stairwell below.',{dungeon:1}],
  ['academy','Academy','Arcane',{wood:160,stone:140,gold:120,research:20},'Advanced studies flourish.',{research:5}],
  ['magicObservatory','Magic Observatory','Arcane',{stone:180,crystal:25,magicEssence:15},'Stars reveal hidden paths.',{explore:10}],
  ['dragonRoost','Dragon Roost','Arcane',{wood:220,stone:180,dragonScales:5,gold:150},'A home for a draconic companion.',{dragon:1,combat:5}],
  ['warehouse','Warehouse','Estate',{wood:140,stone:80,iron:15},'Stores much more.',{storage:800}],
  ['tradingPost','Trading Post','Estate',{wood:110,stone:50,gold:50},'Trade routes take shape.',{trade:20}],
  ['farmingEstate','Farming Estate','Estate',{wood:130,stone:50,seeds:20},'Fields stretch beyond the firelight.',{food:12}],
  ['researchLab','Research Laboratory','Arcane',{wood:150,stone:120,crystal:15,research:30},'Experiments accelerate discovery.',{research:8}]
].map(([id,name,tier,cost,description,effect]) => ({id,name,tier,cost,description,effect}));

export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map(x => [x.id, x]));

export const REGIONS = [
  ['greenForest','Green Forest',0,1,['wood','food','herbs'],'wolf', 'Sunlight barely filters through the old canopy.'],
  ['oldMine','Old Mine',3,2,['stone','iron','coal'],'caveBat', 'A forgotten shaft groans below the hills.'],
  ['darkCave','Dark Cave',5,3,['iron','crystal','bones'],'caveTroll', 'The known cave gives way to absolute dark.'],
  ['ancientRuins','Ancient Ruins',8,4,['ancientDust','ancientCoins','gems'],'stoneSentinel', 'Broken walls remember a vanished kingdom.'],
  ['frozenMountains','Frozen Mountains',12,5,['fur','mithril','crystal'],'frostWolf', 'Cold air turns every breath to smoke.'],
  ['forgottenTemple','Forgotten Temple',16,6,['magicEssence','ancientDust','gold'],'templeWraith', 'A door marked with names no one speaks.'],
  ['dragonValley','Dragon Valley',21,7,['dragonScales','gems','sulfur'],'youngDragon', 'Ash drifts down from distant wings.'],
  ['sunkenKingdom','Sunken Kingdom',27,8,['silver','ancientCoins','crystal'],'drownedKnight', 'Towers rise through a drowned plain.'],
  ['shadowForest','Shadow Forest',34,9,['silk','essence','magicEssence'],'shadowStalker', 'The trees move when you stop looking.'],
  ['crystalCaverns','Crystal Caverns',42,10,['crystal','mithril','gems'],'crystalGolem', 'Every footfall rings through a chamber of glass.'],
  ['lostKingdom','Lost Kingdom',52,10,['gold','ancientCoins','mithril'],'royalShade', 'A road of white stone leads to nowhere.'],
  ['shadowRealm','Shadow Realm',65,10,['essence','magicEssence','ancientDust'],'voidWarden', 'Beyond the last gate, the dark looks back.']
].map(([id,name,unlock,duration,rewards,enemy,description]) => ({id,name,unlock,duration,rewards,enemy,description}));

export const ENEMIES = [
  ['wolf','Wild Wolf',28,7],['boar','Forest Boar',36,9],['caveBat','Cave Bat',20,5],['goblin','Scavenger Goblin',44,11],['skeleton','Restless Skeleton',52,13],['bandit','Road Bandit',60,15],['caveTroll','Cave Troll',92,18],['spider','Silk Spider',38,8],['direWolf','Dire Wolf',96,20],['stoneSentinel','Stone Sentinel',125,22],['frostWolf','Frost Wolf',112,22],['iceWraith','Ice Wraith',130,25],['templeWraith','Temple Wraith',155,28],['basilisk','Basilisk',174,30],['youngDragon','Young Dragon',220,35],['drownedKnight','Drowned Knight',190,32],['reefSerpent','Reef Serpent',215,34],['shadowStalker','Shadow Stalker',245,38],['nightHag','Night Hag',260,42],['crystalGolem','Crystal Golem',290,45],['crystalSpider','Crystal Spider',235,39],['royalShade','Royal Shade',320,50],['ironGiant','Iron Giant',360,54],['voidWarden','Void Warden',430,64],['boneColossus','Bone Colossus',400,58],['fireDrake','Fire Drake',380,56],['mireBeast','Mire Beast',145,25],['harpy','Harpy',118,21],['slime','Cave Slime',30,6],['forestSprite','Forest Sprite',76,14]
].map(([id,name,hp,attack]) => ({id,name,hp,attack,boss:false}));

export const BOSSES = [
  ['forestGuardian','Forest Guardian',700,72],['frozenColossus','Frozen Colossus',900,88],['ancientDragon','Ancient Dragon',1200,110],['shadowTitan','Shadow Titan',1500,125],['demonKing','Demon King',1900,145],['sunkenEmperor','Sunken Emperor',1050,96],['crystalMonarch','Crystal Monarch',1300,118],['voidSovereign','Void Sovereign',2200,165]
].map(([id,name,hp,attack]) => ({id,name,hp,attack,boss:true}));

const relicSeeds = [
  ['Whispering Cube','explore',10],['Odd Elixir','production',10],['Wooden Figure','wood',10],['Ancient Book','research',15],['Golden Idol','gold',10],['Hunter’s Trophy','hunt',15],['Crystal Heart','health',10],['Sooted Compass','explore',8],['Mason’s Chisel','stone',12],['Coal Crown','coal',15],['Moonlit Lens','rare',8],['Iron Rosary','iron',12],['Lost Locket','recruit',4],['Tallow Candle','torch',20],['Bone Dice','lucky',5],['Silver Thimble','silver',12],['River Pearl','food',8],['Ashen Key','dungeon',10],['Foxfire Vial','herbs',15],['Cinder Bell','fire',5],['Sealed Hourglass','speed',6],['Mithril Thread','mithril',12],['Gilded Feather','trade',8],['Fallen Star','magic',10],['Amber Eye','pet',10],['Runed Anvil','craft',10],['Glass Seed','farm',12],['Obsidian Knife','combat',8],['King’s Token','prestige',5],['Oracle Bone','event',10],['Dragon Tooth','dragon',10],['Sunken Seal','treasure',12],['Shadow Mask','stealth',10],['Crystal Mandala','crystal',15],['Pilgrim’s Staff','travel',10],['Crown of Reeds','water',12],['Echoing Shell','essence',12],['Stag Antler','happiness',5],['Ember Stone','production',8],['Worldroot Fragment','all',3]
];
export const RELICS = relicSeeds.map(([name,kind,value], i) => ({id:`relic${i+1}`,name,kind,value,description:`${name} carries a quiet ${value}% ${kind} blessing.`}));

export const BLESSINGS = [
  ['caveExplore','Cave Explore','Cave rewards'],['chopWood','Chop Wood','Wood gathering'],['hunt','Hunt','Hunting yields'],['mine','Mine','Mining yields'],['mineStone','Mine Stone','Stone gains'],['mineIron','Mine Iron','Iron gains'],['mineCoal','Mine Coal','Coal gains'],['craftDiscount','Craft Discount','Crafting cost'],['buildDiscount','Build Discount','Construction cost'],['constructionTime','Construction Time','Building efficiency'],['doubleGain','Double Gain Chance','Action rewards'],['recruitment','Recruitment Bonus','Newcomers'],['exploration','Exploration Bonus','Expedition rewards']
].map(([id,name,description]) => ({id,name,description}));

export const HERO_CLASSES = ['Warrior','Archer','Mage','Paladin','Assassin','Druid','Berserker','Necromancer'];
export const HERO_RARITIES = ['Common','Uncommon','Rare','Epic','Legendary','Mythical'];

export const PETS = [
  ['cat','Cat','Happiness +3%'],['dog','Dog','Guard strength +5%'],['fox','Fox','Exploration rewards +10%'],['wolfPet','Wolf','Hunting production +10%'],['rabbit','Rabbit','Food production +5%'],['owl','Owl','Research speed +10%'],['babyDragon','Baby Dragon','Mining production +10%'],['phoenix','Phoenix','Hero recovery +20%'],['fairy','Fairy','Magic essence +10%'],['griffin','Griffin','Travel time -10%'],['shadowPanther','Shadow Panther','Rare find chance +8%'],['crystalTurtle','Crystal Turtle','Hero defence +10%'],['mole','Mole','Stone production +10%'],['otter','Otter','Fishing +10%'],['raven','Raven','Treasure find +10%'],['stag','Stag','Forest rewards +8%'],['salamander','Salamander','Fire actions +10%'],['sprite','Forest Sprite','Herb gathering +15%'],['wyvern','Baby Wyvern','Combat +8%'],['moth','Moon Moth','Night expeditions +10%']
].map(([id,name,bonus])=>({id,name,bonus}));

export const MOUNTS = [
  ['horse','Horse','Travel time -10%'],['direWolfMount','Dire Wolf','Combat +5%'],['giantEagle','Giant Eagle','Travel time -20%'],['griffinMount','Griffin','Exploration rewards +10%'],['dragonMount','Dragon','Combat +15%'],['shadowStag','Shadow Stag','Rare finds +10%']
].map(([id,name,bonus])=>({id,name,bonus}));

const recipeSeeds = [
  ['torch','Torch','Materials',{wood:2,coal:1},{torch:3}],['ironIngot','Iron Ingot','Materials',{iron:3,coal:1},{iron:5}],['steelBar','Steel Bar','Materials',{iron:4,coal:2},{steel:2}],['healingPotion','Healing Potion','Potions',{herbs:3,water:1},{healingPotion:1}],['travelRations','Travel Rations','Food',{food:8,meat:2},{food:18}],['leather','Cured Leather','Materials',{fur:3,herbs:1},{leather:3}],['rope','Silk Rope','Tools',{silk:2,leather:1},{equipment:'Silk Rope'}],['boneCharm','Bone Charm','Magical Items',{bones:5,essence:1},{equipment:'Bone Charm'}],['crystalFocus','Crystal Focus','Magical Items',{crystal:3,magicEssence:2},{equipment:'Crystal Focus'}],['mapCase','Map Case','Tools',{leather:2,wood:2},{equipment:'Map Case'}],
  ['woodAxe','Wood Axe','Tools',{wood:8,stone:3},{equipment:'Wood Axe'}],['ironAxe','Iron Axe','Tools',{wood:6,iron:5},{equipment:'Iron Axe'}],['mithrilAxe','Mithril Axe','Tools',{wood:6,mithril:3},{equipment:'Mithril Axe'}],['stonePick','Stone Pick','Tools',{wood:5,stone:6},{equipment:'Stone Pick'}],['ironPick','Iron Pick','Tools',{wood:4,iron:6},{equipment:'Iron Pick'}],['mithrilPick','Mithril Pick','Tools',{wood:4,mithril:4},{equipment:'Mithril Pick'}],['hunterKnife','Hunter Knife','Weapons',{wood:2,iron:4},{equipment:'Hunter Knife'}],['ironSword','Iron Sword','Weapons',{wood:2,iron:8},{equipment:'Iron Sword'}],['steelSword','Steel Sword','Weapons',{wood:2,steel:6},{equipment:'Steel Sword'}],['mithrilBlade','Mithril Blade','Weapons',{mithril:5,steel:3},{equipment:'Mithril Blade'}],
  ['shortBow','Short Bow','Weapons',{wood:8,leather:2},{equipment:'Short Bow'}],['longBow','Long Bow','Weapons',{wood:12,leather:4,silk:2},{equipment:'Long Bow'}],['emberStaff','Ember Staff','Weapons',{wood:6,crystal:2,magicEssence:2},{equipment:'Ember Staff'}],['wardStaff','Ward Staff','Weapons',{wood:5,crystal:4,essence:2},{equipment:'Ward Staff'}],['leatherVest','Leather Vest','Armour',{leather:6,fur:2},{equipment:'Leather Vest'}],['ironMail','Iron Mail','Armour',{iron:10,leather:3},{equipment:'Iron Mail'}],['steelPlate','Steel Plate','Armour',{steel:8,leather:4},{equipment:'Steel Plate'}],['furCloak','Fur Cloak','Armour',{fur:8,leather:2},{equipment:'Fur Cloak'}],['shadowCloak','Shadow Cloak','Armour',{silk:5,essence:2},{equipment:'Shadow Cloak'}],['crystalCrown','Crystal Crown','Armour',{crystal:7,gems:2},{equipment:'Crystal Crown'}],
  ['smokeBomb','Smoke Bomb','Potions',{sulfur:2,coal:1},{equipment:'Smoke Bomb'}],['ironTonic','Iron Tonic','Potions',{herbs:2,iron:1,water:1},{equipment:'Iron Tonic'}],['moonTea','Moon Tea','Potions',{herbs:3,essence:1,water:1},{equipment:'Moon Tea'}],['fireOil','Fire Oil','Potions',{sulfur:3,coal:1,herbs:1},{equipment:'Fire Oil'}],['meatPie','Meat Pie','Food',{meat:3,food:2},{food:12}],['seedCake','Seed Cake','Food',{seeds:4,food:4},{food:15}],['herbStew','Herb Stew','Food',{herbs:2,food:5},{food:16}],['fishingNet','Fishing Net','Tools',{silk:4,wood:3},{equipment:'Fishing Net'}],['explorerPack','Explorer Pack','Tools',{leather:4,wood:3,food:5},{equipment:'Explorer Pack'}],['minersLamp','Miner’s Lamp','Tools',{iron:2,torch:2,crystal:1},{equipment:'Miner’s Lamp'}],
  ['treasureCompass','Treasure Compass','Special Equipment',{iron:3,crystal:2,ancientCoins:3},{equipment:'Treasure Compass'}],['relicLens','Relic Lens','Special Equipment',{crystal:4,ancientDust:3},{equipment:'Relic Lens'}],['dragonSaddle','Dragon Saddle','Special Equipment',{leather:10,dragonScales:2,steel:3},{equipment:'Dragon Saddle'}],['monsterSnare','Monster Snare','Special Equipment',{iron:4,silk:3,food:4},{equipment:'Monster Snare'}],['travellersCloak','Traveller’s Cloak','Armour',{fur:5,silk:2,leather:2},{equipment:'Traveller’s Cloak'}],['sunCharm','Sun Charm','Magical Items',{gems:2,magicEssence:3,gold:10},{equipment:'Sun Charm'}],['voidSigil','Void Sigil','Magical Items',{ancientDust:4,essence:3,crystal:3},{equipment:'Void Sigil'}],['royalSeal','Royal Seal','Special Equipment',{gold:20,ancientCoins:8,steel:2},{equipment:'Royal Seal'}],['petTreats','Pet Treats','Food',{food:6,herbs:1},{equipment:'Pet Treats'}],['luckyCoin','Lucky Coin','Magical Items',{silver:10,gold:5},{equipment:'Lucky Coin'}]
];
export const RECIPES = recipeSeeds.map(([id,name,category,cost,result], index) => ({id,name,category,cost,result,unlock:Math.floor(index/6)}));

export const RESEARCH = {
  agriculture: ['Crop Rotation','Root Cellars','Orchard Lore','Irrigation','Harvest Festival'],
  construction: ['Stone Foundations','Efficient Joinery','Masonry Guild','Reinforced Stores','Grand Design'],
  military: ['Shield Wall','Hunter Drills','Steel Doctrine','Heroic Standards','Siege Craft'],
  economy: ['Market Stalls','Fair Weights','Trade Caravans','Coin Minting','Merchant League'],
  magic: ['Ember Runes','Crystal Theory','Warding','Soul Binding','Star Roads']
};

export const QUESTS = [
  {id:'firstSteps',type:'Main',name:'Keep the Flame',text:'Gather 150 wood.',metric:'gatherWood',target:150,reward:{gold:25,torch:3}},
  {id:'settle',type:'Main',name:'A Place to Stay',text:'Build two Small Houses.',metric:'buildSmallHouse',target:2,reward:{food:40,gold:20}},
  {id:'deepStone',type:'Main',name:'Below the Surface',text:'Mine 30 stone.',metric:'mineStone',target:30,reward:{iron:8,torch:4}},
  {id:'forestWalk',type:'Exploration',name:'Beyond the Firelight',text:'Complete a Green Forest expedition.',metric:'expedition',target:1,reward:{maps:1,food:30}},
  {id:'craftTorch',type:'Daily',name:'Tools for the Dark',text:'Craft 3 torches.',metric:'craftTorch',target:3,reward:{wood:20,stone:10}},
  {id:'hunterPath',type:'Combat',name:'A Safer Trail',text:'Win 3 encounters.',metric:'wins',target:3,reward:{leather:8,gold:30}},
  {id:'collector',type:'Collection',name:'Curious Things',text:'Find 3 relics.',metric:'relics',target:3,reward:{research:15,gems:2}},
  {id:'weeklyBuilder',type:'Weekly',name:'Growing Settlement',text:'Build 8 structures.',metric:'builds',target:8,reward:{gold:80,wood:100,stone:75}}
];

const achievementNames = [
  'First Spark','Fire Keeper','Hearth Builder','Village Voice','Warm Welcome','Crowded Fire','Wood Walker','Timber Baron','Stone Singer','Iron Seeker','Coal Hand','Steel Maker','Green Thumb','Full Larder','Hunter’s Mark','Herbal Wisdom','First Coin','Silver Tongue','Golden Age','Cave Delver','Deep Listener','Ruins Reader','Mountain Walker','Temple Keeper','Dragon Watcher','Drowned Crown','Shadow Step','Crystal Gazer','Lost Road','Realm Walker','First Relic','Curio Cabinet','Blessed Hands','Pet Friend','Pack Leader','Stable Master','First Hero','Company of Heroes','Veteran Guard','Boss Breaker','World Defender','First Craft','Master Artisan','Potion Brewer','Armourer','Toolmaker','First Theory','Researcher','Scholar','Archmage','First Trade','Market Master','Questing Soul','Daily Duty','Weekly Wonder','Treasure Seeker','Dungeon Diver','Floor Keeper','Prestige Flame','Ember Eternal'
];
export const ACHIEVEMENTS = achievementNames.map((name,index) => ({id:`a${index+1}`,name,description:['Begin your watch.','Reach a new milestone.','Make the dark a little smaller.'][index%3],target:(Math.floor(index/5)+1)*5,kind:['actions','builds','wins','relics','expedition'][index%5],reward:{gold:10+(index*3),research:index%4===0?3:0}}));

export const MERCHANT_ITEMS = [
  {id:'mWood',resource:'wood',amount:40,cost:12,currency:'gold'}, {id:'mFood',resource:'food',amount:45,cost:12,currency:'gold'},
  {id:'mIron',resource:'iron',amount:8,cost:25,currency:'gold'}, {id:'mHerbs',resource:'herbs',amount:12,cost:18,currency:'gold'},
  {id:'mTorch',resource:'torch',amount:5,cost:10,currency:'gold'}, {id:'mMap',resource:'maps',amount:1,cost:30,currency:'gold'}
];

export const ACTIONS = {
  gather: {name:'Gather Wood',description:'Collect fallen timber near the fire.',rewards:{wood:10},cooldown:2},
  mineStone: {name:'Mine Stone',description:'Chip at the cave mouth.',rewards:{stone:8},cooldown:3},
  mineIron: {name:'Mine Iron',description:'Follow an exposed red vein.',rewards:{iron:4,stone:2},cooldown:5},
  mineCoal: {name:'Mine Coal',description:'Bring back fuel from the black seam.',rewards:{coal:5,stone:2},cooldown:5},
  hunt: {name:'Hunt',description:'Follow tracks in the woods.',rewards:{food:9,fur:2,leather:1},cooldown:5},
  herbs: {name:'Gather Herbs',description:'Search the shaded undergrowth.',rewards:{herbs:4,water:1},cooldown:4},
  forestTreasure: {name:'Search for Treasure',description:'Look for a glint beneath the leaves.',rewards:{gold:9,ancientCoins:1},cooldown:8},
  caveExplore: {name:'Explore the Cave',description:'Push a little farther into the deep.',rewards:{torch:-1,iron:3,coal:3,ancientDust:1},cooldown:10}
};

export const NAMES = ['Alden','Bran','Cira','Dara','Elian','Fenn','Galen','Hesta','Ira','Jory','Kara','Lio','Mira','Nell','Orin','Pela','Quill','Rysa','Soren','Tala','Una','Venn','Wren','Yara','Zed'];
