// Recherche/application de skins Minecraft via l'API officielle Mojang —
// pas de scraping NameMC (pas d'API publique là-bas, HTML fragile, et
// limite niveau ToS de hotlinker/scraper leur site). Recherche par pseudo
// Minecraft EXACT (pas de "top 5 résultats approchants" façon NameMC),
// mais 100% robuste et légitime, mêmes endpoints que le launcher officiel.

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { app } = require('electron');

async function fetchSkinByUuid(uuid, name) {
  const profileRes = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`);
  if (!profileRes.ok) throw new Error(`Erreur Mojang (HTTP ${profileRes.status})`);
  const profile = await profileRes.json();

  const texturesProp = profile.properties?.find((p) => p.name === 'textures');
  if (!texturesProp) return { name: name || profile.name, uuid, skinUrl: null };
  const decoded = JSON.parse(Buffer.from(texturesProp.value, 'base64').toString());
  return { name: name || profile.name, uuid, skinUrl: decoded.textures?.SKIN?.url || null };
}

// Renvoie {name, uuid, skinUrl} pour un pseudo Minecraft réel existant, ou
// null si aucun compte ne porte ce nom (jamais d'exception pour ce cas-là,
// c'est un résultat de recherche normal, pas une erreur).
async function lookupSkinByUsername(username) {
  const lookupRes = await fetch(`https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(username)}`);
  if (lookupRes.status === 404) return null;
  if (!lookupRes.ok) throw new Error(`Erreur Mojang (HTTP ${lookupRes.status})`);
  const { id: uuid, name } = await lookupRes.json();
  return fetchSkinByUuid(uuid, name);
}

// Comme lookupSkinByUsername, mais à partir d'un UUID déjà connu (compte
// Microsoft connecté) — évite l'aller-retour de résolution par pseudo.
async function lookupSkinByUuid(uuid) {
  return fetchSkinByUuid(uuid);
}

// Change le skin du compte Microsoft connecté, via l'API officielle
// Minecraft Services — on lui donne l'URL d'un skin déjà hébergé (celui
// d'un compte existant trouvé via lookupSkinByUsername), Mojang va la
// chercher lui-même, pas besoin de l'uploader nous-mêmes.
async function applySkinToMicrosoftAccount(accessToken, skinUrl, variant = 'classic') {
  const res = await fetch('https://api.minecraftservices.com/minecraft/profile/skins', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ variant, url: skinUrl })
  });
  if (!res.ok) {
    throw new Error(`Échec du changement de skin (HTTP ${res.status})`);
  }
  return res.json();
}

// --- Favoris mis en cache localement --------------------------------------
// Avant : chaque ouverture de l'éditeur de skin refaisait un aller-retour
// Mojang complet (pseudo -> UUID -> profil -> texture) pour CHAQUE favori,
// lent avec plusieurs favoris. Maintenant : le PNG est téléchargé une seule
// fois au moment où on le met en favori, stocké dans userData/skins/
// favorites/, et supprimé quand on le retire — plus aucun réseau au
// chargement de la grille, juste une lecture disque.

function getFavoritesDir() {
  return path.join(app.getPath('userData'), 'skins', 'favorites');
}

// Relit un PNG mis en cache et le renvoie en data URI (simple à consommer
// côté renderer, pas de souci de chemin file:// ou de CSP).
function readFavoritePng(localPath) {
  try {
    const buf = fs.readFileSync(localPath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

// Résout le pseudo puis télécharge le PNG en local. Renvoie null si le
// pseudo n'existe pas (résultat normal, pas une erreur).
async function cacheFavoriteSkin(name) {
  const result = await lookupSkinByUsername(name);
  if (!result || !result.skinUrl) return null;

  const dir = getFavoritesDir();
  fs.mkdirSync(dir, { recursive: true });
  const localPath = path.join(dir, `${result.uuid}.png`);

  const res = await fetch(result.skinUrl);
  if (!res.ok) throw new Error(`Téléchargement du skin échoué (HTTP ${res.status})`);
  fs.writeFileSync(localPath, await res.buffer());

  return { name: result.name, uuid: result.uuid, localPath };
}

function removeFavoriteSkinFile(localPath) {
  try {
    fs.unlinkSync(localPath);
  } catch {
    // déjà absent / chemin invalide : rien à faire
  }
}

module.exports = {
  lookupSkinByUsername,
  lookupSkinByUuid,
  applySkinToMicrosoftAccount,
  cacheFavoriteSkin,
  removeFavoriteSkinFile,
  readFavoritePng
};
