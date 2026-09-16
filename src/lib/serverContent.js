// Shaders et resource packs proposés pour chaque serveur intégré, dans les
// onglets "Shaders" / "Ressources" — ils remplacent l'onglet Mods, qui n'a
// pas de sens pour un serveur au modpack imposé (mods cochés ignorés, voir
// installEnabledAddons dans addons.js).
//
// Versions FIGÉES : exactement celles qu'Apo utilise dans son instance
// (retrouvées sur Modrinth par nom de fichier, hash sha1 compris). Pas de
// résolution "dernière version" comme dans addons.js : les extensions de
// Fresh Animations sont faites pour une version précise de la base, une mise
// à jour de l'une sans l'autre casse les animations.
//
// Choix du joueur PAR SERVEUR (store.serverContent[serverId][kind]) ; clé
// absente = tout coché. Appliqué à chaque lancement (syncServerContent) :
// - resource pack coché : téléchargé ET équipé en jeu (options.txt) ;
// - shader coché : téléchargé dans shaderpacks/, présent dans le menu
//   Shaders du jeu, mais jamais activé par le launcher ;
// - décoché : fichier retiré. Seulement ceux posés par le launcher (suivis
//   dans .apolauncher-content.json) : un pack ajouté à la main n'est jamais
//   touché.
//
// Attention pour FemboyServer quand sa liste arrivera : son .mrpack ne doit
// pas embarquer de fichiers dans resourcepacks/ ou shaderpacks/, sinon
// "Vérifier les mises à jour du modpack" (pruneOrphanedFiles) supprimerait
// les packs posés ici, absents de la liste du modpack.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getGameDir } = require('./modpack');
const { downloadAndVerify } = require('./download');
const { readGameOption, writeGameOptions } = require('./gameOptions');

