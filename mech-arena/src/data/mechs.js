/**
 * MECH CHASSIS CATALOG
 * ------------------------------------------------------------------
 * A chassis defines the frame: how it moves, how much punishment each
 * section takes, what it can mount, and which special ability it carries.
 *
 * `build` drives the procedural model in world/mechBuilder.js -- there are
 * no imported art assets, every machine is assembled from primitives at
 * runtime so silhouettes stay readable and the whole game stays one folder.
 *
 * Section armour is per-location. Losing a side torso takes its weapons
 * with it; losing the centre torso or the cockpit ends the mech.
 */

/** Hardpoint locations, in the order the HUD lists them. */
export const LOCATIONS = ['HD', 'CT', 'LT', 'RT', 'LA', 'RA', 'LL', 'RL'];
export const LOCATION_NAMES = {
  HD: 'Cockpit', CT: 'Centre Torso', LT: 'Left Torso', RT: 'Right Torso',
  LA: 'Left Arm', RA: 'Right Arm', LL: 'Left Leg', RL: 'Right Leg',
};

export const CLASSES = {
  light:   { label:'LIGHT',   tonnage:[20, 39],  color:0x5df2a0 },
  medium:  { label:'MEDIUM',  tonnage:[40, 59],  color:0x49d6ff },
  heavy:   { label:'HEAVY',   tonnage:[60, 79],  color:0xffb454 },
  assault: { label:'ASSAULT', tonnage:[80, 100], color:0xff4d5e },
  support: { label:'SUPPORT', tonnage:[35, 70],  color:0xb47cff },
};

/* Per-location armour is expressed as a share of the chassis armour pool so
 * that rebalancing a mech means changing one number, not eight. */
const SPREAD = {
  balanced: { HD:0.06, CT:0.22, LT:0.14, RT:0.14, LA:0.10, RA:0.10, LL:0.12, RL:0.12 },
  frontal:  { HD:0.05, CT:0.30, LT:0.15, RT:0.15, LA:0.08, RA:0.08, LL:0.095, RL:0.095 },
  armsout:  { HD:0.05, CT:0.19, LT:0.12, RT:0.12, LA:0.16, RA:0.16, LL:0.10, RL:0.10 },
  legger:   { HD:0.06, CT:0.20, LT:0.13, RT:0.13, LA:0.09, RA:0.09, LL:0.15, RL:0.15 },
};

function hp(loc, size, n = 1) {
  return Array.from({ length: n }, () => ({ loc, size }));
}

