const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petBridge', {
  readModel: () => ipcRenderer.invoke('pet:read-model'),
  listModels: () => ipcRenderer.invoke('pet:list-models'),
  readModelFile: (name) => ipcRenderer.invoke('pet:read-model-file', name),
  getSettings: () => ipcRenderer.invoke('pet:get-settings'),
  getBounds: () => ipcRenderer.invoke('pet:get-bounds'),
  getWorkArea: (x, y) => ipcRenderer.invoke('pet:get-work-area', x, y),
  move: (x, y) => ipcRenderer.send('pet:move', x, y),
  setIgnoreMouse: (ignore) => ipcRenderer.send('pet:set-ignore', ignore),
  showMenu: () => ipcRenderer.send('pet:show-menu'),
  onCommand: (cb) => ipcRenderer.on('pet:command', (_e, cmd) => cb(cmd)),
  onSettings: (cb) => ipcRenderer.on('pet:settings', (_e, s) => cb(s)),
  onBoundsChanged: (cb) => ipcRenderer.on('pet:bounds-changed', () => cb()),
  quit: () => ipcRenderer.send('pet:quit'),
});
