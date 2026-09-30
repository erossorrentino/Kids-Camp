// Screens for the extra ways to play: the mini-games menu and results, and
// playing with friends (setup, group scorecard, results).
import { esc, money, ordinal, modal, fmtToPar, toParClass } from './dom.js';
import { courseById } from '../data/courses.js';
import { proById, generatePros } from '../data/players.js';
import { FORMATS, PARTY_COLORS } from '../game/party.js';
import { WEATHERS, TIMES } from '../game/weather.js';
import { TRAITS } from '../data/traits.js';
import { GAMES, GAME_ORDER, MINI_PRIZES } from '../game/minigames.js';

// Small drawings for each game card
const ICONS = {
  range: `<svg viewBox="0 0 64 40" aria-hidden="true"><rect x="0" y="26" width="64" height="14" fill="#3f8a36"/><rect x="4" y="30" width="14" height="6" fill="#2f6b2a"/><circle cx="11" cy="29" r="1.6" fill="#fff"/><path d="M11 29 Q30 -6 52 22" stroke="#f2c230" stroke-width="2" fill="none" stroke-dasharray="3 3"/><line x1="52" y1="14" x2="52" y2="27" stroke="#fff" stroke-width="1.2"/><path d="M52 14 l8 3 -8 3z" fill="#e63946"/></svg>`,
  ctp: `<svg viewBox="0 0 64 40" aria-hidden="true"><ellipse cx="32" cy="30" rx="26" ry="9" fill="#6fb043"/><line x1="32" y1="8" x2="32" y2="30" stroke="#fff" stroke-width="1.3"/><path d="M32 8 l10 3.5 -10 3.5z" fill="#f2c230"/><circle cx="38" cy="31" r="2" fill="#fff"/><circle cx="23" cy="27" r="1.6" fill="#fff" opacity=".7"/><path d="M34 30 L37 31" stroke="#f2c230" stroke-width="1" stroke-dasharray="1 1"/></svg>`,
  drive: `<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M0 34 L64 26 L64 40 L0 40z" fill="#69ab3f"/><path d="M4 32 Q30 -10 60 26" stroke="#f2c230" stroke-width="2.4" fill="none"/><circle cx="60" cy="26" r="2" fill="#fff"/><rect x="40" y="18" width="10" height="6" fill="#1b3a2a" stroke="#fff" stroke-width=".8"/><text x="45" y="23" font-size="4.5" fill="#fff" text-anchor="middle" font-family="Arial" font-weight="bold">300</text></svg>`,
  putt: `<svg viewBox="0 0 64 40" aria-hidden="true"><ellipse cx="32" cy="26" rx="30" ry="13" fill="#72b548"/><ellipse cx="44" cy="24" rx="3" ry="1.4" fill="#0b0d0b"/><line x1="44" y1="6" x2="44" y2="24" stroke="#fff" stroke-width="1.2"/><path d="M44 6 l8 3 -8 3z" fill="#e63946"/><path d="M12 30 Q26 18 42 24" stroke="#fff3b0" stroke-width="1.4" fill="none" stroke-dasharray="2 2"/><circle cx="12" cy="30" r="1.8" fill="#fff"/></svg>`,
  target: `<svg viewBox="0 0 64 40" aria-hidden="true"><rect width="64" height="40" fill="#5a9e3d"/><ellipse cx="32" cy="24" rx="24" ry="10" fill="#3a86ff"/><ellipse cx="32" cy="24" rx="16" ry="6.6" fill="#f2f2ec"/><ellipse cx="32" cy="24" rx="7" ry="3" fill="#e63946"/><line x1="32" y1="6" x2="32" y2="24" stroke="#fff" stroke-width="1.2"/><path d="M32 6 l8 3 -8 3z" fill="#e63946"/><circle cx="35" cy="25" r="1.6" fill="#fff"/></svg>`,
};

export function recordText(kind, rec, units) {
  if (!rec) return '—';
  return rec.text || '';
}

