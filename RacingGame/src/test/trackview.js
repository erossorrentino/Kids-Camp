import { TRACKS } from '../data/tracks.js';
import { Track } from '../sim/track.js';
const params = new URLSearchParams(location.search);
const only = params.get('t');
const list = only ? TRACKS.filter((t) => only.split(',').includes(t.id)) : TRACKS;
const cols = Math.min(4, list.length), rows = Math.ceil(list.length / cols);
const S = +(params.get('s') || 420);
const cv = document.createElement('canvas');
cv.width = cols * S; cv.height = rows * S;
document.body.appendChild(cv);
cv.style.cssText = 'position:fixed;left:0;top:0;background:#fff';
const ctx = cv.getContext('2d');
ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
list.forEach((def, idx) => {
  const ox = (idx % cols) * S, oy = Math.floor(idx / cols) * S;
  // raw open path
  let th = 0, x = 0, z = 0;
  const raw = [[0, 0]];
  for (const c of def.layout) {
    if (c[0] === 'S') { x += Math.sin(th) * c[1]; z += Math.cos(th) * c[1]; raw.push([x, z]); }
    else {
      const dir = c[0] === 'L' ? 1 : -1, a = c[1] * Math.PI / 180, r = c[2];
      const n = Math.ceil(a * r / 4);
      for (let i = 0; i < n; i++) { const th2 = th + dir * a / n * 0.5; x += Math.sin(th2) * a * r / n; z += Math.cos(th2) * a * r / n; th += dir * a / n; raw.push([x, z]); }
    }
  }
  const tr = new Track(def);
  const pts = [...raw];
  for (let i = 0; i < tr.N; i++) pts.push([tr.x[i], tr.z[i]]);
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (const [a, b] of pts) { minx = Math.min(minx, a); maxx = Math.max(maxx, a); minz = Math.min(minz, b); maxz = Math.max(maxz, b); }
  const sc = (S - 40) / Math.max(maxx - minx, maxz - minz);
  const P = (a, b) => [ox + 20 + (a - minx) * sc, oy + 20 + (maxz - b) * sc];
  // raw
  ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1; ctx.beginPath();
  raw.forEach(([a, b], i) => { const [u, v] = P(a, b); i ? ctx.lineTo(u, v) : ctx.moveTo(u, v); }); ctx.stroke();
  const [ex, ey] = P(raw[raw.length - 1][0], raw[raw.length - 1][1]);
  ctx.fillStyle = '#f00'; ctx.beginPath(); ctx.arc(ex, ey, 4, 0, 6.3); ctx.fill();
  // barriers
  for (const [arr, col] of [[tr.barrierL, '#2a7'], [tr.barrierR, '#27a']]) {
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i <= tr.N; i++) { const k = i % tr.N; const sgn = arr === tr.barrierL ? 1 : -1; const [u, v] = P(tr.x[k] + tr.lx[k] * arr[k] * sgn, tr.z[k] + tr.lz[k] * arr[k] * sgn); i ? ctx.lineTo(u, v) : ctx.moveTo(u, v); }
    ctx.stroke();
  }
  // track
  ctx.strokeStyle = '#333'; ctx.lineWidth = Math.max(2, 13 * sc); ctx.beginPath();
  for (let i = 0; i <= tr.N; i++) { const k = i % tr.N; const [u, v] = P(tr.x[k], tr.z[k]); i ? ctx.lineTo(u, v) : ctx.moveTo(u, v); }
  ctx.stroke();
  // curbs
  ctx.fillStyle = '#e22';
  for (let i = 0; i < tr.N; i += 2) if (tr.curbL[i]) { const [u, v] = P(tr.x[i], tr.z[i]); ctx.fillRect(u - 1, v - 1, 2, 2); }
  // racing line
  ctx.strokeStyle = '#fc0'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i <= tr.N; i++) { const k = i % tr.N; const [u, v] = P(tr.x[k] + tr.lx[k] * tr.raceLine[k], tr.z[k] + tr.lz[k] * tr.raceLine[k]); i ? ctx.lineTo(u, v) : ctx.moveTo(u, v); }
  ctx.stroke();
  // start
  const [sx, sy] = P(tr.x[0], tr.z[0]);
  ctx.fillStyle = '#0a0'; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 6.3); ctx.fill();
  // command markers (index labels at the start of each command on the closed track)
  let s = 0; ctx.fillStyle = '#00f'; ctx.font = '10px sans-serif';
  tr.cmds.forEach((c, ci) => {
    const i = Math.floor(s / 2) % tr.N; const [u, v] = P(tr.x[i], tr.z[i]); ctx.fillText(ci, u + 3, v - 3);
    s += c[0] === 'S' ? c[1] : c[1] * Math.PI / 180 * c[2];
  });
  ctx.fillStyle = '#000'; ctx.font = 'bold 13px sans-serif';
  ctx.fillText(`${def.id}  ${tr.length}m  gap=${Math.hypot(raw[raw.length-1][0], raw[raw.length-1][1]).toFixed(0)}m`, ox + 6, oy + 14);
});
window.__ready = true;
