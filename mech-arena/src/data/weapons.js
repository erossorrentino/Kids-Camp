/**
 * WEAPON CATALOG
 * ------------------------------------------------------------------
 * Every weapon is a plain data record. The combat code never special-cases
 * a weapon by name -- it only reads these fields, so adding a gun is a
 * matter of adding a row here.
 *
 * Fields
 *   cls        ballistic | energy | missile | support
 *   size       S | M | L | XL   (must fit the hardpoint it is mounted in)
 *   tons       contributes to the chassis tonnage budget
 *   dmg        damage per projectile / per beam-tick / per pellet
 *   pellets    projectiles per shot (shotguns)
 *   rpm        rounds per minute while the trigger is held
 *   mag        rounds per magazine (-1 = belt fed, no reload)
 *   ammo       total reserve rounds (-1 = infinite, e.g. energy weapons)
 *   reload     seconds
 *   vel        projectile speed m/s (0 = instant / hitscan)
 *   opt        optimal range in metres -- full damage
 *   max        damage reaches zero here (linear falloff from opt)
 *   spread     cone half-angle in degrees at rest
 *   heat       heat units added per shot
 *   mode       auto | semi | burst | beam | charge | lock | stream
 *   splash     {r, dmg} area damage on impact
 *   flags      set of behaviour switches (see below)
 *
 * Flags
 *   homing      steers toward a locked target
 *   arcing      lobbed trajectory (indirect fire)
 *   pierce      passes through the first body it hits
 *   emp         adds heat to the target instead of pure damage
 *   heal        repairs friendly structure instead of damaging
 *   shred       bonus damage to already-exposed internal structure
 *   stagger     applies knockback impulse
 *   cluster     splits into sub-munitions at range
 *   overpen     reduced falloff, ignores 50% shield
 *   silent      no tracer, no audible report beyond 60m
 */

import { rarityForTier, bandPrices } from './rarity.js';

/**
 * Global damage scale. Fights were long: a medium took the best part of
 * half a minute of focused fire to drop. Everything that hurts -- direct
 * damage, splash, and the healing that has to keep up with it -- is scaled
 * here, so the numbers in the hangar are the numbers in the fight. It is
 * symmetrical: bots shoot with the same guns.
 */
export const DAMAGE_SCALE = 1.5;

/** @typedef {'ballistic'|'energy'|'missile'|'support'} WeaponClass */

const CLASS_COLOR = {
  ballistic: 0xffd9a0,
  energy: 0x66e9ff,
  missile: 0xffb066,
  support: 0x9dff9d,
};

/* ------------------------------------------------------------------ *
 * Base archetypes. Variants are generated from these further down.
 * ------------------------------------------------------------------ */
