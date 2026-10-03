// Menu screens: title, new career, career hub (schedule, rankings, golfer,
// pro shop, trophies), tour players, courses, quick round, settings.
import { esc, fmtToPar, toParClass, money, ordinal, modal, toast, statBar } from './dom.js';
import { generatePros, proById, STAT_KEYS, STAT_LABELS, STAT_HELP, overall } from '../data/players.js';
import { generateCourses, courseById, STYLES } from '../data/courses.js';
import { COUNTRIES } from '../data/names.js';
import { BALLS, BALL_BY_ID, ballBars } from '../data/equipment.js';
import { CLUB_CATS, CLUB_MODELS, MODEL_BY_ID, modelBars, normBag, tierOf, TIERS, TIER_BY_ID, loftOf, bounceOf, shaftOf, headOf, spreadOf, accuracyOf } from '../data/clubsets.js';
import { CLUB_BY_ID } from '../data/equipment.js';
import { fullShot } from '../sim/caddie.js';
import { ballAero } from '../sim/shot.js';
import { traitEffects } from '../data/traits.js';
import { YD } from '../sim/hole.js';
import { fillClubShots } from '../render/clubShots.js';
import { HoleModel } from '../sim/hole.js';
import { drawHoleMap, caddieNote } from './holemap.js';
import { RNG, mixSeed } from '../util/rng.js';
import { TRAITS } from '../data/traits.js';
import { TOURS, MAJORS, SEASON_WEEKS } from '../data/tour.js';
import {
  thisWeek, eligibility, rankings, rankOf, seasonPointsTable, moneyTable, xpForLevel, levelBonus,
  ACHIEVEMENTS, DEFAULT_STATS, golferOVR, season,
} from '../game/career.js';
import { HUMAN_ID } from '../game/tournament.js';
import { CHARACTERS, CHAR_BY_ID, CHAR_TIERS, playAs, abilityList, charBoostOf, marketItem, proPrice } from '../data/characters.js';
import { fillPortraits } from '../render/portrait.js';
import { WEATHERS, TIMES } from '../game/weather.js';
import { BRAND_BY_ID, SLOTS, sponsorOffers, SPONSOR_TIERS } from '../game/sponsors.js';
import { cupAvailable, CUP_WEEK } from '../game/cup.js';
import { renderTrophyRoom } from '../render/trophyRoom.js';
import { GAMES, GAME_ORDER } from '../game/minigames.js';
import { TRAILS, BALL_COLORS } from '../data/cosmetics.js';

const TOUR_TAG = { CH: 'Challenger', WT: 'World Tour', MAJ: 'Major', FIN: 'Finale' };

// The active character's boost to one skill, shown next to your trained value
function charBoost(g, k) {
  if (!g.char) return '';
  const v = playAs(g).stats[k] - g.stats[k];
  return v ? `<em class="boost ${v < 0 ? 'neg' : ''}">${v > 0 ? '+' : '−'}${Math.abs(v)}</em>` : '<em class="boost"></em>';
}

// Trophies for the cabinet: one per title, Cups, and cars won
export function trophyItems(c) {
  const items = [];
  for (const h of c.history.slice().reverse()) {
    if (h.pos !== 1) continue;
    const kind = h.tour === 'CH' ? 'ch' : h.tour === 'WT' ? 'wt' : h.tour === 'FIN' ? 'fin' : /Augustine/.test(h.name) ? 'jacket' : 'maj';
    items.push({ kind, plaque: `${h.year}` });
  }
  for (const cup of c.cups || []) items.push({ kind: 'cup', plaque: `Cup ${cup.year}` });
  for (const car of c.garage || []) items.push({ kind: 'car', color: car.color });
  return items;
}

// The club each set is pictured and measured with in the club store
const CAT_KEY = { DR: 'driver', '3W': 'woods', '5W': 'woods', '4H': 'woods', '5I': 'irons', '6I': 'irons', '7I': 'irons', '8I': 'irons', '9I': 'irons', PW: 'irons', GW: 'wedges', SW: 'wedges', LW: 'wedges', PT: 'putter' };
const DIST_CLUB = { driver: 'DR', woods: '3W', irons: '7I', wedges: 'GW', putter: 'PT' };
const REP_CLUB = (m) => (m.cat === 'driver' ? 'DR' : m.cat === 'woods' ? (m.id === 'w-rescue' ? '4H' : '3W') : m.cat === 'irons' ? '7I' : m.cat === 'wedges' ? 'SW' : 'PT');
function specFor(m) {
  const id = REP_CLUB(m);
  const cl = CLUB_BY_ID[id];
  return { kind: cl.kind, id, loft: loftOf(m, id, cl.loft), length: cl.length, bounce: bounceOf(m, id), look: m.look };
}

// A little picture of a shot trail: the ball's arc drawn in the trail's colours
let prevN = 0;
function trailPreview(t) {
  const id = `tp${prevN++}`;
  const stops = t.rainbow ? ['#ff3b3b', '#ffb13b', '#f8ff3b', '#4dff6a', '#3bc8ff', '#7a5cff', '#ff4fd8'] : [...(t.colors || ['#ffc93c'])].reverse();
  const grad = stops.map((c, i) => `<stop offset="${stops.length > 1 ? (i / (stops.length - 1)) * 100 : 0}%" stop-color="${c}"/>`).join('');
  const path = t.zigzag ? 'M10 70 L28 48 L36 54 L52 30 L60 36 L78 18 L88 24 L104 16 L118 22 L130 34 L140 30 L152 50 L158 46 L170 68' : 'M10 70 Q90 -20 170 68';
  const dots = { fire: ['#ffb13b', '#ff5a1a'], ice: ['#e8fbff', '#9fe3ff'], sparkle: ['#fff2a8'], spark: ['#9fe3ff'], confetti: ['#ff5fa2', '#3a86ff', '#7fd05a', '#f2c230', '#c792ff'] }[t.particles];
  let bits = '';
  if (dots) {
    const r = new RNG(mixSeed('trailprev', t.id));
    for (let i = 0; i < 16; i++) {
      const k = r.float(0.08, 0.95);
      // follow the curve: quadratic bezier from (10,70) via (90,-20) to (170,68)
      const x = (1 - k) * (1 - k) * 10 + 2 * (1 - k) * k * 90 + k * k * 170 + r.float(-6, 6);
      const y = (1 - k) * (1 - k) * 70 + 2 * (1 - k) * k * -20 + k * k * 68 + r.float(-6, 6);
      const c = dots[i % dots.length];
      bits += t.particles === 'confetti' ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="3.4" height="2" fill="${c}" transform="rotate(${r.int(0, 90)} ${x.toFixed(1)} ${y.toFixed(1)})"/>` : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.float(0.8, 1.9).toFixed(1)}" fill="${c}"/>`;
    }
  }
  return `<svg class="sc-prev" viewBox="0 0 180 80" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" x2="1">${grad}</linearGradient></defs>
    <path d="${path}" fill="none" stroke="url(#${id})" stroke-width="${t.id === 'classic' ? 3 : 4.5}" stroke-linecap="round" stroke-linejoin="round"/>${bits}<circle cx="170" cy="68" r="3.4" fill="#fff"/></svg>`;
}

