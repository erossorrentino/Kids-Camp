/**
 * MENUS
 * ------------------------------------------------------------------
 * Every out-of-match screen: title, hangar, garage lists, pilot and
 * implants, deployment, settings and the post-match report.
 *
 * The hangar deliberately leaves the middle column empty -- the 3D bay
 * behind it is the mech preview, so the panels frame the machine instead
 * of covering it.
 */
import { MECHS, MECH_BY_ID, CLASSES, LOCATION_NAMES, battleValue } from '../data/mechs.js';
import { WEAPONS, WEAPON_BY_ID, weaponsForSize, fitsHardpoint, dps, hps } from '../data/weapons.js';
import { PILOTS, PILOT_BY_ID, IMPLANTS, IMPLANT_BY_ID, IMPLANT_SLOTS } from '../data/pilots.js';
import { SKINS, SKIN_BY_ID, COLOURWAYS, PATTERNS, FINISHES, DEFAULT_SKIN } from '../data/skins.js';
import { MAPS, MAP_BY_ID, BIOMES, mapsForMode } from '../data/maps.js';
import { MODE_LIST, getMode } from '../data/modes.js';
import { getAbility } from '../data/abilities.js';
import { DIFFICULTIES } from '../game/ai.js';
import { autoLoadout } from '../game/match.js';
import { RANK_TITLES } from './progression.js';
import { clamp } from '../core/rng.js';

