const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('menuBridge', {
  onOpen: (cb) => ipcRenderer.on('menu:open', (_e, data) => cb(data)),
  ready: (seq, w, h, flip) => ipcRenderer.send('menu:ready', seq, w, h, flip), // 그린 뒤 필요한 창 크기, 왼쪽으로 뒤집었는지
  onPlaced: (cb) => ipcRenderer.on('menu:placed', (_e, seq) => cb(seq)),
  painted: (seq) => ipcRenderer.send('menu:painted', seq), // 옮긴 자리·크기로 다시 그렸음 → 보이게
  click: (id) => ipcRenderer.send('menu:click', id),
  close: () => ipcRenderer.send('menu:close'),
});