const SERVER_CONTENT = {
  aposerver: {
    // Ordre = priorité croissante en jeu : le premier est tout en bas de la
    // pile. Fresh Animations (la base) DOIT rester sous ses extensions, sinon
    // elles n'ont plus rien à étendre.
    resourcepacks: [
      { id: 'fresh-animations', name: 'Fresh Animations', version: '1.10.4',
        filename: 'FreshAnimations_v1.10.4.zip', sha1: '73db740a6868e043c5e615c036fca2c912615b6e', size: 850941,
        url: 'https://cdn.modrinth.com/data/50dA9Sha/versions/xN57JJts/FreshAnimations_v1.10.4.zip',
        iconUrl: 'https://cdn.modrinth.com/data/50dA9Sha/3132c10e9e3c73fde9799720fd3da5561071708c_96.webp' },
      { id: 'fresh-animations-extensions', name: 'Fresh Animations: Extensions', version: '1.8.1',
        filename: 'FA+All_Extensions-v1.8.1.zip', sha1: 'd39eefcb1d3a24debc979bbf7aa3e42b92cc5a80', size: 425088,
        url: 'https://cdn.modrinth.com/data/YAVTU8mK/versions/RfJ3uz2J/FA%2BAll_Extensions-v1.8.1.zip',
        iconUrl: 'https://cdn.modrinth.com/data/YAVTU8mK/2e83da75469cdec6d4558023cba611443b105c9e_96.webp' },
      { id: 'fresh-animations-details', name: 'Fresh Animations: Details', version: '2.2.1',
        filename: 'FA+Details-v2.2.1.zip', sha1: '456243af4db5e0b575b1f31c0ba5edfac24ec346', size: 289745,
        url: 'https://cdn.modrinth.com/data/lctgpCsu/versions/tGydmcT3/FA%2BDetails-v2.2.1.zip',
        iconUrl: 'https://cdn.modrinth.com/data/lctgpCsu/27d8763b8080dab4143df69351a5b29ddf1910f4_96.webp' },
      { id: 'fresh-animations-objects', name: 'Fresh Animations: Objects', version: '2.1.2',
        filename: 'FA+Objects-v2.1.2.zip', sha1: 'bea6b91e4234b7223010d7ac248123d0398e7aa2', size: 142277,
        url: 'https://cdn.modrinth.com/data/23O9JVMV/versions/AIGgXNdl/FA%2BObjects-v2.1.2.zip',
        iconUrl: 'https://cdn.modrinth.com/data/23O9JVMV/d2f6208b6b679d3d26c9e05003395f0169b56ff8_96.webp' },
      { id: 'fresh-animations-emissive', name: 'Fresh Animations: Emissive', version: '1.6.0',
        filename: 'FA+Emissive-v1.6.zip', sha1: '9ded93d65124d02bdccd0c5700271da69e283c7f', size: 93695,
        url: 'https://cdn.modrinth.com/data/VRS2YQn9/versions/byyyyS7z/FA%2BEmissive-v1.6.zip',
        iconUrl: 'https://cdn.modrinth.com/data/VRS2YQn9/23629198c8624ebf8da20ca1bd929191e2931770_96.webp' },
      { id: 'fa-player-extension', name: 'Fresh Animations: Player Extension', version: '1.1.0',
        filename: 'FA+Player-v1.1.zip', sha1: '122e397af111e3dc5fb6b60004aad9464980f13a', size: 110203,
        url: 'https://cdn.modrinth.com/data/TAIMVZCL/versions/Wj7NeGjP/FA%2BPlayer-v1.1.zip',
        iconUrl: 'https://cdn.modrinth.com/data/TAIMVZCL/b3918b1dcedad8987cac3715ec95d00aaadc3a49_96.webp' },
      { id: 'tras-fresh-player', name: 'Fresh Moves', version: '3.1',
        filename: '-1.21.2 Fresh Moves v3.1 (With Animated Eyes).zip', sha1: '7049cc12935ff4be20173c908ad946f530861a4c', size: 321871,
        url: 'https://cdn.modrinth.com/data/slufHzC2/versions/4uyHvhnf/-1.21.2%20Fresh%20Moves%20v3.1%20%28With%20Animated%20Eyes%29.zip',
        iconUrl: 'https://cdn.modrinth.com/data/slufHzC2/02b78db6655ad8dd6cfd847f99c76f7552c053ec_96.webp' },
      { id: 'icon-fresh', name: 'Icon Fresh', version: '0.2',
        filename: 'Icon Fresh 1.2.zip', sha1: 'dd52c0ed277ff52a9834ba28e8682159ff662a65', size: 835332,
        url: 'https://cdn.modrinth.com/data/u4iPx1Dr/versions/qs58YoNc/Icon%20Fresh%201.2.zip',
        iconUrl: 'https://cdn.modrinth.com/data/u4iPx1Dr/78fd3b6814105ce2f9e84049f3f9f11969e77729_96.webp' }
    ],
    shaders: [
      { id: 'photon-shader', name: 'Photon Shaders', version: 'v1.3b',
        filename: 'photon_v1.3b.zip', sha1: 'd975d25c9686de5f10e8b86c8518613cdf3f040a', size: 3800987,
        url: 'https://cdn.modrinth.com/data/lLqFfGNs/versions/gUv7fBPN/photon_v1.3b.zip',
        iconUrl: 'https://cdn.modrinth.com/data/lLqFfGNs/39cb5f12e7dcc68d6cb666f225fcb2b801dd70fb_96.webp' },
      { id: 'complementary-reimagined', name: 'Complementary Shaders - Reimagined', version: 'r5.9.1',
        filename: 'ComplementaryReimagined_r5.9.1.zip', sha1: '6a4f2107d25466c5c5bf5b3f5c2a982f940c0e91', size: 552945,
        url: 'https://cdn.modrinth.com/data/HVnmMxH1/versions/ErCjThzb/ComplementaryReimagined_r5.9.1.zip',
        iconUrl: 'https://cdn.modrinth.com/data/HVnmMxH1/79cb7c8123bbc54945305b2ebad6b8881efdf5f8_96.webp' },
      { id: 'bsl-shaders', name: 'BSL Shaders', version: '10.1.5',
        filename: 'BSL_v10.1.5.zip', sha1: '49bed4894881b22fa680b97504f0c3265bafbcbc', size: 1133936,
        url: 'https://cdn.modrinth.com/data/Q1vvjJYV/versions/yFTiE1Nc/BSL_v10.1.5.zip',
        iconUrl: 'https://cdn.modrinth.com/data/Q1vvjJYV/2a611a3cb434fb52fb81fa5dace13c5d8b67e55d_96.webp' },
      { id: 'solas-shader', name: 'Solas Shader', version: '3.7b',
        filename: 'Solas Shader V3.7b.zip', sha1: 'abf2e33feae040cc91894aea11e6d30750d50ee9', size: 1252311,
        url: 'https://cdn.modrinth.com/data/EpQFjzrQ/versions/KcfQaN5J/Solas%20Shader%20V3.7b.zip',
        iconUrl: 'https://cdn.modrinth.com/data/EpQFjzrQ/e3efc6ba7a63f9e1cf473a794d0224a6daf243c7_96.webp' },
      { id: 'bliss-shader', name: 'Bliss Shaders', version: '2.1.2',
        filename: 'Bliss_v2.1.2_(Chocapic13_Shaders_edit).zip', sha1: 'ded6c8a98305f8aff90ef781e7585b33b8452cfd', size: 1791406,
        url: 'https://cdn.modrinth.com/data/ZvMtQlho/versions/kC2Y8q1P/Bliss_v2.1.2_%28Chocapic13_Shaders_edit%29.zip',
        iconUrl: 'https://cdn.modrinth.com/data/ZvMtQlho/90145c971ea24387775108fc86c89bed9bd2c8f1_96.webp' },
      { id: 'rethinking-voxels', name: 'Rethinking Voxels', version: 'r0.1-beta9',
        filename: 'rethinking-voxels_r0.1-beta9.zip', sha1: '9689915ec1a7215eb6060be2a08eaf3a09ebdbab', size: 8301317,
        url: 'https://cdn.modrinth.com/data/kmwfVOoi/versions/cpD4esk9/rethinking-voxels_r0.1-beta9.zip',
        iconUrl: 'https://cdn.modrinth.com/data/kmwfVOoi/fc89eadad417dd376b14c3b31e1a2b87acaca034_96.webp' },
      { id: 'makeup-ultra-fast-shaders', name: 'MakeUp - Ultra Fast', version: '9.5e',
        filename: 'MakeUp-UltraFast-9.5e.zip', sha1: '84f7f6ddf81f602ff241fb9c576411cdda309f9e', size: 400417,
        url: 'https://cdn.modrinth.com/data/izsIPI7a/versions/T3EhqZo1/MakeUp-UltraFast-9.5e.zip',
        iconUrl: 'https://cdn.modrinth.com/data/izsIPI7a/a08432baa86b8ffd58c08f4b3a001ef976ff764d_96.webp' },
      { id: 'super-duper-vanilla', name: 'Super Duper Vanilla', version: '1.3.8',
        filename: 'superDuperVanilla.zip', sha1: 'f2d6d259368e8b8d8807abb1ac28aaa7cff85b8c', size: 2851664,
        url: 'https://cdn.modrinth.com/data/LMIZZNxZ/versions/KB0sOLSc/superDuperVanilla.zip',
        iconUrl: 'https://cdn.modrinth.com/data/LMIZZNxZ/5d09a380b6da014dcbca683879cdfb4a94603cf8_96.webp' },
      { id: 'mellow', name: 'Mellow', version: '3.4',
        filename: 'Mellow Shader v3.4.zip', sha1: '19a1465c2091d24db84a1f085e641e1811459aed', size: 644258,
        url: 'https://cdn.modrinth.com/data/BUxf36AP/versions/fORiOdHS/Mellow%20Shader%20v3.4.zip',
        iconUrl: 'https://cdn.modrinth.com/data/BUxf36AP/b2cc2e9b97e5e0c4c7fcd89b7e295f29a29b9c6d_96.webp' },
      { id: 'astralex', name: 'AstraLex Shaders', version: '93.0',
        filename: '§r§lAstra§4§lLex§r§l_By_LexBoosT_§4§lV93.0§r§l.zip', sha1: '1041c11b811ee3546bca75cbb14c8c1916a2e9c3', size: 3184524,
        url: 'https://cdn.modrinth.com/data/RphJSnEs/versions/qSbtQS2o/%C2%A7r%C2%A7lAstra%C2%A74%C2%A7lLex%C2%A7r%C2%A7l_By_LexBoosT_%C2%A74%C2%A7lV93.0%C2%A7r%C2%A7l.zip',
        iconUrl: 'https://cdn.modrinth.com/data/RphJSnEs/3e25ea407447bf2ff8ffa8926cd2db295307cf68_96.webp' },
      { id: 'miniature-shader', name: 'Miniature Shader', version: '2.19',
        filename: 'miniature-shader-2.19.zip', sha1: 'f66501ebcc5197f72ef19065eb0fa851707d7f9f', size: 43913,
        url: 'https://cdn.modrinth.com/data/UaS8ROxa/versions/LWmZ94RG/miniature-shader-2.19.zip',
        iconUrl: 'https://cdn.modrinth.com/data/UaS8ROxa/85f373314addaf840d9c8667c797da6e0f7e7034_96.webp' },
      { id: 'nostalgia-shader', name: 'Nostalgia Shader', version: '5.1',
        filename: 'Nostalgia_v5.1.zip', sha1: 'c93900007773ce0314539461e26aa8faadf4aec9', size: 1842205,
        url: 'https://cdn.modrinth.com/data/xEItlMn3/versions/fzxeGgx7/Nostalgia_v5.1.zip',
        iconUrl: 'https://cdn.modrinth.com/data/xEItlMn3/49ba53348dd4902ad2a3ae49cc643550ead201bc.png' }
    ]
  },
  // Liste à venir (Apo l'envoie plus tard) : onglets déjà affichés, vides.
  femboyserver: { resourcepacks: [], shaders: [] }
};

