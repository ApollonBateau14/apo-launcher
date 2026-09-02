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
- 3 écrans : Connexion (pseudo ou compte Microsoft), Play (liste de serveurs + statut + mods/shaders + jouer),
  Paramètres
- Français/English — sélecteur en drapeaux SVG en bas à gauche, anglais par défaut, traduit aussi les
  messages d'erreur générés côté back-end (pas juste l'UI statique)
- Icône de l'appli/installeur/fenêtre (`src/assets/icon.ico`, multi-résolution 16→256px)

**Connexion**
- Pseudo libre (offline, comme avant) **ou** vrai compte Microsoft (`src/lib/msAuth.js`, via `msmc`) : popup de
  connexion Microsoft → Xbox Live → Minecraft, aucune appli à créer/enregistrer (client_id public standard des
  launchers alternatifs). Récupère le vrai pseudo/UUID automatiquement, reste connecté d'un lancement à l'autre
  (refresh token mis en cache), déconnexion possible depuis l'écran Connexion
- Skin (onglet dédié) : recherche par pseudo Minecraft réel via l'API officielle Mojang (pas de scraping
  NameMC/Planet Minecraft — le premier bloque explicitement Claude dans son `robots.txt`, le second n'a pas
  d'API propre), avec aperçu du personnage en 3D (`skinview3d`/Three.js, même style que le menu de
  personnalisation du jeu — face à l'écran par défaut, tournable à la souris gauche/droite uniquement).
  Connecté avec Microsoft : applique vraiment le skin trouvé sur le compte (visible par tout le monde en jeu).
  En offline : aperçu local uniquement dans l'appli, **pas visible par les autres joueurs en jeu** (limitation
  du mode offline, voir "reste à faire"). Deux galeries en plus de la recherche :
  - **Amis** : liste gérée à la main (bouton "+ Ajouter", pseudo vérifié avant sauvegarde)
  - **Streamers FR/EN** : sélection curée à la main de ~10+10 vrais comptes de streamers/YouTubers connus
    (`src/lib/skinCategories.js`), skin à jour à chaque affichage

**Serveurs**
- Multi-serveurs : chaque serveur a sa version MC, son loader, son `manifestUrl` de modpack, son icône
  (auto-récupérée via le ping Minecraft si non renseignée)
- IP/port jamais dans le code ni sur GitHub — `servers.ip.json` (local, ignoré par git) ou saisis à la main
  via le bouton ⚙ sur chaque carte serveur
- Ajout, édition (IP, port, loader, version, icône) et suppression de serveur depuis l'appli — persistant
  même pour les serveurs définis dans le code
- Ping réel (protocole officiel Minecraft), avec résolution DNS SRV (`_minecraft._tcp.<host>`) : en
  ligne/hors ligne, joueurs, ping — marche aussi derrière un proxy (Velocity/BungeeCord) sur un port non standard
- Statut serveur rafraîchi tout seul toutes les 25s pendant que l'écran Play est affiché (pas besoin de
  changer d'écran pour voir un statut à jour)

**Lancement du jeu**
- Java auto-provisionné : vérifie/télécharge un JRE Temurin compatible avec la version MC du serveur si le
  Java système ne convient pas (jamais touché, isolé dans `userData/jre/`)
- Profil du loader généré avant le lancement : **Fabric** entièrement automatique (API meta.fabricmc.net),
  **Forge/NeoForge** via l'installeur officiel (nécessite `loaderVersion` renseigné — codé selon la doc MCLC,
  pas testé en conditions réelles faute de serveur Forge/NeoForge)
- Vrais mods téléchargés avant le lancement : `.mrpack` Modrinth (slug nu, lien modrinth.com, ou lien direct —
  résolu automatiquement selon la version/loader du serveur, API publique sans clé) ou `manifest.json` maison ;
  vérifie la compatibilité MC/loader **avant** de télécharger quoi que ce soit, et l'intégrité (hash) de chaque
  fichier **après** — un téléchargement corrompu (coupure réseau) est détecté et retélécharge automatiquement
  au lieu de planter Fabric au lancement
