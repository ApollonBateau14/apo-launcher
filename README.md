# Apo Launcher — launcher custom multi-serveurs

## Installer les dépendances et lancer en dev

```bash
npm install
cp servers.ip.example.json servers.ip.json   # renseigne l'IP/port de tes serveurs (jamais commité)
npm start
```

## Ce qui est déjà fait
- Fenêtre sans bordure, transparente, style "liquid glass" (flou + fond image + particules dorées animées),
  avec une fine bordure blanche semi-transparente autour de la fenêtre
- 3 écrans : Connexion (pseudo), Play (liste de serveurs + statut + bouton jouer), Paramètres (RAM, changer pseudo)
- **Multi-serveurs** : les métadonnées (`SERVERS_META` dans `main.js`) définissent un ou plusieurs serveurs,
  chacun avec sa version MC, son loader (Fabric/NeoForge), et son propre `manifestUrl` de modpack.
  Les mods et le dossier de jeu sont séparés par serveur (pas de mélange entre ApoCreate et FemboyServer par ex).
- **IP/port séparés du code** : jamais dans `main.js` ni sur GitHub. Ils viennent soit de `servers.ip.json`
  (fichier local, ignoré par git), soit modifiés directement dans l'appli via le bouton ⚙ sur chaque carte serveur.
  Sensible car l'auth est offline : une IP + un pseudo whitelisté qui traînent en public = n'importe qui peut se
  connecter avec ce pseudo.
- **Ajouter un serveur depuis l'appli** : bouton "+ Ajouter un serveur" sur l'écran Play (nom, IP, port, loader,
  version, manifest). Persisté en local (`electron-store`), pas besoin de toucher au code.
- Pseudo et RAM sauvegardés en local (`electron-store`), communs à tous les serveurs
- Ping réel du serveur sélectionné (protocole officiel Minecraft) : en ligne/hors ligne, nombre de joueurs, ping
- Squelette de vérification du modpack via un `manifest.json` distant par serveur (comparaison de hash)
- Squelette de lancement du jeu via `minecraft-launcher-core` (télécharge le client vanilla + gère l'auth offline)
- Code source hébergé sur [github.com/ApollonBateau14/apo-launcher](https://github.com/ApollonBateau14/apo-launcher) (public — sans IP ni whitelist)

## Ce qu'il reste à faire avant que ça tourne vraiment

1. **Asset manquant** : `icon.ico` dans `src/assets/` — icône de l'appli/installeur
   (`wallpaper.jpg` et `theme.mp3` sont déjà en place).

2. **Héberger les modpacks sur GitHub** :
   - Un dossier par serveur (ex `modpack-apocreate/`, `modpack-femboyserver/`) avec les `.jar` + un `manifest.json` chacun,
     dans ce repo ou un autre repo public dédié
   - Renseigner `manifestUrl` pour chaque serveur dans `SERVERS_META` (`main.js`)

3. **Profil du loader (Fabric/NeoForge)** — `src/lib/launcher.js` a un TODO : il faut télécharger/générer
   le profil du loader propre à chaque serveur avant de lancer le jeu (sinon MCLC lance du vanilla pur, sans mods).

4. **electron-builder / electron-updater** — la config `publish` dans `package.json` pointe encore vers
   `TON-PSEUDO-GITHUB` à remplacer par `ApollonBateau14`, pour que l'auto-update du launcher fonctionne via GitHub Releases.

5. **SmartScreen Windows** — l'exe ne sera pas signé (signature payante), donc au premier lancement
   Windows va afficher un avertissement. À prévenir tes potes : "Informations complémentaires → Exécuter quand même".

On avance étape par étape sur ces points quand tu veux.
