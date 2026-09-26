// Tournament screens: event intro, round summary, final results, and the
// leaderboard / scorecard overlays.
import { esc, fmtToPar, toParClass, money, ordinal, modal } from './dom.js';
import { courseById } from '../data/courses.js';
import { proById } from '../data/players.js';
import { TOURS } from '../data/tour.js';
import { leaderboard, coursePar, humanPlayer, CUT_SIZE } from '../game/tournament.js';
import { ACHIEVEMENTS } from '../game/career.js';

function windWords(mph) {
  return mph < 4 ? 'Calm' : mph < 10 ? 'Light breeze' : mph < 16 ? 'Breezy' : mph < 22 ? 'Windy' : 'Blowing a gale';
}

export function conditionsHtml(cond, units) {
  const w = units === 'meters' ? `${(cond.windMph * 0.447).toFixed(1)} m/s` : `${Math.round(cond.windMph)} mph`;
  return `<div class="facts small">
    <div><small>Wind</small><b>${windWords(cond.windMph)}, ${w}</b></div>
    <div><small>Greens</small><b>Stimp ${cond.stimp.toFixed(1)}</b></div>
    <div><small>Fairways</small><b>${cond.firm > 0.7 ? 'Firm & fast' : cond.firm > 0.45 ? 'Medium' : 'Soft'}</b></div>
    <div><small>Sky</small><b>${cond.overcast ? 'Overcast' : 'Sunny'}</b></div>
    <div><small>Tee time</small><b>${cond.timeOfDay < 0.4 ? 'Morning' : cond.timeOfDay < 0.62 ? 'Midday' : 'Afternoon'}</b></div>
  </div>`;
}

export function boardTable(t, nameOf, { limit = 20, full = false } = {}) {
  const course = courseById(t.courseId);
  const rows = leaderboard(t, { full });
  const me = rows.find((r) => r.human);
  let list = rows.slice(0, limit);
  if (me && !list.includes(me)) list = [...list, me];
  const nR = t.rounds;
  return `<div class="table-wrap"><table class="tbl board"><thead><tr><th>Pos</th><th>Player</th><th>To par</th><th>Thru</th><th>Today</th>${Array.from({ length: nR }, (_, i) => `<th>R${i + 1}</th>`).join('')}<th>Tot</th></tr></thead><tbody>
    ${list.map((r) => `<tr class="${r.human ? 'me' : ''} ${r.status === 'cut' ? 'cut' : ''}"><td>${esc(r.pos)}</td><td>${esc(r.human ? 'You' : nameOf(r.id))}${r.human ? '' : ` <span class="cc">${esc(proById(r.id).country)}</span>`}</td><td class="${toParClass(r.toPar)}"><b>${fmtToPar(r.toPar)}</b></td><td>${r.status === 'cut' ? '' : r.thru === 18 ? 'F' : r.thru || '–'}</td><td class="${toParClass(r.today)}">${r.today == null ? '' : fmtToPar(r.today)}</td>${Array.from({ length: nR }, (_, i) => `<td>${r.rounds[i] ?? ''}</td>`).join('')}<td>${r.total || ''}</td></tr>`).join('')}
  </tbody></table></div>${t.cutLine != null ? `<p class="muted small">Cut: ${fmtToPar(t.cutLine)} (top ${CUT_SIZE} and ties). Par ${coursePar(course)}.</p>` : ''}`;
}

