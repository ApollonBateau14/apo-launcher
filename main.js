const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const Store = require('electron-store');
const { pingServer } = require('./src/lib/serverPing');
const { checkModpackUpdate } = require('./src/lib/modpack');
const { launchGame, getGameDir } = require('./src/lib/launcher');
const discordPresence = require('./src/lib/discordPresence');
const { t } = require('./src/lib/backendI18n');
const { getCatalog } = require('./src/lib/addons');

// Repo GitHub utilisé pour la vérification manuelle des mises à jour
// (bouton "Vérifier les mises à jour"), distinct de l'auto-update
// electron-updater (pas encore branché — voir README).
const GITHUB_REPO = 'ApollonBateau14/apo-launcher';

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
    manifestUrl: '',
    icon: ''
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

// Fusionne les métadonnées du code (toujours à jour pour nom/description/
// manifest) avec ce que le joueur a modifié en jeu (IP, port, loader,
// version — persisté dans le store, prioritaire sur le code une fois édité).
// Les serveurs ajoutés depuis l'appli ("+ Ajouter un serveur") ne sont pas
// dans SERVERS_META : ils sont conservés tels quels depuis le store.
// removedServerIds : serveurs du code supprimés par le joueur — sans ça,
// SERVERS_META les recréerait à chaque démarrage malgré la suppression.
function buildServersList() {
  const ips = loadServerIps();
  const persisted = store.get('servers', []);
  const persistedById = Object.fromEntries(persisted.map((s) => [s.id, s]));
  const codeIds = new Set(SERVERS_META.map((s) => s.id));
  const removedIds = new Set(store.get('removedServerIds', []));

  const codeServers = SERVERS_META.filter((meta) => !removedIds.has(meta.id)).map((meta) => {
    const prev = persistedById[meta.id];
    return {
      ...meta,
      ip: prev?.ip || ips[meta.id]?.ip || '',
      port: prev?.port || ips[meta.id]?.port || 25565,
      loader: prev?.loader || meta.loader,
      mcVersion: prev?.mcVersion || meta.mcVersion,
      icon: prev?.icon || meta.icon
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
    musicVolume: 10,
    language: 'en',
    enabledAddons: ['fabulously-optimized', 'fresh-animations'],
    selectedServerId: SERVERS_META[0]?.id || '',
    removedServerIds: []
  }
});

// Recalculé à chaque démarrage pour que les métadonnées du code (nom, loader,
// manifest…) restent à jour, sans perdre les IP/serveurs ajoutés en jeu.
store.set('servers', buildServersList());

function lang() {
  return store.get('language', 'en');
}

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
  discordPresence.connect();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  discordPresence.disconnect();
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC: fenêtre custom (sans bordure système) ----
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-close', () => mainWindow.close());

// ---- IPC: config utilisateur (pseudo, ram, volume musique) ----
// appVersion n'est pas persisté : toujours lu depuis package.json/le build.
ipcMain.handle('get-settings', () => ({ ...store.store, appVersion: app.getVersion() }));

ipcMain.handle('set-username', (_e, username) => {
  store.set('username', username);
  return true;
});

ipcMain.handle('set-ram', (_e, ramMb) => {
  store.set('ramMb', ramMb);
  return true;
});

ipcMain.handle('set-music-volume', (_e, volumePercent) => {
  store.set('musicVolume', volumePercent);
  return true;
});

ipcMain.handle('set-language', (_e, lang) => {
  store.set('language', lang);
  return true;
});

// ---- IPC: catalogue + sélection des mods/shaders optionnels ----
ipcMain.handle('get-addon-catalog', () => getCatalog());

ipcMain.handle('set-enabled-addons', (_e, ids) => {
  store.set('enabledAddons', ids);
  return true;
});

// ---- IPC: liste des serveurs + sélection ----
ipcMain.handle('get-servers', () => store.get('servers'));

ipcMain.handle('set-selected-server', (_e, serverId) => {
  store.set('selectedServerId', serverId);
  return true;
});

// ---- IPC: modifier un serveur (bouton ⚙ dans la liste) ----
ipcMain.handle('update-server', (_e, { serverId, ip, port, loader, mcVersion, icon }) => {
  const servers = store.get('servers', []);
  const server = servers.find((s) => s.id === serverId);
  if (!server) return false;
  server.ip = ip;
  server.port = port;
  if (loader) server.loader = loader;
  if (mcVersion) server.mcVersion = mcVersion;
  if (icon !== undefined) server.icon = icon;
  store.set('servers', servers);
  return true;
});

// ---- IPC: supprimer un serveur (persistant même pour ceux définis dans le code) ----
ipcMain.handle('remove-server', (_e, serverId) => {
  const servers = store.get('servers', []);
  if (servers.length <= 1) {
    return { success: false, error: t(lang(), 'cantDeleteLastServer') };
  }

  const codeIds = new Set(SERVERS_META.map((s) => s.id));
  if (codeIds.has(serverId)) {
    const removed = store.get('removedServerIds', []);
    if (!removed.includes(serverId)) {
      store.set('removedServerIds', [...removed, serverId]);
    }
  }

  const remaining = servers.filter((s) => s.id !== serverId);
  store.set('servers', remaining);

  if (store.get('selectedServerId') === serverId) {
    store.set('selectedServerId', remaining[0]?.id || '');
  }

  return { success: true };
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
    icon: data.icon || '',
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
    return { online: false, error: t(lang(), 'ipNotConfigured') };
  }
  try {
    return await pingServer(server.ip, server.port);
  } catch (err) {
    return { online: false, error: err.message };
  }
});

// ---- IPC: icône d'un serveur précis (pas forcément le sélectionné) ----
// Le protocole de ping Minecraft renvoie l'icône du serveur (favicon), on
// la récupère pour l'afficher dans la liste sans que le joueur ait à la
// renseigner à la main.
ipcMain.handle('get-server-favicon', async (_e, serverId) => {
  const servers = store.get('servers', []);
  const server = servers.find((s) => s.id === serverId);
  if (!server || !server.ip) return null;
  try {
    const result = await pingServer(server.ip, server.port);
    return result.favicon || null;
  } catch {
    return null;
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
    return { success: false, error: t(lang(), 'ipNotConfigured') };
  }
  const enabledAddons = store.get('enabledAddons', []);
  return launchGame({ username, ramMb, server, lang: lang(), enabledAddons });
});

// ---- IPC: ouvrir le dossier de jeu du serveur sélectionné (dépannage) ----
ipcMain.handle('open-game-folder', () => {
  const server = getSelectedServer();
  const dir = getGameDir(server.id);
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
  return true;
});

// ---- IPC: vérification manuelle des mises à jour via les Releases GitHub ----
// (Distinct de l'auto-update electron-updater, pas encore branché.)
ipcMain.handle('check-for-updates', async () => {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    if (res.status === 404) {
      return { error: t(lang(), 'noGithubRelease') };
    }
    if (!res.ok) {
      return { error: t(lang(), 'githubError', res.status) };
    }
    const data = await res.json();
    const latest = (data.tag_name || '').replace(/^v/, '');
    const current = app.getVersion();
    return {
      current,
      latest,
      upToDate: latest === current,
      url: data.html_url
    };
  } catch (err) {
    return { error: err.message };
  }
});
