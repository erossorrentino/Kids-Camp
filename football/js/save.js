/* Gridiron Kings — save data. Browser storage is the working copy; when the page runs as a
   Claude artifact with the db capability, the save is also mirrored to the viewer's private
   document so progress follows them between devices. */
(function () {
  'use strict';
  const FG = (window.FG = window.FG || {});
  const D = FG.data;
  const KEY = 'gridironkings.save.v1';
  const S = { data: null, cloudDoc: null, cloudBusy: false, cloudDirty: false, cloudTimer: 0, onCloudLoad: null };

  function fresh() {
    const owned = D.starterSquad();
    return {
      v: 1, stamp: 0, seed: Math.floor(Math.random() * 1e6) + 1,
      coins: 2000, owned, newIds: [],
      lineup: D.bestLineup(owned),
      packs: { rookie: 3 }, rookieGift: true, dailyClaim: '',
      division: 10, divPts: 0,
      stats: { played: 0, w: 0, d: 0, l: 0, pf: 0, pa: 0, tds: 0 },
      market: { seed: 1 },
      club: { name: 'Capital Kings', kit: 0 },
      settings: { sound: true, qtr: 2, quality: 1, autoSwitch: true, gfxSafe: 0 },
      onboarded: false, helpSeen: false,
    };
  }

  function repair(d) {
    const f = fresh();
    if (!d || typeof d !== 'object' || d.v !== 1) return f;
    const needGift = !d.rookieGift;
    Object.keys(f).forEach((k) => { if (d[k] == null) d[k] = f[k]; });
    ['stats', 'market', 'club', 'settings'].forEach((k) => { d[k] = Object.assign({}, f[k], d[k]); });
    d.owned = (Array.isArray(d.owned) ? d.owned : []).filter((id, i, a) => D.byId[id] && a.indexOf(id) === i);
    if (d.owned.length < 23) d.owned = d.owned.concat(f.owned.filter((id) => !d.owned.includes(id)));
    const slots = Array.isArray(d.lineup) ? d.lineup : [];
    const ok = slots.length === D.LINEUP.length && slots.every((id, i) => d.owned.includes(id) && slots.indexOf(id) === i);
    if (!ok) d.lineup = D.bestLineup(d.owned);
    d.coins = Math.max(0, Math.floor(+d.coins || 0));
    d.division = Math.min(10, Math.max(1, Math.floor(+d.division || 10)));
    d.newIds = Array.isArray(d.newIds) ? d.newIds : [];
    d.packs = Object.assign({}, d.packs);
    if (needGift) { d.packs.rookie = (d.packs.rookie || 0) + 3; d.rookieGift = true; }
    return d;
  }

  S.load = function () {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
    S.data = repair(d);
    return S.data;
  };

  S.commit = function () {
    S.data.stamp = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(S.data)); } catch (e) { /* storage unavailable: play on in memory */ }
    S.cloudDirty = true;
    clearTimeout(S.cloudTimer);
    S.cloudTimer = setTimeout(pushCloud, 1500);
  };

  S.reset = function () { S.data = fresh(); S.commit(); return S.data; };

  function pushCloud() {
    if (!S.cloudDoc || S.cloudBusy || !S.cloudDirty) return;
    S.cloudBusy = true; S.cloudDirty = false;
    S.cloudDoc.set(JSON.parse(JSON.stringify(S.data)))
      .catch(() => { /* not writable for this viewer; browser storage still holds the save */ })
      .then(() => { S.cloudBusy = false; if (S.cloudDirty) S.cloudTimer = setTimeout(pushCloud, 1500); });
  }

  S.initCloud = async function () {
    try {
      if (!window.claude || !window.claude.use) return;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return;
      const id = await user.id();
      if (!id) return;
      const doc = db.doc('data/users/' + id + '/save');
      const snap = await doc.get();
      S.cloudDoc = doc;
      if (snap.exists) {
        const remote = snap.data();
        if (remote && remote.v === 1 && (remote.stamp || 0) > (S.data.stamp || 0)) {
          S.data = repair(JSON.parse(JSON.stringify(remote)));
          try { localStorage.setItem(KEY, JSON.stringify(S.data)); } catch (e) { /* ignore */ }
          if (S.onCloudLoad) S.onCloudLoad();
          return;
        }
      }
      if (S.data.stamp) { S.cloudDirty = true; pushCloud(); }
    } catch (e) { /* cloud save is optional */ }
  };

  FG.save = S;
})();
