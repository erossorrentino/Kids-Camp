/**
 * PILOTS & CYBERNETIC IMPLANTS
 * ------------------------------------------------------------------
 * A pilot is a passive stat package plus three implant sockets. The
 * modifier keys below are read by Mech.recomputeStats(); anything not
 * listed simply has no effect, so adding a new bonus is one line here
 * plus one line in that function.
 *
 * Modifier keys
 *   speed, accel, turn, torsoTurn   movement
 *   armour, structure               durability
 *   heatCap, heatSink               thermals
 *   damage, rate, reload, spread    gunnery
 *   jetThrust, jetFuel              mobility
 *   cooldown                        ability recharge (lower is better)
 *   lockTime, sensorRange, stealth  electronics
 *   repairRate, shieldMul           support
 */

export const PILOTS = [
  { id:'vega', name:'Mara "Vega" Solano', call:'VEGA', origin:'Terra Firma Lancers', tier:1, cost:0,
    portrait:{ hue:200, style:'helm' },
    bio:'Twelve years on the line and not one abandoned position. Vega teaches recruits that armour is a resource you spend, not a thing you protect.',
    mods:{ armour:0.06, heatCap:0.05 },
    quote:'"Hold the line. The line holds you."' },

  { id:'ash', name:'Devrin "Ash" Kalu', call:'ASH', origin:'Ninth Mobile Strike', tier:1, cost:0,
    portrait:{ hue:18, style:'visor' },
    bio:'A hit-and-run specialist who treats a five-minute match like four separate ambushes.',
    mods:{ speed:0.07, accel:0.10, cooldown:-0.05 },
    quote:'"If they can see you, you were already too slow."' },

  { id:'kestrel', name:'Ilsa "Kestrel" Brandt', call:'KESTREL', origin:'Highland Jump Corps', tier:2, cost:4000,
    portrait:{ hue:140, style:'helm' },
    bio:'Made her name dropping a 90-ton Highlander onto a command tent. Twice.',
    mods:{ jetThrust:0.22, jetFuel:0.25, damage:0.04 },
    quote:'"Gravity is a weapon. I just aim it."' },

  { id:'coil', name:'Renn "Coil" Achebe', call:'COIL', origin:'Sigma Technical Cadre', tier:2, cost:4400,
    portrait:{ hue:265, style:'rig' },
    bio:'A reactor engineer who flies. Nobody runs a hotter build and nobody shuts down less often.',
    mods:{ heatCap:0.15, heatSink:0.18, rate:0.03 },
    quote:'"Redline is a suggestion written by cowards."' },

  { id:'vulture', name:'Tam "Vulture" Oyelaran', call:'VULTURE', origin:'Free Salvage Company', tier:2, cost:4800,
    portrait:{ hue:38, style:'visor' },
    bio:'Fights for the wreck, not the win -- which is why she is so very good at finishing kills.',
    mods:{ damage:0.08, reload:-0.10 },
    quote:'"Everything out here is scrap. Some of it just hasn\'t noticed yet."' },

  { id:'lattice', name:'Yuen "Lattice" Park', call:'LATTICE', origin:'Orbital Signals Division', tier:3, cost:8200,
    portrait:{ hue:185, style:'rig' },
    bio:'Runs the enemy\'s sensor net as if it were her own. Locks appear faster and last longer.',
    mods:{ lockTime:-0.30, sensorRange:0.35, cooldown:-0.08 },
    quote:'"I read their radar before they do."' },

  { id:'anvil', name:'Bodan "Anvil" Vuksic', call:'ANVIL', origin:'Ironback Heavy Regiment', tier:3, cost:8600,
    portrait:{ hue:8, style:'helm' },
    bio:'Believes the correct response to incoming fire is to walk towards it more slowly.',
    mods:{ armour:0.14, structure:0.12, speed:-0.05, spread:-0.10 },
    quote:'"Let them shoot. I have plenty of mech left."' },

  { id:'quill', name:'Sera "Quill" Amadi', call:'QUILL', origin:'Longshot Marksman Guild', tier:3, cost:9000,
    portrait:{ hue:52, style:'visor' },
    bio:'One shot per engagement, most of the time. The other times she missed on purpose.',
    mods:{ spread:-0.35, damage:0.06, rate:-0.05 },
    quote:'"Aim small. Everything else follows."' },

  { id:'hollow', name:'"Hollow" (no file)', call:'HOLLOW', origin:'Unregistered', tier:4, cost:15000,
    portrait:{ hue:290, style:'rig' },
    bio:'No service record, no callsign registry, no explanation for the prototype neural lace. Wins anyway.',
    mods:{ cooldown:-0.22, stealth:0.30, speed:0.05 },
    quote:'"..."' },

  { id:'forge', name:'Deta "Forge" Nakamura', call:'FORGE', origin:'Caduceus Field Hospital', tier:4, cost:14000,
    portrait:{ hue:110, style:'helm' },
    bio:'Field medic turned pilot. Her repair beams keep whole lances standing long past their expiry.',
    mods:{ repairRate:0.35, shieldMul:0.25, armour:0.05 },
    quote:'"Nobody walks home alone."' },

  { id:'tempest', name:'Aurelio "Tempest" Vance', call:'TEMPEST', origin:'Storm Lance Elite', tier:5, cost:24000,
    portrait:{ hue:220, style:'rig' },
    bio:'Four championship rings. Runs energy builds nobody else can cool and hits like a dropship.',
    mods:{ damage:0.12, heatCap:0.10, rate:0.08, armour:-0.04 },
    quote:'"Bring a bigger reactor."' },

  { id:'grave', name:'Nyx "Gravewalker" Oduya', call:'GRAVE', origin:'Penal Lance 13', tier:5, cost:26000,
    portrait:{ hue:0, style:'visor' },
    bio:'Survives things that should not be survivable. Gets stronger as her mech falls apart.',
    mods:{ structure:0.30, lastStand:true, damage:0.05 },
    quote:'"Count me out when the reactor is cold. Not before."' },
];

