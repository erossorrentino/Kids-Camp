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
const SEGMENT_MS = 420;
const SAVE_KEY = 'ballMultiplierMergeSave.v1';

/* ---------- State ---------- */

let state = {
  money: 0,
  spawnLevel: 0,
  valueLevel: 0,
  slots: new Array(SLOT_COUNT).fill(null),
  tray: [],
};

let selectedTrayIndex = null;
let balls = [];
let lastSpawn = 0;
let waypoints = [];
let rafId = null;

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
  board: document.getElementById('board'),
  boardWrap: document.querySelector('.board-wrap'),
  hint: document.getElementById('hint'),
  speedSub: document.getElementById('speedSub'),
  valueSub: document.getElementById('valueSub'),
  buySpeed: document.getElementById('buySpeed'),
  buyValue: document.getElementById('buyValue'),
  chestList: document.getElementById('chestList'),
  tray: document.getElementById('tray'),
  toastStack: document.getElementById('toastStack'),
};

/* ---------- Rendering ---------- */

function renderMoney() {
  els.money.textContent = '$' + fmt(state.money);
}

function renderSlots() {
  els.board.innerHTML = '';
  for (let i = 0; i < SLOT_COUNT; i++) {
    const slotEl = document.createElement('div');
    slotEl.className = 'slot';
    slotEl.dataset.index = String(i);

    // Snake layout: bottom row runs right-to-left visually.
    const row = Math.floor(i / 5);
    const col = i % 5;
    const gridCol = row === 0 ? col + 1 : 5 - col;
    slotEl.style.gridRow = String(row + 1);
    slotEl.style.gridColumn = String(gridCol);

    const tier = state.slots[i];
    if (tier !== null) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.style.background = TIERS[tier].color;
      tile.textContent = TIERS[tier].label;
      tile.title = 'Click to sell for $' + fmt(SELL_VALUE[tier]);
      slotEl.appendChild(tile);
    } else if (selectedTrayIndex !== null) {
      slotEl.classList.add('selectable');
    }

    slotEl.addEventListener('click', () => onSlotClick(i));
    els.board.appendChild(slotEl);
  }
  computeWaypoints();
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

    const best = chest.weights.reduce((maxIdx, w, idx, arr) => (w > 0 ? idx : maxIdx), -1);
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
  renderSlots();
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
  renderSlots();
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

/* ---------- Ball animation ---------- */

function computeWaypoints() {
  const wrapRect = els.boardWrap.getBoundingClientRect();
  const slotEls = els.board.querySelectorAll('.slot');
  const centers = [];
  slotEls.forEach(el => {
    const r = el.getBoundingClientRect();
    centers.push({
      x: r.left + r.width / 2 - wrapRect.left,
      y: r.top + r.height / 2 - wrapRect.top,
    });
  });
  if (centers.length !== SLOT_COUNT) {
    waypoints = [];
    return;
  }
  const pre = { x: centers[0].x, y: centers[0].y - 46 };
  const post = { x: centers[SLOT_COUNT - 1].x, y: centers[SLOT_COUNT - 1].y + 46 };
  waypoints = [pre, ...centers, post];
}

function spawnBall() {
  if (waypoints.length === 0) computeWaypoints();
  if (waypoints.length === 0) return;
  const ballEl = document.createElement('div');
  ballEl.className = 'ball';
  ballEl.textContent = '$';
  els.boardWrap.appendChild(ballEl);
  balls.push({
    value: startValue(),
    seg: 0,
    segStart: performance.now(),
    el: ballEl,
  });
}

function showFloatText(pos, text, isMoney) {
  const el = document.createElement('div');
  el.className = 'float-text' + (isMoney ? ' money' : '');
  el.textContent = text;
  el.style.left = pos.x + 'px';
  el.style.top = pos.y + 'px';
  els.boardWrap.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function updateBalls(now) {
  for (let i = balls.length - 1; i >= 0; i--) {
    const ball = balls[i];
    const from = waypoints[ball.seg];
    const to = waypoints[ball.seg + 1];
    if (!from || !to) {
      ball.el.remove();
      balls.splice(i, 1);
      continue;
    }
    const t = Math.min(1, (now - ball.segStart) / SEGMENT_MS);
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    ball.el.style.left = x + 'px';
    ball.el.style.top = y + 'px';

    if (t >= 1) {
      const arrivedSlotIndex = ball.seg; // seg N arrives at slot N (0-based) for N in [0, SLOT_COUNT-1]
      const isSlotArrival = arrivedSlotIndex >= 0 && arrivedSlotIndex < SLOT_COUNT;
      if (isSlotArrival) {
        const tier = state.slots[arrivedSlotIndex];
        if (tier !== null) {
          ball.value *= TIERS[tier].mult;
          showFloatText(to, TIERS[tier].label, false);
          pulseSlot(arrivedSlotIndex);
        }
      }
      ball.seg++;
      if (ball.seg >= waypoints.length - 1) {
        state.money += ball.value;
        showFloatText(to, '+$' + fmt(ball.value), true);
        ball.el.remove();
        balls.splice(i, 1);
        renderMoney();
        renderUpgrades();
        renderChests();
        save();
        continue;
      }
      ball.segStart = now;
    } else {
      ball.el.textContent = fmt(ball.value);
    }
  }
}

function pulseSlot(index) {
  const slotEl = els.board.querySelector(`.slot[data-index="${index}"] .tile`);
  if (!slotEl) return;
  slotEl.classList.remove('pulse');
  // Force reflow so the animation can restart.
  void slotEl.offsetWidth;
  slotEl.classList.add('pulse');
}

function gameLoop(now) {
  const intervalMs = spawnInterval() * 1000;
  if (now - lastSpawn >= intervalMs) {
    lastSpawn = now;
    spawnBall();
  }
  updateBalls(now);
  rafId = requestAnimationFrame(gameLoop);
}

/* ---------- Init ---------- */

function init() {
  load();
  renderAll();
  els.buySpeed.addEventListener('click', buySpeedUpgrade);
  els.buyValue.addEventListener('click', buyValueUpgrade);
  window.addEventListener('resize', computeWaypoints);
  lastSpawn = performance.now() - spawnInterval() * 1000; // spawn one immediately
  rafId = requestAnimationFrame(gameLoop);
}

document.addEventListener('DOMContentLoaded', init);
