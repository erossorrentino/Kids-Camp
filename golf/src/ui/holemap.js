// Top-down hole maps (HUD minimap and the yardage book) and the caddie's
// written notes for each hole.
import { YD } from '../sim/hole.js';

const COL = {
  fairway: [111, 174, 69], green: [146, 208, 92], fringe: [121, 184, 76], tee: [122, 185, 76], first: [88, 150, 58],
  rough: [60, 118, 44], deep: [44, 92, 33], fescue: [168, 158, 100], heather: [118, 98, 110], waste: [205, 180, 138],
  bunker: [236, 224, 186], path: [190, 186, 176],
};

// Map frame: the tee at the bottom, the green at the top
export function mapFrame(hole, W, H, pad = 25) {
  const th = Math.atan2(hole.gdir.x, -hole.gdir.z);
  const cos = Math.cos(th), sin = Math.sin(th);
  let umin = Infinity, umax = -Infinity;
  for (const p of hole.path) {
    const u = p.x * cos + p.z * sin;
    umin = Math.min(umin, u); umax = Math.max(umax, u);
  }
  const vmin = -pad, vmax = hole.straightLen + pad + 10;
  const s = Math.min(H / (vmax - vmin), W / Math.max(40, umax - umin + 60));
  const uc = (umin + umax) / 2;
  const vc = (vmin + vmax) / 2;
  const toWorld = (px, py) => {
    const v = vc + (H / 2 - py) / s;
    const u = uc + (px - W / 2) / s;
    return { x: u * cos + v * sin, z: u * sin - v * cos };
  };
  const toMap = (x, z) => {
    const u = x * cos + z * sin;
    const v = x * sin - z * cos;
    return { x: W / 2 + (u - uc) * s, y: H / 2 - (v - vc) * s };
  };
  return { cos, sin, s, uc, vc, W, H, toWorld, toMap };
}

// Paint the hole into a 2D context at pixel scale `sc` (1 = CSS px)
export function drawHoleMap(ctx, hole, W, H, { sc = 2, trees = true, pin = false, background = [26, 44, 34] } = {}) {
  const fr = mapFrame(hole, W, H);
  const img = ctx.createImageData(W * sc, H * sc);
  for (let py = 0; py < H * sc; py++) {
    for (let px = 0; px < W * sc; px++) {
      const w = fr.toWorld(px / sc, py / sc);
      let c;
      if (!hole.inBounds(w.x, w.z)) c = background;
      else if (hole.waterAt(w.x, w.z)) c = [60, 122, 160];
      else c = COL[hole.surfaceAt(w.x, w.z)] || COL.rough;
      const k = (py * W * sc + px) * 4;
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.scale(sc, sc);
  if (trees) {
    ctx.fillStyle = 'rgba(20,52,24,0.85)';
    for (const t of hole.trees) {
      const p = fr.toMap(t.x, t.z);
      if (p.x < -5 || p.x > W + 5 || p.y < -5 || p.y > H + 5) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.7, Math.max(t.canopyR, 0.6) * fr.s), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (pin) {
    const p = fr.toMap(hole.pin.x, hole.pin.z);
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(p.x - 0.6, p.y - 7, 1.2, 7);
    ctx.beginPath(); ctx.moveTo(p.x + 0.6, p.y - 7); ctx.lineTo(p.x + 5, p.y - 5.5); ctx.lineTo(p.x + 0.6, p.y - 4); ctx.fill();
  }
  ctx.restore();
  return fr;
}

// A caddie's note on how to play the hole, written from its features
export function caddieNote(hole) {
  const bits = [];
  const d = hole.describe();
  const dl = hole.doglegs.find((x) => Math.abs(x.angle) > 0.12);
  const par = hole.par;
  const yds = hole.yards;
  if (par === 3) bits.push(yds > 215 ? 'A long par 3 that needs a fairway wood or hybrid.' : yds < 160 ? 'A short iron to a well-guarded target.' : 'A mid-iron par 3.');
  else if (par === 5) bits.push(yds < 545 ? 'Reachable in two with a good drive.' : 'A true three-shotter for most of the field.');
  else if (yds < 370) bits.push('A short par 4: position off the tee beats power.');
  else if (yds > 470) bits.push('A brute of a par 4 that plays long.');
  if (dl) {
    const side = dl.angle > 0 ? 'right' : 'left';
    bits.push(`The fairway turns ${side} about ${Math.round(dl.s / YD)} yards out; ${Math.abs(dl.angle) > 0.3 ? 'a sharp corner, so don’t run through it' : 'a gentle bend'}.`);
  }
  const fwB = hole.bunkers.filter((b) => b.kind === 'fairway').length;
  const pots = hole.bunkers.filter((b) => b.kind === 'pot').length;
  if (fwB) bits.push(`${fwB} fairway bunker${fwB > 1 ? 's guard' : ' guards'} the landing area.`);
  if (pots) bits.push(`${pots} deep pot bunker${pots > 1 ? 's' : ''}: stay out at all costs.`);
  const w = hole.waters[0];
  if (w) {
    if (w.type === 'creek') bits.push('A creek crosses the hole: know your carry.');
    else {
      const gd = Math.hypot(w.x - hole.green.x, w.z - hole.green.z);
      bits.push(gd < 50 ? 'Water guards the green.' : 'A pond lurks beside the fairway.');
    }
  }
  if (hole.ocean) bits.push(`The ocean runs down the ${hole.ocean.side > 0 ? 'right' : 'left'}.`);
  if (hole.ob.left || hole.ob.right) bits.push(`Out of bounds ${hole.ob.left && hole.ob.right ? 'both sides' : hole.ob.left ? 'left' : 'right'}.`);
  const tilt = Math.hypot(hole.greenTilt.x, hole.greenTilt.z);
  if (hole.greenTier) bits.push('A two-tier green: get your approach on the right level.');
  else if (tilt > 0.02) bits.push('A steeply sloped green; stay below the hole.');
  if (Math.abs(d.elevation) > 4) bits.push(d.elevation > 0 ? 'Plays uphill: take more club.' : 'Plays downhill: take less club.');
  return bits.join(' ');
}