- Mods/shaders optionnels (bouton "Mods"/"Shaders" sur l'écran Play) : Fabulously Optimized ou Fresh
  Animations (mutuellement exclusifs, incompatibles ensemble), + Minimap, + une sélection de shaders (Photon,
  Solas, Complementary, AstraLex, MakeUp). Seuls les mods compatibles avec le loader/la version MC du serveur
  choisi apparaissent dans la liste. Le loader de shader (Iris/Oculus) s'installe seul quand un shader est
  activé, sans dupliquer s'il est déjà fourni par un modpack
- Rejoint directement le monde au clic sur Jouer (`quickPlay`, plus besoin de cliquer dans le menu Minecraft)
- Bouton "Réessayer" directement sur le message d'erreur en cas d'échec de lancement
- Rich Presence Discord configurée et fonctionnelle (`src/lib/discordPresence.js`)
- Musique de fond qui baisse en fondu au lancement du jeu

**Paramètres**
- RAM (avec suggestion automatique basée sur la RAM totale de la machine, plafond du slider ajusté en
  conséquence), volume musique, langue, ouvrir le dossier de jeu
- "Copier les logs" : copie les logs du dernier lancement (MCLC + nos propres erreurs) dans le presse-papier,
  pour du dépannage rapide sans aller fouiller le dossier de jeu
- Auto-update réel (`electron-updater`, branché sur les Releases GitHub) : vérification, téléchargement et
  installation pilotés depuis le bouton "Vérifier les mises à jour", avec progression en direct. En dev (app
  non empaquetée), retombe sur une simple vérification API GitHub (pas de vrai téléchargement possible)
- Changelog affiché une fois après une mise à jour (les notes de la Release GitHub correspondante), jamais à
  la première installation ni deux fois pour la même version

**Distribution**
- Code source public : [github.com/ApollonBateau14/apo-launcher](https://github.com/ApollonBateau14/apo-launcher)
- `npm run dist` génère un vrai installeur Windows (NSIS), icône comprise — testé, fonctionne
- Releases GitHub avec `.exe` + `latest.yml` (nécessaire à l'auto-update) — voir la procédure de publication
  plus bas si tu dois en repartir de zéro

## Publier une nouvelle Release GitHub (pour l'auto-update)

1. Bump la version dans `package.json`
2. `npm run dist` (génère `dist/Apo Launcher Setup X.Y.Z.exe` + `dist/latest.yml`)
3. [github.com/ApollonBateau14/apo-launcher/releases/new](https://github.com/ApollonBateau14/apo-launcher/releases/new)
4. Tag + titre `vX.Y.Z`, glisse les deux fichiers (`.exe` + `latest.yml`)
5. **Renomme le fichier `.exe` uploadé avec des tirets** (`Apo-Launcher-Setup-X.Y.Z.exe`) — GitHub remplace les
   espaces par des points par défaut, ce qui ne correspond plus au nom que `latest.yml` attend
6. Publish release

## Ce qu'il reste à faire

1. **Héberger les modpacks** — `manifestUrl` par serveur accepte déjà un slug/lien Modrinth ou un
   `manifest.json` maison (voir ci-dessus) ; reste à le renseigner pour chacun de tes serveurs.

2. **SmartScreen Windows** — l'exe n'est pas signé (signature payante), donc au premier lancement Windows va
   avertir tes potes s'ils le téléchargent depuis GitHub (pas de warning pour un build local). À leur
   expliquer : "Informations complémentaires → Exécuter quand même".

3. **Forge/NeoForge non testés en conditions réelles** — le code existe (voir `src/lib/loaderProfile.js`)
   mais seul Fabric a été vérifié avec un vrai serveur.

4. **Skin visible par les autres en offline** — actuellement aperçu local uniquement (voir "Connexion"
   ci-dessus). Pour que ça se voie vraiment en jeu sans compte Microsoft, il faudrait héberger un petit
   serveur qui imite l'API de session Mojang et faire pointer le jeu de chaque ami dessus (`-Dminecraft.api.
   session.host`) — faisable mais demande de l'infra à maintenir, pas fait pour l'instant.

On avance étape par étape sur ces points quand tu veux.
