// Shared AABB helpers for player/vehicle vs. building collision.

// Resolve a moving circle (in XZ) against a set of building AABBs by pushing
// it out along the axis of least penetration. Returns the corrected {x,z}.
export function resolveCircleVsBoxes(x, z, radius, colliders) {
  let rx = x, rz = z;
  for (const box of colliders) {
    const closestX = Math.max(box.minX, Math.min(rx, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(rz, box.maxZ));
    const dx = rx - closestX;
    const dz = rz - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius && distSq > 1e-9) {
      const dist = Math.sqrt(distSq);
      const push = (radius - dist) / dist;
      rx += dx * push;
      rz += dz * push;
    } else if (distSq <= 1e-9) {
      // center is exactly inside/on the box edge; push out along shallowest axis
      const penLeft = rx - box.minX, penRight = box.maxX - rx;
      const penNear = rz - box.minZ, penFar = box.maxZ - rz;
      const min = Math.min(penLeft, penRight, penNear, penFar);
      if (min === penLeft) rx = box.minX - radius;
      else if (min === penRight) rx = box.maxX + radius;
      else if (min === penNear) rz = box.minZ - radius;
      else rz = box.maxZ + radius;
    }
  }
  return { x: rx, z: rz };
}

// Oriented-box-ish collision for vehicles: approximate with a bounding circle
// of the vehicle's half-diagonal, resolve, then also return whether a hit
// occurred so callers can apply speed loss / bounce.
export function resolveVehicleVsBoxes(x, z, halfLength, halfWidth, colliders) {
  const radius = Math.hypot(halfLength, halfWidth);
  let hit = false;
  let rx = x, rz = z;
  let normal = null;
  for (const box of colliders) {
    const closestX = Math.max(box.minX, Math.min(rx, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(rz, box.maxZ));
    const dx = rx - closestX;
    const dz = rz - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      hit = true;
      const dist = Math.sqrt(distSq) || 0.001;
      const push = (radius - dist) / dist;
      rx += dx * push;
      rz += dz * push;
      normal = { x: dx / dist, z: dz / dist };
    }
  }
  return { x: rx, z: rz, hit, normal };
}

export function pointInBox(x, z, box) {
  return x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ;
}
