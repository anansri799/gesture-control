// src/preload.js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('gestureAPI', {

  // Overlay sends gesture events up to main for injection
  sendGesture: (data) => ipcRenderer.send('gesture', data),

  // Main sends stop signal down to overlay
  onStop: (callback) => ipcRenderer.on('stop-camera', () => callback())

})