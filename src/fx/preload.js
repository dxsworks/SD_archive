const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fxBridge', {
  onPointer: (cb) => ipcRenderer.on('fx:pointer', (_e, type, x, y) => cb(type, x, y)),
});
