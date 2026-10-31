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

const SYNC_KEY = 'moodleSafeSync';
const syncCfg = () => ({ owner: 'stuanderson415-coder', repo: 'vocational-dev', branch: 'main', path: 'snippets.json', token: '', ...JSON.parse(localStorage.getItem(SYNC_KEY) || '{}') });

// Records carry updatedAt; deletes are kept as {id, deleted:true} tombstones so they sync.
const store = {
  raw() {
    const raw = localStorage.getItem(KEY);
    if (raw === null) { this.setRaw(SEED.map(s => ({ ...s, updatedAt: 0 }))); return this.raw(); }
    try { return JSON.parse(raw); } catch { return []; }
  },
  setRaw(list) { localStorage.setItem(KEY, JSON.stringify(list)); },
  all() { return this.raw().filter(s => !s.deleted); },
  save(list) { this.setRaw(list); scheduleSync(); },
  get(id) { return this.all().find(s => s.id === id); },
  upsert(s) {
    const list = this.raw(), rec = { ...s, updatedAt: Date.now() }, i = list.findIndex(x => x.id === s.id);
    if (i >= 0) list[i] = rec; else list.push(rec);
    this.save(list);
  },
  remove(id) {
    this.save(this.raw().map(s => s.id === id ? { id, deleted: true, updatedAt: Date.now() } : s));
  }
};

function mergeSnippets(a, b) {
  const map = new Map();
  [...a, ...b].forEach(s => {
    if (!s || !s.id) return;
    const cur = map.get(s.id);
    if (!cur || (s.updatedAt || 0) > (cur.updatedAt || 0)) map.set(s.id, s);
  });
  return [...map.values()].sort((x, y) => x.id < y.id ? -1 : 1);
}
const canon = list => JSON.stringify(mergeSnippets(list, []));
const toB64 = str => { let bin = ''; new TextEncoder().encode(str).forEach(b => bin += String.fromCharCode(b)); return btoa(bin); };
const fromB64 = b64s => new TextDecoder().decode(Uint8Array.from(atob(b64s.replace(/\s/g, '')), c => c.charCodeAt(0)));

let syncTimer, syncing = false;
function setStatus(msg, ok = true) { localStorage.setItem('moodleSafeSyncStatus', JSON.stringify({ msg, ok, at: Date.now() })); document.dispatchEvent(new CustomEvent('sync-status')); }
function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow().catch(() => {}), 1500); }

