'use strict';

/* ---------- Data ---------- */

const TIERS = [
  { mult: 2,   label: '×2',   color: '#7ee787' },
  { mult: 3,   label: '×3',   color: '#5fd0e0' },
  { mult: 5,   label: '×5',   color: '#6ea8fe' },
  { mult: 8,   label: '×8',   color: '#b98cf0' },
  { mult: 12,  label: '×12',  color: '#f087c5' },
  { mult: 20,  label: '×20',  color: '#ff9d5c' },
  { mult: 35,  label: '×35',  color: '#ffd43b' },
  { mult: 60,  label: '×60',  color: '#ff6b6b' },
  { mult: 100, label: '×100', color: '#ff4fd8' },
  { mult: 200, label: '×200', color: '#ffd700' },
];
const MAX_TIER = TIERS.length - 1;
const SLOT_COUNT = 10;

const CHESTS = [
  { id: 'wood',    name: 'Wooden Chest',  emoji: '📦', cost: 50,    weights: [60, 30, 10, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bronze',  name: 'Bronze Chest',  emoji: '🥉', cost: 300,   weights: [35, 30, 20, 10, 5, 0, 0, 0, 0, 0] },
  { id: 'silver',  name: 'Silver Chest',  emoji: '🥈', cost: 1500,  weights: [10, 20, 25, 20, 15, 7, 3, 0, 0, 0] },
  { id: 'gold',    name: 'Gold Chest',    emoji: '🥇', cost: 8000,  weights: [0, 5, 15, 20, 20, 20, 12, 6, 2, 0] },
  { id: 'diamond', name: 'Diamond Chest', emoji: '💎', cost: 40000, weights: [0, 0, 5, 10, 15, 20, 20, 15, 10, 5] },
];

const SELL_VALUE = TIERS.map(t => Math.round(t.mult * 15));
const TRAY_MAX = 15;
const SAVE_KEY = 'ballMultiplierMergeSave.v4';
const BASE_START = 1.1;

// Every lane's ball passes through all 3 of these stacked starting walls,
// each with its own upgrade level, color ramp, and cash bonus.
const WALL_DEFS = [
  { name: 'Wall 1', baseCost: 40,   costMult: 1.55, amtBase: 0.6, amtMult: 1.35, hueBase: 130 },
  { name: 'Wall 2', baseCost: 300,  costMult: 1.6,  amtBase: 2,   amtMult: 1.4,  hueBase: 250 },
  { name: 'Wall 3', baseCost: 2000, costMult: 1.65, amtBase: 8,   amtMult: 1.45, hueBase: 15 },
];
const WALL_COUNT = WALL_DEFS.length;

/* ---------- Plinko board layout (fixed internal resolution) ---------- */

const BOARD_W = 640;
const BOARD_H = 820;
const SLOT_RADIUS = 26;
const BALL_RADIUS = 17;
const GRAB_RADIUS = 46;

const LANE_Y = 16;
const MAX_LANES = 5;
const LANE_X = [90, 205, 320, 435, 550];
const LANE_UNLOCK_ORDER = [2, 1, 3, 0, 4]; // center lane unlocks first, then outward

const WALL_Y_LIST = [72, 120, 168];
const WALL_HEIGHT = 32;

const CASH_BAR_HEIGHT = 40;
const PLAY_TOP = 205;
const PLAY_BOTTOM = BOARD_H - CASH_BAR_HEIGHT;

// A ball resting perfectly balanced against a slot can stall with zero net
// force; periodically nudge it and, as a last resort, force it to cash out
// so no ball is ever lost for good.
const STALL_CHECK_MS = 500;
const STALL_PROGRESS_PX = 12;
const MAX_FALL_MS = 20000;

// Multiplier slots spread out across the whole board — the only things a
// ball bounces off on its way down, besides the side walls.
const SLOT_FRACS = [
  { x: 0.20, y: 0.16 },
  { x: 0.75, y: 0.14 },
  { x: 0.45, y: 0.24 },
  { x: 0.12, y: 0.34 },
  { x: 0.62, y: 0.32 },
  { x: 0.85, y: 0.42 },
  { x: 0.30, y: 0.46 },
  { x: 0.55, y: 0.55 },
  { x: 0.18, y: 0.62 },
  { x: 0.72, y: 0.66 },
];

const SLOT_POS = SLOT_FRACS.map(f => ({ x: f.x * BOARD_W, y: PLAY_TOP + f.y * (PLAY_BOTTOM - PLAY_TOP) }));

/* ---------- State ---------- */

let state = {
  money: 0,
  spawnLevel: 0,
  valueLevels: new Array(WALL_COUNT).fill(0),
  slots: new Array(SLOT_COUNT).fill(null),
  tray: [],
};

let selectedStorageIndex = null;
let lastSpawn = 0;
let lastFrame = 0;
let rafId = null;

let engine = null;
let balls = [];
const slotPulses = new Array(SLOT_COUNT).fill(-9999);
const lastSpawnPerLane = new Array(MAX_LANES).fill(0);
const wallPulses = new Array(WALL_COUNT).fill(-9999);
let floatTexts = [];

// Touch/mouse drag-to-steer state.
let heldBall = null;
let activePointerId = null;
let pointerPos = null;
let dragStart = null;
let dragMoved = false;

/* ---------- Persistence ---------- */

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) { /* ignore storage errors */ }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    state.money = Number(parsed.money) || 0;
    state.spawnLevel = Number(parsed.spawnLevel) || 0;
    if (Array.isArray(parsed.valueLevels)) {
      state.valueLevels = new Array(WALL_COUNT)
        .fill(0)
        .map((_, i) => Math.max(0, Number(parsed.valueLevels[i]) || 0));
    }
    if (Array.isArray(parsed.slots) && parsed.slots.length === SLOT_COUNT) {
      state.slots = parsed.slots.map(v => (v === null ? null : Math.max(0, Math.min(MAX_TIER, v))));
    }
    if (Array.isArray(parsed.tray)) {
      state.tray = parsed.tray.map(v => Math.max(0, Math.min(MAX_TIER, v))).slice(0, TRAY_MAX);
    }
  } catch (e) { /* ignore corrupt save */ }
}

