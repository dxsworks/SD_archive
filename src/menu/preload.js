const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('menuBridge', {
  onOpen: (cb) => ipcRenderer.on('menu:open', (_e, data) => cb(data)),
  // 그린 뒤 필요한 창 크기, 왼쪽으로 뒤집었는지, 메인 판 높이, 가장 큰 판이 들어갈 창 높이
  ready: (seq, w, h, flip, mainH, minH) => ipcRenderer.send('menu:ready', seq, w, h, flip, mainH, minH),
  // 옮긴 뒤: 메인 판을 내려 그릴 만큼(offset), 실제 창 높이
  onPlaced: (cb) => ipcRenderer.on('menu:placed', (_e, seq, offset, height) => cb(seq, offset, height)),
  painted: (seq) => ipcRenderer.send('menu:painted', seq), // 옮긴 자리·크기로 다시 그렸음 → 보이게
  click: (id) => ipcRenderer.send('menu:click', id),
  close: () => ipcRenderer.send('menu:close'),
});
