# Apo Launcher — launcher custom multi-serveurs

## Installer les dépendances et lancer en dev

```bash
npm install
npm start
```

## Ce qui est déjà fait
- Fenêtre sans bordure, transparente, style "liquid glass" (flou + fond vidéo bouclé)
- 3 écrans : Connexion (pseudo), Play (liste de serveurs + statut + bouton jouer), Paramètres (RAM, changer pseudo)
- **Multi-serveurs** : la liste des serveurs (`servers` dans `main.js`) définit un ou plusieurs serveurs,
  chacun avec son IP, sa version MC, son loader (Fabric/NeoForge), et son propre `manifestUrl` de modpack.
  Les mods et le dossier de jeu sont séparés par serveur (pas de mélange entre ApoCreate et FemboyServer par ex).
- Pseudo et RAM sauvegardés en local (`electron-store`), communs à tous les serveurs
- Ping réel du serveur sélectionné (protocole officiel Minecraft) : en ligne/hors ligne, nombre de joueurs, ping
- Squelette de vérification du modpack via un `manifest.json` distant par serveur (comparaison de hash)
- Squelette de lancement du jeu via `minecraft-launcher-core` (télécharge le client vanilla + gère l'auth offline)

## Ce qu'il reste à faire avant que ça tourne vraiment

1. **Assets manquants** (à mettre dans `src/assets/`) :
   - `wallpaper.mp4` — ta vidéo de fond bouclée
   - `theme.mp3` — ta musique de fond
   - `icon.ico` — icône de l'appli/installeur

2. **Héberger les modpacks sur GitHub** — pas encore fait, je te guide quand tu es prêt :
   - Créer un repo `apo-launcher`
   - Y mettre un dossier par serveur (ex `modpack-apocreate/`, `modpack-femboyserver/`) avec les `.jar` + un `manifest.json` chacun
   - Renseigner `manifestUrl` pour chaque serveur dans la liste `servers` de `main.js`

3. **Profil du loader (Fabric/NeoForge)** — `src/lib/launcher.js` a un TODO : il faut télécharger/générer
   le profil du loader propre à chaque serveur avant de lancer le jeu (sinon MCLC lance du vanilla pur, sans mods).

4. **Liste des serveurs** — la liste `servers` est codée en dur dans `main.js` avec des IP placeholder.
   À remplacer par tes vraies IP/versions/loaders pour chaque serveur (ApoCreate, FemboyServer, etc.).
   Tu peux aussi en ajouter/retirer librement, la liste n'est pas limitée à 2.

5. **electron-builder / electron-updater** — la config `publish` dans `package.json` pointe vers
   `TON-PSEUDO-GITHUB` à remplacer, pour que l'auto-update du launcher fonctionne via GitHub Releases.

6. **SmartScreen Windows** — l'exe ne sera pas signé (signature payante), donc au premier lancement
   Windows va afficher un avertissement. À prévenir tes potes : "Informations complémentaires → Exécuter quand même".

On avance étape par étape sur ces points quand tu veux.