export function miniMenu(screens, app, o) {
  const c = app.career;
  const course = courseById(o.courseId);
  const who = o.proId ? proById(o.proId) : null;
  const g = c ? c.golfer : null;
  const golferName = who ? who.name : g ? `${g.name} (your career golfer)` : 'Club pro (all skills 70)';
  const recs = app.records || {};
  const wk = c ? `${c.year}-${c.week}` : '';
  const played = c && c.mini && c.mini.week === wk ? c.mini.played || {} : {};
  const prizeOn = c && !o.proId;
  screens.show(`
    <div class="page">
      <header class="page-head"><button class="back" data-a="title">← Back</button><h2>Mini-games</h2><span class="muted">Skills challenges against the tour's best</span></header>
      <div class="cols">
        <section class="card pickrow" data-a="miniPickCourse"><small>Played at</small><b>${esc(course.name)}</b><span class="muted">${esc(course.style)} · ${esc(course.countryName)}</span><span class="chev">Change</span></section>
        <section class="card pickrow" data-a="miniPickPro"><small>Golfer</small><b>${esc(golferName)}</b>${who ? `<span class="muted">OVR ${who.ovr} · ${who.traits.map((t) => TRAITS[t].name).join(', ')}</span>` : ''}<span class="chev">Change</span></section>
      </div>
      ${o.proId && g ? '<div class="actions left"><button class="linkbtn" data-a="miniUseMine">Use my career golfer instead</button></div>' : ''}
      <div class="seg sky">${[['day', 'Daytime'], ['sunset', 'Sunset'], ['night', 'Night under lights'], ['rain', 'Rain']].map(([k, l]) => `<button class="segbtn ${(o.sky || 'day') === k ? 'on' : ''}" data-a="miniSky" data-s="${k}">${l}</button>`).join('')}</div>
      ${c ? `<p class="muted small prize-note">${prizeOn ? `<b>Prize money:</b> the first go at each challenge every career week pays your career golfer up to ${money(MINI_PRIZES[0])} (1st place), and every finisher earns something.` : 'Prize money only goes to your career golfer. Switch back to them to earn it.'}</p>` : ''}
      <div class="games">
        ${GAME_ORDER.map((k) => {
          const m = GAMES[k];
          const rec = recs[k];
          return `<article class="gamecard g-${k}">
            <div class="gc-art">${ICONS[k]}</div>
            <div class="gc-body">
              <h3>${esc(m.name)}</h3>
              <p>${esc(m.blurb)}</p>
              <div class="chips">${m.rules.map((r) => `<span class="pill">${esc(r)}</span>`).join('')}</div>
              <div class="gc-foot">
                <div class="gc-rec"><small>${k === 'range' ? 'Longest drive' : 'Your best'}</small><b>${esc(k === 'range' ? (recs.rangeDrive ? recs.rangeDrive.text : '—') : recordText(k, rec, app.settings.units))}</b>${rec && rec.name && k !== 'range' ? `<span class="muted small">${esc(rec.name)}</span>` : ''}</div>
                ${k !== 'range' && prizeOn ? `<span class="pill ${played[k] ? '' : 'gold'}">${played[k] ? 'Prize collected this week' : `Up to ${money(MINI_PRIZES[0], true)}`}</span>` : ''}
                <button class="btn primary" data-a="playMini" data-g="${k}">${k === 'range' ? 'Hit balls' : 'Play'}</button>
              </div>
            </div>
          </article>`;
        }).join('')}
      </div>
    </div>`);
}

