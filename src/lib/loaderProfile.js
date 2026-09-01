// Génère/télécharge le profil du bon mod loader (Fabric/Forge/NeoForge)
// AVANT le lancement, pour que MCLC démarre le jeu moddé au lieu du
// vanilla pur (sans ça, le dossier mods/ est tout simplement ignoré).
//
// - Vanilla : rien à faire.
// - Fabric : entièrement automatique via l'API officielle meta.fabricmc.net
//   (pas d'installeur à lancer, juste un profil JSON à écrire). Testé en
//   conditions réelles sur FemboyServer.
// - Forge/NeoForge : télécharge le .jar installeur officiel et le passe à
//   MCLC (qui sait le traiter nativement via son mécanisme ForgeWrapper).
//   Nécessite server.loaderVersion renseigné (pas de résolution auto de la
//   dernière version, contrairement à Fabric). Implémenté selon la doc/le
//   code de minecraft-launcher-core, mais PAS testé en conditions réelles
//   (aucun serveur Forge/NeoForge chez nous pour l'instant) — à vérifier le
//   jour où un tel serveur existe.

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

async function ensureFabricProfile(gameDir, mcVersion, loaderVersion) {
  let resolvedLoaderVersion = loaderVersion;

  if (!resolvedLoaderVersion) {
    const res = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`);
    if (!res.ok) throw new Error(`Impossible de lister les versions Fabric pour ${mcVersion} (HTTP ${res.status})`);
    const versions = await res.json();
    if (!versions.length) throw new Error(`Aucune version Fabric disponible pour Minecraft ${mcVersion}`);
    resolvedLoaderVersion = versions[0].loader.version; // la plus récente en tête de liste
  }

  const profileRes = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${resolvedLoaderVersion}/profile/json`);
  if (!profileRes.ok) {
    throw new Error(`Profil Fabric introuvable pour MC ${mcVersion} / loader ${resolvedLoaderVersion} (HTTP ${profileRes.status})`);
  }
  const profile = await profileRes.json();

  // MCLC lit ce fichier lui-même via version.custom, au format
  // <root>/versions/<id>/<id>.json — écrit ici avant l'appel à launch().
  const versionDir = path.join(gameDir, 'versions', profile.id);
  fs.mkdirSync(versionDir, { recursive: true });
  fs.writeFileSync(path.join(versionDir, `${profile.id}.json`), JSON.stringify(profile, null, 2));

  return profile.id; // à passer en opts.version.custom
}

async function ensureForgeInstaller(gameDir, mcVersion, loaderVersion, flavor) {
  if (!loaderVersion) {
    throw new Error(`Version du loader ${flavor} manquante — renseigne-la dans le modal d'édition du serveur (⚙).`);
  }

  const isNeoForge = flavor === 'neoforge';
  const url = isNeoForge
    ? `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`
    : `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${loaderVersion}/forge-${mcVersion}-${loaderVersion}-installer.jar`;

  const destDir = path.join(gameDir, 'loader-installers');
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, path.basename(url));

  if (!fs.existsSync(destPath)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Installeur ${flavor} introuvable pour MC ${mcVersion} / ${loaderVersion} (HTTP ${res.status})`);
    await new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(destPath);
      res.body.on('error', reject);
      fileStream.on('error', reject);
      fileStream.on('finish', resolve);
      res.body.pipe(fileStream);
    });
  }

  return destPath; // à passer en opts.forge
}

// Retourne les champs à fusionner dans les opts MCLC avant le lancement :
// { version } pour vanilla/Fabric, { version, forge } pour Forge/NeoForge.
async function getLoaderLaunchOptions(server, gameDir) {
  const loader = (server.loader || 'vanilla').toLowerCase();

  if (loader === 'vanilla' || !loader) {
    return { version: { number: server.mcVersion, type: 'release' } };
  }

  if (loader === 'fabric') {
    const customId = await ensureFabricProfile(gameDir, server.mcVersion, server.loaderVersion);
    return { version: { number: server.mcVersion, type: 'release', custom: customId } };
  }

  if (loader === 'forge' || loader === 'neoforge') {
    const installerPath = await ensureForgeInstaller(gameDir, server.mcVersion, server.loaderVersion, loader);
    return {
      version: { number: server.mcVersion, type: 'release' },
      forge: installerPath
    };
  }

  throw new Error(`Loader inconnu : "${server.loader}"`);
}

module.exports = { getLoaderLaunchOptions };
