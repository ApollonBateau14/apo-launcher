// Recherche/application de skins Minecraft via l'API officielle Mojang —
// pas de scraping NameMC (pas d'API publique là-bas, HTML fragile, et
// limite niveau ToS de hotlinker/scraper leur site). Recherche par pseudo
// Minecraft EXACT (pas de "top 5 résultats approchants" façon NameMC),
// mais 100% robuste et légitime, mêmes endpoints que le launcher officiel.

const fetch = require('node-fetch');

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

module.exports = { lookupSkinByUsername, lookupSkinByUuid, applySkinToMicrosoftAccount };
