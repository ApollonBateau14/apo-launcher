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

function loadServerIps() {
  const ipFile = path.join(__dirname, 'servers.ip.json');
  if (!fs.existsSync(ipFile)) {
    console.warn('[ApoLauncher] servers.ip.json introuvable — copie servers.ip.example.json et renseigne tes IP.');
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(ipFile, 'utf-8'));
  } catch (err) {
    console.error('[ApoLauncher] servers.ip.json invalide :', err.message);
    return {};
  }
}

// Fusionne les métadonnées du code (toujours à jour) avec l'IP/port :
// - si déjà modifiée en jeu (bouton ⚙, persisté dans le store) → gardée telle quelle
// - sinon reprise de servers.ip.json (fichier local, jamais commité)
// Les serveurs ajoutés depuis l'appli ("+ Ajouter un serveur") ne sont pas dans
// SERVERS_META : ils sont conservés tels quels depuis le store persistant.
function buildServersList() {
  const ips = loadServerIps();
  const persisted = store.get('servers', []);
  const persistedById = Object.fromEntries(persisted.map((s) => [s.id, s]));
  const codeIds = new Set(SERVERS_META.map((s) => s.id));

  const codeServers = SERVERS_META.map((meta) => {
    const prev = persistedById[meta.id];
    return {
      ...meta,
      ip: prev?.ip || ips[meta.id]?.ip || '',
      port: prev?.port || ips[meta.id]?.port || 25565
    };
  });

  const customServers = persisted.filter((s) => !codeIds.has(s.id));

  return [...codeServers, ...customServers];
}

const DIACRITICS_REGEX = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

function slugify(text) {
  const withoutAccents = text.toLowerCase().normalize('NFD').replace(DIACRITICS_REGEX, '');
  return withoutAccents.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'serveur';
}

const store = new Store({
  defaults: {
    username: '',
    ramMb: 4096,
    selectedServerId: SERVERS_META[0]?.id || ''
  }
});

// Recalculé à chaque démarrage pour que les métadonnées du code (nom, loader,
// manifest…) restent à jour, sans perdre les IP/serveurs ajoutés en jeu.
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

// ---- IPC: modifier l'IP/port d'un serveur (bouton ⚙ dans la liste) ----
ipcMain.handle('update-server-ip', (_e, { serverId, ip, port }) => {
  const servers = store.get('servers', []);
  const server = servers.find((s) => s.id === serverId);
  if (!server) return false;
  server.ip = ip;
  server.port = port;
  store.set('servers', servers);
  return true;
});

// ---- IPC: ajouter un serveur depuis l'appli (bouton "+ Ajouter un serveur") ----
ipcMain.handle('add-server', (_e, data) => {
  const servers = store.get('servers', []);
  const baseId = slugify(data.name || '');
  let id = baseId;
  let suffix = 2;
  while (servers.some((s) => s.id === id)) {
    id = `${baseId}-${suffix++}`;
  }

  const newServer = {
    id,
    name: data.name || id,
    description: data.description || '',
    loader: data.loader || 'vanilla',
    mcVersion: data.mcVersion || '',
    loaderVersion: data.loaderVersion || '',
    manifestUrl: data.manifestUrl || '',
    ip: data.ip || '',
    port: Number(data.port) || 25565
  };
  servers.push(newServer);
  store.set('servers', servers);
  return newServer;
});

function getSelectedServer() {
  const servers = store.get('servers');
  const selectedId = store.get('selectedServerId');
  return servers.find((s) => s.id === selectedId) || servers[0];
}

// ---- IPC: statut serveur sélectionné (online/max joueurs/ping) ----
ipcMain.handle('ping-server', async () => {
  const server = getSelectedServer();
  if (!server.ip) {
    return { online: false, error: 'IP non configurée — clique sur ⚙ pour la renseigner.' };
  }
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
  if (!server.ip) {
    return { success: false, error: 'IP non configurée pour ce serveur — clique sur ⚙ pour la renseigner.' };
  }
  return launchGame({ username, ramMb, server });
});