const BASE = [
  /* ---------------- BALLISTIC: autocannons ---------------- */
  { id:'ac2',   name:'AC/2 Rattler',      cls:'ballistic', size:'S',  tons:6,  dmg:9,  rpm:300, mag:30, ammo:360, reload:2.4, vel:900,  opt:340, max:520, spread:0.6, heat:1.4, mode:'auto',  tracer:0xffe0a8, tier:1, cost:0,
    blurb:'Light rapid-fire cannon. Flat trajectory, cheap ammunition, endless suppression.' },
  { id:'ac5',   name:'AC/5 Hammerfall',   cls:'ballistic', size:'M',  tons:9,  dmg:22, rpm:150, mag:16, ammo:190, reload:2.8, vel:840,  opt:300, max:470, spread:0.7, heat:2.6, mode:'auto',  tracer:0xffd28a, tier:1, cost:1200,
    blurb:'The workhorse autocannon. Reliable damage at any bracket a medium mech cares about.' },
  { id:'ac10',  name:'AC/10 Breaker',     cls:'ballistic', size:'L',  tons:14, dmg:46, rpm:72,  mag:10, ammo:120, reload:3.2, vel:760,  opt:260, max:400, spread:0.5, heat:5.0, mode:'auto',  tracer:0xffc070, tier:2, cost:3400, flags:['stagger'],
    blurb:'Heavy slug thrower. Each hit rocks a light chassis back on its heels.' },
  { id:'ac20',  name:'AC/20 Thunderhead',  cls:'ballistic', size:'XL', tons:22, dmg:96, rpm:36,  mag:5,  ammo:64,  reload:3.8, vel:640,  opt:180, max:280, spread:0.9, heat:9.5, mode:'semi',  tracer:0xffab55, tier:3, cost:9800, flags:['stagger','shred'],
    blurb:'A brawler\'s answer to everything. Short reach, catastrophic payload.' },

  /* ---------------- BALLISTIC: gauss / kinetic ---------------- */
  { id:'gauss', name:'Gauss Rifle "Spike"', cls:'ballistic', size:'XL', tons:20, dmg:112, rpm:28, mag:1, ammo:40, reload:3.4, vel:1800, opt:700, max:1100, spread:0.02, heat:2.0, mode:'charge', charge:1.1, tracer:0xcfe8ff, tier:3, cost:12000, flags:['pierce','overpen'],
    blurb:'Magnetically accelerated slug. Almost no heat, almost no drop, one very loud crack.' },
  { id:'lgauss',name:'Light Gauss "Needle"', cls:'ballistic', size:'L', tons:13, dmg:64,  rpm:44, mag:1, ammo:56, reload:2.4, vel:1900, opt:760, max:1200, spread:0.02, heat:1.2, mode:'charge', charge:0.7, tracer:0xd8f0ff, tier:2, cost:7200, flags:['pierce'],
    blurb:'A scaled-down rail gun for scouts who like to reach out and touch someone.' },
  { id:'rail',  name:'Mk-VII Railspear',   cls:'ballistic', size:'XL', tons:24, dmg:168, rpm:16, mag:1, ammo:24, reload:4.6, vel:2400, opt:900, max:1500, spread:0.01, heat:4.5, mode:'charge', charge:1.9, tracer:0xa8d8ff, tier:5, cost:26000, flags:['pierce','overpen','shred'],
    blurb:'Anti-materiel rail driver. Punches clean through a medium and keeps going.' },

  /* ---------------- BALLISTIC: shotguns / close range ---------------- */
  { id:'lbx10', name:'LB 10-X Scattergun', cls:'ballistic', size:'L', tons:13, dmg:11, pellets:9, rpm:62, mag:8, ammo:96, reload:3.0, vel:620, opt:90, max:200, spread:4.2, heat:4.2, mode:'semi', tracer:0xffd9a0, tier:2, cost:4600,
    blurb:'Cluster shell that opens into a wall of slugs. Devastating inside a hangar bay.' },
  { id:'lbx20', name:'LB 20-X Maw',        cls:'ballistic', size:'XL', tons:19, dmg:14, pellets:14, rpm:40, mag:5, ammo:60, reload:3.6, vel:560, opt:70, max:170, spread:5.4, heat:7.5, mode:'semi', tracer:0xffcf8a, tier:4, cost:14500, flags:['stagger'],
    blurb:'Point-blank shot cannon. If you can read their serial number, you win.' },
  { id:'hmg',   name:'Heavy MG "Buzzsaw"', cls:'ballistic', size:'S', tons:3, dmg:4, rpm:900, mag:180, ammo:1400, reload:2.2, vel:700, opt:110, max:210, spread:2.1, heat:0.35, mode:'auto', tracer:0xfff0c0, tier:1, cost:700, flags:['shred'],
    blurb:'Chews exposed internals to confetti. Useless against fresh armour.' },
  { id:'rotary',name:'Rotary AC/5 Cyclone',cls:'ballistic', size:'L', tons:16, dmg:18, rpm:420, mag:40, ammo:400, reload:4.0, vel:820, opt:250, max:400, spread:1.6, heat:2.1, mode:'auto', spinUp:0.55, tracer:0xffd28a, tier:4, cost:16800,
    blurb:'Spins up into a torrent of shells. Heat and ammo vanish just as fast.' },
  { id:'flak',  name:'Flak Battery FB-2',  cls:'ballistic', size:'M', tons:8, dmg:13, pellets:3, rpm:220, mag:36, ammo:340, reload:2.6, vel:740, opt:210, max:330, spread:2.6, heat:1.9, mode:'auto', splash:{r:3.2,dmg:6}, tracer:0xffcc99, tier:2, cost:3100, flags:['ams'],
    blurb:'Airburst rounds that also swat incoming missiles out of the sky.' },

  /* ---------------- ENERGY: lasers ---------------- */
  { id:'slas',  name:'Small Laser',        cls:'energy', size:'S', tons:2, dmg:16, rpm:80, mag:-1, ammo:-1, reload:0, vel:0, opt:150, max:260, spread:0, heat:2.6, mode:'semi', tracer:0x7ff0ff, tier:1, cost:0,
    blurb:'A stub emitter. Free damage that never runs dry.' },
  { id:'mlas',  name:'Medium Laser',       cls:'energy', size:'M', tons:4, dmg:34, rpm:55, mag:-1, ammo:-1, reload:0, vel:0, opt:270, max:430, spread:0, heat:5.2, mode:'semi', tracer:0x66e9ff, tier:1, cost:900,
    blurb:'The most mounted weapon in the arena for a reason. Nothing is wasted.' },
  { id:'llas',  name:'Large Laser',        cls:'energy', size:'L', tons:8, dmg:62, rpm:34, mag:-1, ammo:-1, reload:0, vel:0, opt:460, max:720, spread:0, heat:10.5, mode:'semi', tracer:0x4fd4ff, tier:2, cost:3800,
    blurb:'A full second of coherent light. Hold the crosshair and let it cook.' },
  { id:'erllas',name:'ER Large Laser',     cls:'energy', size:'L', tons:9, dmg:66, rpm:28, mag:-1, ammo:-1, reload:0, vel:0, opt:620, max:980, spread:0, heat:13.5, mode:'semi', tracer:0x38c8ff, tier:3, cost:8600,
    blurb:'Extended-range optics. Reaches across the map and heats the cockpit doing it.' },
  { id:'pulse', name:'Medium Pulse Laser', cls:'energy', size:'M', tons:5, dmg:15, rpm:300, mag:-1, ammo:-1, reload:0, vel:0, opt:230, max:340, spread:0.5, heat:1.9, mode:'auto', tracer:0x88f0ff, tier:2, cost:3200,
    blurb:'Rapid coherent pulses. Forgiving to aim, punishing to be hit by.' },
  { id:'lpulse',name:'Large Pulse Laser',  cls:'energy', size:'L', tons:9, dmg:24, rpm:210, mag:-1, ammo:-1, reload:0, vel:0, opt:340, max:520, spread:0.6, heat:3.4, mode:'auto', tracer:0x6ce4ff, tier:3, cost:9400,
    blurb:'A stuttering blue hose. Tracks a sprinting light mech better than any slug gun.' },
  { id:'beam',  name:'Sustained Beam "Lance"', cls:'energy', size:'L', tons:10, dmg:5.2, rpm:1200, mag:-1, ammo:-1, reload:0, vel:0, opt:300, max:440, spread:0, heat:0.85, mode:'beam', tracer:0x55ddff, tier:3, cost:10400, flags:['shred'],
    blurb:'A continuous cutting beam. Ramps up the longer it stays on one plate.' },
  { id:'ppc',   name:'PPC "Stormcaller"',  cls:'energy', size:'XL', tons:14, dmg:88, rpm:26, mag:-1, ammo:-1, reload:0, vel:1100, opt:540, max:860, spread:0.1, heat:17, mode:'semi', splash:{r:2.4,dmg:14}, tracer:0x9fb8ff, tier:3, cost:11200, flags:['emp','stagger'],
    blurb:'Particle cannon. Scrambles sensors on impact and blinds the target\'s radar.' },
  { id:'erppc', name:'ER PPC "Tempest"',   cls:'energy', size:'XL', tons:16, dmg:96, rpm:22, mag:-1, ammo:-1, reload:0, vel:1250, opt:700, max:1050, spread:0.08, heat:21, mode:'semi', splash:{r:2.6,dmg:16}, tracer:0xb0c4ff, tier:4, cost:19500, flags:['emp','stagger'],
    blurb:'Reaches further, hurts more, and will shut you down if you forget to breathe.' },
  { id:'flamer',name:'Flamer FT-9',        cls:'energy', size:'S', tons:3, dmg:3.4, rpm:600, mag:-1, ammo:-1, reload:0, vel:70, opt:55, max:85, spread:3.5, heat:1.1, mode:'stream', tracer:0xff9a44, tier:1, cost:800, flags:['emp'],
    blurb:'Dumps waste plasma over the target. Damage is modest; the heat spike is not.' },
  { id:'plasma',name:'Plasma Projector',   cls:'energy', size:'L', tons:11, dmg:44, rpm:48, mag:-1, ammo:-1, reload:0, vel:420, opt:220, max:330, spread:0.6, heat:9.0, mode:'auto', splash:{r:4.0,dmg:18}, tracer:0x63ff9a, tier:4, cost:15600, flags:['emp'],
    blurb:'Lobbed globs of bottled star. Splashes heat across everything nearby.' },
  { id:'disr',  name:'Disruptor Cannon',   cls:'energy', size:'L', tons:10, dmg:38, rpm:70, mag:-1, ammo:-1, reload:0, vel:900, opt:290, max:420, spread:0.3, heat:6.4, mode:'auto', tracer:0xc08bff, tier:4, cost:17200, flags:['emp','overpen'],
    blurb:'Tuned to collapse energy shielding. Barely notices a shield bubble is there.' },

  /* ---------------- MISSILES ---------------- */
  { id:'srm4',  name:'SRM-4 Rack',         cls:'missile', size:'S', tons:4, dmg:20, pellets:4, rpm:55, mag:4, ammo:120, reload:3.0, vel:220, opt:200, max:300, spread:1.6, heat:3.0, mode:'semi', splash:{r:2.6,dmg:8}, tracer:0xffb066, tier:1, cost:1100,
    blurb:'Four dumb-fire rockets. No lock needed, no warning given.' },
  { id:'srm6',  name:'SRM-6 Hive',         cls:'missile', size:'M', tons:6, dmg:20, pellets:6, rpm:48, mag:6, ammo:150, reload:3.3, vel:220, opt:210, max:320, spread:1.9, heat:4.2, mode:'semi', splash:{r:2.8,dmg:9}, tracer:0xffb066, tier:2, cost:3600,
    blurb:'Six tubes of unguided menace at knife range.' },
  { id:'ssrm',  name:'Streak SRM-4',       cls:'missile', size:'M', tons:7, dmg:23, pellets:4, rpm:40, mag:4, ammo:110, reload:3.4, vel:260, opt:250, max:360, spread:0.5, heat:4.6, mode:'lock', lockTime:0.75, splash:{r:2.4,dmg:8}, tracer:0xff9a55, tier:3, cost:8200, flags:['homing'],
    blurb:'Will not fire until it has a lock -- and then never misses.' },
  { id:'lrm10', name:'LRM-10 Launcher',    cls:'missile', size:'M', tons:8, dmg:16, pellets:10, rpm:34, mag:10, ammo:220, reload:4.0, vel:180, opt:520, max:900, spread:1.2, heat:5.5, mode:'lock', lockTime:1.2, splash:{r:3.2,dmg:7}, tracer:0xffc48a, tier:2, cost:4200, flags:['homing','arcing'],
    blurb:'Indirect fire in a lazy arc. Drops over cover onto whoever your team painted.' },
  { id:'lrm20', name:'LRM-20 Skyfall',     cls:'missile', size:'L', tons:13, dmg:16, pellets:20, rpm:24, mag:20, ammo:320, reload:4.8, vel:180, opt:560, max:1000, spread:1.5, heat:9.0, mode:'lock', lockTime:1.5, splash:{r:3.2,dmg:7}, tracer:0xffc48a, tier:3, cost:9800, flags:['homing','arcing'],
    blurb:'Twenty tubes of area denial. The sky simply stops being safe.' },
  { id:'mrm',   name:'MRM-30 Swarmbox',    cls:'missile', size:'L', tons:12, dmg:13, pellets:30, rpm:20, mag:30, ammo:300, reload:5.0, vel:250, opt:330, max:520, spread:3.4, heat:8.5, mode:'semi', splash:{r:2.2,dmg:5}, tracer:0xffa86b, tier:3, cost:8800,
    blurb:'Thirty unguided rockets in one breath. Accuracy is a group effort.' },
  { id:'atm',   name:'ATM-9 Adaptive',     cls:'missile', size:'L', tons:11, dmg:19, pellets:9, rpm:30, mag:9, ammo:180, reload:4.2, vel:300, opt:380, max:720, spread:0.9, heat:6.8, mode:'lock', lockTime:1.0, splash:{r:3.0,dmg:9}, tracer:0xff8f5a, tier:4, cost:15200, flags:['homing'],
    blurb:'Warheads re-fuse in flight: heavier close in, longer legs far out.' },
  { id:'rocket',name:'Rocket Pod RP-15',   cls:'missile', size:'S', tons:3, dmg:17, pellets:15, rpm:16, mag:15, ammo:45, reload:9.0, vel:230, opt:240, max:360, spread:3.0, heat:6.0, mode:'semi', splash:{r:2.4,dmg:7}, tracer:0xffa040, tier:1, cost:900,
    blurb:'One-shot pod. Fifteen rockets, a very long reload, no regrets.' },
  { id:'thumper',name:'Thumper Mortar',    cls:'missile', size:'L', tons:12, dmg:74, pellets:1, rpm:26, mag:6, ammo:70, reload:4.4, vel:150, opt:420, max:760, spread:0.8, heat:7.0, mode:'semi', splash:{r:7.5,dmg:42}, tracer:0xffb066, tier:3, cost:10600, flags:['arcing','stagger'],
    blurb:'Lobs a shell over the skyline. Learn the arc and nowhere is cover.' },
  { id:'cluster',name:'Cluster Bomblet CB-8', cls:'missile', size:'M', tons:9, dmg:11, pellets:8, rpm:28, mag:8, ammo:120, reload:4.0, vel:210, opt:300, max:520, spread:1.4, heat:5.4, mode:'semi', splash:{r:3.4,dmg:9}, tracer:0xffcf8a, tier:3, cost:7400, flags:['arcing','cluster'],
    blurb:'Splits into submunitions above the target. Ruins anyone hiding behind a wall.' },
  { id:'torp',  name:'Heavy Torpedo HT-2', cls:'missile', size:'XL', tons:18, dmg:130, pellets:2, rpm:14, mag:2, ammo:26, reload:5.6, vel:190, opt:400, max:700, spread:0.4, heat:11, mode:'lock', lockTime:1.8, splash:{r:8.5,dmg:58}, tracer:0xff7a44, tier:5, cost:24000, flags:['homing','stagger'],
    blurb:'Two ship-killers on rails. Slow, obvious, and absolutely lethal.' },

  /* ---------------- SUPPORT ---------------- */
  { id:'repair',name:'Repair Beam RB-3',   cls:'support', size:'M', tons:6, dmg:0, heal:26, rpm:900, mag:-1, ammo:-1, reload:0, vel:0, opt:160, max:200, spread:0, heat:1.2, mode:'beam', tracer:0x9dff9d, tier:2, cost:4400, flags:['heal'],
    blurb:'Nanite stream that welds a teammate\'s plating back together mid-fight.' },
  { id:'shieldp',name:'Shield Projector SP-1', cls:'support', size:'M', tons:7, dmg:0, shieldGive:120, rpm:20, mag:-1, ammo:-1, reload:0, vel:0, opt:180, max:220, spread:0, heat:5.0, mode:'semi', tracer:0x7cd8ff, tier:3, cost:9200, flags:['heal'],
    blurb:'Casts a temporary energy shell over an ally. Buys three seconds, which is plenty.' },
  { id:'tag',   name:'TAG Designator',     cls:'support', size:'S', tons:2, dmg:1, rpm:600, mag:-1, ammo:-1, reload:0, vel:0, opt:600, max:900, spread:0, heat:0.5, mode:'beam', tracer:0xff5ce0, tier:1, cost:600, flags:['tag','silent'],
    blurb:'Paints a target for the whole team. Friendly missiles find it without a lock.' },
  { id:'ams',   name:'AMS Turret',         cls:'support', size:'S', tons:3, dmg:8, rpm:1400, mag:-1, ammo:3000, reload:0, vel:0, opt:140, max:160, spread:0, heat:0.2, mode:'passive', tracer:0xffe9a0, tier:2, cost:2800, flags:['ams'],
    blurb:'Automatic point defence. Shoots down missiles without you lifting a finger.' },
  { id:'emp',   name:'EMP Lance',          cls:'support', size:'M', tons:6, dmg:12, rpm:36, mag:-1, ammo:-1, reload:0, vel:800, opt:260, max:380, spread:0.2, heat:7.5, mode:'semi', splash:{r:6,dmg:6}, tracer:0xc08bff, tier:3, cost:8800, flags:['emp'],
    blurb:'Low damage, enormous heat transfer. Cook them into a shutdown.' },
  { id:'mines', name:'Mine Layer ML-4',    cls:'support', size:'M', tons:7, dmg:70, rpm:40, mag:4, ammo:24, reload:5.0, vel:180, opt:60, max:120, spread:0, heat:2.0, mode:'semi', splash:{r:6.5,dmg:52}, tracer:0xff7a7a, tier:3, cost:7600, flags:['mine','arcing'],
    blurb:'Proximity charges you leave behind. Excellent manners when retreating.' },
  { id:'drone', name:'Drone Bay DB-2',     cls:'support', size:'L', tons:9, dmg:9, rpm:30, mag:2, ammo:16, reload:8.0, vel:120, opt:300, max:400, spread:0, heat:4.0, mode:'semi', tracer:0x9fe8ff, tier:4, cost:14000, flags:['drone','homing'],
    blurb:'Launches escort drones that orbit you and plink at whatever you look at.' },
];

