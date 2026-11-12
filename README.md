# 🔥 EMBERFALL

> *A settlement in the dark.* A minimalist, text-only incremental survival game for the browser.

You begin alone, in the dark, with nothing. Chop a tree. Gather stones. Light a fire. Someone walks out of the night and asks to share it. From there, a camp becomes a village, a village becomes a realm, and everything you unlock, you earned.

No pixel art. No sprites. No animations. Just text, numbers, and a fire.

**[▶ Play it](https://luciferalive.github.io/emberfall/)** 

---

## How to play

### The first ten minutes
1. **Chop Trees.** It is the only thing you can do. Keep going.
2. At **20 wood** the soil gives up **stones**.
3. At **50 wood** you can build a **Campfire**. This opens the Camp, foraging for **food**, and the day/night clock.
4. Gather **30 food** and a **traveller** appears at the edge of the light. Welcome them. They are your first villager.
5. Build a **Small Hut** (50 wood, 20 stone). Villagers need beds, and new arrivals only come when one is free.
6. Build a **Lumber Yard** (40 wood) to raise your wood limit. Your first store unlocks the **Stores** tab, with a full account of every resource.
7. With **3 villagers**, you can assign professions.
8. Build a **Woodcutter Hut** and a **Farm** for automatic production. Idle villagers staff them automatically.

After that the game opens up on its own: a forest, an old mine with iron, a cave that needs torches, a Workshop for crafting, a Barracks for heroes, a Library for research, ancient ruins with relics, and beyond.

### Rules worth knowing
| System | How it works |
|---|---|
| **Time** | One day is **20 real minutes**: 14 of daylight, 6 of night. |
| **Work** | Villagers work **08:00–17:00**, rest, eat, and sleep at night. Production only happens during working hours. Guards can take the **night watch**. A Guild Hall unlocks a long-day shift (more output, less happiness). |
| **Food** | Every villager eats **2 food per day**. At zero, people go hungry: slower work, lower happiness. If it drags on, villagers may leave. Nobody is ever killed. |
| **Storage** | Each kind of bulk good has its own store: **Lumber Yard** (wood), **Stoneyard** (stone), **Granary** (food, meat, seeds, herbs, water), **Coal Shed**, **Ore Depot** (iron, steel, sulfur) and **Hide Store** (fur, leather, bones, silk). Build or upgrade them to raise the limit (500 → 1,000 → 2,000 → 4,000 → 8,000 …). A **Warehouse** adds room to every store. **Gold, silver, gems, crystal and other special items need no storage and have no limit.** Overflow is shown, never silently lost. |
| **Housing** | Hut capacity: 2 / 4 / 6 / 8 / 12 … by level. |
| **Recruitment** | Checked every 60 seconds while there is a free bed. **25%** base, up to **40%** (+2% per extra hut, +5% Tavern, +5% above 80% happiness). |
| **Families** | Villagers pair up and have children **by themselves** when the settlement is happy, well fed and has a spare bed. Children join the workforce after one in-game day. |
| **Happiness** | Food, housing, water, working hours, buildings, weather and festivals all matter. Low happiness cuts output and arrivals. |
| **Jobs** | **Auto-hire:** idle villagers take open job seats on their own (food first if stores run low). Each workplace level has 2 seats. The Villagers tab shows how many are working and how many are unemployed. You can switch auto-hire off and assign people yourself. |
| **Offline** | The game keeps running for up to **8 hours** while closed, respecting storage, hunger, work hours, and housing. |

### Tips
- Watch the **Warnings** panel on the left. It tells you about hunger and full storage before they hurt.
- Hover a resource in the left panel to see its daily change and limit.
- Build a **Well** early. Clean water is a happiness boost.
- Upgrading beats rebuilding: levels go to 10 and each one visibly changes the numbers.
- Open **Settings** (top right) and use **A− / A+** to change the text size (70%–200%). It is remembered in your browser.
- **Export** your save from the log panel now and then. Saves live in your browser's local storage.

---

## Features

- **Clean by design.** Details hide behind dropdowns: card **Info**, grouped village sections, a one-line **Log** you can expand, and a **Settings** menu (text size, save, export, import, reset). Finished achievements and quests disappear. Open panels are remembered.
- **Progressive unlocks.** The screen starts with three counters, one action, and a log. Tabs and resources appear only once earned; unlock rules live in one data table (`js/unlocks.js`).
- **40 upgradeable buildings** (level 1–10), 18 professions, 30 resources
- **Day/night clock, 4 seasons, 5 weather types** that change production
- **Resource accounting** on the Stores tab: stock, limit, production, consumption, net and overflow per resource
- **12 regions** to explore, timed expeditions, **30 enemies and 8 bosses** with text combat
- **Heroes** (8 classes, 6 rarities), **50 crafting recipes**, **40 relics**, **13 blessings**
- **20 pets, 6 mounts**, monster sanctuary, families and children (all optional)
- **Research** in 5 branches, quests, **60 achievements**, dungeons, treasure maps, world bosses
- **Trading:** travelling merchant, selling, changing stock
- **Optional prestige** (New Flame+) with permanent bonuses
- **Saving:** autosave, manual save, export/import, reset with confirmation, versioned saves that migrate from 1.x without handing you a free village

## Run locally

No build step, no dependencies.

```bash
git clone https://github.com/luciferalive/emberfall.git
cd emberfall
npx serve .        # or: python3 -m http.server 8000
```

Then open the printed address. (Opening `index.html` directly may be blocked by the browser, because the game uses ES modules.)

## Project layout

```
index.html        page shell
styles.css        black-and-grey text UI
js/
  app.js          rendering and input
  state.js        game engine: simulation, accounting, saves, offline
  data.js         resources, regions, enemies, relics, recipes, quests
  buildings.js    buildings, capacity tables, professions, actions
  unlocks.js      the unlock manager: features and tabs as data
  time.js         clock, days, seasons, work schedules
```

## Credits and licence

Inspired by the interface style of *A Dark Cave*. No code, text, or assets are copied from it.
