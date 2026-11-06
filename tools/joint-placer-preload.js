const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('placerBridge', {
  combos: () => ipcRenderer.invoke('combos'),
  load: () => ipcRenderer.invoke('load'),
  save: (data) => ipcRenderer.invoke('save', data),
});
