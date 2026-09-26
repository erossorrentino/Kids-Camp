// Saving. The career is written to this browser's localStorage (plus a
// backup copy) and, when the game runs as a published claude.ai artifact,
// also to the viewer's private per-user document so it follows you between
// devices. Whichever copy is newer wins on load.
//
// Two rules keep progress from being lost:
//  - nothing is written to the account copy until we have read it once, so a
//    slow connection can never overwrite a saved career with an empty one;
//  - every blocked or failed write is caught, retried, and reported through
//    saveStatus() instead of breaking the game.

const LOCAL_KEY = 'fairway-legends.career.v1';
const BACKUP_KEY = 'fairway-legends.career.v1.bak';
const SETTINGS_KEY = 'fairway-legends.settings.v1';
const CLOUD_LIMIT = 200000; // the account copy must stay well under 256 KiB

let cloud = null; // { doc } once available
let cloudReady = null;
let remoteChecked = false;
let remoteHandler = null;
const status = { local: true, cloud: false, cloudAt: 0, pending: false };
const statusFns = new Set();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function serialize(c) {
  return JSON.stringify(c, (k, v) => (k.startsWith('_') ? undefined : v));
}

function emit() {
  for (const fn of statusFns) { try { fn({ ...status }); } catch (e) { /* ignore */ } }
}
export function onSaveStatus(fn) { statusFns.add(fn); fn({ ...status }); return () => statusFns.delete(fn); }
export function saveStatus() { return { ...status }; }

export function initCloud() {
  if (cloudReady) return cloudReady;
  cloudReady = (async () => {
    try {
      if (!window.claude || typeof window.claude.use !== 'function') return null;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return null;
      const uid = await user.id();
      if (!uid) return null;
      cloud = { doc: db.doc(`data/users/${uid}/career`) };
      return cloud;
    } catch (e) {
      return null;
    }
  })();
  return cloudReady;
}

function parseCareer(s) {
  try {
    const c = typeof s === 'string' ? JSON.parse(s) : null;
    return c && c.golfer ? c : null;
  } catch (e) {
    return null;
  }
}

function readLocal() {
  for (const k of [LOCAL_KEY, BACKUP_KEY]) {
    try {
      const c = parseCareer(localStorage.getItem(k));
      if (c) return c;
    } catch (e) { /* storage blocked */ }
  }
  return null;
}

async function readRemote(cl) {
  const snap = await cl.doc.get();
  if (!snap.exists) return null;
  const d = snap.data();
  return d && typeof d.json === 'string' ? parseCareer(d.json) : null;
}

function withTimeout(p, ms) {
  return Promise.race([p, wait(ms).then(() => { throw new Error('timeout'); })]);
}

// Called with a saved career found in the account after the game had
// already started without it. It resolves once the player has chosen.
export function setRemoteHandler(fn) { remoteHandler = fn; }

async function lateCheck() {
  const cl = await initCloud();
  if (!cl) return;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const remote = await withTimeout(readRemote(cl), 15000);
      if (remote && remoteHandler) await remoteHandler(remote);
      remoteChecked = true;
      flushCloud();
      return;
    } catch (e) {
      await wait(4000 * (attempt + 1));
    }
  }
  // Could not read the account copy: keep saving on this device only
}

export async function loadCareer(timeoutMs = 9000) {
  const local = readLocal();
  let remote = null;
  try {
    const cl = await Promise.race([initCloud(), wait(timeoutMs).then(() => null)]);
    if (cl) {
      remote = await withTimeout(readRemote(cl), timeoutMs);
      remoteChecked = true;
    }
  } catch (e) {
    remote = null;
  }
  if (!remoteChecked) lateCheck();
  if (local && remote) return (remote.savedAt || 0) > (local.savedAt || 0) ? remote : local;
  return remote || local;
}

// Very long careers: trim old tournament history from the account copy only
function cloudBody(c, json) {
  if (json.length <= CLOUD_LIMIT) return { json, savedAt: c.savedAt };
  const copy = JSON.parse(json);
  const h = copy.history || [];
  copy.history = h.filter((e, i) => i < 150 || e.pos <= 3);
  if (copy.active && copy.active.t && copy.history.length > 60) copy.history = copy.history.slice(0, 60);
  return { json: serialize(copy), savedAt: c.savedAt };
}

let pending = null;
let writing = false;
let flushTimer = 0;
let lastBackup = 0;

async function flushCloud() {
  clearTimeout(flushTimer);
  flushTimer = 0;
  if (writing || !pending || !cloud || !remoteChecked) return;
  writing = true;
  const body = pending;
  pending = null;
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    try {
      await cloud.doc.set(body);
      ok = true;
    } catch (e) {
      const code = e && e.code;
      if (['revoked', 'not_granted', 'capability_disabled', 'capability_removed', 'invalid_argument', 'quota_exceeded', 'transform_error'].includes(code)) break;
      await wait(1200 * (attempt + 1) + Math.random() * 600);
    }
  }
  writing = false;
  status.cloud = ok;
  if (ok) status.cloudAt = Date.now();
  status.pending = !!pending;
  emit();
  if (pending) flushCloud();
}

export function saveCareer(c, { now = false } = {}) {
  if (!c) return;
  c.savedAt = Date.now();
  const json = serialize(c);
  try {
    // Keep the previous save as a backup in case the newest copy is damaged
    if (Date.now() - lastBackup > 60000) {
      const prev = localStorage.getItem(LOCAL_KEY);
      if (prev) localStorage.setItem(BACKUP_KEY, prev);
      lastBackup = Date.now();
    }
    localStorage.setItem(LOCAL_KEY, json);
    status.local = true;
  } catch (e) {
    status.local = false; // storage full or blocked
  }
  if (cloud) {
    pending = cloudBody(c, json);
    status.pending = true;
    // Batch rapid saves (one per shot) into one write every few seconds
    if (now) flushCloud();
    else if (!flushTimer) flushTimer = setTimeout(flushCloud, 3000);
  }
  emit();
}

// Push any queued save right away (page hidden, round finished)
export function flushSaves() {
  if (pending) flushCloud();
}

export function deleteCareer() {
  try {
    localStorage.removeItem(LOCAL_KEY);
    localStorage.removeItem(BACKUP_KEY);
  } catch (e) { /* ignore */ }
  pending = null;
  if (cloud && remoteChecked) {
    cloud.doc.delete().catch(() => {});
  }
}

export function hasCloud() {
  return !!cloud;
}

export const DEFAULT_SETTINGS = {
  units: 'yards',
  rounds: 4,
  quality: 'auto',
  sound: true,
  aimHelp: true,
  swingSens: 1,
  tapIn: true,
  flyover: true,
};

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    return { ...DEFAULT_SETTINGS, ...(s || {}) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}
