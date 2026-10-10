const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fxBridge', {
  onConfig: (cb) => ipcRenderer.on('fx:config', (_e, cfg) => cb(cfg)),
  onPointer: (cb) => ipcRenderer.on('fx:pointer', (_e, type, x, y) => cb(type, x, y)),
});
