// Utilise minecraft-launcher-core (MCLC), qui gère pour nous :
// - le téléchargement du client vanilla (jar, libs, assets)
// - le téléchargement du loader (Fabric/NeoForge selon le serveur choisi)
// - la génération de la commande Java + son exécution
// On n'a "que" à lui fournir le pseudo (mode offline, pas d'auth Microsoft),
// la RAM voulue, et le dossier des mods déjà à jour (géré par modpack.js) —
// tout ça dépend du serveur actuellement sélectionné dans l'app.

const { Client, Authenticator } = require('minecraft-launcher-core');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const { getModsDir } = require('./modpack');

function getGameDir(serverId) {
  // Un dossier de jeu séparé par serveur : évite qu'un modpack Fabric
  // et un modpack NeoForge se marchent dessus.
  return path.join(app.getPath('userData'), 'game', serverId);
}

async function launchGame({ username, ramMb, server }) {
  if (!username || username.trim().length === 0) {
    return { success: false, error: 'Pseudo manquant' };
  }
  if (!server) {
    return { success: false, error: 'Aucun serveur sélectionné' };
  }

  const launcher = new Client();
  const gameDir = getGameDir(server.id);

  const opts = {
    // Auth offline : génère un UUID à partir du pseudo, sans passer par Microsoft
    authorization: Authenticator.getAuth(username),
    root: gameDir,
    version: {
      number: server.mcVersion,
      type: 'release'
      // Une fois le profil du loader généré, on passera plutôt :
      // custom: `${server.loader}-loader-${server.mcVersion}-${server.loaderVersion}`
    },
    customLaunchArgs: [
      `--server`, server.ip,
      `--port`, String(server.port)
    ],
    memory: {
      max: `${ramMb}M`,
      min: `${Math.min(ramMb, 2048)}M`
    },
    overrides: {
      gameDirectory: gameDir
    }
  };

  // TODO une fois le repo GitHub prêt : télécharger/valider le profil du loader
  // (${server.loader} ${server.loaderVersion} pour Minecraft ${server.mcVersion})
  // avant ce launch, propre à chaque serveur de la liste.

  launcher.launch(opts);

  launcher.on('debug', (msg) => console.log('[MCLC debug]', msg));
  launcher.on('data', (msg) => console.log('[MCLC]', msg.toString()));
  launcher.on('close', (code) => {
    console.log('Minecraft fermé, code', code);
  });
  launcher.on('progress', (progress) => {
    // progress: { type, task, total }
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('launch-progress', progress);
  });

  return { success: true };
}

module.exports = { launchGame };
