const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('gestureAPI', {
  sendGesture: (data) => ipcRenderer.send('gesture', data),
  onStop: (callback) => ipcRenderer.on('stop-camera', () => callback())
})
