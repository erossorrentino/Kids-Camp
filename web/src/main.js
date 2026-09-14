import { Game } from './game.js';
import { isTouchDevice } from './input.js';

const canvas = document.getElementById('viewport');
const game = new Game(canvas);
game.start();
window.__game = game; // handy for poking at live state from the devtools console

document.getElementById('touchHint').style.display = isTouchDevice ? 'list-item' : 'none';

const overlay = document.getElementById('startOverlay');
document.getElementById('startBtn').addEventListener('click', () => {
  overlay.classList.add('hidden');
  game.audio.resume();
  if (!isTouchDevice) canvas.requestPointerLock();
});
