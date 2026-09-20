/* Star Kingdoms — boot: title screen, sovereign customiser, launch. */
(function (SK) {
  'use strict';
  const U = SK.util;
  const $ = U.$;

  SK.boot = function () {
    const canvas = $('#view');
    let game;
    try {
      game = new SK.Game(canvas);
    } catch (e) {
      console.error(e);
      $('#fatal').classList.add('show');
      return;
    }
    window.game = game;

    /* ------------------------------------------- sovereign customiser */
    const A = SK.APPEARANCES;
    const choice = { skin: A.skins[1], suitIndex: 0, crest: 'fin' };

    const skinHost = $('#sw-skin');
    A.skins.forEach((hex, i) => {
      const b = U.el('button', 'sw');
      b.style.background = '#' + ('000000' + hex.toString(16)).slice(-6);
      b.setAttribute('aria-pressed', String(i === 1));
      b.setAttribute('aria-label', 'Skin tone ' + (i + 1));
      b.addEventListener('click', () => {
        choice.skin = hex;
        U.$$('#sw-skin .sw').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
        SK.Audio.click();
      });
      skinHost.appendChild(b);
    });

    const suitHost = $('#sw-suit');
    A.suits.forEach((s, i) => {
      const b = U.el('button', 'chip', s.name);
      b.setAttribute('aria-pressed', String(i === 0));
      b.style.borderLeft = '3px solid #' + ('000000' + s.trim.toString(16)).slice(-6);
      b.addEventListener('click', () => {
        choice.suitIndex = i;
        U.$$('#sw-suit .chip').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
        SK.Audio.click();
      });
      suitHost.appendChild(b);
    });

    const crestHost = $('#sw-crest');
    const crestNames = { fin: 'Crest fin', halo: 'Halo ring', horns: 'Horns', null: 'Plain' };
    A.crests.forEach((c, i) => {
      const b = U.el('button', 'chip', crestNames[String(c)]);
      b.setAttribute('aria-pressed', String(i === 0));
      b.addEventListener('click', () => {
        choice.crest = c;
        U.$$('#sw-crest .chip').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
        SK.Audio.click();
      });
      crestHost.appendChild(b);
    });

    /* ------------------------------------------------------- actions */
    $('#btn-new').addEventListener('click', function () {
      SK.Audio.resume();
      SK.Audio.confirm();
      const suit = A.suits[choice.suitIndex];
      const appearance = {
        skin: choice.skin, suit: suit.suit, trim: suit.trim,
        accent: suit.accent, crest: choice.crest
      };
      const name = ($('#dynasty').value || '').trim() || 'House Aurelin';
      game.startNewGame(appearance);
      game.state.dynasty = name;
      game.save();
    });

    const cont = $('#btn-continue');
    if (game.hasSave()) {
      cont.classList.remove('hide');
      cont.addEventListener('click', function () {
        SK.Audio.resume();
        SK.Audio.confirm();
        if (game.load()) game.continueGame();
        else game.toast('That save could not be read. Start a new campaign.', 'bad');
      });
      $('#btn-new').textContent = 'New campaign';
    }

    /* ------------------------------------ keep the save honest on exit */
    window.addEventListener('beforeunload', function () {
      if (game.mode !== 'title' && game.mode !== 'boot') game.save();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && game.mode !== 'title' && game.mode !== 'boot') game.save();
    });

    // Clicking the world re-captures the mouse after a panel or a tab switch.
    canvas.addEventListener('click', function () {
      if ((game.mode === 'planet' || game.mode === 'battle' || game.mode === 'galaxy') &&
        !game.ui.openPanel && !document.pointerLockElement) {
        game.input.requestLock();
      }
    });

    game.setMode('title');
    game.start();
  };
})(window.SK);
