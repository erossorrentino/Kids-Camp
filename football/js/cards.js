/* Gridiron Kings — player cards: generated portraits, team crests and card markup. */
(function () {
  'use strict';
  const FG = (window.FG = window.FG || {});
  const U = FG.util, D = FG.data;

  const SKIN = ['#f6d3b3', '#eebf98', '#dba57c', '#b97f55', '#8a5a3a', '#5e3b26'];
  const HAIR = ['#1b1512', '#3b2416', '#6b4423', '#c9a45c', '#a8431f', '#8d8d8d', '#e9e4d4'];

  /* ---------- crests ---------- */
  const SHIELDS = [
    'M4 3h24v13c0 8-6 12-12 14C10 28 4 24 4 16z',
    'M16 2l12 4v10c0 8-6 12-12 14C10 28 4 24 4 16V6z',
    'M16 2a14 14 0 1 1 0 28 14 14 0 0 1 0-28z',
    'M5 4l11-2 11 2 1 14-12 12L4 18z',
  ];
  function crest(clubLike, cls) {
    const c = clubLike || { c1: '#888', c2: '#222', crest: 0, id: '?' };
    const sh = SHIELDS[(c.crest || 0) % SHIELDS.length];
    const id = 'cr' + (c.id || 'x') + (cls || '');
    const ink = U.lum(c.c1) > 0.6 ? '#10131a' : '#ffffff';
    const letter = U.esc((c.id || '?')[0]);
    return `<svg class="crest ${cls || ''}" viewBox="0 0 32 32" aria-hidden="true"><defs><clipPath id="${id}"><path d="${sh}"/></clipPath></defs>` +
      `<path d="${sh}" fill="${c.c1}"/><g clip-path="url(#${id})"><path d="M-2 22 34 6v8L-2 30z" fill="${c.c2}" opacity=".9"/></g>` +
      `<path d="${sh}" fill="none" stroke="${c.c2}" stroke-width="1.6"/>` +
      `<text x="16" y="20" text-anchor="middle" font-family="'Big Shoulders Display','Arial Narrow',Impact,sans-serif" font-weight="900" font-size="13" fill="${ink}" stroke="${c.c1}" stroke-width=".5" paint-order="stroke">${letter}</text></svg>`;
  }

  /* ---------- portraits ---------- */
  function avatar(p, kitColor, kitTrim) {
    const L = p.look;
    const skin = SKIN[L.skin % SKIN.length], shade = U.shade(skin, -0.18), hair = HAIR[L.hairCol % HAIR.length];
    const club = D.club(p.club) || { c1: '#555', c2: '#222' };
    const eye = L.eyeBlack ? `<rect x="41" y="62.5" width="13" height="3.4" rx="1.4" fill="#141414"/><rect x="66" y="62.5" width="13" height="3.4" rx="1.4" fill="#141414"/>` : '';
    const k1 = kitColor || club.c1, k2 = kitTrim || club.c2;
    const hs = L.hair % 8;
    let hairSvg = '';
    const crop = 'M32 52C28 20 92 20 88 52C86 40 78 33 60 33C42 33 34 40 32 52Z';
    if (hs === 0) hairSvg = `<path d="${crop}" fill="${hair}"/>`;
    else if (hs === 2) hairSvg = `<g fill="${hair}"><circle cx="60" cy="30" r="25"/><circle cx="39" cy="38" r="15"/><circle cx="81" cy="38" r="15"/><circle cx="33" cy="52" r="9"/><circle cx="87" cy="52" r="9"/></g>`;
    else if (hs === 3) hairSvg = `<path d="${crop}" fill="${hair}" opacity=".35"/><path d="M51 38C48 12 72 12 69 38Z" fill="${hair}"/>`;
    else if (hs === 4) hairSvg = `<path d="${crop}" fill="${hair}"/><path d="M33 46C26 70 29 90 39 97L41 58ZM87 46C94 70 91 90 81 97L79 58Z" fill="${hair}"/>`;
    else if (hs === 5) hairSvg = `<path d="M32 52C28 22 62 12 90 30C94 38 89 46 88 52C83 39 71 34 56 36C46 37 37 42 32 52Z" fill="${hair}"/>`;
    else if (hs === 6) hairSvg = `<path d="${crop}" fill="${hair}" opacity=".55"/>`;
    else if (hs === 7) hairSvg = `<path d="${crop}" fill="${hair}"/><path d="M32 47Q60 37 88 47L88 53Q60 43 32 53Z" fill="${k2}"/>`;
    let beard = '';
    if (L.beard === 1) beard = `<path d="M37 62C39 81 50 90 60 90C70 90 81 81 83 62C80 73 72 78 60 78C48 78 40 73 37 62Z" fill="${hair}" opacity=".28"/>`;
    else if (L.beard === 2) beard = `<path d="M36 60C37 82 50 92 60 92C70 92 83 82 84 60C80 71 72 73 60 73C48 73 40 71 36 60Z" fill="${hair}"/><path d="M50 76Q60 82 70 76Q60 79 50 76Z" fill="${shade}"/>`;
    else if (L.beard === 3) beard = `<path d="M49 71Q60 66 71 71Q60 74 49 71Z" fill="${hair}"/><path d="M54 80Q60 90 66 80Q60 84 54 80Z" fill="${hair}"/>`;
    const browY = 50 - (L.brow % 3);
    const browCol = U.shade(hair, hair === HAIR[6] || hair === HAIR[3] ? -0.45 : -0.1);
    return `<svg class="avatar" viewBox="0 0 120 124" aria-hidden="true">` +
      `<path d="M-6 124C-6 100 6 90 34 87L86 87C114 90 126 100 126 124Z" fill="${k1}"/>` +
      `<path d="M-6 124C-6 100 6 90 34 87L40 87C18 94 14 108 14 124Z" fill="#000" opacity=".14"/>` +
      `<path d="M4 102Q22 90 40 89M116 102Q98 90 80 89" stroke="#fff" stroke-opacity=".25" stroke-width="3" fill="none"/>` +
      `<path d="M42 89Q60 106 78 89L73 85Q60 98 47 85Z" fill="${k2}"/>` +
      `<path d="M46 74H74V91Q60 101 46 91Z" fill="${shade}"/>` +
      `<ellipse cx="33" cy="58" rx="5" ry="8" fill="${skin}"/><ellipse cx="87" cy="58" rx="5" ry="8" fill="${skin}"/>` +
      `<path d="M34 52C34 26 86 26 86 52C86 74 74 88 60 88C46 88 34 74 34 52Z" fill="${skin}"/>` +
      `<path d="M60 26C86 26 86 52 86 52C86 74 74 88 60 88C72 82 78 68 78 52C78 38 72 30 60 26Z" fill="${shade}" opacity=".35"/>` +
      beard + hairSvg + eye +
      `<path d="M41 ${browY}Q48 ${browY - 4} 55 ${browY}" stroke="${browCol}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M65 ${browY}Q72 ${browY - 4} 79 ${browY}" stroke="${browCol}" stroke-width="3" fill="none" stroke-linecap="round"/>` +
      `<ellipse cx="48" cy="57" rx="4.2" ry="3.4" fill="#fff"/><ellipse cx="72" cy="57" rx="4.2" ry="3.4" fill="#fff"/><circle cx="48.6" cy="57.3" r="2.2" fill="#22150e"/><circle cx="72.6" cy="57.3" r="2.2" fill="#22150e"/>` +
      `<path d="M58 60Q56 68 60 69Q64 68 62 60" fill="${shade}" opacity=".75"/>` +
      `<path d="M52 76Q60 82 68 76" stroke="#7a3b2e" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
      `</svg>`;
  }

  /* ---------- card ---------- */
  function statCells(p) {
    return D.CARD_STATS[p.pos].map(([k, l]) => `<span><b>${p.st[k]}</b>${l}</span>`).join('');
  }
  /* opts: { size, tag, attrs, cls, kit:[c1,c2] } */
  function card(p, opts) {
    opts = opts || {};
    const nameLen = p.last.length;
    const club = D.club(p.club);
    return `<div class="card t-${p.tier} ${opts.size ? 'card-' + opts.size : ''} ${opts.cls || ''}" data-pid="${p.id}" ${opts.attrs || ''}>` +
      `<div class="card-in">` +
      `<div class="card-fx"></div>` +
      `<div class="card-rate"><b>${p.ovr}</b><i>${p.pos}</i>${crest(club)}<em class="card-num">${p.num}</em></div>` +
      `<div class="card-face">${avatar(p, opts.kit && opts.kit[0], opts.kit && opts.kit[1])}</div>` +
      `<div class="card-name${nameLen > 8 ? ' long' : ''}${nameLen > 11 ? ' xlong' : ''}"><span>${U.esc(p.last)}</span></div>` +
      `<div class="card-stats">${statCells(p)}</div>` +
      `</div>` + (opts.tag ? `<div class="card-tag">${opts.tag}</div>` : '') + `</div>`;
  }

  /* compact token used on the squad board */
  function token(p, slot) {
    if (!p) return `<div class="tok tok-empty"><div class="tok-ring"><span>+</span></div><div class="tok-name">${D.ROLE_NAME[slot.role]}</div></div>`;
    const fit = D.posFit(p.pos, slot.pos);
    const fitCls = fit === 0 ? 'fit-ok' : fit >= -6 ? 'fit-near' : 'fit-bad';
    return `<div class="tok t-${p.tier}"><div class="tok-ring">${avatar(p)}<b class="tok-ovr">${p.ovr + fit}</b><i class="tok-pos ${fitCls}">${D.ROLE_NAME[slot.role]}</i></div><div class="tok-name">${U.esc(p.last)}</div></div>`;
  }

  FG.cards = { card, token, avatar, crest, SKIN, HAIR };
})();
