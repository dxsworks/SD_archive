const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reviewBridge', {
  models: () => ipcRenderer.invoke('models'),
  load: () => ipcRenderer.invoke('load'),
  save: (data) => ipcRenderer.invoke('save', data),
});
