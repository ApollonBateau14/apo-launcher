// S'assure qu'un Java compatible avec la version Minecraft du serveur est
// disponible, en téléchargeant un runtime portable (Eclipse Temurin/Adoptium)
// si nécessaire — sans jamais toucher au Java système installé par l'utilisateur.
// Tout est isolé dans userData/jre/<majorVersion>/, réutilisé aux lancements suivants.

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const { app } = require('electron');

function getJreRoot() {
  return path.join(app.getPath('userData'), 'jre');
}

// Le zip Adoptium contient un dossier racine du type jdk-21.0.5+11-jre/ —
// on cherche bin/javaw.exe dedans, sans supposer la profondeur exacte.
function findJavawRecursive(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    const candidate = path.join(full, 'bin', 'javaw.exe');
    if (fs.existsSync(candidate)) return candidate;
    const nested = findJavawRecursive(full);
    if (nested) return nested;
  }
  return null;
}

function getInstalledJavaMajor(javaExe) {
  return new Promise((resolve) => {
    exec(`"${javaExe}" -version`, (err, stdout, stderr) => {
      if (err) return resolve(null);
      const out = `${stdout} ${stderr}`;
      const match = out.match(/version "(\d+)(?:\.(\d+))?/);
      if (!match) return resolve(null);
      // "1.8.0_xxx" -> majeure 8 (ancien format) ; "17.0.5" -> majeure 17
      const major = match[1] === '1' ? Number(match[2]) : Number(match[1]);
      resolve(Number.isFinite(major) ? major : null);
    });
  });
}

// Mis en cache en mémoire (juste la durée de l'appli) — même manifest
// utilisé par getRequiredJavaMajor et getReleaseVersions, pas besoin de le
// re-télécharger à chaque fois (plusieurs centaines de Ko).
let cachedManifest = null;
async function getVersionManifest() {
  if (cachedManifest) return cachedManifest;
  const res = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
  if (!res.ok) throw new Error(`Manifest Mojang inaccessible (HTTP ${res.status})`);
  cachedManifest = await res.json();
  return cachedManifest;
}

// Lit la version Java requise directement depuis le manifest officiel Mojang
// pour cette version de Minecraft (champ javaVersion.majorVersion).
async function getRequiredJavaMajor(mcVersion) {
  try {
    const manifest = await getVersionManifest();
    const entry = manifest.versions.find((v) => v.id === mcVersion);
    if (!entry) return null;
    const versionRes = await fetch(entry.url);
    const versionJson = await versionRes.json();
    return versionJson.javaVersion?.majorVersion || null;
  } catch (err) {
    console.error('[ApoLauncher] Impossible de déterminer la version Java requise :', err.message);
    return null;
  }
}

// Liste des versions "release" (pas les snapshots/alpha/beta — un serveur
// modded tourne quasi toujours sur une release) — pour le sélecteur de
// version dans les modals d'ajout/édition de serveur, plus fiable qu'une
// saisie à la main (typo, version inexistante...).
async function getReleaseVersions() {
  const manifest = await getVersionManifest();
  return manifest.versions.filter((v) => v.type === 'release').map((v) => v.id);
}

function getAdoptiumOs() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

function getAdoptiumArch() {
  if (process.arch === 'arm64') return 'aarch64';
  return 'x64';
}

async function downloadJre(majorVersion, onProgress) {
  const url = `https://api.adoptium.net/v3/binary/latest/${majorVersion}/ga/${getAdoptiumOs()}/${getAdoptiumArch()}/jre/hotspot/normal/eclipse`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Aucun runtime Java ${majorVersion} disponible au téléchargement (HTTP ${res.status})`);
  }

  const total = Number(res.headers.get('content-length')) || 0;
  const destDir = path.join(getJreRoot(), String(majorVersion));
  fs.mkdirSync(destDir, { recursive: true });
  const zipPath = path.join(destDir, 'jre.zip');

  await new Promise((resolve, reject) => {
    let downloaded = 0;
    const fileStream = fs.createWriteStream(zipPath);
    res.body.on('data', (chunk) => {
      downloaded += chunk.length;
      if (onProgress && total) onProgress(downloaded / total);
    });
    res.body.on('error', reject);
    fileStream.on('error', reject);
    fileStream.on('finish', resolve);
    res.body.pipe(fileStream);
  });

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
  fs.unlinkSync(zipPath);

  const javaw = findJavawRecursive(destDir);
  if (!javaw) {
    throw new Error('Archive Java téléchargée mais javaw.exe introuvable dedans.');
  }
  return javaw;
}

// Retourne le chemin d'un javaw compatible avec mcVersion :
// 1. un runtime déjà téléchargé par ApoLauncher pour cette version majeure
// 2. le Java système s'il est déjà assez récent (on ne le remplace jamais)
// 3. sinon, téléchargement d'un JRE portable isolé dans userData/jre/
async function ensureJava(mcVersion, onProgress) {
  const requiredMajor = await getRequiredJavaMajor(mcVersion);

  if (requiredMajor) {
    const managedDir = path.join(getJreRoot(), String(requiredMajor));
    const cachedJavaw = findJavawRecursive(managedDir);
    if (cachedJavaw) return cachedJavaw;
  }

  const systemMajor = await getInstalledJavaMajor('java');
  if (systemMajor && (!requiredMajor || systemMajor >= requiredMajor)) {
    return 'javaw'; // Java système déjà compatible, MCLC le résout via le PATH
  }

  if (!requiredMajor) {
    // Version requise indéterminable (hors ligne, manifest inaccessible…) :
    // on tente quand même avec le Java système plutôt que de bloquer le lancement.
    return 'javaw';
  }

  if (onProgress) onProgress({ task: 'java-download-start', majorVersion: requiredMajor });
  const javaw = await downloadJre(requiredMajor, (ratio) => {
    if (onProgress) onProgress({ task: 'java-download-progress', majorVersion: requiredMajor, ratio });
  });
  if (onProgress) onProgress({ task: 'java-download-done', majorVersion: requiredMajor });
  return javaw;
}

module.exports = { ensureJava, getReleaseVersions };
