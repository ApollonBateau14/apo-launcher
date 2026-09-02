// Mods/shaders optionnels que le JOUEUR active en plus du modpack imposé
// par le serveur (server.manifestUrl) — une préférence perso, pas gérée
// par le serveur. Résolus via l'API Modrinth (même mécanisme sans clé que
// le modpack principal), filtré par loader + version MC du serveur choisi.
//
// Attention : si le serveur impose déjà un modpack strict, activer aussi
// "Fabulously Optimized" peut créer des doublons de mods (deux Fabric API,
// etc.) — pensé avant tout pour les serveurs sans modpack imposé, ou pour
// ajouter un mod/shader léger par-dessus un modpack existant.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { getGameDir, syncModpack, resolveModrinthProject } = require('./modpack');
const { downloadAndVerify } = require('./download');

// Fabulously Optimized et Fresh Animations ne sont PAS compatibles
// ensemble (constaté en jeu — comme le doublon Iris avant lui) : même
// `group` = mutuellement exclusifs côté UI (radio, pas cases à cocher).
const MOD_ADDONS = [
  { id: 'fabulously-optimized', name: 'Fabulously Optimized', kind: 'modpack', defaultOn: true, group: 'main-pack' },
  { id: 'fresh-animations', name: 'Fresh Animations', kind: 'resourcepack', defaultOn: false, group: 'main-pack' },
  { id: 'xaeros-minimap', name: "Minimap (Xaero's)", kind: 'mod', defaultOn: false }
];

const SHADER_ADDONS = [
  { id: 'photon-shader', name: 'Photon' },
  { id: 'solas-shader', name: 'Solas' },
  { id: 'complementary-reimagined', name: 'Complementary' },
  { id: 'astralex', name: 'AstraLex' },
  { id: 'makeup-ultra-fast-shaders', name: 'MakeUp - UltraFast' }
].map((s) => ({ ...s, kind: 'shader', defaultOn: false }));

// Un shaderpack a besoin d'Iris (Fabric/Quilt) ou Oculus (Forge/NeoForge)
// pour tourner — installé automatiquement dès qu'un shader est activé,
// sans que ce soit listé/coché séparément dans le catalogue affiché.
const SHADER_LOADER_BY_LOADER = { fabric: 'iris', quilt: 'iris', forge: 'oculus', neoforge: 'oculus' };

const DEST_FOLDER_BY_KIND = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' };

function getCatalog() {
  return { mods: MOD_ADDONS, shaders: SHADER_ADDONS };
}

// Vrai s'il existe au moins une version de cet addon compatible avec le
// loader/version MC du serveur — sans rien télécharger (juste la requête
// de métadonnées, déjà filtrée côté API Modrinth par loaders/game_versions).
async function isAddonCompatible(addon, server) {
  try {
    if (addon.kind === 'modpack') {
      await resolveModrinthProject(addon.id, server);
    } else {
      await resolveBestFile(addon.id, server, addon.kind);
    }
    return true;
  } catch {
    return false;
  }
}

// Catalogue filtré : un mod sans version compatible avec le serveur
// actuellement choisi disparaît de la liste plutôt que de rester
// sélectionnable pour planter (ou être silencieusement ignoré) au lancement.
async function getCompatibleCatalog(server) {
  const filter = async (list) => {
    const flags = await Promise.all(list.map((addon) => isAddonCompatible(addon, server)));
    return list.filter((_, i) => flags[i]);
  };
  const [mods, shaders] = await Promise.all([filter(MOD_ADDONS), filter(SHADER_ADDONS)]);
  return { mods, shaders };
}