/* ------------------------------------------------------------------ *
 * Variant generator.
 * Each variant multiplies the base stats and shifts the unlock tier, so
 * the catalog grows into a real progression ladder without hand-typing
 * a hundred near-duplicate rows.
 * ------------------------------------------------------------------ */
const VARIANTS = [
  { suffix:'', label:null, mul:{}, tier:0, cost:1 },
  { suffix:'-ii', label:'Mk II', mul:{ dmg:1.14, heat:1.05, tons:1.05 }, tier:1, cost:2.1,
    note:'Refit with tighter tolerances -- more damage for a little more mass.' },
  { suffix:'-iii', label:'Mk III', mul:{ dmg:1.28, rpm:1.08, heat:1.12, tons:1.12 }, tier:2, cost:4.0,
    note:'Factory-new pattern. Faster cycling and a heavier punch.' },
  { suffix:'-ultra', label:'Ultra', mul:{ rpm:1.75, heat:1.5, ammo:1.3, jamChance:1 }, tier:2, cost:3.4,
    flags:['jam'], note:'Double-feed mechanism. Fires far faster and occasionally jams.' },
  { suffix:'-lt', label:'Lightweight', mul:{ tons:0.68, dmg:0.9, ammo:0.85 }, tier:1, cost:1.7,
    note:'Stripped for weight. Ideal when the tonnage budget is the real enemy.' },
  { suffix:'-hv', label:'Heavy-Bore', mul:{ dmg:1.45, rpm:0.72, tons:1.3, heat:1.25, opt:0.9 }, tier:2, cost:3.2,
    flags:['stagger'], note:'Over-bored barrel. Slower, brutal, and it shoves what it hits.' },
  { suffix:'-x', label:'Extended', mul:{ opt:1.45, max:1.4, dmg:0.92, heat:1.18, tons:1.1 }, tier:3, cost:4.4,
    note:'Long-barrel/extended-optic build for players who pick the ridge, not the alley.' },
  { suffix:'-c', label:'Compact', mul:{ tons:0.8, opt:0.78, rpm:1.2, spread:1.3 }, tier:2, cost:2.4,
    note:'Cut-down housing. Shorter reach, much quicker to bring on target.' },
  { suffix:'-p', label:'Precision', mul:{ spread:0.25, dmg:1.06, rpm:0.88, tons:1.06 }, tier:3, cost:4.8,
    note:'Match-grade. Pinpoint even at a dead sprint.' },
  { suffix:'-prime', label:'Prime', mul:{ dmg:1.38, rpm:1.15, heat:0.85, tons:1.02, opt:1.15 }, tier:4, cost:9.0,
    note:'Salvaged prototype. Better at everything and priced accordingly.' },
];

