// Rich Presence Discord ("Joue sur FemboyServer" affiché sur ton profil).
// Ne fait jamais planter l'appli si Discord n'est pas lancé ou si le
// Client ID n'est pas configuré — échoue silencieusement (juste un warn).

const RPC = require('discord-rpc');

// Crée ta propre appli sur https://discord.com/developers/applications
// (gratuit, 2 min) puis colle son "Application ID" ici. Sans ça, la
// Rich Presence reste désactivée (pas d'erreur, juste rien n'apparaît).
const CLIENT_ID = '1544693268900614225';

let client = null;
let ready = false;
const startTimestamp = Date.now();

function isConfigured() {
  return CLIENT_ID && CLIENT_ID !== 'TON_CLIENT_ID_DISCORD';
}

function connect() {
  if (!isConfigured()) {
    console.warn('[ApoLauncher] Discord Rich Presence désactivée : CLIENT_ID non configuré (src/lib/discordPresence.js).');
    return;
  }

  client = new RPC.Client({ transport: 'ipc' });

  client.on('ready', () => {
    ready = true;
    setIdle();
  });

  client.login({ clientId: CLIENT_ID }).catch((err) => {
    console.warn('[ApoLauncher] Discord Rich Presence indisponible (Discord fermé ?) :', err.message);
  });
}

function setActivity(details, state) {
  if (!ready || !client) return;
  client.setActivity({
    details,
    state,
    startTimestamp,
    largeImageKey: 'apo_launcher_logo',
    largeImageText: 'Apo Launcher',
    instance: false
  }).catch(() => {});
}

function setIdle() {
  setActivity('Dans le launcher', 'Choisit un serveur…');
}

function setPlaying(serverName) {
  setActivity('En jeu', `Sur ${serverName}`);
}

function disconnect() {
  if (client) client.destroy().catch(() => {});
}

module.exports = { connect, setIdle, setPlaying, disconnect };
