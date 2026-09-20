/* Star Kingdoms — interface: HUD, radar, kingdom console, the 1,013-unit
   army console, battle deck and result screens. The army list is
   virtualised: only the rows on screen exist in the DOM, so a phone can
   scroll the whole roster without dropping frames. */
(function (SK) {
  'use strict';
  const U = SK.util;
  const D = SK.data;
  const $ = U.$;

  function costOf(b, level) { return Math.round(b.baseCost * Math.pow(b.growth, level)); }
  const ROW_H = 78;

  function UI(game) {
    this.game = game;
    this.el = {
      hud: $('#hud'), coins: $('#res-coins'), income: $('#res-income'),
      planetName: $('#planet-name'), planetSub: $('#planet-sub'),
      prompt: $('#prompt'), promptKey: $('#prompt-key'), promptText: $('#prompt-text'),
      radar: $('#radar'), vehicleTag: $('#vehicle-tag'),
      playerHp: $('#player-hp-fill'), playerHpWrap: $('#player-hp'),
      battle: $('#battle-hud'), energyFill: $('#energy-fill'), energyNum: $('#energy-num'),
      acYou: $('#ac-you'), acThem: $('#ac-them'),
      keepYou: $('#keep-you-fill'), keepThem: $('#keep-them-fill'),
      keepYouNum: $('#keep-you-num'), keepThemNum: $('#keep-them-num'),
      keepThemLabel: $('#keep-them-label'), bossRow: $('#boss-row'),
      bossFill: $('#boss-fill'), bossName: $('#boss-name'), bossNum: $('#boss-num'),
      battleTitle: $('#battle-title'),
      toasts: $('#toasts'), result: $('#result'), dmg: $('#dmg-layer'),
      galaxyHud: $('#galaxy-hud'), galaxyTarget: $('#galaxy-target')
    };
    this.radarCtx = this.el.radar ? this.el.radar.getContext('2d') : null;
    this.openPanel = null;
    this.filter = { q: '', family: 'all', rarity: 'all', sort: 'power', availOnly: true };
    this.sub = 'squad';
    this.rowPool = [];
    this.visible = [];
    this.detailId = null;
    this.tab = 'build';
    this.bindPanels();
    this.bindTabs();
    this.bindArmyControls();
  }

  /* ------------------------------------------------------------ toast */
  UI.prototype.toast = function (msg, tone) {
    const host = this.el.toasts;
    while (host.children.length >= 4) host.removeChild(host.firstChild);
    const n = U.el('div', 'toast' + (tone ? ' toast-' + tone : ''), msg);
    host.appendChild(n);
    setTimeout(() => { n.classList.add('out'); }, 2800);
    setTimeout(() => { n.remove(); }, 3400);
  };

  /* ------------------------------------------------------------- HUD */
  UI.prototype.syncResources = function () {
    const s = this.game.state;
    this.el.coins.textContent = U.fmt(s.coins);
    this.el.income.textContent = '+' + U.fmt(this.game.incomePerMin().coins) + ' coins per minute';
    const fc = $('#foot-coins');
    if (fc) fc.textContent = U.fmt(s.coins);
  };

  UI.prototype.setPlanet = function (planet, ownedCount, conquered, citadelOpen) {
    this.el.planetName.textContent = planet.name;
    let sub = planet.epithet + ' · ' + ownedCount + '/' + planet.territories.length + ' held';
    if (conquered) sub = planet.epithet + ' · conquered';
    else if (citadelOpen) sub = planet.epithet + ' · ' + planet.citadel.name + ' is open';
    this.el.planetSub.textContent = sub;
    this.el.planetName.classList.toggle('conquered', !!conquered);
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
    const size = this.el.radar.width, half = size / 2, range = 230;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath(); ctx.arc(half, half, half - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(8,14,24,0.72)';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(53,224,255,0.16)';
    ctx.lineWidth = 1;
    for (let r = 1; r <= 3; r++) { ctx.beginPath(); ctx.arc(half, half, (half - 2) * r / 3, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(half, 0); ctx.lineTo(half, size);
    ctx.moveTo(0, half); ctx.lineTo(size, half); ctx.stroke();

    const p = g.player.pos, yaw = g.chase.yaw;
    const cos = Math.cos(-yaw), sin = Math.sin(-yaw);
    const plot = (wx, wz) => {
      const dx = wx - p.x, dz = wz - p.z;
      let sx = half + ((dx * cos - dz * sin) / range) * (half - 10);
      let sy = half + ((dx * sin + dz * cos) / range) * (half - 10);
      const edge = Math.hypot(sx - half, sy - half);
      let clipped = false;
      if (edge > half - 8) { const k = (half - 8) / edge; sx = half + (sx - half) * k; sy = half + (sy - half) * k; clipped = true; }
      return { sx, sy, clipped };
    };

    // Numbered targets: the radar and the world signs use the same numbers,
    // so "go to Target 2" is unambiguous.
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    g.planet.territories.forEach((t) => {
      const q = plot(t.x, t.z);
      const owned = !!g.state.owned[t.id];
      ctx.fillStyle = owned ? '#35e0ff' : '#ff4d6d';
      ctx.beginPath(); ctx.arc(q.sx, q.sy, q.clipped ? 4 : 7, 0, Math.PI * 2); ctx.fill();
      if (!q.clipped) {
        ctx.fillStyle = '#04070d';
        ctx.fillText(owned ? '\u2713' : String(t.order), q.sx, q.sy + 0.5);
      }
    });

    // your kingdom
    if (g.world && g.world.homeBase) {
      const q = plot(g.world.homeBase.x, g.world.homeBase.z);
      ctx.fillStyle = '#5dffa0';
      ctx.beginPath(); ctx.arc(q.sx, q.sy, 7.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#04070d';
      ctx.fillText('\u2302', q.sx, q.sy + 0.5);
    }
    ctx.fillStyle = '#ffb23f';
    ctx.beginPath();
    ctx.moveTo(half, half - 6); ctx.lineTo(half - 4.5, half + 5); ctx.lineTo(half + 4.5, half + 5);
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

  UI.prototype.bindTabs = function () {
    const self = this;
    U.$$('.tabbar .tab').forEach(function (t) {
      t.addEventListener('click', function () {
        self.showTab(t.getAttribute('data-tab'));
        SK.Audio.click();
      });
    });
  };

  UI.prototype.showTab = function (tab) {
    this.tab = tab;
    U.$$('.tabbar .tab').forEach((t) => t.classList.toggle('on', t.getAttribute('data-tab') === tab));
    U.$$('.tabpane').forEach((p) => p.classList.toggle('on', p.id === 'tab-' + tab));
    this.hideDetail();
    const hint = $('#panel-hint');
    if (hint) {
      hint.textContent = tab === 'build'
        ? 'Build and upgrade with coins. Buildings appear around your kingdom as you raise them.'
        : tab === 'army'
          ? 'Your whole army walks onto the lane at once. Recruit more, promote the ones you have.'
          : 'Bought vehicles are parked at your kingdom. Walk up and press F to ride.';
    }
    if (tab === 'build') this.renderKingdom();
    else if (tab === 'army') this.renderArmy();
    else this.renderGarage();
  };

  /* Kingdom, Army and Garage are three tabs of one shop; the old separate
     ids still work so K, U and G all land in the right place. */
  UI.prototype.showPanel = function (id) {
    const tab = id === 'army' ? 'army' : id === 'garage' ? 'garage' : 'build';
    if (this.openPanel === 'kingdom' && this.tab === tab) { this.closePanel(); return; }
    const already = this.openPanel === 'kingdom';
    this.openPanel = 'kingdom';
    $('#panel-kingdom').classList.add('open');
    $('#panel-scrim').classList.add('open');
    this.showTab(tab);
    if (!already) this.game.onPanelOpen();
    SK.Audio.click();
  };

  UI.prototype.closePanel = function (silent) {
    U.$$('.panel').forEach((p) => p.classList.remove('open'));
    $('#panel-scrim').classList.remove('open');
    this.hideDetail();
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
    $('#kingdom-tier').textContent = 'Level ' + cmd;
    const held = Object.keys(s.owned).length;
    const conq = Object.keys(s.conquered || {}).length;
    $('#kingdom-holdings').textContent = (held === 0 ? 'no land yet' : held + ' territories held') +
      (conq ? ' · ' + conq + '/5 worlds conquered' : '');

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
      if (atMax) act.innerHTML = '<span class="maxed">MAX</span>';
      else if (cappedByCommand) act.innerHTML = '<span class="locked">Raise the Great Hall first</span>';
      else {
        const btn = U.el('button', 'btn btn-buy' + (afford ? '' : ' btn-poor'),
          (lv ? 'Upgrade' : 'Build') + '<span class="cost"><i class="c-coin"></i>' + U.fmt(cost) + '</span>');
        btn.addEventListener('click', () => { if (this.game.upgradeBuilding(b.id)) this.renderKingdom(); });
        act.appendChild(btn);
      }
      row.appendChild(act);
      host.appendChild(row);
    });
    this.syncResources();
  };

  /* ==================================================================
     ARMY CONSOLE
     ================================================================== */
  UI.prototype.bindArmyControls = function () {
    const self = this;
    const q = $('#army-search');
    if (q) {
      q.addEventListener('input', function () {
        self.filter.q = q.value.trim().toLowerCase();
        self.refreshArmy();
      });
    }
    U.$$('.subtabs .subtab').forEach(function (b) {
      b.addEventListener('click', function () {
        self.sub = b.getAttribute('data-sub');
        U.$$('.subtabs .subtab').forEach((o) => o.classList.toggle('on', o === b));
        const tools = $('#shop-tools');
        if (tools) tools.hidden = self.sub !== 'shop';
        self.refreshArmy();
        SK.Audio.click();
      });
    });

    const rarHost = $('#army-rarities');
    if (rarHost) {
      const mkR = (id, label, color) => {
        const c = U.el('button', 'chip' + (id === 'all' ? ' on' : '') + (color ? ' rar-chip' : ''), label);
        if (color) c.style.color = color;
        c.addEventListener('click', function () {
          self.filter.rarity = id;
          U.$$('#army-rarities .chip').forEach((o) => o.classList.toggle('on', o === c));
          self.refreshArmy();
          SK.Audio.click();
        });
        rarHost.appendChild(c);
      };
      mkR('all', 'Any rarity', null);
      D.RARITIES.forEach((r) => mkR(r, r, D.RARITY_COLOR[r]));
    }

    const famHost = $('#army-families');
    if (famHost) {
      const mk = (id, label) => {
        const c = U.el('button', 'chip' + (id === 'all' ? ' on' : ''), label);
        c.setAttribute('data-fam', id);
        c.addEventListener('click', function () {
          self.filter.family = id;
          U.$$('#army-families .chip').forEach((o) => o.classList.toggle('on', o === c));
          self.refreshArmy();
          SK.Audio.click();
        });
        famHost.appendChild(c);
      };
      mk('all', 'All');
      D.FAMILIES.forEach((f) => mk(f.id, f.name));
      mk('trophy', 'Trophies');
    }
    U.$$('#army-sort .chip').forEach((c) => {
      c.addEventListener('click', function () {
        self.filter.sort = c.getAttribute('data-sort');
        U.$$('#army-sort .chip').forEach((o) => o.classList.toggle('on', o === c));
        self.refreshArmy();
        SK.Audio.click();
      });
    });
    const av = $('#army-avail');
    if (av) {
      av.addEventListener('click', function () {
        self.filter.availOnly = !self.filter.availOnly;
        av.classList.toggle('on', self.filter.availOnly);
        av.textContent = self.filter.availOnly ? 'Available only' : 'Show all 1,013';
        self.refreshArmy();
        SK.Audio.click();
      });
    }
    const scroller = $('#army-scroll');
    if (scroller) scroller.addEventListener('scroll', function () { self.paintRows(); });
    const close = $('#detail-close');
    if (close) close.addEventListener('click', function () { self.hideDetail(); });
  };

  UI.prototype.renderArmy = function () {
    this.renderDeckStrip();
    this.refreshArmy();
    this.syncResources();
  };

  /* Your squad, as it will line up on the lane. */
  UI.prototype.renderDeckStrip = function () {
    const g = this.game;
    const roster = g.roster();
    const host = $('#deck-strip');
    if (!host) return;
    const cap = g.armyCap();
    host.innerHTML = '';
    $('#deck-count').textContent = roster.length + ' / ' + cap;
    for (let i = 0; i < cap; i++) {
      const ent = roster[i];
      const def = ent ? D.unit(ent.id) : null;
      const slot = U.el('button', 'deck-slot' + (def ? ' filled' : ''));
      if (def) {
        slot.innerHTML = '<span class="ds-icon f-' + def.family + '"></span>' +
          '<span class="ds-name">' + def.name + '</span>' +
          '<span class="ds-meta">' + def.rarity + '</span>' +
          '<span class="ds-lv">Lv ' + ent.lv + '</span>';
        slot.style.borderColor = D.RARITY_COLOR[def.rarity] || 'var(--line)';
        slot.addEventListener('click', () => this.showSoldier(i));
        slot.title = def.name + ' — tap to promote or dismiss';
      } else {
        slot.innerHTML = '<span class="ds-empty">Empty</span>';
      }
      host.appendChild(slot);
    }
  };

  UI.prototype.filteredUnits = function () {
    const s = this.game.state;
    const f = this.filter;
    if (this.sub === 'squad') {
      return this.game.roster().map((ent, i) => {
        const def = D.unit(ent.id);
        return def ? Object.assign({}, def, { __slot: i, __lv: ent.lv }) : null;
      }).filter(Boolean);
    }
    let list = D.UNITS.filter((u) => !u.trophy || D.unitUnlocked(u, s.buildings, s.conquered));
    if (f.availOnly) list = list.filter((u) => D.unitUnlocked(u, s.buildings, s.conquered));
    if (f.rarity !== 'all') list = list.filter((u) => u.rarity === f.rarity);
    if (f.family === 'trophy') list = list.filter((u) => u.trophy);
    else if (f.family !== 'all') list = list.filter((u) => u.family === f.family);
    if (f.q) {
      const q = f.q;
      list = list.filter((u) =>
        u.name.toLowerCase().indexOf(q) >= 0 ||
        (u.familyName || '').toLowerCase().indexOf(q) >= 0 ||
        (u.traitName || '').toLowerCase().indexOf(q) >= 0 ||
        (u.role || '').toLowerCase().indexOf(q) >= 0 ||
        (u.rarity || '').toLowerCase().indexOf(q) >= 0);
    }
    const sort = f.sort;
    list = list.slice().sort((a, b) => {
      if (sort === 'price') return a.price - b.price || b.power - a.power;
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'rarity') return (D.RARITY_RANK[b.rarity] - D.RARITY_RANK[a.rarity]) || b.power - a.power;
      return b.power - a.power;
    });
    return list;
  };

  UI.prototype.refreshArmy = function () {
    this.visible = this.filteredUnits();
    const spacer = $('#army-spacer');
    if (spacer) spacer.style.height = (this.visible.length * ROW_H) + 'px';
    const scroller = $('#army-scroll');
    if (scroller) scroller.scrollTop = 0;
    const cnt = $('#army-count');
    if (cnt) cnt.textContent = U.fmt(this.visible.length) + ' of ' + U.fmt(D.UNITS.length);
    const tools = $('#shop-tools');
    if (tools) tools.hidden = this.sub !== 'shop';
    const pw = $('#army-power');
    if (pw) pw.textContent = '+' + ((this.game.state.buildings.lab || 0) * 5) + '% from research';
    this.paintRows();
  };

  /* Only the rows on screen exist. Nodes are recycled as you scroll. */
  UI.prototype.paintRows = function () {
    const scroller = $('#army-scroll');
    const host = $('#army-rows');
    if (!scroller || !host) return;
    const s = this.game.state;
    const top = scroller.scrollTop;
    const h = scroller.clientHeight || 400;
    const first = Math.max(0, Math.floor(top / ROW_H) - 3);
    const count = Math.ceil(h / ROW_H) + 6;
    const last = Math.min(this.visible.length, first + count);

    while (this.rowPool.length < last - first) {
      const n = U.el('div', 'urow');
      n.addEventListener('click', () => {
        if (n.__slot >= 0) this.showSoldier(n.__slot);
        else if (n.__id) this.showDetail(n.__id);
      });
      host.appendChild(n);
      this.rowPool.push(n);
    }
    for (let i = 0; i < this.rowPool.length; i++) {
      const node = this.rowPool[i];
      const idx = first + i;
      if (idx >= last) { node.style.display = 'none'; node.__id = null; continue; }
      const def = this.visible[idx];
      const squad = this.sub === 'squad';
      const lv = squad ? def.__lv : 1;
      const unlocked = D.unitUnlocked(def, s.buildings, s.conquered);
      const afford = s.coins >= def.price;
      node.style.display = '';
      node.style.transform = 'translateY(' + (idx * ROW_H) + 'px)';
      node.className = 'urow' + (squad ? ' in-deck' : '') + (unlocked ? '' : ' locked');
      node.__id = def.id;
      node.__slot = squad ? def.__slot : -1;
      node.style.setProperty('--rar', D.RARITY_COLOR[def.rarity] || '#9fb0c4');
      node.innerHTML =
        '<span class="urow-rar"></span>' +
        '<span class="urow-icon f-' + def.family + '"><i>' + def.energy + '</i></span>' +
        '<span class="urow-main">' +
          '<span class="urow-top"><b>' + def.name + '</b>' +
            (squad ? '<em class="tag-deck">Lv ' + lv + '</em>' : '') +
            (def.trophy ? '<em class="tag-trophy">Trophy</em>' : '') +
          '</span>' +
          '<span class="urow-sub">' + (def.familyName || '') + ' · ' + def.role +
            (def.trophy ? '' : ' · Mk ' + def.markRoman) + '</span>' +
          '<span class="urow-stats">' +
            '<i>' + U.fmt(def.hp) + ' hp</i>' +
            '<i>' + (def.heal ? '+' + Math.round(def.heal) + ' heal' : Math.round(def.dmg) + ' dmg') + '</i>' +
            '<i>' + (def.range > 4 ? Math.round(def.range) + 'm' : 'melee') + '</i>' +
            '<i style="color:' + (D.RARITY_COLOR[def.rarity] || '#9fb0c4') + '">' + def.rarity + '</i>' +
          '</span>' +
        '</span>' +
        '<span class="urow-right">' +
          (squad
            ? '<span class="urow-lv">Lv ' + lv + '</span><span class="urow-own">In army</span>'
            : (unlocked
              ? '<span class="urow-price' + (afford ? '' : ' poor') + '"><i class="c-coin"></i>' +
                U.fmt(def.price) + '</span>'
              : '<span class="urow-lv">Locked</span>')) +
          '<span class="urow-pw">' + U.fmt(def.power) + ' pwr</span>' +
        '</span>';
    }
  };

  /* --------------------------------------------------- detail sheet */
  /* One sheet, two jobs: buying a soldier from the shop, or promoting and
     dismissing one already in your army. */
  UI.prototype.sheetFor = function (def, opts) {
    const s = this.game.state;
    const sheet = $('#unit-detail');
    if (!sheet || !def) return null;
    const lv = opts.lv || 1;
    const unlocked = D.unitUnlocked(def, s.buildings, s.conquered);
    const lvMul = 1 + (lv - 1) * 0.14;

    let gate = '';
    if (!unlocked) {
      const need = [];
      if (def.trophy) {
        const pl = D.PLANETS.filter((p) => p.id === def.trophy)[0];
        need.push('conquer ' + (pl ? pl.name : 'that world'));
      } else {
        if ((s.buildings.barracks || 0) < def.barracks) need.push('War Barracks ' + def.barracks);
        if ((s.buildings.command || 0) < def.command) need.push('Great Hall ' + def.command);
        if ((s.buildings.lab || 0) < def.lab) need.push('Research Lab ' + def.lab);
      }
      gate = '<div class="ud-gate">Locked · needs ' + need.join(', ') + '</div>';
    }

    const perkRows = def.perks.map((pk, i) => {
      const at = D.PERK_LEVELS[i];
      const have = lv >= at;
      const P = D.PERKS[pk];
      return '<div class="ud-perk' + (have ? ' have' : '') + '">' +
        '<b>Lv ' + at + '</b><span><em>' + P.name + '</em> ' + P.desc + '</span></div>';
    }).join('');

    sheet.innerHTML =
      '<div class="ud-head" style="--rar:' + (D.RARITY_COLOR[def.rarity] || '#9fb0c4') + '">' +
        '<span class="ud-icon f-' + def.family + '"></span>' +
        '<div class="ud-title"><h3>' + def.name + '</h3>' +
          '<div class="ud-meta"><span class="ud-rar">' + def.rarity + '</span> · ' +
          (def.familyName || '') + (def.trophy ? '' : ' Mk ' + def.markRoman) + ' · ' + def.role + '</div>' +
        '</div>' +
        '<button class="panel-close" id="detail-close" aria-label="Close">&times;</button>' +
      '</div>' +
      gate +
      '<p class="ud-desc">' + def.desc + '</p>' +
      (def.traitDesc && def.trait !== 'std'
        ? '<div class="ud-trait"><b>' + (def.traitName || 'Trophy') + '</b> ' + def.traitDesc + '</div>' : '') +
      '<div class="ud-stats">' +
        '<div><span>Health</span><b>' + U.fmt(Math.round(def.hp * lvMul)) + '</b></div>' +
        '<div><span>' + (def.heal ? 'Heal' : 'Damage') + '</span><b>' +
          Math.round((def.heal || def.dmg) * lvMul) + '</b></div>' +
        '<div><span>Range</span><b>' + (def.range > 4 ? Math.round(def.range) + 'm' : 'Melee') + '</b></div>' +
        '<div><span>Speed</span><b>' + def.speed.toFixed(1) + '</b></div>' +
        '<div><span>Squad</span><b>' + def.count + '</b></div>' +
        '<div><span>Power</span><b>' + U.fmt(def.power) + '</b></div>' +
      '</div>' +
      '<div class="ud-perks"><h4>Perks</h4>' + perkRows + '</div>' +
      '<div class="ud-actions" id="ud-actions"></div>';
    sheet.classList.add('open');
    const self = this;
    $('#detail-close').addEventListener('click', function () { self.hideDetail(); });
    return $('#ud-actions');
  };

  /* Shop view: one Recruit button. */
  UI.prototype.showDetail = function (id) {
    const def = D.unit(id);
    const g = this.game, s = g.state;
    const act = this.sheetFor(def, { lv: 1 });
    if (!act) return;
    this.detailId = id;
    this.detailSlot = -1;
    const unlocked = D.unitUnlocked(def, s.buildings, s.conquered);
    const full = g.roster().length >= g.armyCap();
    const afford = s.coins >= def.price;
    const btn = U.el('button', 'btn btn-buy' + (afford && unlocked && !full ? '' : ' btn-poor'),
      (full ? 'Army full' : 'Recruit') +
      '<span class="cost"><i class="c-coin"></i>' + U.fmt(def.price) + '</span>');
    if (!unlocked || full) btn.setAttribute('disabled', '');
    btn.addEventListener('click', () => {
      if (g.buySoldier(id)) {
        this.renderDeckStrip(); this.refreshArmy(); this.syncResources(); this.hideDetail();
      }
    });
    act.appendChild(btn);
    if (full) {
      act.appendChild(U.el('span', 'locked', 'Upgrade the War Barracks for a bigger army.'));
    }
  };

  /* Squad view: promote or dismiss the soldier in this slot. */
  UI.prototype.showSoldier = function (slot) {
    const g = this.game, s = g.state;
    const ent = g.roster()[slot];
    if (!ent) return;
    const def = D.unit(ent.id);
    const act = this.sheetFor(def, { lv: ent.lv });
    if (!act) return;
    this.detailId = ent.id;
    this.detailSlot = slot;
    const maxed = ent.lv >= D.MAX_LEVEL;
    const cost = D.unitUpgradeCost(def, ent.lv);
    const afford = s.coins >= cost;
    if (maxed) {
      act.appendChild(U.el('span', 'maxed', 'MAX RANK'));
    } else {
      const up = U.el('button', 'btn btn-buy' + (afford ? '' : ' btn-poor'),
        'Promote to Lv ' + (ent.lv + 1) +
        '<span class="cost"><i class="c-coin"></i>' + U.fmt(cost) + '</span>');
      up.addEventListener('click', () => {
        if (g.promoteSoldier(slot)) {
          this.renderDeckStrip(); this.refreshArmy(); this.syncResources(); this.showSoldier(slot);
        }
      });
      act.appendChild(up);
    }
    const sell = U.el('button', 'btn btn-ghost', 'Dismiss');
    sell.addEventListener('click', () => {
      if (g.sellSoldier(slot)) {
        this.renderDeckStrip(); this.refreshArmy(); this.syncResources(); this.hideDetail();
      }
    });
    act.appendChild(sell);
  };

  UI.prototype.hideDetail = function () {
    const sheet = $('#unit-detail');
    if (sheet) sheet.classList.remove('open');
    this.detailId = null;
    this.detailSlot = -1;
  };

  /* --------------------------------------------------------- garage */
  UI.prototype.renderGarage = function () {
    const g = this.game;
    const s = g.state;
    const host = $('#garage-list');
    if (!host) return;
    host.innerHTML = '';
    D.VEHICLES.forEach((v) => {
      const owned = g.ownsVehicle(v.id);
      const afford = s.coins >= v.cost;
      const row = U.el('div', 'row veh-row' + (owned ? ' owned' : ''));
      row.innerHTML =
        '<div class="row-icon v-' + v.id + '"></div>' +
        '<div class="row-main">' +
          '<div class="row-head"><span class="row-name">' + v.name + '</span>' +
            '<span class="tag">' + v.tagline + '</span>' +
            (owned ? '<span class="lv owned-tag">OWNED</span>' : '') +
          '</div>' +
          '<div class="row-effect">' + v.desc + '</div>' +
          '<div class="statline">' +
            v.stats.map((st) => '<span>' + st[0] + ' <b>' + st[1] + '</b></span>').join('') +
          '</div>' +
        '</div>';
      const act = U.el('div', 'row-act');
      if (owned) {
        act.innerHTML = '<span class="maxed">PARKED</span>';
      } else {
        const btn = U.el('button', 'btn btn-buy' + (afford ? '' : ' btn-poor'),
          'Buy<span class="cost"><i class="c-coin"></i>' + U.fmt(v.cost) + '</span>');
        btn.addEventListener('click', () => {
          if (g.buyVehicle(v.id)) { this.renderGarage(); this.syncResources(); }
        });
        act.appendChild(btn);
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

  };

  UI.prototype.renderCards = function () { /* no cards: the army is already deployed */ };

  UI.prototype.syncBattle = function (b) {
    if (!b || !b.active) return;
    const c = b.counts();
    this.el.acYou.textContent = c.ally;
    this.el.acThem.textContent = c.foe;
    const you = b.homeKeep.hp / b.homeKeep.maxHp;
    const them = b.enemyKeep.hp / b.enemyKeep.maxHp;
    this.el.keepYou.style.width = U.clamp(you * 100, 0, 100) + '%';
    this.el.keepThem.style.width = U.clamp(them * 100, 0, 100) + '%';
    this.el.keepYouNum.textContent = Math.max(0, Math.ceil(b.homeKeep.hp));
    this.el.keepThemNum.textContent = Math.max(0, Math.ceil(b.enemyKeep.hp));
    this.el.keepThemLabel.textContent = b.isCitadel ? 'Their keep (optional)' : 'Enemy keep';
    const boss = b.boss;
    this.el.bossRow.classList.toggle('show', !!boss);
    if (boss) {
      this.el.bossFill.style.width = U.clamp(Math.max(0, boss.hp) / boss.maxHp * 100, 0, 100) + '%';
      this.el.bossName.textContent = boss.warlord ? boss.warlord.name : 'Warlord';
      this.el.bossNum.textContent = U.fmt(Math.max(0, boss.hp));
    }
  };

  /* -------------------------------------------------------- results */
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

  /* --------------------------------------------------------- galaxy */
  UI.prototype.showGalaxy = function (on) { this.el.galaxyHud.classList.toggle('show', !!on); };

  UI.prototype.setGalaxyTarget = function (node, state, dist) {
    const host = this.el.galaxyTarget;
    if (!node) { host.classList.remove('show'); return; }
    host.classList.add('show');
    const p = node.planet;
    const unlocked = !!state.unlocked[p.id];
    const owned = p.territories.filter((t) => state.owned[t.id]).length;
    const done = !!state.conquered[p.id];
    host.innerHTML =
      '<div class="gt-name">' + p.name + '</div>' +
      '<div class="gt-epi">' + p.epithet + '</div>' +
      '<p class="gt-blurb">' + p.blurb + '</p>' +
      '<div class="gt-row"><span>Faction</span><b>' + p.faction.name + '</b></div>' +
      '<div class="gt-row"><span>Held</span><b>' + owned + ' / ' + p.territories.length + '</b></div>' +
      '<div class="gt-row"><span>Warlord</span><b class="' + (done ? 'ok' : '') + '">' +
        (done ? 'Defeated' : p.citadel.warlord.name) + '</b></div>' +
      (unlocked
        ? '<div class="gt-cta">Hold <kbd>E</kbd> to land</div>'
        : '<div class="gt-row"><span>Survey cost</span><b class="' +
            (state.coins >= p.unlockCost ? 'ok' : 'no') + '">' + U.fmt(p.unlockCost) + ' coins</b></div>' +
          '<div class="gt-cta">Hold <kbd>E</kbd> to chart this world</div>');
  };

  SK.UI = UI;
  SK.costOf = costOf;
})(window.SK);
