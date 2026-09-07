// Presets graphiques appliqués directement dans le options.txt de Minecraft
// (dossier de jeu du serveur), juste avant le lancement — c'est le fichier
// que le jeu lit au démarrage, donc le seul moyen fiable pour que le choix
// fait dans le launcher soit vraiment appliqué EN JEU (pas juste affiché ici).
//
// On ne réécrit QUE les clés listées ici : le reste du fichier (touches,
// sensibilité souris, langue, packs de ressources, options des mods...)
// est recopié tel quel, ligne par ligne, dans son ordre d'origine.
//
// Format options.txt : une ligne "clé:valeur" par option. Les valeurs sont
// brutes (nombres, true/false), sauf certaines options texte qui sont
// entre guillemets DANS le fichier (renderClouds:"true") — d'où les
// guillemets présents dans les valeurs ci-dessous.

const fs = require('fs');
const path = require('path');

// La distance de rendu (en chunks) est le curseur qui pèse le plus lourd :
// c'est elle qui donne son nom à chaque preset, le reste est calé dessus
// pour rester cohérent (inutile d'avoir des ombres d'entités et un blend
// de biomes maximal si on ne voit que 3 chunks).
//
// Deux choix volontaires :
// - graphicsMode ne monte jamais à 2 (Fabulous) : Sodium/Iris (Fabulously
//   Optimized et le modpack du serveur) ne gèrent pas ce mode et
//   avertissent en retombant sur Fancy.
// - ni maxFps ni enableVsync ici : les FPS max sont un réglage à part
//   (curseur dédié dans les Paramètres), et on ne touche pas au vsync.
//
// Tous les presets définissent EXACTEMENT les mêmes clés : sans ça, passer
// d'Extra low à Medium laisserait traîner les valeurs minimales des options
// que Medium n'aurait pas listées (ex: bobView resté à false).
const GRAPHICS_PRESETS = {
  'extra-low': {
    renderDistance: 3,
    // Tout au minimum autorisé par le jeu : ce preset est là pour tourner
    // sur la machine la plus faible, pas pour être joli.
    options: {
      renderDistance: 3,
      simulationDistance: 5, // 5 = minimum accepté par le jeu
      graphicsMode: 0, // 0 = Rapide
      particles: 2, // 2 = minimales
      ao: false, // occlusion ambiante (ombrage doux des blocs)
      entityShadows: false,
      entityDistanceScaling: 0.5, // minimum
      mipmapLevels: 0,
      biomeBlendRadius: 0, // aucun mélange de biomes
      renderClouds: '"false"',
      prioritizeChunkUpdates: 0, // 0 = chargement des chunks en tâche de fond (le plus fluide)
      bobView: false, // balancement de la vue
      screenEffectScale: '0.0', // distorsion (portail/nausée)
      fovEffectScale: '0.0', // zoom du champ de vision (vitesse, arc)
      darknessEffectScale: '0.0',
      glintSpeed: '0.0', // reflet des objets enchantés
      glintStrength: '0.0',
      damageTiltStrength: '0.0' // secousse de l'écran quand on prend des dégâts
    }
  },
  low: {
    renderDistance: 5,
    options: {
      renderDistance: 5,
      simulationDistance: 5,
      graphicsMode: 0,
      particles: 1, // 1 = réduites
      ao: false,
      entityShadows: false,
      entityDistanceScaling: 0.75,
      mipmapLevels: 2,
      biomeBlendRadius: 1,
      renderClouds: '"fast"',
      prioritizeChunkUpdates: 0,
      bobView: false,
      screenEffectScale: 0.5,
      fovEffectScale: 0.5,
      darknessEffectScale: 0.5,
      glintSpeed: 0.5,
      glintStrength: 0.5,
      damageTiltStrength: 0.5
    }
  },
  medium: {
    renderDistance: 8,
    options: {
      renderDistance: 8,
      simulationDistance: 8,
      graphicsMode: 1, // 1 = Détaillé
      particles: 0, // 0 = toutes
      ao: true,
      entityShadows: true,
      entityDistanceScaling: '1.0',
      mipmapLevels: 4,
      biomeBlendRadius: 2,
      renderClouds: '"true"',
      prioritizeChunkUpdates: 0,
      // À partir d'ici, valeurs par défaut du jeu (rien de bridé).
      bobView: true,
      screenEffectScale: '1.0',
      fovEffectScale: '1.0',
      darknessEffectScale: '1.0',
      glintSpeed: 0.5,
      glintStrength: 0.75,
      damageTiltStrength: '1.0'
    }
  },
  epic: {
    renderDistance: 10,
    options: {
      renderDistance: 10,
      simulationDistance: 10,
      graphicsMode: 1,
      particles: 0,
      ao: true,
      entityShadows: true,
      entityDistanceScaling: 1.5,
      mipmapLevels: 4,
      biomeBlendRadius: 4,
      renderClouds: '"true"',
      prioritizeChunkUpdates: 0,
      bobView: true,
      screenEffectScale: '1.0',
      fovEffectScale: '1.0',
      darknessEffectScale: '1.0',
      glintSpeed: 0.5,
      glintStrength: 0.75,
      damageTiltStrength: '1.0'
    }
  },
  realistic: {
    renderDistance: 15,
    options: {
      renderDistance: 15,
      simulationDistance: 12, // volontairement < renderDistance : la distance de simulation coûte en CPU (mobs, redstone) sans rien ajouter à l'image
      graphicsMode: 1,
      particles: 0,
      ao: true,
      entityShadows: true,
      entityDistanceScaling: '2.0',
      mipmapLevels: 4,
      biomeBlendRadius: 7, // maximum : transitions de biomes les plus douces
      renderClouds: '"true"',
      prioritizeChunkUpdates: 0,
      bobView: true,
      screenEffectScale: '1.0',
      fovEffectScale: '1.0',
      darknessEffectScale: '1.0',
      glintSpeed: 0.5,
      glintStrength: 0.75,
      damageTiltStrength: '1.0'
    }
  }
};

