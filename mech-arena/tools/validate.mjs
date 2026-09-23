/**
 * Data integrity checks.
 *
 * The content layer is plain data with ids pointing at other ids. Nothing
 * type-checks those references, and a bad one usually shows up as an empty
 * menu or a crash halfway into a match rather than as an error. This runs
 * in a fraction of a second and needs no browser.
 */
import { WEAPONS, WEAPON_BY_ID, dps, hps, fitsHardpoint } from '../src/data/weapons.js';
import { MECHS, MECH_BY_ID, LOCATIONS, battleValue } from '../src/data/mechs.js';
import { ABILITIES } from '../src/data/abilities.js';
import { PILOTS, IMPLANTS, aggregateMods, IMPLANT_SLOTS } from '../src/data/pilots.js';
import { SKINS, SKIN_BY_ID, DEFAULT_SKIN, starterSkins } from '../src/data/skins.js';
import { MAPS, MAP_BY_ID, BIOMES, mapsForMode } from '../src/data/maps.js';
import { MODES, MODE_LIST } from '../src/data/modes.js';
import { TOURNAMENTS } from '../src/data/tournaments.js';
import { RARITIES, RARITY_BY_ID } from '../src/data/rarity.js';

const problems = [];
const fail = (msg) => problems.push(msg);
let checks = 0;
const check = (cond, msg) => { checks++; if (!cond) fail(msg); };

/* ---- weapons ---- */
const weaponIds = new Set();
for (const w of WEAPONS) {
  check(!weaponIds.has(w.id), `duplicate weapon id ${w.id}`);
  weaponIds.add(w.id);
  check(['ballistic', 'energy', 'missile', 'support'].includes(w.cls), `${w.id}: bad class ${w.cls}`);
  check(['S', 'M', 'L', 'XL'].includes(w.size), `${w.id}: bad size ${w.size}`);
  check(w.tons > 0, `${w.id}: non-positive tonnage`);
  check(w.opt > 0 && w.max > w.opt, `${w.id}: bad range bracket ${w.opt}/${w.max}`);
  check(w.rpm > 0, `${w.id}: non-positive rpm`);
  check(Number.isFinite(dps(w)) && dps(w) >= 0, `${w.id}: dps is not a finite number`);
  check(Number.isFinite(hps(w)), `${w.id}: heat/s is not a finite number`);
  check(w.cost >= 0, `${w.id}: negative cost`);
  check(w.tier >= 1 && w.tier <= 5, `${w.id}: tier ${w.tier} out of range`);
  if (w.mag > 0 && w.ammo > 0) check(w.ammo >= w.mag, `${w.id}: reserve ${w.ammo} below one magazine ${w.mag}`);
}

/* ---- mechs ---- */
for (const m of MECHS) {
  check(!!ABILITIES[m.ability], `${m.id}: unknown ability "${m.ability}"`);
  check(m.hardpoints.length > 0, `${m.id}: no hardpoints`);
  check(m.payload > 0, `${m.id}: no payload budget`);
  check(m.maxHP > 0, `${m.id}: no armour`);
  for (const loc of LOCATIONS) {
    check(m.armour[loc] > 0, `${m.id}: section ${loc} has no armour`);
    check(m.structure[loc] > 0, `${m.id}: section ${loc} has no structure`);
  }
  for (const hp of m.hardpoints) {
    check(LOCATIONS.includes(hp.loc), `${m.id}: hardpoint in unknown location ${hp.loc}`);
    check(['S', 'M', 'L', 'XL'].includes(hp.size), `${m.id}: hardpoint bad size ${hp.size}`);
    // Every hardpoint must have at least one weapon that fits within budget,
    // or a slot can never be filled.
    const fits = WEAPONS.some(w => fitsHardpoint(w, hp.size) && w.tons <= m.payload && w.tier === 1);
    check(fits, `${m.id}: ${hp.loc}/${hp.size} has no tier-1 weapon that fits its budget`);
  }
  check(Number.isFinite(battleValue(m)), `${m.id}: battle value is not finite`);
  // The model builder needs these.
  for (const key of ['legs', 'torso', 'cockpit', 'shoulders', 'arms', 'height', 'width', 'accents']) {
    check(m.build[key] !== undefined, `${m.id}: build is missing ${key}`);
  }
}

/* ---- abilities ---- */
for (const [id, a] of Object.entries(ABILITIES)) {
  check(a.id === id, `ability ${id}: id field says "${a.id}"`);
  check(a.cooldown > 0, `ability ${id}: non-positive cooldown`);
  check(typeof a.desc === 'string' && a.desc.length > 20, `ability ${id}: missing description`);
  check(typeof a.onActivate === 'function' || typeof a.onTick === 'function',
    `ability ${id}: does nothing`);
  if (a.duration > 0) {
    check(typeof a.onEnd === 'function' || typeof a.onTick === 'function',
      `ability ${id}: has a duration but no tick or end hook`);
  }
}
const usedAbilities = new Set(MECHS.map(m => m.ability));
for (const id of Object.keys(ABILITIES)) {
  check(usedAbilities.has(id), `ability ${id} is not carried by any chassis`);
}

/* ---- pilots and implants ---- */
for (const p of PILOTS) {
  check(Object.keys(p.mods).length > 0, `pilot ${p.id}: no modifiers`);
  check(p.cost >= 0, `pilot ${p.id}: negative cost`);
}
for (const i of IMPLANTS) {
  check(Object.keys(i.mods).length > 0, `implant ${i.id}: no modifiers`);
}
{
  const mods = aggregateMods(PILOTS[0].id, IMPLANTS.slice(0, IMPLANT_SLOTS).map(i => i.id));
  check(Object.values(mods).every(v => typeof v === 'boolean' || Number.isFinite(v)),
    'aggregateMods produced a non-finite modifier');
}

