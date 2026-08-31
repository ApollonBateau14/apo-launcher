const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { pingServer } = require('./src/lib/serverPing');
const { checkModpackUpdate } = require('./src/lib/modpack');
const { launchGame } = require('./src/lib/launcher');

// Métadonnées des serveurs : pas sensible, ça reste dans le code (public sur GitHub).
// Complète/adapte cette liste avec tes vrais serveurs et leurs manifests GitHub.
// L'IP/port réels NE sont PAS ici — voir servers.ip.json (jamais commité, cf. .gitignore).
const SERVERS_META = [
  {
    id: 'femboyserver',
    name: 'FemboyServer',
    description: 'Fabric 26.1.2 — Optimiser',
    loader: 'fabric',
    mcVersion: '26.1.2',
    loaderVersion: '',
    manifestUrl: ''
  }
];

// Lit servers.ip.json (fichier local, jamais commité) et fusionne l'IP/port
// avec les métadonnées ci-dessus. Sensible avec l'auth offline + whitelist :
// si ce fichier est public, n'importe qui peut se connecter avec un pseudo whitelisté.
function buildServersList() {
  const ipFile = path.join(__dirname, 'servers.ip.json');
  let ips = {};
  if (fs.existsSync(ipFile)) {
    try {
      ips = JSON.parse(fs.readFileSync(ipFile, 'utf-8'));
    } catch (err) {
      console.error('[ApoLauncher] servers.ip.json invalide :', err.message);
    }
  } else {
    console.warn('[ApoLauncher] servers.ip.json introuvable — copie servers.ip.example.json et renseigne tes IP.');
  }

  return SERVERS_META.map((server) => ({
    ...server,
    ip: ips[server.id]?.ip || '',
    port: ips[server.id]?.port || 25565
  }));
}

const store = new Store({
  defaults: {
    username: '',
    ramMb: 4096,
    selectedServerId: SERVERS_META[0]?.id || ''
  }
});

// Recalculé à chaque démarrage : l'IP/port viennent toujours de servers.ip.json
// (jamais d'IP périmée gardée dans le store persistant d'une session précédente).
store.set('servers', buildServersList());

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    resizable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC: fenêtre custom (sans bordure système) ----
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-close', () => mainWindow.close());

// ---- IPC: config utilisateur (pseudo, ram) ----
ipcMain.handle('get-settings', () => store.store);

ipcMain.handle('set-username', (_e, username) => {
  store.set('username', username);
  return true;
});

ipcMain.handle('set-ram', (_e, ramMb) => {
  store.set('ramMb', ramMb);
  return true;
});

// ---- IPC: liste des serveurs + sélection ----
ipcMain.handle('get-servers', () => store.get('servers'));

ipcMain.handle('set-selected-server', (_e, serverId) => {
  store.set('selectedServerId', serverId);
  return true;
});

function getSelectedServer() {
  const servers = store.get('servers');
  const selectedId = store.get('selectedServerId');
  return servers.find((s) => s.id === selectedId) || servers[0];
}

// ---- IPC: statut serveur sélectionné (online/max joueurs/ping) ----
ipcMain.handle('ping-server', async () => {
  const server = getSelectedServer();
  try {
    return await pingServer(server.ip, server.port);
  } catch (err) {
    return { online: false, error: err.message };
  }
});

// ---- IPC: vérifier/mettre à jour le modpack du serveur sélectionné ----
ipcMain.handle('check-modpack', async () => {
  const server = getSelectedServer();
  return checkModpackUpdate(server);
});

// ---- IPC: lancer le jeu sur le serveur sélectionné ----
ipcMain.handle('launch-game', async () => {
  const { username, ramMb } = store.store;
  const server = getSelectedServer();
  return launchGame({ username, ramMb, server });
});
