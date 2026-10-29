// Shared helpers: storage, nav, Moodle-safe checker
const KEY = 'moodleSafeSnippets';
const SEED = [{
  id: 'seed-callout', title: 'Info callout', category: 'Callout',
  notes: 'Uses Bootstrap alert classes available in Moodle themes.',
  html: '<div class="alert alert-info" role="alert"><strong>Tip:</strong> Save your work often.</div>'
}, {
  id: 'seed-accordion', title: 'Accordion (no JS)', category: 'Layout',
  notes: 'Native details/summary, works without scripts.',
  html: '<details><summary>Click to expand</summary><p>Hidden content goes here.</p></details>'
}];

const store = {
  all() {
    const raw = localStorage.getItem(KEY);
    if (raw === null) { this.save(SEED); return SEED.slice(); }
    try { return JSON.parse(raw); } catch { return []; }
  },
  save(list) { localStorage.setItem(KEY, JSON.stringify(list)); },
  get(id) { return this.all().find(s => s.id === id); },
  upsert(s) {
    const list = this.all(), i = list.findIndex(x => x.id === s.id);
    if (i >= 0) list[i] = s; else list.push(s);
    this.save(list);
  },
  remove(id) { this.save(this.all().filter(s => s.id !== id)); }
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const newId = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const param = n => new URLSearchParams(location.search).get(n);

// Returns [{level:'bad'|'warn'|'ok', text}]
function checkHtml(html) {
  const out = [], doc = new DOMParser().parseFromString(html, 'text/html');
  const bad = (sel, text) => { if (doc.querySelector(sel)) out.push({ level: 'bad', text }); };
  bad('script', 'Contains <script>: Moodle strips scripts.');
  bad('style', 'Contains <style>: usually stripped; use inline style or theme classes.');
  bad('form,input,button,select,textarea', 'Contains form elements: often removed or non-functional.');
  bad('object,embed', 'Contains <object>/<embed>: stripped.');
  bad('link,meta,base', 'Contains <link>/<meta>/<base>: stripped.');
  if (doc.querySelector('iframe')) out.push({ level: 'warn', text: 'Contains <iframe>: only allowed if your site permits it (trusted text / filters).' });
  const all = [...doc.body.querySelectorAll('*')];
  if (all.some(e => [...e.attributes].some(a => /^on/i.test(a.name)))) out.push({ level: 'bad', text: 'Contains inline event handlers (onclick etc.): stripped.' });
  if (all.some(e => ['href', 'src'].some(a => /^\s*javascript:/i.test(e.getAttribute(a) || '')))) out.push({ level: 'bad', text: 'Contains javascript: URLs.' });
  if (all.some(e => e.hasAttribute('id'))) out.push({ level: 'warn', text: 'Uses id attributes: may be prefixed/duplicated in Moodle; prefer classes.' });
  if (/<img\b(?![^>]*\balt=)/i.test(html)) out.push({ level: 'warn', text: 'An <img> is missing alt text (accessibility).' });
  if (!out.length) out.push({ level: 'ok', text: 'No Moodle-safety problems found.' });
  return out;
}
const renderChecks = list => list.map(c => `<div class="msg ${c.level}">${esc(c.text)}</div>`).join('');

// Preview with scripts disabled (sandbox with no allow-scripts), as Moodle would.
function preview(frame, html) {
  frame.setAttribute('sandbox', '');
  frame.srcdoc = '<!doctype html><meta charset="utf-8"><base target="_blank">' +
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css">' +
    '<body style="padding:1rem">' + html;
}

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const o = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = o, 1200);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav a').forEach(a => { if (a.getAttribute('href') === here) a.classList.add('active'); });
});

// Matrix-style falling code background
document.addEventListener('DOMContentLoaded', () => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.id = 'rain';
  document.body.prepend(c);
  const ctx = c.getContext('2d');
  const chars = '01<>/="{}();ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ'.split('');
  const size = 16;
  let drops = [];
  function resize() {
    c.width = innerWidth; c.height = innerHeight;
    drops = Array.from({ length: Math.ceil(c.width / size) }, () => Math.random() * -50);
  }
  resize(); addEventListener('resize', resize);
  setInterval(() => {
    const css = getComputedStyle(document.documentElement);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = size + 'px ' + css.getPropertyValue('--codeFont');
    drops.forEach((y, i) => {
      ctx.fillStyle = y % 7 < 1 ? css.getPropertyValue('--secondary') : css.getPropertyValue('--tertiary');
      ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * size, y * size);
      drops[i] = y * size > c.height && Math.random() > 0.975 ? 0 : y + 1;
    });
  }, 70);
});
