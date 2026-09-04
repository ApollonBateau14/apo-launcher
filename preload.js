const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),

  getSettings: () => ipcRenderer.invoke('get-settings'),
  setUsername: (username) => ipcRenderer.invoke('set-username', username),
  msLogin: () => ipcRenderer.invoke('ms-login'),
  msLogout: () => ipcRenderer.invoke('ms-logout'),
  msSilentLogin: () => ipcRenderer.invoke('ms-silent-login'),
  lookupSkin: (username) => ipcRenderer.invoke('lookup-skin', username),
  getCurrentSkin: () => ipcRenderer.invoke('get-current-skin'),
  applySkin: (skinUrl, mode) => ipcRenderer.invoke('apply-skin', skinUrl, mode),
  getSkinFavorites: () => ipcRenderer.invoke('get-skin-favorites'),
  toggleSkinFavorite: (name) => ipcRenderer.invoke('toggle-skin-favorite', name),
  setRam: (ramMb) => ipcRenderer.invoke('set-ram', ramMb),
  setMusicVolume: (volumePercent) => ipcRenderer.invoke('set-music-volume', volumePercent),
  setLanguage: (lang) => ipcRenderer.invoke('set-language', lang),
  getAddonCatalog: () => ipcRenderer.invoke('get-addon-catalog'),
  setEnabledAddons: (ids) => ipcRenderer.invoke('set-enabled-addons', ids),
  openGameFolder: () => ipcRenderer.invoke('open-game-folder'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  copyLogs: () => ipcRenderer.invoke('copy-logs'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getChangelogIfNew: () => ipcRenderer.invoke('get-changelog-if-new'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    ipcRenderer.removeAllListeners('update-status');
    ipcRenderer.on('update-status', (_e, status) => callback(status));
  },

  getServers: () => ipcRenderer.invoke('get-servers'),
  setSelectedServer: (serverId) => ipcRenderer.invoke('set-selected-server', serverId),
  updateServer: (serverId, data) => ipcRenderer.invoke('update-server', { serverId, ...data }),
  reorderServers: (orderedIds) => ipcRenderer.invoke('reorder-servers', orderedIds),
  addServer: (serverData) => ipcRenderer.invoke('add-server', serverData),
  removeServer: (serverId) => ipcRenderer.invoke('remove-server', serverId),

  pingServer: () => ipcRenderer.invoke('ping-server'),
  getServerFavicon: (serverId) => ipcRenderer.invoke('get-server-favicon', serverId),
  getServerOnlineMode: (serverId) => ipcRenderer.invoke('get-server-online-mode', serverId),
  getServerOptimized: (serverId) => ipcRenderer.invoke('get-server-optimized', serverId),
  getMcVersions: () => ipcRenderer.invoke('get-mc-versions'),
  checkModpack: () => ipcRenderer.invoke('check-modpack'),
  launchGame: () => ipcRenderer.invoke('launch-game'),
  onLaunchProgress: (callback) => {
    ipcRenderer.removeAllListeners('launch-progress');
    ipcRenderer.on('launch-progress', (_e, progress) => callback(progress));
  }
});
