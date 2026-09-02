# Apo Launcher — launcher custom multi-serveurs

## Installer les dépendances et lancer en dev

```bash
npm install
cp servers.ip.example.json servers.ip.json   # renseigne l'IP/port de tes serveurs (jamais commité)
npm start
```

## Ce qui est déjà fait

**Interface**
- Fenêtre sans bordure, transparente, style "liquid glass" (flou + fond image + particules dorées animées),
  fine bordure blanche semi-transparente, barre de titre en verre
- 3 écrans : Connexion (pseudo), Play (liste de serveurs + statut + mods/shaders + jouer), Paramètres
- Français/English — sélecteur en drapeaux SVG en bas à gauche, anglais par défaut, traduit aussi les
  messages d'erreur générés côté back-end (pas juste l'UI statique)
- Icône de l'appli/installeur (`src/assets/icon.ico`, multi-résolution 16→256px)

**Serveurs**
- Multi-serveurs : chaque serveur a sa version MC, son loader, son `manifestUrl` de modpack, son icône
  (auto-récupérée via le ping Minecraft si non renseignée)
- IP/port jamais dans le code ni sur GitHub — `servers.ip.json` (local, ignoré par git) ou saisis à la main
  via le bouton ⚙ sur chaque carte serveur
- Ajout, édition (IP, port, loader, version, icône) et suppression de serveur depuis l'appli — persistant
  même pour les serveurs définis dans le code
- Ping réel (protocole officiel Minecraft) : en ligne/hors ligne, joueurs, ping

**Lancement du jeu**
- Java auto-provisionné : vérifie/télécharge un JRE Temurin compatible avec la version MC du serveur si le
  Java système ne convient pas (jamais touché, isolé dans `userData/jre/`)
- Profil du loader généré avant le lancement : **Fabric** entièrement automatique (API meta.fabricmc.net),
  **Forge/NeoForge** via l'installeur officiel (nécessite `loaderVersion` renseigné — codé selon la doc MCLC,
  pas testé en conditions réelles faute de serveur Forge/NeoForge)
- Vrais mods téléchargés avant le lancement : `.mrpack` Modrinth (slug nu, lien modrinth.com, ou lien direct —
  résolu automatiquement selon la version/loader du serveur, API publique sans clé) ou `manifest.json` maison ;
  vérifie la compatibilité MC/loader **avant** de télécharger quoi que ce soit
- Mods/shaders optionnels (bouton "Mods"/"Shaders" sur l'écran Play) : Fabulously Optimized + Fresh
  Animations activés par défaut, + Minimap, + une sélection de shaders (Photon, Solas, Complementary,
  AstraLex, MakeUp). Le loader de shader (Iris/Oculus) s'installe seul quand un shader est activé, sans
  dupliquer s'il est déjà fourni par un modpack
- Rejoint directement le monde au clic sur Jouer (`quickPlay`, plus besoin de cliquer dans le menu Minecraft)
- Rich Presence Discord (code prêt — nécessite un `CLIENT_ID` dans `src/lib/discordPresence.js`, à créer sur
  discord.com/developers/applications ; sans ça, reste désactivée proprement)
- Musique de fond qui baisse en fondu au lancement du jeu

**Paramètres**
- RAM, volume musique, langue, ouvrir le dossier de jeu, vérifier les mises à jour (API GitHub Releases —
  vérification manuelle uniquement, voir "reste à faire")

**Distribution**
- Code source public : [github.com/ApollonBateau14/apo-launcher](https://github.com/ApollonBateau14/apo-launcher)
- `npm run dist` génère un vrai installeur Windows (NSIS) — testé, fonctionne

## Ce qu'il reste à faire

1. **Auto-update réel** — `electron-updater` est en dépendance mais jamais branché dans le code. Le bouton
   "Vérifier les mises à jour" ne fait qu'une vérification manuelle (API GitHub), il ne télécharge/installe
   rien tout seul. Nécessite d'avoir publié une première Release GitHub pour le tester.

2. **Héberger les modpacks** — `manifestUrl` par serveur accepte déjà un slug/lien Modrinth ou un
   `manifest.json` maison (voir ci-dessus) ; reste à le renseigner pour chacun de tes serveurs.

3. **SmartScreen Windows** — l'exe n'est pas signé (signature payante), donc au premier lancement Windows va
   avertir tes potes. À leur expliquer : "Informations complémentaires → Exécuter quand même".

4. **Forge/NeoForge non testés en conditions réelles** — le code existe (voir `src/lib/loaderProfile.js`)
   mais seul Fabric a été vérifié avec un vrai serveur.

On avance étape par étape sur ces points quand tu veux.