/* ---------- Economy helpers ---------- */

function round2(n) {
  return Math.round(n * 100) / 100;
}

function spawnInterval() {
  return Math.max(0.4, 3 - state.spawnLevel * 0.15);
}
function spawnUpgradeCost() {
  return Math.round(25 * Math.pow(1.5, state.spawnLevel));
}
function laneCount() {
  return Math.min(MAX_LANES, 1 + Math.floor(state.spawnLevel / 2));
}
function activeLanes() {
  return LANE_UNLOCK_ORDER.slice(0, laneCount());
}

function wallBonus(i) {
  const level = state.valueLevels[i];
  if (level <= 0) return 0;
  const def = WALL_DEFS[i];
  return round2(def.amtBase * Math.pow(def.amtMult, level - 1));
}
function wallCost(i) {
  const def = WALL_DEFS[i];
  return Math.round(def.baseCost * Math.pow(def.costMult, state.valueLevels[i]));
}
function wallColor(i) {
  const level = state.valueLevels[i];
  if (level <= 0) return '#5b3f92';
  const def = WALL_DEFS[i];
  return `hsl(${(def.hueBase + level * 23) % 360}, 70%, 60%)`;
}
function fmt(n) {
  if (n < 1000) {
    return Number.isInteger(n) ? n.toString() : n.toFixed(2);
  }
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let u = -1;
  while (n >= 1000 && u < units.length - 1) {
    n /= 1000;
    u++;
  }
  const digits = n < 10 ? 2 : n < 100 ? 1 : 0;
  return n.toFixed(digits) + units[u];
}