// Liste destinée à l'UI (libellés traduits côté renderer, chiffres ici pour
// n'avoir qu'une seule source de vérité sur les distances de rendu).
function listGraphicsPresets() {
  return Object.entries(GRAPHICS_PRESETS).map(([id, preset]) => ({
    id,
    renderDistance: preset.renderDistance
  }));
}

// Fusionne des clés dans <gameDir>/options.txt en gardant tout le reste du
// fichier intact (ordre des lignes compris).
function writeGameOptions(gameDir, options) {
  const keys = Object.keys(options);
  if (keys.length === 0) return false;

  const file = path.join(gameDir, 'options.txt');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = existing.split(/\r?\n/);
  // Ligne(s) vide(s) de fin retirées ici, réajoutée une seule fois à la fin :
  // sinon les clés ajoutées se retrouveraient après un trou dans le fichier.
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();

  const pending = { ...options };
  const merged = lines.map((line) => {
    // Découpe au PREMIER ":" seulement — les valeurs en contiennent
    // (ex: "key_key.attack:key.mouse.0").
    const separator = line.indexOf(':');
    if (separator === -1) return line;
    const key = line.slice(0, separator);
    if (!(key in pending)) return line;
    const value = pending[key];
    delete pending[key];
    return `${key}:${value}`;
  });

  // Clés absentes du fichier (premier lancement, ou option ajoutée par une
  // version plus récente du jeu) : ajoutées à la fin, le jeu les relit.
  for (const [key, value] of Object.entries(pending)) {
    merged.push(`${key}:${value}`);
  }

  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(file, `${merged.join('\n')}\n`);
  return true;
}

/**
 * Applique le preset graphique et/ou la limite de FPS choisis dans les
 * Paramètres. Les deux sont indépendants : presetId null (= "Perso", on ne
 * touche pas à la qualité graphique) laisse quand même régler les FPS max.
 */
function applyGameOptions(gameDir, { presetId = null, maxFps = null } = {}) {
  const preset = GRAPHICS_PRESETS[presetId];
  const options = { ...(preset ? preset.options : {}) };
  if (maxFps) options.maxFps = maxFps;
  return writeGameOptions(gameDir, options);
}

module.exports = { GRAPHICS_PRESETS, listGraphicsPresets, applyGameOptions };