// Type de contenu -> dossier du jeu où Minecraft / Iris va le chercher.
const KIND_FOLDERS = { resourcepacks: 'resourcepacks', shaders: 'shaderpacks' };

const MANIFEST_FILE = '.apolauncher-content.json';

function hasServerContent(serverId) {
  return Object.prototype.hasOwnProperty.call(SERVER_CONTENT, serverId);
}

// Ids cochés pour un type de contenu : tout, tant que le joueur n'a jamais
// touché à l'onglet de ce serveur.
function getSelectedIds(catalog, stored, kind) {
  const ids = stored?.[kind];
  return new Set(Array.isArray(ids) ? ids : catalog[kind].map((entry) => entry.id));
}

// Ce que l'UI affiche pour le serveur choisi. supported=false : serveur perso
// ou Hypixel, l'onglet Mods habituel reste affiché à la place.
function getServerContentCatalog(serverId, stored) {
  if (!hasServerContent(serverId)) {
    return { supported: false, serverId, shaders: [], resourcepacks: [] };
  }
  const catalog = SERVER_CONTENT[serverId];
  const forUi = (kind) => {
    const selected = getSelectedIds(catalog, stored, kind);
    return catalog[kind].map((entry) => ({
      id: entry.id,
      name: entry.name,
      iconUrl: entry.iconUrl,
      enabled: selected.has(entry.id)
    }));
  };
  return { supported: true, serverId, shaders: forUi('shaders'), resourcepacks: forUi('resourcepacks') };
}