function weightedRandomTier(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/* ---------- DOM refs ---------- */

const els = {
  money: document.getElementById('moneyDisplay'),
  canvas: document.getElementById('boardCanvas'),
  hint: document.getElementById('hint'),
  speedSub: document.getElementById('speedSub'),
  buySpeed: document.getElementById('buySpeed'),
  wallSubs: [0, 1, 2].map(i => document.getElementById('wallSub' + i)),
  wallSwatches: [0, 1, 2].map(i => document.getElementById('wallSwatch' + i)),
  buyWalls: [0, 1, 2].map(i => document.getElementById('buyWall' + i)),
  chestList: document.getElementById('chestList'),
  storageGrid: document.getElementById('storageGrid'),
  storageActions: document.getElementById('storageActions'),
  storageSelectedLabel: document.getElementById('storageSelectedLabel'),
  storageSellBtn: document.getElementById('storageSellBtn'),
  toastStack: document.getElementById('toastStack'),
};
const ctx = els.canvas.getContext('2d');

/* ---------- Rendering (DOM panels) ---------- */

function renderMoney() {
  els.money.textContent = '$' + fmt(state.money);
}

function renderSpeedUpgrade() {
  const lc = laneCount();
  els.speedSub.textContent = `Level ${state.spawnLevel} — ${lc} lane${lc > 1 ? 's' : ''}, every ${spawnInterval().toFixed(2)}s`;
  const cost = spawnUpgradeCost();
  els.buySpeed.querySelector('span').textContent = '$' + fmt(cost);
  els.buySpeed.disabled = state.money < cost;
}

function renderWallUpgrades() {
  for (let i = 0; i < WALL_COUNT; i++) {
    const lvl = state.valueLevels[i];
    els.wallSubs[i].textContent = lvl === 0
      ? 'Level 0 — no bonus yet'
      : `Level ${lvl} — +$${fmt(wallBonus(i))}`;
    els.wallSwatches[i].style.background = wallColor(i);
    const cost = wallCost(i);
    els.buyWalls[i].querySelector('span').textContent = '$' + fmt(cost);
    els.buyWalls[i].disabled = state.money < cost;
  }
}

function renderChests() {
  els.chestList.innerHTML = '';
  CHESTS.forEach(chest => {
    const item = document.createElement('div');
    item.className = 'chest-item';

    const best = chest.weights.reduce((maxIdx, w, idx) => (w > 0 ? idx : maxIdx), -1);
    const oddsLabel = best >= 0 ? `Up to ${TIERS[best].label}` : 'Basic multipliers';

    item.innerHTML = `
      <div class="chest-emoji">${chest.emoji}</div>
      <div class="chest-info">
        <div class="chest-name">${chest.name}</div>
        <div class="chest-odds">${oddsLabel}</div>
      </div>
      <button class="buy-btn" ${state.money < chest.cost ? 'disabled' : ''}>Buy<br><span>$${fmt(chest.cost)}</span></button>
    `;
    item.querySelector('button').addEventListener('click', () => buyChest(chest));
    els.chestList.appendChild(item);
  });
}

function renderStorage() {
  els.storageGrid.innerHTML = '';
  if (state.tray.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'storage-empty';
    empty.textContent = 'Open a chest to get multipliers!';
    els.storageGrid.appendChild(empty);
  } else {
    state.tray.forEach((tier, idx) => {
      const tile = document.createElement('div');
      tile.className = 'storage-tile' + (idx === selectedStorageIndex ? ' selected' : '');
      tile.style.background = TIERS[tier].color;
      tile.textContent = TIERS[tier].label;
      tile.addEventListener('click', () => onStorageClick(idx));
      els.storageGrid.appendChild(tile);
    });
  }

  if (selectedStorageIndex !== null && state.tray[selectedStorageIndex] !== undefined) {
    const tier = state.tray[selectedStorageIndex];
    els.storageActions.hidden = false;
    els.storageSelectedLabel.textContent = `Selected ${TIERS[tier].label} — tap an empty board slot to equip it`;
    els.storageSellBtn.onclick = () => sellStorageTile(selectedStorageIndex);
  } else {
    els.storageActions.hidden = true;
  }
}

function renderAll() {
  renderMoney();
  renderSpeedUpgrade();
  renderWallUpgrades();
  renderChests();
  renderStorage();
}

/* ---------- Toast ---------- */

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  els.toastStack.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/* ---------- Interaction: storage ---------- */

function onStorageClick(idx) {
  selectedStorageIndex = selectedStorageIndex === idx ? null : idx;
  renderStorage();
}

function sellStorageTile(idx) {
  const tier = state.tray[idx];
  if (tier === undefined) return;
  state.tray.splice(idx, 1);
  state.money += SELL_VALUE[tier];
  toast(`Sold a ${TIERS[tier].label} multiplier for $${fmt(SELL_VALUE[tier])}`);
  selectedStorageIndex = null;
  renderAll();
  save();
}

function checkStorageMerges() {
  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    for (let tier = 0; tier < MAX_TIER; tier++) {
      const idxs = [];
      state.tray.forEach((t, i) => {
        if (t === tier && idxs.length < 3) idxs.push(i);
      });
      if (idxs.length === 3) {
        idxs.sort((a, b) => b - a).forEach(i => state.tray.splice(i, 1));
        state.tray.push(tier + 1);
        mergedAny = true;
        toast(`Merged 3× ${TIERS[tier].label} into ${TIERS[tier + 1].label}!`);
        break;
      }
    }
    if (mergedAny) continue;
    const topIdxs = [];
    state.tray.forEach((t, i) => {
      if (t === MAX_TIER && topIdxs.length < 3) topIdxs.push(i);
    });
    if (topIdxs.length === 3) {
      topIdxs.sort((a, b) => b - a).forEach(i => state.tray.splice(i, 1));
      const bonus = SELL_VALUE[MAX_TIER] * 10;
      state.money += bonus;
      toast(`Merged 3× ${TIERS[MAX_TIER].label} for a $${fmt(bonus)} bonus!`);
      mergedAny = true;
    }
  }
  selectedStorageIndex = null;
}

