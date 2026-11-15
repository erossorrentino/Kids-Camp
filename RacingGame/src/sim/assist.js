// Smart steering (on by default): makes the player's car much easier to drive
// with a few buttons. The steering part lives here; the parts that keep the
// car on the road and stop spins are in Vehicle.smartGuard().
import { clamp } from '../core/rng.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const frame = {};

// When the driver lets go of the steering, the car follows the road on its
// own (staying in its lane). While a steer button is held, the driver's
// steering is used as it is.
export function smartSteer(veh, track, input) {
  const out = { ...input };
  if (veh.speed < 3 || veh.gear < 0 || Math.abs(input.steer || 0) > 0.05) return out;
  const pr = veh.proj;
  const look = Math.max(10, veh.speed * 0.75);
  const f = track.frameAt(pr.s + look, frame);
  const lane = clamp(pr.d, -(f.hw - 1.6), f.hw - 1.6);
  const tx = f.x + f.lx * lane, tz = f.z + f.lz * lane;
  const a = wrap(Math.atan2(tx - veh.x, tz - veh.z) - veh.heading);
  if (Math.abs(a) > 1.2) return out; // facing the wrong way: leave it to the driver
  const ms = veh.maxSteer(veh.speed);
  out.steer = clamp((a * 2.2) / Math.max(ms * 2, 0.08), -1, 1) * 0.85;
  return out;
}
