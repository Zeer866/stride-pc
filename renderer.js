'use strict';
const $ = s => document.querySelector(s);
const K = 'stride.';
const ld = (k, d) => { try { const v = localStorage.getItem(K + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const sv = (k, v) => { try { localStorage.setItem(K + k, JSON.stringify(v)); } catch {} };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const I = {
  back: 'M15 18l-6-6 6-6', fwd: 'M9 18l6-6-6-6', home: 'M3 11l9-8 9 8v10h-6v-6H9v6H3z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  star: 'M12 3l2.8 5.9 6.2.8-4.6 4.3 1.2 6.3-5.6-3-5.6 3 1.2-6.3L3 9.7l6.2-.8z',
  reload: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7', lock: 'M6 11h12v9H6zM8 11V8a4 4 0 118 0v3',
  warn: 'M12 3l10 18H2zM12 10v5M12 18v.01', search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', plus: 'M12 5v14M5 12h14',
  tune: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6', clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  mask: 'M3 10c3-3 15-3 18 0v2c-1 4-4 6-6 6l-1-2h-4l-1 2c-2 0-5-2-6-6z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'
};
const ic = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${I[n]}"/></svg>`;

const ENG = {
  Google: 'https://www.google.com/search?q=%s', Bing: 'https://www.bing.com/search?q=%s',
  DuckDuckGo: 'https://duckduckgo.com/?q=%s', Brave: 'https://search.brave.com/search?q=%s',
  Ecosia: 'https://www.ecosia.org/search?q=%s', Startpage: 'https://www.startpage.com/do/search?q=%s'
};
const D = { engine: 'Google', custom: '', theme: 'auto', accent: '#0A6CFF', adblock: true, https: true, strip: true, priv: false, block: '' };
let S = { ...D, ...ld('s', {}) };
let B = ld('b', []);
let H = ld('h', []);
let SC = ld('sc', [['Google', 'https://www.google.com'], ['YouTube', 'https://www.youtube.com'], ['Wikipedia', 'https://es.wikipedia.org'], ['GitHub', 'https://github.com']]);
const save = () => sv('s', S);
const sync = () => stride.flags({ adblock: S.adblock, https: S.https, strip: S.strip, extra: S.block.split(/\s+/).filter(Boolean) });

let T = [], A = 0, nid = 1, SH = '', blocked = 0;
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const engName = () => S.engine === 'Personalizado' && S.custom.includes('%s') ? 'Propio' : (ENG[S.engine] ? S.engine : 'Google');
const engURL = () => S.engine === 'Personalizado' && S.custom.includes('%s') ? S.custom : (ENG[S.engine] || ENG.Google);

function toURL(q) {
  q = q.trim();
  if (!q) return null;
  if (/^(javascript|data|file|blob|about|chrome|view-source):/i.test(q)) return null;
  if (/^https?:\/\//i.test(q)) return q;
  if (!/\s/.test(q) && (/^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(q) || /^localhost(:\d+)?/i.test(q))) return 'https://' + q;
  return engURL().replace('%s', encodeURIComponent(q));
}
function toast(m) {
  const t = $('#toast');
  t.textContent = m; t.style.display = 'block';
  clearTimeout(t._t); t._t = setTimeout(() => (t.style.display = 'none'), 2800);
}

const cur = () => T.find(t => t.id === A);
const label = t => (t.url && !t.home ? (t.title || host(t.url)) : 'Nueva pestaña');
function addHist(t, u) {
  if (t.priv || !/^https?:/.test(u)) return;
  H = H.filter(x => x.url !== u);
  H.unshift({ url: u, title: host(u), t: Date.now() });
  H = H.slice(0, 200); sv('h', H);
}

function mkView(t, u) {
  const w = document.createElement('webview');
  w.setAttribute('partition', t.priv ? 'stride-private' : 'persist:stride');
  w.setAttribute('src', u);
  w.addEventListener('dom-ready', () => { t.ready = true; render(); });
  w.addEventListener('did-start-loading', () => { t.loading = true; t.err = null; render(); });
  w.addEventListener('did-stop-loading', () => { t.loading = false; render(); });
  w.addEventListener('did-navigate', e => { t.url = e.url; t.err = null; addHist(t, e.url); render(); });
  w.addEventListener('did-navigate-in-page', e => { if (e.isMainFrame) { t.url = e.url; render(); } });
  w.addEventListener('page-title-updated', e => { t.title = e.title; render(); });
  w.addEventListener('page-favicon-updated', e => { t.icon = (e.favicons && e.favicons[0]) || ''; render(); });
  w.addEventListener('did-fail-load', e => {
    if (e.isMainFrame && e.errorCode !== -3) { t.err = { code: e.errorCode, desc: e.errorDescription, url: e.validatedURL }; render(); }
  });
  $('#stage').prepend(w);
  t.wv = w;
}
function nav(t, u) {
  t.err = null; t.home = false; t.url = u;
  if (!t.wv) mkView(t, u);
  else if (t.ready) t.wv.loadURL(u).catch(() => {});
  else t.wv.setAttribute('src', u);
  render();
}
function newTab(priv = S.priv, url = '') {
  const t = { id: nid++, url: '', title: '', icon: '', priv, loading: false, ready: false, wv: null, err: null, home: false };
  T.push(t); A = t.id;
  if (url) nav(t, url);
  render();
  return t;
}
function closeTab(id) {
  const k = T.findIndex(t => t.id === id);
  if (k < 0) return;
  if (T[k].wv) T[k].wv.remove();
  T.splice(k, 1);
  if (!T.length) newTab(); else if (A === id) A = T[Math.max(0, k - 1)].id;
  render();
}
function go(q) {
  const u = toURL(q);
  if (!u) { toast('Dirección no permitida'); return; }
  nav(cur(), u);
}
const can = (t, d) => {
  try { return t.home ? (d < 0 && !!t.wv) : t.ready && (d < 0 ? t.wv.canGoBack() : t.wv.canGoForward()); } catch { return false; }
};
function step(d) {
  const t = cur();
  if (d < 0 && t.home && t.wv) { t.home = false; render(); return; }
  if (!can(t, d)) return;
  if (d < 0) t.wv.goBack(); else t.wv.goForward();
}
function reload() {
  const t = cur();
  if (t.err) nav(t, t.err.url); else if (t.wv && t.ready && !t.home) t.wv.reload();
}
function star() {
  const t = cur();
  if (!t.url || t.home) return;
  if (B.some(x => x.url === t.url)) B = B.filter(x => x.url !== t.url);
  else B.unshift({ url: t.url, title: t.title || host(t.url) });
  sv('b', B); render(); toast('Marcadores actualizados');
}

function render() {
  const t = cur(), q = $('#q');
  $('#tabs').innerHTML = T.map(x =>
    `<div class="tab ${x.id === A ? 'on' : ''}" data-a="tab" data-id="${x.id}">${x.priv ? '<i class="pv">●</i>' : (x.icon ? `<img src="${esc(x.icon)}" alt="">` : '')}<span>${esc(label(x))}</span><button data-a="close" data-id="${x.id}" aria-label="Cerrar pestaña">✕</button></div>`
  ).join('') + `<button class="ib sm" data-a="newtab" aria-label="Nueva pestaña">${ic('plus')}</button>`;
  const showHome = !t.url || t.home;
  $('#home').style.display = showHome ? 'flex' : 'none';
  T.forEach(x => { if (x.wv) x.wv.classList.toggle('on', x === t && !x.home); });
  $('#prog').classList.toggle('on', !!t.loading && !showHome);
  const e = $('#err');
  e.classList.toggle('on', !!t.err && !showHome);
  if (t.err) {
    const bl = t.err.code === -20;
    e.innerHTML = `${ic(bl ? 'shield' : 'warn')}<h2>${bl ? 'Stride bloqueó ' : 'No se pudo abrir '}${esc(host(t.err.url))}</h2><p>${bl ? 'Es un dominio de anuncios o rastreo conocido.' : esc(t.err.desc)}</p><button class="btn" data-a="retry">${bl ? 'Continuar de todos modos' : 'Reintentar'}</button>`;
  }
  const ph = 'Busca en ' + engName() + ' o escribe una dirección';
  q.placeholder = ph; $('#hqi').placeholder = ph; $('#eng').textContent = engName();
  if (document.activeElement !== q) q.value = showHome ? '' : t.url.replace(/^https?:\/\//, '');
  const sec = $('#sec');
  sec.className = showHome ? '' : (t.url.startsWith('https') ? 'ok' : 'bad');
  sec.innerHTML = ic(showHome ? 'search' : (t.url.startsWith('https') ? 'lock' : 'warn'));
  document.querySelector('[data-a=back]').disabled = !can(t, -1);
  document.querySelector('[data-a=fwd]').disabled = !can(t, 1);
  const st = document.querySelector('[data-a=star]');
  st.disabled = showHome;
  st.classList.toggle('on', !showHome && B.some(x => x.url === t.url));
  $('#shieldBtn').innerHTML = `${ic('shield')}${S.adblock ? blocked : 'Off'}`;
  $('#tag').textContent = t.priv ? 'Pestaña privada: no se guarda historial.' : 'Navega rápido. Navega seguro.';
  $('#sc').innerHTML = SC.map((s, i) =>
    `<button data-a="sc" data-i="${i}"><span class="t" style="background:hsl(${[...s[0]].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360} 70% 48%)">${esc(s[0][0].toUpperCase())}</span><em>${esc(s[0])}</em></button>`
  ).join('') + `<button data-a="addsc"><span class="t" style="background:var(--card);color:var(--ac)">+</span><em>Añadir</em></button>`;
  document.title = label(t) + ' – Stride';
}

const sw = (k, l, d) => `<div class="row"><div>${l}<small>${d}</small></div><input class="sw" type="checkbox" data-k="${k}" ${S[k] ? 'checked' : ''} aria-label="${l}"></div>`;
const seg = (k, o) => `<div class="seg">${o.map(([v, l]) => `<button data-a="set" data-k="${k}" data-v="${v}" class="${S[k] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const list = (arr, empty, del) => arr.length
  ? arr.map((x, i) => `<div class="row"><div class="u" data-a="open" data-u="${esc(x.url)}"><b>${esc(x.title || host(x.url))}</b><small>${esc(x.url)}</small></div>${del ? `<button class="del" data-a="${del}" data-i="${i}">Quitar</button>` : ''}</div>`).join('')
  : `<div class="empty">${empty}</div>`;
const V = {
  menu: () => `<h2>Menú</h2><div class="grid">
    <button data-a="newtab">${ic('plus')}Pestaña</button><button data-a="newpriv">${ic('mask')}Privada</button><button data-a="v" data-v="bm">${ic('star')}Marcadores</button>
    <button data-a="v" data-v="hist">${ic('clock')}Historial</button><button data-a="v" data-v="set">${ic('tune')}Ajustes</button><button data-a="clear">${ic('trash')}Borrar datos</button></div>
    ${sw('adblock', 'Bloqueador de anuncios', 'Bloqueados hasta ahora: ' + blocked + '.')}`,
  bm: () => `<h2>Marcadores</h2>${list(B, 'Toca la estrella en la barra para guardar una página.', 'delbm')}`,
  hist: () => `<h2>Historial<button class="del" data-a="clearh">Borrar todo</button></h2>${list(H, 'Aún no hay historial.')}`,
  set: () => `<h2>Ajustes</h2>
    <h3>Búsqueda</h3>
    <div class="row"><div>Buscador<small>Google es el principal.</small></div><select class="f" data-k="engine">${Object.keys(ENG).concat('Personalizado').map(e => `<option ${S.engine === e ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
    ${S.engine === 'Personalizado' ? `<input class="f" data-k="custom" value="${esc(S.custom)}" placeholder="https://ejemplo.com/buscar?q=%s" style="margin-top:10px">` : ''}
    <h3>Apariencia</h3>
    <div class="row"><div>Tema</div>${seg('theme', [['auto', 'Auto'], ['light', 'Claro'], ['dark', 'Oscuro']])}</div>
    <div class="row"><div>Color</div><div class="sws">${['#0A6CFF', '#00A8FF', '#6C5CE7', '#00B894', '#F0508C', '#FF8A00'].map(c => `<button data-a="ac" data-v="${c}" class="${S.accent === c ? 'on' : ''}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}</div></div>
    <h3>Seguridad y privacidad</h3>
    ${sw('adblock', 'Bloqueador de anuncios', 'Bloquea dominios de anuncios y rastreo.')}
    ${sw('https', 'Forzar HTTPS', 'Convierte http:// en https:// cuando es posible.')}
    ${sw('strip', 'Quitar rastreadores de enlaces', 'Elimina utm_, fbclid, gclid y similares.')}
    ${sw('priv', 'Pestañas nuevas privadas', 'No guardan historial ni cookies.')}
    <h3>Dominios bloqueados extra (separados por espacio)</h3>
    <textarea class="f" data-k="block" placeholder="anuncios.ejemplo.com rastreo.ejemplo.net" spellcheck="false">${esc(S.block)}</textarea>
    <h3>Accesos directos</h3>
    ${SC.map((s, i) => `<div class="row"><div class="u"><b>${esc(s[0])}</b><small>${esc(s[1])}</small></div><button class="del" data-a="delsc" data-i="${i}">Quitar</button></div>`).join('')}
    <h3>Datos</h3>
    <div class="row"><div>Restablecer Stride<small>Borra ajustes, marcadores e historial.</small></div><button class="del" data-a="reset">Restablecer</button></div>`
};
const draw = () => { $('#panel').innerHTML = V[SH](); };
const openSheet = n => { SH = n; $('#sheet').classList.add('on'); draw(); };
const closeSheet = () => $('#sheet').classList.remove('on');

function applyS() {
  const r = document.documentElement;
  const dk = S.theme === 'dark' || (S.theme === 'auto' && matchMedia('(prefers-color-scheme:dark)').matches);
  r.dataset.theme = dk ? 'dark' : 'light';
  r.style.setProperty('--ac', S.accent);
}

document.addEventListener('click', e => {
  if (e.target.id === 'sheet') { closeSheet(); return; }
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a, t = cur(), id = +b.dataset.id, i = +b.dataset.i, v = b.dataset.v;
  switch (a) {
    case 'back': step(-1); break;
    case 'fwd': step(1); break;
    case 'reload': reload(); break;
    case 'home': t.home = true; render(); $('#hqi').focus(); break;
    case 'star': star(); break;
    case 'menu': openSheet('menu'); break;
    case 'v': openSheet(v); break;
    case 'tab': A = id; render(); break;
    case 'close': e.stopPropagation(); closeTab(id); break;
    case 'newtab': newTab(); closeSheet(); $('#q').focus(); break;
    case 'newpriv': newTab(true); closeSheet(); $('#q').focus(); break;
    case 'open': closeSheet(); go(b.dataset.u); break;
    case 'sc': go(SC[i][1]); break;
    case 'addsc': {
      const n = window.prompt('Nombre del acceso directo');
      if (!n) break;
      const u = toURL(window.prompt('Dirección (ej. https://ejemplo.com)') || '');
      if (u) { SC.push([n.slice(0, 20), u]); sv('sc', SC); render(); }
      break;
    }
    case 'delsc': SC.splice(i, 1); sv('sc', SC); render(); draw(); break;
    case 'delbm': B.splice(i, 1); sv('b', B); render(); draw(); break;
    case 'clearh': H = []; sv('h', H); draw(); break;
    case 'set': S[b.dataset.k] = v; save(); applyS(); render(); draw(); break;
    case 'ac': S.accent = v; save(); applyS(); draw(); break;
    case 'clear': stride.clear().then(() => toast('Datos de navegación borrados')); closeSheet(); break;
    case 'reset':
      if (confirm('¿Borrar todos los datos de Stride?')) {
        Object.keys(localStorage).filter(k => k.startsWith(K)).forEach(k => localStorage.removeItem(k));
        stride.clear().then(() => location.reload());
      }
      break;
    case 'retry':
      if (t.err.code === -20) stride.allow(host(t.err.url));
      nav(t, t.err.url);
      break;
  }
});
document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.k;
  if (!k) return;
  S[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  save(); sync(); applyS(); render();
  if (k === 'engine' || k === 'adblock') draw();
});
$('#addr').addEventListener('submit', e => { e.preventDefault(); go($('#q').value); $('#q').blur(); });
$('#hq').addEventListener('submit', e => { e.preventDefault(); go($('#hqi').value); $('#hqi').value = ''; });
$('#q').addEventListener('focus', e => { const t = cur(); e.target.value = (!t.url || t.home) ? '' : t.url; e.target.select(); });
$('#q').addEventListener('blur', render);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
matchMedia('(prefers-color-scheme:dark)').addEventListener('change', applyS);

stride.onBlocked(n => { blocked = n; render(); });
stride.onOpenUrl(u => newTab(cur().priv, u));
stride.onShortcut(n => {
  switch (n) {
    case 'newtab': newTab(); $('#q').focus(); break;
    case 'private': newTab(true); $('#q').focus(); break;
    case 'close': closeTab(A); break;
    case 'focus': $('#q').focus(); break;
    case 'reload': reload(); break;
    case 'star': star(); break;
    case 'back': step(-1); break;
    case 'forward': step(1); break;
    case 'home': cur().home = true; render(); $('#hqi').focus(); break;
    case 'next': case 'prev': {
      const k = T.findIndex(x => x.id === A);
      A = T[(k + (n === 'next' ? 1 : T.length - 1)) % T.length].id; render(); break;
    }
  }
});

document.querySelectorAll('[data-i]').forEach(b => { b.innerHTML = ic(b.dataset.i); });
sync(); applyS(); newTab();
