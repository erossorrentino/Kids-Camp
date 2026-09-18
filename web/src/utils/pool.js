// Fixed-size object pool: avoids per-frame allocation/GC churn for bullets,
// impact marks, and particles that spawn and die constantly.
export class Pool {
  constructor(factory, size) {
    this.factory = factory;
    this.items = new Array(size);
    this.free = [];
    for (let i = 0; i < size; i++) {
      this.items[i] = factory(i);
      this.free.push(i);
    }
  }

  acquire() {
    const idx = this.free.pop();
    if (idx === undefined) return null; // pool exhausted; caller should skip
    return this.items[idx];
  }

  release(item) {
    const idx = this.items.indexOf(item);
    if (idx !== -1) this.free.push(idx);
  }

  releaseIndex(idx) {
    this.free.push(idx);
  }

  forEachActive(cb) {
    const freeSet = new Set(this.free);
    for (let i = 0; i < this.items.length; i++) {
      if (!freeSet.has(i)) cb(this.items[i], i);
    }
  }
}