export const PILOT_BY_ID = Object.fromEntries(PILOTS.map(p => [p.id, p]));

/* ------------------------------------------------------------------ *
 * Implants -- three sockets per pilot. Each socket accepts any implant,
 * but the same implant cannot be slotted twice.
 * ------------------------------------------------------------------ */
export const IMPLANTS = [
  { id:'myomer',   name:'Myomer Accelerator',  slot:'any', tier:1, cost:1200, mods:{ speed:0.06, accel:0.08 },
    desc:'Synthetic muscle bundles cycle faster. Straight-line speed and acceleration.' },
  { id:'gyro',     name:'Gyro Stabiliser',     slot:'any', tier:1, cost:1200, mods:{ spread:-0.14, turn:0.08 },
    desc:'Keeps the torso level under recoil. Tighter groups while moving.' },
  { id:'coolant',  name:'Coolant Injector',    slot:'any', tier:1, cost:1400, mods:{ heatSink:0.16 },
    desc:'Flash-cools the heat exchangers. Measurably more time on the trigger.' },
  { id:'ferro',    name:'Ferro-Fibrous Weave', slot:'any', tier:2, cost:3000, mods:{ armour:0.09 },
    desc:'Denser plating laminate for the same tonnage.' },
  { id:'endo',     name:'Endo-Steel Frame',    slot:'any', tier:2, cost:3200, mods:{ structure:0.14 },
    desc:'Lighter, tougher internal skeleton. You keep fighting after the armour is gone.' },
  { id:'targcomp', name:'Targeting Computer',  slot:'any', tier:2, cost:3600, mods:{ damage:0.06, spread:-0.08 },
    desc:'Predictive fire control. Every weapon lands a little harder.' },
  { id:'artemis',  name:'Artemis IV FCS',      slot:'any', tier:2, cost:3400, mods:{ lockTime:-0.25, missileSpread:-0.30 },
    desc:'Missile guidance upgrade: faster locks, far tighter volleys.' },
  { id:'autoload', name:'Autoloader Rig',      slot:'any', tier:2, cost:3300, mods:{ reload:-0.20 },
    desc:'Mechanised ammunition feed. Magazines change themselves.' },
  { id:'jumpcap',  name:'Jump Capacitor',      slot:'any', tier:2, cost:3100, mods:{ jetThrust:0.18, jetFuel:0.20 },
    desc:'Bigger thruster capacitor bank for longer, higher jumps.' },
  { id:'shieldcap',name:'Shield Capacitor',    slot:'any', tier:3, cost:6400, mods:{ shieldMul:0.30, shieldRegen:0.25 },
    desc:'Stores more shield charge and rebuilds it sooner after a hit.' },
  { id:'cascade',  name:'Cascade Regulator',   slot:'any', tier:3, cost:6800, mods:{ cooldown:-0.14 },
    desc:'Shortens the recharge on your chassis special ability.' },
  { id:'sensors',  name:'Deep Sensor Array',   slot:'any', tier:3, cost:6000, mods:{ sensorRange:0.40, lockTime:-0.12 },
    desc:'Extends radar reach and sees further through jamming.' },
  { id:'ecmshield',name:'ECM Hardening',       slot:'any', tier:3, cost:6200, mods:{ ecmResist:0.6, empResist:0.4 },
    desc:'Shrugs off enemy jamming and halves EMP heat transfer.' },
  { id:'ablative', name:'Ablative Coating',    slot:'any', tier:3, cost:6600, mods:{ energyResist:0.18 },
    desc:'Reflective plating that blunts laser and particle damage specifically.' },
  { id:'reactive', name:'Reactive Plating',    slot:'any', tier:3, cost:6600, mods:{ explosiveResist:0.22 },
    desc:'Counter-charges detonate outward. Missiles and splash hurt far less.' },
  { id:'triplestr',name:'Triple-Strength Myomer', slot:'any', tier:4, cost:11000, mods:{ speed:0.10, damage:0.05, heatCap:-0.06 },
    desc:'Runs hot, hits hard, moves fast. A pure aggression package.' },
  { id:'nanorep',  name:'Nanite Repair Bay',   slot:'any', tier:4, cost:12000, mods:{ selfRepair:9 },
    desc:'Slowly welds your own structure back together while out of combat.' },
  { id:'overpres', name:'Overpressure Vents',  slot:'any', tier:4, cost:11500, mods:{ heatCap:0.18, shutdownResist:0.5 },
    desc:'Emergency venting. Bigger heat ceiling and you recover from shutdown in half the time.' },
  { id:'neural',   name:'Neural Bridge',       slot:'any', tier:5, cost:19000, mods:{ turn:0.14, torsoTurn:0.18, rate:0.06 },
    desc:'Direct cortical link. Everything responds the instant you think it.' },
  { id:'ghostcirc',name:'Ghost Circuit',       slot:'any', tier:5, cost:21000, mods:{ stealth:0.35, radarBlur:1 },
    desc:'Your radar contact flickers and drifts. Hard to lock, harder to lead.' },
];

export const IMPLANT_BY_ID = Object.fromEntries(IMPLANTS.map(i => [i.id, i]));

/** Merge a pilot's passives with up to three implants into one modifier bag. */
export function aggregateMods(pilotId, implantIds = []) {
  const out = {};
  const add = (mods) => {
    for (const [k, v] of Object.entries(mods || {})) {
      if (typeof v === 'boolean') { out[k] = out[k] || v; continue; }
      out[k] = (out[k] || 0) + v;
    }
  };
  add(PILOT_BY_ID[pilotId]?.mods);
  for (const id of implantIds) if (id) add(IMPLANT_BY_ID[id]?.mods);
  return out;
}

export const IMPLANT_SLOTS = 3;
