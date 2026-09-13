import { Game } from './game.js';

const canvas = document.getElementById('viewport');
const game = new Game(canvas);
game.start();
window.__game = game; // handy for poking at live state from the devtools console

const overlay = document.getElementById('startOverlay');
document.getElementById('startBtn').addEventListener('click', () => {
  overlay.classList.add('hidden');
  game.audio.resume();
  canvas.requestPointerLock();
});
