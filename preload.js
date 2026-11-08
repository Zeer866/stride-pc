const { contextBridge, ipcRenderer } = require('electron');
const on = (ch, cb) => ipcRenderer.on(ch, (_e, v) => cb(v));
contextBridge.exposeInMainWorld('stride', {
  flags: f => ipcRenderer.send('flags', f),
  allow: h => ipcRenderer.send('allow', h),
  clear: () => ipcRenderer.invoke('clear'),
  onBlocked: cb => on('blocked', cb),
  onShortcut: cb => on('shortcut', cb),
  onOpenUrl: cb => on('open-url', cb)
});
