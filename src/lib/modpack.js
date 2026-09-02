// Trois façons de définir le modpack d'un serveur via server.manifestUrl :
//
// 1. Un projet Modrinth (slug nu "fabulously-optimized" ou lien
//    modrinth.com/modpack/...) — l'appli interroge l'API Modrinth pour
//    trouver elle-même la version compatible avec le serveur (mcVersion +
//    loader configurés), sans que tu aies à chercher/coller le bon lien
//    .mrpack à la main à chaque changement de version.
//
// 2. Un .mrpack Modrinth direct (URL se terminant par .mrpack) — format
//    officiel Modrinth, API publique SANS clé (contrairement à CurseForge,
//    qui exige une clé privée impossible à embarquer dans une appli
//    distribuée sans qu'elle fuite). Le .mrpack contient :
//    - modrinth.index.json : liste des mods avec URL + hash déjà résolus,
//      à télécharger vers leur chemin (mods/, etc.) sous le dossier de jeu
//    - overrides/ (et client-overrides/) : fichiers à copier tels quels
//      (configs, resourcepacks fournis avec le pack) — pas de hash à
//      vérifier, on les réécrit à chaque sync, c'est rapide et local.
//
// 3. Un manifest.json "maison" hébergé par toi (ex: GitHub Releases) —
//    liste simple de mods avec leur URL et hash SHA256, tous placés dans
//    le dossier mods/ du serveur.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const { app } = require('electron');
const { downloadAndVerify } = require('./download');

function getGameDir(serverId) {
  return path.join(app.getPath('userData'), 'game', serverId);
}

function getModsDir(serverId) {
  // Un dossier de mods séparé par serveur, pour ne jamais mélanger deux modpacks.
  const dir = path.join(getGameDir(serverId), 'mods');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function fileHash(filePath, algo) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash(algo).update(buffer).digest('hex');
}

// Nom de la clé "dependencies" du .mrpack pour chaque loader.
const LOADER_DEPENDENCY_KEY = {
  fabric: 'fabric-loader',
  forge: 'forge',
  neoforge: 'neoforge',
  quilt: 'quilt-loader'
};

// Le .mrpack déclare la version de MC et de loader pour lesquels il a été
// fait (index.dependencies). On vérifie ça AVANT de télécharger le moindre
// mod : sans ce garde-fou, on télécharge tout le pack pour se le faire
// rejeter par Fabric/Forge au lancement (vu en test avec un pack en 26.2
// sur un serveur en 26.1.2).
function assertCompatible(index, server) {
  const deps = index.dependencies || {};
  if (deps.minecraft && deps.minecraft !== server.mcVersion) {
    throw new Error(
      `Ce modpack est fait pour Minecraft ${deps.minecraft}, mais le serveur est en ${server.mcVersion}.`
    );
  }

  const loaderKey = LOADER_DEPENDENCY_KEY[server.loader];
  if (loaderKey && server.loader !== 'vanilla' && !deps[loaderKey] && !deps[server.loader]) {
    throw new Error(`Ce modpack ne semble pas fait pour ${server.loader}.`);
  }
}

// Vrai si manifestUrl référence un PROJET Modrinth (pas un lien .mrpack
// direct) : soit un lien modrinth.com/modpack/<slug>, soit un slug/id nu
// (ex: "fabulously-optimized"), reconnu par l'absence de "://".
function isModrinthProjectRef(ref) {
  if (ref.includes('modrinth.com/')) return true;
  return !ref.includes('://');
}