/* ---------- Interaction: board slots ---------- */

function onBoardSlotClick(i) {
  if (state.slots[i] !== null) {
    if (state.tray.length >= TRAY_MAX) {
      toast('Your storage is full! Sell something before unequipping more.');
      return;
    }
    const tier = state.slots[i];
    state.slots[i] = null;
    state.tray.push(tier);
    checkStorageMerges();
    renderAll();
    save();
    return;
  }
  if (selectedStorageIndex === null) return;
  const tier = state.tray[selectedStorageIndex];
  state.tray.splice(selectedStorageIndex, 1);
  selectedStorageIndex = null;
  state.slots[i] = tier;
  checkMerges();
  renderAll();
  save();
}

function checkMerges() {
  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    for (let tier = 0; tier < MAX_TIER; tier++) {
      const indices = [];
      for (let i = 0; i < SLOT_COUNT; i++) {
        if (state.slots[i] === tier) indices.push(i);
        if (indices.length === 3) break;
      }
      if (indices.length === 3) {
        indices.slice(1).forEach(i => (state.slots[i] = null));
        state.slots[indices[0]] = tier + 1;
        mergedAny = true;
        toast(`Merged 3× ${TIERS[tier].label} into ${TIERS[tier + 1].label}!`);
        break;
      }
    }
    if (mergedAny) continue;
    // Merging 3 max-tier tiles gives a cash bonus since there's no higher tier.
    const topIndices = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (state.slots[i] === MAX_TIER) topIndices.push(i);
      if (topIndices.length === 3) break;
    }
    if (topIndices.length === 3) {
      topIndices.slice(1).forEach(i => (state.slots[i] = null));
      const bonus = SELL_VALUE[MAX_TIER] * 10;
      state.money += bonus;
      toast(`Merged 3× ${TIERS[MAX_TIER].label} for a $${fmt(bonus)} bonus!`);
      mergedAny = true;
    }
  }
}

/* ---------- Shop & upgrades ---------- */

function buyChest(chest) {
  if (state.money < chest.cost) return;
  if (state.tray.length >= TRAY_MAX) {
    toast('Your storage is full! Equip or sell some multipliers first.');
    return;
  }
  state.money -= chest.cost;
  const tier = weightedRandomTier(chest.weights);
  state.tray.push(tier);
  toast(`${chest.name} gave you a ${TIERS[tier].label} multiplier!`);
  checkStorageMerges();
  renderAll();
  save();
}

function buySpeedUpgrade() {
  const cost = spawnUpgradeCost();
  if (state.money < cost) return;
  state.money -= cost;
  state.spawnLevel++;
  const newLane = LANE_UNLOCK_ORDER[laneCount() - 1];
  if (newLane !== undefined) lastSpawnPerLane[newLane] = performance.now();
  renderAll();
  save();
}

function buyWallUpgrade(i) {
  const cost = wallCost(i);
  if (state.money < cost) return;
  state.money -= cost;
  state.valueLevels[i]++;
  renderAll();
  save();
}

/* ---------- Physics (Plinko board) ---------- */

function setupPhysics() {
  engine = Matter.Engine.create();
  engine.gravity.y = 1;

  const slotBodies = SLOT_POS.map((p, i) => {
    const body = Matter.Bodies.circle(p.x, p.y, SLOT_RADIUS, { isStatic: true, restitution: 0.7, friction: 0 });
    body.isSlot = true;
    body.slotIndex = i;
    return body;
  });

  const wallOpts = { isStatic: true, restitution: 0.4, friction: 0 };
  const leftWall = Matter.Bodies.rectangle(-10, BOARD_H / 2, 20, BOARD_H * 2, wallOpts);
  const rightWall = Matter.Bodies.rectangle(BOARD_W + 10, BOARD_H / 2, 20, BOARD_H * 2, wallOpts);

  Matter.Composite.add(engine.world, [...slotBodies, leftWall, rightWall]);

  Matter.Events.on(engine, 'collisionStart', onCollisionStart);
}

