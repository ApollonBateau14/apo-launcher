const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Store = require('electron-store');
const { pingServer } = require('./src/lib/serverPing');
const { checkModpackUpdate } = require('./src/lib/modpack');
const { launchGame, getGameDir } = require('./src/lib/launcher');
const launchLog = require('./src/lib/launchLog');
const discordPresence = require('./src/lib/discordPresence');
const { t } = require('./src/lib/backendI18n');
const { getCompatibleCatalog } = require('./src/lib/addons');
const autoUpdate = require('./src/lib/autoUpdate');
const msAuth = require('./src/lib/msAuth');
const skins = require('./src/lib/skins');

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
  const metaById = Object.fromEntries(SERVERS_META.map((s) => [s.id, s]));
  const removedIds = new Set(store.get('removedServerIds', []));

  const fromMeta = (meta) => {
    const prev = persistedById[meta.id];
    return {
      ...meta,
      name: prev?.name || meta.name,
      ip: prev?.ip || ips[meta.id]?.ip || '',
      port: prev?.port || ips[meta.id]?.port || 25565,
      loader: prev?.loader || meta.loader,
      mcVersion: prev?.mcVersion || meta.mcVersion,
      icon: prev?.icon || meta.icon
    };
  };

  // Ordre : celui déjà persisté (respecte un réordonnancement manuel fait
  // dans l'appli) pour tout ce qui existe encore ; un nouveau serveur
  // ajouté côté code (jamais vu par ce joueur) est ajouté à la fin, dans
  // l'ordre du code — sans ça, l'ordre repartait de zéro à chaque lancement.
  const seen = new Set();
  const ordered = [];

  persisted.forEach((entry) => {
    if (removedIds.has(entry.id)) return;
    ordered.push(metaById[entry.id] ? fromMeta(metaById[entry.id]) : entry);
    seen.add(entry.id);
  });

  SERVERS_META.forEach((meta) => {
    if (seen.has(meta.id) || removedIds.has(meta.id)) return;
    ordered.push(fromMeta(meta));
  });

  return ordered;
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
    // Fabulously Optimized et Fresh Animations sont mutuellement exclusifs
    // (voir addons.js) — un seul activé par défaut.
    enabledAddons: ['fabulously-optimized'],
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
    // Sans ça, la fenêtre (barre des tâches, alt-tab) affiche l'icône
    // Electron par défaut — même si le .exe packagé, lui, a bien la bonne
    // icône (définie séparément dans package.json → build.win.icon).
    icon: path.join(__dirname, 'src', 'assets', 'icon.ico'),
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
// appVersion et systemRamMb ne sont pas persistés : toujours lus en direct
// (le système/le build peuvent changer entre deux lancements).
ipcMain.handle('get-settings', () => ({
  ...store.store,
  appVersion: app.getVersion(),
  systemRamMb: Math.round(os.totalmem() / 1024 / 1024)
}));

ipcMain.handle('set-username', (_e, username) => {
  store.set('username', username);
  return true;
});