// Même principe que la résolution de modpack Modrinth (loaders +
// game_versions filtrés côté API), mais retourne le fichier "primary" de
// la version la plus récente, quel que soit le type de projet.
//
// Les shaderpacks ne sont PAS tagués par modloader (fabric/forge/...) sur
// Modrinth — ils sont tagués "iris"/"optifine" (le mod qui les charge, pas
// le loader du jeu). Un shader "iris" tourne aussi bien via Oculus (portage
// Forge/NeoForge d'Iris) ; filtrer par server.loader ne renvoyait donc
// jamais rien pour les shaders (testé : Photon existait bien pour 26.1.2,
// juste pas taggué "fabric").
async function resolveBestFile(slug, server, kind) {
  const params = new URLSearchParams();
  if (kind === 'shader') {
    params.set('loaders', JSON.stringify(['iris']));
  } else if (kind === 'resourcepack') {
    // Un resourcepack ne dépend pas du mod-loader — Modrinth le tague
    // "minecraft" (pas "fabric"/"forge"/...), filtrer par server.loader ne
    // renvoyait donc jamais rien (constaté avec Fresh Animations, tagué
    // "minecraft" seul, alors qu'il supporte bien MC 26.1.2).
  } else if (server.loader && server.loader !== 'vanilla') {
    params.set('loaders', JSON.stringify([server.loader]));
  }
  if (server.mcVersion) {
    params.set('game_versions', JSON.stringify([server.mcVersion]));
  }

  const res = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version?${params}`);
  if (!res.ok) throw new Error(`"${slug}" introuvable sur Modrinth (HTTP ${res.status})`);
  const versions = await res.json();
  if (!versions.length) throw new Error(`Pas de version de "${slug}" compatible avec ce serveur.`);
  const file = versions[0].files.find((f) => f.primary) || versions[0].files[0];
  if (!file) throw new Error(`Aucun fichier trouvé pour "${slug}".`);
  return file;
}

function fileSha1(filePath) {
  return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
}

async function installSingleFileAddon(addon, server, gameDir, onProgress) {
  const file = await resolveBestFile(addon.id, server, addon.kind);
  const folder = DEST_FOLDER_BY_KIND[addon.kind] || 'mods';
  const dest = path.join(gameDir, folder, file.filename);

  const upToDate = fs.existsSync(dest) && (!file.hashes?.sha1 || fileSha1(dest) === file.hashes.sha1);
  if (!upToDate) {
    await downloadAndVerify(
      file.url,
      dest,
      { hash: file.hashes?.sha1, algo: 'sha1', size: file.size },
      (downloaded, total) => { if (onProgress) onProgress({ file: `${folder}/${file.filename}`, downloaded, total }); }
    );
  }
}

// Vrai si un mod dont le nom de fichier commence par un de ces préfixes
// est déjà présent dans mods/ — utilisé pour ne pas installer Iris/Oculus
// en double si le modpack (ex: Fabulously Optimized) l'embarque déjà, ce
// qui plante le jeu (deux copies du même mod = conflit Fabric/Forge).
function hasModWithPrefix(gameDir, prefixes) {
  const modsDir = path.join(gameDir, 'mods');
  if (!fs.existsSync(modsDir)) return false;
  const files = fs.readdirSync(modsDir).map((f) => f.toLowerCase());
  return files.some((f) => prefixes.some((p) => f.startsWith(p)));
}

// Installe tous les addons (mods/resourcepacks/shaders) que le joueur a
// activés pour ce serveur. À appeler après syncModpack, avant le lancement.
//
// Les modpacks (ex: Fabulously Optimized) sont installés EN PREMIER, avant
// de vérifier si Iris/Oculus est déjà présent — sinon on l'ajoute nous-
// mêmes avant que le modpack ait eu la chance d'apporter sa propre copie,
// et on se retrouve avec deux Iris = crash au lancement.
async function installEnabledAddons(server, enabledIds, onProgress) {
  const gameDir = getGameDir(server.id);
  const catalog = [...MOD_ADDONS, ...SHADER_ADDONS];
  const selected = catalog.filter((a) => enabledIds.includes(a.id));

  const modpackAddons = selected.filter((a) => a.kind === 'modpack');
  const singleFileAddons = selected.filter((a) => a.kind !== 'modpack');

  for (const addon of modpackAddons) {
    if (onProgress) onProgress({ task: 'addon-check', name: addon.name });
    // Réutilise exactement la logique du modpack principal (même dossier
    // de jeu que server.id) : téléchargement mods + extraction overrides.
    await syncModpack({ ...server, manifestUrl: addon.id }, (p) => {
      if (onProgress) onProgress({ task: 'addon-download', name: addon.name, ...p });
    });
  }

  const hasShaderSelected = SHADER_ADDONS.some((s) => enabledIds.includes(s.id));
  const shaderLoaderId = SHADER_LOADER_BY_LOADER[server.loader];
  if (hasShaderSelected && shaderLoaderId && !hasModWithPrefix(gameDir, ['iris-', 'oculus-'])) {
    singleFileAddons.push({ id: shaderLoaderId, name: shaderLoaderId, kind: 'mod' });
  }

  for (const addon of singleFileAddons) {
    if (onProgress) onProgress({ task: 'addon-check', name: addon.name });
    await installSingleFileAddon(addon, server, gameDir, (p) => {
      if (onProgress) onProgress({ task: 'addon-download', name: addon.name, ...p });
    });
  }
}

module.exports = { getCatalog, getCompatibleCatalog, installEnabledAddons };
