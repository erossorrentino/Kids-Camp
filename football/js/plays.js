/* Gridiron Kings — playbook: formations, routes, coverage zones, offensive and defensive plays.
   Offense frame: f = yards downfield from the line of scrimmage (negative = backfield),
   s = yards to the offense's right. Route points use [f, out] where out > 0 means toward
   the receiver's own sideline. */
(function () {
  'use strict';
  const FG = (window.FG = window.FG || {});

  const OL = { LT: [-0.9, -2.8], LG: [-0.8, -1.4], C: [-0.7, 0], RG: [-0.8, 1.4], RT: [-0.9, 2.8] };
  const FORMS = {
    gun: Object.assign({ QB: [-5, 0], RB: [-5, 1.8], X: [-1, -17], Z: [-1.6, 15], SL: [-1.6, -9], TE: [-1, 4.3] }, OL),
    single: Object.assign({ QB: [-1.5, 0], RB: [-6.5, 0], X: [-1, -17], Z: [-1.6, 15], SL: [-1.6, -9], TE: [-1, 4.3] }, OL),
    fg: Object.assign({ QB: [-7, 0], K: [-9.8, -2.2], X: [-1.6, -5.4], Z: [-1.6, 5.4], SL: [-1, -4.2], TE: [-1, 4.2] }, OL),
    punt: Object.assign({ QB: [-5.5, 0.9], K: [-14, 0], X: [-1, -22], Z: [-1, 22], SL: [-1.2, -4.3], TE: [-1.2, 4.3] }, OL),
  };

  /* defense alignment in the offense frame; a string s means "line up over that receiver" */
  const DFORM = { LE: [1, -3.9], DT1: [1, -1.2], DT2: [1, 1.2], RE: [1, 3.9], WLB: [4.6, -4.8], MLB: [4.9, 0], SLB: [4.6, 4.8], CB1: [6, 'X'], CB2: [6, 'Z'], FS: [12, -4], SS: [10, 5] };

  /* zone landmarks [f, s, radius, deep] */
  const ZONES = {
    flatL: [5, -15, 7], flatR: [5, 15, 7], hookL: [8, -6, 7], hookR: [8, 6, 7], mid: [9, 0, 7],
    deepL: [17, -11, 11, 1], deepR: [17, 11, 11, 1], deep3L: [16, -16, 10, 1], deep3M: [19, 0, 11, 1], deep3R: [16, 16, 10, 1], deepM: [18, 0, 12, 1],
  };

  const ROUTES = {
    go: { pts: [[2, 0], [45, 0.6]] },
    slant: { pts: [[2.5, 0], [12, -9]] },
    post: { pts: [[11, 0], [30, -12]] },
    corner: { pts: [[11, 0], [25, 9]] },
    out: { pts: [[9, 0], [9.6, 3], [9.6, 13]], settle: true },
    dig: { pts: [[12, 0], [12.6, -3], [12.6, -18]] },
    curl: { pts: [[11, 0], [9, -1]], settle: true },
    hitch: { pts: [[6, 0], [5, 0]], settle: true },
    seam: { pts: [[3, 0], [40, -0.6]] },
    flat: { pts: [[1.5, 1.5], [3, 9]] },
    drag: { pts: [[2.5, -1], [4, -26]] },
    swing: { pts: [[-1, 3], [1, 9], [4, 13]] },
    screen: { pts: [[-2.5, 3], [-2.2, 6.5]], settle: true },
  };

  const OFF = [
    { id: 'slants', name: 'Quick Slants', type: 'pass', form: 'gun', drop: 0.9, routes: { X: 'slant', Z: 'slant', SL: 'flat', TE: 'hitch', RB: 'block' }, read: ['Z', 'X', 'SL', 'TE'], tip: 'Quick throws to receivers cutting inside' },
    { id: 'verts', name: 'Four Verticals', type: 'pass', form: 'gun', drop: 1.9, routes: { X: 'go', Z: 'go', SL: 'seam', TE: 'seam', RB: 'swing' }, read: ['SL', 'TE', 'Z', 'X', 'RB'], tip: 'Everybody goes deep' },
    { id: 'mesh', name: 'Mesh Cross', type: 'pass', form: 'gun', drop: 1.3, routes: { X: 'drag', Z: 'corner', SL: 'curl', TE: 'drag', RB: 'flat' }, read: ['X', 'TE', 'SL', 'RB', 'Z'], tip: 'Crossing routes that beat man coverage' },
    { id: 'postcorner', name: 'Post Corner', type: 'pass', form: 'gun', drop: 1.7, routes: { X: 'post', Z: 'corner', SL: 'dig', TE: 'block', RB: 'block' }, read: ['SL', 'Z', 'X'], tip: 'Extra blockers for a big shot downfield' },
    { id: 'pa', name: 'Play Action', type: 'pass', form: 'single', pa: true, drop: 2.0, routes: { X: 'go', Z: 'post', SL: 'out', TE: 'drag', RB: 'block' }, read: ['TE', 'Z', 'SL', 'X'], tip: 'Fake the handoff, then throw deep' },
    { id: 'screen', name: 'HB Screen', type: 'pass', form: 'gun', screen: true, drop: 1.5, routes: { X: 'go', Z: 'go', SL: 'curl', TE: 'block', RB: 'screen' }, read: ['RB'], tip: 'Let them rush, then dump it to the back' },
    { id: 'dive', name: 'HB Dive', type: 'run', form: 'single', hole: 1.5, routes: {}, tip: 'Power run straight up the middle' },
    { id: 'toss', name: 'HB Toss', type: 'run', form: 'single', hole: 9, toss: true, routes: {}, tip: 'Pitch it wide and race to the edge' },
  ];
  const SPECIAL = [
    { id: 'fg', name: 'Field Goal', special: true, form: 'fg', tip: 'Kick it through the posts for 3 points' },
    { id: 'punt', name: 'Punt', special: true, form: 'punt', tip: 'Boot it deep into their half' },
  ];
  const FOUR = ['LE', 'DT1', 'DT2', 'RE'];
  const DEF = [
    { id: 'cov2', name: 'Cover 2', rush: FOUR, cover: { CB1: ['zone', 'flatL'], CB2: ['zone', 'flatR'], WLB: ['zone', 'hookL'], MLB: ['zone', 'mid'], SLB: ['zone', 'hookR'], FS: ['zone', 'deepL'], SS: ['zone', 'deepR'] }, align: { FS: [13, -10], SS: [13, 10], CB1: [4], CB2: [4] }, tip: 'Two safeties deep, corners guard the flats' },
    { id: 'cov3', name: 'Cover 3', rush: FOUR, cover: { CB1: ['zone', 'deep3L'], CB2: ['zone', 'deep3R'], FS: ['zone', 'deep3M'], SS: ['zone', 'flatR'], WLB: ['zone', 'flatL'], MLB: ['zone', 'hookL'], SLB: ['zone', 'hookR'] }, align: { CB1: [7], CB2: [7], FS: [15, 0], SS: [7, 9] }, tip: 'Three deep zones to stop the long ball' },
    { id: 'man', name: 'Man Press', rush: FOUR, cover: { CB1: ['man', 'X'], CB2: ['man', 'Z'], SS: ['man', 'TE'], WLB: ['man', 'SL'], MLB: ['man', 'RB'], SLB: ['zone', 'hookR'], FS: ['zone', 'deepM'] }, align: { CB1: [1.3], CB2: [1.3], WLB: [4.5, 'SL'], SS: [6, 'TE'] }, tip: 'Every receiver gets a shadow' },
    { id: 'blitz', name: 'LB Blitz', rush: FOUR.concat(['WLB', 'SLB']), cover: { CB1: ['man', 'X'], CB2: ['man', 'Z'], SS: ['man', 'TE'], MLB: ['man', 'RB'], FS: ['man', 'SL'] }, align: { WLB: [2.6, -2.6], SLB: [2.6, 2.6], FS: [8, 'SL'], SS: [6, 'TE'] }, tip: 'Send six and hit the quarterback' },
    { id: 'runstop', name: 'Run Stop', rush: FOUR.concat(['MLB']), cover: { CB1: ['man', 'X'], CB2: ['man', 'Z'], SS: ['man', 'TE'], WLB: ['man', 'RB'], SLB: ['zone', 'hookR'], FS: ['zone', 'deepM'] }, align: { SS: [4.5, 5.6], MLB: [3.4, 0], FS: [10, -2] }, tip: 'Load the box and stuff the run' },
    { id: 'prevent', name: 'Prevent', rush: ['LE', 'DT1', 'RE'], cover: { CB1: ['zone', 'deep3L'], CB2: ['zone', 'deep3R'], FS: ['zone', 'deep3M'], SS: ['zone', 'hookR'], WLB: ['zone', 'hookL'], MLB: ['zone', 'mid'], DT2: ['zone', 'mid'], SLB: ['zone', 'flatR'] }, align: { CB1: [9], CB2: [9], FS: [20, 0], SS: [11, 6] }, tip: 'Give up short gains, never the big one' },
  ];

  const byId = {};
  OFF.concat(SPECIAL, DEF).forEach((p) => (byId[p.id] = p));
  const RECV_ORDER = ['X', 'SL', 'TE', 'Z', 'RB'];
  FG.plays = { FORMS, DFORM, ZONES, ROUTES, OFF, SPECIAL, DEF, byId, RECV_ORDER };
})();
