// Installe automatiquement uBlock Origin dans la session du navigateur
// NameMC intégré, en téléchargeant leur build "manuel" officiel (celui que
// leur README appelle à charger via "Load unpacked" dans Chrome) — pas de
// Chrome Web Store, Electron ne sait pas installer depuis là. Isolé dans
// userData/extensions/ublock/, réutilisé aux lancements suivants.

const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const { app, session } = require('electron');

function getExtensionsRoot() {
  return path.join(app.getPath('userData'), 'extensions');
}

// Le zip peut extraire soit à plat (manifest.json à la racine), soit dans
// un sous-dossier — on cherche manifest.json sans supposer la profondeur.
function findManifestDir(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  if (entries.some((e) => e.isFile() && e.name === 'manifest.json')) return dir;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = findManifestDir(path.join(dir, entry.name));
    if (found) return found;
  }
  return null;
}

async function downloadUblock(destDir) {
  const releaseRes = await fetch('https://api.github.com/repos/gorhill/uBlock/releases/latest', {
    headers: { 'User-Agent': 'apo-launcher' }
  });
  if (!releaseRes.ok) throw new Error(`Impossible de récupérer la release uBlock Origin (HTTP ${releaseRes.status})`);
  const release = await releaseRes.json();
  const asset = (release.assets || []).find((a) => /\.chromium\.zip$/i.test(a.name));
  if (!asset) throw new Error('Aucun build "chromium.zip" trouvé dans la dernière release uBlock Origin.');

  const zipRes = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'apo-launcher' } });
  if (!zipRes.ok) throw new Error(`Téléchargement uBlock Origin échoué (HTTP ${zipRes.status})`);

  fs.mkdirSync(destDir, { recursive: true });
  const zipPath = path.join(destDir, 'ublock.zip');
  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(zipPath);
    zipRes.body.on('error', reject);
    fileStream.on('error', reject);
    fileStream.on('finish', resolve);
    zipRes.body.pipe(fileStream);
  });

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
  fs.unlinkSync(zipPath);
}

// Télécharge uBlock Origin si besoin (une seule fois, mis en cache) puis
// le charge dans la session par défaut — celle qu'utilise le <webview>
// NameMC (pas de partition custom dessus). Best-effort : une erreur ici
// (pas de réseau, release indisponible…) ne doit jamais empêcher l'app de
// démarrer, le navigateur NameMC fonctionne très bien sans, juste avec pub.
async function ensureUblockLoaded() {
  const destDir = path.join(getExtensionsRoot(), 'ublock');
  try {
    let manifestDir = findManifestDir(destDir);
    if (!manifestDir) {
      await downloadUblock(destDir);
      manifestDir = findManifestDir(destDir);
    }
    if (!manifestDir) throw new Error('manifest.json introuvable après extraction.');

    await session.defaultSession.loadExtension(manifestDir, { allowFileAccess: true });
    console.log('[ApoLauncher] uBlock Origin chargé dans le navigateur NameMC.');
  } catch (err) {
    console.error('[ApoLauncher] uBlock Origin non chargé (non bloquant) :', err.message);
  }
}

module.exports = { ensureUblockLoaded };