function onCollisionStart(event) {
  event.pairs.forEach(({ bodyA, bodyB }) => {
    let ball = null;
    let slot = null;
    if (bodyA.isGameBall && bodyB.isSlot) {
      ball = bodyA;
      slot = bodyB;
    } else if (bodyB.isGameBall && bodyA.isSlot) {
      ball = bodyB;
      slot = bodyA;
    }
    if (!ball || !slot) return;

    const idx = slot.slotIndex;
    const tier = state.slots[idx];
    if (tier === null || ball.gameData.hitSlots.has(idx)) return;

    ball.gameData.hitSlots.add(idx);
    ball.gameData.value *= TIERS[tier].mult;
    slotPulses[idx] = performance.now();
    floatTexts.push({
      x: slot.position.x,
      y: slot.position.y - SLOT_RADIUS - 6,
      text: TIERS[tier].label,
      color: '#7ee787',
      start: performance.now(),
    });
  });
}

function spawnBallAtLane(laneIndex) {
  const x = LANE_X[laneIndex] + (Math.random() - 0.5) * 14;
  const now = performance.now();
  const body = Matter.Bodies.circle(x, LANE_Y, BALL_RADIUS, {
    restitution: 0.6,
    friction: 0.02,
    frictionAir: 0.001,
    density: 0.0025,
  });
  body.isGameBall = true;
  body.gameData = {
    value: BASE_START,
    hitSlots: new Set(),
    wallHit: new Array(WALL_COUNT).fill(false),
    spawnTime: now,
    checkY: LANE_Y,
    nextCheck: now + STALL_CHECK_MS,
    stallCount: 0,
  };
  Matter.Composite.add(engine.world, body);
  balls.push(body);
}

function cashOutBall(ball, now) {
  const val = ball.gameData.value;
  state.money += val;
  floatTexts.push({ x: ball.position.x, y: BOARD_H - 46, text: '+$' + fmt(val), color: '#ffd700', start: now });
  Matter.Composite.remove(engine.world, ball);
}

/* ---------- Canvas interaction ---------- */

function canvasPointFromEvent(evt) {
  const rect = els.canvas.getBoundingClientRect();
  const scaleX = BOARD_W / rect.width;
  const scaleY = BOARD_H / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY,
  };
}

function nearestBall(p) {
  let nearest = null;
  let nearestDist = Infinity;
  balls.forEach(b => {
    const d = Math.hypot(b.position.x - p.x, b.position.y - p.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = b;
    }
  });
  return nearestDist <= GRAB_RADIUS ? nearest : null;
}

function tapBoardSlot(p) {
  let nearest = -1;
  let nearestDist = Infinity;
  SLOT_POS.forEach((s, i) => {
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = i;
    }
  });
  if (nearest >= 0 && nearestDist <= SLOT_RADIUS + 14) {
    onBoardSlotClick(nearest);
  }
}

function onPointerDown(evt) {
  if (activePointerId !== null) return;
  const p = canvasPointFromEvent(evt);
  activePointerId = evt.pointerId;
  pointerPos = p;
  dragStart = p;
  dragMoved = false;
  heldBall = nearestBall(p);
  try {
    if (els.canvas.setPointerCapture) els.canvas.setPointerCapture(evt.pointerId);
  } catch (e) { /* capture is best-effort; window-level listeners below still catch release */ }
  evt.preventDefault();
}

function onPointerMove(evt) {
  if (evt.pointerId !== activePointerId) return;
  const p = canvasPointFromEvent(evt);
  pointerPos = p;
  if (Math.hypot(p.x - dragStart.x, p.y - dragStart.y) > 6) dragMoved = true;
  evt.preventDefault();
}

function onPointerUp(evt) {
  if (evt.pointerId !== activePointerId) return;
  if (!heldBall && !dragMoved) {
    tapBoardSlot(pointerPos);
  }
  releasePointer();
}