function extractModrinthSlug(ref) {
  const match = ref.match(/modrinth\.com\/(?:modpack|mod)\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : ref.trim();
}

// Interroge l'API Modrinth pour trouver, parmi les versions du projet,
// celle compatible avec le loader et la version de Minecraft du serveur —
// filtré côté API (loaders + game_versions), pas besoin de télécharger
// chaque version pour vérifier. Retourne l'URL du .mrpack à utiliser.
async function resolveModrinthProject(projectRef, server) {
  const slug = extractModrinthSlug(projectRef);
  const params = new URLSearchParams();
  if (server.loader && server.loader !== 'vanilla') {
    params.set('loaders', JSON.stringify([server.loader]));
  }
  if (server.mcVersion) {
    params.set('game_versions', JSON.stringify([server.mcVersion]));
  }

  const res = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version?${params}`);
  if (!res.ok) {
    throw new Error(`Projet Modrinth "${slug}" introuvable ou inaccessible (HTTP ${res.status})`);
  }
  const versions = await res.json();
  if (!versions.length) {
    throw new Error(
      `Aucune version de "${slug}" compatible avec Minecraft ${server.mcVersion} (${server.loader}) sur Modrinth.`
    );
  }

  // Modrinth trie du plus récent au plus ancien : on prend la première.
  const file = versions[0].files.find((f) => f.filename.endsWith('.mrpack')) || versions[0].files[0];
  if (!file) throw new Error(`Aucun fichier .mrpack trouvé pour "${slug}".`);
  return file.url;
}

// Télécharge le .mrpack une seule fois et retourne à la fois la liste des
// mods à vérifier/télécharger ET l'archive (pour en extraire overrides/
// ensuite sans re-télécharger).
async function fetchMrpack(mrpackUrl, server) {
  const res = await fetch(mrpackUrl);
  if (!res.ok) throw new Error(`Modpack .mrpack introuvable (HTTP ${res.status})`);
  const buffer = await res.buffer();
  const zip = new AdmZip(buffer);

  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry) throw new Error('modrinth.index.json introuvable dans le .mrpack');
  const index = JSON.parse(zip.readAsText(indexEntry));

  assertCompatible(index, server);

  const files = (index.files || [])
    .filter((f) => !f.env || f.env.client !== 'unsupported')
    .map((f) => ({
      file: f.path, // ex: "mods/sodium-fabric-0.6.0.jar"
      url: f.downloads[0],
      hash: f.hashes?.sha1,
      algo: 'sha1',
      size: f.fileSize
    }));

  return { files, zip };
}

// Extrait overrides/ puis client-overrides/ (qui a priorité si présent)
// directement dans le dossier de jeu — configs, resourcepacks du pack.
function extractOverrides(zip, gameDir) {
  for (const prefix of ['overrides/', 'client-overrides/']) {
    zip.getEntries()
      .filter((entry) => entry.entryName.startsWith(prefix) && !entry.isDirectory)
      .forEach((entry) => {
        const relative = entry.entryName.slice(prefix.length);
        const dest = path.join(gameDir, relative);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, entry.getData());
      });
  }
}

async function fetchCustomManifest(manifestUrl) {
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`Manifest introuvable (${res.status})`);
  const manifest = await res.json(); // [{ file, url, sha256, size }]
  return manifest.map((mod) => ({
    file: path.join('mods', mod.file), // manifest maison : toujours dans mods/
    url: mod.url,
    hash: mod.sha256,
    algo: 'sha256',
    size: mod.size
  }));
}

function diffFiles(files, gameDir) {
  const toDownload = [];
  for (const entry of files) {
    const localPath = path.join(gameDir, entry.file);
    if (!fs.existsSync(localPath)) {
      toDownload.push(entry);
      continue;
    }
    if (fileHash(localPath, entry.algo) !== entry.hash) {
      toDownload.push(entry);
    }
  }
  return toDownload;
}

/**
 * Compare les fichiers locaux au modpack distant (.mrpack Modrinth ou
 * manifest maison, détecté via l'extension de l'URL).
 * Retourne la liste des fichiers manquants ou obsolètes (à télécharger),
 * sans encore les télécharger — laisse l'appelant décider (ex: barre de progression).
 */
async function checkModpackUpdate(server) {
  const gameDir = getGameDir(server.id);

  if (!server.manifestUrl) {
    return { upToDate: true, toDownload: [], gameDir, skipped: true };
  }

  let mrpackUrl = null;
  if (server.manifestUrl.endsWith('.mrpack')) {
    mrpackUrl = server.manifestUrl;
  } else if (isModrinthProjectRef(server.manifestUrl)) {
    mrpackUrl = await resolveModrinthProject(server.manifestUrl, server);
  }

  if (mrpackUrl) {
    const { files, zip } = await fetchMrpack(mrpackUrl, server);
    const toDownload = diffFiles(files, gameDir);
    return { upToDate: toDownload.length === 0, toDownload, gameDir, zip };
  }

  const files = await fetchCustomManifest(server.manifestUrl);
  const toDownload = diffFiles(files, gameDir);
  return { upToDate: toDownload.length === 0, toDownload, gameDir };
}

async function downloadModpackFile(entry, gameDir, onProgress) {
  const dest = path.join(gameDir, entry.file);
  try {
    await downloadAndVerify(
      entry.url,
      dest,
      { hash: entry.hash, algo: entry.algo, size: entry.size },
      (downloaded, total) => { if (onProgress) onProgress(entry.file, downloaded, total); }
    );
  } catch (err) {
    throw new Error(`Échec téléchargement ${entry.file} : ${err.message}`);
  }
}

// Vérifie et télécharge tout ce qui manque/a changé pour ce serveur, puis
// (pour un .mrpack) réécrit les overrides. Appelé avant le lancement du jeu.
async function syncModpack(server, onProgress) {
  const { toDownload, gameDir, skipped, zip } = await checkModpackUpdate(server);
  if (skipped) return { downloaded: 0 };

  for (const entry of toDownload) {
    if (onProgress) onProgress({ file: entry.file, total: toDownload.length });
    await downloadModpackFile(entry, gameDir, onProgress);
  }

  if (zip) extractOverrides(zip, gameDir);

  return { downloaded: toDownload.length };
}

module.exports = { checkModpackUpdate, syncModpack, getModsDir, getGameDir, resolveModrinthProject };
