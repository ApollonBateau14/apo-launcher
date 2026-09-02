// Authentification Microsoft/Xbox réelle (vrai compte Minecraft, pas juste
// un pseudo tapé à la main) via msmc — gère tout le flux OAuth (Microsoft
// -> Xbox Live -> Minecraft) derrière une popup Electron. Pas besoin de
// créer une appli/un client_id (contrairement à Discord) : msmc utilise
// par défaut le client_id public historique du launcher officiel Mojang,
// standard chez les launchers alternatifs open-source.
//
// Seul le refresh token Microsoft est mis en cache sur disque (jamais le
// mot de passe, jamais vu par nous ni par ce code — tout se passe côté
// Microsoft) — dans un fichier électron-store séparé du config principal,
// par précaution. Il permet de rester connecté d'un lancement à l'autre
// sans rouvrir la popup, jusqu'à expiration/révocation côté Microsoft.

const { Auth } = require('msmc');
const Store = require('electron-store');

const tokenStore = new Store({ name: 'ms-account' });

// Session vivante en mémoire (jamais persistée telle quelle) : le token
// Minecraft utilisable pour lancer le jeu, valable un temps limité.
let session = null; // { minecraft, refreshToken }

function toPublicAccount(minecraft) {
  return { name: minecraft.profile.name, uuid: minecraft.profile.id };
}

function assertOwnsGame(minecraft) {
  if (minecraft.isDemo()) {
    throw new Error('Ce compte Microsoft ne possède pas Minecraft: Java Edition.');
  }
}

// (Re)construit la session à partir d'un refresh token — soit celui déjà
// en mémoire, soit celui sauvegardé sur disque (relance de l'appli). Ne
// fait rien (retourne null) si aucun refresh token n'est disponible : pas
// connecté, pas une erreur.
async function ensureSession() {
  if (session && session.minecraft.validate()) return session;

  const refreshToken = session?.refreshToken || tokenStore.get('refreshToken');
  if (!refreshToken) return null;

  const authManager = new Auth('select_account');
  const xbox = await authManager.refresh(refreshToken);
  const minecraft = await xbox.getMinecraft();
  assertOwnsGame(minecraft);

  const newRefreshToken = xbox.save();
  tokenStore.set('refreshToken', newRefreshToken);
  session = { minecraft, refreshToken: newRefreshToken };
  return session;
}

// Ouvre la popup de connexion Microsoft (bloquant jusqu'à connexion ou
// fermeture de la fenêtre par le joueur).
async function loginInteractive() {
  const authManager = new Auth('select_account');
  const xbox = await authManager.launch('electron', { width: 520, height: 700, resizable: false });
  const minecraft = await xbox.getMinecraft();
  assertOwnsGame(minecraft);

  const refreshToken = xbox.save();
  tokenStore.set('refreshToken', refreshToken);
  session = { minecraft, refreshToken };
  return toPublicAccount(minecraft);
}

// Tentative de reconnexion silencieuse (aucune fenêtre) à partir du
// refresh token sauvegardé — à appeler au démarrage de l'appli. Renvoie
// null si pas de session sauvegardée ou si elle a expiré/été révoquée
// (le joueur devra alors repasser par loginInteractive()).
async function loginSilent() {
  try {
    const s = await ensureSession();
    return s ? toPublicAccount(s.minecraft) : null;
  } catch {
    tokenStore.delete('refreshToken');
    session = null;
    return null;
  }
}

function logout() {
  tokenStore.delete('refreshToken');
  session = null;
}

// Objet d'auth prêt pour MCLC — rafraîchit la session si besoin (le token
// Minecraft expire vite, ~24h). Appelé juste avant chaque lancement du jeu.
async function getLaunchAuth() {
  const s = await ensureSession();
  if (!s) throw new Error('Session Microsoft expirée ou absente, reconnecte-toi.');
  return s.minecraft.mclc(true);
}

module.exports = { loginInteractive, loginSilent, logout, getLaunchAuth };
