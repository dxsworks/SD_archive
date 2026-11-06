const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('faceBridge', {
  read: (name) => ipcRenderer.invoke('read', name),
  save: (name, dataUrl) => ipcRenderer.invoke('save', name, dataUrl),
});