export class Screens {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.tab = 'week';
    this.playersView = 'pros';
    this.buyOpts = { q: '', sort: 'ovr', afford: false, limit: 24 };
    root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]');
      if (!a) return;
      e.preventDefault();
      this.app.onAction(a.dataset.a, a.dataset, a);
    });
    // Buttons inside pop-ups (pro card, course card, character card) use the same actions
    const modalRoot = document.getElementById('modal');
    if (modalRoot) modalRoot.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]');
      if (!a) return;
      e.preventDefault();
      this.app.onAction(a.dataset.a, a.dataset, a);
    });
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.filter) this.app.onFilter(t.dataset.filter, t.value);
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.filter) this.app.onFilter(t.dataset.filter, t.value);
      if (t.dataset.setting) this.app.onSetting(t.dataset.setting, t.type === 'checkbox' ? t.checked : t.value);
      if (t.dataset.field) this.app.onField(t.dataset.field, t.value);
    });
  }

  show(html) {
    this.root.innerHTML = html;
    this.root.hidden = false;
    this.root.scrollTop = 0;
  }
  hide() { this.root.hidden = true; this.root.innerHTML = ''; }

  // ---------------- title ----------------
  title(hasCareer, careerInfo, loading = false) {
    this.show(`
      <div class="title-screen">
        <div class="brand">
          <div class="brand-kicker">500 pros · 100 courses · One world ranking</div>
          <h1 class="logo">Fairway<br>Legends</h1>
          <p class="brand-sub">Start at number 501 in the world. Win your way onto the World Tour, capture the majors, and become the best golfer on the planet.</p>
        </div>
        <nav class="menu">
          ${loading ? '<div class="mbtn loadingsave" aria-live="polite"><span>Loading your saved career…</span><small>One moment</small></div>' : ''}
          ${hasCareer ? `<button class="mbtn primary" data-a="continue"><span>Continue career</span><small>${esc(careerInfo)}</small></button>` : ''}
          ${loading ? '' : `<button class="mbtn ${hasCareer ? '' : 'primary'}" data-a="newCareer"><span>${hasCareer ? 'New career' : 'Start career'}</span><small>Create your golfer and turn pro</small></button>`}
          <button class="mbtn" data-a="quick"><span>Quick round</span><small>Any course, any pro, any conditions</small></button>
          <button class="mbtn" data-a="party"><span>Play with friends</span><small>2 to 4 players · stroke play, match play or skins</small></button>
          <button class="mbtn" data-a="minigames"><span>Mini-games</span><small>Range, closest to the pin, long drive, putting, targets</small></button>
          <button class="mbtn daily" data-a="daily"><span>Daily challenge</span><small>A new challenge every day · keep your streak alive</small></button>
          <button class="mbtn" data-a="players"><span>Tour players</span><small>All 500 pros, their strengths and weaknesses</small></button>
          <button class="mbtn" data-a="courses"><span>Courses</span><small>100 championship courses in 8 styles</small></button>
          <button class="mbtn" data-a="howto"><span>How to play</span><small>Swing, aim, spin and reading greens</small></button>
          <button class="mbtn ghost" data-a="settings"><span>Settings</span></button>
        </nav>
      </div>`);
  }

  // ---------------- new career ----------------
  newCareer(draft) {
    const countries = Object.entries(COUNTRIES).sort((a, b) => a[1].name.localeCompare(b[1].name));
    const shirts = ['#1d3557', '#c1121f', '#2a9d8f', '#e9c46a', '#f1faee', '#111111', '#6a4c93', '#ff006e', '#3a86ff', '#8ac926', '#f4a261', '#669bbc'];
    const pants = ['#1b1b1b', '#2b2d42', '#e9e4d8', '#8d99ae', '#f1f1f1', '#6b705c'];
    const skins = ['#f5d0b5', '#e8b996', '#d49a73', '#b87d56', '#8d5a3b', '#6b4029'];
    const hairs = ['#1e1a18', '#3b2a1f', '#6b4a2e', '#b5532b', '#d9a441', '#e8e2d0', '#8d99ae'];
    const sel = (key, label, opts) => `<div><label for="f-${key}">${label}</label><select id="f-${key}" data-field="look.${key}">${opts.map(([v, t]) => `<option value="${v}" ${String(draft.look[key] || '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
    const swatches = (field, list, cur) => list.map((c) => `<button class="swatch${c === cur ? ' on' : ''}" style="--c:${c}" data-a="look" data-field="${field}" data-v="${c}" aria-label="${field} ${c}"></button>`).join('');
    this.show(`
      <div class="page narrow">
        <header class="page-head"><button class="back" data-a="title">← Back</button><h2>Create your golfer</h2></header>
        <section class="card form">
          <div class="create-top">
            <div class="create-preview"><img id="draftPic" data-portrait="draft" alt="Your golfer"></div>
            <div class="create-fields">
              <label for="f-name">Name</label>
              <input id="f-name" data-field="name" maxlength="24" value="${esc(draft.name)}" placeholder="Your name">
              <label for="f-nick">Nickname <span class="muted small">(optional)</span></label>
              <input id="f-nick" data-field="nickname" maxlength="18" value="${esc(draft.nickname || '')}" placeholder="The Rocket">
              <label for="f-country">Country</label>
              <select id="f-country" data-field="country">${countries.map(([k, v]) => `<option value="${k}" ${k === draft.country ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
            </div>
          </div>
          <div class="row3">
            ${sel('hat', 'Hat', [['cap', 'Cap'], ['visor', 'Visor'], ['bucket', 'Bucket hat'], ['flat', 'Flat cap'], ['cowboy', 'Cowboy hat'], ['beanie', 'Beanie'], ['none', 'No hat']])}
            ${sel('hairStyle', 'Hair', [['short', 'Short'], ['ponytail', 'Ponytail'], ['long', 'Long'], ['bun', 'Bun'], ['curly', 'Curly'], ['mohawk', 'Mohawk'], ['bald', 'Bald']])}
            ${sel('beard', 'Face', [['none', 'Clean'], ['stubble', 'Stubble'], ['mustache', 'Mustache'], ['goatee', 'Goatee'], ['beard', 'Beard']])}
            ${sel('pattern', 'Shirt style', [['solid', 'Plain'], ['stripes', 'Stripes'], ['hoops', 'Hoops'], ['checks', 'Checks'], ['argyle', 'Argyle']])}
            ${sel('shorts', 'Legs', [['', 'Trousers'], ['1', 'Shorts']])}
            ${sel('shades', 'Sunglasses', [['', 'No'], ['1', 'Yes']])}
          </div>
          <label>Shirt</label><div class="swatches">${swatches('shirt', shirts, draft.look.shirt)}</div>
          ${draft.look.pattern && draft.look.pattern !== 'solid' ? `<label>Pattern colour</label><div class="swatches">${swatches('accent', shirts, draft.look.accent)}</div>` : ''}
          <label>Sweater vest</label><div class="swatches"><button class="swatch none${!draft.look.vest ? ' on' : ''}" data-a="look" data-field="vest" data-v="" aria-label="No vest">✕</button>${swatches('vest', shirts, draft.look.vest)}</div>
          <label>${draft.look.shorts ? 'Shorts' : 'Trousers'}</label><div class="swatches">${swatches('pants', pants, draft.look.pants)}</div>
          <label>Hat</label><div class="swatches">${swatches('cap', shirts, draft.look.cap)}</div>
          <label>Hair colour</label><div class="swatches">${swatches('hair', hairs, draft.look.hair)}</div>
          <label>Skin tone</label><div class="swatches">${swatches('skin', skins, draft.look.skin)}</div>
        </section>
        <section class="card">
          <h3>Skills</h3>
          <p class="muted">Every rookie starts with the same skills (overall ${overall(DEFAULT_STATS)}) and no special abilities. You can't train or change them: to get better, win prize money and <b>buy better players</b> in the Players tab.</p>
          ${STAT_KEYS.map((k) => statBar(STAT_LABELS[k], DEFAULT_STATS[k])).join('')}
        </section>
        <div class="actions"><button class="btn primary big" data-a="createCareer">Turn pro</button></div>
      </div>`);
    this.refreshDraftPreview(draft);
  }

  refreshDraftPreview(draft) {
    const im = this.root.querySelector('#draftPic');
    if (!im) return;
    fillPortraits(this.app.world.renderer, im.parentElement, { draft: { ...draft.look, gender: draft.gender } }, { w: 150, h: 190 });
  }

  // ---------------- career hub ----------------
  hub(c, tab = this.tab) {
    this.tab = tab;
    const g = c.golfer;
    const r = rankOf(c);
    const prev = c.prevRank[HUMAN_ID];
    const move = prev && prev !== r ? `<span class="${prev > r ? 'up' : 'down'}">${prev > r ? '▲' : '▼'}${Math.abs(prev - r)}</span>` : '';
    const lvlPct = Math.round((g.xp / xpForLevel(g.level)) * 100);
    const tabs = [['week', 'This week'], ['schedule', 'Schedule'], ['rankings', 'World ranking'], ['race', 'Season race'], ['players', 'Players'], ['golfer', 'Golfer'], ['stats', 'Stats'], ['sponsors', 'Sponsors'], ['store', 'Club store'], ['shop', 'Pro shop'], ['trophies', 'Trophy room']];
    let body = '';
    if (tab === 'week') body = this.hubWeek(c);
    else if (tab === 'schedule') body = this.hubSchedule(c);
    else if (tab === 'rankings') body = this.rankingTable(c);
    else if (tab === 'race') body = this.raceTable(c);
    else if (tab === 'golfer') body = this.hubGolfer(c);
    else if (tab === 'players') body = this.charShop(c);
    else if (tab === 'shop') body = this.hubShop(c);
    else if (tab === 'store') body = this.clubStore(c);
    else if (tab === 'trophies') body = this.hubTrophies(c);
    else if (tab === 'sponsors') body = this.hubSponsors(c);
    else if (tab === 'stats') body = this.hubStats(c);
    this.show(`
      <div class="page">
        <header class="hub-head">
          <button class="back" data-a="title">← Menu</button>
          <button class="hub-avatar" data-a="tab" data-t="players" aria-label="Players"><img data-portrait="me" alt=""></button>
          <div class="hub-id">
            <div class="hub-name">${esc(g.name)} <span class="cc">${esc(g.country)}</span></div>
            ${g.nickname ? `<div class="hub-nick">“${esc(g.nickname)}”</div>` : ''}
            ${g.char && marketItem(g.char) ? `<div class="hub-char">Playing as <b>${esc(marketItem(g.char).name)}</b></div>` : ''}
            <div class="hub-meta">Season ${c.year} · Week ${c.week} of ${SEASON_WEEKS}</div>
            <div class="save-line" id="saveLine">${this.app.saveText ? esc(this.app.saveText()) : ''}</div>
          </div>
          <div class="hub-kpis">
            <div class="kpi"><small>World rank</small><b>#${r}</b>${move}</div>
            <div class="kpi"><small>Overall</small><b>${golferOVR(g)}</b></div>
            <div class="kpi"><small>Level ${g.level}</small><div class="xpbar"><i style="width:${lvlPct}%"></i></div></div>
            <div class="kpi"><small>Bank</small><b>${money(g.money, true)}</b></div>
          </div>
        </header>
        <nav class="tabs">${tabs.map(([k, v]) => `<button class="tab${k === tab ? ' on' : ''}" data-a="tab" data-t="${k}">${esc(v)}</button>`).join('')}</nav>
        <div class="tab-body">${body}</div>
      </div>`);
    this.fillCharPortraits(c);
    if (tab === 'store' && this.clubSpecs) fillClubShots(this.app.world.renderer, this.root, this.clubSpecs);
  }

  eventCard(c, ev, big = false) {
    const course = courseById(ev.courseId);
    const el = eligibility(c, ev);
    const tag = TOUR_TAG[ev.tour];
    return `
      <article class="event ${ev.tour.toLowerCase()} ${big ? 'big' : ''}">
        <div class="ev-tag">${tag}</div>
        <h3>${esc(ev.name)}</h3>
        <div class="ev-course">${esc(course.name)} · ${esc(course.region)}, ${esc(course.countryName)}</div>
        <div class="ev-facts"><span>${esc(course.style)}</span><span>Par ${course.par}</span><span>${course.yards.toLocaleString()} yds</span><span>Purse ${money(ev.purse, true)}</span><span>${TOURS[ev.tour].field} players</span><span>Winner: ${ev.pts} rank pts</span></div>
        ${ev.blurb ? `<p class="ev-blurb">${esc(ev.blurb)}</p>` : ''}
        <div class="ev-foot">
          ${el.ok ? `<span class="ok">${esc(el.how)}</span><button class="btn primary" data-a="enter" data-id="${ev.id}">Enter</button>` : `<span class="no">${esc(el.why)}</span>`}
        </div>
      </article>`;
  }

  hubWeek(c) {
    const wk = thisWeek(c);
    const act = c.active;
    let activeHtml = '';
    if (act) {
      const t = act.t;
      activeHtml = `<section class="card highlight"><div class="card-head"><h3>In progress: ${esc(t.name)}</h3><span class="pill">Round ${t.round + 1} of ${t.rounds}</span></div><div class="actions left"><button class="btn primary" data-a="resumeEvent">Resume</button><button class="btn" data-a="viewBoard">Leaderboard</button></div></section>`;
    }
    const news = c.news.slice(0, 6).map((n) => `<li><small>Wk ${n.week}</small> ${esc(n.text)}</li>`).join('');
    const last = c.history[0];
    return `
      ${activeHtml}
      ${act ? '' : `<div class="events">${wk.events.map((ev) => this.eventCard(c, ev, ev.tour !== 'CH')).join('')}</div>
      <div class="actions left"><button class="btn ghost" data-a="skipWeek">Skip this week</button></div>`}
      ${cupAvailable(c) ? `<section class="card highlight cupcard"><div class="cup-trophy" aria-hidden="true">🏆</div><div><h3>The Legends Cup is here</h3><p>Captain Team Legends against your rival's Team World: five 9-hole matches. It doesn't use up a week.</p></div><button class="btn primary" data-a="cup">Play the Cup</button></section>` : c.week < CUP_WEEK && !(c.cup && c.cup.year === c.year) ? `<p class="muted small">The Legends Cup team match opens in week ${CUP_WEEK}.</p>` : ''}
      ${this.rivalCard(c)}
      <div class="cols">
        <section class="card"><h3>Goals</h3>${this.goals(c)}</section>
        <section class="card"><h3>Around the tour</h3>${news ? `<ul class="news">${news}</ul>` : '<p class="muted">The season is just getting started.</p>'}
          ${last ? `<p class="muted small">Your last event: ${esc(last.name)}, ${last.posText === 'CUT' ? 'missed the cut' : `finished ${last.posText}`} (${fmtToPar(last.toPar)})</p>` : ''}</section>
      </div>`;
  }

  hubStats(c) {
    const st = c.stats;
    const hist = c.history;
    const g = c.golfer;
    const wins = hist.filter((h) => h.pos === 1);
    const byTour = (t) => wins.filter((h) => h.tour === t).length;
    const made = hist.filter((h) => h.posText !== 'CUT').length;
    const top10 = hist.filter((h) => h.pos && h.pos <= 10).length;
    const best = hist.reduce((b, h) => (h.pos && (!b || h.pos < b.pos) ? h : b), null);
    const fmtL = (m) => (m ? (this.app.settings.units === 'meters' ? `${Math.round(m)} m` : `${Math.round(m / 0.9144)} yds`) : '–');
    const fmtS = (m) => (m ? (this.app.settings.units === 'meters' ? `${m.toFixed(1)} m` : `${Math.round(m / 0.3048)} ft`) : '–');
    const recs = this.app.records || {};
    const tile = (label, value, sub = '') => `<div class="stile"><small>${esc(label)}</small><b>${value}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
    return `<section class="card"><h3>Scoring</h3><div class="stiles">
        ${tile('Rounds played', st.rounds)}
        ${tile('Scoring average', st.holes ? (st.strokes / st.holes * 18).toFixed(1) : '–')}
        ${tile('Best round', st.best ?? '–')}
        ${tile('Most birdies in a round', st.mostBirdies || 0)}
        ${tile('Birdies', st.birdies)}
        ${tile('Eagles', st.eagles)}
        ${tile('Holes-in-one', st.aces)}
        ${tile('Hole-outs', st.holeOuts || 0, 'chip-ins and holed shots')}
      </div></section>
      <section class="card"><h3>Long game &amp; putting</h3><div class="stiles">
        ${tile('Longest drive', fmtL(st.longestDrive))}
        ${tile('Fairways hit', st.fairwayChances ? Math.round((st.fairways / st.fairwayChances) * 100) + '%' : '–')}
        ${tile('Greens in regulation', st.girChances ? Math.round((st.gir / st.girChances) * 100) + '%' : '–')}
        ${tile('Putts per round', st.holes && st.putts ? (st.putts / st.holes * 18).toFixed(1) : '–')}
        ${tile('Longest putt holed', fmtS(st.longestPutt))}
      </div></section>
      <section class="card"><h3>Career</h3><div class="stiles">
        ${tile('Events', hist.length)}
        ${tile('Wins', wins.length, `${byTour('MAJ')} major${byTour('MAJ') === 1 ? '' : 's'} · ${byTour('WT')} World Tour · ${byTour('CH')} Challenger`)}
        ${tile('Top 10s', top10)}
        ${tile('Cuts made', hist.length ? `${made} of ${hist.length}` : '–')}
        ${tile('Best finish', best ? best.posText : '–', best ? best.name : '')}
        ${tile('Career earnings', money(g.careerMoney, true))}
        ${tile('Rival record', c.rival ? `${c.rival.w}–${c.rival.l}${c.rival.t ? `–${c.rival.t}` : ''}` : '–')}
        ${tile('Legends Cups', (c.cups || []).length)}
      </div></section>
      <section class="card"><h3>Mini-game bests</h3><div class="stiles">
        ${GAME_ORDER.filter((k) => k !== 'range').map((k) => tile(GAMES[k].name, recs[k] ? esc(recs[k].text) : '–')).join('')}
        ${tile('Longest range drive', recs.rangeDrive ? esc(recs.rangeDrive.text) : '–')}
      </div></section>`;
  }

  rivalCard(c) {
    const r = c.rival;
    if (!r) return '';
    const p = proById(r.id);
    const rank = rankOf(c, r.id);
    const last = r.last;
    return `<section class="card rivalcard">
      <button class="rv-pic" data-a="pro" data-id="${r.id}" aria-label="${esc(p.name)}"><img data-portrait="${r.id}" data-pose="fist" alt=""></button>
      <div class="rv-body">
        <small>Your rival</small>
        <h3>${esc(p.name)} <span class="cc">${esc(p.country)}</span></h3>
        <div class="muted small">World #${rank} · Overall ${p.ovr} · Head to head <b>${r.w}–${r.l}${r.t ? `–${r.t}` : ''}</b></div>
        <blockquote>“${esc(last ? last.quote : r.taunt)}”</blockquote>
        <p class="muted small">${esc(p.first)} turns up at every event you play. Finish ahead of them for bragging rights, and a ${money(50000, true)} bonus at a major.</p>
      </div>
    </section>`;
  }

  hubSponsors(c) {
    const g = c.golfer;
    const rank = rankOf(c);
    const cur = c.sponsors || {};
    const offers = sponsorOffers(c, rank);
    const deal = (d, slot, current) => {
      const b = BRAND_BY_ID[d.brand];
      return `<article class="sponsorcard ${current ? 'on' : ''}">
        <div class="sp-logo" style="background:${b.bg};color:${b.fg}">${esc(b.short)}</div>
        <div class="sp-body">
          <small>${esc(SLOTS[slot])} · ${esc(d.tierName)} deal</small>
          <h4>${esc(b.name)}</h4>
          <div class="sp-terms"><span><b>${money(d.perEvent, true)}</b> every event</span><span><b>${money(d.top10, true)}</b> top 10</span><span><b>${money(d.win, true)}</b> win</span></div>
        </div>
        <div class="sp-act">${current ? '<span class="pill gold">Signed</span>' : `<button class="btn primary" data-a="signSponsor" data-k="${d.key}">Sign</button>`}</div>
      </article>`;
    };
    const next = SPONSOR_TIERS.slice().reverse().find((t) => t.need < rank);
    return `<p class="muted">Companies pay you to show their name: on your <b>cap and shirt</b>, and on your <b>golf bag</b>. They pay for every event you play, plus bonuses for top-10 finishes and wins, until the end of the season. Climb the world ranking and bigger brands come calling.</p>
      <div class="cols">${Object.keys(SLOTS).map((slot) => `<section class="card"><h3>${esc(SLOTS[slot])}</h3>${cur[slot] ? deal(cur[slot], slot, true) : '<p class="muted">No sponsor yet. Sign one below.</p>'}</section>`).join('')}</div>
      <h3 class="shop-cat">Offers for you</h3>
      <div class="sponsors">${offers.filter((o) => !cur[o.slot] || cur[o.slot].key !== o.key).map((o) => deal(o, o.slot, false)).join('')}</div>
      ${next ? `<p class="muted small">Reach world #${next.need} for ${esc(next.name)} deals.</p>` : ''}`;
  }

  goals(c) {
    const r = rankOf(c);
    const items = [
      ['Win on the Challenger Tour', !!c.achievements.win_ch],
      ['Reach the top 125 (World Tour card)', r <= 125],
      ['Win a World Tour event', !!c.achievements.win_wt],
      ['Reach the top 60 (major exemption)', r <= 60],
      ['Win a major', !!c.achievements.win_major],
      ['Become world No. 1', r === 1],
    ];
    return `<ol class="goals">${items.map(([t, d]) => `<li class="${d ? 'done' : ''}">${esc(t)}</li>`).join('')}</ol>`;
  }

  hubSchedule(c) {
    const s = season(c);
    return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Wk</th><th>World Tour / Majors</th><th>Course</th><th>Purse</th><th>Challenger Tour</th><th>Your result</th></tr></thead><tbody>
      ${s.weeks.map((w) => {
        const main = w.events.find((e) => e.tour !== 'CH');
        const ch = w.events.find((e) => e.tour === 'CH');
        const mc = courseById(main.courseId);
        const res = c.history.find((h) => h.year === c.year && h.week === w.week);
        return `<tr class="${w.week === c.week ? 'cur' : ''} ${main.tour === 'MAJ' ? 'major' : ''}"><td>${w.week}</td><td><b>${esc(main.name)}</b>${main.tour === 'MAJ' ? ' <span class="pill gold">Major</span>' : main.tour === 'FIN' ? ' <span class="pill">Finale</span>' : ''}</td><td>${esc(mc.name)}</td><td>${money(main.purse, true)}</td><td>${esc(ch.name)}</td><td>${res ? `${esc(res.posText)} <span class="${toParClass(res.toPar)}">${fmtToPar(res.toPar)}</span>` : ''}</td></tr>`;
      }).join('')}
    </tbody></table></div>`;
  }

  rankingTable(c, filter = this.rankFilter || '') {
    const rows = rankings(c);
    const f = filter.toLowerCase();
    const list = rows.filter((r) => !f || this.app.nameOf(r.id).toLowerCase().includes(f) || (r.id !== HUMAN_ID && proById(r.id).country.toLowerCase().includes(f)));
    const me = rows.find((r) => r.id === HUMAN_ID);
    const show = list.slice(0, 150);
    if (!f && me && me.rank > 150) show.push(me);
    return `
      <div class="toolbar"><input type="search" placeholder="Search players or country" data-filter="rank" value="${esc(filter)}" aria-label="Search rankings"><span class="muted small">Points decay 1.6% a week. Top 125 get World Tour starts; top 60 play the majors.</span></div>
      <div class="table-wrap"><table class="tbl rank"><thead><tr><th>Rank</th><th></th><th>Player</th><th>Ctry</th><th>OVR</th><th>Points</th><th>Wins</th><th>Events</th></tr></thead><tbody>
      ${show.map((r) => {
        const p = c.p[r.id];
        const pro = r.id === HUMAN_ID ? null : proById(r.id);
        const mv = r.prev && r.prev !== r.rank ? `<span class="${r.prev > r.rank ? 'up' : 'down'}">${r.prev > r.rank ? '▲' : '▼'}${Math.abs(r.prev - r.rank)}</span>` : '';
        return `<tr class="${r.id === HUMAN_ID ? 'me' : ''}" ${pro ? `data-a="pro" data-id="${r.id}"` : ''}><td>${r.rank}</td><td class="mv">${mv}</td><td>${esc(this.app.nameOf(r.id))}</td><td>${esc(pro ? pro.country : c.golfer.country)}</td><td>${pro ? pro.ovr : golferOVR(c.golfer)}</td><td>${r.pts.toFixed(1)}</td><td>${p.wins}</td><td>${p.events}</td></tr>`;
      }).join('')}
      </tbody></table></div>${list.length > 150 ? `<p class="muted small">Showing 150 of ${list.length}. Search to find anyone.</p>` : ''}`;
  }

  raceTable(c) {
    const sp = seasonPointsTable(c).slice(0, 60);
    const mt = moneyTable(c).slice(0, 20);
    return `<div class="cols">
      <section class="card"><h3>Season points race</h3><p class="muted small">Top 30 after week 23 play the $40M Tour Championship.</p>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Player</th><th>Points</th></tr></thead><tbody>
        ${sp.length ? sp.map((r) => `<tr class="${r.id === HUMAN_ID ? 'me' : ''} ${r.rank === 30 ? 'cutline' : ''}"><td>${r.rank}</td><td>${esc(this.app.nameOf(r.id))}</td><td>${r.sp.toLocaleString()}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">No World Tour events played yet.</td></tr>'}
        </tbody></table></div></section>
      <section class="card"><h3>Money list</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Player</th><th>Earnings</th></tr></thead><tbody>
        ${mt.map((r) => `<tr class="${r.id === HUMAN_ID ? 'me' : ''}"><td>${r.rank}</td><td>${esc(this.app.nameOf(r.id))}</td><td>${money(r.money)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Nothing earned yet.</td></tr>'}
        </tbody></table></div></section></div>`;
  }

  hubGolfer(c) {
    const g = c.golfer;
    return `<div class="cols">
      <section class="card"><div class="card-head"><h3>Skills</h3><span class="pill">Overall ${golferOVR(g)}</span></div>
        <p class="muted small">Your own skills are fixed. The only way to get better is to <b>buy a better player</b> with your prize money${g.char && marketItem(g.char) ? `; the numbers beside them show how ${esc(marketItem(g.char).name)} changes them` : ''}. Levels pay a cash bonus toward the next one.</p>
        ${STAT_KEYS.map((k) => `<div class="upg ro">${statBar(STAT_LABELS[k], g.stats[k], charBoost(g, k))}<small>${esc(STAT_HELP[k])}</small></div>`).join('')}
        <p><button class="btn primary" data-a="tab" data-t="players">Buy a better player</button></p>
      </section>
      <section class="card"><div class="card-head"><h3>Career</h3><button class="linkbtn" data-a="nickname">${g.nickname ? `“${esc(g.nickname)}” · change nickname` : 'Add a nickname'}</button></div>
        <div class="facts">
          <div><small>Career earnings</small><b>${money(g.careerMoney)}</b></div>
          <div><small>Wins</small><b>${c.p[HUMAN_ID].cw}</b></div>
          <div><small>Majors</small><b>${g.majorsWon.length}</b></div>
          <div><small>Rounds played</small><b>${c.stats.rounds}</b></div>
          <div><small>Scoring avg</small><b>${c.stats.rounds ? (c.stats.strokes / Math.max(1, c.stats.holes) * 18).toFixed(1) : '–'}</b></div>
          <div><small>Birdies / Eagles</small><b>${c.stats.birdies} / ${c.stats.eagles}</b></div>
          <div><small>Fairways hit</small><b>${c.stats.fairwayChances ? Math.round((c.stats.fairways / c.stats.fairwayChances) * 100) + '%' : '–'}</b></div>
          <div><small>Greens in reg.</small><b>${c.stats.girChances ? Math.round((c.stats.gir / c.stats.girChances) * 100) + '%' : '–'}</b></div>
          <div><small>Best round</small><b>${c.stats.best ?? '–'}</b></div>
        </div>
        ${g.char && marketItem(g.char) ? `<h4>${esc(marketItem(g.char).name)}’s strengths and weaknesses</h4><ul class="traits">${playAs(g).traits.map((t) => TRAITS[t]).filter(Boolean).map((t) => `<li class="${t.kind}"><b>${esc(t.name)}</b> ${esc(t.desc)}</li>`).join('') || '<li class="muted">No standout traits</li>'}</ul>` : ''}
        <h4>In the bag</h4>
        <ul class="baglist">${Object.entries(CLUB_CATS).map(([cat, v]) => { const m = MODEL_BY_ID[normBag(g.bag)[cat]]; return `<li><small>${esc(v.label)}</small> ${esc(m.brand)} ${esc(m.name)}</li>`; }).join('')}<li><small>Ball</small> ${esc(BALL_BY_ID[g.ball].name)}</li></ul>
        <p><button class="linkbtn" data-a="tab" data-t="shop">Visit the pro shop</button></p>
      </section></div>`;
  }

  hubShop(c) {
    const g = c.golfer;
    const sub = this.shopTab === 'style' ? 'style' : 'balls';
    const tab = (id, label) => `<button class="chipbtn ${sub === id ? 'on' : ''}" data-a="shopTab" data-t="${id}">${label}</button>`;
    const head = `<div class="chips shop-tabs">${tab('clubs', 'Clubs')}${tab('balls', 'Balls')}${tab('style', 'Style')}<span class="muted small">Bank: ${money(g.money)}</span></div>`;
    if (sub === 'style') return head + this.styleShop(c);
    return `${head}<p class="muted">Each ball trades one strength for another. Prize money buys new ones; you can switch any time between events.</p>
      <div class="balls">${BALLS.map((b) => {
        const owned = g.balls.includes(b.id);
        const bars = ballBars(b);
        return `<article class="ballcard ${g.ball === b.id ? 'on' : ''}">
          <div class="bc-head"><div class="bc-ball"></div><div><small>${esc(b.brand)}</small><h4>${esc(b.name)}</h4></div><b class="price">${b.price ? money(b.price, true) : 'Free'}</b></div>
          ${Object.entries(bars).map(([k, v]) => statBar(k, v)).join('')}
          <ul class="proscons">${b.pros.map((p) => `<li class="adv">${esc(p)}</li>`).join('')}${b.cons.map((p) => `<li class="dis">${esc(p)}</li>`).join('')}</ul>
          <div class="bc-foot">${g.ball === b.id ? '<span class="pill">In your bag</span>' : owned ? `<button class="btn" data-a="useBall" data-id="${b.id}">Use this ball</button>` : `<button class="btn primary" data-a="buyBall" data-id="${b.id}" ${g.money < b.price ? 'disabled' : ''}>Buy ${money(b.price, true)}</button>`}</div>
        </article>`;
      }).join('')}</div>`;
  }

  // Tracer trails and ball colours: just for looks, they never change a shot
  styleShop(c) {
    const g = c.golfer;
    const trails = g.trails || ['classic'];
    const cols = g.ballColors || ['white'];
    const foot = (on, owned, buyA, useA, id, price) => on ? '<span class="pill">Equipped</span>'
      : owned ? `<button class="btn" data-a="${useA}" data-id="${id}">Use it</button>`
      : `<button class="btn primary" data-a="${buyA}" data-id="${id}" ${g.money < price ? 'disabled' : ''}>Buy ${money(price, true)}</button>`;
    return `<p class="muted">Show off! Trails and ball colours change how your shots look, never how they fly. Everyone sees them in replays too.</p>
      <h3 class="shop-h">Shot trails</h3>
      <div class="styles">${TRAILS.map((t) => `<article class="stylecard ${g.trail === t.id ? 'on' : ''}">
        ${trailPreview(t)}
        <div class="sc-body"><h4>${esc(t.name)}</h4><p class="muted small">${esc(t.desc)}</p></div>
        <div class="bc-foot"><b class="price">${t.price ? money(t.price, true) : 'Free'}</b>${foot(g.trail === t.id, trails.includes(t.id), 'buyTrail', 'useTrail', t.id, t.price)}</div>
      </article>`).join('')}</div>
      <h3 class="shop-h">Ball colours</h3>
      <div class="styles balls-c">${BALL_COLORS.map((b) => `<article class="stylecard ${g.ballColor === b.id ? 'on' : ''}">
        <div class="sc-ball" style="--bc:${b.color}"></div>
        <div class="sc-body"><h4>${esc(b.name)}</h4></div>
        <div class="bc-foot"><b class="price">${b.price ? money(b.price, true) : 'Free'}</b>${foot(g.ballColor === b.id, cols.includes(b.id), 'buyBallColor', 'useBallColor', b.id, b.price)}</div>
      </article>`).join('')}</div>`;
  }

  // ---------------- players market ----------------
  charShop(c) {
    const g = c.golfer;
    const owned = new Set(g.chars || []);
    const me = playAs(g);
    const base = overall(g.stats);
    const now = overall(me.stats);
    const view = this.playersView || 'pros';
    const pros = generatePros();
    const ownedList = [...owned].map((id) => marketItem(id)).filter(Boolean);
    const foot = (id, price) => {
      const on = g.char === id;
      return on ? '<span class="pill gold">Playing</span>' : owned.has(id) ? `<button class="btn" data-a="useChar" data-id="${id}">Play as</button>` : `<button class="btn primary" data-a="buyChar" data-id="${id}" ${g.money < price ? 'disabled' : ''}>Buy ${money(price, true)}</button>`;
    };
    const special = (ch) => {
      const tier = CHAR_TIERS[ch.tier];
      const withOvr = overall(playAs({ ...g, char: ch.id }).stats);
      return `<article class="charcard ${g.char === ch.id ? 'on' : ''}" style="--tier:${tier.color}">
        <button class="cc-pic" data-a="charInfo" data-id="${ch.id}" aria-label="More about ${esc(ch.name)}"><img data-portrait="${ch.id}" alt=""></button>
        <div class="cc-body">
          <div class="cc-top"><span class="cc-tier">${esc(tier.name)}</span><b class="price">${owned.has(ch.id) ? 'Owned' : money(ch.price, true)}</b></div>
          <h4>${esc(ch.name)}</h4>
          <p class="cc-tag">${esc(ch.tagline)}</p>
          <div class="cc-boost">${Object.keys(ch.boost).map((k) => `<span>+${charBoostOf(ch, k)} ${esc(STAT_LABELS[k])}</span>`).join('')}${ch.all ? `<span class="all">+${ch.all} all skills</span>` : ''}</div>
          <ul class="cc-abil">${abilityList(ch).map((t) => `<li><b>${esc(t.name)}</b> ${esc(t.desc)}</li>`).join('')}</ul>
          <div class="cc-foot"><span class="muted small">Overall ${withOvr}</span>${foot(ch.id, ch.price)}</div>
        </div>
      </article>`;
    };
    const proCardHtml = (p) => {
      const price = proPrice(p);
      const top = [...STAT_KEYS].sort((a, b) => p.stats[b] - p.stats[a]).slice(0, 3);
      return `<article class="charcard procard2 ${g.char === p.id ? 'on' : ''}" style="--tier:${p.ovr >= 88 ? '#f2c230' : p.ovr >= 80 ? '#c792ff' : p.ovr >= 70 ? '#5fb2ff' : '#7fd05a'}">
        <button class="cc-pic" data-a="charInfo" data-id="${p.id}" aria-label="More about ${esc(p.name)}"><img data-portrait="${p.id}" alt=""></button>
        <div class="cc-body">
          <div class="cc-top"><span class="cc-tier">Overall ${p.ovr}</span><b class="price">${owned.has(p.id) ? 'Owned' : money(price, true)}</b></div>
          <h4>${esc(p.name)} <span class="cc">${esc(p.country)}</span></h4>
          <div class="cc-boost">${top.map((k) => `<span>${esc(STAT_LABELS[k])} ${p.stats[k]}</span>`).join('')}</div>
          <ul class="cc-abil">${p.traits.map((t) => TRAITS[t]).filter(Boolean).map((t) => `<li class="${t.kind}"><b>${esc(t.name)}</b> ${esc(t.desc)}</li>`).join('') || '<li class="muted">No standout traits</li>'}</ul>
          <div class="cc-foot"><span class="muted small">${p.star ? 'Star · ' : ''}Age ${p.age}</span>${foot(p.id, price)}</div>
        </div>
      </article>`;
    };
    let body = '';
    if (view === 'special') {
      body = Object.entries(CHAR_TIERS).map(([tid, t]) => `
        <h3 class="shop-cat" style="color:${t.color}">${esc(t.name)}s</h3>
        <div class="chars">${CHARACTERS.filter((ch) => ch.tier === tid).map(special).join('')}</div>`).join('');
    } else if (view === 'mine') {
      body = `<div class="chars">
        <article class="charcard ${!g.char ? 'on' : ''}" style="--tier:#9fb3a7">
          <button class="cc-pic" data-a="tab" data-t="golfer" aria-label="Your golfer"><img data-portrait="you" alt=""></button>
          <div class="cc-body"><div class="cc-top"><span class="cc-tier">You</span></div><h4>${esc(g.name)}</h4><p class="cc-tag">Your own golfer, with the standard skills.</p>
          <div class="cc-foot"><span class="muted small">Overall ${base}</span>${!g.char ? '<span class="pill gold">Playing</span>' : '<button class="btn" data-a="useChar" data-id="">Play as</button>'}</div></div>
        </article>
        ${ownedList.map((it) => (it.kind === 'special' ? special(CHAR_BY_ID[it.id]) : proCardHtml(it.pro))).join('')}
      </div>${ownedList.length ? '' : '<p class="muted">You haven’t bought anyone yet.</p>'}`;
    } else {
      const o = this.buyOpts;
      const f = (o.q || '').toLowerCase();
      let list = pros.filter((p) => (!f || p.name.toLowerCase().includes(f) || p.country.toLowerCase() === f || COUNTRIES[p.country].name.toLowerCase().includes(f) || p.traits.some((t) => TRAITS[t].name.toLowerCase().includes(f)))
        && (!o.afford || owned.has(p.id) || proPrice(p) <= g.money));
      const key = o.sort || 'ovr';
      list.sort((a, b) => key === 'cheap' ? proPrice(a) - proPrice(b) || b.ovr - a.ovr
        : key === 'name' ? a.last.localeCompare(b.last)
        : key === 'ovr' ? b.ovr - a.ovr
        : b.stats[key] - a.stats[key] || b.ovr - a.ovr);
      const shown = list.slice(0, o.limit);
      const sortOpts = [['ovr', 'Best overall'], ['cheap', 'Cheapest first'], ['name', 'Name'], ...STAT_KEYS.map((k) => [k, `Best ${STAT_LABELS[k].toLowerCase()}`])];
      body = `<div class="toolbar buybar">
          <input type="search" data-filter="buy" value="${esc(o.q)}" placeholder="Search name, country or trait" aria-label="Search players">
          <select data-filter="buySort" aria-label="Sort">${sortOpts.map(([v, t]) => `<option value="${v}" ${key === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <select data-filter="buyAfford" aria-label="Show"><option value="no" ${!o.afford ? 'selected' : ''}>Everyone</option><option value="yes" ${o.afford ? 'selected' : ''}>I can afford</option></select>
        </div>
        <p class="muted small">${list.length} player${list.length === 1 ? '' : 's'}. Tap a picture for their full card.</p>
        <div class="chars">${shown.map(proCardHtml).join('')}</div>
        ${list.length > shown.length ? `<div class="actions"><button class="btn" data-a="moreBuy">Show more (${list.length - shown.length} more)</button></div>` : ''}`;
    }
    return `<section class="card char-now">
        <div class="cn-pic"><img data-portrait="me" data-pose="fist" alt=""></div>
        <div>
          <small class="muted">Playing as</small>
          <h3>${esc(me.charName || `${g.name} (yourself)`)}</h3>
          <p class="muted small">Overall <b class="cn-ovr">${now}</b>${now !== base ? ` <span class="${now > base ? 'up' : 'down'}">${now > base ? '+' : '−'}${Math.abs(now - base)}</span>` : ''} · on your own ${base} · Bank <b>${money(g.money)}</b></p>
          ${g.char ? '<button class="btn" data-a="useChar" data-id="">Play as yourself</button>' : ''}
        </div>
      </section>
      <p class="muted">Buying a better player is the only way to get better. Buy any of the 500 tour pros, or one of the special players, with your prize money, then play every event as them. Switch any time.</p>
      <div class="chips shop-tabs">
        <button class="chipbtn ${view === 'pros' ? 'on' : ''}" data-a="playersView" data-t="pros">Tour pros (${pros.length})</button>
        <button class="chipbtn ${view === 'special' ? 'on' : ''}" data-a="playersView" data-t="special">Special players (${CHARACTERS.length})</button>
        <button class="chipbtn ${view === 'mine' ? 'on' : ''}" data-a="playersView" data-t="mine">My players (${ownedList.length + 1})</button>
      </div>
      ${body}`;
  }

  charCard(c, id) {
    const ch = CHAR_BY_ID[id];
    if (!ch) return;
    const g = c.golfer;
    const has = (g.chars || []).includes(id);
    const on = g.char === id;
    const tier = CHAR_TIERS[ch.tier];
    const m = modal(`<div class="charbig" style="--tier:${tier.color}">
        <div class="cb-pics"><img data-portrait="${id}" data-pose="fist" alt=""><img data-portrait="${id}" data-pose="arms" alt=""></div>
        <div class="cc-top"><span class="cc-tier">${esc(tier.name)}</span><b class="price">${has ? 'Owned' : money(ch.price)}</b></div>
        <h3>${esc(ch.name)}</h3>
        <p class="cc-tag">${esc(ch.tagline)}</p>
        ${STAT_KEYS.map((k) => statBar(STAT_LABELS[k], g.stats[k], `<em class="boost">+${charBoostOf(ch, k)}</em>`)).join('')}
        <ul class="cc-abil">${abilityList(ch).map((t) => `<li><b>${esc(t.name)}</b> ${esc(t.desc)}</li>`).join('')}</ul>
        <div class="actions">${on ? '<span class="pill gold">Playing</span>' : has ? `<button class="btn primary" data-a="useChar" data-id="${id}">Play as ${esc(ch.name.split(' ')[0])}</button>` : `<button class="btn primary" data-a="buyChar" data-id="${id}" ${g.money < ch.price ? 'disabled' : ''}>Buy for ${money(ch.price)}</button>`}<button class="btn" data-close>Close</button></div>
      </div>`);
    m.el.addEventListener('click', (e) => { if (e.target.closest('[data-a]')) m.close(); });
    fillPortraits(this.app.world.renderer, m.el, { [id]: ch.look }, { w: 150, h: 190 });
  }

  fillCharPortraits(c) {
    const g = c.golfer;
    const looks = { me: { ...playAs(g).look, gender: playAs(g).gender }, you: { ...g.look, gender: g.gender } };
    for (const im of this.root.querySelectorAll('img[data-portrait]')) {
      const id = im.dataset.portrait;
      if (looks[id]) continue;
      const it = marketItem(id);
      if (it) looks[id] = it.pro ? { ...it.look, gender: it.pro.gender } : it.look;
    }
    fillPortraits(this.app.world.renderer, this.root, looks);
  }

  // ---------------- club store ----------------
  // Your bag up top, then one category at a time: the Strata upgrade line
  // (every step longer and straighter) and the specialty sets that trade one
  // strength for another. Each card says what it would do for *you*.
  clubStore(c) {
    const g = c.golfer;
    const units = this.app.settings.units;
    const me = playAs(g);
    const fx = traitEffects(me.traits || []);
    const ball = BALL_BY_ID[g.ball] || BALL_BY_ID.tourbal;
    const aero = ballAero(ball, me.stats, fx);
    const bag = normBag(g.bag);
    const owned = new Set(g.clubs || []);
    const cat = this.storeCat || 'driver';
    const shotMemo = new Map();
    const carry = (b, id) => {
      const k = `${b[CAT_KEY[id]]}|${id}`;
      if (!shotMemo.has(k)) shotMemo.set(k, fullShot(me.stats, fx, ball, aero, b, id).carry);
      return shotMemo.get(k);
    };
    const len = (m) => (units === 'meters' ? `${Math.round(m)} m` : `${Math.round(m / YD)} yds`);
    const unit = units === 'meters' ? 'm' : 'yds';
    const specs = {};
    const pic = (key, m, w = 240, h = 150) => {
      specs[key] = specFor(m);
      return `<img data-club="${key}" data-w="${w}" data-h="${h}" alt="">`;
    };
    const tierChip = (m) => { const t = tierOf(m); return `<span class="tierchip" style="--tc:${t.color}">${esc(t.name)}</span>`; };
    // ---- your bag
    const slots = Object.entries(CLUB_CATS).map(([k, v]) => {
      const m = MODEL_BY_ID[bag[k]];
      return `<button class="bagslot2 ${k === cat ? 'on' : ''}" data-a="storeCat" data-t="${k}" style="--tc:${tierOf(m).color}">
        <div class="bs-pic">${pic(`bag-${k}`, m, 150, 96)}</div>
        <small>${esc(v.label)}</small><b>${esc(m.name)}</b>${tierChip(m)}</button>`;
    }).join('');
    const playable = ['driver', 'woods', 'irons', 'wedges'].map((k) => MODEL_BY_ID[bag[k]]);
    const bagAcc = Math.round(playable.reduce((a, m) => a + accuracyOf(m), 0) / playable.length);
    const bagTier = TIERS[Math.round(Object.keys(CLUB_CATS).reduce((a, k) => a + tierOf(MODEL_BY_ID[bag[k]]).rank, 0) / 5)];
    // ---- this category
    const cur = MODEL_BY_ID[bag[cat]];
    const all = CLUB_MODELS.filter((m) => m.cat === cat);
    const starter = all.find((m) => m.price === 0);
    const ladder = [starter, ...all.filter((m) => m.strata).sort((a, b) => a.price - b.price)];
    const special = all.filter((m) => !m.strata && m.price > 0).sort((a, b) => a.price - b.price);
    const has = (m) => m.price === 0 || owned.has(m.id);
    let top = 0;
    ladder.forEach((m, i) => { if (has(m)) top = i; });
    const next = ladder[top + 1] || null;
    const distId = DIST_CLUB[cat];
    const gains = (m) => {
      if (m.id === cur.id) return '<span class="gain same">In your bag now</span>';
      const out = [];
      if (cat === 'putter') {
        const aim = Math.round((1 - m.aim / cur.aim) * 100), pace = Math.round((1 - m.pace / cur.pace) * 100);
        if (aim) out.push(`<span class="gain ${aim > 0 ? 'up' : 'down'}">Start line ${Math.abs(aim)}% ${aim > 0 ? 'truer' : 'looser'}</span>`);
        if (pace) out.push(`<span class="gain ${pace > 0 ? 'up' : 'down'}">Pace ${Math.abs(pace)}% ${pace > 0 ? 'steadier' : 'jumpier'}</span>`);
        if (m.nerve > cur.nerve) out.push('<span class="gain up">Calmer under pressure</span>');
      } else {
        const b2 = { ...bag, [cat]: m.id };
        const d = carry(b2, distId) - carry(bag, distId);
        const dd = units === 'meters' ? Math.round(d) : Math.round(d / YD);
        if (dd) out.push(`<span class="gain ${dd > 0 ? 'up' : 'down'}">${dd > 0 ? '+' : '−'}${Math.abs(dd)} ${unit} ${cat === 'wedges' ? '' : 'carry'}</span>`);
        const st = Math.round((1 - spreadOf(m) / spreadOf(cur)) * 100);
        if (Math.abs(st) >= 2) out.push(`<span class="gain ${st > 0 ? 'up' : 'down'}">${Math.abs(st)}% ${st > 0 ? 'straighter' : 'wilder'}</span>`);
        if (cat === 'wedges') {
          const sp = Math.round((m.spin / cur.spin - 1) * 100);
          if (sp) out.push(`<span class="gain ${sp > 0 ? 'up' : 'down'}">${sp > 0 ? '+' : '−'}${Math.abs(sp)}% spin</span>`);
          if (m.sand > cur.sand + 0.02) out.push('<span class="gain up">Easier from sand</span>');
        }
      }
      return out.join('') || '<span class="gain same">About the same as yours</span>';
    };
    const specLine = (m) => {
      const id = REP_CLUB(m);
      const cl = CLUB_BY_ID[id];
      if (cat === 'putter') return `${headOf(m)} · ${shaftOf(m)}`;
      if (cat === 'wedges') return `${['GW', 'SW', 'LW'].map((w) => `${loftOf(m, w, CLUB_BY_ID[w].loft)}°/${bounceOf(m, w)}°`).join(' · ')} · ${headOf(m)}`;
      if (cat === 'irons') return `7-iron ${loftOf(m, '7I', 32)}° · ${headOf(m)} · ${shaftOf(m, me.stats.power)}`;
      if (cat === 'woods') return `${['3W', '5W', '4H'].map((w) => `${w} ${loftOf(m, w, CLUB_BY_ID[w].loft)}°`).join(' · ')} · ${shaftOf(m, me.stats.power)}`;
      return `${loftOf(m, id, cl.loft)}° · ${headOf(m)} · ${shaftOf(m, me.stats.power)}`;
    };
    const foot = (m) => {
      const inBag = bag[cat] === m.id;
      const try_ = cat !== 'putter' && !inBag ? `<button class="btn ghost" data-a="tryClub" data-id="${m.id}">Try it</button>` : '';
      if (inBag) return '<span class="pill">In your bag</span>';
      if (has(m)) return `${try_}<button class="btn" data-a="useClub" data-id="${m.id}">Put in bag</button>`;
      return `${try_}<button class="btn primary" data-a="buyClub" data-id="${m.id}" ${g.money < m.price ? 'disabled' : ''}>Buy ${money(m.price, true)}</button>`;
    };
    const card = (m) => `<article class="clubcard ${bag[cat] === m.id ? 'on' : ''} ${next && next.id === m.id ? 'next' : ''}" style="--tc:${tierOf(m).color}">
        <div class="cc-pic">${pic(`m-${m.id}`, m)}${tierChip(m)}${next && next.id === m.id ? '<span class="nextchip">Next upgrade</span>' : ''}</div>
        <div class="cc-body">
          <small>${esc(m.brand)}</small><h4>${esc(m.name)}</h4>
          <div class="cc-specs">${esc(specLine(m))}</div>
          <div class="gains">${gains(m)}</div>
          ${Object.entries(modelBars(m)).map(([k, val]) => statBar(k, val)).join('')}
          <ul class="proscons">${m.pros.map((p) => `<li class="adv">${esc(p)}</li>`).join('')}${m.cons.map((p) => `<li class="dis">${esc(p)}</li>`).join('')}</ul>
        </div>
        <div class="cc-foot"><b class="price">${m.price ? money(m.price, true) : 'Free'}</b><div class="cc-btns">${foot(m)}</div></div>
      </article>`;
    const steps = ladder.map((m, i) => `<button class="lstep ${i <= top ? 'got' : ''} ${bag[cat] === m.id ? 'on' : ''} ${next && next.id === m.id ? 'next' : ''}" data-a="storeJump" data-id="${m.id}" style="--tc:${tierOf(m).color}">
        <i></i><b>${esc(tierOf(m).name)}</b><small>${m.price ? money(m.price, true) : 'Free'}</small></button>`).join('');
    const cats = Object.entries(CLUB_CATS).map(([k, v]) => `<button class="chipbtn ${k === cat ? 'on' : ''}" data-a="storeCat" data-t="${k}">${esc(v.label)}</button>`).join('');
    this.clubSpecs = specs;
    return `<section class="card storehead">
        <div class="sh-top">
          <div><h3>Club store</h3><p class="muted">Better clubs hit it <b>further</b> and <b>straighter</b>. Climb the Strata line one step at a time, or pick a specialty set built for one job.</p></div>
          <div class="sh-kpis">
            <div class="kpi"><small>Driver carry</small><b>${len(carry(bag, 'DR'))}</b></div>
            <div class="kpi"><small>7-iron carry</small><b>${len(carry(bag, '7I'))}</b></div>
            <div class="kpi"><small>Bag accuracy</small><b>${bagAcc}</b></div>
            <div class="kpi"><small>Bag level</small><b style="color:${bagTier.color}">${esc(bagTier.name)}</b></div>
            <div class="kpi"><small>Bank</small><b>${money(g.money, true)}</b></div>
          </div>
        </div>
        <div class="bagslots">${slots}</div>
      </section>
      <div class="chips store-cats">${cats}</div>
      <section class="card ladder-card">
        <h3>The Strata line: ${esc(CLUB_CATS[cat].label)}</h3>
        <p class="muted small">Each step is longer and straighter than the one before${cat === 'wedges' ? ', with more spin and help from the sand' : cat === 'putter' ? ': a truer roll and steadier nerves' : ''}.${next ? ` Your next upgrade is <b>${esc(next.name)}</b> for ${money(next.price, true)}.` : ' You have the best there is.'}</p>
        <div class="ladder">${steps}</div>
      </section>
      <div class="clubcards">${ladder.map(card).join('')}</div>
      <h3 class="shop-h">Specialty ${esc(CLUB_CATS[cat].label.toLowerCase())}</h3>
      <p class="muted small">These trade one strength for another: more distance but wilder, or a huge sweet spot but less spin.</p>
      <div class="clubcards">${special.map(card).join('')}</div>`;
  }


  hubTrophies(c) {
    const hist = c.history.slice(0, 40);
    const items = trophyItems(c);
    requestAnimationFrame(() => {
      const im = this.root.querySelector('#trophyImg');
      if (!im) return;
      const url = renderTrophyRoom(this.app.world.renderer, items, { w: 900, h: 520 });
      if (url) { im.src = url; im.classList.add('ready'); }
    });
    const wins = c.history.filter((h) => h.pos === 1);
    return `<section class="card cabinet"><img id="trophyImg" alt="Your trophy cabinet"><div class="cab-cap">${wins.length ? `${wins.length} title${wins.length === 1 ? '' : 's'}` : 'No titles yet'}${(c.cups || []).length ? ` · ${c.cups.length} Legends Cup${c.cups.length === 1 ? '' : 's'}` : ''}${(c.garage || []).length ? ` · ${c.garage.length} car${c.garage.length === 1 ? '' : 's'} won` : ''}</div></section>
      ${(c.garage || []).length ? `<section class="card"><h3>Garage</h3><ul class="garage">${c.garage.map((car) => `<li><i style="background:${car.color}"></i><b>${esc(car.name)}</b><span class="muted small">Hole-in-one on the ${car.hole}th · ${esc(car.event)} ${car.year} · worth ${money(car.value, true)}</span></li>`).join('')}</ul></section>` : ''}
      <div class="cols">
      <section class="card"><h3>Achievements</h3><ul class="achv">${Object.entries(ACHIEVEMENTS).map(([k, a]) => `<li class="${c.achievements[k] ? 'got' : ''}"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></li>`).join('')}</ul></section>
      <section class="card"><h3>Results</h3>${hist.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Year</th><th>Event</th><th>Pos</th><th>Score</th><th>Money</th></tr></thead><tbody>${hist.map((h) => `<tr class="${h.pos === 1 ? 'win' : ''}"><td>${h.year}</td><td>${esc(h.name)}</td><td>${esc(h.posText)}</td><td class="${toParClass(h.toPar)}">${fmtToPar(h.toPar)}</td><td>${money(h.money, true)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No events yet.</p>'}</section>
    </div>`;
  }

  // ---------------- players database ----------------
  players(opts) {
    const pros = generatePros();
    const c = this.app.career;
    const rankM = c ? Object.fromEntries(rankings(c).map((r) => [r.id, r.rank])) : null;
    const f = (opts.q || '').toLowerCase();
    let list = pros.filter((p) => !f || p.name.toLowerCase().includes(f) || p.country.toLowerCase() === f || COUNTRIES[p.country].name.toLowerCase().includes(f) || p.traits.some((t) => TRAITS[t].name.toLowerCase().includes(f)));
    const key = opts.sort || 'rank';
    list.sort((a, b) => {
      if (key === 'rank') return (rankM ? rankM[a.id] - rankM[b.id] : 0) || b.ovr - a.ovr;
      if (key === 'name') return a.last.localeCompare(b.last);
      if (key === 'ovr') return b.ovr - a.ovr;
      return b.stats[key] - a.stats[key];
    });
    const total = list.length;
    list = list.slice(0, opts.limit || 120);
    const sorts = [['rank', 'World rank'], ['ovr', 'Overall'], ...STAT_KEYS.map((k) => [k, STAT_LABELS[k]]), ['name', 'Name']];
    this.show(`
      <div class="page">
        <header class="page-head"><button class="back" data-a="${opts.pick ? 'pickBack' : c && this.app.fromHub ? 'hub' : 'title'}">← Back</button><h2>${opts.pick ? 'Choose a pro to play as' : 'Tour players'}</h2><span class="muted">${total} of 500</span></header>
        <div class="toolbar">
          <input type="search" placeholder="Search name, country or trait (e.g. Bomber)" data-filter="players" value="${esc(opts.q || '')}" aria-label="Search players">
          <label class="inline">Sort <select data-filter="playersSort">${sorts.map(([k, v]) => `<option value="${k}" ${k === key ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
        </div>
        <div class="table-wrap"><table class="tbl players"><thead><tr><th>${rankM ? 'Rank' : '#'}</th><th>Player</th><th>Ctry</th><th>Age</th><th>OVR</th><th>PWR</th><th>ACC</th><th>IRN</th><th>SHT</th><th>PUT</th><th>Traits</th></tr></thead><tbody>
          ${list.map((p, i) => `<tr data-a="${opts.pick ? 'pickPro' : 'pro'}" data-id="${p.id}"><td>${rankM ? rankM[p.id] : i + 1}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.country)}</td><td>${p.age}</td><td class="ovr">${p.ovr}</td><td>${p.stats.power}</td><td>${p.stats.accuracy}</td><td>${p.stats.irons}</td><td>${p.stats.shortGame}</td><td>${p.stats.putting}</td><td class="tchips">${p.traits.map((t) => `<span class="chip ${TRAITS[t].kind}">${esc(TRAITS[t].name)}</span>`).join('')}</td></tr>`).join('')}
        </tbody></table></div>
        ${total > list.length ? `<div class="actions"><button class="btn" data-a="morePlayers">Show more</button></div>` : ''}
      </div>`);
  }

  proCard(id) {
    const p = proById(id);
    const c = this.app.career;
    const d = c ? c.p[id] : null;
    const rank = c ? rankOf(c, id) : null;
    const b = BALL_BY_ID[p.ball];
    return modal(`
      <div class="procard">
        <div class="pc-head" style="--shirt:${p.look.shirt}">
          <div class="pc-ovr"><b>${p.ovr}</b><small>OVR</small></div>
          <div><h3>${esc(p.name)}</h3><div class="muted">${esc(COUNTRIES[p.country].name)} · Age ${p.age}${rank ? ` · World #${rank}` : ''}</div></div>
        </div>
        <div class="cols tight">
          <div>${STAT_KEYS.map((k) => statBar(STAT_LABELS[k], p.stats[k])).join('')}</div>
          <div>
            <h4>Advantages &amp; disadvantages</h4>
            <ul class="traits">${p.traits.map((t) => `<li class="${TRAITS[t].kind}"><b>${esc(TRAITS[t].name)}</b> ${esc(TRAITS[t].desc)}</li>`).join('') || '<li class="muted">No standout traits</li>'}</ul>
            <h4>In the bag</h4>
            <ul class="baglist">${Object.entries(CLUB_CATS).map(([cat, v]) => { const m = MODEL_BY_ID[normBag(p.bag)[cat]]; return `<li><small>${esc(v.label)}</small> ${esc(m.brand)} ${esc(m.name)}</li>`; }).join('')}<li><small>Ball</small> ${esc(b.name)}</li></ul>
            ${d ? `<div class="facts small"><div><small>Points</small><b>${d.pts.toFixed(1)}</b></div><div><small>Season wins</small><b>${d.wins}</b></div><div><small>Career wins</small><b>${d.cw}</b></div><div><small>Season money</small><b>${money(d.money, true)}</b></div></div>` : ''}
          </div>
        </div>
        <div class="actions">${c ? (c.golfer.char === p.id ? '<span class="pill gold">You’re playing as them</span>' : (c.golfer.chars || []).includes(p.id) ? `<button class="btn primary" data-a="useChar" data-id="${p.id}">Play my career as ${esc(p.first)}</button>` : `<button class="btn primary" data-a="buyChar" data-id="${p.id}" ${c.golfer.money < proPrice(p) ? 'disabled' : ''}>Buy for ${money(proPrice(p))}</button>`) : ''}<button class="btn" data-a="playAsPro" data-id="${p.id}">Play a quick round as ${esc(p.first)}</button></div>
        ${c && !(c.golfer.chars || []).includes(p.id) && c.golfer.money < proPrice(p) ? `<p class="muted small">You have ${money(c.golfer.money)}. Win prize money to afford ${esc(p.first)}.</p>` : ''}
      </div>`, { wide: true });
  }

  // ---------------- courses ----------------
  courses(opts) {
    const cs = generateCourses();
    const f = (opts.q || '').toLowerCase();
    let list = cs.filter((c) => (!opts.style || c.style === opts.style) && (!f || c.name.toLowerCase().includes(f) || c.region.toLowerCase().includes(f) || c.countryName.toLowerCase().includes(f)));
    const styles = Object.keys(STYLES);
    this.show(`
      <div class="page">
        <header class="page-head"><button class="back" data-a="${opts.pick ? 'pickBack' : 'title'}">← Back</button><h2>${opts.pick ? 'Choose a course' : 'Courses'}</h2><span class="muted">${list.length} of 100</span></header>
        <div class="toolbar">
          <input type="search" placeholder="Search course, region or country" data-filter="courses" value="${esc(opts.q || '')}" aria-label="Search courses">
          <div class="chips">${['', ...styles].map((s) => `<button class="chipbtn ${opts.style === s || (!opts.style && !s) ? 'on' : ''}" data-a="courseStyle" data-s="${s}">${s || 'All'}</button>`).join('')}</div>
        </div>
        <div class="coursegrid">${list.map((c) => `
          <article class="course" data-a="${opts.pick ? 'pickCourse' : 'course'}" data-id="${c.id}" style="--st:${STYLES[c.style].colors.fairway}">
            <div class="co-style">${esc(c.style)}</div>
            <h4>${esc(c.name)}</h4>
            <div class="muted small">${esc(c.region)}, ${esc(c.countryName)}</div>
            <div class="co-facts"><span>Par ${c.par}</span><span>${c.yards.toLocaleString()} yds</span><span class="stars" aria-label="Difficulty ${c.stars} of 5">${'●'.repeat(c.stars)}${'○'.repeat(5 - c.stars)}</span></div>
          </article>`).join('')}</div>
      </div>`);
  }

  courseCard(id) {
    const c = courseById(id);
    const st = STYLES[c.style];
    const front = c.holes.slice(0, 9), back = c.holes.slice(9);
    const row = (hs, lab, key) => `<tr><th>${lab}</th>${hs.map((h) => `<td>${h[key]}</td>`).join('')}<td><b>${key === 'n' ? (hs[0].n === 1 ? 'Out' : 'In') : hs.reduce((s, h) => s + h[key], 0)}</b></td></tr>`;
    const card = (hs) => `<div class="table-wrap"><table class="tbl scard">${row(hs, 'Hole', 'n')}${row(hs, 'Yards', 'yards')}${row(hs, 'Par', 'par')}<tr><th>Index</th>${hs.map((h) => `<td>${h.si}</td>`).join('')}<td></td></tr></table></div>`;
    const rec = this.courseRecord(c);
    const m = modal(`
      <div class="coursecard">
        <div class="co-style">${esc(c.style)}</div>
        <h3>${esc(c.name)}</h3>
        <p class="muted">${esc(c.region)}, ${esc(c.countryName)} · Est. ${c.est} · Designed by ${esc(c.designer)}</p>
        <p>${esc(st.desc)}</p>
        <div class="facts small"><div><small>Par</small><b>${c.par}</b></div><div><small>Length</small><b>${c.yards.toLocaleString()} yds</b></div><div><small>Greens</small><b>Stimp ${c.stimp}</b></div><div><small>Firmness</small><b>${c.firm > 0.7 ? 'Firm' : c.firm > 0.45 ? 'Medium' : 'Soft'}</b></div><div><small>Wind</small><b>${c.wind[0]}–${c.wind[1]} mph</b></div><div><small>Signature</small><b>No. ${c.signature}</b></div><div><small>Course record</small><b>${rec.score} \u00b7 ${esc(rec.holder.name)} (${rec.year})</b></div></div>
        ${card(front)}${card(back)}
        <div class="actions"><button class="btn primary" data-a="playCourse" data-id="${c.id}">Play a quick round here</button></div>
        <h4>Yardage book</h4>
        <div class="ybook">${c.holes.map((h, i) => `
          <article class="yb-hole">
            <canvas data-yb="${i}" width="180" height="300" aria-label="Map of hole ${h.n}"></canvas>
            <div class="yb-info"><div class="yb-head"><b>${h.n}</b><span>Par ${h.par}</span><span>${h.yards} yds</span><span>Index ${h.si}</span></div>
            <p class="yb-note" data-ybnote="${i}">Loading\u2026</p></div>
          </article>`).join('')}</div>
      </div>`, { wide: true });
    // Draw the 18 maps a few at a time so the card opens instantly
    const body = m.el;
    let i = 0;
    const step = () => {
      const cv = body.querySelector(`[data-yb="${i}"]`);
      if (!cv || !cv.isConnected) return;
      const hole = new HoleModel(c, i);
      drawHoleMap(cv.getContext('2d'), hole, 90, 150, { sc: 2, pin: true });
      body.querySelector(`[data-ybnote="${i}"]`).textContent = caddieNote(hole);
      i++;
      if (i < 18) setTimeout(step, 16);
    };
    setTimeout(step, 60);
    return m;
  }

  courseRecord(c) {
    const r = new RNG(mixSeed(c.seed, 'record'));
    const pros = generatePros();
    const holder = pros[r.int(0, 60)];
    const score = c.par - r.int(7, 11);
    return { holder, score, year: r.int(Math.max(c.est + 20, 1990), 2025) };
  }

  // ---------------- quick round ----------------
  quick(q) {
    const c = courseById(q.courseId);
    const who = q.proId ? proById(q.proId) : null;
    const g = this.app.career ? this.app.career.golfer : null;
    const golferName = who ? who.name : g ? `${g.name} (your career golfer)` : 'Club pro (all skills 70)';
    const ballOpts = BALLS.map((b) => `<option value="${b.id}" ${q.ball === b.id ? 'selected' : ''}>${esc(b.name)}${b.pros[0] ? ` — ${esc(b.pros[0])}` : ''}</option>`).join('');
    this.show(`
      <div class="page narrow">
        <header class="page-head"><button class="back" data-a="title">← Back</button><h2>Quick round</h2></header>
        <section class="card pickrow" data-a="pickCourseList"><small>Course</small><b>${esc(c.name)}</b><span class="muted">${esc(c.style)} · Par ${c.par} · ${c.yards.toLocaleString()} yds · ${esc(c.countryName)}</span><span class="chev">Change</span></section>
        <section class="card pickrow" data-a="pickProList"><small>Golfer</small><b>${esc(golferName)}</b>${who ? `<span class="muted">OVR ${who.ovr} · ${who.traits.map((t) => TRAITS[t].name).join(', ')}</span>` : ''}<span class="chev">Change</span></section>
        ${q.proId && g ? `<div class="actions left"><button class="linkbtn" data-a="useMyGolfer">Use my career golfer instead</button></div>` : ''}
        <section class="card form">
          <div class="row2">
            <div><label for="q-holes">Holes</label><select id="q-holes" data-field="q.holes"><option value="18" ${q.holes === '18' ? 'selected' : ''}>18 holes</option><option value="front" ${q.holes === 'front' ? 'selected' : ''}>Front nine</option><option value="back" ${q.holes === 'back' ? 'selected' : ''}>Back nine</option><option value="sig" ${q.holes === 'sig' ? 'selected' : ''}>Signature hole only</option></select></div>
            <div><label for="q-ball">Ball</label><select id="q-ball" data-field="q.ball">${ballOpts}</select></div>
          </div>
          <div class="row2">
            <div><label for="q-wind">Wind</label><select id="q-wind" data-field="q.wind"><option value="course" ${q.wind === 'course' ? 'selected' : ''}>Typical for the course</option><option value="calm" ${q.wind === 'calm' ? 'selected' : ''}>Calm</option><option value="breezy" ${q.wind === 'breezy' ? 'selected' : ''}>Breezy (8–12 mph)</option><option value="windy" ${q.wind === 'windy' ? 'selected' : ''}>Windy (15–22 mph)</option><option value="gale" ${q.wind === 'gale' ? 'selected' : ''}>Gale (25–32 mph)</option></select></div>
            <div><label for="q-greens">Greens</label><select id="q-greens" data-field="q.greens"><option value="course" ${q.greens === 'course' ? 'selected' : ''}>Course setup (stimp ${c.stimp})</option><option value="9" ${q.greens === '9' ? 'selected' : ''}>Slow (stimp 9)</option><option value="11" ${q.greens === '11' ? 'selected' : ''}>Medium (stimp 11)</option><option value="13" ${q.greens === '13' ? 'selected' : ''}>Tour fast (stimp 13)</option><option value="14.5" ${q.greens === '14.5' ? 'selected' : ''}>Lightning (stimp 14.5)</option></select></div>
          </div>
          <div class="row2">
            <div><label for="q-time">Time of day</label><select id="q-time" data-field="q.time">${TIMES.map(([v, l]) => `<option value="${v}" ${q.time === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div><label for="q-weather">Weather</label><select id="q-weather" data-field="q.weather"><option value="course" ${!q.weather || q.weather === 'course' ? 'selected' : ''}>Typical for the course</option>${Object.entries(WEATHERS).map(([v, l]) => `<option value="${v}" ${q.weather === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          </div>
          <div class="row2">
            <div><label for="q-vs">Opponent</label><select id="q-vs" data-field="q.vs"><option value="" ${!q.vs ? 'selected' : ''}>None (stroke play)</option>${this.app.career && this.app.career.rival ? `<option value="rival" ${q.vs === 'rival' ? 'selected' : ''}>Match play vs your rival</option>` : ''}<option value="random" ${q.vs === 'random' ? 'selected' : ''}>Match play vs a tour star</option></select></div>
          </div>
          <div class="row2">
            <div><label for="q-pin">Pins</label><select id="q-pin" data-field="q.pin"><option value="0" ${q.pin === '0' ? 'selected' : ''}>Friendly</option><option value="1" ${q.pin === '1' ? 'selected' : ''}>Tournament</option><option value="3" ${q.pin === '3' ? 'selected' : ''}>Sunday tucked</option></select></div>
          </div>
        </section>
        <div class="actions"><button class="btn primary big" data-a="startQuick">Tee off</button></div>
      </div>`);
  }

  // ---------------- settings / help ----------------
  settings(s, hasCareer) {
    const sel = (key, opts) => `<select data-setting="${key}" id="s-${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(s[key]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const chk = (key) => `<input type="checkbox" data-setting="${key}" id="s-${key}" ${s[key] ? 'checked' : ''}>`;
    this.show(`
      <div class="page narrow">
        <header class="page-head"><button class="back" data-a="back">← Back</button><h2>Settings</h2></header>
        <section class="card form settings">
          <div class="set"><label for="s-units">Distances</label>${sel('units', [['yards', 'Yards & feet'], ['meters', 'Meters']])}</div>
          <div class="set"><label for="s-rounds">Career event length</label>${sel('rounds', [[4, '4 rounds (full, with 36-hole cut)'], [2, '2 rounds'], [1, '1 round']])}</div>
          <div class="set"><label for="s-quality">Graphics</label>${sel('quality', [['auto', 'Automatic'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low (phones, older tablets)']])}</div>
          <div class="set"><label for="s-swingSens">Swing accuracy</label>${sel('swingSens', [[0.6, 'Forgiving'], [1, 'Normal'], [1.4, 'Pro (unforgiving)']])}</div>
          <div class="set"><label for="s-sound">Sound</label>${chk('sound')}</div>
          <div class="set"><label for="s-aimHelp">Show flight preview</label>${chk('aimHelp')}</div>
          <div class="set"><label for="s-tapIn">Auto tap-in under 18 in.</label>${chk('tapIn')}</div>
          <div class="set"><label for="s-flyover">Hole flyover</label>${chk('flyover')}</div>
          <div class="set"><label for="s-replays">Replays of great shots</label>${chk('replays')}</div>
          <div class="set"><label for="s-commentary">TV commentary captions</label>${chk('commentary')}</div>
          <div class="set"><label for="s-voice">Commentator speaks aloud</label>${chk('voice')}</div>
          <div class="set"><label for="s-caddieTips">Caddie tips</label>${chk('caddieTips')}</div>
          <div class="set"><label for="s-music">Menu music</label>${chk('music')}</div>
          <p class="muted small">Graphics changes apply the next time a hole loads.</p>
        </section>
        ${hasCareer ? `<section class="card"><h3>Career save</h3><p class="muted small">${this.app.cloudSave ? 'Saved to your account and this browser.' : 'Saved in this browser.'}</p><button class="btn danger" data-a="resetCareer">Delete career…</button></section>` : ''}
      </div>`);
  }

  howto() {
    return modal(`
      <h3>How to play</h3>
      <div class="howto">
        <div><h4>Swing</h4><p>Press anywhere on the course and <b>pull down</b>: the further you pull, the harder you swing (100% is a full swing; past that is an overswing that sprays the ball). Then <b>push straight back up</b> past where you started to hit it. Push up and to the right and the ball fades or slices; up and to the left and it draws or hooks. A slow, hesitant push loses speed.</p></div>
        <div><h4>Aim and clubs</h4><p>Your caddie picks a club and aims at the fairway or flag. Change clubs with <b>◀ ▶</b> by the club name (or W/S keys, mouse wheel). Aim with the big arrow buttons, A/D or arrow keys, or <b>tap the map</b>. The white ring shows where a full swing lands without wind; the blue ring (for good wind players) includes the wind.</p></div>
        <div><h4>Shape and spin</h4><p><b>Shape</b> sets where the club strikes the ball: left for a draw, right for a fade, top for a low shot with less spin, bottom for a high shot that stops fast.</p></div>
        <div><h4>Putting</h4><p>On the green you get a putter. Pull back to set the pace (the meter shows how far it would roll on a flat green), then push up. The dotted line previews the break; better putters see more of it. <b>Grid</b> shows slope arrows (red is steep). <b>Range</b> changes how far a full stroke rolls.</p></div>
        <div><h4>Lies and conditions</h4><p>Rough, bunkers and slopes change the shot (see the box under the scorecard). Wind, altitude, firm links turf and green speed all change how far the ball flies and rolls. Water is a one-stroke penalty and a drop; out of bounds costs stroke and distance.</p></div>
        <div><h4>Career</h4><p>You start at #501. Challenger Tour events are open to everyone. Reach the top 125 (or win a Challenger event) for World Tour starts, the top 60 for the majors, and the top 30 in the season race for the $40M Tour Championship. Your skills are fixed: spend prize money in the Players tab to buy better players (and on clubs and balls in the pro shop). Levels pay a cash bonus.</p></div>
        <div><h4>Keys</h4><p>A/D aim · W/S club · Space hold to fast-forward · V camera · G green grid · C scorecard · L leaderboard · Esc menu</p></div>
      </div>`, { wide: true });
  }
}