/* Which variants each class is allowed to roll, so the catalog stays sane. */
const VARIANT_RULES = {
  ballistic: ['', '-ii', '-iii', '-ultra', '-lt', '-hv', '-x', '-p', '-prime'],
  energy:    ['', '-ii', '-iii', '-lt', '-x', '-c', '-p', '-prime'],
  missile:   ['', '-ii', '-iii', '-lt', '-hv', '-x', '-prime'],
  support:   ['', '-ii', '-iii'],
};

const SIZE_ORDER = { S:0, M:1, L:2, XL:3 };

function applyMul(base, variant) {
  const out = { ...base };
  out.flags = [...(base.flags || [])];
  for (const [k, v] of Object.entries(variant.mul)) {
    if (k === 'jamChance') { out.jamChance = 0.035; continue; }
    if (typeof out[k] === 'number') out[k] = Math.round(out[k] * v * 1000) / 1000;
  }
  if (variant.flags) for (const f of variant.flags) if (!out.flags.includes(f)) out.flags.push(f);
  if (out.ammo > 0) out.ammo = Math.round(out.ammo);
  if (out.mag > 0) out.mag = Math.max(1, Math.round(out.mag));
  out.tons = Math.round(out.tons * 10) / 10;
  out.tier = Math.min(5, base.tier + variant.tier);
  out.cost = Math.round((base.cost + 400) * variant.cost / 100) * 100;
  return out;
}

