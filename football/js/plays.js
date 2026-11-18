/* Gridiron Kings — playbook: formations, routes, coverage zones, offensive and defensive plays.
   Offense frame: f = yards downfield from the line of scrimmage (negative = backfield),
   s = yards to the offense's right. Route points use [f, out] where out > 0 means toward
   the receiver's own sideline. */
(function () {
  'use strict';
  const FG = (window.FG = window.FG || {});

  const OL = { LT: [-0.9, -2.8], LG: [-0.8, -1.4], C: [-0.7, 0], RG: [-0.8, 1.4], RT: [-0.9, 2.8] };
  const F = (o) => Object.assign(o, OL);
  const FORMS = {
    gun: F({ QB: [-5, 0], RB: [-5, 1.8], X: [-1, -17], Z: [-1.6, 15], SL: [-1.6, -9], TE: [-1, 4.3] }),
    trips: F({ QB: [-5, 0], RB: [-5, -1.8], X: [-1, -17], TE: [-1, 4.3], SL: [-1.6, 9.5], Z: [-1, 16.5] }),
    empty: F({ QB: [-5, 0], X: [-1, -18], SL: [-1.6, -12.5], RB: [-1.6, -7], TE: [-1.6, 8.5], Z: [-1, 16.5] }),
    pistol: F({ QB: [-3.6, 0], RB: [-6.6, 0], X: [-1, -16], SL: [-1.6, -8.5], TE: [-1, 4.3], Z: [-1.6, 14] }),
    single: F({ QB: [-1.5, 0], RB: [-6.5, 0], X: [-1, -17], Z: [-1.6, 15], SL: [-1.6, -9], TE: [-1, 4.3] }),
    iform: F({ QB: [-1.5, 0], SL: [-4.3, 0], RB: [-7, 0], X: [-1, -13], TE: [-1, 4.3], Z: [-1.6, 11] }),
    goal: F({ QB: [-1.5, 0], RB: [-6, 0], X: [-1, -4.3], SL: [-1.4, -5.8], TE: [-1, 4.3], Z: [-1.4, 5.8] }),
    fg: F({ QB: [-7, 0], K: [-9.8, -2.2], X: [-1.6, -5.4], Z: [-1.6, 5.4], SL: [-1, -4.2], TE: [-1, 4.2] }),
    punt: F({ QB: [-5.5, 0.9], K: [-14, 0], X: [-1, -22], Z: [-1, 22], SL: [-1.2, -4.3], TE: [-1.2, 4.3] }),
  };
  /* formations where the quarterback takes a shotgun snap */
  const SHOTGUN = { gun: true, trips: true, empty: true, pistol: true };
  const FORM_TABS = [
    ['gun', 'Shotgun'], ['trips', 'Trips'], ['empty', 'Empty'], ['pistol', 'Pistol'], ['single', 'Singleback'], ['iform', 'I-Form'], ['goal', 'Goal Line'],
  ];

  /* defense alignment in the offense frame; a string s means "line up over that receiver" */
  const DFORM = { LE: [1, -3.9], DT1: [1, -1.2], DT2: [1, 1.2], RE: [1, 3.9], WLB: [4.6, -4.8], MLB: [4.9, 0], SLB: [4.6, 4.8], CB1: [6, 'X'], CB2: [6, 'Z'], FS: [12, -4], SS: [10, 5] };

  /* zone landmarks [f, s, radius, deep] */
  const ZONES = {
    flatL: [5, -15, 7], flatR: [5, 15, 7], hookL: [8, -6, 7], hookR: [8, 6, 7], mid: [9, 0, 7],
    deepL: [17, -11, 11, 1], deepR: [17, 11, 11, 1], deep3L: [16, -16, 10, 1], deep3M: [19, 0, 11, 1], deep3R: [16, 16, 10, 1], deepM: [18, 0, 12, 1],
    q1: [16, -17, 9, 1], q2: [17, -6, 9, 1], q3: [17, 6, 9, 1], q4: [16, 17, 9, 1],
  };

  const ROUTES = {
    go: { pts: [[2, 0], [45, 0.6]] },
    fade: { pts: [[2, 0], [40, 3]] },
    slant: { pts: [[2.5, 0], [12, -9]] },
    post: { pts: [[11, 0], [30, -12]] },
    corner: { pts: [[11, 0], [25, 9]] },
    out: { pts: [[9, 0], [9.6, 3], [9.6, 13]], settle: true },
    quickout: { pts: [[4, 0], [4.4, 3], [4.4, 10]], settle: true },
    dig: { pts: [[12, 0], [12.6, -3], [12.6, -18]] },
    in: { pts: [[6, 0], [6.4, -3], [6.4, -14]] },
    cross: { pts: [[5, 0], [11, -26]] },
    curl: { pts: [[11, 0], [9, -1]], settle: true },
    comeback: { pts: [[14, 0], [11.5, 3]], settle: true },
    hitch: { pts: [[6, 0], [5, 0]], settle: true },
    stick: { pts: [[5.5, 0], [5.5, 2.5]], settle: true },
    sit: { pts: [[8, 0], [7.5, -0.5]], settle: true },
    seam: { pts: [[3, 0], [40, -0.6]] },
    flat: { pts: [[1.5, 1.5], [3, 9]] },
    drag: { pts: [[2.5, -1], [4, -26]] },
    swing: { pts: [[-1, 3], [1, 9], [4, 13]] },
    wheel: { pts: [[-0.5, 3], [2, 9], [30, 10]] },
    screen: { pts: [[-2.5, 3], [-2.2, 6.5]], settle: true },
  };
  /* routes offered when changing a receiver's route before the snap */
  const HOT = ['go', 'slant', 'curl', 'out', 'in', 'post', 'corner', 'flat', 'block'];
  const HOT_RB = ['swing', 'wheel', 'flat', 'slant', 'curl', 'block'];
  const ROUTE_NAME = { go: 'Go', fade: 'Fade', slant: 'Slant', post: 'Post', corner: 'Corner', out: 'Out', quickout: 'Quick Out', dig: 'Dig', in: 'In', cross: 'Cross', curl: 'Curl', comeback: 'Comeback', hitch: 'Hitch', stick: 'Stick', sit: 'Sit', seam: 'Seam', flat: 'Flat', drag: 'Drag', swing: 'Swing', wheel: 'Wheel', screen: 'Screen', block: 'Block' };

  /* cat: what kind of play it is, used by the computer coach and the "Coach Picks" tab */
  const OFF = [
    // Shotgun
    { id: 'slants', name: 'Quick Slants', type: 'pass', form: 'gun', cat: 'quick', drop: 0.9, routes: { X: 'slant', Z: 'slant', SL: 'flat', TE: 'hitch', RB: 'block' }, read: ['Z', 'X', 'SL', 'TE'], tip: 'Quick throws to receivers cutting inside' },
    { id: 'verts', name: 'Four Verticals', type: 'pass', form: 'gun', cat: 'deep', drop: 1.9, routes: { X: 'go', Z: 'go', SL: 'seam', TE: 'seam', RB: 'swing' }, read: ['SL', 'TE', 'Z', 'X', 'RB'], tip: 'Everybody goes deep' },
    { id: 'mesh', name: 'Mesh Cross', type: 'pass', form: 'gun', cat: 'mid', drop: 1.3, routes: { X: 'drag', Z: 'corner', SL: 'curl', TE: 'drag', RB: 'flat' }, read: ['X', 'TE', 'SL', 'RB', 'Z'], tip: 'Crossing routes that beat man coverage' },
    { id: 'postcorner', name: 'Post Corner', type: 'pass', form: 'gun', cat: 'deep', drop: 1.7, routes: { X: 'post', Z: 'corner', SL: 'dig', TE: 'block', RB: 'block' }, read: ['SL', 'Z', 'X'], tip: 'Extra blockers for a big shot downfield' },
    { id: 'screen', name: 'HB Screen', type: 'pass', form: 'gun', cat: 'screen', screen: true, drop: 1.5, routes: { X: 'go', Z: 'go', SL: 'curl', TE: 'block', RB: 'screen' }, read: ['RB'], tip: 'Let them rush, then dump it to the back' },
    { id: 'gunzone', name: 'Inside Zone', type: 'run', form: 'gun', cat: 'run', hole: 2.2, routes: {}, tip: 'Hand off and find a crease inside' },
    { id: 'draw', name: 'HB Draw', type: 'run', form: 'gun', cat: 'run', hole: 0.6, delay: 0.55, routes: {}, tip: 'Looks like a pass, then the back runs it up the gut' },
    // Trips
    { id: 'flood', name: 'Trips Flood', type: 'pass', form: 'trips', cat: 'mid', drop: 1.6, routes: { X: 'dig', Z: 'go', SL: 'corner', TE: 'flat', RB: 'block' }, read: ['SL', 'TE', 'X', 'Z'], tip: 'Three routes at three depths on one side' },
    { id: 'smash', name: 'Smash', type: 'pass', form: 'trips', cat: 'mid', drop: 1.4, routes: { X: 'post', Z: 'hitch', SL: 'corner', TE: 'seam', RB: 'swing' }, read: ['Z', 'SL', 'TE', 'X', 'RB'], tip: 'Short hitch under a deep corner route' },
    { id: 'stick', name: 'Stick', type: 'pass', form: 'trips', cat: 'quick', drop: 1.0, routes: { X: 'slant', Z: 'fade', SL: 'stick', TE: 'flat', RB: 'block' }, read: ['SL', 'TE', 'X', 'Z'], tip: 'Fast and safe: sit down in the open spot' },
    { id: 'tripszone', name: 'Weak Zone', type: 'run', form: 'trips', cat: 'run', hole: -2.6, routes: {}, tip: 'Run away from the three receivers' },
    // Empty
    { id: 'emptyquick', name: 'Empty Quick', type: 'pass', form: 'empty', cat: 'quick', drop: 0.85, routes: { X: 'hitch', SL: 'quickout', RB: 'slant', TE: 'hitch', Z: 'slant' }, read: ['RB', 'SL', 'TE', 'Z', 'X'], tip: 'Five receivers, ball out in a flash' },
    { id: 'emptyverts', name: 'Empty Verts', type: 'pass', form: 'empty', cat: 'deep', drop: 1.9, routes: { X: 'go', SL: 'seam', RB: 'curl', TE: 'seam', Z: 'go' }, read: ['SL', 'TE', 'RB', 'Z', 'X'], tip: 'Stretch the defense with four deep routes' },
    { id: 'drive', name: 'Drive', type: 'pass', form: 'empty', cat: 'mid', drop: 1.5, routes: { X: 'dig', SL: 'curl', RB: 'flat', TE: 'cross', Z: 'comeback' }, read: ['TE', 'SL', 'X', 'RB', 'Z'], tip: 'A crossing tight end under a deep dig' },
    // Pistol
    { id: 'pistolpower', name: 'Pistol Power', type: 'run', form: 'pistol', cat: 'run', hole: 3, routes: {}, tip: 'Downhill run behind the pulling guard' },
    { id: 'boot', name: 'PA Boot', type: 'pass', form: 'pistol', cat: 'pa', pa: true, drop: 2.0, routes: { X: 'cross', Z: 'go', SL: 'corner', TE: 'flat', RB: 'block' }, read: ['TE', 'X', 'SL', 'Z'], tip: 'Fake the run and roll out' },
    { id: 'curlflat', name: 'Curl Flat', type: 'pass', form: 'pistol', cat: 'quick', drop: 1.3, routes: { X: 'curl', Z: 'curl', SL: 'flat', TE: 'sit', RB: 'block' }, read: ['X', 'Z', 'TE', 'SL'], tip: 'Curls on the outside, flats underneath' },
    // Singleback
    { id: 'dive', name: 'HB Dive', type: 'run', form: 'single', cat: 'run', hole: 1.5, routes: {}, tip: 'Power run straight up the middle' },
    { id: 'toss', name: 'HB Toss', type: 'run', form: 'single', cat: 'run', hole: 9, toss: true, routes: {}, tip: 'Pitch it wide and race to the edge' },
    { id: 'stretch', name: 'Outside Zone', type: 'run', form: 'single', cat: 'run', hole: 6, routes: {}, tip: 'Stretch it outside and cut upfield' },
    { id: 'pa', name: 'Play Action', type: 'pass', form: 'single', cat: 'pa', pa: true, drop: 2.0, routes: { X: 'go', Z: 'post', SL: 'out', TE: 'drag', RB: 'block' }, read: ['TE', 'Z', 'SL', 'X'], tip: 'Fake the handoff, then throw deep' },
    { id: 'comebacks', name: 'Comebacks', type: 'pass', form: 'single', cat: 'mid', drop: 1.7, routes: { X: 'comeback', Z: 'comeback', SL: 'dig', TE: 'seam', RB: 'block' }, read: ['SL', 'TE', 'Z', 'X'], tip: 'Receivers sprint deep, then turn back' },
    // I-Form
    { id: 'power', name: 'Power O', type: 'run', form: 'iform', cat: 'run', hole: 2.8, routes: {}, tip: 'Fullback leads the way off tackle' },
    { id: 'iso', name: 'HB Iso', type: 'run', form: 'iform', cat: 'run', hole: 1, routes: {}, tip: 'Fullback blasts the linebacker, back follows' },
    { id: 'tosscrack', name: 'Toss Crack', type: 'run', form: 'iform', cat: 'run', hole: -9, toss: true, routes: {}, tip: 'Pitch to the left side and turn the corner' },
    { id: 'ipa', name: 'PA Deep Shot', type: 'pass', form: 'iform', cat: 'pa', pa: true, drop: 2.1, routes: { X: 'post', Z: 'go', TE: 'seam', SL: 'flat', RB: 'block' }, read: ['TE', 'Z', 'X', 'SL'], tip: 'Sell the run, then bomb it' },
    // Goal Line
    { id: 'sneak', name: 'QB Sneak', type: 'run', form: 'goal', cat: 'power', sneak: true, hole: 0.4, routes: {}, tip: 'Quarterback pushes forward for a yard' },
    { id: 'gldive', name: 'Goal Line Dive', type: 'run', form: 'goal', cat: 'power', hole: 1.6, routes: {}, tip: 'Everybody blocks, back dives in' },
    { id: 'fades', name: 'Corner Fade', type: 'pass', form: 'goal', cat: 'quick', drop: 1.1, routes: { X: 'fade', Z: 'fade', SL: 'flat', TE: 'stick', RB: 'block' }, read: ['Z', 'X', 'TE', 'SL'], tip: 'Toss it up to the corner of the end zone' },
    { id: 'glpa', name: 'PA Flat', type: 'pass', form: 'goal', cat: 'pa', pa: true, drop: 1.6, routes: { X: 'slant', Z: 'drag', SL: 'flat', TE: 'stick', RB: 'block' }, read: ['SL', 'TE', 'X', 'Z'], tip: 'Fake the dive, hit the man in the flat' },
  ];
  const SPECIAL = [
    { id: 'fg', name: 'Field Goal', special: true, form: 'fg', tip: 'Kick it through the posts for 3 points' },
    { id: 'punt', name: 'Punt', special: true, form: 'punt', tip: 'Boot it deep into their half' },
  ];
  const FOUR = ['LE', 'DT1', 'DT2', 'RE'];
  const DEF = [
    { id: 'cov2', name: 'Cover 2', cat: 'zone', rush: FOUR, cover: { CB1: ['zone', 'flatL'], CB2: ['zone', 'flatR'], WLB: ['zone', 'hookL'], MLB: ['zone', 'mid'], SLB: ['zone', 'hookR'], FS: ['zone', 'deepL'], SS: ['zone', 'deepR'] }, align: { FS: [13, -10], SS: [13, 10], CB1: [4], CB2: [4] }, tip: 'Two safeties deep, corners guard the flats' },
    { id: 'cov3', name: 'Cover 3', cat: 'zone', rush: FOUR, cover: { CB1: ['zone', 'deep3L'], CB2: ['zone', 'deep3R'], FS: ['zone', 'deep3M'], SS: ['zone', 'flatR'], WLB: ['zone', 'flatL'], MLB: ['zone', 'hookL'], SLB: ['zone', 'hookR'] }, align: { CB1: [7], CB2: [7], FS: [15, 0], SS: [7, 9] }, tip: 'Three deep zones to stop the long ball' },
    { id: 'cov4', name: 'Cover 4', cat: 'zone', rush: FOUR, cover: { CB1: ['zone', 'q1'], FS: ['zone', 'q2'], SS: ['zone', 'q3'], CB2: ['zone', 'q4'], WLB: ['zone', 'hookL'], MLB: ['zone', 'mid'], SLB: ['zone', 'hookR'] }, align: { CB1: [7], CB2: [7], FS: [13, -6], SS: [13, 6] }, tip: 'Four deep zones, nothing gets behind you' },
    { id: 'man', name: 'Man Press', cat: 'man', rush: FOUR, cover: { CB1: ['man', 'X'], CB2: ['man', 'Z'], SS: ['man', 'TE'], WLB: ['man', 'SL'], MLB: ['man', 'RB'], SLB: ['zone', 'hookR'], FS: ['zone', 'deepM'] }, align: { CB1: [1.3], CB2: [1.3], WLB: [4.5], SS: [6] }, tip: 'Every receiver gets a shadow' },
    { id: 'cov2man', name: '2 Man Under', cat: 'man', rush: FOUR, cover: { CB1: ['man', 'X'], CB2: ['man', 'Z'], WLB: ['man', 'SL'], SLB: ['man', 'TE'], MLB: ['man', 'RB'], FS: ['zone', 'deepL'], SS: ['zone', 'deepR'] }, align: { CB1: [2], CB2: [2], FS: [13, -10], SS: [13, 10] }, tip: 'Tight man coverage with two safeties over the top' },
    { id: 'blitz', name: 'LB Blitz', cat: 'blitz', rush: FOUR.concat(['WLB', 'SLB']), cover: { CB1: ['man', 'X'], CB2: ['man', 'Z'], SS: ['man', 'TE'], MLB: ['man', 'RB'], FS: ['man', 'SL'] }, align: { WLB: [2.6, -2.6], SLB: [2.6, 2.6], FS: [8], SS: [6] }, tip: 'Send six and hit the quarterback' },
    { id: 'ssblitz', name: 'Safety Blitz', cat: 'blitz', rush: FOUR.concat(['SS']), cover: { CB1: ['man', 'X'], CB2: ['man', 'Z'], WLB: ['man', 'SL'], SLB: ['man', 'TE'], MLB: ['man', 'RB'], FS: ['zone', 'deepM'] }, align: { SS: [4, 5.5], FS: [14, 0] }, tip: 'The safety sneaks down and blitzes off the edge' },
    { id: 'firezone', name: 'Fire Zone', cat: 'blitz', rush: ['LE', 'DT2', 'RE', 'WLB', 'MLB'], cover: { CB1: ['zone', 'deep3L'], CB2: ['zone', 'deep3R'], FS: ['zone', 'deep3M'], DT1: ['zone', 'hookL'], SLB: ['zone', 'hookR'], SS: ['zone', 'flatR'] }, align: { WLB: [2.6, -3], MLB: [2.8, 0.6], CB1: [7], CB2: [7], FS: [15, 0] }, tip: 'Linebackers blitz while a lineman drops into coverage' },
    { id: 'cov0', name: 'Cover 0 Blitz', cat: 'blitz', rush: FOUR.concat(['WLB', 'MLB', 'SLB']), cover: { CB1: ['man', 'X'], CB2: ['man', 'Z'], SS: ['man', 'TE'], FS: ['man', 'SL'] }, align: { WLB: [2.4, -2.8], MLB: [2.6, 0], SLB: [2.4, 2.8], CB1: [1.3], CB2: [1.3], FS: [6], SS: [5] }, tip: 'Send everyone. Huge risk, huge reward' },
    { id: 'runstop', name: 'Run Stop', cat: 'run', rush: FOUR.concat(['MLB']), cover: { CB1: ['man', 'X'], CB2: ['man', 'Z'], SS: ['man', 'TE'], WLB: ['man', 'RB'], SLB: ['zone', 'hookR'], FS: ['zone', 'deepM'] }, align: { SS: [4.5, 5.6], MLB: [3.4, 0], FS: [10, -2] }, tip: 'Load the box and stuff the run' },
    { id: 'goalline', name: 'Goal Line D', cat: 'run', rush: FOUR.concat(['MLB', 'SLB']), cover: { CB1: ['man', 'X'], CB2: ['man', 'Z'], SS: ['man', 'TE'], WLB: ['man', 'RB'], FS: ['man', 'SL'] }, align: { MLB: [2.6, -0.8], SLB: [2.6, 3.4], CB1: [1.5], CB2: [1.5], SS: [3.5], FS: [6] }, tip: 'Everybody up close. Nothing gets in' },
    { id: 'prevent', name: 'Prevent', cat: 'prevent', rush: ['LE', 'DT1', 'RE'], cover: { CB1: ['zone', 'deep3L'], CB2: ['zone', 'deep3R'], FS: ['zone', 'deep3M'], SS: ['zone', 'hookR'], WLB: ['zone', 'hookL'], MLB: ['zone', 'mid'], DT2: ['zone', 'mid'], SLB: ['zone', 'flatR'] }, align: { CB1: [9], CB2: [9], FS: [20, 0], SS: [11, 6] }, tip: 'Give up short gains, never the big one' },
  ];
  const DEF_TABS = [['zone', 'Zone'], ['man', 'Man'], ['blitz', 'Blitz'], ['run', 'Run & Prevent']];

  const byId = {};
  OFF.concat(SPECIAL, DEF).forEach((p) => (byId[p.id] = p));
  const RECV_ORDER = ['X', 'SL', 'TE', 'Z', 'RB'];
  FG.plays = { FORMS, SHOTGUN, FORM_TABS, DFORM, ZONES, ROUTES, HOT, HOT_RB, ROUTE_NAME, OFF, SPECIAL, DEF, DEF_TABS, byId, RECV_ORDER };
})();