const esc = (s) => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export class Menus {
  /**
   * @param {object} deps { progression, hangarScene, audio, engine, onDeploy, onQuit }
   */
  constructor(deps) {
    Object.assign(this, deps);
    this.root = document.getElementById('ui-root');
    this.screen = 'title';
    this.slot = 0;              // active hangar slot
    this.hardpoint = 0;         // active hardpoint within that slot
    this.garageTab = 'chassis';
    this.weaponFilter = 'all';
    this.deployMode = 'tdm';
    this.deployMap = 'random';
    this.lastResult = null;
    this._modalStack = [];
  }

  open(screen = 'title') {
    // A late boot step or a stray handler must never drop the menu over a
    // live match -- it would steal the camera and the scene lighting.
    if (this.suspended) return;
    this.screen = screen;
    this.root.classList.add('active');
    if (screen === 'hangar' || screen === 'deploy' || screen === 'pilot') this.hangarScene.enter();
    else if (screen === 'title') this.hangarScene.enter();
    else this.hangarScene.leave();
    this.render();
  }

  close() {
    this.root.classList.remove('active');
    this.hangarScene.leave();
  }

  go(screen) {
    this.audio.play('ui');
    this.open(screen);
  }

  /* ================================================================ */
  render() {
    const p = this.progression;
    let html = '';
    switch (this.screen) {
      case 'title': html = this.renderTitle(); break;
      case 'hangar': html = this.renderHangar(); break;
      case 'garage': html = this.renderGarage(); break;
      case 'pilot': html = this.renderPilot(); break;
      case 'deploy': html = this.renderDeploy(); break;
      case 'settings': html = this.renderSettings(); break;
      case 'results': html = this.renderResults(); break;
      case 'codex': html = this.renderCodex(); break;
      default: html = this.renderTitle();
    }
    this.root.innerHTML = html;
    this._wire();
    this._syncPreview();
  }

  header(crumb, backTo = 'hangar') {
    const p = this.progression.data;
    const xp = this.progression.xpIntoRank;
    return `<div class="screen-head">
      <div>
        <div class="brand">IRON <span>VANGUARD</span></div>
        <div class="crumbs">${esc(crumb)}</div>
      </div>
      <div class="spacer"></div>
      <div class="wallet">
        <div>CR <b>${fmt(p.credits)}</b></div>
        <div class="xp">RANK <b>${this.progression.rank}</b> ${esc(this.progression.rankTitle)}
          <span class="muted tiny">${fmt(xp.have)}/${fmt(xp.need)}</span></div>
      </div>
      ${backTo ? `<button class="btn ghost" data-go="${backTo}">BACK</button>` : ''}
    </div>`;
  }

  /* ---------------- title ---------------- */
  renderTitle() {
    const p = this.progression.data;
    return `<div class="screen title-hero">
      <div class="logo">IRON<br><span>VANGUARD</span></div>
      <div class="tagline">HEAVY METAL COMBAT · ${MECHS.length} CHASSIS · ${WEAPONS.length} WEAPONS · ${MAPS.length} ARENAS</div>
      <div class="title-menu">
        ${p.matches === 0
          ? `<button class="btn primary lg" data-action="training">TRAINING RANGE</button>
             <button class="btn" data-go="deploy">DEPLOY</button>`
          : `<button class="btn primary lg" data-go="deploy">DEPLOY</button>
             <button class="btn" data-action="training">TRAINING RANGE</button>`}
        <button class="btn" data-go="hangar">HANGAR</button>
        <button class="btn" data-go="garage">GARAGE</button>
        <button class="btn" data-go="pilot">PILOT</button>
        <button class="btn" data-go="codex">CODEX</button>
        <button class="btn ghost" data-go="settings">SETTINGS</button>
      </div>
      <div class="title-foot">
        ${p.matches} MATCHES · ${p.wins} WINS · ${fmt(p.kills)} KILLS · RANK ${this.progression.rank} ${esc(this.progression.rankTitle)}
      </div>
    </div>`;
  }

  /* ---------------- hangar ---------------- */
  renderHangar() {
    const p = this.progression;
    const builds = p.hangar;
    const build = builds[this.slot];
    const chassis = build ? MECH_BY_ID[build.chassisId] : null;
    const maxSlots = 5;

    const strip = Array.from({ length: maxSlots }, (_, i) => {
      const b = builds[i];
      const c = b ? MECH_BY_ID[b.chassisId] : null;
      if (!c) return `<div class="slot-card${i === this.slot ? ' on' : ''}" data-slot="${i}"><span class="sc-empty">+ ADD MECH</span></div>`;
      return `<div class="slot-card filled${i === this.slot ? ' on' : ''}" data-slot="${i}">
        <div class="sc-n">${esc(c.name)}</div>
        <div class="sc-c">${c.classLabel} · ${c.tons}t</div>
      </div>`;
    }).join('');

    if (!chassis) {
      return `<div class="screen">${this.header('HANGAR · LANCE', 'title')}
        <div class="loadout-strip">${strip}</div>
        <div class="panel"><h3>EMPTY BAY</h3>
          <p class="muted tiny" style="margin-bottom:14px">Pick a chassis to fill this slot. You bring up to five machines into a match and respawn in the next one each time you are destroyed.</p>
          <button class="btn primary" data-action="pickChassis">CHOOSE CHASSIS</button>
          ${builds.length > 1 ? '<button class="btn ghost" data-action="removeSlot">REMOVE BAY</button>' : ''}
        </div></div>`;
    }

    const ability = getAbility(chassis.ability);
    const tons = (build.loadout || []).reduce((a, id) => a + (id ? WEAPON_BY_ID[id].tons : 0), 0);
    const over = tons > chassis.payload;

    const hardpoints = chassis.hardpoints.map((hp, i) => {
      const id = build.loadout?.[i];
      const w = id ? WEAPON_BY_ID[id] : null;
      return `<div class="hardpoint-row${i === this.hardpoint ? ' on' : ''}" data-hp="${i}">
        <span class="hp-loc">${hp.loc}</span>
        <span class="hp-w ${w ? '' : 'none'}">${w ? esc(w.name) : 'empty'}</span>
        <span class="hp-size">${hp.size}</span>
      </div>`;
    }).join('');

    const totalDps = (build.loadout || []).reduce((a, id) => a + (id ? dps(WEAPON_BY_ID[id]) : 0), 0);
    const totalHps = (build.loadout || []).reduce((a, id) => a + (id ? hps(WEAPON_BY_ID[id]) : 0), 0);
    const sustainable = totalHps <= chassis.sinks * 1.02;

    const skin = SKIN_BY_ID[build.skinId] || SKIN_BY_ID[DEFAULT_SKIN];

    return `<div class="screen">${this.header('HANGAR · LANCE', 'title')}
      <div class="loadout-strip">${strip}</div>
      <div class="hangar-layout">
        <div class="panel">
          <h3>CHASSIS</h3>
          <h4 style="font-size:17px;letter-spacing:.1em">${esc(chassis.name)}</h4>
          <div class="sub" style="margin-bottom:8px">
            <span class="pill ${chassis.cls}">${chassis.classLabel}</span>
            <span class="muted"> ${chassis.tons} TONS</span>
          </div>
          <p class="muted tiny" style="line-height:1.55;margin-bottom:10px">${esc(chassis.blurb)}</p>
          ${statLine('SPEED', chassis.speed, 140)}
          ${statLine('ARMOUR', chassis.armourPool, 5000)}
          ${statLine('HEAT CAP', chassis.heatCap, 125)}
          ${statLine('COOLING', chassis.sinks, 18)}
          ${statLine('JETS', chassis.jets.thrust, 26)}
          ${statLine('AGILITY', chassis.turn, 185)}
          <div class="kv" style="margin-top:12px"><span>ABILITY</span><b>${ability.icon} ${esc(ability.name)}</b></div>
          <p class="muted tiny" style="line-height:1.5;margin-top:6px">${esc(ability.desc)}</p>
          <div class="row" style="margin-top:14px">
            <button class="btn" data-action="pickChassis">CHANGE</button>
            <button class="btn ghost" data-action="autoFit">AUTO-FIT</button>
          </div>
        </div>

        <div class="panel" style="background:transparent;border-color:transparent;pointer-events:none">
          <div style="height:60vh"></div>
          <div class="tiny muted" style="text-align:center;pointer-events:auto">DRAG TO ROTATE · SCROLL TO ZOOM</div>
        </div>

        <div class="panel">
          <h3>HARDPOINTS</h3>
          ${hardpoints}
          <div class="tonnage ${over ? 'over' : ''}">
            <span>PAYLOAD</span>
            <div class="track"><i style="width:${clamp(tons / chassis.payload, 0, 1) * 100}%"></i></div>
            <b>${tons.toFixed(1)}/${chassis.payload}t</b>
          </div>
          ${over ? '<div class="tiny" style="color:var(--red);margin-top:6px">OVER TONNAGE — top speed and agility reduced</div>' : ''}
          <div class="kv" style="margin-top:12px"><span>BURST DPS</span><b>${fmt(totalDps)}</b></div>
          <div class="kv"><span>HEAT / SEC</span><b style="color:${sustainable ? 'var(--green)' : 'var(--amber-hot)'}">${totalHps.toFixed(1)} vs ${chassis.sinks} sink</b></div>
          <div class="kv"><span>BATTLE VALUE</span><b>${fmt(battleValue(chassis))}</b></div>
          <button class="btn primary" style="width:100%;margin-top:12px" data-action="pickWeapon">FIT WEAPON TO ${chassis.hardpoints[this.hardpoint]?.loc || '—'}</button>
          <button class="btn ghost" style="width:100%;margin-top:6px" data-action="clearWeapon">CLEAR HARDPOINT</button>

          <h3 style="margin-top:18px">PAINT</h3>
          <div class="kv"><span>CURRENT</span><b>${esc(skin.name)}</b></div>
          <button class="btn" style="width:100%;margin-top:8px" data-action="pickSkin">CHANGE PAINT</button>
        </div>
      </div>
      <div class="row" style="margin-top:16px;justify-content:center">
        <button class="btn primary lg" data-go="deploy">DEPLOY</button>
      </div>
    </div>`;
  }

  /* ---------------- garage (browse + buy) ---------------- */
  renderGarage() {
    const tabs = ['chassis', 'weapons', 'skins'].map(t =>
      `<button class="tab${this.garageTab === t ? ' on' : ''}" data-tab="${t}">${t.toUpperCase()}</button>`).join('');

    let body = '';
    if (this.garageTab === 'chassis') {
      const byClass = Object.keys(CLASSES).map(cls => {
        const list = MECHS.filter(m => m.cls === cls);
        return `<h3 style="margin:16px 0 8px">${CLASSES[cls].label}</h3>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(232px,1fr))">
          ${list.map(m => this.mechCard(m)).join('')}
        </div>`;
      }).join('');
      body = byClass;
    } else if (this.garageTab === 'weapons') {
      const filters = ['all', 'ballistic', 'energy', 'missile', 'support'].map(f =>
        `<button class="tab${this.weaponFilter === f ? ' on' : ''}" data-filter="${f}">${f.toUpperCase()}</button>`).join('');
      const list = WEAPONS
        .filter(w => this.weaponFilter === 'all' || w.cls === this.weaponFilter)
        .sort((a, b) => a.tier - b.tier || a.tons - b.tons)
        .slice(0, 260);
      body = `<div class="tabs">${filters}</div>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(258px,1fr))">
          ${list.map(w => this.weaponCard(w)).join('')}
        </div>`;
    } else {
      const owned = this.progression.data.ownedSkins.length;
      body = `<p class="muted tiny" style="margin-bottom:12px">${fmt(owned)} of ${fmt(SKINS.length)} paint schemes unlocked.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">
        ${SKINS.filter(s => s.tier <= 3).slice(0, 180).map(s => this.skinCard(s)).join('')}
      </div>`;
    }

    return `<div class="screen">${this.header('GARAGE · ACQUISITIONS', 'title')}
      <div class="tabs">${tabs}</div>
      ${body}</div>`;
  }

  mechCard(m) {
    const owned = this.progression.owns('mech', m.id);
    const locked = !this.progression.tierUnlocked(m.tier);
    return `<div class="card clickable ${owned ? '' : 'locked'}" data-buy="mech:${m.id}">
      ${owned ? '' : `<span class="lock">${locked ? '🔒' : '🛒'}</span>`}
      <h4>${esc(m.name)}</h4>
      <div class="sub"><span class="pill ${m.cls}">${m.classLabel}</span> ${m.tons}t · ${m.hardpoints.length} HP</div>
      <p class="muted tiny" style="margin:8px 0;line-height:1.5;min-height:46px">${esc(m.blurb)}</p>
      ${statLine('SPD', m.speed, 140)}${statLine('ARM', m.armourPool, 5000)}${statLine('HEAT', m.heatCap, 125)}
      <div class="kv" style="margin-top:8px"><span>${owned ? 'OWNED' : 'PRICE'}</span><b>${owned ? '✓' : fmt(m.cost) + ' CR'}</b></div>
    </div>`;
  }

  weaponCard(w) {
    const owned = this.progression.owns('weapon', w.id);
    const locked = !this.progression.tierUnlocked(w.tier);
    return `<div class="card clickable ${owned ? '' : 'locked'}" data-buy="weapon:${w.id}">
      ${owned ? '' : `<span class="lock">${locked ? '🔒' : '🛒'}</span>`}
      <h4>${esc(w.name)}</h4>
      <div class="sub">${w.cls.toUpperCase()} · ${w.size} · ${w.tons}t</div>
      <p class="muted tiny" style="margin:6px 0;line-height:1.45;min-height:40px">${esc(w.blurb)}</p>
      <div class="kv"><span>DPS</span><b>${fmt(dps(w))}</b></div>
      <div class="kv"><span>RANGE</span><b>${w.opt}m / ${w.max}m</b></div>
      <div class="kv"><span>HEAT/S</span><b>${hps(w).toFixed(1)}</b></div>
      <div class="kv"><span>${owned ? 'OWNED' : 'PRICE'}</span><b>${owned ? '✓' : fmt(w.cost) + ' CR'}</b></div>
    </div>`;
  }

  skinCard(s) {
    const owned = this.progression.owns('skin', s.id);
    return `<div class="card clickable ${owned ? '' : 'locked'}" data-buy="skin:${s.id}">
      <div style="height:54px;border-radius:6px;margin-bottom:8px;background:linear-gradient(135deg,${s.primary} 0 55%,${s.secondary} 55% 80%,${s.trim} 80%)"></div>
      <h4 style="font-size:12px">${esc(s.name)}</h4>
      <div class="sub">${s.rarity.toUpperCase()}</div>
      <div class="kv"><span>${owned ? 'OWNED' : 'PRICE'}</span><b>${owned ? '✓' : fmt(s.cost) + ' CR'}</b></div>
    </div>`;
  }

  /* ---------------- pilot ---------------- */
  renderPilot() {
    const p = this.progression.data;
    const cur = PILOT_BY_ID[p.pilotId] || PILOTS[0];
    const slots = Array.from({ length: IMPLANT_SLOTS }, (_, i) => {
      const id = p.implants[i];
      const imp = id ? IMPLANT_BY_ID[id] : null;
      return `<div class="hardpoint-row" data-implant-slot="${i}">
        <span class="hp-loc">${i + 1}</span>
        <span class="hp-w ${imp ? '' : 'none'}">${imp ? esc(imp.name) : 'empty socket'}</span>
        <span class="hp-size">${imp ? 'T' + imp.tier : ''}</span>
      </div>`;
    }).join('');

    const combined = Object.entries(aggregate(p))
      .map(([k, v]) => `<div class="kv"><span>${esc(k.toUpperCase())}</span><b>${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%</b></div>`).join('');

    return `<div class="screen">${this.header('PILOT · NEURAL PROFILE', 'title')}
      <div class="hangar-layout">
        <div class="panel">
          <h3>ROSTER</h3>
          <div class="scroll">
          ${PILOTS.map(pl => {
            const owned = this.progression.owns('pilot', pl.id);
            const on = pl.id === p.pilotId;
            return `<div class="card clickable ${on ? 'on' : ''} ${owned ? '' : 'locked'}" data-pilot="${pl.id}" style="margin-bottom:8px">
              <h4>${esc(pl.call)}</h4>
              <div class="sub">${esc(pl.origin)}</div>
              <div class="kv" style="margin-top:6px"><span>${owned ? (on ? 'ACTIVE' : 'OWNED') : 'PRICE'}</span><b>${owned ? '✓' : fmt(pl.cost) + ' CR'}</b></div>
            </div>`;
          }).join('')}
          </div>
        </div>
        <div class="panel">
          <h3>${esc(cur.name)}</h3>
          <p class="muted tiny" style="line-height:1.6;margin-bottom:10px">${esc(cur.bio)}</p>
          <p class="tiny" style="color:var(--cyan);margin-bottom:14px">${esc(cur.quote)}</p>
          <h3>PASSIVES</h3>
          ${Object.entries(cur.mods).map(([k, v]) => `<div class="kv"><span>${esc(k.toUpperCase())}</span><b>${typeof v === 'boolean' ? 'YES' : (v > 0 ? '+' : '') + (v * 100).toFixed(0) + '%'}</b></div>`).join('')}
          <h3 style="margin-top:18px">IMPLANT SOCKETS</h3>
          ${slots}
          <h3 style="margin-top:18px">COMBINED PROFILE</h3>
          ${combined || '<div class="tiny muted">No modifiers active.</div>'}
        </div>
        <div class="panel">
          <h3>IMPLANT STOCK</h3>
          <div class="scroll">
          ${IMPLANTS.map(im => {
            const owned = this.progression.owns('implant', im.id);
            const fitted = p.implants.includes(im.id);
            return `<div class="card clickable ${fitted ? 'on' : ''} ${owned ? '' : 'locked'}" data-implant="${im.id}" style="margin-bottom:8px">
              <h4 style="font-size:12px">${esc(im.name)}</h4>
              <p class="muted tiny" style="margin:4px 0;line-height:1.45">${esc(im.desc)}</p>
              <div class="kv"><span>${owned ? (fitted ? 'FITTED' : 'OWNED') : 'PRICE'}</span><b>${owned ? '✓' : fmt(im.cost) + ' CR'}</b></div>
            </div>`;
          }).join('')}
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- deploy ---------------- */
  renderDeploy() {
    const mode = getMode(this.deployMode);
    const maps = mapsForMode(this.deployMode);
    const diffs = Object.entries(DIFFICULTIES);
    const cur = this.progression.settings.difficulty;
    const lance = this.progression.hangar.filter(Boolean);

    return `<div class="screen">${this.header('DEPLOYMENT', 'title')}
      <div class="hangar-layout">
        <div class="panel">
          <h3>MODE</h3>
          ${MODE_LIST.map(m => `<div class="card clickable ${m.id === this.deployMode ? 'on' : ''}" data-mode="${m.id}" style="margin-bottom:8px">
            <h4>${esc(m.name)}</h4>
            <div class="sub">${m.teams > 2 ? m.teams + ' PILOTS' : m.perTeam + 'v' + m.perTeam} · ${Math.round(m.duration / 60)} MIN</div>
            <p class="muted tiny" style="margin-top:6px;line-height:1.45">${esc(m.desc)}</p>
          </div>`).join('')}
        </div>
        <div class="panel">
          <h3>ARENA — ${maps.length} AVAILABLE</h3>
          <div class="scroll" style="max-height:52vh">
            <div class="card clickable ${this.deployMap === 'random' ? 'on' : ''}" data-map="random" style="margin-bottom:8px">
              <h4>RANDOM ARENA</h4><div class="sub">SURPRISE ME</div>
            </div>
            <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">
            ${maps.map(m => {
              const b = BIOMES[m.biome];
              return `<div class="card clickable ${this.deployMap === m.id ? 'on' : ''}" data-map="${m.id}">
                <div style="height:38px;border-radius:5px;margin-bottom:7px;background:linear-gradient(160deg,#${b.sky.toString(16).padStart(6, '0')},#${b.ground.toString(16).padStart(6, '0')})"></div>
                <h4 style="font-size:12px">${esc(m.name)}</h4>
                <div class="sub">${b.label} · ${m.layout.toUpperCase()}</div>
                <p class="muted tiny" style="margin-top:5px;line-height:1.4;min-height:34px">${esc(m.blurb)}</p>
              </div>`;
            }).join('')}
            </div>
          </div>
        </div>
        <div class="panel">
          <h3>OPPOSITION</h3>
          ${diffs.map(([k, d]) => `<div class="card clickable ${k === cur ? 'on' : ''}" data-diff="${k}" style="margin-bottom:6px">
            <h4 style="font-size:12px">${d.label}</h4>
            <div class="sub">REACTION ${(d.react * 1000).toFixed(0)}ms · AIM ±${d.aimError.toFixed(1)}°</div>
          </div>`).join('')}
          <h3 style="margin-top:18px">YOUR LANCE</h3>
          ${lance.slice(0, mode.hangarSize).map(b => {
            const c = MECH_BY_ID[b.chassisId];
            return `<div class="kv"><span>${esc(c?.classLabel || '')}</span><b>${esc(c?.name || '—')}</b></div>`;
          }).join('')}
          ${lance.length < mode.hangarSize ? `<div class="tiny muted" style="margin-top:8px">${mode.hangarSize - lance.length} bay(s) empty — fill them in the hangar.</div>` : ''}
          <button class="btn primary lg" style="width:100%;margin-top:18px" data-action="launch">LAUNCH</button>
          <button class="btn ghost" style="width:100%;margin-top:6px" data-go="hangar">EDIT LANCE</button>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- settings ---------------- */
  renderSettings() {
    const s = this.progression.settings;
    const opt = (v, cur) => `<button class="tab${v === cur ? ' on' : ''}" data-set="${v}">${String(v).toUpperCase()}</button>`;
    return `<div class="screen">${this.header('SETTINGS', 'title')}
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">
        <div class="panel"><h3>GRAPHICS</h3>
          <div class="tiny muted">QUALITY</div>
          <div class="tabs" data-setting="quality">${['low', 'medium', 'high', 'ultra'].map(v => opt(v, s.quality)).join('')}</div>
          <div class="tiny muted">FIELD OF VIEW — <b class="mono">${s.fov}</b></div>
          <input type="range" min="60" max="105" value="${s.fov}" data-range="fov" style="width:100%">
          <div class="tabs" data-setting="showFps">${[false, true].map(v => `<button class="tab${v === s.showFps ? ' on' : ''}" data-set="${v}">FPS ${v ? 'ON' : 'OFF'}</button>`).join('')}</div>
          <div class="tabs" data-setting="autoQuality">${[true, false].map(v => `<button class="tab${v === (s.autoQuality !== false) ? ' on' : ''}" data-set="${v}">AUTO ${v ? 'ON' : 'OFF'}</button>`).join('')}</div>
          <div class="tiny muted" style="line-height:1.6;margin-top:6px">Auto drops the preset a step if frame times stay poor, and raises it again when there is headroom.</div>
        </div>
        <div class="panel"><h3>CONTROLS</h3>
          <div class="tiny muted">MOUSE SENSITIVITY — <b class="mono">${(s.sensitivity * 1000).toFixed(1)}</b></div>
          <input type="range" min="5" max="60" value="${Math.round(s.sensitivity * 10000)}" data-range="sensitivity" style="width:100%">
          <div class="tabs" data-setting="invertY">${[false, true].map(v => `<button class="tab${v === s.invertY ? ' on' : ''}" data-set="${v}">INVERT Y ${v ? 'ON' : 'OFF'}</button>`).join('')}</div>
          <h3 style="margin-top:16px">BINDINGS</h3>
          <div class="kv"><span>MOVE</span><b>W A S D</b></div>
          <div class="kv"><span>AIM / FIRE</span><b>MOUSE</b></div>
          <div class="kv"><span>ZOOM</span><b>RMB / V</b></div>
          <div class="kv"><span>JUMP JETS</span><b>SPACE</b></div>
          <div class="kv"><span>ABILITY</span><b>Q</b></div>
          <div class="kv"><span>MELEE</span><b>R</b></div>
          <div class="kv"><span>WEAPONS</span><b>1 – 6 / WHEEL</b></div>
          <div class="kv"><span>FIRE GROUPS</span><b>Z X C</b></div>
          <div class="kv"><span>COCKPIT VIEW</span><b>F</b></div>
          <div class="kv"><span>BRACE / RESTART</span><b>SHIFT</b></div>
          <div class="kv"><span>SCOREBOARD</span><b>TAB</b></div>
          <div class="kv"><span>MANUAL SHUTDOWN</span><b>P</b></div>
        </div>
        <div class="panel"><h3>AUDIO</h3>
          <div class="tiny muted">MASTER VOLUME — <b class="mono">${Math.round(s.volume * 100)}%</b></div>
          <input type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" data-range="volume" style="width:100%">
        </div>
        <div class="panel"><h3>PROFILE</h3>
          <div class="kv"><span>MATCHES</span><b>${this.progression.data.matches}</b></div>
          <div class="kv"><span>WINS</span><b>${this.progression.data.wins}</b></div>
          <div class="kv"><span>KILLS</span><b>${fmt(this.progression.data.kills)}</b></div>
          <div class="kv"><span>DAMAGE</span><b>${fmt(this.progression.data.damage)}</b></div>
          <div class="kv"><span>BEST GAME</span><b>${this.progression.data.stats.bestKills} kills</b></div>
          <button class="btn danger" style="width:100%;margin-top:14px" data-action="resetProfile">RESET PROFILE</button>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- results ---------------- */
  renderResults() {
    const r = this.lastResult;
    if (!r) return this.renderTitle();
    const { result, award } = r;
    const title = result.draw ? 'STALEMATE' : result.playerWon ? 'VICTORY' : 'DEFEAT';
    const colour = result.draw ? 'var(--amber)' : result.playerWon ? 'var(--green)' : 'var(--red)';
    return `<div class="screen">
      <div style="text-align:center;padding:26px 0 18px">
        <div style="font-size:46px;letter-spacing:.32em;color:${colour}">${title}</div>
        <div class="tiny muted" style="margin-top:6px">${esc(result.reason)}</div>
      </div>
      <div class="grid" style="grid-template-columns:1.6fr 1fr;align-items:start">
        <div class="panel"><h3>SCOREBOARD</h3>
          <table style="width:100%;border-collapse:collapse;font-size:12.5px">
            <thead><tr><th style="text-align:left;padding:5px 8px;font-size:9.5px;letter-spacing:.2em;color:var(--ink-dim)">PILOT</th>
            <th style="padding:5px 8px;font-size:9.5px;color:var(--ink-dim)">K</th><th style="padding:5px 8px;font-size:9.5px;color:var(--ink-dim)">D</th>
            <th style="padding:5px 8px;font-size:9.5px;color:var(--ink-dim)">A</th><th style="padding:5px 8px;font-size:9.5px;color:var(--ink-dim)">DMG</th>
            <th style="padding:5px 8px;font-size:9.5px;color:var(--ink-dim)">SCORE</th></tr></thead>
            <tbody>${result.players.map(p => `<tr style="${p.isPlayer ? 'background:rgba(73,214,255,.12)' : ''}">
              <td style="padding:5px 8px;border-left:2px solid ${p.team === 'a' ? 'var(--team-a)' : p.team === 'b' ? 'var(--team-b)' : 'transparent'}">${esc(p.name)}</td>
              <td style="padding:5px 8px;text-align:center">${p.kills}</td>
              <td style="padding:5px 8px;text-align:center">${p.deaths}</td>
              <td style="padding:5px 8px;text-align:center">${p.assists}</td>
              <td style="padding:5px 8px;text-align:center">${fmt(p.damage)}</td>
              <td style="padding:5px 8px;text-align:center">${fmt(p.score)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
        <div class="panel"><h3>REWARDS</h3>
          <div class="kv"><span>CREDITS</span><b style="color:var(--amber)">+${fmt(award?.credits || 0)}</b></div>
          <div class="kv"><span>EXPERIENCE</span><b style="color:var(--cyan)">+${fmt(award?.xp || 0)}</b></div>
          ${award?.rankUp ? `<div style="margin-top:14px;padding:12px;border:1px solid var(--cyan);border-radius:7px;text-align:center">
            <div class="tiny muted">PROMOTED</div>
            <div style="font-size:19px;letter-spacing:.2em;color:var(--cyan)">RANK ${award.rank}</div>
            <div class="tiny">${esc(award.title)}</div></div>` : ''}
          <div class="row" style="margin-top:18px">
            <button class="btn primary" data-action="launch">REDEPLOY</button>
            <button class="btn" data-go="hangar">HANGAR</button>
            <button class="btn ghost" data-go="title">MENU</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- codex ---------------- */
  renderCodex() {
    return `<div class="screen">${this.header('CODEX · FIELD MANUAL', 'title')}
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(330px,1fr))">
        ${codexCard('HEAT IS THE REAL AMMUNITION', `Every weapon adds heat and your sinks only shed so much a second. Cross the red line and the reactor scrams: you cannot move, shoot or turn for three seconds, which is a lifetime. Hold <b>SHIFT</b> during a shutdown to force a hot restart.<br><br>Build to the sink rating shown in the hangar and you can hold the trigger forever. Build past it and you are buying burst damage with downtime — sometimes the right trade.`)}
        ${codexCard('SHOOT THE SAME PLATE TWICE', `Armour is tracked per section. Strip the plating off a side torso and the weapons mounted there die with it; strip the centre torso or the cockpit and the mech is gone. Damage that overflows a destroyed section rolls into the centre at half value.<br><br>Weapons flagged <b>shred</b> do 60% more once the plating is gone. Finish what you start.`)}
        ${codexCard('THE LEGS LAG THE TORSO', `Your torso twists independently of your hips, and your hips turn at the chassis's rate, not yours. An Atlas that has committed to a direction cannot simply reverse. Lead your turns, use the twist to keep guns on target while walking away, and remember the enemy has the same limitation.`)}
        ${codexCard('RANGE BRACKETS', `Every weapon does full damage to its optimal range and falls off linearly to zero at its maximum. Fighting outside your bracket is the most common reason a good loadout loses.<br><br><b>overpen</b> weapons keep 55% damage at maximum range and ignore half of a shield bubble.`)}
        ${codexCard('LOCKS, ECM AND SMOKE', `Guided missiles need a lock: hold the target near your crosshair until the ring closes. An enemy ECM field, a smoke canister or simply breaking line of sight will drop the lock — even mid-flight, which sends the whole volley stupid.<br><br>A <b>TAG</b> designator gives your entire team a lock without one.`)}
        ${codexCard('USE THE ABILITY, ALWAYS', `An ability on cooldown is doing nothing. Bulwark before you peek, not after you are hit. Charge when they are reloading. Stomp when a light mech closes. The difference between pilots at the same rank is almost entirely ability timing.`)}
        ${codexCard('JUMP JETS COST ARMOUR', `Fuel regenerates on the ground and hard landings damage your legs. Jets are for repositioning and for getting an angle nobody expected — not for permanent flight. Landing on someone with Death From Above is, however, entirely correct.`)}
        ${codexCard('PUNCH THINGS', `<b>R</b> throws a physical attack with whichever arm you still have — a kick if both are gone. No heat, no ammunition, and it hits harder than any small weapon: damage scales with your tonnage, it staggers, and it shoves the target bodily backwards.<br><br>The catch is the range. To land it you have to be close enough that everything they own is in its optimal bracket. Assault mechs love it. Lights use it to finish something already broken.`)}
        ${codexCard('RESUPPLY PADS', `Every arena has coolant, ammunition, field repair and shield-cell pads. They go dormant for twenty to thirty seconds after use and then come back in the same place, so their positions are worth learning.<br><br>A pad will not trigger if it has nothing to give you — walking over a coolant pad while cold leaves it up for the teammate behind you.`)}
        ${codexCard('FIRE GROUPS', `<b>1–6</b> select a single weapon. <b>Z</b> fires group Alpha (your first two hardpoints), <b>X</b> fires group Beta, <b>C</b> fires everything.<br><br>Chain-firing a group of lasers keeps heat manageable; alpha-striking wins the exchange and then you walk away to cool down.`)}
      </div>
    </div>`;
  }

  /* ================================================================ */
  _syncPreview() {
    if (this.screen !== 'hangar' && this.screen !== 'title' && this.screen !== 'deploy') {
      this.hangarScene.highlightHardpoint(null);
      return;
    }
    const build = this.progression.hangar[this.slot] || this.progression.hangar.find(Boolean);
    if (!build) { this.hangarScene.clearMech(); return; }
    const chassis = MECH_BY_ID[build.chassisId];
    const key = build.chassisId + '|' + build.skinId + '|' + (build.loadout || []).join(',');
    if (key !== this._previewKey) {
      this._previewKey = key;
      this.hangarScene.setMech(chassis, build.skinId, build.loadout);
    }
    if (this.screen === 'hangar') this.hangarScene.highlightHardpoint(this.hardpoint, chassis);
    else this.hangarScene.highlightHardpoint(null);
    const surface = this.root.querySelector('.screen');
    if (surface) this.hangarScene.attachDrag(surface);
  }

  /* ---- event wiring ---- */
  _wire() {
    const q = (sel) => [...this.root.querySelectorAll(sel)];

    q('[data-go]').forEach(el => el.onclick = () => this.go(el.dataset.go));
    q('[data-slot]').forEach(el => el.onclick = () => {
      this.slot = +el.dataset.slot; this.hardpoint = 0; this.audio.play('ui'); this.render();
    });
    q('[data-hp]').forEach(el => el.onclick = () => {
      this.hardpoint = +el.dataset.hp; this.audio.play('ui'); this.render();
    });
    q('[data-tab]').forEach(el => el.onclick = () => { this.garageTab = el.dataset.tab; this.audio.play('ui'); this.render(); });
    q('[data-filter]').forEach(el => el.onclick = () => { this.weaponFilter = el.dataset.filter; this.audio.play('ui'); this.render(); });
    q('[data-mode]').forEach(el => el.onclick = () => {
      this.deployMode = el.dataset.mode;
      if (this.deployMap !== 'random' && !mapsForMode(this.deployMode).some(m => m.id === this.deployMap)) this.deployMap = 'random';
      this.audio.play('ui'); this.render();
    });
    q('[data-map]').forEach(el => el.onclick = () => { this.deployMap = el.dataset.map; this.audio.play('ui'); this.render(); });
    q('[data-diff]').forEach(el => el.onclick = () => {
      this.progression.setSetting('difficulty', el.dataset.diff); this.audio.play('ui'); this.render();
    });
    q('[data-buy]').forEach(el => el.onclick = () => {
      const [kind, id] = el.dataset.buy.split(':');
      this._tryBuy(kind, id);
    });
    q('[data-pilot]').forEach(el => el.onclick = () => this._selectPilot(el.dataset.pilot));
    q('[data-implant]').forEach(el => el.onclick = () => this._toggleImplant(el.dataset.implant));
    q('[data-implant-slot]').forEach(el => el.onclick = () => {
      const i = +el.dataset.implantSlot;
      this.progression.data.implants[i] = null;
      this.progression.save(); this.audio.play('uiBack'); this.render();
    });
    q('[data-action]').forEach(el => el.onclick = () => this._action(el.dataset.action));

    q('[data-setting]').forEach(group => {
      const key = group.dataset.setting;
      [...group.querySelectorAll('[data-set]')].forEach(b => b.onclick = () => {
        let v = b.dataset.set;
        if (v === 'true') v = true; else if (v === 'false') v = false;
        this.progression.setSetting(key, v);
        this.onSetting?.(key, v);
        this.audio.play('ui');
        this.render();
      });
    });
    q('[data-range]').forEach(el => el.oninput = () => {
      const key = el.dataset.range;
      let v = +el.value;
      if (key === 'sensitivity') v = v / 10000;
      if (key === 'volume') v = v / 100;
      this.progression.setSetting(key, v);
      this.onSetting?.(key, v);
      const label = el.previousElementSibling?.querySelector('b');
      if (label) label.textContent = key === 'sensitivity' ? (v * 1000).toFixed(1) : key === 'volume' ? Math.round(v * 100) + '%' : v;
    });
  }

  _action(name) {
    switch (name) {
      case 'pickChassis': this._chassisModal(); break;
      case 'pickWeapon': this._weaponModal(); break;
      case 'pickSkin': this._skinModal(); break;
      case 'clearWeapon': {
        const b = this.progression.hangar[this.slot];
        if (b) { b.loadout[this.hardpoint] = null; this.progression.save(); this.audio.play('uiBack'); this.render(); }
        break;
      }
      case 'autoFit': {
        const b = this.progression.hangar[this.slot];
        const c = b && MECH_BY_ID[b.chassisId];
        if (c) {
          const owned = new Set(this.progression.data.ownedWeapons);
          b.loadout = autoLoadout(c, Math.random).map(id => (id && owned.has(id) ? id : null));
          // Fall back to anything owned that fits, so auto-fit is never a no-op.
          c.hardpoints.forEach((hp, i) => {
            if (b.loadout[i]) return;
            const fits = [...owned].map(x => WEAPON_BY_ID[x]).filter(w => w && fitsHardpoint(w, hp.size));
            if (fits.length) b.loadout[i] = fits.sort((x, y) => dps(y) - dps(x))[0].id;
          });
          this.progression.save(); this.audio.play('ui'); this.render();
        }
        break;
      }
      case 'removeSlot':
        this.progression.removeHangarSlot(this.slot);
        this.slot = Math.max(0, this.slot - 1);
        this.audio.play('uiBack'); this.render();
        break;
      case 'training':
        this.audio.play('ui');
        this.onDeploy({ mode: 'training', mapId: 'saltflat', difficulty: 'recruit' });
        break;
      case 'launch':
        this.audio.play('ui');
        this.onDeploy({
          mode: this.deployMode,
          mapId: this.deployMap,
          difficulty: this.progression.settings.difficulty,
        });
        break;
      case 'resetProfile':
        this._confirm('Reset your entire profile? Credits, unlocks and your lance will be wiped.', () => {
          this.progression.reset(); this.onSetting?.('quality', this.progression.settings.quality); this.render();
        });
        break;
    }
  }

  _tryBuy(kind, id) {
    const p = this.progression;
    if (p.owns(kind, id)) {
      // Owning it means selecting it.
      if (kind === 'mech') this._equipChassis(id);
      else if (kind === 'skin') this._equipSkin(id);
      else if (kind === 'weapon') this._equipWeapon(id);
      else if (kind === 'pilot') this._selectPilot(id);
      return;
    }
    const res = p.buy(kind, id);
    if (!res.ok) { this.audio.play('dry'); this._toastModal(res.reason); return; }
    this.audio.play('kill');
    this.render();
  }

  _equipChassis(id) {
    const p = this.progression;
    const chassis = MECH_BY_ID[id];
    const cur = p.hangar[this.slot];
    const owned = new Set(p.data.ownedWeapons);
    const loadout = autoLoadout(chassis, Math.random).map(w => (w && owned.has(w) ? w : null));
    p.setHangarSlot(this.slot, {
      chassisId: id,
      loadout,
      skinId: cur?.skinId || DEFAULT_SKIN,
    });
    this.hardpoint = 0;
    this._closeModal();
    this.go('hangar');
  }

  _equipWeapon(id) {
    const p = this.progression;
    const b = p.hangar[this.slot];
    if (!b) return;
    const chassis = MECH_BY_ID[b.chassisId];
    const hp = chassis.hardpoints[this.hardpoint];
    const w = WEAPON_BY_ID[id];
    if (!w || !fitsHardpoint(w, hp.size)) { this.audio.play('dry'); return; }
    b.loadout[this.hardpoint] = id;
    p.save();
    this.audio.play('ui');
    this._closeModal();
    this.render();
  }

  _equipSkin(id) {
    const b = this.progression.hangar[this.slot];
    if (!b) return;
    b.skinId = id;
    this.progression.save();
    this.audio.play('ui');
    this._closeModal();
    this.render();
  }

  _selectPilot(id) {
    const p = this.progression;
    if (!p.owns('pilot', id)) {
      const res = p.buy('pilot', id);
      if (!res.ok) { this.audio.play('dry'); this._toastModal(res.reason); return; }
    }
    p.data.pilotId = id;
    p.save();
    this.audio.play('ui');
    this.render();
  }

  _toggleImplant(id) {
    const p = this.progression;
    if (!p.owns('implant', id)) {
      const res = p.buy('implant', id);
      if (!res.ok) { this.audio.play('dry'); this._toastModal(res.reason); return; }
    }
    const slots = p.data.implants;
    const at = slots.indexOf(id);
    if (at >= 0) slots[at] = null;
    else {
      const free = slots.indexOf(null);
      if (free < 0) { this._toastModal('All three sockets are full — clear one first.'); return; }
      slots[free] = id;
    }
    p.save();
    this.audio.play('ui');
    this.render();
  }

  /* ---- modals ---- */
  _modal(html) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal">${html}</div>`;
    back.onclick = (e) => { if (e.target === back) this._closeModal(); };
    document.body.appendChild(back);
    this._modalStack.push(back);
    return back;
  }

  _closeModal() {
    const m = this._modalStack.pop();
    if (m) m.remove();
  }

  _toastModal(msg) {
    const m = this._modal(`<h3>UNAVAILABLE</h3><p class="muted" style="font-size:13px;line-height:1.6">${esc(msg)}</p>
      <div class="row" style="margin-top:16px"><button class="btn" data-close>OK</button></div>`);
    m.querySelector('[data-close]').onclick = () => this._closeModal();
  }

  _confirm(msg, onYes) {
    const m = this._modal(`<h3>CONFIRM</h3><p class="muted" style="font-size:13px;line-height:1.6">${esc(msg)}</p>
      <div class="row" style="margin-top:16px">
        <button class="btn danger" data-yes>YES</button>
        <button class="btn ghost" data-no>CANCEL</button></div>`);
    m.querySelector('[data-yes]').onclick = () => { this._closeModal(); onYes(); };
    m.querySelector('[data-no]').onclick = () => this._closeModal();
  }

  _chassisModal() {
    const p = this.progression;
    const owned = MECHS.filter(m => p.owns('mech', m.id));
    const rest = MECHS.filter(m => !p.owns('mech', m.id));
    const m = this._modal(`<h3>SELECT CHASSIS</h3>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(228px,1fr))">
        ${owned.map(x => this.mechCard(x)).join('')}
      </div>
      <h3 style="margin-top:20px">AVAILABLE FOR PURCHASE</h3>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(228px,1fr))">
        ${rest.map(x => this.mechCard(x)).join('')}
      </div>`);
    [...m.querySelectorAll('[data-buy]')].forEach(el => el.onclick = () => {
      const [kind, id] = el.dataset.buy.split(':');
      if (p.owns(kind, id)) this._equipChassis(id);
      else { const r = p.buy(kind, id); if (!r.ok) { this.audio.play('dry'); this._toastModal(r.reason); } else { this._closeModal(); this._chassisModal(); } }
    });
  }

  _weaponModal() {
    const p = this.progression;
    const b = p.hangar[this.slot];
    const chassis = MECH_BY_ID[b.chassisId];
    const hp = chassis.hardpoints[this.hardpoint];
    const used = (b.loadout || []).reduce((a, id, i) => a + (id && i !== this.hardpoint ? WEAPON_BY_ID[id].tons : 0), 0);
    const budget = chassis.payload - used;

    const fits = weaponsForSize(hp.size);
    const ownedList = fits.filter(w => p.owns('weapon', w.id)).sort((a, b2) => b2.tons - a.tons);
    const shopList = fits.filter(w => !p.owns('weapon', w.id)).sort((a, b2) => a.tier - b2.tier || a.cost - b2.cost).slice(0, 140);

    const card = (w) => {
      const over = w.tons > budget;
      return `<div class="card clickable ${p.owns('weapon', w.id) ? '' : 'locked'}" data-pick="${w.id}" style="${over ? 'opacity:.45' : ''}">
        <h4 style="font-size:12.5px">${esc(w.name)}</h4>
        <div class="sub">${w.cls.toUpperCase()} · ${w.size} · <b style="color:${over ? 'var(--red)' : 'var(--ink)'}">${w.tons}t</b></div>
        <p class="muted tiny" style="margin:6px 0;line-height:1.45;min-height:38px">${esc(w.blurb)}</p>
        <div class="kv"><span>DPS</span><b>${fmt(dps(w))}</b></div>
        <div class="kv"><span>RANGE</span><b>${w.opt}/${w.max}m</b></div>
        <div class="kv"><span>HEAT/S</span><b>${hps(w).toFixed(1)}</b></div>
        ${p.owns('weapon', w.id) ? '' : `<div class="kv"><span>PRICE</span><b>${fmt(w.cost)} CR</b></div>`}
      </div>`;
    };

    const m = this._modal(`<h3>FIT ${hp.loc} — ${hp.size} HARDPOINT</h3>
      <div class="tiny muted" style="margin-bottom:12px">Remaining payload: <b class="mono">${budget.toFixed(1)}t</b> of ${chassis.payload}t</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(236px,1fr))">${ownedList.map(card).join('')}</div>
      <h3 style="margin-top:20px">REQUISITION</h3>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(236px,1fr))">${shopList.map(card).join('')}</div>`);

    [...m.querySelectorAll('[data-pick]')].forEach(el => el.onclick = () => {
      const id = el.dataset.pick;
      if (p.owns('weapon', id)) this._equipWeapon(id);
      else {
        const r = p.buy('weapon', id);
        if (!r.ok) { this.audio.play('dry'); this._toastModal(r.reason); }
        else { this._closeModal(); this._weaponModal(); }
      }
    });
  }

  _skinModal() {
    const p = this.progression;
    const ownedIds = new Set(p.data.ownedSkins);
    const owned = SKINS.filter(s => ownedIds.has(s.id));
    const shop = SKINS.filter(s => !ownedIds.has(s.id) && p.tierUnlocked(s.tier)).slice(0, 200);
    const m = this._modal(`<h3>PAINT SCHEMES</h3>
      <div class="tiny muted" style="margin-bottom:10px">${fmt(owned.length)} owned of ${fmt(SKINS.length)} total</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(178px,1fr))">${owned.map(s => this.skinCard(s)).join('')}</div>
      <h3 style="margin-top:20px">AVAILABLE</h3>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(178px,1fr))">${shop.map(s => this.skinCard(s)).join('')}</div>`);
    [...m.querySelectorAll('[data-buy]')].forEach(el => el.onclick = () => {
      const [, id] = el.dataset.buy.split(':');
      if (ownedIds.has(id)) this._equipSkin(id);
      else {
        const r = p.buy('skin', id);
        if (!r.ok) { this.audio.play('dry'); this._toastModal(r.reason); }
        else { this._closeModal(); this._skinModal(); }
      }
    });
  }

  showResults(result, award) {
    this.lastResult = { result, award };
    this.open('results');
  }
}

/* ---------------- small render helpers ---------------- */
function statLine(label, value, max) {
  const pct = clamp(value / max, 0, 1) * 100;
  return `<div class="statline"><span style="width:56px">${label}</span>
    <div class="track"><i style="width:${pct.toFixed(0)}%"></i></div><b>${Math.round(value)}</b></div>`;
}

function codexCard(title, body) {
  return `<div class="card"><h4 style="font-size:13px;letter-spacing:.08em;margin-bottom:8px">${esc(title)}</h4>
    <p class="muted" style="font-size:12px;line-height:1.7">${body}</p></div>`;
}

function aggregate(profile) {
  const out = {};
  const add = (mods) => { for (const [k, v] of Object.entries(mods || {})) if (typeof v === 'number') out[k] = (out[k] || 0) + v; };
  add(PILOT_BY_ID[profile.pilotId]?.mods);
  for (const id of profile.implants) if (id) add(IMPLANT_BY_ID[id]?.mods);
  return out;
}
