/* Gridiron Kings — menus (home, squad, packs, market, club, pack opening, results) and the match HUD
   (scorebug, play calling, receiver icons, kick meter, banners, touch buttons). */
(function () {
  'use strict';
  const FG = (window.FG = window.FG || {});
  const U = FG.util, D = FG.data, C = FG.cards, A = FG.audio, SV = FG.save, P = FG.plays;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const fmt = U.fmt, esc = U.esc;
  const sv = () => SV.data;
  const UI = { tab: 'home', clubFilter: 'ALL', clubSort: 'ovr', marketFilter: 'ALL', squadSide: 'O', shownCoins: 0, pickSlot: -1 };
  const RECV_COLORS = ['#ffd23f', '#35e0c2', '#ff6b81', '#7fb3ff', '#c792ff'];

  const ICON = {
    home: '<svg viewBox="0 0 24 24"><path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="currentColor"/></svg>',
    squad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M7 9v6M17 9v6"/></svg>',
    packs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12l1.5 4.5L18 21H6L4.5 7.5z"/><path d="M4.5 7.5h15"/><path d="m12 10.5 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" fill="currentColor" stroke="none"/></svg>',
    market: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/></svg>',
    club: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 20 6v6c0 5-3.5 7.8-8 9-4.5-1.2-8-4-8-9V6z"/><path d="m9 12 2 2 4-4.5" stroke-linecap="round"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8" stroke-linecap="round"/></svg>',
  };
  const TABS = [['home', 'Home'], ['squad', 'Squad'], ['packs', 'Packs'], ['market', 'Market'], ['club', 'Club']];
  const GROUPS = [['ALL', 'All'], ['QB', 'QB'], ['SK', 'RB · WR · TE'], ['OL', 'OL'], ['FR', 'DL · LB'], ['DB', 'CB · S'], ['K', 'K']];
  const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];

  /* ---------- shared bits ---------- */
  UI.userClub = function () {
    const s = sv(), kit = D.KITS[s.club.kit % D.KITS.length];
    const name = (s.club.name || 'Capital Kings').trim() || 'Capital Kings';
    const words = name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
    const short = (words.length > 1 ? words[0].slice(0, 1) + words[1].slice(0, 2) : name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3)).toUpperCase() || 'GK';
    return { id: name[0].toUpperCase(), name, short, c1: kit.c1, c2: kit.c2, helm: kit.helm, pants: kit.pants, crest: s.club.kit % 4 };
  };
  UI.nextOpponent = function () {
    const s = sv();
    return D.buildAITeam({ target: D.DIVISIONS[s.division].oppRating, seed: s.seed + s.stats.played * 131 + s.division * 17, avoidColor: UI.userClub().c1, exclude: s.lineup });
  };
  UI.calcReward = function (pf, pa, tds, mult) {
    const res = pf > pa ? 'w' : pf === pa ? 'd' : 'l';
    const lines = [[res === 'w' ? 'Win' : res === 'd' ? 'Tie' : 'Game played', res === 'w' ? 600 : res === 'd' ? 300 : 150]];
    if (tds > 0) lines.push([tds + (tds === 1 ? ' touchdown' : ' touchdowns'), tds * 80]);
    if (pa < 10) lines.push(['Defense held them under 10', 150]);
    const base = lines.reduce((a, l) => a + l[1], 0);
    return { res, lines, base, mult, total: Math.round((base * mult) / 10) * 10 };
  };

  const coinHtml = (n, cls) => `<span class="coins ${cls || ''}"><i class="coin"></i>${fmt(n)}</span>`;
  function toast(msg, kind) {
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 2400);
    setTimeout(() => t.remove(), 2900);
  }
  UI.toast = toast;

  UI.refreshTop = function (animate) {
    const s = sv(), el = $('#coins');
    const from = UI.shownCoins, to = s.coins;
    $('#divChip').textContent = 'DIV ' + s.division;
    if (!animate || from === to) { UI.shownCoins = to; el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / 700);
      UI.shownCoins = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      el.textContent = fmt(UI.shownCoins);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    $('#coinChip').classList.remove('bump'); void $('#coinChip').offsetWidth; $('#coinChip').classList.add('bump');
  };
  /* new signings take over from weaker starters at their own position */
  UI.autoUpgrade = function (ids) {
    const s = sv();
    const before = D.teamRating(s.lineup);
    ids.map((id) => D.byId[id]).sort((a, b) => b.ovr - a.ovr).forEach((p) => {
      if (s.lineup.includes(p.id)) return;
      let worst = -1, wv = 1e9;
      D.LINEUP.forEach((sl, i) => {
        if (sl.pos !== p.pos) return;
        const cur = D.byId[s.lineup[i]];
        const v = cur ? cur.ovr + D.posFit(cur.pos, sl.pos) : -1;
        if (v < wv) { wv = v; worst = i; }
      });
      if (worst >= 0 && p.ovr > wv) s.lineup[worst] = p.id;
    });
    const after = D.teamRating(s.lineup);
    if (after > before) { SV.commit(); return after - before; }
    return 0;
  };
  function chips(list, cur, act) {
    return `<div class="chips">${list.map(([k, l]) => `<button class="chipbtn${k === cur ? ' on' : ''}" data-act="${act}" data-v="${k}">${l}</button>`).join('')}</div>`;
  }

  /* ---------- navigation ---------- */
  UI.buildNav = function () {
    $('#nav').innerHTML = TABS.map(([k, l]) => `<button class="navbtn" data-act="tab" data-v="${k}" id="nav-${k}">${ICON[k]}<span>${l}</span><em class="dot" hidden></em></button>`).join('');
    $('#btnSettings').innerHTML = ICON.gear;
  };
  UI.show = function (tab) {
    UI.tab = tab || UI.tab;
    $$('.navbtn').forEach((b) => b.classList.toggle('on', b.dataset.v === UI.tab));
    const el = $('#screen');
    el.className = 'screen screen-' + UI.tab;
    el.innerHTML = { home: renderHome, squad: renderSquad, packs: renderPacks, market: renderMarket, club: renderClub }[UI.tab]();
    el.scrollTop = 0;
    const s = sv();
    $('#nav-packs .dot').hidden = Object.values(s.packs).reduce((a, b) => a + b, 0) === 0;
    $('#nav-club .dot').hidden = s.newIds.length === 0 || UI.tab === 'club';
    if (UI.tab === 'club' && s.newIds.length) { UI._newShown = s.newIds.slice(); s.newIds = []; SV.commit(); }
    UI.refreshTop();
  };

  /* ---------- home ---------- */
  function renderHome() {
    const s = sv(), me = UI.userClub(), opp = UI.nextOpponent(), div = D.DIVISIONS[s.division];
    const rating = D.teamRating(s.lineup), off = D.unitRating(s.lineup, 'O'), def = D.unitRating(s.lineup, 'D');
    const stars = s.lineup.map((id) => D.byId[id]).sort((a, b) => b.ovr - a.ovr).slice(0, 3);
    const packN = Object.values(s.packs).reduce((a, b) => a + b, 0);
    const best = UI.calcReward(28, 7, 4, div.mult).total;
    const oppClub = D.club(opp.club);
    const pips = Array.from({ length: div.ptsToPromote }, (_, i) => `<i class="${i < s.divPts ? 'on' : ''}"></i>`).join('');
    const order = [stars[1], stars[0], stars[2]].filter(Boolean);
    return `
    <div class="home">
      <section class="matchday">
        <p class="eyebrow">Division ${s.division} · Game ${s.stats.played + 1}</p>
        <h1>Game day</h1>
        <div class="vs">
          <div class="vs-team">${C.crest(me, 'big')}<h3>${esc(me.name)}</h3><div class="ovr"><b>${rating}</b> overall</div><div class="units">OFF ${off} · DEF ${def}</div></div>
          <div class="vs-mid">vs</div>
          <div class="vs-team">${C.crest(oppClub, 'big')}<h3>${esc(opp.name)}</h3><div class="ovr"><b>${opp.rating}</b> overall</div><div class="units">OFF ${D.unitRating(opp.slots, 'O')} · DEF ${D.unitRating(opp.slots, 'D')}</div></div>
        </div>
        <div class="match-actions">
          <button class="btn btn-play" data-act="play-division">Play game</button>
          <button class="btn btn-ghost" data-act="friendly">Exhibition</button>
        </div>
        <p class="hint">A big win here pays up to ${coinHtml(best)} and 3 division points.</p>
        <div class="divbar">
          <div class="divbar-head"><b>Division ${s.division}</b><span>${s.division > 1 ? `${s.divPts} / ${div.ptsToPromote} points to reach Division ${s.division - 1}` : `${s.divPts} / ${div.ptsToPromote} points to the next title reward`}</span></div>
          <div class="pips">${pips}</div>
          <div class="record"><span><b>${s.stats.w}</b> won</span><span><b>${s.stats.d}</b> tied</span><span><b>${s.stats.l}</b> lost</span><span><b>${s.stats.tds || 0}</b> touchdowns</span></div>
        </div>
      </section>
      <section class="stars">
        <p class="eyebrow">Your best players</p>
        <div class="fan">${order.map((p, i) => C.card(p, { cls: 'fan-' + i, kit: [me.c1, me.c2] })).join('')}</div>
        ${packN ? `<button class="packnote" data-act="tab" data-v="packs"><b>${packN} ${packN === 1 ? 'pack' : 'packs'} waiting</b><span>Open ${packN === 1 ? 'it' : 'them'} in Packs</span></button>` : `<button class="packnote quiet" data-act="tab" data-v="packs"><b>Build your Ultimate Team</b><span>Spend coins on packs and players</span></button>`}
      </section>
    </div>`;
  }

  /* ---------- squad ---------- */
  function renderSquad() {
    const s = sv(), side = UI.squadSide;
    const board = D.LINEUP.map((sl, i) => ({ sl, i }))
      .filter(({ sl }) => (side === 'O' ? sl.side !== 'D' : sl.side === 'D'))
      .map(({ sl, i }) => `<button class="slot" style="top:${sl.uy}%;left:${sl.ux}%" data-act="slot" data-i="${i}" aria-label="${D.ROLE_NAME[sl.role]}">${C.token(D.byId[s.lineup[i]], sl)}</button>`).join('');
    const bench = s.owned.filter((id) => !s.lineup.includes(id)).map((id) => D.byId[id]).sort((a, b) => b.ovr - a.ovr);
    return `
    <div class="squad">
      <section class="squad-side">
        <p class="eyebrow">Ultimate Team</p>
        <h1>Lineup</h1>
        <div class="ratings"><div><b>${D.teamRating(s.lineup)}</b><span>Overall</span></div><div><b>${D.unitRating(s.lineup, 'O')}</b><span>Offense</span></div><div><b>${D.unitRating(s.lineup, 'D')}</b><span>Defense</span></div></div>
        ${chips([['O', 'Offense + kicker'], ['D', 'Defense']], side, 'squad-side')}
        <button class="btn btn-ghost wide" data-act="best-xi">Pick my best lineup</button>
        <p class="hint">Tap a player on the board to swap him. Players lose rating out of position, so keep receivers at receiver and linemen on the line.</p>
        <p class="label">Reserves (${bench.length})</p>
        <div class="bench">${bench.slice(0, 24).map((p) => `<button class="benchrow" data-act="player" data-pid="${p.id}"><span class="mini t-${p.tier}">${p.ovr}</span><b>${esc(p.name)}</b><i>${p.pos}</i></button>`).join('') || '<p class="hint">No reserves yet. Open packs to grow your roster.</p>'}</div>
      </section>
      <section class="boardwrap"><div class="board board-${side}"><i class="los"></i>${board}</div></section>
    </div>`;
  }
  function openPicker(i) {
    const s = sv(), slot = D.LINEUP[i];
    UI.pickSlot = i;
    const cur = s.lineup[i];
    const list = s.owned.map((id) => D.byId[id]).map((p) => ({ p, fit: D.posFit(p.pos, slot.pos) })).sort((a, b) => b.p.ovr + b.fit - (a.p.ovr + a.fit)).slice(0, 40);
    const rows = list.map(({ p, fit }) => {
      const inXI = s.lineup.indexOf(p.id);
      const keys = D.CARD_STATS[p.pos].slice(0, 3);
      return `<button class="prow${p.id === cur ? ' cur' : ''}" data-act="assign" data-pid="${p.id}">
        <span class="prow-av t-${p.tier}">${C.avatar(p)}</span>
        <span class="prow-main"><b>${esc(p.name)}</b><i>${p.pos} · #${p.num}${inXI >= 0 && p.id !== cur ? ' · starting' : ''}${p.id === cur ? ' · playing here' : ''}</i></span>
        <span class="prow-stats">${keys.map(([k, l]) => `<em><b>${p.st[k]}</b>${l}</em>`).join('')}</span>
        <span class="prow-ovr ${fit === 0 ? 'fit-ok' : fit >= -6 ? 'fit-near' : 'fit-bad'}"><b>${p.ovr + fit}</b>${fit ? `<i>${fit}</i>` : ''}</span>
      </button>`;
    }).join('');
    UI.modal(`<p class="eyebrow">${D.POS_NAME[slot.pos]}</p><h2>Choose your ${D.ROLE_NAME[slot.role]}</h2><div class="plist">${rows}</div>`, 'sheet');
  }

  /* ---------- packs ---------- */
  function packArt(pack, extra) {
    return `<div class="pack pk-${pack.id} ${extra || ''}"><div class="pack-crimp"></div><div class="pack-face"><span class="pack-n">${pack.cards}</span><b>${pack.name.split(' ')[0]}</b><i>pack</i></div><div class="pack-crimp b"></div></div>`;
  }
  function oddsList(pack) {
    const row = (o) => Object.keys(o).map((k) => `<li class="t-${k}"><span>${D.TIER_BY_ID[k].name}</span><b>${o[k]}%</b></li>`).join('');
    return `<ul class="odds">${row(pack.odds)}</ul>` + (pack.guarantee ? `<p class="odds-note">Guaranteed card</p><ul class="odds">${row(pack.guarantee)}</ul>` : '');
  }
  function renderPacks() {
    const s = sv();
    const mine = D.PACKS.filter((p) => s.packs[p.id] > 0);
    return `
    <div class="store">
      <header class="pagehead"><div><p class="eyebrow">Ultimate Team</p><h1>Packs</h1></div><p class="hint">Coins come from playing games. Nothing here costs real money.</p></header>
      ${mine.length ? `<section class="mine"><p class="label">Your unopened packs</p><div class="mine-row">${mine.map((p) => `<button class="minepack" data-act="open-pack" data-v="${p.id}">${packArt(p, 'small')}<span><b>${p.name}</b><i>${s.packs[p.id]} to open</i></span><em class="btn btn-play sm">Open</em></button>`).join('')}</div></section>` : ''}
      <section class="packgrid">
        ${D.PACKS.map((p) => `
          <article class="packcard">
            ${packArt(p)}
            <h3>${p.name}</h3>
            <p>${p.blurb}</p>
            <button class="btn btn-buy${s.coins < p.price ? ' poor' : ''}" data-act="buy-pack" data-v="${p.id}">${coinHtml(p.price)}</button>
            <details><summary>Pack odds</summary>${oddsList(p)}</details>
          </article>`).join('')}
      </section>
    </div>`;
  }
  function buyPack(id) {
    const s = sv(), pack = D.PACK_BY_ID[id];
    if (s.coins < pack.price) { A.error(); toast(`You need ${fmt(pack.price - s.coins)} more coins. Win games to earn them.`, 'warn'); return; }
    s.coins -= pack.price; s.packs[id] = (s.packs[id] || 0) + 1;
    A.coin(); UI.refreshTop(true);
    openPack(id);
  }
  function openPack(id) {
    const s = sv(), pack = D.PACK_BY_ID[id];
    if (!(s.packs[id] > 0)) return;
    s.packs[id]--;
    let dupCoins = 0;
    const got = D.openPack(id).map((p) => {
      if (s.owned.includes(p.id)) { const v = D.sellPrice(p.ovr); dupCoins += v; return { p, dup: v }; }
      s.owned.push(p.id); s.newIds.push(p.id);
      return { p, dup: 0 };
    });
    s.coins += dupCoins;
    SV.commit();
    UI._upgrade = UI.autoUpgrade(got.filter((g) => !g.dup).map((g) => g.p.id));
    const best = got[got.length - 1].p;
    const o = $('#overlay');
    o.className = 'overlay po'; o.hidden = false;
    o.innerHTML = `<div class="po-rays t-${best.tier}"></div>
      <div class="po-stage"><button class="po-pack" data-act="po-open" aria-label="Open ${pack.name}">${packArt(pack, 'huge')}</button><p class="po-hint">Tap the pack to open it</p></div>`;
    UI._po = { got, dupCoins, pack, flipped: 0, opened: false };
  }
  function poOpen() {
    const st = UI._po; if (!st || st.opened) return;
    st.opened = true;
    const o = $('#overlay');
    A.packShake();
    $('.po-pack', o).classList.add('shake');
    $('.po-hint', o).textContent = '';
    setTimeout(() => {
      A.packBurst();
      o.classList.add('burst');
      $('.po-stage', o).innerHTML = `<div class="po-cards n${st.got.length}">${st.got.map((g, i) => `
        <button class="flip" data-act="po-flip" data-i="${i}" style="--d:${i * 70}ms" aria-label="Reveal player ${i + 1}">
          <div class="flip-in"><div class="flip-back"><span>GK</span></div><div class="flip-front">${C.card(g.p, { tag: g.dup ? `Duplicate ${coinHtml(g.dup)}` : 'New', cls: g.dup ? 'is-dup' : 'is-new' })}</div></div>
        </button>`).join('')}</div>
        <div class="po-actions"><button class="btn btn-ghost" data-act="po-all">Reveal all</button><button class="btn btn-play" data-act="po-done" hidden>Continue</button></div>`;
    }, 950);
  }
  function poFlip(i) {
    const st = UI._po, o = $('#overlay');
    const el = $(`.flip[data-i="${i}"]`, o);
    if (!el || el.classList.contains('on')) return;
    el.classList.add('on');
    const tier = D.TIER_BY_ID[st.got[i].p.tier];
    A.flip(); setTimeout(() => A.reveal(tier.rank), 160);
    el.classList.add('glow-' + tier.id);
    st.flipped++;
    if (st.flipped >= st.got.length) {
      $('[data-act="po-all"]', o).hidden = true;
      $('[data-act="po-done"]', o).hidden = false;
      if (st.dupCoins) toast(`Duplicates swapped for ${fmt(st.dupCoins)} coins`);
      if (UI._upgrade) setTimeout(() => toast(`New starters in your lineup: overall +${UI._upgrade}`), st.dupCoins ? 900 : 0);
    }
  }
  function poAll() { const st = UI._po; st.got.forEach((g, i) => setTimeout(() => poFlip(i), i * 240)); }
  function poDone() {
    $('#overlay').hidden = true; $('#overlay').innerHTML = ''; $('#overlay').className = 'overlay';
    UI._po = null;
    UI.refreshTop(true);
    if (UI._afterPack) { const f = UI._afterPack; UI._afterPack = null; f(); } else UI.show();
  }

  /* ---------- market ---------- */
  function renderMarket() {
    const s = sv();
    const stock = D.marketStock(s.seed + s.market.seed, s.owned).filter((p) => UI.marketFilter === 'ALL' || D.POS_GROUP[p.pos] === UI.marketFilter).sort((a, b) => b.ovr - a.ovr);
    return `
    <div class="market">
      <header class="pagehead"><div><p class="eyebrow">Ultimate Team</p><h1>Player market</h1></div>
        <div class="pagehead-r"><p class="hint">New players arrive after every game.</p><button class="btn btn-ghost sm" data-act="market-refresh">Refresh now ${coinHtml(250)}</button></div></header>
      ${chips(GROUPS, UI.marketFilter, 'market-filter')}
      <div class="cardgrid">${stock.map((p) => { const price = D.buyPrice(p.ovr); return `<div class="buycell">${C.card(p, { attrs: 'data-act="player"' })}<button class="btn btn-buy${s.coins < price ? ' poor' : ''}" data-act="buy-player" data-pid="${p.id}">${coinHtml(price)}</button></div>`; }).join('') || '<p class="hint">No players at this position right now. Play a game or refresh.</p>'}</div>
    </div>`;
  }
  function buyPlayer(pid) {
    const s = sv(), p = D.byId[pid], price = D.buyPrice(p.ovr);
    if (s.owned.includes(pid)) return;
    if (s.coins < price) { A.error(); toast(`You need ${fmt(price - s.coins)} more coins for ${p.name}.`, 'warn'); return; }
    s.coins -= price; s.owned.push(pid); s.newIds.push(pid);
    SV.commit(); A.coin(); A.reveal(D.TIER_BY_ID[p.tier].rank);
    toast(UI.autoUpgrade([pid]) ? `${p.name} signed and starting` : `${p.name} signed. He's on your bench for now.`);
    UI.closeModal(); UI.show(); UI.refreshTop(true);
  }

  /* ---------- club ---------- */
  function renderClub() {
    const s = sv();
    const fresh = new Set((UI._newShown || []).concat(s.newIds));
    const list = s.owned.map((id) => D.byId[id]).filter((p) => UI.clubFilter === 'ALL' || D.POS_GROUP[p.pos] === UI.clubFilter);
    list.sort(UI.clubSort === 'pos' ? (a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || b.ovr - a.ovr : (a, b) => b.ovr - a.ovr);
    const value = s.owned.reduce((a, id) => a + D.sellPrice(D.byId[id].ovr), 0);
    return `
    <div class="club">
      <header class="pagehead"><div><p class="eyebrow">Ultimate Team</p><h1>My roster</h1></div><p class="hint">${s.owned.length} of ${D.players.length} players collected · roster value ${coinHtml(value)}</p></header>
      <div class="filters">${chips(GROUPS, UI.clubFilter, 'club-filter')}${chips([['ovr', 'By rating'], ['pos', 'By position']], UI.clubSort, 'club-sort')}</div>
      <div class="cardgrid">${list.map((p) => C.card(p, { attrs: 'data-act="player"', tag: fresh.has(p.id) ? 'New' : s.lineup.includes(p.id) ? 'Starter' : '', cls: fresh.has(p.id) ? 'is-new' : 'is-xi' })).join('')}</div>
    </div>`;
  }
  function playerModal(pid) {
    const s = sv(), p = D.byId[pid];
    const owned = s.owned.includes(pid), inXI = s.lineup.includes(pid);
    const club = D.club(p.club);
    const bars = D.CARD_STATS[p.pos].map(([k, l]) => `<div class="bar"><span>${l}</span><div><i style="width:${p.st[k]}%" class="${p.st[k] >= 80 ? 'hi' : p.st[k] >= 65 ? 'mid' : 'lo'}"></i></div><b>${p.st[k]}</b></div>`).join('');
    let actions;
    if (owned) {
      const sell = D.sellPrice(p.ovr);
      actions = (inXI ? '<p class="hint">In your starting lineup.</p>' : '<p class="hint">On your bench. Swap him in from the Squad screen.</p>') +
        (s.owned.length > 23 ? `<button class="btn btn-ghost" data-act="sell" data-pid="${pid}">Sell for ${coinHtml(sell)}</button>` : '<p class="hint">You need at least 23 players, so he can\'t be sold yet.</p>');
    } else {
      const price = D.buyPrice(p.ovr);
      actions = `<button class="btn btn-buy${s.coins < price ? ' poor' : ''}" data-act="buy-player" data-pid="${pid}">Buy for ${coinHtml(price)}</button>`;
    }
    UI.modal(`<div class="pdetail">${C.card(p, { size: 'lg' })}
      <div class="pdetail-info"><p class="eyebrow">${D.TIER_BY_ID[p.tier].name} · ${D.POS_NAME[p.pos]}</p><h2>${esc(p.first)} ${esc(p.last)}</h2>
      <p class="pdetail-meta"><b>#${p.num}</b><span class="sep"></span>${C.crest(club)} ${club.name}</p>
      <div class="bars">${bars}</div><div class="pdetail-actions">${actions}</div></div></div>`, 'wide');
  }
  function sellPlayer(pid, btn) {
    const s = sv(), p = D.byId[pid];
    if (!btn.dataset.sure) { btn.dataset.sure = '1'; btn.innerHTML = `Tap again to sell for ${coinHtml(D.sellPrice(p.ovr))}`; btn.classList.add('danger'); return; }
    if (s.owned.length <= 23) return;
    s.owned = s.owned.filter((id) => id !== pid);
    const i = s.lineup.indexOf(pid);
    if (i >= 0) {
      const slot = D.LINEUP[i];
      const pool = s.owned.filter((id) => !s.lineup.includes(id)).map((id) => D.byId[id]).sort((a, b) => b.ovr + D.posFit(b.pos, slot.pos) - (a.ovr + D.posFit(a.pos, slot.pos)));
      s.lineup[i] = pool[0].id;
    }
    s.coins += D.sellPrice(p.ovr);
    SV.commit(); A.coin();
    toast(`${p.name} sold for ${fmt(D.sellPrice(p.ovr))} coins`);
    UI.closeModal(); UI.show(); UI.refreshTop(true);
  }

  /* ---------- modals ---------- */
  UI.modal = function (html, cls) {
    const o = $('#overlay');
    o.className = 'overlay'; o.hidden = false;
    o.innerHTML = `<div class="modal-wrap" data-act="close-modal-bg"><div class="modal ${cls || ''}" role="dialog" aria-modal="true"><button class="modal-x" data-act="close-modal" aria-label="Close">×</button>${html}</div></div>`;
  };
  UI.closeModal = function () {
    const o = $('#overlay');
    if (o.classList.contains('po') || o.classList.contains('locked')) return;
    o.hidden = true; o.innerHTML = '';
  };
  function friendlyModal() {
    const opts = [['easy', 'Rookie', 'A gentle warm-up game'], ['medium', 'Pro', 'A fair fight'], ['hard', 'All-Pro', 'They blitz and they finish'], ['legend', 'Hall of Fame', 'The best players in the league']];
    UI.modal(`<p class="eyebrow">Exhibition</p><h2>Pick a difficulty</h2><p class="hint">Exhibition games pay fewer coins and don't count for your division.</p>
      <div class="optlist">${opts.map(([k, l, d]) => `<button class="opt" data-act="play-friendly" data-v="${k}"><b>${l}</b><span>${d}</span></button>`).join('')}</div>`);
  }
  function settingsModal() {
    const s = sv(), st = s.settings;
    const seg = (act, cur, list) => `<div class="chips">${list.map(([v, l]) => `<button class="chipbtn${String(v) === String(cur) ? ' on' : ''}" data-act="${act}" data-v="${v}">${l}</button>`).join('')}</div>`;
    UI.modal(`<p class="eyebrow">Settings</p><h2>Team and game</h2>
      <label class="field" for="clubName">Team name<input id="clubName" maxlength="20" value="${esc(s.club.name)}" autocomplete="off"></label>
      <p class="label">Uniform</p>
      <div class="kits">${D.KITS.map((k, i) => `<button class="kit${i === s.club.kit ? ' on' : ''}" data-act="set-kit" data-v="${i}" aria-label="${k.name} uniform" style="--k1:${k.c1};--k2:${k.c2};--k3:${k.helm}"><i></i></button>`).join('')}</div>
      <p class="label">Quarter length</p>${seg('set-qtr', st.qtr, [[2, '2 min'], [3, '3 min'], [4, '4 min']])}
      <p class="label">Sound</p>${seg('set-sound', st.sound ? 1 : 0, [[1, 'On'], [0, 'Off']])}
      <p class="label">Graphics</p>${seg('set-quality', st.quality, [[1, 'High'], [0, 'Fast']])}
      <p class="label">Auto-switch defender</p>${seg('set-auto', st.autoSwitch ? 1 : 0, [[1, 'On'], [0, 'Off']])}
      <div class="row-btns"><button class="btn btn-ghost" data-act="howto">How to play</button><button class="btn btn-ghost" data-act="reset">Start a new team</button></div>`);
  }
  UI.howTo = function (inMatch) {
    const touch = FG.input.usedTouch || matchMedia('(pointer: coarse)').matches;
    const rows = touch
      ? [['Play call', 'Tap a play card. Each card shows where everyone runs'], ['Snap', 'Tap SNAP to start the play'], ['Throw', 'Tap a receiver\'s bubble on the field, or THROW for the most open man'], ['Run', 'Steer with your left thumb. Push to the edge to sprint. JUKE and SPIN dodge tacklers'], ['Defense', 'TACKLE dives at the ball carrier. SWITCH jumps to the defender nearest the ball']]
      : [['1 – 8', 'Pick a play on the play-call screen'], ['Space', 'Snap the ball. Throw to the most open receiver. Spin when running. Tackle on defense'], ['1 – 5', 'Throw to that receiver (the colored bubbles)'], ['WASD or arrows', 'Move. Hold Shift to sprint'], ['X', 'Juke when running. Switch defender on defense'], ['C', 'Throw the ball away'], ['Esc', 'Pause']];
    UI.modal(`<p class="eyebrow">How to play</p><h2>Controls</h2><dl class="howto">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      <p class="hint">You always attack up the field. Four downs to gain 10 yards. A touchdown is 6 points plus an automatic extra point; a field goal is 3. If you leave the stick alone, your player runs on his own.</p>
      ${inMatch ? '<button class="btn btn-play" data-act="resume">Back to the game</button>' : ''}`);
  };
  UI.onboard = function () {
    const s = sv();
    const o = $('#overlay');
    o.className = 'overlay locked'; o.hidden = false;
    o.innerHTML = `<div class="modal-wrap"><div class="modal welcome"><p class="eyebrow">Welcome, coach</p><h2>Name your team</h2>
      <label class="field" for="clubName">Team name<input id="clubName" maxlength="20" value="${esc(s.club.name)}" autocomplete="off"></label>
      <p class="label">Pick your uniform</p>
      <div class="kits">${D.KITS.map((k, i) => `<button class="kit${i === s.club.kit ? ' on' : ''}" data-act="set-kit" data-v="${i}" aria-label="${k.name} uniform" style="--k1:${k.c1};--k2:${k.c2};--k3:${k.helm}"><i></i></button>`).join('')}</div>
      <p class="hint">You start with a full roster of Bronze players, ${fmt(s.coins)} coins and three free Rookie Packs. Win games, earn coins, open packs and build your Ultimate Team.</p>
      <button class="btn btn-play wide" data-act="onboard-go">Open my first pack</button></div></div>`;
  };

  /* ---------- results ---------- */
  UI.showResult = function (r) {
    const me = UI.userClub();
    const head = r.reward.res === 'w' ? 'Victory' : r.reward.res === 'd' ? 'Tie game' : 'Defeat';
    const s0 = r.stats[0], s1 = r.stats[1];
    const row = (label, a, b) => `<tr><td>${a}</td><th>${label}</th><td>${b}</td></tr>`;
    const tot = (s) => Math.round(s.passYds + s.rushYds);
    const scoring = r.scoring.map((g) => `<li class="${g.team === 0 ? 'h' : 'a'}"><b>Q${g.q}</b> ${esc(g.name)} · ${esc(g.kind)}</li>`).join('');
    const o = $('#overlay');
    o.className = 'overlay locked'; o.hidden = false;
    o.innerHTML = `<div class="modal-wrap"><div class="modal result res-${r.reward.res}">
      <p class="eyebrow">${r.mode === 'division' ? 'Division ' + r.divisionBefore : 'Exhibition'} · Final</p>
      <h2>${head}</h2>
      <div class="result-score"><span>${C.crest(me)} ${esc(me.name)}</span><b>${r.score[0]} – ${r.score[1]}</b><span>${esc(r.opp.name)} ${C.crest(D.club(r.opp.club))}</span></div>
      ${scoring ? `<ul class="result-goals">${scoring}</ul>` : ''}
      <div class="result-cols">
        <table class="result-stats">${row('Total yards', tot(s0), tot(s1))}${row('Passing', Math.round(s0.passYds), Math.round(s1.passYds))}${row('Rushing', Math.round(s0.rushYds), Math.round(s1.rushYds))}${row('Completions', s0.comp + '/' + s0.att, s1.comp + '/' + s1.att)}${row('First downs', s0.firstDowns, s1.firstDowns)}${row('Turnovers', s0.turnovers, s1.turnovers)}${row('Sacks', s0.sacks, s1.sacks)}</table>
        <div class="rewards">
          ${r.reward.lines.map(([l, c]) => `<div><span>${l}</span>${coinHtml(c)}</div>`).join('')}
          ${r.reward.mult !== 1 ? `<div><span>${r.mode === 'division' ? 'Division bonus' : 'Exhibition rate'}</span><b>×${r.reward.mult.toFixed(2)}</b></div>` : ''}
          <div class="total"><span>Coins earned</span>${coinHtml(r.reward.total)}</div>
          ${r.mode === 'division' ? `<div class="pts"><span>Division points</span><b>+${r.pts}</b></div>` : ''}
        </div>
      </div>
      ${r.promoted ? `<div class="promo"><b>${r.promoted.title}</b><span>${r.promoted.text}</span></div>` : ''}
      <button class="btn btn-play wide" data-act="result-continue">Continue</button></div></div>`;
  };

  /* ---------- play art ---------- */
  function sx(s) { return 50 + U.clamp(s, -19, 19) * 2.25; }
  function sy(f) { return 44 - f * 1.3; }
  function polyline(pts) { return pts.map(([f, s]) => `${sx(s).toFixed(1)},${Math.max(3, sy(f)).toFixed(1)}`).join(' '); }
  function offArt(pl) {
    const F = P.FORMS[pl.form];
    let g = '<line x1="2" y1="44" x2="98" y2="44" class="art-los"/>';
    const routes = [];
    P.RECV_ORDER.forEach((role, i) => {
      const rt = pl.routes && pl.routes[role];
      if (!rt || rt === 'block' || pl.type === 'run') return;
      const [f0, s0] = F[role], side = role === 'RB' ? 1 : Math.sign(s0) || 1;
      const pts = [[f0, s0]].concat(P.ROUTES[rt].pts.map(([f, o]) => [f0 + f, s0 + o * side]));
      routes.push(`<polyline points="${polyline(pts)}" stroke="${RECV_COLORS[i]}" marker-end="url(#ah${i})"/>`);
    });
    if (pl.type === 'run') {
      const [f0, s0] = F.RB;
      routes.push(`<polyline points="${polyline([[f0, s0], [-1.5, pl.hole * 0.5], [6, pl.hole]])}" stroke="#ffd23f" stroke-width="2.4" marker-end="url(#ah0)"/>`);
    }
    if (pl.special) {
      const kick = pl.id === 'fg';
      routes.push(kick ? `<path d="M${sx(-1.5)} ${sy(-9)} Q50 -10 ${sx(0)} 3" stroke="#ffd23f" stroke-dasharray="3 2"/>` : `<path d="M${sx(0)} ${sy(-14)} Q50 -30 ${sx(4)} 3" stroke="#ffd23f" stroke-dasharray="3 2"/>`);
    }
    const dots = Object.keys(F).filter((r) => r !== 'K' || pl.special).filter((r) => !(pl.special && r === 'RB')).map((r) => {
      const [f, s] = F[r], i = P.RECV_ORDER.indexOf(r);
      const col = i >= 0 && pl.routes && pl.routes[r] && pl.routes[r] !== 'block' && pl.type !== 'run' ? RECV_COLORS[i] : r === 'QB' ? '#ffffff' : r === 'K' ? '#ffd23f' : '#c9d3e8';
      return ['LT', 'LG', 'C', 'RG', 'RT'].includes(r) ? `<rect x="${sx(s) - 2}" y="${sy(f) - 2}" width="4" height="4" fill="${col}"/>` : `<circle cx="${sx(s)}" cy="${sy(f)}" r="2.3" fill="${col}"/>`;
    }).join('');
    return artSvg(g + `<g fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${routes.join('')}</g>` + dots);
  }
  function defArt(pl) {
    const F = P.FORMS.gun, al = Object.assign({}, P.DFORM, pl.align || {});
    let g = '<line x1="2" y1="44" x2="98" y2="44" class="art-los"/>';
    const zones = [], marks = [], lines = [];
    const rush = new Set(pl.rush);
    Object.keys(P.DFORM).forEach((role) => {
      const a = al[role], base = P.DFORM[role];
      const f = a[0];
      let s = a.length > 1 ? a[1] : base[1];
      if (typeof s === 'string') s = F[s] ? F[s][1] : 0;
      const x = sx(s), y = sy(f);
      const c = pl.cover[role];
      if (rush.has(role)) lines.push(`<line x1="${x}" y1="${y}" x2="${(x + 50) / 2}" y2="${sy(-4)}" stroke="#ff6b81" marker-end="url(#ahR)"/>`);
      else if (c && c[0] === 'zone') { const z = P.ZONES[c[1]]; zones.push(`<ellipse cx="${sx(z[1])}" cy="${Math.max(6, sy(z[0]))}" rx="${z[3] ? 13 : 9}" ry="${z[3] ? 6 : 4.5}" class="art-zone${z[3] ? ' deep' : ''}"/>`); lines.push(`<line x1="${x}" y1="${y}" x2="${sx(z[1])}" y2="${Math.max(6, sy(z[0]))}" stroke="#9fc3ff" stroke-dasharray="2 1.5"/>`); }
      else if (c && c[0] === 'man') { const t = F[c[1]]; lines.push(`<line x1="${x}" y1="${y}" x2="${sx(t[1])}" y2="${sy(t[0]) - 1}" stroke="#ffd23f" stroke-dasharray="1.5 1.5"/>`); }
      marks.push(`<path d="M${x - 2} ${y - 2}L${x + 2} ${y + 2}M${x + 2} ${y - 2}L${x - 2} ${y + 2}" stroke="#ffffff" stroke-width="1.5"/>`);
    });
    const off = ['X', 'Z', 'SL', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'QB', 'RB'].map((r) => `<circle cx="${sx(F[r][1])}" cy="${sy(F[r][0])}" r="1.8" fill="none" stroke="#7e8db0" stroke-width="1"/>`).join('');
    return artSvg(g + zones.join('') + off + `<g fill="none" stroke-width="1.3" stroke-linecap="round">${lines.join('')}</g>` + marks.join(''));
  }
  function artSvg(inner) {
    const heads = RECV_COLORS.map((c, i) => `<marker id="ah${i}" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="3.4" markerHeight="3.4" orient="auto"><path d="M0 0L6 3L0 6z" fill="${c}"/></marker>`).join('') + `<marker id="ahR" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="3.4" markerHeight="3.4" orient="auto"><path d="M0 0L6 3L0 6z" fill="#ff6b81"/></marker>`;
    return `<svg class="art" viewBox="0 0 100 56" aria-hidden="true"><defs>${heads}</defs>${inner}</svg>`;
  }

  /* ---------- match HUD ---------- */
  const H = { m: null };
  UI.hudStart = function (m, kits) {
    H.m = m; H.kits = kits; H.cache = {};
    $('#hud').hidden = false;
    $('#sbHome').innerHTML = `<i style="background:${kits[0].c1}"></i><span>${esc(m.teams[0].short)}</span><b id="sbS0">0</b>`;
    $('#sbAway').innerHTML = `<i style="background:${kits[1].c1}"></i><span>${esc(m.teams[1].short)}</span><b id="sbS1">0</b>`;
    $('#banner').hidden = true; $('#bigFx').hidden = true; $('#kick').hidden = true; $('#playcall').hidden = true; $('#snapPrompt').hidden = true; $('#resultLine').hidden = true;
    const touch = matchMedia('(pointer: coarse)').matches || FG.input.usedTouch;
    H.touch = touch;
    $('#touch').hidden = !touch;
    $('#keysHelp').hidden = touch;
    $('#recv').innerHTML = P.RECV_ORDER.map((r, i) => `<button class="rcv" data-act="throw" data-i="${i}" style="--c:${RECV_COLORS[i]}" hidden><b>${i + 1}</b></button>`).join('');
  };
  UI.hudStop = function () { $('#hud').hidden = true; H.m = null; };
  UI.banner = function (text, sub, ms) {
    const b = $('#banner');
    b.innerHTML = `<b>${esc(text)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
    b.hidden = false; b.classList.remove('in'); void b.offsetWidth; b.classList.add('in');
    clearTimeout(H.bT); H.bT = setTimeout(() => { b.hidden = true; }, ms || 1700);
  };
  UI.bigFx = function (text, sub, good) {
    UI.clearResult();
    const g = $('#bigFx');
    g.innerHTML = `<b>${esc(text)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
    g.className = 'goalfx ' + (good ? 'mine' : 'theirs');
    g.hidden = false; void g.offsetWidth; g.classList.add('in');
    clearTimeout(H.gT); H.gT = setTimeout(() => { g.hidden = true; }, 3200);
  };
  UI.resultLine = function (r) {
    const el = $('#resultLine');
    el.innerHTML = `<b>${esc(r.text)}</b>${r.sub ? `<span>${esc(r.sub)}</span>` : ''}`;
    el.className = 'resultline' + (r.firstDown ? ' fd' : '');
    el.hidden = false; void el.offsetWidth; el.classList.add('in');
    clearTimeout(H.rT); H.rT = setTimeout(() => { el.hidden = true; }, 2100);
  };
  UI.clearResult = function () { clearTimeout(H.rT); $('#resultLine').hidden = true; };
  UI.showPlaycall = function (m) {
    const off = m.userOnOffense();
    const list = off ? P.OFF.concat(m.down === 4 ? P.SPECIAL : []) : P.DEF;
    const fgInfo = m.down === 4 ? ` · Field goal from ${m.fgDistance()} yards${m.fgDistance() > m.fgRange() ? ' (out of range)' : ''}` : '';
    const el = $('#playcall');
    el.innerHTML = `<div class="pc-head"><p class="eyebrow">${esc(m.downText())} · Ball on ${esc(m.spotText())}${esc(fgInfo)}</p><h2>${off ? 'Call your play' : 'Call your defense'}</h2></div>
      <div class="pc-grid${list.length > 8 ? ' ten' : ''}">${list.map((pl, i) => `<button class="pcard${pl.special ? ' special' : ''}" data-act="call" data-v="${pl.id}">${off ? offArt(pl) : defArt(pl)}<b>${esc(pl.name)}</b><span>${esc(pl.tip)}</span>${i < 9 ? `<kbd>${i + 1}</kbd>` : ''}</button>`).join('')}</div>`;
    el.hidden = false;
    H.callList = list.map((p) => p.id);
  };
  UI.hidePlaycall = function () { $('#playcall').hidden = true; H.callList = null; };
  UI.callByIndex = function (i) { if (H.callList && H.callList[i]) return H.callList[i]; return null; };

  function setText(id, v) { if (H.cache[id] !== v) { H.cache[id] = v; $(id).textContent = v; } }
  function setBtn(id, label) {
    const el = $(id);
    if (H.cache[id] === label) return;
    H.cache[id] = label;
    if (!label) el.hidden = true; else { el.hidden = false; el.textContent = label; }
  }
  UI.hudUpdate = function () {
    const m = H.m; if (!m) return;
    setText('#sbS0', String(m.score[0])); setText('#sbS1', String(m.score[1]));
    $('#sbHome').classList.toggle('poss', m.poss === 0 && m.state !== 'final');
    $('#sbAway').classList.toggle('poss', m.poss === 1 && m.state !== 'final');
    const mm = Math.floor(m.clock / 60), ss = Math.floor(m.clock % 60);
    setText('#sbClock', 'Q' + m.quarter + ' ' + mm + ':' + String(ss).padStart(2, '0'));
    setText('#sbDown', m.state === 'score' ? 'Touchdown' : m.downText());
    setText('#sbSpot', m.spotText());
    // context controls
    const uo = m.userOnOffense(), car = m.carrier(), c = m.ctrl;
    let a = '', b = '', cc = '', help = '';
    const qbLive = m.state === 'live' && c && car === c && c.job === 'qb';
    if (m.state === 'presnap') {
      if (m.play && m.play.id === 'fg' && uo) { b = 'KICK'; help = '<span><b>Space</b> kick when the needle is in the middle</span>'; }
      else if (uo && !m.play.special) { b = 'SNAP'; help = '<span><b>Space</b> snap</span><span><b>1–5</b> throw to a receiver after the snap</span>'; }
      else if (!uo) { a = 'SWITCH'; help = '<span><b>X</b> change player</span><span><b>WASD</b> move before the snap</span>'; }
    } else if (m.state === 'live') {
      if (qbLive) { b = 'THROW'; cc = 'AWAY'; help = '<span><b>1–5</b> throw to that receiver</span><span><b>Space</b> most open</span><span><b>C</b> throw away</span><span><b>WASD</b> scramble</span>'; }
      else if (car && car.team.idx === m.user && car.job === 'carry') { a = 'JUKE'; b = 'SPIN'; help = '<span><b>WASD</b> run</span><span><b>Shift</b> sprint</span><span><b>X</b> juke</span><span><b>Space</b> spin</span>'; }
      else if (!uo || m.turn) { a = 'SWITCH'; b = m.ball.state === 'air' ? 'SWAT' : 'TACKLE'; help = '<span><b>WASD</b> move</span><span><b>Space</b> ' + (m.ball.state === 'air' ? 'jump for the ball' : 'dive tackle') + '</span><span><b>X</b> switch player</span>'; }
    }
    setBtn('#tbA', a); setBtn('#tbB', b); setBtn('#tbC', cc);
    if (H.cache.help !== help) { H.cache.help = help; $('#keysHelp').innerHTML = help; $('#keysHelp').classList.toggle('empty', !help); }
    const sp = $('#snapPrompt');
    const showSnap = m.state === 'presnap' && uo && m.play && !m.play.special && m.stateT > 0.5;
    if (sp.hidden === showSnap) sp.hidden = !showSnap;
    // kick meter
    const km = $('#kick');
    const showKick = m.state === 'presnap' && uo && m.play && m.play.id === 'fg';
    if (km.hidden === showKick) km.hidden = !showKick;
    if (showKick) $('#kickNeedle').style.left = (m.meterV * 100).toFixed(1) + '%';
    // receiver bubbles
    const R = m.offT().role, G = FG.gfx;
    const showR = qbLive && !m.passed;
    $$('#recv .rcv').forEach((el, i) => {
      const p = R[P.RECV_ORDER[i]];
      const ok = showR && p && p.onField && (p.job === 'route' || p.job === 'attack');
      if (!ok) { if (!el.hidden) el.hidden = true; return; }
      const pr = G.project(p.x, 2.9, p.z);
      if (!pr.vis) { el.hidden = true; return; }
      el.hidden = false;
      el.style.transform = `translate(${pr.x.toFixed(0)}px, ${pr.y.toFixed(0)}px)`;
    });
  };

  /* ---------- actions ---------- */
  function saveClubName() {
    const inp = $('#clubName');
    if (!inp) return;
    const v = inp.value.replace(/\s+/g, ' ').trim().slice(0, 20);
    if (v && v !== sv().club.name) { sv().club.name = v; SV.commit(); }
  }
  UI.pauseMenu = function () {
    const o = $('#overlay');
    o.className = 'overlay locked'; o.hidden = false;
    o.innerHTML = `<div class="modal-wrap"><div class="modal pause"><p class="eyebrow">Timeout</p><h2>Take a breather</h2>
      <div class="optlist"><button class="opt" data-act="resume"><b>Resume</b><span>Back to the game</span></button><button class="opt" data-act="pause-howto"><b>How to play</b><span>Controls and rules</span></button><button class="opt" data-act="quit"><b>Forfeit game</b><span>Leave without rewards</span></button></div></div></div>`;
  };
  const ACT = {
    tab: (el) => { A.click(); UI.show(el.dataset.v); },
    'play-division': () => { A.click(); FG.game.start({ mode: 'division' }); },
    friendly: () => { A.click(); friendlyModal(); },
    'play-friendly': (el) => { A.click(); $('#overlay').hidden = true; FG.game.start({ mode: 'friendly', diff: el.dataset.v }); },
    slot: (el) => { A.click(); openPicker(+el.dataset.i); },
    assign: (el) => {
      const s = sv(), pid = el.dataset.pid, i = UI.pickSlot, j = s.lineup.indexOf(pid);
      if (j >= 0) s.lineup[j] = s.lineup[i];
      s.lineup[i] = pid;
      SV.commit(); A.click(); UI.closeModal(); UI.show('squad');
    },
    'squad-side': (el) => { UI.squadSide = el.dataset.v; A.click(); UI.show('squad'); },
    'best-xi': () => { const s = sv(); s.lineup = D.bestLineup(s.owned); SV.commit(); A.click(); UI.show('squad'); toast('Best lineup picked'); },
    'buy-pack': (el) => buyPack(el.dataset.v),
    'open-pack': (el) => { A.click(); openPack(el.dataset.v); },
    'po-open': poOpen,
    'po-flip': (el) => poFlip(+el.dataset.i),
    'po-all': poAll,
    'po-done': () => { A.click(); poDone(); },
    'market-filter': (el) => { UI.marketFilter = el.dataset.v; A.click(); UI.show('market'); },
    'market-refresh': () => {
      const s = sv();
      if (s.coins < 250) { A.error(); toast('A refresh costs 250 coins.', 'warn'); return; }
      s.coins -= 250; s.market.seed++; SV.commit(); A.coin(); UI.show('market'); UI.refreshTop(true);
    },
    'buy-player': (el) => buyPlayer(el.dataset.pid),
    'club-filter': (el) => { UI.clubFilter = el.dataset.v; A.click(); UI.show('club'); },
    'club-sort': (el) => { UI.clubSort = el.dataset.v; A.click(); UI.show('club'); },
    player: (el) => { A.click(); playerModal(el.dataset.pid); },
    sell: (el) => sellPlayer(el.dataset.pid, el),
    'close-modal': () => { A.back(); saveClubName(); UI.closeModal(); if (!$('#app').hidden) UI.show(); else FG.game.modalClosed(); },
    'close-modal-bg': (el, e) => { if (e.target === el) ACT['close-modal'](); },
    settings: () => { A.click(); settingsModal(); },
    'set-kit': (el) => { sv().club.kit = +el.dataset.v; SV.commit(); A.click(); $$('.kit').forEach((k) => k.classList.toggle('on', k === el)); },
    'set-qtr': (el) => { sv().settings.qtr = +el.dataset.v; SV.commit(); A.click(); saveClubName(); settingsModal(); },
    'set-sound': (el) => { sv().settings.sound = el.dataset.v === '1'; A.setOn(sv().settings.sound); SV.commit(); A.click(); saveClubName(); settingsModal(); },
    'set-quality': (el) => { sv().settings.quality = +el.dataset.v; FG.gfx.setQuality(sv().settings.quality); SV.commit(); A.click(); saveClubName(); settingsModal(); },
    'set-auto': (el) => { sv().settings.autoSwitch = el.dataset.v === '1'; SV.commit(); A.click(); saveClubName(); settingsModal(); },
    howto: () => { A.click(); saveClubName(); UI.howTo(false); },
    reset: (el) => {
      if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = 'Tap again to erase this team'; el.classList.add('danger'); return; }
      SV.reset(); $('#overlay').hidden = true; UI.show('home'); UI.onboard();
    },
    'onboard-go': () => {
      saveClubName();
      const s = sv(); s.onboarded = true; SV.commit();
      A.unlock(); A.click();
      $('#overlay').className = 'overlay';
      UI._afterPack = () => { UI.show('home'); toast('Roster ready. Play your first game!'); };
      openPack('rookie');
    },
    'result-continue': () => { A.click(); FG.game.leave(); },
    pause: () => FG.game.pause(),
    resume: () => { A.click(); FG.game.resume(); },
    'pause-howto': () => { A.click(); $('#overlay').className = 'overlay'; UI.howTo(true); },
    quit: (el) => {
      if (!el.dataset.sure) { el.dataset.sure = '1'; el.querySelector('b').textContent = 'Tap again to forfeit'; el.classList.add('danger'); return; }
      FG.game.quit();
    },
    call: (el) => { A.click(); FG.game.callPlay(el.dataset.v); },
    throw: (el) => { FG.input.state.throwTo = +el.dataset.i; },
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    A.unlock();
    const f = ACT[el.dataset.act];
    if (f) f(el, e);
  });
  // receiver bubbles respond on touch-down, not click, so a throw never waits for finger-up
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.rcv');
    if (!el) return;
    FG.input.state.throwTo = +el.dataset.i;
    e.preventDefault();
  });

  FG.ui = UI;
})();
