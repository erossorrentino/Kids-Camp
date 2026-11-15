'use strict';
/* ============================================================
   Instant replay: the last six seconds of play are recorded
   every simulation step. After a big play (a dunk, a made
   three, a buzzer beater) the broadcast cuts away at the next
   dead ball, wipes to a slow-motion replay from a cinematic
   angle, then wipes back to live action.
   ============================================================ */

const REP = { buf: [], max: 380, active: null, pending: null, lastAt: -99 };

function repSnap() {
  const b = G.ball, idx = (p) => (p ? G.players.indexOf(p) : -1);
  return {
    time: G.time, state: G.state, offense: G.offense,
    b: { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, state: b.state, visible: b.visible, holder: idx(b.holder), passTo: idx(b.passTo), shooter: idx(b.shooter), shotLive: b.shotLive },
    p: G.players.map((p) => ({
      x: p.x, y: p.y, z: p.z, face: p.face, vx: p.vx, vz: p.vz, act: p.act, actT: p.actT, actDur: p.actDur,
      mk: p.mv ? p.mv.kind : null, hasBall: p.hasBall, gather: p.gather, holdT: p.holdT, dribHand: p.dribHand, dribPhase: p.dribPhase,
      handsUp: p.handsUp, expectPass: p.expectPass, celebT: p.celebT, stam: p.stam,
      s: p.shot ? { type: p.shot.type, jumped: p.shot.jumped, released: p.shot.released, relT: p.shot.relT, ideal: p.shot.ideal, tJump: p.shot.tJump, tRel: p.shot.tRel, made: p.shot.made, timed: p.shot.timed } : null,
    })),
  };
}
function repApply(s) {
  const b = G.ball, at = (i) => (i >= 0 ? G.players[i] : null);
  G.state = s.state; G.offense = s.offense;
  Object.assign(b, { x: s.b.x, y: s.b.y, z: s.b.z, vx: s.b.vx, vy: s.b.vy, vz: s.b.vz, state: s.b.state, visible: s.b.visible, shotLive: s.b.shotLive });
  b.holder = at(s.b.holder); b.passTo = at(s.b.passTo); b.shooter = at(s.b.shooter);
  s.p.forEach((q, i) => {
    const p = G.players[i];
    p.x = q.x; p.y = q.y; p.z = q.z; p.face = q.face; p.vx = q.vx; p.vz = q.vz; p.act = q.act; p.actT = q.actT; p.actDur = q.actDur;
    p.hasBall = q.hasBall; p.gather = q.gather; p.holdT = q.holdT; p.dribHand = q.dribHand; p.dribPhase = q.dribPhase;
    p.handsUp = q.handsUp; p.expectPass = q.expectPass; p.celebT = q.celebT; p.stam = q.stam;
    p.mv = q.mk ? (p._repMv || (p._repMv = {})) : null; if (p.mv) p.mv.kind = q.mk;
    p.shot = q.s ? Object.assign(p._repShot || (p._repShot = {}), q.s) : null;
  });
}
/* keep the real objects so the live game resumes exactly where it stopped */
function repSave() {
  const s = repSnap();
  s.refs = G.players.map((p) => ({ shot: p.shot, mv: p.mv }));
  return s;
}
function repRestore(s) {
  repApply(s);
  G.players.forEach((p, i) => { p.shot = s.refs[i].shot; p.mv = s.refs[i].mv; });
}
function replayRecord() {
  if (G.state === 'none' || G.mode === 'threept' || G.attract) return;
  REP.buf.push(repSnap());
  if (REP.buf.length > REP.max) REP.buf.shift();
}
function replayReset() { REP.buf.length = 0; REP.pending = null; REP.active = null; REP.lastAt = -99; }
function replayFlag(kind, p) {
  if (SET.replays === false || G.attract || G.mode === 'threept' || REP.active) return;
  if (G.time - REP.lastAt < 18) return;
  REP.pending = { t: G.time, kind, idx: G.players.indexOf(p), side: p.team.dir };
}
/* called every frame; returns true while a replay owns the screen */
function replayTick(rdt, inp) {
  const A = REP.active;
  if (!A) {
    const P = REP.pending;
    if (P && !APP.screen && !APP.paused) {
      const since = G.time - P.t;
      if (since > 4) REP.pending = null;
      else if (since > 1.0 && (G.state === 'dead' || G.state === 'whistle' || G.state === 'ftcut' || G.state === 'periodEnd')) replayStart();
    }
    return false;
  }
  if (inp && (inp.pShoot || inp.pPass || inp.pMove || inp.mOk) && A.pos > 20) A.end = true;
  A.pos += rdt * 60 * A.speed;
  const i0 = Math.floor(A.pos);
  if (A.end || i0 >= A.frames.length - 1) { replayEnd(); return true; }
  repApply(A.frames[i0]); snapshotPrev();
  repApply(A.frames[i0 + 1]);
  R.alpha = A.pos - i0;
  // ease into extra-slow motion right around the moment itself
  const near = Math.abs(A.frames[i0].time - A.t);
  A.speed = near < 0.6 ? 0.32 : 0.55;
  renderFrame(rdt * A.speed, rdt);
  return true;
}
function replayStart() {
  const P = REP.pending; REP.pending = null;
  const frames = REP.buf.filter((f) => f.time >= P.t - 3.0 && f.time <= P.t + 0.9);
  if (frames.length < 60) return;
  REP.saved = repSave();
  REP.active = { frames, pos: 0, speed: 0.55, kind: P.kind, idx: P.idx, side: P.side, t: P.t, end: false };
  REP.lastAt = G.time;
  R.snapCam = true;
  replayWipe(true);
  $('#replayBug').classList.add('on'); $('#hud').classList.add('rep');
  if (AU.on) { const t = now(); noiseHit(t, 'bandpass', 1400, 0.7, 0.35, 0.25, AU.sfx, 0.12); }
}
function replayEnd() {
  repRestore(REP.saved);
  snapshotPrev();
  REP.active = null; REP.saved = null;
  R.snapCam = true; R.alpha = 1;
  replayWipe(false);
  $('#replayBug').classList.remove('on'); $('#hud').classList.remove('rep');
}
function replayWipe() {
  const w = $('#wipe');
  if (!w) return;
  const pl = REP.active ? G.players[REP.active.idx] : null, T = pl ? pl.team : G.teams[0];
  w.style.setProperty('--wc', T.def.c1);
  w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
}
/* cinematic replay camera */
function replayCam() {
  const A = REP.active;
  if (!A) return null;
  const p = G.players[A.idx], b = G.ball, s = A.side;
  const u = A.pos / A.frames.length;
  if (A.kind === 'dunk') {
    const ang = lerp(-0.5, 0.2, u);
    return { pos: V3(s * (CT.RIM_X - 22 * Math.cos(ang)), lerp(10, 12.5, u), 22 * Math.sin(ang) + 6), look: V3(s * (CT.RIM_X - 3), lerp(6.5, 8.5, u), 0), fov: 38,
      dof: { focus: V3(p.x, p.y + 5.5, p.z), ap: 1.3 } };
  }
  // jump shots: low and in front of the shooter, then follow the ball toward the rim
  const toRim = V3(s * CT.RIM_X - p.x, 0, -p.z).normalize();
  const side = V3(-toRim.z, 0, toRim.x);
  const track = b.state === 'shot' || b.shotLive ? 0.7 : 0.2;
  const look = V3(lerp(p.x, b.x, track), lerp(5, b.y, track), lerp(p.z, b.z, track));
  return { pos: V3(p.x + toRim.x * 11 + side.x * 11, 6.5, p.z + toRim.z * 11 + side.z * 11), look, fov: 42,
    dof: { focus: track > 0.5 ? V3(b.x, b.y, b.z) : V3(p.x, p.y + 5, p.z), ap: 1.3 } };
}
