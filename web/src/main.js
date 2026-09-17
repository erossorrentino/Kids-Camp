import { Game } from './game.js';
import { isTouchDevice } from './input.js';

// Surface any startup failure on the page itself instead of leaving a dead
// "Tap to Play" button with no clue why — this is a WebGL-heavy game running
// inside all kinds of embeds/browsers, so something failing to initialize is
// far more useful to see than to silently swallow.
function showFatalError(err) {
  console.error(err);
  let el = document.getElementById('fatalError');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fatalError';
    el.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:50', 'display:flex',
      'align-items:center', 'justify-content:center', 'padding:24px',
      'background:rgba(5,7,10,0.96)', 'color:#ff8a70', 'font:14px monospace',
      'white-space:pre-wrap', 'text-align:left', 'overflow:auto',
    ].join(';');
    document.body.appendChild(el);
  }
  const message = err && err.message ? err.message : String(err);
  el.textContent = `Couldn't start Crime Shooter:\n\n${message}\n\nTry reloading the page. If this keeps happening, your browser or this embedded view may be blocking WebGL or ES modules.`;
}

window.addEventListener('error', (e) => showFatalError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showFatalError(e.reason));

const canvas = document.getElementById('viewport');
const overlay = document.getElementById('startOverlay');
const startBtn = document.getElementById('startBtn');

document.getElementById('touchHint').style.display = isTouchDevice ? 'block' : 'none';

// The button listener is attached before anything risky (WebGL/audio/module
// work) runs, so a click always does *something* even if game setup fails.
startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  try {
    const game = new Game(canvas);
    window.__game = game; // handy for poking at live state from the devtools console
    game.start();
    overlay.classList.add('hidden');
    game.audio.resume();
    if (!isTouchDevice) {
      // Best-effort: a sandboxed embed (e.g. this game running as a Claude
      // Artifact) can deny Pointer Lock outright. Input's cursor-offset
      // fallback (see input.js) keeps mouse-look working either way, so a
      // rejection here just needs to not become an unhandled rejection.
      const req = canvas.requestPointerLock();
      if (req && typeof req.catch === 'function') req.catch(() => {});
    }
  } catch (err) {
    startBtn.disabled = false;
    showFatalError(err);
  }
});