function readManifest(gameDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(gameDir, MANIFEST_FILE), 'utf8'));
  } catch {
    return {};
  }
}

// Taille d'abord (instantané) : on ne recalcule le sha1 que si elle colle,
// pour ne pas relire ~25 Mo de shaders à chaque lancement pour rien.
function isUpToDate(filePath, entry) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size !== entry.size) return false;
  return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex') === entry.sha1;
}

function parsePackList(raw, fallback) {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : fallback;
  } catch {
    return fallback;
  }
}

// Équipe les resource packs cochés dans options.txt en FUSIONNANT avec la
// liste existante : "vanilla", les packs du loader (mod_resources…) et ceux
// ajoutés à la main restent à leur place ; seuls les packs gérés par le
// launcher sont retirés puis remis, dans l'ordre du catalogue, au-dessus.
// (Dans options.txt, la liste va du bas de la pile vers le haut.)
function equipResourcePacks(gameDir, catalog, selectedFilenames, previousFilenames) {
  const packId = (filename) => `file/${filename}`;
  const managed = new Set([...catalog.resourcepacks.map((e) => e.filename), ...previousFilenames].map(packId));
  if (managed.size === 0) return; // rien à gérer (ex: FemboyServer pour l'instant) : options.txt intact

  const selected = new Set(selectedFilenames);
  const ordered = catalog.resourcepacks.filter((e) => selected.has(e.filename)).map((e) => packId(e.filename));
  const current = parsePackList(readGameOption(gameDir, 'resourcePacks'), ['vanilla']);

  // On n'écrit QUE resourcePacks. Surtout pas incompatibleResourcePacks :
  // quand un pack qui y figure est en fait compatible, Minecraft le retire de
  // cette liste et, dans la même passe, ne le sélectionne PAS (voir
  // Options.loadSelectedResourcePacks) — les packs revenaient donc désactivés
  // à chaque lancement, log à l'appui : "Removed resource pack ... from
  // incompatibility list because it's now compatible". Cette liste reste la
  // comptabilité du jeu (packs gardés malgré un pack_format d'une autre
  // version), on n'y touche pas.
  writeGameOptions(gameDir, {
    resourcePacks: JSON.stringify([...current.filter((id) => !managed.has(id)), ...ordered])
  });
}

