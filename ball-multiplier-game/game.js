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
const TRAY_MAX = 8;
const SAVE_KEY = 'ballMultiplierMergeSave.v2';

/* ---------- Plinko board layout (fixed internal resolution) ---------- */

const BOARD_W = 640;
const BOARD_H = 700;
const PEG_RADIUS = 5;
const SLOT_RADIUS = 26;
const BALL_RADIUS = 12;

// Multiplier slots spread out across the whole board, not confined to one row.
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

function buildPegs() {
  const rows = 14;
  const topMargin = BOARD_H * 0.07;
  const bottomMargin = BOARD_H * 0.09;
  const rowGap = (BOARD_H - topMargin - bottomMargin) / (rows - 1);
  const sideMargin = BOARD_W * 0.07;
  const colGap = (BOARD_W - sideMargin * 2) / 9;
  const pegs = [];
  for (let r = 0; r < rows; r++) {
    const y = topMargin + r * rowGap;
    const even = r % 2 === 0;
    const count = even ? 10 : 9;
    for (let c = 0; c < count; c++) {
      const x = even ? sideMargin + c * colGap : sideMargin + colGap / 2 + c * colGap;
      pegs.push({ x, y });
    }
  }
  return pegs;
}

const SLOT_POS = SLOT_FRACS.map(f => ({ x: f.x * BOARD_W, y: f.y * BOARD_H }));
const PEGS = buildPegs().filter(
  p => !SLOT_POS.some(s => Math.hypot(s.x - p.x, s.y - p.y) < SLOT_RADIUS + PEG_RADIUS + 10)
);

/* ---------- State ---------- */

let state = {
  money: 0,
  spawnLevel: 0,
  valueLevel: 0,
  slots: new Array(SLOT_COUNT).fill(null),
  tray: [],
};

let selectedTrayIndex = null;
let lastSpawn = 0;
let lastFrame = 0;
let rafId = null;

let engine = null;
let balls = [];
const slotPulses = new Array(SLOT_COUNT).fill(-9999);
let floatTexts = [];

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
    state.valueLevel = Number(parsed.valueLevel) || 0;
    if (Array.isArray(parsed.slots) && parsed.slots.length === SLOT_COUNT) {
      state.slots = parsed.slots.map(v => (v === null ? null : Math.max(0, Math.min(MAX_TIER, v))));
    }
    if (Array.isArray(parsed.tray)) {
      state.tray = parsed.tray.map(v => Math.max(0, Math.min(MAX_TIER, v))).slice(0, TRAY_MAX);
    }
  } catch (e) { /* ignore corrupt save */ }
}

/* ---------- Economy helpers ---------- */

function spawnInterval() {
  return Math.max(0.4, 3 - state.spawnLevel * 0.15);
}
function spawnUpgradeCost() {
  return Math.round(25 * Math.pow(1.5, state.spawnLevel));
}
function startValue() {
  return 1 + state.valueLevel;
}
function valueUpgradeCost() {
  return Math.round(40 * Math.pow(1.6, state.valueLevel));
}

function fmt(n) {
  if (n < 1000) return Math.floor(n).toString();
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
  valueSub: document.getElementById('valueSub'),
  buySpeed: document.getElementById('buySpeed'),
  buyValue: document.getElementById('buyValue'),
  chestList: document.getElementById('chestList'),
  tray: document.getElementById('tray'),
  toastStack: document.getElementById('toastStack'),
};
const ctx = els.canvas.getContext('2d');

/* ---------- Rendering (DOM panels) ---------- */

function renderMoney() {
  els.money.textContent = '$' + fmt(state.money);
}

