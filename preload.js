const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),

  getSettings: () => ipcRenderer.invoke('get-settings'),
  setUsername: (username) => ipcRenderer.invoke('set-username', username),
  setRam: (ramMb) => ipcRenderer.invoke('set-ram', ramMb),

  getServers: () => ipcRenderer.invoke('get-servers'),
  setSelectedServer: (serverId) => ipcRenderer.invoke('set-selected-server', serverId),
  updateServerIp: (serverId, ip, port) => ipcRenderer.invoke('update-server-ip', { serverId, ip, port }),
  addServer: (serverData) => ipcRenderer.invoke('add-server', serverData),

  pingServer: () => ipcRenderer.invoke('ping-server'),
  checkModpack: () => ipcRenderer.invoke('check-modpack'),
  launchGame: () => ipcRenderer.invoke('launch-game'),
  onLaunchProgress: (callback) => {
    ipcRenderer.removeAllListeners('launch-progress');
    ipcRenderer.on('launch-progress', (_e, progress) => callback(progress));
  }
});
