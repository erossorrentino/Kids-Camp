// Saving. The career is written to this browser's localStorage and, when the
// game runs as a published claude.ai artifact, also to the viewer's private
// per-user document so it follows you between devices. Whichever copy is
// newer wins on load. Everything is wrapped so a blocked storage never
// breaks the game.

const LOCAL_KEY = 'fairway-legends.career.v1';
const SETTINGS_KEY = 'fairway-legends.settings.v1';

let cloud = null; // { doc } once available
let cloudReady = null;

function serialize(c) {
  return JSON.stringify(c, (k, v) => (k.startsWith('_') ? undefined : v));
}

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

function readLocal() {
  try {
    const s = localStorage.getItem(LOCAL_KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}

export async function loadCareer() {
  const local = readLocal();
  let remote = null;
  try {
    const cl = await Promise.race([initCloud(), new Promise((r) => setTimeout(() => r(null), 4000))]);
    if (cl) {
      const snap = await cl.doc.get();
      if (snap.exists) {
        const d = snap.data();
        if (d && typeof d.json === 'string') remote = JSON.parse(d.json);
      }
    }
  } catch (e) {
    remote = null;
  }
  if (local && remote) return (remote.savedAt || 0) > (local.savedAt || 0) ? remote : local;
  return remote || local;
}

let pending = null;
let writing = false;
async function flushCloud() {
  if (writing || !pending || !cloud) return;
  writing = true;
  const body = pending;
  pending = null;
  try {
    await cloud.doc.set(body);
  } catch (e) {
    // keep local copy; cloud is best-effort
  }
  writing = false;
  if (pending) flushCloud();
}

export function saveCareer(c) {
  if (!c) return;
  c.savedAt = Date.now();
  const json = serialize(c);
  try { localStorage.setItem(LOCAL_KEY, json); } catch (e) { /* storage full or blocked */ }
  if (cloud) {
    pending = { json, savedAt: c.savedAt };
    flushCloud();
  }
}

export function deleteCareer() {
  try { localStorage.removeItem(LOCAL_KEY); } catch (e) { /* ignore */ }
  if (cloud) {
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