function renderUpgrades() {
  els.speedSub.textContent = `Level ${state.spawnLevel} — every ${spawnInterval().toFixed(2)}s`;
  els.valueSub.textContent = `Level ${state.valueLevel} — balls start at $${fmt(startValue())}`;
  const speedCost = spawnUpgradeCost();
  const valueCost = valueUpgradeCost();
  els.buySpeed.querySelector('span').textContent = '$' + fmt(speedCost);
  els.buyValue.querySelector('span').textContent = '$' + fmt(valueCost);
  els.buySpeed.disabled = state.money < speedCost;
  els.buyValue.disabled = state.money < valueCost;
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

function renderTray() {
  els.tray.innerHTML = '';
  if (state.tray.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tray-empty';
    empty.textContent = 'Open a chest to get multipliers!';
    els.tray.appendChild(empty);
    return;
  }
  state.tray.forEach((tier, idx) => {
    const tile = document.createElement('div');
    tile.className = 'tray-tile';
    if (idx === selectedTrayIndex) tile.classList.add('selected');
    tile.style.background = TIERS[tier].color;
    tile.textContent = TIERS[tier].label;
    tile.addEventListener('click', () => onTrayClick(idx));
    els.tray.appendChild(tile);
  });
}

function renderAll() {
  renderMoney();
  renderUpgrades();
  renderChests();
  renderTray();
}

/* ---------- Toast ---------- */

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  els.toastStack.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/* ---------- Interaction ---------- */

function onTrayClick(idx) {
  selectedTrayIndex = selectedTrayIndex === idx ? null : idx;
  renderTray();
}

function onSlotClick(i) {
  if (state.slots[i] !== null) {
    sellSlot(i);
    return;
  }
  if (selectedTrayIndex === null) return;
  const tier = state.tray[selectedTrayIndex];
  state.tray.splice(selectedTrayIndex, 1);
  selectedTrayIndex = null;
  state.slots[i] = tier;
  checkMerges();
  renderAll();
  save();
}

function sellSlot(i) {
  const tier = state.slots[i];
  if (tier === null) return;
  state.slots[i] = null;
  state.money += SELL_VALUE[tier];
  toast(`Sold a ${TIERS[tier].label} multiplier for $${fmt(SELL_VALUE[tier])}`);
  tryFillFromTray();
  renderAll();
  save();
}

function tryFillFromTray() {
  while (state.tray.length > 0) {
    const emptyIndex = state.slots.findIndex(s => s === null);
    if (emptyIndex === -1) break;
    state.slots[emptyIndex] = state.tray.shift();
  }
  checkMerges();
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

function buyChest(chest) {
  if (state.money < chest.cost) return;
  if (state.tray.length >= TRAY_MAX) {
    toast('Your bag is full! Place or sell some multipliers first.');
    return;
  }
  state.money -= chest.cost;
  const tier = weightedRandomTier(chest.weights);
  state.tray.push(tier);
  toast(`${chest.name} gave you a ${TIERS[tier].label} multiplier!`);
  tryFillFromTray();
  renderAll();
  save();
}

function buySpeedUpgrade() {
  const cost = spawnUpgradeCost();
  if (state.money < cost) return;
  state.money -= cost;
  state.spawnLevel++;
  renderAll();
  save();
}

function buyValueUpgrade() {
  const cost = valueUpgradeCost();
  if (state.money < cost) return;
  state.money -= cost;
  state.valueLevel++;
  renderAll();
  save();
}

/* ---------- Physics (Plinko board) ---------- */

function setupPhysics() {
  engine = Matter.Engine.create();
  engine.gravity.y = 1;

  const pegBodies = PEGS.map(p =>
    Matter.Bodies.circle(p.x, p.y, PEG_RADIUS, { isStatic: true, restitution: 0.5, friction: 0 })
  );

  const slotBodies = SLOT_POS.map((p, i) => {
    const body = Matter.Bodies.circle(p.x, p.y, SLOT_RADIUS, { isStatic: true, restitution: 0.55, friction: 0 });
    body.isSlot = true;
    body.slotIndex = i;
    return body;
  });

  const wallOpts = { isStatic: true, restitution: 0.4, friction: 0 };
  const leftWall = Matter.Bodies.rectangle(-10, BOARD_H / 2, 20, BOARD_H * 2, wallOpts);
  const rightWall = Matter.Bodies.rectangle(BOARD_W + 10, BOARD_H / 2, 20, BOARD_H * 2, wallOpts);

  Matter.Composite.add(engine.world, [...pegBodies, ...slotBodies, leftWall, rightWall]);

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

function spawnBall() {
  const x = BOARD_W / 2 + (Math.random() - 0.5) * 40;
  const body = Matter.Bodies.circle(x, 16, BALL_RADIUS, {
    restitution: 0.6,
    friction: 0.02,
    frictionAir: 0.001,
    density: 0.0025,
  });
  body.isGameBall = true;
  body.gameData = { value: startValue(), hitSlots: new Set() };
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

function onCanvasClick(evt) {
  const p = canvasPointFromEvent(evt);
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
    onSlotClick(nearest);
  }
}

/* ---------- Drawing ---------- */

function draw(now) {
  ctx.clearRect(0, 0, BOARD_W, BOARD_H);

  ctx.fillStyle = '#241748';
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);

  ctx.fillStyle = 'rgba(183,169,217,0.85)';
  ctx.font = '700 16px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('▼ DROP ZONE ▼', BOARD_W / 2, 26);

  ctx.fillStyle = '#5b3f92';
  PEGS.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, PEG_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  });

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
      const selectable = selectedTrayIndex !== null;
      ctx.setLineDash(selectable ? [5, 4] : []);
      ctx.lineWidth = selectable ? 3 : 2;
      ctx.strokeStyle = selectable ? '#7ee787' : '#5b3f92';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  });

  ctx.fillStyle = 'rgba(255,215,0,0.12)';
  ctx.fillRect(0, BOARD_H - 40, BOARD_W, 40);
  ctx.fillStyle = '#ffd700';
  ctx.font = '700 16px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('💵 CASH OUT 💵', BOARD_W / 2, BOARD_H - 15);

  balls.forEach(b => {
    const { x, y } = b.position;
    ctx.beginPath();
    const grad = ctx.createRadialGradient(x - 4, y - 5, 2, x, y, BALL_RADIUS);
    grad.addColorStop(0, '#fff6c9');
    grad.addColorStop(0.6, '#ffd700');
    grad.addColorStop(1, '#b8860b');
    ctx.fillStyle = grad;
    ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a3200';
    ctx.font = '700 9px Segoe UI, sans-serif';
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

  const intervalMs = spawnInterval() * 1000;
  if (now - lastSpawn >= intervalMs) {
    lastSpawn = now;
    spawnBall();
  }

  let cashedOut = false;
  for (let i = balls.length - 1; i >= 0; i--) {
    const ball = balls[i];
    if (ball.position.y - BALL_RADIUS > BOARD_H) {
      cashOutBall(ball, now);
      balls.splice(i, 1);
      cashedOut = true;
    }
  }
  if (cashedOut) {
    renderMoney();
    renderUpgrades();
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
  els.canvas.addEventListener('click', onCanvasClick);
  els.buySpeed.addEventListener('click', buySpeedUpgrade);
  els.buyValue.addEventListener('click', buyValueUpgrade);
  lastSpawn = performance.now() - spawnInterval() * 1000; // spawn one immediately
  rafId = requestAnimationFrame(gameLoop);
}

document.addEventListener('DOMContentLoaded', init);
