// Small DOM / formatting helpers shared by the screens and HUD.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtToPar(n) {
  if (n == null) return '–';
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

export function toParClass(n) {
  if (n == null || n === 0) return 'tp-even';
  return n < 0 ? 'tp-under' : 'tp-over';
}

export function money(n, compact = false) {
  if (compact && n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
  if (compact && n >= 1e4) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

let modalRoot = null;
export function modal(html, { onClose, wide = false, cls = '' } = {}) {
  if (!modalRoot) modalRoot = document.getElementById('modal');
  const wrap = el(`<div class="modal-wrap"><div class="modal ${wide ? 'wide' : ''} ${cls}" role="dialog" aria-modal="true"><button class="modal-x" data-close aria-label="Close">&times;</button><div class="modal-body">${html}</div></div></div>`);
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey, true);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKey, true);
  modalRoot.appendChild(wrap);
  return { el: wrap.querySelector('.modal-body'), close };
}

export function toast(msg, ms = 2600) {
  const t = el(`<div class="toast">${esc(msg)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

export function statBar(label, value, extra = '') {
  const v = Math.round(value);
  const cls = v >= 88 ? 'elite' : v >= 75 ? 'good' : v >= 62 ? 'avg' : 'low';
  return `<div class="statbar"><span class="sb-l">${esc(label)}</span><span class="sb-track"><i class="${cls}" style="width:${Math.min(100, v)}%"></i></span><b class="sb-v">${v}</b>${extra}</div>`;
}