// ---- IPC: connexion Microsoft (vrai compte Minecraft) ----
ipcMain.handle('ms-login', async () => {
  try {
    const account = await msAuth.loginInteractive();
    store.set('msAccount', account);
    return { success: true, account };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('ms-logout', () => {
  msAuth.logout();
  store.delete('msAccount');
  return true;
});

// Tentative de reconnexion silencieuse au démarrage (refresh token
// sauvegardé) — pas d'erreur si rien n'est sauvegardé, juste null.
ipcMain.handle('ms-silent-login', async () => {
  const account = await msAuth.loginSilent();
  if (account) store.set('msAccount', account);
  else store.delete('msAccount');
  return account;
});

// ---- IPC: skins (recherche par pseudo Minecraft réel + application) ----
ipcMain.handle('lookup-skin', async (_e, username) => {
  try {
    const result = await skins.lookupSkinByUsername(username);
    return result || { found: false };
  } catch (err) {
    return { error: err.message };
  }
});

// Skin actuel : celui du compte Microsoft connecté (récupéré en direct
// depuis Mojang) ou celui choisi manuellement en offline (sauvegardé).
ipcMain.handle('get-current-skin', async () => {
  const msAccount = store.get('msAccount', null);
  if (msAccount) {
    try {
      const result = await skins.lookupSkinByUuid(msAccount.uuid);
      return { skinUrl: result?.skinUrl || null, mode: 'microsoft' };
    } catch {
      return { skinUrl: null, mode: 'microsoft' };
    }
  }
  return { skinUrl: store.get('offlineSkinUrl', null), mode: 'offline' };
});

ipcMain.handle('apply-skin', async (_e, skinUrl) => {
  const msAccount = store.get('msAccount', null);
  if (msAccount) {
    try {
      const auth = await msAuth.getLaunchAuth();
      await skins.applySkinToMicrosoftAccount(auth.access_token, skinUrl);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  // Offline : pas de vrai compte à modifier, juste un aperçu local
  // sauvegardé (jamais visible par les autres joueurs en jeu — limitation
  // du mode offline, voir README).
  store.set('offlineSkinUrl', skinUrl);
  return { success: true };
});

// ---- IPC: favoris skin (recherches sauvegardées par le joueur) ----
// Ne stocke que le pseudo — le skin est relookup à chaque affichage
// (toujours à jour, et filtre proprement un compte renommé/disparu).
ipcMain.handle('get-skin-favorites', async () => {
  const names = store.get('skinFavorites', []);
  const results = await Promise.all(names.map(async (name) => {
    try {
      const result = await skins.lookupSkinByUsername(name);
      return result?.skinUrl ? result : null;
    } catch {
      return null;
    }
  }));
  return results.filter(Boolean);
});

ipcMain.handle('toggle-skin-favorite', (_e, name) => {
  const list = store.get('skinFavorites', []);
  const exists = list.some((n) => n.toLowerCase() === name.toLowerCase());
  const updated = exists
    ? list.filter((n) => n.toLowerCase() !== name.toLowerCase())
    : [...list, name];
  store.set('skinFavorites', updated);
  return { favorited: !exists };
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
// Filtré par compatibilité avec le serveur actuellement sélectionné : un
// mod sans version dispo pour ce loader/cette version MC n'apparaît pas.
ipcMain.handle('get-addon-catalog', () => getCompatibleCatalog(getSelectedServer()));

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
ipcMain.handle('update-server', (_e, { serverId, name, ip, port, loader, mcVersion, icon }) => {
  const servers = store.get('servers', []);
  const server = servers.find((s) => s.id === serverId);
  if (!server) return false;
  if (name && name.trim()) server.name = name.trim();
  server.ip = ip;
  server.port = port;
  if (loader) server.loader = loader;
  if (mcVersion) server.mcVersion = mcVersion;
  if (icon !== undefined) server.icon = icon;
  store.set('servers', servers);
  return true;
});

// ---- IPC: réordonner les serveurs (glisser-déposer dans la liste) ----
ipcMain.handle('reorder-servers', (_e, orderedIds) => {
  const servers = store.get('servers', []);
  const byId = Object.fromEntries(servers.map((s) => [s.id, s]));
  const reordered = orderedIds.map((id) => byId[id]).filter(Boolean);
  // Garde-fou : un id qui manquerait à l'appel (ne devrait pas arriver en
  // usage normal) ne fait pas disparaître le serveur, juste le renvoie en fin.
  const missing = servers.filter((s) => !orderedIds.includes(s.id));
  store.set('servers', [...reordered, ...missing]);
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
  const useMicrosoft = !!store.get('msAccount', null);
  return launchGame({ username, ramMb, server, lang: lang(), enabledAddons, useMicrosoft });
});

// ---- IPC: copier les logs du dernier lancement (dépannage) ----
ipcMain.handle('copy-logs', () => {
  clipboard.writeText(launchLog.getText());
  return true;
});

// ---- IPC: ouvrir un lien externe (article d'actu Minecraft) dans le navigateur ----
ipcMain.handle('open-external', (_e, url) => {
  if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url);
  return true;
});

// ---- IPC: ouvrir le dossier de jeu du serveur sélectionné (dépannage) ----
ipcMain.handle('open-game-folder', () => {
  const server = getSelectedServer();
  const dir = getGameDir(server.id);
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
  return true;
});

// ---- IPC: auto-update réel (electron-updater, via GitHub Releases) ----
// check déclenche les events 'checking-for-update'/'update-available'/...
// (voir src/lib/autoUpdate.js) renvoyés au renderer via 'update-status'.
// En dev (app non empaquetée), retombe sur une simple lecture de la
// dernière Release GitHub (pas de vrai téléchargement possible en dev).
ipcMain.handle('check-for-updates', () => autoUpdate.checkForUpdates(lang()));
ipcMain.handle('get-changelog-if-new', () => autoUpdate.getChangelogIfNew());
ipcMain.handle('download-update', () => autoUpdate.downloadUpdate());
ipcMain.handle('install-update', () => autoUpdate.installUpdate());
