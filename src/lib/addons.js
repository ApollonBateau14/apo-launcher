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
  { id: 'xaeros-minimap', name: "Minimap (Xaero's)", kind: 'mod', defaultOn: false },
  // Rend la 2e couche du skin (chapeau, veste, manches...) en vraie
  // géométrie 3D au lieu d'un aplat gonflé — meilleur rendu des skins
  // avec capuche/cheveux qui dépassent, entre autres.
  { id: '3dskinlayers', name: '3D Skin Layers', kind: 'mod', defaultOn: false },
  // Charge les skins depuis LittleSkin au lieu de l'API Mojang seule —
  // rend un skin personnalisé réellement visible aux autres joueurs qui
  // ont ce mod, même en offline/cracked (pas de compte Microsoft requis).
  // L'upload du skin lui-même reste manuel (voir menu Skin, mode Crack) :
  // l'API LittleSkin ne permet pas de l'automatiser.
  // Config LittleSkin injectée automatiquement à l'installation, voir
  // installSingleFileAddon plus bas.
  { id: 'customskinloader', name: 'CustomSkinLoader', kind: 'mod', defaultOn: false }
];

const SHADER_ADDONS = [
  { id: 'photon-shader', name: 'Photon' },
  { id: 'solas-shader', name: 'Solas' },
  { id: 'complementary-reimagined', name: 'Complementary' },
  { id: 'astralex', name: 'AstraLex' },
  { id: 'makeup-ultra-fast-shaders', name: 'MakeUp - UltraFast' }
].map((s) => ({ ...s, kind: 'shader', defaultOn: false }));

// Même mécanique que les shaders (liste choisie à la main, filtrée par
// compatibilité) — les resourcepacks/texture packs ne sont pas tagués par
// mod-loader sur Modrinth (juste "minecraft"), voir resolveBestFile plus bas.
const TEXTURE_PACK_ADDONS = [
  { id: 'faithful-64x', name: 'Faithful 64x' },
  { id: 'faithful-32x', name: 'Faithful 32x' },
  { id: 'dandelion-x', name: 'Dandelion X' },
  { id: 'jicklus', name: 'JICKLUS' },
  { id: 'glass-bottom-boat-32x', name: 'Glass Bottom Boat' }
].map((t) => ({ ...t, kind: 'resourcepack', defaultOn: false }));

// Un shaderpack a besoin d'Iris (Fabric/Quilt) ou Oculus (Forge/NeoForge)
// pour tourner — installé automatiquement dès qu'un shader est activé,
// sans que ce soit listé/coché séparément dans le catalogue affiché.
const SHADER_LOADER_BY_LOADER = { fabric: 'iris', quilt: 'iris', forge: 'oculus', neoforge: 'oculus' };

const DEST_FOLDER_BY_KIND = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' };

function getCatalog() {
  return { mods: MOD_ADDONS, shaders: SHADER_ADDONS, texturepacks: TEXTURE_PACK_ADDONS };
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
  const [mods, shaders, texturepacks] = await Promise.all([
    filter(MOD_ADDONS),
    filter(SHADER_ADDONS),
    filter(TEXTURE_PACK_ADDONS)
  ]);
  const enriched = await withModrinthMetadata([...mods, ...shaders, ...texturepacks]);
  const enrichedById = new Map(enriched.map((a) => [a.id, a]));
  return {
    mods: mods.map((m) => enrichedById.get(m.id) || m),
    shaders: shaders.map((s) => enrichedById.get(s.id) || s),
    texturepacks: texturepacks.map((t) => enrichedById.get(t.id) || t)
  };
}

// Nom + icône officiels Modrinth pour chaque addon (au lieu du nom codé en
// dur ici) — affichés dans le catalogue mods/shaders de l'appli. Mis en
// cache en mémoire (juste la durée de l'appli, ces infos ne changent
// quasiment jamais) et récupérés en un seul appel groupé plutôt qu'un par
// addon (endpoint Modrinth prévu pour ça).
const metadataCache = new Map();
async function withModrinthMetadata(addons) {
  const uncached = addons.filter((a) => !metadataCache.has(a.id));
  if (uncached.length) {
    try {
      const ids = JSON.stringify(uncached.map((a) => a.id));
      const res = await fetch(`https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(ids)}`);
      if (res.ok) {
        const projects = await res.json();
        for (const addon of uncached) {
          const project = projects.find((p) => p.slug === addon.id || p.id === addon.id);
          metadataCache.set(addon.id, project ? { name: project.title, iconUrl: project.icon_url || null } : null);
        }
      }
    } catch {
      // best-effort — l'UI retombe sur le nom codé en dur, pas d'icône
    }
  }
  return addons.map((addon) => {
    const meta = metadataCache.get(addon.id);
    return meta ? { ...addon, name: meta.name || addon.name, iconUrl: meta.iconUrl } : addon;
  });
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

  async function fetchVersions(exactGameVersion) {
    const p = new URLSearchParams(params);
    if (exactGameVersion && server.mcVersion && kind !== 'resourcepack') {
      p.set('game_versions', JSON.stringify([server.mcVersion]));
    }
    const res = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version?${p}`);
    if (!res.ok) throw new Error(`"${slug}" introuvable sur Modrinth (HTTP ${res.status})`);
    return res.json();
  }

  // Version exacte en priorité, mais un mod pas encore taggué pile pour un
  // patch tout juste sorti (ex: CustomSkinLoader tagué "26.1"/"26.1.1" mais
  // pas encore "26.1.2") tourne quasiment toujours quand même dessus — sans
  // ce repli, il était juste silencieusement jamais installé du tout, sans
  // le moindre message. Même logique que pour les resourcepacks, juste en
  // dernier recours plutôt qu'en filtre par défaut (un mod est plus souvent
  // vraiment incompatible qu'un resourcepack).
  let versions = await fetchVersions(true);
  if (!versions.length && kind !== 'resourcepack' && server.mcVersion) {
    versions = await fetchVersions(false);
  }
  if (!versions.length) throw new Error(`Pas de version de "${slug}" compatible avec ce serveur.`);
  const file = versions[0].files.find((f) => f.primary) || versions[0].files[0];
  if (!file) throw new Error(`Aucun fichier trouvé pour "${slug}".`);
  return file;
}

function fileSha1(filePath) {
  return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
}

// Ajoute LittleSkin comme source de skins dans la config de CustomSkinLoader
// (fusionne si le joueur a déjà personnalisé le fichier, jamais d'écrasement
// complet) — sinon le mod serait installé mais ne saurait pas où aller
// chercher les skins uploadés depuis notre menu Skin (mode Crack).
function ensureCustomSkinLoaderConfig(gameDir) {
  const configPath = path.join(gameDir, 'CustomSkinLoader', 'CustomSkinLoader.json');
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      config = {};
    }
  }
  if (!Array.isArray(config.loadlist)) config.loadlist = [];
  const hasLittleSkin = config.loadlist.some((e) => e.type === 'CustomSkinAPI' && e.root === 'https://littleskin.cn/');
  if (!hasLittleSkin) {
    config.loadlist.push({ name: 'LittleSkin', type: 'CustomSkinAPI', root: 'https://littleskin.cn/' });
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
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

  if (addon.id === 'customskinloader') {
    ensureCustomSkinLoaderConfig(gameDir);
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
  const catalog = [...MOD_ADDONS, ...SHADER_ADDONS, ...TEXTURE_PACK_ADDONS];
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
