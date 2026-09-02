// Utilise minecraft-launcher-core (MCLC), qui gère pour nous :
// - le téléchargement du client vanilla (jar, libs, assets)
// - le téléchargement du loader (Fabric/NeoForge selon le serveur choisi)
// - la génération de la commande Java + son exécution
// On n'a "que" à lui fournir le pseudo (mode offline, pas d'auth Microsoft),
// la RAM voulue, et le dossier des mods déjà à jour (géré par modpack.js) —
// tout ça dépend du serveur actuellement sélectionné dans l'app.

const { Client, Authenticator } = require('minecraft-launcher-core');
const fs = require('fs');
const { BrowserWindow } = require('electron');
const { getGameDir, syncModpack } = require('./modpack');
const { ensureJava } = require('./javaRuntime');
const { getLoaderLaunchOptions } = require('./loaderProfile');
const { installEnabledAddons } = require('./addons');
const { resolveServerAddress } = require('./serverPing');
const discordPresence = require('./discordPresence');
const { t } = require('./backendI18n');

async function launchGame({ username, ramMb, server, lang = 'en', enabledAddons = [] }) {
  if (!username || username.trim().length === 0) {
    return { success: false, error: t(lang, 'usernameMissing') };
  }
  if (!server) {
    return { success: false, error: t(lang, 'noServerSelected') };
  }

  const launcher = new Client();
  const gameDir = getGameDir(server.id);

  // MCLC ne crée pas les dossiers parents manquants avant d'y écrire
  // (plante avec ENOENT au premier lancement). On s'assure qu'il existe.
  fs.mkdirSync(gameDir, { recursive: true });

  const sendProgress = (progress) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('launch-progress', progress);
  };

  // Vérifie/télécharge un Java compatible avec cette version de Minecraft
  // AVANT de lancer (ex: MC 26.1.2 nécessite Java 25+, indépendamment de ce
  // qui est installé sur la machine). Isolé du Java système, jamais écrasé.
  let javaPath;
  try {
    javaPath = await ensureJava(server.mcVersion, sendProgress);
  } catch (err) {
    return { success: false, error: t(lang, 'javaError', err.message) };
  }

  // Génère/télécharge le profil du bon loader (Fabric/Forge/NeoForge, ou
  // rien pour vanilla) AVANT le lancement — sinon MCLC démarre en vanilla
  // pur peu importe le serveur choisi et le dossier mods/ est ignoré.
  let loaderOpts;
  try {
    sendProgress({ task: 'loader-check', loader: server.loader });
    loaderOpts = await getLoaderLaunchOptions(server, gameDir);
  } catch (err) {
    return { success: false, error: t(lang, 'loaderError', server.loader, err.message) };
  }

  // Télécharge/vérifie les mods du modpack (manifestUrl) avant le lancement.
  // Sans manifestUrl configuré, ne fait rien (mods déjà présents à la main).
  try {
    sendProgress({ task: 'modpack-check' });
    await syncModpack(server, (fileProgress) => {
      sendProgress({ task: 'modpack-download', ...fileProgress });
    });
  } catch (err) {
    return { success: false, error: t(lang, 'modpackError', err.message) };
  }

  // Mods/shaders optionnels activés par le joueur (voir addons.js) —
  // installés en plus du modpack du serveur, jamais requis par celui-ci.
  if (enabledAddons.length > 0) {
    try {
      await installEnabledAddons(server, enabledAddons, sendProgress);
    } catch (err) {
      return { success: false, error: t(lang, 'modpackError', err.message) };
    }
  }

  // Le client Minecraft officiel résout le DNS SRV (_minecraft._tcp.<host>)
  // quand on rejoint via un simple nom de domaine — pas quand un port est
  // fourni explicitement, or quickPlay force toujours host:port. Sans cette
  // résolution manuelle, on rejoindrait le mauvais port sur les serveurs
  // derrière un proxy (Velocity/BungeeCord) qui publient un SRV.
  const { host: joinHost, port: joinPort } = await resolveServerAddress(server.ip, server.port);

  const opts = {
    // Auth offline : génère un UUID à partir du pseudo, sans passer par Microsoft
    authorization: Authenticator.getAuth(username),
    root: gameDir,
    javaPath,
    ...loaderOpts,
    // --server/--port sont dépréciés côté client (le jeu s'ouvrait sur le menu
    // principal au lieu de rejoindre). quickPlay est le mécanisme actuel :
    // le client télécharge, charge, puis rejoint directement le monde.
    quickPlay: {
      type: 'multiplayer',
      identifier: `${joinHost}:${joinPort}`
    },
    memory: {
      max: `${ramMb}M`,
      min: `${Math.min(ramMb, 2048)}M`
    },
    overrides: {
      gameDirectory: gameDir
    }
  };

  // Écouteurs branchés AVANT le launch (sinon on rate les événements
  // émis pendant le téléchargement des assets/le démarrage de la JVM).
  launcher.on('debug', (msg) => console.log('[MCLC debug]', msg));
  launcher.on('data', (msg) => console.log('[MCLC]', msg.toString()));
  launcher.on('close', (code) => {
    console.log('Minecraft fermé, code', code);
    discordPresence.setIdle();
  });
  launcher.on('progress', (progress) => {
    // progress MCLC brut : { type, task, total }
    sendProgress({ task: 'mc-download', ...progress });
  });

  // Attendu (pas fire-and-forget) : MCLC résout une fois le process Java
  // réellement lancé — c'est CE moment-là qui doit effacer le texte de
  // progression côté UI, pas l'appel IPC lui-même (qui répondait avant
  // même que le téléchargement ait commencé, laissant le texte bloqué).
  let minecraftProcess;
  try {
    minecraftProcess = await launcher.launch(opts);
  } catch (err) {
    return { success: false, error: t(lang, 'modpackError', err.message) };
  }
  if (!minecraftProcess) {
    return { success: false, error: t(lang, 'launchFailed') };
  }

  discordPresence.setPlaying(server.name);
  sendProgress({ task: 'launched' });

  return { success: true };
}

module.exports = { launchGame, getGameDir };