const RAW = [
  /* ============================= LIGHT ============================= */
  { id:'wasp', name:'WASP', cls:'light', tons:24, armour:1150, spread:'balanced',
    speed:118, accel:34, turn:150, torsoTurn:210, heatCap:44, sinks:6.5,
    jets:{ thrust:20, fuel:5.2, regen:1.5 }, ability:'blink',
    hardpoints:[...hp('RA','M'), ...hp('LA','S'), ...hp('RT','S')],
    build:{ legs:'digitigrade', torso:'slim', cockpit:'visor', shoulders:'slim', arms:'gun', height:7.4, width:0.82, accents:2 },
    tier:1, cost:0, blurb:'Barely armoured, absurdly quick. The Wasp wins fights it chooses and leaves the ones it does not.' },

  { id:'raven', name:'RAVEN', cls:'light', tons:29, armour:1400, spread:'balanced',
    speed:104, accel:30, turn:138, torsoTurn:200, heatCap:48, sinks:7,
    jets:{ thrust:17, fuel:4.4, regen:1.3 }, ability:'jammer',
    hardpoints:[...hp('RA','M'), ...hp('LA','M'), ...hp('LT','S'), ...hp('RT','S')],
    build:{ legs:'digitigrade', torso:'angular', cockpit:'sensor', shoulders:'slim', arms:'gun', height:7.8, width:0.9, accents:3 },
    tier:1, cost:2400, blurb:'An electronic-warfare scout. Wherever the Raven stands, the enemy radar simply stops telling the truth.' },

  { id:'jenner', name:'JENNER', cls:'light', tons:33, armour:1520, spread:'frontal',
    speed:112, accel:32, turn:144, torsoTurn:196, heatCap:52, sinks:7.5,
    jets:{ thrust:22, fuel:5.8, regen:1.6 }, ability:'afterburn',
    hardpoints:[...hp('LA','M',1), ...hp('RA','M',1), ...hp('CT','M'), ...hp('LT','S')],
    build:{ legs:'chicken', torso:'hunched', cockpit:'visor', shoulders:'boxlauncher', arms:'gun', height:7.9, width:0.95, accents:2 },
    tier:1, cost:3600, blurb:'Four hardpoints on a frame that refuses to stand still. The classic hit-and-run striker.' },

  { id:'spider', name:'SPIDER', cls:'light', tons:26, armour:1240, spread:'legger',
    speed:122, accel:38, turn:168, torsoTurn:220, heatCap:46, sinks:7,
    jets:{ thrust:26, fuel:7.0, regen:1.9 }, ability:'vault',
    hardpoints:[...hp('RA','M'), ...hp('CT','S'), ...hp('LT','S')],
    build:{ legs:'spider', torso:'round', cockpit:'dome', shoulders:'slim', arms:'hybrid', height:7.0, width:1.05, accents:4 },
    tier:2, cost:5200, blurb:'Six-point stance and oversized jump jets. Climbs to firing positions nothing else can reach.' },

  { id:'locust', name:'LOCUST', cls:'light', tons:20, armour:900, spread:'legger',
    speed:132, accel:42, turn:180, torsoTurn:232, heatCap:38, sinks:6,
    jets:{ thrust:10, fuel:2.4, regen:1.0 }, ability:'overdrive',
    hardpoints:[...hp('RA','S'), ...hp('LA','S'), ...hp('CT','S')],
    build:{ legs:'chicken', torso:'slim', cockpit:'visor', shoulders:'slim', arms:'gun', height:6.4, width:0.74, accents:2 },
    tier:1, cost:1200, blurb:'The fastest thing on two legs and the easiest thing to kill. Speed is the only armour it has.' },

  { id:'cicada', name:'CICADA', cls:'light', tons:38, armour:1680, spread:'balanced',
    speed:116, accel:31, turn:140, torsoTurn:190, heatCap:56, sinks:8,
    jets:{ thrust:14, fuel:3.4, regen:1.2 }, ability:'scan',
    hardpoints:[...hp('RA','L'), ...hp('LT','S'), ...hp('RT','S')],
    build:{ legs:'digitigrade', torso:'angular', cockpit:'sensor', shoulders:'pauldron', arms:'gun', height:8.4, width:0.96, accents:3 },
    tier:2, cost:6400, blurb:'A light frame carrying a medium gun. Built around one oversized right arm and a very good sensor suite.' },

  /* ============================ MEDIUM ============================ */
  { id:'centurion', name:'CENTURION', cls:'medium', tons:50, armour:2450, spread:'frontal',
    speed:86, accel:22, turn:104, torsoTurn:158, heatCap:66, sinks:9,
    jets:{ thrust:0, fuel:0, regen:0 }, ability:'bulwark',
    hardpoints:[...hp('RA','L'), ...hp('LA','M'), ...hp('CT','M'), ...hp('LT','S')],
    build:{ legs:'humanoid', torso:'boxy', cockpit:'head', shoulders:'pauldron', arms:'hybrid', height:9.6, width:1.1, accents:2 },
    tier:1, cost:4800, blurb:'A shield arm and a big gun. The Centurion can trade with things two weight classes above it and walk away.' },

  { id:'hunchback', name:'HUNCHBACK', cls:'medium', tons:50, armour:2380, spread:'frontal',
    speed:78, accel:20, turn:96, torsoTurn:146, heatCap:64, sinks:9,
    jets:{ thrust:0, fuel:0, regen:0 }, ability:'braced',
    hardpoints:[...hp('RT','XL'), ...hp('LA','M'), ...hp('RA','M'), ...hp('CT','S')],
    build:{ legs:'humanoid', torso:'hunched', cockpit:'visor', shoulders:'boxlauncher', arms:'hand', height:9.2, width:1.22, accents:2 },
    tier:2, cost:7600, blurb:'One enormous shoulder mount and nothing subtle about it. Corner-fighting incarnate.' },

  { id:'shadowhawk', name:'SHADOW HAWK', cls:'medium', tons:55, armour:2560, spread:'balanced',
    speed:88, accel:23, turn:108, torsoTurn:164, heatCap:70, sinks:10,
    jets:{ thrust:16, fuel:4.0, regen:1.3 }, ability:'smoke',
    hardpoints:[...hp('RA','L'), ...hp('LT','M'), ...hp('RT','M'), ...hp('CT','S')],
    build:{ legs:'humanoid', torso:'angular', cockpit:'head', shoulders:'boxlauncher', arms:'hybrid', height:9.8, width:1.12, accents:3 },
    tier:2, cost:8800, blurb:'Jump jets, missiles and a smoke launcher. Good at every range and excellent at leaving.' },

  { id:'griffin', name:'GRIFFIN', cls:'medium', tons:55, armour:2500, spread:'balanced',
    speed:90, accel:24, turn:110, torsoTurn:168, heatCap:72, sinks:10.5,
    jets:{ thrust:19, fuel:4.8, regen:1.4 }, ability:'skyfall',
    hardpoints:[...hp('RA','L'), ...hp('LT','L'), ...hp('CT','S')],
    build:{ legs:'digitigrade', torso:'slim', cockpit:'visor', shoulders:'boxlauncher', arms:'gun', height:10.0, width:1.06, accents:3 },
    tier:2, cost:9200, blurb:'A missile platform with legs. Jump to the high ground, empty the racks, drop back into cover.' },

  { id:'wolverine', name:'WOLVERINE', cls:'medium', tons:55, armour:2540, spread:'armsout',
    speed:92, accel:25, turn:114, torsoTurn:172, heatCap:70, sinks:10,
    jets:{ thrust:18, fuel:4.6, regen:1.4 }, ability:'charge',
    hardpoints:[...hp('RA','L'), ...hp('LA','M'), ...hp('LT','M')],
    build:{ legs:'humanoid', torso:'boxy', cockpit:'head', shoulders:'spiked', arms:'hybrid', height:9.7, width:1.14, accents:2 },
    tier:2, cost:8600, blurb:'Built to close the distance and stay there. The shoulder charge is not a gimmick; it kills lights outright.' },

  { id:'trebuchet', name:'TREBUCHET', cls:'medium', tons:50, armour:2260, spread:'balanced',
    speed:84, accel:22, turn:100, torsoTurn:154, heatCap:68, sinks:9.5,
    jets:{ thrust:0, fuel:0, regen:0 }, ability:'artillery',
    hardpoints:[...hp('LT','L'), ...hp('RT','L'), ...hp('RA','M')],
    build:{ legs:'chicken', torso:'wide', cockpit:'sensor', shoulders:'boxlauncher', arms:'gun', height:9.4, width:1.2, accents:3 },
    tier:2, cost:8200, blurb:'Indirect fire specialist. Paints a grid square and deletes whatever was standing in it.' },

  { id:'blackjack', name:'BLACKJACK', cls:'medium', tons:45, armour:2180, spread:'armsout',
    speed:94, accel:26, turn:118, torsoTurn:176, heatCap:66, sinks:10,
    jets:{ thrust:20, fuel:5.0, regen:1.5 }, ability:'overclock',
    hardpoints:[...hp('LA','M'), ...hp('RA','M'), ...hp('LT','S'), ...hp('RT','S')],
    build:{ legs:'humanoid', torso:'boxy', cockpit:'visor', shoulders:'slim', arms:'gun', height:8.9, width:1.04, accents:2 },
    tier:2, cost:7000, blurb:'Four balanced hardpoints and a reactor that can be pushed well past its rating. Briefly.' },

  { id:'vindicator', name:'VINDICATOR', cls:'medium', tons:45, armour:2300, spread:'frontal',
    speed:82, accel:21, turn:102, torsoTurn:156, heatCap:74, sinks:11,
    jets:{ thrust:17, fuel:4.2, regen:1.3 }, ability:'emp_burst',
    hardpoints:[...hp('RA','XL'), ...hp('LT','S'), ...hp('CT','S')],
    build:{ legs:'humanoid', torso:'angular', cockpit:'head', shoulders:'pauldron', arms:'gun', height:9.3, width:1.08, accents:4 },
    tier:3, cost:11400, blurb:'An enormous heat sink array wrapped around one particle cannon. Designed to out-last, not out-shoot.' },

  /* ============================= HEAVY ============================= */
  { id:'catapult', name:'CATAPULT', cls:'heavy', tons:65, armour:2900, spread:'balanced',
    speed:74, accel:18, turn:88, torsoTurn:140, heatCap:80, sinks:11,
    jets:{ thrust:18, fuel:4.6, regen:1.3 }, ability:'skyfall',
    hardpoints:[...hp('LA','L'), ...hp('RA','L'), ...hp('LT','M'), ...hp('RT','M')],
    build:{ legs:'chicken', torso:'wide', cockpit:'sensor', shoulders:'boxlauncher', arms:'gun', height:10.6, width:1.34, accents:3 },
    tier:3, cost:13600, blurb:'Two enormous missile pods on a bird-legged frame. Nothing in the game fills the sky faster.' },

  { id:'thunderbolt', name:'THUNDERBOLT', cls:'heavy', tons:65, armour:3260, spread:'frontal',
    speed:72, accel:17, turn:84, torsoTurn:132, heatCap:84, sinks:12,
    jets:{ thrust:0, fuel:0, regen:0 }, ability:'bulwark',
    hardpoints:[...hp('RA','L'), ...hp('LA','M'), ...hp('LT','M'), ...hp('RT','M'), ...hp('CT','S')],
    build:{ legs:'humanoid', torso:'boxy', cockpit:'head', shoulders:'pauldron', arms:'hybrid', height:10.8, width:1.24, accents:2 },
    tier:3, cost:14800, blurb:'Five hardpoints and the thickest front armour of any heavy. A walking firing line.' },

  { id:'warhammer', name:'WARHAMMER', cls:'heavy', tons:70, armour:3180, spread:'armsout',
    speed:70, accel:16, turn:82, torsoTurn:130, heatCap:92, sinks:13.5,
    jets:{ thrust:0, fuel:0, regen:0 }, ability:'overclock',
    hardpoints:[...hp('LA','XL'), ...hp('RA','XL'), ...hp('LT','S'), ...hp('RT','S'), ...hp('CT','S')],
    build:{ legs:'humanoid', torso:'wide', cockpit:'visor', shoulders:'pauldron', arms:'gun', height:11.0, width:1.3, accents:4 },
    tier:3, cost:16900, blurb:'Twin XL arm mounts, enormous heat capacity. The definitive particle-cannon platform.' },

  { id:'marauder', name:'MARAUDER', cls:'heavy', tons:75, armour:3240, spread:'armsout',
    speed:68, accel:16, turn:80, torsoTurn:136, heatCap:90, sinks:13,
    jets:{ thrust:0, fuel:0, regen:0 }, ability:'targetlock',
    hardpoints:[...hp('LA','XL'), ...hp('RA','XL'), ...hp('RT','M'), ...hp('HD','S')],
    build:{ legs:'digitigrade', torso:'hunched', cockpit:'sensor', shoulders:'slim', arms:'gun', height:10.4, width:1.32, accents:4 },
    tier:4, cost:21000, blurb:'A crouched, insectile silhouette with a head-mounted laser. Its targeting computer makes every shot count double.' },

  { id:'orion', name:'ORION', cls:'heavy', tons:75, armour:3400, spread:'frontal',
    speed:68, accel:16, turn:80, torsoTurn:128, heatCap:86, sinks:12,
    jets:{ thrust:0, fuel:0, regen:0 }, ability:'stomp',
    hardpoints:[...hp('RA','XL'), ...hp('LA','M'), ...hp('LT','L'), ...hp('CT','M')],
    build:{ legs:'humanoid', torso:'boxy', cockpit:'head', shoulders:'spiked', arms:'hybrid', height:11.2, width:1.28, accents:2 },
    tier:3, cost:17800, blurb:'A no-nonsense line heavy. Big gun, big missiles, and a ground-shaking stomp for anything that gets close.' },

  { id:'cataphract', name:'CATAPHRACT', cls:'heavy', tons:70, armour:3220, spread:'balanced',
    speed:71, accel:17, turn:84, torsoTurn:134, heatCap:82, sinks:11.5,
    jets:{ thrust:0, fuel:0, regen:0 }, ability:'shieldwall',
    hardpoints:[...hp('RA','L'), ...hp('LA','L'), ...hp('LT','M'), ...hp('RT','M')],
    build:{ legs:'chicken', torso:'angular', cockpit:'visor', shoulders:'pauldron', arms:'gun', height:10.5, width:1.26, accents:3 },
    tier:3, cost:15900, blurb:'A field refit that became a classic. Projects a shield wall the whole team can shelter behind.' },

  { id:'quickdraw', name:'QUICKDRAW', cls:'heavy', tons:60, armour:2860, spread:'legger',
    speed:80, accel:20, turn:96, torsoTurn:150, heatCap:78, sinks:11,
    jets:{ thrust:20, fuel:5.2, regen:1.5 }, ability:'afterburn',
    hardpoints:[...hp('RA','L'), ...hp('LA','M'), ...hp('RT','M'), ...hp('CT','S')],
    build:{ legs:'digitigrade', torso:'slim', cockpit:'head', shoulders:'slim', arms:'hybrid', height:10.2, width:1.14, accents:3 },
    tier:3, cost:13200, blurb:'The fastest heavy in the hangar. Jump-capable, long-legged, and impossible to pin down.' },

  { id:'grasshopper', name:'GRASSHOPPER', cls:'heavy', tons:70, armour:3300, spread:'legger',
    speed:74, accel:19, turn:90, torsoTurn:142, heatCap:96, sinks:14,
    jets:{ thrust:23, fuel:6.0, regen:1.6 }, ability:'vault',
    hardpoints:[...hp('RA','L'), ...hp('LA','M'), ...hp('LT','M'), ...hp('RT','M'), ...hp('CT','S')],
    build:{ legs:'chicken', torso:'hunched', cockpit:'visor', shoulders:'boxlauncher', arms:'gun', height:11.0, width:1.2, accents:4 },
    tier:4, cost:19400, blurb:'An energy boat with jump jets and heat capacity to spare. It can hold the trigger down until the match ends.' },

  /* ============================ ASSAULT ============================ */
  { id:'atlas', name:'ATLAS', cls:'assault', tons:100, armour:4600, spread:'frontal',
    speed:58, accel:12, turn:62, torsoTurn:108, heatCap:98, sinks:13,
    jets:{ thrust:0, fuel:0, regen:0 }, ability:'stomp',
    hardpoints:[...hp('RA','XL'), ...hp('LA','L'), ...hp('LT','L'), ...hp('RT','M'), ...hp('CT','M')],
    build:{ legs:'humanoid', torso:'wide', cockpit:'skull', shoulders:'spiked', arms:'hybrid', height:12.6, width:1.5, accents:3 },
    tier:4, cost:28000, blurb:'The skull-faced end of an argument. Everything about the Atlas is designed to be seen coming and to not matter.' },

  { id:'banshee', name:'BANSHEE', cls:'assault', tons:95, armour:4280, spread:'balanced',
    speed:64, accel:14, turn:70, torsoTurn:118, heatCap:104, sinks:15,
    jets:{ thrust:0, fuel:0, regen:0 }, ability:'charge',
    hardpoints:[...hp('RA','XL'), ...hp('LA','XL'), ...hp('RT','M'), ...hp('CT','S')],
    build:{ legs:'humanoid', torso:'boxy', cockpit:'head', shoulders:'pauldron', arms:'gun', height:12.2, width:1.44, accents:4 },
    tier:4, cost:25500, blurb:'An assault mech that moves like a heavy. It will run you down and it will not overheat doing it.' },

  { id:'stalker', name:'STALKER', cls:'assault', tons:85, armour:4200, spread:'frontal',
    speed:56, accel:11, turn:58, torsoTurn:112, heatCap:112, sinks:16,
    jets:{ thrust:0, fuel:0, regen:0 }, ability:'alpha',
    hardpoints:[...hp('LT','L'), ...hp('RT','L'), ...hp('LA','M'), ...hp('RA','M'), ...hp('CT','M'), ...hp('HD','S')],
    build:{ legs:'chicken', torso:'wide', cockpit:'none', shoulders:'boxlauncher', arms:'gun', height:11.4, width:1.56, accents:5 },
    tier:5, cost:31000, blurb:'Six hardpoints, no arms worth the name, and a cooling plant that laughs at alpha strikes.' },

  { id:'awesome', name:'AWESOME', cls:'assault', tons:80, armour:4050, spread:'frontal',
    speed:60, accel:12, turn:64, torsoTurn:114, heatCap:120, sinks:17.5,
    jets:{ thrust:0, fuel:0, regen:0 }, ability:'overclock',
    hardpoints:[...hp('RA','XL'), ...hp('LT','XL'), ...hp('RT','XL'), ...hp('CT','S')],
    build:{ legs:'humanoid', torso:'wide', cockpit:'visor', shoulders:'slim', arms:'gun', height:11.8, width:1.4, accents:5 },
    tier:5, cost:30000, blurb:'Three XL energy mounts and the largest heat sink bank ever fitted. Built for one job and perfect at it.' },

  { id:'annihilator', name:'ANNIHILATOR', cls:'assault', tons:100, armour:4900, spread:'frontal',
    speed:46, accel:9, turn:48, torsoTurn:96, heatCap:100, sinks:13,
    jets:{ thrust:0, fuel:0, regen:0 }, ability:'braced',
    hardpoints:[...hp('LA','XL'), ...hp('RA','XL'), ...hp('LT','L'), ...hp('RT','L')],
    build:{ legs:'humanoid', torso:'boxy', cockpit:'visor', shoulders:'pauldron', arms:'gun', height:11.6, width:1.62, accents:2 },
    tier:5, cost:34000, blurb:'A siege platform that happens to walk. Slow enough to be avoided, lethal enough that avoiding it loses you the point.' },

  { id:'direwolf', name:'DIRE WOLF', cls:'assault', tons:100, armour:4700, spread:'balanced',
    speed:52, accel:10, turn:54, torsoTurn:104, heatCap:116, sinks:16,
    jets:{ thrust:0, fuel:0, regen:0 }, ability:'alpha',
    hardpoints:[...hp('LA','XL'), ...hp('RA','XL'), ...hp('LT','L'), ...hp('RT','L'), ...hp('CT','M')],
    build:{ legs:'digitigrade', torso:'wide', cockpit:'sensor', shoulders:'boxlauncher', arms:'gun', height:11.9, width:1.58, accents:4 },
    tier:5, cost:38000, blurb:'Five hardpoints, none of them small. The Dire Wolf does not reposition; the map repositions around it.' },

  { id:'highlander', name:'HIGHLANDER', cls:'assault', tons:90, armour:4400, spread:'legger',
    speed:58, accel:12, turn:62, torsoTurn:110, heatCap:102, sinks:14,
    jets:{ thrust:22, fuel:5.4, regen:1.4 }, ability:'deathdrop',
    hardpoints:[...hp('RA','XL'), ...hp('LA','M'), ...hp('LT','L'), ...hp('RT','M')],
    build:{ legs:'humanoid', torso:'boxy', cockpit:'head', shoulders:'spiked', arms:'hybrid', height:12.0, width:1.46, accents:3 },
    tier:5, cost:33000, blurb:'Ninety tons with jump jets. The landing is a weapon -- ask anyone who has been underneath one.' },

  /* ============================ SUPPORT ============================ */
  { id:'medic', name:'CADUCEUS', cls:'support', tons:55, armour:2700, spread:'balanced',
    speed:82, accel:21, turn:100, torsoTurn:154, heatCap:78, sinks:12,
    jets:{ thrust:14, fuel:3.6, regen:1.2 }, ability:'repairfield',
    hardpoints:[...hp('RA','M'), ...hp('LA','M'), ...hp('LT','M'), ...hp('CT','S')],
    build:{ legs:'humanoid', torso:'round', cockpit:'dome', shoulders:'slim', arms:'hybrid', height:9.6, width:1.12, accents:5 },
    tier:3, cost:12600, blurb:'Field repair platform. A Caduceus behind the line turns a losing push into a stalemate, then a win.' },

  { id:'aegis', name:'AEGIS', cls:'support', tons:68, armour:3300, spread:'frontal',
    speed:70, accel:16, turn:80, torsoTurn:126, heatCap:86, sinks:13,
    jets:{ thrust:0, fuel:0, regen:0 }, ability:'shieldwall',
    hardpoints:[...hp('RA','L'), ...hp('LT','M'), ...hp('RT','M'), ...hp('CT','S')],
    build:{ legs:'humanoid', torso:'wide', cockpit:'dome', shoulders:'pauldron', arms:'hybrid', height:10.4, width:1.36, accents:5 },
    tier:4, cost:20400, blurb:'Carries a deployable barrier generator. Wherever the Aegis plants its feet becomes the front line.' },

  { id:'spectre', name:'SPECTRE', cls:'support', tons:42, armour:1980, spread:'balanced',
    speed:100, accel:28, turn:128, torsoTurn:186, heatCap:64, sinks:10,
    jets:{ thrust:19, fuel:5.0, regen:1.5 }, ability:'cloak',
    hardpoints:[...hp('RA','L'), ...hp('LA','S'), ...hp('RT','S')],
    build:{ legs:'digitigrade', torso:'slim', cockpit:'sensor', shoulders:'slim', arms:'gun', height:8.8, width:0.94, accents:4 },
    tier:4, cost:18800, blurb:'Optical camouflage and a sniper\'s arm. The Spectre decides when the fight starts.' },

  { id:'warden', name:'WARDEN', cls:'support', tons:62, armour:3120, spread:'frontal',
    speed:74, accel:18, turn:86, torsoTurn:132, heatCap:90, sinks:14,
    jets:{ thrust:0, fuel:0, regen:0 }, ability:'ams_dome',
    hardpoints:[...hp('RA','L'), ...hp('LA','M'), ...hp('LT','M'), ...hp('RT','S'), ...hp('CT','S')],
    build:{ legs:'chicken', torso:'wide', cockpit:'dome', shoulders:'boxlauncher', arms:'gun', height:10.2, width:1.3, accents:4 },
    tier:4, cost:19800, blurb:'Point defence on a chassis. Projects an umbrella that swats missiles out of the air for the whole squad.' },

  { id:'beacon', name:'BEACON', cls:'support', tons:48, armour:2320, spread:'balanced',
    speed:90, accel:24, turn:112, torsoTurn:170, heatCap:70, sinks:11,
    jets:{ thrust:16, fuel:4.2, regen:1.3 }, ability:'scan',
    hardpoints:[...hp('RA','M'), ...hp('LA','M'), ...hp('RT','M'), ...hp('HD','S')],
    build:{ legs:'digitigrade', torso:'angular', cockpit:'sensor', shoulders:'slim', arms:'gun', height:9.2, width:1.02, accents:5 },
    tier:3, cost:13800, blurb:'A mobile sensor mast. Reveals the enemy team through walls and feeds every friendly missile a free lock.' },
];