/**
 * Met le dossier de jeu du serveur en accord avec les choix de ses onglets
 * Shaders / Ressources : télécharge ce qui est coché, retire ce qui ne l'est
 * plus, équipe les resource packs. À appeler juste avant le lancement.
 */
async function syncServerContent(server, stored, onProgress) {
  const catalog = SERVER_CONTENT[server.id];
  if (!catalog) return;

  const gameDir = getGameDir(server.id);
  const previous = readManifest(gameDir);
  const manifest = {};

  for (const [kind, folder] of Object.entries(KIND_FOLDERS)) {
    const dir = path.join(gameDir, folder);
    const selected = getSelectedIds(catalog, stored, kind);
    const wanted = catalog[kind].filter((entry) => selected.has(entry.id));

    for (const entry of wanted) {
      const dest = path.join(dir, entry.filename);
      if (isUpToDate(dest, entry)) continue;
      if (onProgress) onProgress({ task: 'addon-check', name: entry.name });
      fs.mkdirSync(dir, { recursive: true });
      await downloadAndVerify(entry.url, dest, { hash: entry.sha1, algo: 'sha1', size: entry.size }, (downloaded, total) => {
        if (onProgress) onProgress({ task: 'addon-download', name: entry.name, file: `${folder}/${entry.filename}`, downloaded, total });
      });
    }

    // Ménage : tout fichier que le launcher gère (catalogue actuel ou posé
    // lors d'une synchro précédente) mais qui n'est plus coché.
    const keep = new Set(wanted.map((entry) => entry.filename));
    const managed = new Set([...(previous[kind] || []), ...catalog[kind].map((entry) => entry.filename)]);
    for (const filename of managed) {
      if (!keep.has(filename)) fs.rmSync(path.join(dir, path.basename(filename)), { force: true });
    }
    manifest[kind] = [...keep];
  }

  equipResourcePacks(gameDir, catalog, manifest.resourcepacks, previous.resourcepacks || []);

  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(path.join(gameDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2));
}

module.exports = { SERVER_CONTENT, hasServerContent, getServerContentCatalog, syncServerContent };
