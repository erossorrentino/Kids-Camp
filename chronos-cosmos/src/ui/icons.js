// Small procedurally drawn item/element icons (canvas -> data URL), so the
// UI never depends on emoji fonts or image files.
const cache = new Map();

function canvas(s = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = s;
  return [c, c.getContext('2d')];
}

const draw = {
  wood(g) {
    g.fillStyle = '#7a4f2a';
    g.save(); g.translate(32, 34); g.rotate(-0.5);
    g.fillRect(-22, -9, 44, 18);
    g.fillStyle = '#d9a86a'; g.beginPath(); g.ellipse(22, 0, 6, 9, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a5a2a'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(22, 0, 3, 5, 0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#5a3818'; g.beginPath(); g.moveTo(-18, -3); g.lineTo(12, -3); g.moveTo(-14, 4); g.lineTo(14, 4); g.stroke();
    g.restore();
  },
  stone(g) {
    g.fillStyle = '#8f8c86';
    g.beginPath(); g.moveTo(14, 44); g.lineTo(10, 28); g.lineTo(24, 14); g.lineTo(42, 16); g.lineTo(54, 32); g.lineTo(46, 48); g.closePath(); g.fill();
    g.fillStyle = '#b5b2aa'; g.beginPath(); g.moveTo(24, 14); g.lineTo(42, 16); g.lineTo(36, 28); g.lineTo(18, 26); g.closePath(); g.fill();
  },
  fiber(g) {
    g.strokeStyle = '#8cbf5a'; g.lineWidth = 3;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(32, 54); g.quadraticCurveTo(20 + i * 6, 30, 14 + i * 9, 10); g.stroke(); }
    g.strokeStyle = '#c8a060'; g.lineWidth = 4; g.beginPath(); g.moveTo(24, 42); g.lineTo(40, 42); g.stroke();
  },
  herb(g) {
    g.strokeStyle = '#4a8a3a'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 58); g.lineTo(32, 30); g.stroke();
    g.fillStyle = '#ffcf3a';
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.beginPath(); g.ellipse(32 + Math.cos(a) * 9, 24 + Math.sin(a) * 9, 7, 4, a, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ff8a2a'; g.beginPath(); g.arc(32, 24, 5, 0, Math.PI * 2); g.fill();
  },
  iron(g) {
    g.fillStyle = '#5c6474'; g.beginPath(); g.moveTo(10, 40); g.lineTo(18, 26); g.lineTo(48, 26); g.lineTo(56, 40); g.closePath(); g.fill();
    g.fillStyle = '#9aa4b8'; g.beginPath(); g.moveTo(18, 26); g.lineTo(48, 26); g.lineTo(44, 20); g.lineTo(22, 20); g.closePath(); g.fill();
    g.fillStyle = '#c5cedd'; g.fillRect(24, 22, 8, 2);
  },
  crystal(g) {
    const grd = g.createLinearGradient(20, 10, 44, 54); grd.addColorStop(0, '#d8f6ff'); grd.addColorStop(1, '#3aa8e0');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(32, 6); g.lineTo(44, 24); g.lineTo(38, 56); g.lineTo(26, 56); g.lineTo(20, 24); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.moveTo(32, 6); g.lineTo(32, 56); g.lineTo(26, 56); g.lineTo(20, 24); g.closePath(); g.fill();
  },
  ember(g) {
    const grd = g.createRadialGradient(32, 34, 2, 32, 34, 22); grd.addColorStop(0, '#fff2a0'); grd.addColorStop(0.4, '#ff8a2a'); grd.addColorStop(1, 'rgba(120,20,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(32, 34, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffcf6a'; g.beginPath(); g.moveTo(32, 10); g.quadraticCurveTo(44, 30, 32, 46); g.quadraticCurveTo(20, 30, 32, 10); g.fill();
  },
  hide(g) {
    g.fillStyle = '#9a7650'; g.beginPath(); g.moveTo(14, 18); g.quadraticCurveTo(32, 8, 50, 18); g.lineTo(54, 44); g.quadraticCurveTo(32, 56, 10, 44); g.closePath(); g.fill();
    g.strokeStyle = '#6a4a2a'; g.lineWidth = 2; g.setLineDash([3, 3]); g.strokeRect(18, 22, 28, 20); g.setLineDash([]);
  },
  starShard(g) {
    g.fillStyle = '#fff2b0';
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2; const r = i % 2 ? 9 : 24; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 4, 0, Math.PI * 2); g.fill();
  },
  potion(g, color) {
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(32, 38, 17, 0, Math.PI * 2); g.fill();
    g.fillStyle = color; g.beginPath(); g.arc(32, 40, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(27, 10, 10, 14);
    g.fillStyle = '#8a5a2a'; g.fillRect(26, 8, 12, 5);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(26, 35, 3, 0, Math.PI * 2); g.fill();
  },
  tonic(g) { draw.potion(g, '#ffb84a'); },
  draught(g) { draw.potion(g, '#5ad0ff'); },
  stew(g) {
    g.fillStyle = '#6a4a2a'; g.beginPath(); g.ellipse(32, 38, 22, 12, 0, 0, Math.PI); g.fill();
    g.fillStyle = '#d9824a'; g.beginPath(); g.ellipse(32, 38, 22, 7, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 2;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(24 + i * 8, 28); g.quadraticCurveTo(20 + i * 8, 18, 26 + i * 8, 10); g.stroke(); }
  },
  shard(g, c1, c2) {
    const grd = g.createLinearGradient(20, 8, 44, 56); grd.addColorStop(0, c1); grd.addColorStop(1, c2);
    g.fillStyle = grd; g.beginPath(); g.moveTo(32, 6); g.lineTo(48, 28); g.lineTo(32, 58); g.lineTo(16, 28); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.5; g.stroke();
  },
  shardDawn(g) { draw.shard(g, '#fff6c0', '#e0a02a'); },
  shardEmber(g) { draw.shard(g, '#ffd0a0', '#c0300a'); },
  shardStar(g) { draw.shard(g, '#e0f6ff', '#3a6ae0'); },
  scroll(g) {
    g.fillStyle = '#e8dcc0'; g.fillRect(14, 16, 36, 32);
    g.fillStyle = '#b8a070'; g.fillRect(10, 12, 44, 6); g.fillRect(10, 46, 44, 6);
    g.strokeStyle = '#6a5ab0'; g.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(22 + i * 7, 30 + (i % 2) * 6, 1.5, 0, Math.PI * 2); g.stroke(); }
  },
  starChart(g) { draw.scroll(g); },
  journal(g) {
    g.fillStyle = '#5a3a6a'; g.fillRect(16, 10, 32, 44);
    g.fillStyle = '#e8dcc0'; g.fillRect(19, 12, 27, 40);
    g.fillStyle = '#5a3a6a'; g.fillRect(16, 10, 5, 44);
  },
  seed(g) {
    const grd = g.createRadialGradient(32, 34, 2, 32, 34, 18); grd.addColorStop(0, '#fff6b0'); grd.addColorStop(1, '#c08a20');
    g.fillStyle = grd; g.beginPath(); g.ellipse(32, 34, 12, 16, 0.3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#5a8a3a'; g.lineWidth = 3; g.beginPath(); g.moveTo(34, 18); g.quadraticCurveTo(40, 8, 48, 10); g.stroke();
  },
  // elements
  el0(g) { draw.ember(g); },
  el1(g) {
    g.strokeStyle = '#bff0ff'; g.lineWidth = 3;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI; g.beginPath(); g.moveTo(32 - Math.cos(a) * 22, 32 - Math.sin(a) * 22); g.lineTo(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22); g.stroke(); }
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 4, 0, Math.PI * 2); g.fill();
  },
  el2(g) {
    g.fillStyle = '#d8c0ff'; g.beginPath(); g.moveTo(36, 6); g.lineTo(18, 36); g.lineTo(30, 36); g.lineTo(24, 58); g.lineTo(46, 26); g.lineTo(33, 26); g.closePath(); g.fill();
  },
  el3(g) {
    g.strokeStyle = '#ffe08a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(18, 10); g.lineTo(46, 10); g.lineTo(18, 54); g.lineTo(46, 54); g.closePath(); g.stroke();
    g.fillStyle = '#ffe08a'; g.beginPath(); g.moveTo(24, 48); g.lineTo(40, 48); g.lineTo(32, 38); g.fill();
  },
};

export function icon(id) {
  if (cache.has(id)) return cache.get(id);
  const [c, g] = canvas(64);
  (draw[id] || draw.starShard)(g);
  const url = c.toDataURL();
  cache.set(id, url);
  return url;
}