export function eventIntro(screens, app, c, t) {
  const course = courseById(t.courseId);
  const lb = leaderboard(t, { full: true });
  const favs = t.players.filter((p) => p.id !== 'you').map((p) => proById(p.id)).sort((a, b) => b.ovr - a.ovr).slice(0, 6);
  const r = t.round;
  const hp = humanPlayer(t);
  const played = (hp.scores[r] || []).filter((v) => v != null).length;
  screens.show(`
    <div class="page narrow">
      <header class="page-head"><button class="back" data-a="hub">← Hub</button><h2>${esc(t.name)}</h2><span class="pill ${t.tour === 'MAJ' ? 'gold' : ''}">${TOURS[t.tour].name}</span></header>
      <section class="card">
        <div class="card-head"><h3>Round ${r + 1} of ${t.rounds}</h3>${r > 0 ? `<span class="pill">You: ${esc(lb.find((x) => x.human).pos)} (${fmtToPar(lb.find((x) => x.human).toPar)})</span>` : ''}</div>
        <p>${esc(course.name)} · ${esc(course.region)}, ${esc(course.countryName)} · Par ${course.par} · ${course.yards.toLocaleString()} yds</p>
        ${conditionsHtml(t.cond[r], app.settings.units)}
        <p class="muted small">Purse ${money(t.purse)} · Winner's share ${money(t.purse * 0.18)} · ${t.players.length} players${t.rounds === 4 ? ` · Cut after round 2: top ${CUT_SIZE} and ties` : ''}</p>
        <div class="actions left"><button class="btn primary big" data-a="playRound">${played ? `Resume at hole ${played + 1}` : `Tee off round ${r + 1}`}</button><button class="btn" data-a="simRound">Simulate this round</button></div>
      </section>
      ${r === 0 ? `<section class="card"><h3>Players to watch</h3><ul class="favs">${favs.map((p) => `<li data-a="pro" data-id="${p.id}"><b>${esc(p.name)}</b> <span class="muted">${esc(p.country)} · OVR ${p.ovr}</span></li>`).join('')}</ul></section>` : `<section class="card"><h3>Leaderboard</h3>${boardTable(t, app.nameOf, { limit: 10, full: true })}</section>`}
    </div>`);
}

export function roundSummary(screens, app, c, t, info) {
  const course = courseById(t.courseId);
  const hp = humanPlayer(t);
  const sc = hp.scores[info.round] || [];
  const tot = sc.reduce((a, b) => a + (b || 0), 0);
  const rel = tot - coursePar(course);
  const lb = leaderboard(t, { full: true });
  const me = lb.find((x) => x.human);
  const next = info.missedCut ? 'Missed the cut' : info.done ? 'Final round complete' : `Round ${info.round + 2} next`;
  screens.show(`
    <div class="page narrow">
      <header class="page-head"><h2>${esc(t.name)}</h2><span class="pill">Round ${info.round + 1}</span></header>
      <section class="card result-hero ${rel < 0 ? 'good' : rel > 0 ? 'bad' : ''}">
        <div class="rh-score"><b>${tot}</b><span class="${toParClass(rel)}">${fmtToPar(rel)}</span></div>
        <div><div class="rh-pos">${info.missedCut ? 'Missed cut' : `Position ${esc(me.pos)}`}</div><div class="muted">Total ${fmtToPar(me.toPar)} · ${esc(next)}</div></div>
      </section>
      ${scorecardHtml(course, sc, info.holeStats)}
      <section class="card"><h3>Leaderboard</h3>${boardTable(t, app.nameOf, { limit: 10, full: true })}</section>
      <div class="actions">${info.missedCut || info.done ? '<button class="btn primary big" data-a="finishEvent">See final results</button>' : `<button class="btn primary big" data-a="nextRound">On to round ${info.round + 2}</button><button class="btn" data-a="hub">Save & exit</button>`}</div>
    </div>`);
}

