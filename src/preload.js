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
  fx: (type) => ipcRenderer.send('pet:fx', type), // 클릭 효과: down | move | up | cancel
  onCommand: (cb) => ipcRenderer.on('pet:command', (_e, cmd) => cb(cmd)),
  onSettings: (cb) => ipcRenderer.on('pet:settings', (_e, s) => cb(s)),
  onBoundsChanged: (cb) => ipcRenderer.on('pet:bounds-changed', () => cb()),
  onDownload: (cb) => ipcRenderer.on('pet:download', (_e, d) => cb(d)), // 학생 받는 중 표시 { label, got, total, error } | null
  quit: () => ipcRenderer.send('pet:quit'),
  // 합동 승리 (joint-main.js)
  status: (st) => ipcRenderer.send('pet:status', st), // { state, x, z, area }
  onJoint: (cb) => ipcRenderer.on('pet:joint', (_e, m) => cb(m)), // gather | host | away | back | abort
  readJointFile: (model) => ipcRenderer.invoke('pet:read-joint-file', model),
  jointReady: () => ipcRenderer.send('pet:joint-ready'),
  jointDone: (ends) => ipcRenderer.send('pet:joint-done', ends),
});
