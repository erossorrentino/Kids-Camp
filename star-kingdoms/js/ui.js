/* Star Kingdoms — interface: HUD, radar, kingdom and army consoles,
   battle deck, and the result screens. */
(function (SK) {
  'use strict';
  const U = SK.util;
  const D = SK.data;
  const $ = U.$;

  function costOf(b, level) { return Math.round(b.baseCost * Math.pow(b.growth, level)); }
  function unitCost(def, level) { return Math.round(def.upgradeBase * Math.pow(1.62, level - 1)); }
  function deckSize(state) { return Math.min(8, 3 + (state.buildings.barracks || 1)); }

  function UI(game) {
    this.game = game;
    this.el = {
      hud: $('#hud'),
      crystal: $('#res-crystal'),
      alloy: $('#res-alloy'),
      income: $('#res-income'),
      planetName: $('#planet-name'),
      planetSub: $('#planet-sub'),
      prompt: $('#prompt'),
      promptKey: $('#prompt-key'),
      promptText: $('#prompt-text'),
      radar: $('#radar'),
      vehicleTag: $('#vehicle-tag'),
      playerHp: $('#player-hp-fill'),
      playerHpWrap: $('#player-hp'),
      battle: $('#battle-hud'),
      energyFill: $('#energy-fill'),
      energyNum: $('#energy-num'),
      cards: $('#cards'),
      keepYou: $('#keep-you-fill'),
      keepThem: $('#keep-them-fill'),
      keepYouNum: $('#keep-you-num'),
      keepThemNum: $('#keep-them-num'),
      battleTitle: $('#battle-title'),
      toasts: $('#toasts'),
      result: $('#result'),
      dmg: $('#dmg-layer'),
      galaxyHud: $('#galaxy-hud'),
      galaxyTarget: $('#galaxy-target')
    };
    this.radarCtx = this.el.radar ? this.el.radar.getContext('2d') : null;
    this.openPanel = null;
    this.bindPanels();
  }

  /* ------------------------------------------------------------ toast */
  UI.prototype.toast = function (msg, tone) {
    const host = this.el.toasts;
    // A burst of upgrades can queue a dozen at once; keep the newest few.
    while (host.children.length >= 4) host.removeChild(host.firstChild);
    const n = U.el('div', 'toast' + (tone ? ' toast-' + tone : ''), msg);
    host.appendChild(n);
    setTimeout(() => { n.classList.add('out'); }, 2600);
    setTimeout(() => { n.remove(); }, 3200);
  };

  /* ------------------------------------------------------------- HUD */
  UI.prototype.syncResources = function () {
    const s = this.game.state;
    this.el.crystal.textContent = U.fmt(s.crystal);
    this.el.alloy.textContent = U.fmt(s.alloy);
    const inc = this.game.incomePerMin();
    this.el.income.textContent = '+' + U.fmt(inc.crystal) + ' / +' + U.fmt(inc.alloy) + ' per min';
    const fc = $('#foot-crystal'), fa = $('#foot-alloy');
    if (fc) fc.textContent = U.fmt(s.crystal);
    if (fa) fa.textContent = U.fmt(s.alloy);
  };

  UI.prototype.setPlanet = function (planet, ownedCount) {
    this.el.planetName.textContent = planet.name;
    this.el.planetSub.textContent = planet.epithet + ' · ' + ownedCount + '/' +
      planet.territories.length + ' territories held';
  };

  UI.prototype.setPrompt = function (key, text) {
    if (!text) { this.el.prompt.classList.remove('show'); return; }
    this.el.prompt.classList.add('show');
    this.el.promptKey.textContent = key;
    this.el.promptText.textContent = text;
  };

  UI.prototype.setVehicleTag = function (txt) {
    this.el.vehicleTag.textContent = txt || '';
    this.el.vehicleTag.style.opacity = txt ? '1' : '0';
  };

  UI.prototype.setPlayerHealth = function (hp, show) {
    this.el.playerHpWrap.style.opacity = show ? '1' : '0';
    this.el.playerHp.style.width = U.clamp(hp, 0, 100) + '%';
    this.el.playerHp.style.background = hp > 55 ? 'var(--good)' : hp > 25 ? 'var(--warn)' : 'var(--bad)';
  };

  /* ----------------------------------------------------------- radar */
  UI.prototype.drawRadar = function () {
    const ctx = this.radarCtx;
    if (!ctx) return;
    const g = this.game;
    const size = 150, half = size / 2, range = 220;
    ctx.clearRect(0, 0, size, size);

    ctx.save();
    ctx.beginPath(); ctx.arc(half, half, half - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(8,14,24,0.72)';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(53,224,255,0.16)';
    ctx.lineWidth = 1;
    for (let r = 1; r <= 3; r++) {
      ctx.beginPath(); ctx.arc(half, half, (half - 2) * r / 3, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(half, 0); ctx.lineTo(half, size);
    ctx.moveTo(0, half); ctx.lineTo(size, half); ctx.stroke();

    const p = g.player.pos;
    const yaw = g.chase.yaw;
    const cos = Math.cos(-yaw), sin = Math.sin(-yaw);

    g.planet.territories.forEach((t) => {
      const dx = t.x - p.x, dz = t.z - p.z;
      let rx = dx * cos - dz * sin;
      let rz = dx * sin + dz * cos;
      let sx = half + (rx / range) * (half - 10);
      let sy = half + (rz / range) * (half - 10);
      const edge = Math.hypot(sx - half, sy - half);
      let clipped = false;
      if (edge > half - 8) {
        const s = (half - 8) / edge;
        sx = half + (sx - half) * s; sy = half + (sy - half) * s;
        clipped = true;
      }
      const owned = !!g.state.owned[t.id];
      ctx.fillStyle = owned ? '#35e0ff' : '#ff4d6d';
      ctx.beginPath();
      ctx.arc(sx, sy, clipped ? 2.6 : 4.2, 0, Math.PI * 2);
      ctx.fill();
      if (!clipped) {
        ctx.strokeStyle = owned ? 'rgba(53,224,255,0.45)' : 'rgba(255,77,109,0.45)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(sx, sy, 7.5, 0, Math.PI * 2); ctx.stroke();
      }
    });

    // player arrow, always centred and pointing up
    ctx.fillStyle = '#ffb23f';
    ctx.beginPath();
    ctx.moveTo(half, half - 6);
    ctx.lineTo(half - 4.5, half + 5);
    ctx.lineTo(half + 4.5, half + 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(53,224,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(half, half, half - 2, 0, Math.PI * 2); ctx.stroke();
  };

  /* ---------------------------------------------------------- panels */
  UI.prototype.bindPanels = function () {
    const self = this;
    U.$$('[data-close]').forEach((b) => b.addEventListener('click', () => self.closePanel()));
    U.$$('[data-open]').forEach((b) => b.addEventListener('click', () => self.showPanel(b.getAttribute('data-open'))));
  };

  UI.prototype.showPanel = function (id) {
    if (this.openPanel === id) { this.closePanel(); return; }
    this.closePanel(true);
    const node = $('#panel-' + id);
    if (!node) return;
    this.openPanel = id;
    node.classList.add('open');
    $('#panel-scrim').classList.add('open');
    if (id === 'kingdom') this.renderKingdom();
    if (id === 'army') this.renderArmy();
    this.game.onPanelOpen();
    SK.Audio.click();
  };

  UI.prototype.closePanel = function (silent) {
    U.$$('.panel').forEach((p) => p.classList.remove('open'));
    $('#panel-scrim').classList.remove('open');
    this.openPanel = null;
    if (!silent) this.game.onPanelClose();
  };

  /* ------------------------------------------------------ kingdom UI */
  UI.prototype.renderKingdom = function () {
    const s = this.game.state;
    const host = $('#kingdom-list');
    host.innerHTML = '';
    const cmd = s.buildings.command || 1;

    const dyn = $('#kingdom-dynasty');
    if (dyn) dyn.textContent = s.dynasty || 'House Aurelin';
    $('#kingdom-tier').textContent = 'Empire tier ' + cmd;
    $('#kingdom-holdings').textContent = Object.keys(s.owned).length + ' territories · ' +
      this.game.planetsUnlocked() + '/5 worlds';

    D.BUILDINGS.forEach((b) => {
      const lv = s.buildings[b.id] || 0;
      const atMax = lv >= b.max;
      const cappedByCommand = b.id !== 'command' && lv >= cmd && cmd < 10;
      const cost = costOf(b, lv);
      const afford = s.crystal >= cost;

      const row = U.el('div', 'row' + (atMax ? ' row-max' : ''));
      row.innerHTML =
        '<div class="row-icon i-' + b.id + '"></div>' +
        '<div class="row-main">' +
          '<div class="row-head"><span class="row-name">' + b.name + '</span>' +
          '<span class="lv">' + (lv ? 'Lv ' + lv : 'Not built') + '</span></div>' +
          '<div class="row-effect">' + (lv ? b.effect(lv) : b.desc) + '</div>' +
          (lv && !atMax ? '<div class="row-next">Next: ' + b.effect(lv + 1) + '</div>' : '') +
        '</div>';
      const act = U.el('div', 'row-act');
      if (atMax) {
        act.innerHTML = '<span class="maxed">MAX</span>';
      } else if (cappedByCommand) {
        act.innerHTML = '<span class="locked">Needs Command Spire ' + (lv + 1) + '</span>';
      } else {
        const btn = U.el('button', 'btn btn-buy' + (afford ? '' : ' btn-poor'),
          (lv ? 'Upgrade' : 'Build') + '<span class="cost"><i class="c-crystal"></i>' + U.fmt(cost) + '</span>');
        btn.addEventListener('click', () => {
          if (this.game.upgradeBuilding(b.id)) this.renderKingdom();
        });
        act.appendChild(btn);
      }
      row.appendChild(act);
      host.appendChild(row);
    });
    this.syncResources();
  };

  /* --------------------------------------------------------- army UI */
  UI.prototype.renderArmy = function () {
    const s = this.game.state;
    const host = $('#army-list');
    host.innerHTML = '';
    const barracks = s.buildings.barracks || 1;
    const cap = deckSize(s);
    $('#deck-count').textContent = s.deck.length + ' / ' + cap;
    $('#army-power').textContent = '+' + ((s.buildings.lab || 0) * 5) + '% from research';

    D.UNITS.forEach((def) => {
      const unlocked = barracks >= def.barracks;
      const lv = s.army[def.id] || 1;
      const cost = unitCost(def, lv);
      const afford = s.alloy >= cost;
      const inDeck = s.deck.indexOf(def.id) >= 0;
      const lvMul = 1 + (lv - 1) * 0.18;

      const row = U.el('div', 'row unit-row' + (unlocked ? '' : ' row-locked') + (inDeck ? ' in-deck' : ''));
      row.innerHTML =
        '<div class="row-icon u-' + def.id + '"><span class="energy-pip">' + def.energy + '</span></div>' +
        '<div class="row-main">' +
          '<div class="row-head"><span class="row-name">' + def.name + '</span>' +
          '<span class="tag">' + def.role + '</span>' +
          (unlocked ? '<span class="lv">Lv ' + lv + '</span>' : '<span class="lv lock">Barracks ' + def.barracks + '</span>') +
          '</div>' +
          '<div class="row-effect">' + def.desc + '</div>' +
          '<div class="statline">' +
            '<span><b>' + Math.round(def.hp * lvMul) + '</b> hp</span>' +
            '<span><b>' + (def.heal ? '+' + Math.round(def.heal * lvMul) : Math.round(def.dmg * lvMul)) + '</b> ' +
              (def.heal ? 'heal' : 'dmg') + '</span>' +
            '<span><b>' + (def.range > 4 ? Math.round(def.range) + 'm' : 'melee') + '</b></span>' +
            '<span><b>' + def.speed.toFixed(1) + '</b> spd</span>' +
            (def.count > 1 ? '<span><b>x' + def.count + '</b></span>' : '') +
          '</div>' +
        '</div>';
      const act = U.el('div', 'row-act');
      if (!unlocked) {
        act.innerHTML = '<span class="locked">Locked</span>';
      } else {
        const deckBtn = U.el('button', 'btn btn-deck' + (inDeck ? ' on' : ''), inDeck ? 'In deck' : 'Add to deck');
        deckBtn.addEventListener('click', () => {
          const i = s.deck.indexOf(def.id);
          if (i >= 0) { s.deck.splice(i, 1); SK.Audio.click(); }
          else if (s.deck.length >= cap) { this.toast('Deck is full. Upgrade the War Barracks.', 'bad'); SK.Audio.deny(); return; }
          else { s.deck.push(def.id); SK.Audio.confirm(); }
          this.game.save();
          this.renderArmy();
          this.renderCards();
        });
        act.appendChild(deckBtn);
        const up = U.el('button', 'btn btn-buy' + (afford ? '' : ' btn-poor'),
          'Upgrade<span class="cost"><i class="c-alloy"></i>' + U.fmt(cost) + '</span>');
        up.addEventListener('click', () => {
          if (this.game.upgradeUnit(def.id)) this.renderArmy();
        });
        act.appendChild(up);
      }
      row.appendChild(act);
      host.appendChild(row);
    });
    this.syncResources();
  };

  /* --------------------------------------------------------- battle */
  UI.prototype.showBattle = function (on, title) {
    this.el.battle.classList.toggle('show', !!on);
    if (title) this.el.battleTitle.textContent = title;
    if (on) this.renderCards();
  };

  UI.prototype.renderCards = function () {
    const s = this.game.state;
    const host = this.el.cards;
    host.innerHTML = '';
    this.cardNodes = [];
    s.deck.forEach((id, i) => {
      const def = D.UNITS.find((u) => u.id === id);
      if (!def) return;
      const lv = s.army[id] || 1;
      const card = U.el('button', 'card u-' + id);
      card.innerHTML =
        '<span class="card-key">' + (i + 1) + '</span>' +
        '<span class="card-art u-' + id + '"></span>' +
        '<span class="card-name">' + def.name.split(' ').slice(-1)[0] + '</span>' +
        '<span class="card-lv">Lv ' + lv + '</span>' +
        '<span class="card-cost">' + def.energy + '</span>';
      card.addEventListener('click', (e) => { e.preventDefault(); this.game.tryDeploy(id); });
      host.appendChild(card);
      this.cardNodes.push({ node: card, def: def });
    });
  };

  UI.prototype.syncBattle = function (b) {
    if (!b || !b.active) return;
    const pct = (b.energy / b.maxEnergy) * 100;
    this.el.energyFill.style.width = pct + '%';
    this.el.energyNum.textContent = Math.floor(b.energy);
    (this.cardNodes || []).forEach((c) => {
      c.node.classList.toggle('ready', b.energy >= c.def.energy);
    });
    const you = b.homeKeep.hp / b.homeKeep.maxHp;
    const them = b.enemyKeep.hp / b.enemyKeep.maxHp;
    this.el.keepYou.style.width = U.clamp(you * 100, 0, 100) + '%';
    this.el.keepThem.style.width = U.clamp(them * 100, 0, 100) + '%';
    this.el.keepYouNum.textContent = Math.max(0, Math.ceil(b.homeKeep.hp));
    this.el.keepThemNum.textContent = Math.max(0, Math.ceil(b.enemyKeep.hp));
  };

  /* --------------------------------------------------------- results */
  UI.prototype.showResult = function (opts) {
    const r = this.el.result;
    r.innerHTML = '';
    const card = U.el('div', 'result-card ' + (opts.tone || ''));
    card.innerHTML =
      '<div class="result-eyebrow">' + (opts.eyebrow || '') + '</div>' +
      '<h2>' + opts.title + '</h2>' +
      '<p>' + opts.body + '</p>' +
      (opts.rewards ? '<div class="rewards">' + opts.rewards + '</div>' : '');
    const row = U.el('div', 'result-actions');
    (opts.actions || []).forEach((a) => {
      const btn = U.el('button', 'btn ' + (a.primary ? 'btn-primary' : 'btn-ghost'), a.label);
      btn.addEventListener('click', () => { SK.Audio.click(); a.fn(); });
      row.appendChild(btn);
    });
    card.appendChild(row);
    r.appendChild(card);
    r.classList.add('show');
  };

  UI.prototype.hideResult = function () { this.el.result.classList.remove('show'); };

  /* ---------------------------------------------------------- galaxy */
  UI.prototype.showGalaxy = function (on) {
    this.el.galaxyHud.classList.toggle('show', !!on);
  };

  UI.prototype.setGalaxyTarget = function (node, state, dist) {
    const host = this.el.galaxyTarget;
    if (!node) {
      host.classList.remove('show');
      return;
    }
    host.classList.add('show');
    const p = node.planet;
    const unlocked = !!state.unlocked[p.id];
    const owned = p.territories.filter((t) => state.owned[t.id]).length;
    host.innerHTML =
      '<div class="gt-name">' + p.name + '</div>' +
      '<div class="gt-epi">' + p.epithet + '</div>' +
      '<p class="gt-blurb">' + p.blurb + '</p>' +
      '<div class="gt-row"><span>Faction</span><b>' + p.faction.name + '</b></div>' +
      '<div class="gt-row"><span>Held</span><b>' + owned + ' / ' + p.territories.length + '</b></div>' +
      (unlocked
        ? '<div class="gt-cta">Hold <kbd>E</kbd> to land</div>'
        : '<div class="gt-row"><span>Survey cost</span><b class="' +
            (state.crystal >= p.unlockCost ? 'ok' : 'no') + '">' + U.fmt(p.unlockCost) + ' crystal</b></div>' +
          '<div class="gt-cta">Hold <kbd>E</kbd> to chart this world</div>');
  };

  SK.UI = UI;
  SK.costOf = costOf;
  SK.unitCost = unitCost;
  SK.deckSize = deckSize;
})(window.SK);
