// Auto-update réel via electron-updater, branché sur les Releases GitHub
// du repo (voir build.publish dans package.json — electron-builder génère
// automatiquement le app-update.yml embarqué dans le build à partir de ça).
//
// autoDownload à false : on laisse le joueur choisir de télécharger plutôt
// que de le faire silencieusement en fond ; l'UI (Settings) pilote les 3
// étapes via IPC : check -> download -> install.
//
// En dev (app pas encore empaquetée avec `npm run dist`), electron-updater
// n'a pas de app-update.yml à lire et échoue — on retombe alors sur une
// simple lecture de la dernière Release GitHub (comparaison de version texte,
// pas de vrai téléchargement/install) pour rester testable sans repackager.

const { app, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const fetch = require('node-fetch');
const Store = require('electron-store');
const { t } = require('./backendI18n');

const GITHUB_REPO = 'ApollonBateau14/apo-launcher';
const metaStore = new Store({ name: 'launcher-meta' });

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function sendStatus(status) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send('update-status', status);
}

autoUpdater.on('checking-for-update', () => sendStatus({ state: 'checking' }));
autoUpdater.on('update-available', (info) => sendStatus({ state: 'available', version: info.version }));
autoUpdater.on('update-not-available', () => sendStatus({ state: 'not-available', current: app.getVersion() }));
autoUpdater.on('error', (err) => sendStatus({ state: 'error', message: err.message }));
autoUpdater.on('download-progress', (p) => sendStatus({ state: 'downloading', percent: Math.round(p.percent) }));
autoUpdater.on('update-downloaded', () => sendStatus({ state: 'downloaded' }));

async function checkForUpdatesDev(lang) {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    if (res.status === 404) return { error: t(lang, 'noGithubRelease') };
    if (!res.ok) return { error: t(lang, 'githubError', res.status) };
    const data = await res.json();
    const latest = (data.tag_name || '').replace(/^v/, '');
    const current = app.getVersion();
    return { current, latest, upToDate: latest === current, url: data.html_url, dev: true };
  } catch (err) {
    return { error: err.message };
  }
}

async function checkForUpdates(lang) {
  if (!app.isPackaged) {
    return checkForUpdatesDev(lang);
  }
  try {
    await autoUpdater.checkForUpdates();
    return { started: true };
  } catch (err) {
    return { error: err.message };
  }
}

async function downloadUpdate() {
  try {
    await autoUpdater.downloadUpdate();
    return { started: true };
  } catch (err) {
    return { error: err.message };
  }
}

function installUpdate() {
  autoUpdater.quitAndInstall();
}

// Renvoie les notes de la release en cours, seulement la première fois
// qu'on la détecte depuis une mise à jour (version différente de la
// dernière vue) — pour afficher un changelog une fois après un auto-update,
// pas à chaque lancement, et jamais à la toute première installation.
async function getChangelogIfNew() {
  const current = app.getVersion();
  const lastSeen = metaStore.get('lastSeenVersion', null);
  metaStore.set('lastSeenVersion', current);

  if (!lastSeen || lastSeen === current) return null;

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/tags/v${current}`);
    if (!res.ok) return { version: current, notes: null };
    const data = await res.json();
    return { version: current, notes: data.body || null };
  } catch {
    return { version: current, notes: null };
  }
}

module.exports = { checkForUpdates, downloadUpdate, installUpdate, getChangelogIfNew };
