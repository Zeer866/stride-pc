const { app, BrowserWindow, session, shell, Menu, ipcMain, clipboard } = require('electron');
const path = require('path');

let win;
let flags = { adblock: true, https: true, strip: true, extra: [] };
const allow = new Set();
let blocked = 0;
let timer = null;

const AD = ('doubleclick.net googlesyndication.com googleadservices.com adservice.google.com ' +
  'google-analytics.com googletagmanager.com googletagservices.com connect.facebook.net ads.twitter.com ' +
  'analytics.twitter.com adnxs.com taboola.com outbrain.com criteo.com criteo.net pubmatic.com ' +
  'rubiconproject.com openx.net adsrvr.org scorecardresearch.com quantserve.com hotjar.com mixpanel.com ' +
  'popads.net propellerads.com exoclick.com adsterra.com mgid.com revcontent.com amazon-adsystem.com ' +
  'moatads.com adform.net smartadserver.com yieldmo.com 33across.com bidswitch.net casalemedia.com ' +
  'clickadu.com trafficjunky.com juicyads.com onclickads.net adcash.com zedo.com ads.yahoo.com ' +
  'advertising.com').split(' ');
const TRK = /^(utm_|fbclid|gclid|msclkid|igshid|yclid|_hsenc|mkt_tok)/i;
const PARTS = ['persist:stride', 'stride-private'];
const isAd = h => AD.concat(flags.extra).some(d => h === d || h.endsWith('.' + d));

function bump() {
  blocked++;
  if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      if (win && !win.isDestroyed()) win.webContents.send('blocked', blocked);
    }, 400);
  }
}

function harden(ses) {
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'fullscreen'));
  ses.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (d, cb) => {
      let u;
      try { u = new URL(d.url); } catch { return cb({}); }
      const h = u.hostname.replace(/^www\./, '');
      if (flags.adblock && isAd(u.hostname) && !allow.has(h)) { bump(); return cb({ cancel: true }); }
      if (flags.https && u.protocol === 'http:' &&
          !/^(localhost$|127\.|192\.168\.|10\.|.*\.local$)/.test(u.hostname)) {
        u.protocol = 'https:';
        return cb({ redirectURL: u.href });
      }
      if (flags.strip && d.resourceType === 'mainFrame') {
        let changed = false;
        for (const k of [...u.searchParams.keys()]) {
          if (TRK.test(k)) { u.searchParams.delete(k); changed = true; }
        }
        if (changed) return cb({ redirectURL: u.href });
      }
      cb({});
    }
  );
}

function onInput(e, i) {
  if (i.type !== 'keyDown' || !win) return;
  const k = i.key.toLowerCase();
  const c = i.control || i.meta;
  let n = null;
  if (c && !i.shift && !i.alt) {
    if (k === 't') n = 'newtab';
    else if (k === 'w') n = 'close';
    else if (k === 'l') n = 'focus';
    else if (k === 'r') n = 'reload';
    else if (k === 'd') n = 'star';
    else if (k === 'tab') n = 'next';
  } else if (c && i.shift && !i.alt) {
    if (k === 'n') n = 'private';
    else if (k === 'tab') n = 'prev';
    else if (k === 'r') n = 'reload';
  } else if (i.alt && !c) {
    if (k === 'arrowleft') n = 'back';
    else if (k === 'arrowright') n = 'forward';
    else if (k === 'home') n = 'home';
  } else if (k === 'f5') n = 'reload';
  else if (k === 'f11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); return; }
  if (n) { e.preventDefault(); win.webContents.send('shortcut', n); }
}

app.on('web-contents-created', (_, wc) => {
  wc.on('before-input-event', onInput);
  if (wc.getType() === 'webview') {
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url) && win) win.webContents.send('open-url', url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => {
      if (!/^(https?:|about:blank)/.test(url)) e.preventDefault();
    });
    wc.on('context-menu', (e, p) => {
      const items = [];
      if (p.linkURL) {
        items.push(
          { label: 'Abrir enlace en pestaña nueva', click: () => win && win.webContents.send('open-url', p.linkURL) },
          { label: 'Copiar enlace', click: () => clipboard.writeText(p.linkURL) },
          { type: 'separator' }
        );
      }
      if (p.isEditable) items.push({ role: 'cut', label: 'Cortar' }, { role: 'paste', label: 'Pegar' });
      if (p.selectionText) items.push({ role: 'copy', label: 'Copiar' });
      items.push({ role: 'selectAll', label: 'Seleccionar todo' });
      Menu.buildFromTemplate(items).popup();
    });
  }
});

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 420, minHeight: 520,
    backgroundColor: '#EAF4FF', title: 'Stride',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true
    }
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.on('will-attach-webview', (e, prefs, params) => {
    delete prefs.preload;
    delete prefs.preloadURL;
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.webSecurity = true;
    prefs.allowRunningInsecureContent = false;
    if (!PARTS.includes(params.partition)) e.preventDefault();
  });
  win.loadFile('index.html');
}

ipcMain.on('flags', (e, f) => {
  if (!win || e.sender !== win.webContents || !f || typeof f !== 'object') return;
  flags = {
    adblock: !!f.adblock, https: !!f.https, strip: !!f.strip,
    extra: Array.isArray(f.extra)
      ? f.extra.filter(x => typeof x === 'string' && /^[a-z0-9.-]+$/i.test(x)).map(x => x.toLowerCase()).slice(0, 500)
      : []
  };
});
ipcMain.on('allow', (e, h) => {
  if (!win || e.sender !== win.webContents || typeof h !== 'string') return;
  allow.add(h.replace(/^www\./, ''));
});
ipcMain.handle('clear', async e => {
  if (!win || e.sender !== win.webContents) return false;
  const s = session.fromPartition('persist:stride');
  await s.clearStorageData();
  await s.clearCache();
  return true;
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.userAgentFallback = app.userAgentFallback
    .replace(/ Electron\/\S+/, '').replace(/ stride\/\S+/i, '');
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    PARTS.forEach(p => harden(session.fromPartition(p)));
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
  }
