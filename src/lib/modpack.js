// Vérifie le modpack local par rapport à un manifest.json hébergé (ex: GitHub Releases).
// Le manifest liste chaque mod avec son URL, sa taille et son hash SHA256.
// Chaque serveur a son propre manifestUrl (défini dans main.js) et donc son propre modpack.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { app } = require('electron');

function getModsDir(serverId) {
  // Un dossier de mods séparé par serveur, pour ne jamais mélanger deux modpacks.
  const dir = path.join(app.getPath('userData'), 'mods', serverId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sha256File(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Compare les mods locaux au manifest distant.
 * Retourne la liste des fichiers manquants ou obsolètes (à télécharger),
 * sans encore les télécharger — laisse l'appelant décider (ex: afficher une barre de progression).
 */
async function checkModpackUpdate(server) {
  if (!server.manifestUrl) {
    return { upToDate: true, toDownload: [], modsDir: getModsDir(server.id), skipped: true };
  }

  const res = await fetch(server.manifestUrl);
  if (!res.ok) throw new Error(`Manifest introuvable (${res.status})`);
  const manifest = await res.json(); // [{ file, url, sha256, size }]

  const modsDir = getModsDir(server.id);
  const toDownload = [];

  for (const mod of manifest) {
    const localPath = path.join(modsDir, mod.file);
    if (!fs.existsSync(localPath)) {
      toDownload.push(mod);
      continue;
    }
    const localHash = sha256File(localPath);
    if (localHash !== mod.sha256) {
      toDownload.push(mod);
    }
  }

  return { upToDate: toDownload.length === 0, toDownload, modsDir };
}

async function downloadMod(mod, modsDir, onProgress) {
  const res = await fetch(mod.url);
  if (!res.ok) throw new Error(`Échec téléchargement ${mod.file}`);
  const dest = path.join(modsDir, mod.file);
  const fileStream = fs.createWriteStream(dest);

  return new Promise((resolve, reject) => {
    let downloaded = 0;
    res.body.on('data', (chunk) => {
      downloaded += chunk.length;
      if (onProgress) onProgress(mod.file, downloaded, mod.size);
    });
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
}

module.exports = { checkModpackUpdate, downloadMod, getModsDir };