export function eventResults(screens, app, c, t, summary) {
  const hr = summary.humanResult;
  const win = hr && hr.pos === 1;
  const lvl = summary.levels ? `<div class="reward"><b>Level up!</b> +${summary.levels * 4} skill points</div>` : '';
  const ach = summary.newAchievements.map((k) => `<div class="reward gold"><b>${esc(ACHIEVEMENTS[k].name)}</b> ${esc(ACHIEVEMENTS[k].desc)}</div>`).join('');
  const rankMove = summary.rankAfter < summary.rankBefore ? `up ${summary.rankBefore - summary.rankAfter}` : summary.rankAfter > summary.rankBefore ? `down ${summary.rankAfter - summary.rankBefore}` : 'no change';
  const po = t.playoff ? `<p class="muted">Won in a playoff by ${esc(t.playoff.winner === 'you' ? 'you' : app.nameOf(t.playoff.winner))} after ${t.playoff.log.length} extra hole${t.playoff.log.length === 1 ? '' : 's'}.</p>` : '';
  const se = summary.seasonEnd;
  screens.show(`
    <div class="page narrow">
      <header class="page-head"><h2>${esc(t.name)}</h2><span class="pill">Final</span></header>
      <section class="card result-hero ${win ? 'win' : ''}">
        <div class="rh-score"><b>${hr ? esc(hr.posText) : ''}</b><span class="${toParClass(hr && hr.toPar)}">${hr ? fmtToPar(hr.toPar) : ''}</span></div>
        <div><div class="rh-pos">${win ? 'Champion!' : hr && hr.made ? `Finished ${esc(hr.posText)}` : 'Missed the cut'}</div>
        <div class="muted">${money(hr ? hr.money : 0)} · ${hr ? hr.pts.toFixed(1) : 0} ranking points · World rank #${summary.rankAfter} (${rankMove})</div></div>
      </section>
      <div class="rewards"><div class="reward"><b>+${summary.xp} XP</b></div>${lvl}${ach}</div>
      ${po}
      <section class="card"><h3>Final leaderboard</h3>${boardTable(t, app.nameOf, { limit: 15, full: true })}</section>
      ${se ? `<section class="card highlight"><h3>Season ${se.year} complete</h3><p>Season champion: <b>${esc(app.nameOf(se.champion))}</b>. Money leader: <b>${esc(app.nameOf(se.moneyLeader))}</b>. You finish the season ranked #${se.yourRank} with ${money(se.yourSeasonMoney)} earned.</p></section>` : ''}
      <div class="actions"><button class="btn primary big" data-a="hub">Continue</button></div>
    </div>`);
}

export function scorecardHtml(course, scores, holeStats = []) {
  const half = (from) => {
    const hs = course.holes.slice(from, from + 9);
    let sp = 0, ss = 0, any = false;
    const cells = hs.map((h, k) => {
      const i = from + k;
      const s = scores[i];
      sp += h.par;
      if (s != null) { ss += s; any = true; }
      const rel = s == null ? null : s - h.par;
      const cls = rel == null ? '' : rel <= -2 ? 'sc-eagle' : rel === -1 ? 'sc-birdie' : rel === 0 ? '' : rel === 1 ? 'sc-bogey' : 'sc-double';
      const sim = holeStats[i] && holeStats[i].simmed ? ' sim' : '';
      return `<td><span class="${cls}${sim}">${s ?? ''}</span></td>`;
    });
    return { hs, cells, sp, ss: any ? ss : '' };
  };
  const f = half(0), b = half(9);
  const total = (f.ss === '' && b.ss === '') ? '' : (f.ss || 0) + (b.ss || 0);
  const part = (h, label) => `<table class="tbl scard">
    <tr><th>Hole</th>${h.hs.map((x) => `<td>${x.n}</td>`).join('')}<td><b>${label}</b></td></tr>
    <tr><th>Yards</th>${h.hs.map((x) => `<td>${x.yards}</td>`).join('')}<td>${h.hs.reduce((s, x) => s + x.yards, 0)}</td></tr>
    <tr class="par"><th>Par</th>${h.hs.map((x) => `<td>${x.par}</td>`).join('')}<td>${h.sp}</td></tr>
    <tr class="score"><th>Score</th>${h.cells.join('')}<td><b>${h.ss}</b></td></tr></table>`;
  return `<section class="card scorecard"><div class="card-head"><h3>Scorecard</h3>${total !== '' ? `<span class="pill">Total ${total}</span>` : ''}</div><div class="table-wrap">${part(f, 'Out')}${part(b, 'In')}</div><p class="muted small">Circles: birdie or better · Squares: bogey or worse · Faded: simulated hole</p></section>`;
}

export function scorecardModal(course, scores, holeStats) {
  return modal(scorecardHtml(course, scores, holeStats), { wide: true });
}

export function boardModal(t, nameOf) {
  return modal(`<h3>${esc(t.name)} · Round ${t.round + 1}</h3>${boardTable(t, nameOf, { limit: 40 })}`, { wide: true });
}
