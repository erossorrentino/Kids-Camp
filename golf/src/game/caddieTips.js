// Your caddie's advice before each shot: wind, hazards near where the ball
// will land, the lie, and on the green how much the putt breaks.
import { YD } from '../sim/hole.js';

const fwdOf = (h) => ({ x: Math.sin(h), z: -Math.cos(h) });
const rightOf = (h) => ({ x: Math.cos(h), z: Math.sin(h) });

function dist(units, m, small = false) {
  if (units === 'meters') return small && m < 20 ? `${m.toFixed(1)} m` : `${Math.round(m)} m`;
  if (small && m / YD < 20) return `${Math.round(m / 0.3048)} ft`;
  return `${Math.round(m / YD)} yards`;
}

export function caddieTip(round) {
  const h = round.hole;
  const b = round.ballPos;
  const units = round.app.settings.units;
  const f = fwdOf(round.heading), r = rightOf(round.heading);
  const wind = round.wind;
  const along = wind.vec.x * f.x + wind.vec.z * f.z; // m/s, + helping
  const across = wind.vec.x * r.x + wind.vec.z * r.z; // + pushes right
  if (round.putting) {
    // how the preview roll bends compared to a straight line at the hole
    const d = round.distToPin;
    const pin = h.pin;
    const up = pin.y - b.y;
    let brk = 0;
    if (round.puttBreak != null) brk = round.puttBreak;
    const bits = [];
    if (Math.abs(brk) > 0.08) {
      const cups = Math.max(1, Math.round(Math.abs(brk) / 0.108));
      bits.push(`It breaks about ${cups} cup${cups === 1 ? '' : 's'} ${brk > 0 ? 'left to right' : 'right to left'}, so aim ${brk > 0 ? 'left' : 'right'} of the hole.`);
    } else if (d > 2) bits.push('Pretty straight, this one.');
    if (up > 0.25) bits.push('Uphill: be firm with it.');
    else if (up < -0.25) bits.push('Downhill and quick: just touch it.');
    if (d < 1.2) return 'Short one. Nice and smooth, hole it.';
    return bits.join(' ') || 'Read it, trust it, roll it.';
  }
  const tips = [];
  const land = round.pred ? round.pred.land : null;
  // hazards around where this club lands
  if (land) {
    const fl = h.fields(land.x, land.z);
    const side = (x, z) => ((x - land.x) * r.x + (z - land.z) * r.z > 0 ? 'right' : 'left');
    if (fl.dW < 14 && fl.water) {
      const w = fl.water;
      const wx = w.type === 'creek' ? w.points[Math.floor(w.points.length / 2)].x : w.x, wz = w.type === 'creek' ? w.points[Math.floor(w.points.length / 2)].z : w.z;
      tips.push(fl.dW < 0 ? 'That line finds the water! Take less club or aim away.' : `Careful, there's water just ${side(wx, wz)} of where this lands.`);
    } else if (fl.dB < 5 && fl.bunker) {
      tips.push(fl.dB < 0 ? 'This lands in a bunker. Maybe a different club?' : `There's a bunker just ${side(fl.bunker.x, fl.bunker.z)} of your landing spot.`);
    }
    if (h.ob && (h.ob.left || h.ob.right) && round.lie === 'tee' && h.par > 3) tips.push(`Out of bounds ${h.ob.left && h.ob.right ? 'both sides' : h.ob.left ? 'left' : 'right'}. Keep it in play.`);
  }
  // wind
  if (Math.abs(along) > 3) tips.push(along > 0 ? 'Wind is helping: it will fly a bit further.' : 'Into the wind: it will come up short, take more club.');
  if (Math.abs(across) > 3.5) tips.push(`Crosswind: it will drift ${across > 0 ? 'right' : 'left'}, so aim a little ${across > 0 ? 'left' : 'right'}.`);
  // lie
  const lie = round.lie;
  if (lie === 'bunker') tips.push(round.distToPin < 50 ? 'Open the face and splash it out: swing through the sand.' : 'Fairway bunker: pick it clean, one more club.');
  else if (lie === 'rough' || lie === 'deep' || lie === 'fescue' || lie === 'heather') tips.push('Out of the rough it will come out low with less spin, so expect some roll.');
  else if (lie === 'tee' && h.par === 3) tips.push(`${dist(units, round.distToPin)} to the flag. Pick your club and commit.`);
  const sl = round.lieInfo ? round.lieInfo() : null;
  if (sl && sl.notes.some((n) => /Uphill/.test(n))) tips.push('Uphill lie: the ball goes higher and a bit shorter.');
  if (sl && sl.notes.some((n) => /Downhill/.test(n))) tips.push('Downhill lie: it will come out lower and run.');
  if (!tips.length) {
    if (lie === 'tee') return 'Nice wide fairway. Smooth swing, let it go.';
    if (round.distToPin < 40) return 'Little pitch: land it on the green and let it release.';
    return `${dist(units, round.distToPin)} to go. This club should get you there.`;
  }
  return tips.slice(0, 2).join(' ');
}