// A ball must never be stuck frozen at a held position forever. If the
// browser fails to deliver pointerup/pointercancel to the canvas (pointer
// released outside the window, tab switched mid-drag, capture not
// supported), these catch-alls force the release so it drops again.
function releasePointer() {
  heldBall = null;
  activePointerId = null;
  pointerPos = null;
  dragStart = null;
  dragMoved = false;
}

function onWindowPointerUp(evt) {
  if (evt.pointerId !== activePointerId) return;
  releasePointer();
}

/* ---------- Drawing ---------- */

function drawLanes(now) {
  const active = activeLanes();
  for (let li = 0; li < MAX_LANES; li++) {
    const isActive = active.includes(li);
    const x = LANE_X[li];
    ctx.beginPath();
    ctx.moveTo(x - 14, LANE_Y - 12);
    ctx.lineTo(x + 14, LANE_Y - 12);
    ctx.lineTo(x, LANE_Y + 14);
    ctx.closePath();
    if (isActive) {
      const pulse = now - lastSpawnPerLane[li];
      ctx.fillStyle = pulse < 200 ? '#fff6c9' : '#ffd700';
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(183,169,217,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function drawWalls(now) {
  const marginX = BOARD_W * 0.06;
  const w = BOARD_W - marginX * 2;
  const x = marginX;

  for (let i = 0; i < WALL_COUNT; i++) {
    const wallY = WALL_Y_LIST[i];
    const y = wallY - WALL_HEIGHT / 2;
    const pulseT = now - wallPulses[i];
    const glow = pulseT < 250 ? 1 - pulseT / 250 : 0;
    const color = wallColor(i);

    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6 + glow * 18;
    roundRect(ctx, x, y, w, WALL_HEIGHT, 9);
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, x, y, w, WALL_HEIGHT, 9);
    ctx.stroke();

    ctx.fillStyle = '#1b1032';
    ctx.font = '800 14px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const bonus = wallBonus(i);
    const label = bonus === 0 ? WALL_DEFS[i].name : `+$${fmt(bonus)}`;
    ctx.fillText(label, BOARD_W / 2, wallY + 1);
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function draw(now) {
  ctx.clearRect(0, 0, BOARD_W, BOARD_H);

  ctx.fillStyle = '#241748';
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);

  ctx.fillStyle = 'rgba(183,169,217,0.7)';
  ctx.font = '700 12px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('▼ DROP ZONE ▼', BOARD_W / 2, 44);

  drawLanes(now);
  drawWalls(now);

  SLOT_POS.forEach((p, i) => {
    const tier = state.slots[i];
    const pulseT = now - slotPulses[i];
    const scale = pulseT < 250 ? 1 + 0.25 * (1 - pulseT / 250) : 1;
    const r = SLOT_RADIUS * scale;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    if (tier !== null) {
      ctx.fillStyle = TIERS[tier].color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.stroke();
      ctx.fillStyle = '#1b1032';
      ctx.font = '800 15px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TIERS[tier].label, p.x, p.y + 1);
    } else {
      ctx.fillStyle = 'rgba(61,42,99,0.9)';
      ctx.fill();
      const selectable = selectedStorageIndex !== null;
      ctx.setLineDash(selectable ? [5, 4] : []);
      ctx.lineWidth = selectable ? 3 : 2;
      ctx.strokeStyle = selectable ? '#7ee787' : '#5b3f92';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  });

  ctx.fillStyle = 'rgba(255,215,0,0.12)';
  ctx.fillRect(0, BOARD_H - CASH_BAR_HEIGHT, BOARD_W, CASH_BAR_HEIGHT);
  ctx.fillStyle = '#ffd700';
  ctx.font = '700 16px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('💵 CASH OUT 💵', BOARD_W / 2, BOARD_H - 15);

  balls.forEach(b => {
    const { x, y } = b.position;
    if (b === heldBall) {
      ctx.beginPath();
      ctx.arc(x, y, BALL_RADIUS + 8, 0, Math.PI * 2);
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#7ee787';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    const grad = ctx.createRadialGradient(x - 5, y - 6, 3, x, y, BALL_RADIUS);
    grad.addColorStop(0, '#fff6c9');
    grad.addColorStop(0.6, '#ffd700');
    grad.addColorStop(1, '#b8860b');
    ctx.fillStyle = grad;
    ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a3200';
    ctx.font = '700 11px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmt(b.gameData.value), x, y + 1);
  });

  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const f = floatTexts[i];
    const t = (now - f.start) / 800;
    if (t >= 1) {
      floatTexts.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = f.color;
    ctx.font = '800 14px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(f.text, f.x, f.y - t * 30);
    ctx.globalAlpha = 1;
  }
}

/* ---------- Main loop ---------- */

function gameLoop(now) {
  const dt = Math.min(33, now - (lastFrame || now));
  lastFrame = now;
  Matter.Engine.update(engine, dt);

  if (heldBall && pointerPos) {
    const x = Math.min(BOARD_W - BALL_RADIUS - 2, Math.max(BALL_RADIUS + 2, pointerPos.x));
    const y = Math.min(BOARD_H - BALL_RADIUS, Math.max(BALL_RADIUS + 2, pointerPos.y));
    Matter.Body.setPosition(heldBall, { x, y });
    Matter.Body.setVelocity(heldBall, { x: 0, y: 0 });
    heldBall.gameData.checkY = y;
    heldBall.gameData.nextCheck = now + STALL_CHECK_MS;
  }

  const intervalMs = spawnInterval() * 1000;
  activeLanes().forEach(li => {
    if (now - lastSpawnPerLane[li] >= intervalMs) {
      lastSpawnPerLane[li] = now;
      spawnBallAtLane(li);
    }
  });

  let uiDirty = false;
  for (let i = balls.length - 1; i >= 0; i--) {
    const ball = balls[i];
    for (let w = 0; w < WALL_COUNT; w++) {
      if (ball.gameData.wallHit[w] || ball.position.y < WALL_Y_LIST[w]) continue;
      ball.gameData.wallHit[w] = true;
      const bonus = wallBonus(w);
      if (bonus > 0) {
        ball.gameData.value += bonus;
        floatTexts.push({ x: ball.position.x, y: WALL_Y_LIST[w] - 6, text: '+$' + fmt(bonus), color: '#fff6c9', start: now });
      }
      wallPulses[w] = now;
    }

    if (ball.position.y - BALL_RADIUS > BOARD_H || now - ball.gameData.spawnTime > MAX_FALL_MS) {
      cashOutBall(ball, now);
      balls.splice(i, 1);
      uiDirty = true;
      if (heldBall === ball) heldBall = null;
      continue;
    }

    // A ball can land in a locally-symmetric spot with zero net force and
    // stall there forever; if it isn't making downward progress, nudge it.
    if (now >= ball.gameData.nextCheck) {
      const progressed = ball.position.y - ball.gameData.checkY > STALL_PROGRESS_PX;
      if (progressed) {
        ball.gameData.stallCount = 0;
      } else {
        ball.gameData.stallCount++;
        const kick = 2 + ball.gameData.stallCount * 1.5;
        Matter.Body.setVelocity(ball, {
          x: (Math.random() - 0.5) * kick,
          y: Math.max(ball.velocity.y, 0) + kick * 0.6,
        });
      }
      ball.gameData.checkY = ball.position.y;
      ball.gameData.nextCheck = now + STALL_CHECK_MS;
    }
  }
  if (uiDirty) {
    renderMoney();
    renderSpeedUpgrade();
    renderWallUpgrades();
    renderChests();
    save();
  }

  draw(now);
  rafId = requestAnimationFrame(gameLoop);
}

/* ---------- Init ---------- */

function init() {
  load();
  renderAll();
  setupPhysics();
  els.canvas.addEventListener('pointerdown', onPointerDown);
  els.canvas.addEventListener('pointermove', onPointerMove);
  els.canvas.addEventListener('pointerup', onPointerUp);
  els.canvas.addEventListener('pointercancel', onPointerUp);
  // Safety nets: catch a release the canvas never sees (pointer let go
  // outside the window, tab switched mid-drag) so a ball can't stay
  // stuck in a held position forever.
  window.addEventListener('pointerup', onWindowPointerUp);
  window.addEventListener('pointercancel', onWindowPointerUp);
  window.addEventListener('blur', releasePointer);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releasePointer();
  });
  els.buySpeed.addEventListener('click', buySpeedUpgrade);
  els.buyWalls.forEach((btn, i) => btn.addEventListener('click', () => buyWallUpgrade(i)));
  const interval = spawnInterval() * 1000;
  activeLanes().forEach((li, k) => {
    lastSpawnPerLane[li] = performance.now() - (k / MAX_LANES) * interval;
  });
  rafId = requestAnimationFrame(gameLoop);
}

document.addEventListener('DOMContentLoaded', init);