/* ---- skins ---- */
check(!!SKIN_BY_ID[DEFAULT_SKIN], `default skin ${DEFAULT_SKIN} does not exist`);
check(starterSkins().length > 0, 'no free starter skins');
for (const s of SKINS.slice(0, 200)) {
  check(/^#[0-9a-f]{6}$/i.test(s.primary), `skin ${s.id}: bad primary colour`);
  check(s.metal >= 0 && s.metal <= 1, `skin ${s.id}: metalness out of range`);
}

/* ---- maps and modes ---- */
for (const m of MAPS) {
  check(!!BIOMES[m.biome], `map ${m.id}: unknown biome ${m.biome}`);
  check(m.size >= 300, `map ${m.id}: suspiciously small (${m.size})`);
  check(m.modes.length > 0, `map ${m.id}: supports no modes`);
  for (const mode of m.modes) check(!!MODES[mode], `map ${m.id}: unknown mode ${mode}`);
}
for (const mode of MODE_LIST) {
  check(mapsForMode(mode.id).length > 0, `mode ${mode.id}: no arena supports it`);
  check(mode.perTeam > 0 && mode.teams > 1, `mode ${mode.id}: bad team shape`);
  check(mode.duration > 30, `mode ${mode.id}: implausible duration`);
  check(mode.hangarSize > 0, `mode ${mode.id}: no hangar size`);
}

/* ---- tournaments ---- */
for (const t of TOURNAMENTS) {
  check(t.rounds.length >= 3, `tournament ${t.id}: fewer than three rounds`);
  check(t.purse > t.entryFee, `tournament ${t.id}: purse does not beat the entry fee`);
  for (const r of t.rounds) {
    check(!!MODES[r.mode], `tournament ${t.id}: unknown mode ${r.mode}`);
    if (r.map) {
      const map = MAP_BY_ID[r.map];
      check(!!map, `tournament ${t.id}: unknown arena ${r.map}`);
      if (map) check(map.modes.includes(r.mode), `tournament ${t.id}: ${r.map} does not host ${r.mode}`);
    }
  }
  if (t.reward.kind === 'skin') check(!!SKIN_BY_ID[t.reward.id], `tournament ${t.id}: unknown skin reward ${t.reward.id}`);
  if (t.reward.kind === 'mech') check(!!MECH_BY_ID[t.reward.id], `tournament ${t.id}: unknown mech reward ${t.reward.id}`);
}

/* ---- rarity ----
 * The promise to the player is "rarer is better and rarer costs more".
 * Costs more is checked strictly: every priced item of a rarity is dearer
 * than every priced item of any lower rarity. Better is checked within a
 * family: the same archetype at a higher rarity never does less damage
 * per second. */
for (const [label, items] of [['weapon', WEAPONS], ['chassis', MECHS]]) {
  for (const it of items) check(!!RARITY_BY_ID[it.rarity], `${label} ${it.id}: no rarity`);
  for (let i = 0; i < RARITIES.length - 1; i++) {
    const lo = items.filter(x => x.rarity === RARITIES[i].id && x.cost > 0);
    const hi = items.filter(x => x.rarity === RARITIES[i + 1].id && x.cost > 0);
    if (!lo.length || !hi.length) continue;
    const maxLo = Math.max(...lo.map(x => x.cost)), minHi = Math.min(...hi.map(x => x.cost));
    check(maxLo < minHi, `${label}: a ${RARITIES[i].name} costs ${maxLo}, more than a ${RARITIES[i + 1].name} at ${minHi}`);
  }
}
const tierOf = (w) => RARITY_BY_ID[w.rarity].tier;
const counts = RARITIES.map(r => WEAPONS.filter(w => w.rarity === r.id).length);
check(counts[0] > counts[4], `weapon rarities are not a pyramid: ${counts.join('/')}`);
const families = new Map();
for (const w of WEAPONS) {
  if (!families.has(w.baseId)) families.set(w.baseId, []);
  families.get(w.baseId).push(w);
}
for (const [base, fam] of families) {
  // Compare the straight refits only; Lightweight/Extended/Compact trade
  // damage for mass or reach on purpose.
  const line = fam.filter(w => ['Standard', 'Mk II', 'Mk III', 'Prime'].includes(w.variant))
    .sort((a, b) => tierOf(a) - tierOf(b) || a.cost - b.cost);
  for (let i = 1; i < line.length; i++) {
    if (tierOf(line[i]) > tierOf(line[i - 1])) {
      check(dps(line[i]) >= dps(line[i - 1]) - 1e-6,
        `${base}: ${line[i].name} (${line[i].rarity}) does less than ${line[i - 1].name} (${line[i - 1].rarity})`);
    }
    check(line[i].cost >= line[i - 1].cost, `${base}: ${line[i].name} is cheaper than ${line[i - 1].name}`);
  }
}

/* ---- report ---- */
if (problems.length) {
  console.error(`${problems.length} problem(s) in ${checks} checks:\n`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`data OK: ${checks} checks across ${WEAPONS.length} weapons, ${MECHS.length} chassis, ` +
  `${MAPS.length} arenas, ${MODE_LIST.length} modes, ${TOURNAMENTS.length} tournaments`);
