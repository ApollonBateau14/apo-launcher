const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),

  getSettings: () => ipcRenderer.invoke('get-settings'),
  setUsername: (username) => ipcRenderer.invoke('set-username', username),
  setRam: (ramMb) => ipcRenderer.invoke('set-ram', ramMb),
  setMusicVolume: (volumePercent) => ipcRenderer.invoke('set-music-volume', volumePercent),
  openGameFolder: () => ipcRenderer.invoke('open-game-folder'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  getServers: () => ipcRenderer.invoke('get-servers'),
  setSelectedServer: (serverId) => ipcRenderer.invoke('set-selected-server', serverId),
  updateServer: (serverId, data) => ipcRenderer.invoke('update-server', { serverId, ...data }),
  addServer: (serverData) => ipcRenderer.invoke('add-server', serverData),
  removeServer: (serverId) => ipcRenderer.invoke('remove-server', serverId),

  pingServer: () => ipcRenderer.invoke('ping-server'),
  getServerFavicon: (serverId) => ipcRenderer.invoke('get-server-favicon', serverId),
  checkModpack: () => ipcRenderer.invoke('check-modpack'),
  launchGame: () => ipcRenderer.invoke('launch-game'),
  onLaunchProgress: (callback) => {
    ipcRenderer.removeAllListeners('launch-progress');
    ipcRenderer.on('launch-progress', (_e, progress) => callback(progress));
  }
});