export function miniResults(screens, app, res, extra = {}) {
  const m = GAMES[res.kind];
  if (res.kind === 'range') {
    const rows = Object.entries(res.clubLog || {}).map(([club, arr]) => ({ club, n: arr.length, avg: arr.reduce((a, b) => a + b, 0) / arr.length, max: Math.max(...arr) }));
    screens.show(`
      <div class="page narrow">
        <header class="page-head"><h2>Range session</h2><span class="pill">${esc(res.course.name)}</span></header>
        <section class="card"><h3>Your yardages</h3>${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Club</th><th>Balls</th><th>Average carry</th><th>Longest</th></tr></thead><tbody>${rows.map((r) => `<tr><td><b>${esc(r.club)}</b></td><td>${r.n}</td><td>${esc(extra.fmt(r.avg))}</td><td>${esc(extra.fmt(r.max))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No balls hit this time.</p>'}
        ${res.best ? `<p>Longest drive today: <b>${esc(extra.fmt(res.best))}</b>${extra.record ? ' <span class="pill gold">Personal best</span>' : ''}</p>` : ''}</section>
        <div class="actions"><button class="btn primary big" data-a="playMini" data-g="range">Hit more balls</button><button class="btn" data-a="minigames">Mini-games</button><button class="btn" data-a="title">Main menu</button></div>
      </div>`);
    return;
  }
  const n = res.rows.length;
  const win = res.pos === 1;
  const detail = res.kind === 'ctp' ? res.shots.map((d) => (d === Infinity ? 'lost' : d === 0 ? 'ACE' : extra.fmtSmall(d))).join(' · ')
    : res.kind === 'drive' ? res.shots.map((d) => (d ? extra.fmt(d) : 'out')).join(' · ')
    : res.kind === 'putt' ? res.shots.map((s) => (s === 'in' ? '●' : s === 'close' ? '◐' : '○')).join(' ')
    : res.shots.join(' · ');
  screens.show(`
    <div class="page narrow">
      <header class="page-head"><h2>${esc(m.name)}</h2><span class="pill">${esc(res.course.name)}</span></header>
      <section class="card result-hero ${win ? 'win' : ''}">
        <div class="rh-score"><b>${esc(res.pos ? ordinal(res.pos) : '–')}</b></div>
        <div>
          <div class="rh-pos">${win ? 'You win!' : res.pos <= 3 ? 'On the podium' : res.pos <= n / 2 ? 'In the mix' : 'Keep practising'}</div>
          <div class="muted">Finished ${ordinal(res.pos)} of ${n} · Your score: <b>${esc(res.scoreText)}</b>${extra.record ? ' <span class="pill gold">New personal best</span>' : ''}</div>
          ${detail ? `<div class="muted small">${esc(detail)}</div>` : ''}
          ${extra.prize ? `<div class="prize-line">+${money(extra.prize)} prize money</div>` : extra.prizeNote ? `<div class="muted small">${esc(extra.prizeNote)}</div>` : ''}
        </div>
      </section>
      <section class="card"><h3>Standings</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Pos</th><th>Player</th><th>Score</th>${extra.prizeOn ? '<th>Prize</th>' : ''}</tr></thead><tbody>
        ${res.rows.map((r) => `<tr class="${r.you ? 'me' : ''}" ${r.you ? '' : `data-a="pro" data-id="${r.id}"`}><td>${r.pos}</td><td>${esc(r.you ? 'You' : r.name)}</td><td><b>${esc(r.text)}</b></td>${extra.prizeOn ? `<td>${money(MINI_PRIZES[r.pos - 1] || 1000, true)}</td>` : ''}</tr>`).join('')}
      </tbody></table></div></section>
      <div class="actions"><button class="btn primary big" data-a="playMini" data-g="${res.kind}">Play again</button><button class="btn" data-a="minigames">Other mini-games</button><button class="btn" data-a="title">Main menu</button></div>
    </div>`);
}

// ---------------------------------------------------------------- friends

export const PARTY_TIERS = {
  club: { name: 'Club pro', level: 70 },
  weekend: { name: 'Weekend golfer', level: 62 },
  rookie: { name: 'Beginner', level: 54 },
};

export function partySetup(screens, app, o) {
  const c = app.career;
  const course = courseById(o.courseId);
  const pros = generatePros().slice(0, 100);
  const usedCareer = o.players.findIndex((p) => p.who === 'career');
  const whoOpts = (pl, i) => `
    ${c ? `<option value="career" ${pl.who === 'career' ? 'selected' : ''} ${usedCareer >= 0 && usedCareer !== i ? 'disabled' : ''}>${esc(c.golfer.name)} (career)</option>` : ''}
    ${Object.entries(PARTY_TIERS).map(([k, t]) => `<option value="${k}" ${pl.who === k ? 'selected' : ''}>${esc(t.name)} (skills ${t.level})</option>`).join('')}
    <optgroup label="Tour pros">${pros.map((p) => `<option value="${p.id}" ${pl.who === p.id ? 'selected' : ''}>${esc(p.name)} (${p.ovr})</option>`).join('')}</optgroup>`;
  const fmtOk = (f) => f !== 'match' || o.players.length === 2;
  screens.show(`
    <div class="page narrow">
      <header class="page-head"><button class="back" data-a="title">← Back</button><h2>Play with friends</h2><span class="muted">2 to 4 players on one device</span></header>
      <section class="card pickrow" data-a="partyPickCourse"><small>Course</small><b>${esc(course.name)}</b><span class="muted">${esc(course.style)} · Par ${course.par} · ${course.yards.toLocaleString()} yds · ${esc(course.countryName)}</span><span class="chev">Change</span></section>
      <section class="card">
        <h3>Players</h3>
        <div class="plist">
          ${o.players.map((pl, i) => `
            <div class="prow" style="--pc:${PARTY_COLORS[i]}">
              <i class="pball" aria-hidden="true"></i>
              <input data-field="party.name.${i}" value="${esc(pl.name)}" maxlength="14" aria-label="Player ${i + 1} name" placeholder="Player ${i + 1}">
              <select data-field="party.who.${i}" aria-label="Player ${i + 1} golfer">${whoOpts(pl, i)}</select>
              ${o.players.length > 2 ? `<button class="iconx" data-a="partyRemove" data-i="${i}" aria-label="Remove player ${i + 1}">✕</button>` : '<span></span>'}
            </div>`).join('')}
        </div>
        ${o.players.length < 4 ? '<button class="btn" data-a="partyAdd">+ Add a player</button>' : ''}
        <p class="muted small">Each player picks who they play as. Beginners and weekend golfers have lower skills, so a mixed group can still have a close game.</p>
      </section>
      <section class="card">
        <h3>Game</h3>
        <div class="seg">${Object.entries(FORMATS).map(([k, f]) => `<button class="segbtn ${o.format === k ? 'on' : ''}" data-a="partyFormat" data-f="${k}" ${fmtOk(k) ? '' : 'disabled'}>${esc(f.name)}</button>`).join('')}</div>
        <p class="muted">${esc(FORMATS[o.format].desc)}${o.format === 'match' ? '' : ''}</p>
        ${o.players.length !== 2 ? '<p class="muted small">Match play needs exactly two players.</p>' : ''}
        <div class="row3 form">
          <div><label for="p-holes">Holes</label><select id="p-holes" data-field="party.holes">
            ${[['3', '3 holes (quick)'], ['6', '6 holes'], ['front', 'Front nine'], ['back', 'Back nine'], ['18', '18 holes']].map(([v, l]) => `<option value="${v}" ${o.holes === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div><label for="p-wind">Wind</label><select id="p-wind" data-field="party.wind">
            ${[['calm', 'Calm'], ['course', 'Typical'], ['breezy', 'Breezy'], ['windy', 'Windy']].map(([v, l]) => `<option value="${v}" ${o.wind === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div><label for="p-time">Time of day</label><select id="p-time" data-field="party.time">
            ${TIMES.map(([v, l]) => `<option value="${v}" ${o.time === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div><label for="p-weather">Weather</label><select id="p-weather" data-field="party.weather">
            <option value="course" ${o.weather === 'course' ? 'selected' : ''}>Typical for the course</option>${Object.entries(WEATHERS).map(([v, l]) => `<option value="${v}" ${o.weather === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
      </section>
      <p class="muted small">Pass the device to whoever's turn it is: a banner shows who plays next. The player farthest from the hole always goes first, like real golf.</p>
      <div class="actions"><button class="btn primary big" data-a="startParty">Tee off</button></div>
    </div>`);
}

// All players' cards, hole by hole
export function partyCardHtml(course, party) {
  const holes = party.holeList;
  const rows = party.players.map((p) => {
    const cells = holes.map((i) => {
      const s = p.scores[i];
      const rel = s == null ? null : s - course.holes[i].par;
      const cls = rel == null ? '' : rel <= -2 ? 'sc-eagle' : rel === -1 ? 'sc-birdie' : rel === 0 ? '' : rel === 1 ? 'sc-bogey' : 'sc-double';
      return `<td><span class="${cls}">${s ?? ''}</span></td>`;
    }).join('');
    const tot = party.total(p);
    return `<tr class="score"><th><i class="pdot" style="background:${p.color}"></i>${esc(p.name)}</th>${cells}<td><b>${tot || ''}</b></td><td class="${toParClass(party.toPar(p))}"><b>${party.thru(p) ? fmtToPar(party.toPar(p)) : ''}</b></td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="tbl scard"><tr><th>Hole</th>${holes.map((i) => `<td>${i + 1}</td>`).join('')}<td><b>Tot</b></td><td><b>±</b></td></tr>
    <tr class="par"><th>Par</th>${holes.map((i) => `<td>${course.holes[i].par}</td>`).join('')}<td>${holes.reduce((a, i) => a + course.holes[i].par, 0)}</td><td></td></tr>${rows}</table></div>`;
}

export function partyCardModal(course, party) {
  return modal(`<section class="card scorecard"><div class="card-head"><h3>Scorecard</h3><span class="pill">${esc(FORMATS[party.format].name)}</span></div>${partyCardHtml(course, party)}${party.log.length ? `<ul class="plog">${party.log.map((l) => `<li><b>${l.hole + 1}</b> ${esc(l.line)}</li>`).join('')}</ul>` : ''}</section>`, { wide: true });
}

export function partyResults(screens, app, party) {
  const f = party.final();
  const course = party.course;
  const val = (r) => (f.format === 'skins' ? `${r.skins} skin${r.skins === 1 ? '' : 's'}` : fmtToPar(r.toPar));
  screens.show(`
    <div class="page narrow">
      <header class="page-head"><h2>${esc(course.name)}</h2><span class="pill">${esc(FORMATS[f.format].name)}</span></header>
      <section class="card result-hero win party-win">
        <div class="pw-balls">${f.winners.map((i) => `<i style="background:${party.players[i].color}"></i>`).join('')}</div>
        <div>
          <div class="rh-pos">${esc(f.title)}</div>
          <div class="muted">${party.holeList.length} hole${party.holeList.length > 1 ? 's' : ''} · ${party.players.length} players</div>
        </div>
      </section>
      <section class="card"><h3>Final standings</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Pos</th><th>Player</th><th>${f.format === 'skins' ? 'Skins' : 'To par'}</th><th>Strokes</th><th>Birdies</th></tr></thead><tbody>
        ${f.rows.map((r) => {
          const p = party.players[r.i];
          const birdies = p.scores.filter((s, i) => s != null && s < course.holes[i].par).length;
          return `<tr class="${f.winners.includes(r.i) ? 'me' : ''}"><td>${f.format === 'match' ? (f.winners.includes(r.i) ? 1 : 2) : r.pos}</td><td><i class="pdot" style="background:${r.color}"></i>${esc(r.name)}</td><td><b>${esc(val(r))}</b></td><td>${r.total}</td><td>${birdies}</td></tr>`;
        }).join('')}
      </tbody></table></div></section>
      <section class="card scorecard"><h3>Scorecard</h3>${partyCardHtml(course, party)}</section>
      <div class="actions"><button class="btn primary big" data-a="startParty">Play again</button><button class="btn" data-a="party">Change setup</button><button class="btn" data-a="title">Main menu</button></div>
    </div>`);
}
