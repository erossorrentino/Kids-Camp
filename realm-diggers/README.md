# Realm Diggers

A block-building and mining adventure that runs in any modern web browser.
Dig deep, build big, collect rare **mods**, and discover **10 different realms**,
each with its own landscape, creatures, music, and its own secret way in.

It's an original game in the block-sandbox genre: its own name, world, creatures,
art (every texture is painted by code), sounds, and music.

## Play it

- **Easiest:** open `index.html` in Chrome, Edge, Firefox or Safari. Nothing to install.
- **One file to share:** run `python3 tools/build_single.py` and send `dist/realm-diggers.html`
  to anyone. It's fully self-contained.
- Works with keyboard + mouse, and on tablets and phones with on-screen touch controls.
- Worlds save automatically in the browser. There are 3 save slots, so siblings or campers can
  share one computer.

## Controls

| Keyboard & mouse | Touch | Action |
|---|---|---|
| W A S D | Left stick | Walk |
| Mouse (click the game first) | Drag the screen (aim with the + in the middle) | Look around |
| Hold left click | Hold the ⛏ **Mine** button | Mine blocks, hit creatures |
| Right click | Tap the 🧱 **Build** button (hold to keep placing) | Place blocks, eat, use items and blocks |
| Space (double-tap in Creative) | ⤒ | Jump / swim / fly |
| Shift | ⤓ | Sneak (won't fall off edges) / fly down |
| Ctrl or double-tap W | Push the stick all the way | Sprint |
| 1-9, mouse wheel | Tap the hotbar | Pick an item |
| E / M / G | 🎒 / ✦ / 📖 | Inventory & crafting / Mods / Realm Guide |
| X / R / F | Extra buttons | Mod powers: X-Ray, Blink, Roar |
| Esc | ⏸ | Pause |

## The 10 realms

Every realm has a different way in. Each arrival point gets a **Realm Gate** you can use
to fast-travel to any realm you've already discovered.

| Realm | What it's like | How to get there |
|---|---|---|
| **Greenhollow** | Home: meadows, forests, deserts, snowy peaks, oceans, caves | You start here |
| **Emberdeep** | Lava seas, ashstone spires, glowing cinder trees | Craft an **Ember Key**, hold it and jump into lava |
| **Frostveil** | Snowfields, giant ice spikes, auroras, slippery ice | Build a hollow **Ice frame** (hole 2 wide, 3 tall) and use a **Frost Crystal** on it |
| **Skyreach** | Floating islands over a sea of clouds | Build a tower in Greenhollow and climb **above the clouds** (height 124+) |
| **Hollow Deep** | A world with no sky: glowing mushrooms, crystal caves | Dig to the **bottom of the world** and break a glowing **Cracked Worldstone** |
| **Lunara** | The moon: low gravity, craters, a view of home | Build and launch a **Moon Rocket** |
| **Coral Abyss** | Coral reefs, kelp forests, palm islands (you can breathe here) | Find a **Conch Shell** on a beach and blow it **underwater** |
| **Sugarland** | Frosting hills, candy canes, lollipop trees, chocolate milk lakes | Craft a **Dream Bed** and take a nap |
| **Dino Valley** | Prehistoric jungle with volcanoes and dinosaurs | Dig up a **Fossil**, craft a **Time Clock**, use it |
| **Prismara** | Rainbow crystal spires; home of the **Prism Guardian** boss | Collect all **8 Realm Gems**, craft the **Star Key** |

Each realm (except home and Prismara) has a special ore that drops its **Realm Gem**.

## Mods

Mods are rare power-ups found while mining. Any ore can drop one, and sparkly
**Mod Geodes** always do. There are **36 mods** in 6 rarities
(Common, Uncommon, Rare, Epic, Legendary, Mythic):

- Found anywhere: Swift Feet, Spring Legs, Quick Pick, Lucky Miner, Tough Skin, Night Eyes,
  Iron Stomach, Treefeller, Regeneration, Feather Fall, Double Jump, Forge Touch, Mighty Arm,
  Vein Miner, Big Dig, **X-Ray Vision**, **Jetpack**
- Only found in one realm: Fireproof & Flame Fist (Emberdeep), Ice Path & Ice Skates (Frostveil),
  Glider & **Cloud Walker** (Skyreach), Glow Aura & Echo Sense (Hollow Deep), Moon Boots &
  **Meteor Stomp** (Lunara), Gills & Dolphin Kick (Coral Abyss), Sweet Tooth & Bubblegum Bounce
  (Sugarland), Dino Buddy & **Mega Roar** (Dino Valley)
- Mythic, only in Prismara: Prism Blink, Realm Master, Rainbow Luck

Finding a mod you already own **levels it up** (up to III). You can equip 4 at a time.
Finding 15 different mods unlocks a 5th slot, and beating the final boss unlocks another.

## Everything else

- **Survival** (health, hunger, air, monsters at night) and **Creative** (fly, every block, no damage).
  Monsters can be set to Peaceful, Easy or Normal.
- Crafting list that shows exactly what you're missing, with Workbench and Furnace stations.
- A **Materials** browser (in the crafting panel and the Realm Guide): pick any material to see where
  to find it and everything you can make with it. Tap an ingredient in any recipe to jump to it, and
  hover an item to see what it makes.
- Every block can be broken. Tough ones (Worldstone, Obsidian, Guardian Stone) need a Ruby Pickaxe to
  break quickly, and the game tells you which pickaxe you need. Buckets scoop up and pour water, lava
  and chocolate milk. You can even craft your own Realm Gate.
- Wood → Stone → Iron → Ruby → Prismatic tools, plus armor.
- The same blocks and items stack up to 100 per slot; different items never share a slot. Tools,
  armor, keys and filled buckets don't stack.
- 24 original creatures, from Fluffalos and Hopbuns to Gloomlings, Raptors, Yetis and Kingjaws.
- Boom Barrels (light one with an Igniter, then run), Bounce Pads, Scaffolding, Lanterns, beds,
  and 9 colors of Paint Blocks.
- An always-visible **Goal** that walks new players from their first log all the way to the final boss.
- Achievements, minimap, day/night cycle, rain, auroras, a rainbow, nebula skies, music for every realm.

## Project layout

```
index.html          page + HUD/menu markup
style.css           all UI styling
js/util.js          math, noise, RNG helpers
js/blocks.js        blocks, items, procedural textures and icons
js/realms.js        the 10 realm generators and their look
js/world.js         chunks, streaming, meshing, raycasting
js/render.js        WebGL2 renderer and shaders
js/mods.js          mod definitions, drop rolls, stat effects
js/crafting.js      recipes
js/audio.js         synthesized sound effects and music
js/mobs.js          creatures, physics, projectiles, particles, boss
js/ui.js            HUD, menus, inventory, touch controls
js/game.js          player, interaction, saving, main loop
tools/build_single.py   bundles everything into one HTML file
```

No libraries, no build step, no downloads: plain JavaScript and WebGL2.

## Ideas for campers who want to change it

- Add a block: copy a `block(...)` line in `js/blocks.js` and give it a texture in `TEXDEF`.
- Add a recipe: one `rec(...)` line in `js/crafting.js`.
- Invent a mod: add a `mod(...)` line in `js/mods.js` and use its level in `computeStats`.
- Tweak a realm: every realm in `js/realms.js` has its own colors, gravity, music and generator.