// Merges local with the GitHub file, then commits if anything changed. Without a token it only reads the published snippets.json.
async function syncNow(retry = true) {
  if (syncing) return;
  syncing = true;
  try {
    const c = syncCfg(), before = canon(store.raw());
    if (!c.token) {
      const r = await fetch(new URL(c.path, location.href), { cache: 'no-store' });
      if (r.ok) store.setRaw(mergeSnippets(store.raw(), await r.json()));
      setStatus('Read-only (no token set)');
    } else {
      const base = `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${c.path.split('/').map(encodeURIComponent).join('/')}`;
      const headers = { Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json' };
      const g = await fetch(`${base}?ref=${encodeURIComponent(c.branch)}`, { headers, cache: 'no-store' });
      let remote = [], sha;
      if (g.ok) { const j = await g.json(); sha = j.sha; remote = JSON.parse(fromB64(j.content) || '[]'); }
      else if (g.status !== 404) throw new Error(`GitHub read failed (${g.status}). Check token, repo and branch.`);
      const merged = mergeSnippets(store.raw(), remote);
      store.setRaw(merged);
      if (canon(remote) !== canon(merged)) {
        const p = await fetch(base, { method: 'PUT', headers, body: JSON.stringify({
          message: 'Update snippets', content: toB64(JSON.stringify(merged, null, 2) + '\n'), branch: c.branch, ...(sha ? { sha } : {}) }) });
        if (!p.ok) {
          if ((p.status === 409 || p.status === 422) && retry) { syncing = false; return syncNow(false); }
          throw new Error(`GitHub write failed (${p.status}). The token needs Contents: read and write.`);
        }
        setStatus('Saved to GitHub');
      } else setStatus('Up to date');
    }
    if (canon(store.raw()) !== before) document.dispatchEvent(new CustomEvent('snippets-synced'));
  } catch (e) { setStatus(e.message || 'Sync failed', false); throw e; }
  finally { syncing = false; }
}
document.addEventListener('DOMContentLoaded', () => { syncNow().catch(() => {}); });

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parseTags = str => [...new Set(String(str || '').split(/[\s,]+/).map(t => t.replace(/^#+/, '').toLowerCase().replace(/[^\w-]/g, '')).filter(Boolean))];
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
function preview(frame, html, allowEmbeds) {
  // Embed mode lets nested players run, but the opaque origin keeps them away from this site's data.
  frame.setAttribute('sandbox', allowEmbeds ? 'allow-scripts allow-popups allow-presentation' : '');
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

// Connected-node graph in the header (same idea as the fastigiatalab.com entry page)
document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('header');
  if (!header) return;
  const NS = 'http://www.w3.org/2000/svg', W = 680, H = 240;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('header-graph');
  header.prepend(svg);

  let seed = 731;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const hubs = [[120, 70], [310, 55], [500, 88], [220, 170], [420, 160]].map(([x, y], i) => ({ x, y, r: 4.3, c: i === 2 ? '#a3d2b6' : '#8db7a1' }));
  const nodes = [...hubs];
  for (let i = 0; i < 34; i++) nodes.push({ x: 25 + rand() * (W - 50), y: 20 + rand() * (H - 40), r: 1.6 + rand() * 2.4, c: '#8db7a1' });

  const mk = (tag, attrs, parent) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    parent.appendChild(el); return el;
  };
  const glow = mk('g', {}, svg), links = mk('g', {}, svg), dots = mk('g', {}, svg);
  hubs.forEach(h => mk('circle', { cx: h.x, cy: h.y, r: h.r * 4.2, fill: h.c, 'fill-opacity': .1 }, glow));
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
    if (d < 125 && rand() > 0.74) mk('line', {
      x1: nodes[i].x, y1: nodes[i].y, x2: nodes[j].x, y2: nodes[j].y,
      stroke: d < 70 ? '#8db7a1' : '#646464', 'stroke-opacity': d < 70 ? .55 : .32, 'stroke-width': d < 70 ? 1.25 : .85
    }, links);
  }
  nodes.forEach((n, i) => mk('circle', { cx: n.x, cy: n.y, r: n.r, fill: n.c, 'fill-opacity': i < hubs.length ? .95 : .8 }, dots));

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let tx = 0, ty = 0, px = 0, py = 0, t = 0;
  header.addEventListener('pointermove', e => {
    const r = header.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - .5) * 8; ty = ((e.clientY - r.top) / r.height - .5) * 6;
  });
  header.addEventListener('pointerleave', () => { tx = ty = 0; });
  (function tick() {
    t += .012; px += (tx - px) * .07; py += (ty - py) * .07;
    const x = Math.sin(t) * 1.8 + px, y = Math.cos(t * .9) * 1.3 + py;
    dots.setAttribute('transform', `translate(${x},${y})`);
    links.setAttribute('transform', `translate(${x * .85},${y * .85})`);
    glow.setAttribute('transform', `translate(${x * .6},${y * .6})`);
    requestAnimationFrame(tick);
  })();
});

// Share links: snippet is packed into the URL hash (no server), so anyone with the link can open it.
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function packSnippet(s) {
  const raw = new TextEncoder().encode(JSON.stringify({ title: s.title, category: s.category, tags: s.tags, notes: s.notes, html: s.html }));
  if (typeof CompressionStream === 'undefined') return 'u.' + b64(raw);
  const buf = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  return 'z.' + b64(new Uint8Array(buf));
}
async function unpackSnippet(token) {
  const bytes = unb64(token.slice(2));
  const raw = token[0] === 'z'
    ? new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())
    : bytes;
  const o = JSON.parse(new TextDecoder().decode(raw));
  if (!o || typeof o.html !== 'string') throw new Error('bad snippet');
  return { title: String(o.title || 'Shared snippet'), category: String(o.category || ''), tags: parseTags((o.tags || []).join(' ')), notes: String(o.notes || ''), html: o.html };
}
async function shareLink(s) {
  return new URL('share.html', location.href).href + '#' + await packSnippet(s);
}