/** Fully expanded weapon catalog: base rows plus generated variants. */
export const WEAPONS = (() => {
  const list = [];
  for (const base of BASE) {
    const allowed = VARIANT_RULES[base.cls] || [''];
    for (const v of VARIANTS) {
      if (!allowed.includes(v.suffix)) continue;
      const w = applyMul(base, v);
      w.id = base.id + v.suffix;
      w.name = v.label ? `${base.name} ${v.label}` : base.name;
      w.variant = v.label || 'Standard';
      w.blurb = v.note ? `${base.blurb} ${v.note}` : base.blurb;
      w.baseId = base.id;
      w.color = CLASS_COLOR[w.cls];
      w.pellets = w.pellets || 1;
      w.splash = base.splash ? { ...base.splash } : null;
      w.max = w.max || Math.round(w.opt * 1.5);

      list.push(w);
    }
  }

  /* Rarity. Tier on its own piles half the catalogue into the top grade
   * (a tier-3 archetype plus a Prime refit caps out at 5), and a Mythic that
   * half the guns share is not rare. So weapons are ranked by value -- the
   * hand-set price already encodes archetype and refit -- and cut into a
   * real pyramid: most guns Common, a handful Mythic. The starter kit is
   * Common by definition. */
  const CUTS = [0.30, 0.58, 0.80, 0.93, 1.0];         // cumulative share per rarity
  const ranked = [...list].sort((a, b) => (a.cost - b.cost) || (dps(a) - dps(b)));
  ranked.forEach((w, i) => {
    const f = (i + 0.5) / ranked.length;
    const tier = w.cost === 0 ? 1 : CUTS.findIndex(c => f <= c) + 1;
    const r = rarityForTier(tier);
    w.rarity = r.id;
    w.rarityTier = r.tier;
    // A rarer gun hits harder, on top of the global scale.
    const k = DAMAGE_SCALE * r.power;
    if (w.dmg) w.dmg = Math.round(w.dmg * k * 100) / 100;
    if (w.splash) w.splash.dmg = Math.round(w.splash.dmg * k * 10) / 10;
    if (w.heal) w.heal = Math.round(w.heal * k * 10) / 10;
    if (w.shieldGive) w.shieldGive = Math.round(w.shieldGive * k);
  });
  /* Damage floor: no gun deals 50 damage a second or less. The weakest are
   * lifted along a straight line that meets the untouched guns at 80 DPS,
   * so the order is kept -- a Small Laser still trails a Medium Laser, a
   * refit still beats its base -- and everything from 80 up is left alone.
   * Tools that are not guns (repair, shield projector, target designator)
   * are exempt: their job is not damage. Slow single-shot guns are then
   * nudged so one hit also reads above 50. */
  const FLOOR = 55, PIVOT = 80, HIT_FLOOR = 52;
  for (const w of list) {
    const f = w.flags || [];
    if (!(w.dmg > 0) || f.includes('heal') || f.includes('tag')) continue;
    let k = 1;
    const d = dps(w);
    if (d < PIVOT) k = (FLOOR + d * (PIVOT - FLOOR) / PIVOT) / d;
    const target = d * k;                         // the damage a second it should end on
    if (w.rpm <= 120 && (w.pellets || 1) === 1 && w.dmg * k < HIT_FLOOR) {
      // Bigger hits, fired a little slower: the per-second figure stays on
      // the line, so a Small Laser does not catch up with a Medium Laser.
      k = HIT_FLOOR / w.dmg;
      w.rpm = Math.round(target * 60 / HIT_FLOOR * 100) / 100;
    }
    if (k === 1) continue;
    w.dmg = Math.round(w.dmg * k * 100) / 100;
    if (w.splash) w.splash.dmg = Math.round(w.splash.dmg * k * 10) / 10;
  }

  // Prices follow rarity strictly: see data/rarity.js.
  bandPrices(list, 'weaponBand');
  return list;
})();

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map(w => [w.id, w]));

/** Sustained damage per second, ignoring reloads (used for UI bars and AI scoring). */
export function dps(w) {
  const perShot = (w.dmg || 0) * (w.pellets || 1);
  if (w.mode === 'beam' || w.mode === 'stream') return perShot * (w.rpm / 60);
  return perShot * (w.rpm / 60);
}

/** Heat produced per second at full trigger. */
export function hps(w) { return (w.heat || 0) * (w.rpm / 60); }

/** Damage at a given range after linear falloff past the optimal bracket. */
export function damageAtRange(w, dist) {
  if (dist <= w.opt) return w.dmg;
  if (dist >= w.max) return 0;
  const t = (dist - w.opt) / (w.max - w.opt);
  const floor = (w.flags || []).includes('overpen') ? 0.55 : 0.0;
  return w.dmg * (1 - t * (1 - floor));
}

export function fitsHardpoint(weapon, hardpointSize) {
  return SIZE_ORDER[weapon.size] <= SIZE_ORDER[hardpointSize];
}

export function weaponsForSize(size) {
  return WEAPONS.filter(w => fitsHardpoint(w, size));
}

export const WEAPON_CLASSES = ['ballistic', 'energy', 'missile', 'support'];
export { CLASS_COLOR };