/** Expand armour shares into concrete per-location pools. */
function expand(m) {
  const share = SPREAD[m.spread] || SPREAD.balanced;
  const armour = {};
  const structure = {};
  for (const loc of LOCATIONS) {
    armour[loc] = Math.round(m.armour * share[loc]);
    // Internal structure is a flat fraction of armour; it is what remains
    // after the plating is stripped and it takes bonus damage from 'shred'.
    structure[loc] = Math.round(m.armour * share[loc] * 0.42);
  }
  const hpBySize = { S:0, M:0, L:0, XL:0 };
  m.hardpoints.forEach((h, i) => { h.index = i; hpBySize[h.size]++; });
  const freeTons = Math.round(m.tons * 0.42 + 4);
  return {
    ...m,
    armour: armour,
    structure,
    armourPool: m.armour,
    hpBySize,
    payload: freeTons,        // tonnage available for weapons
    classLabel: CLASSES[m.cls].label,
    classColor: CLASSES[m.cls].color,
    maxHP: Object.values(armour).reduce((a, b) => a + b, 0)
         + Object.values(structure).reduce((a, b) => a + b, 0),
  };
}

export const MECHS = RAW.map(expand);
export const MECH_BY_ID = Object.fromEntries(MECHS.map(m => [m.id, m]));

export function mechsOfClass(cls) { return MECHS.filter(m => m.cls === cls); }

/** Rough combat rating, used to balance AI teams and sort the hangar. */
export function battleValue(m) {
  return Math.round(m.maxHP * 0.6 + m.payload * 22 + m.speed * 4 + m.heatCap * 3);
}
