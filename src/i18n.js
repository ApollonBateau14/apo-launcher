// Petit système de traduction FR/EN, chargé avant renderer.js.
// - window.i18n.t(key, vars) : renvoie le texte traduit (langue courante),
//   avec interpolation {{var}}.
// - window.i18n.setLang(lang) : change la langue courante + réapplique les
//   traductions statiques (attributs data-i18n* dans le HTML).
// Le texte généré dynamiquement par renderer.js (listes de serveurs, statut,
// progression du lancement…) doit appeler t() lui-même à chaque rendu.

const TRANSLATIONS = {
  fr: {
    'nav.connexion': 'Connexion',
    'nav.play': 'Play',
    'nav.addons': 'Mods',
    'nav.settings': 'Paramètres',

    'connexion.pseudoLabel': 'Pseudo',
    'connexion.pseudoPlaceholder': 'Ton pseudo Minecraft',
    'connexion.hint': "Attention à l'identifiant de la whitelist du serveur.",
    'connexion.validate': 'Valider',
    'connexion.msLogin': 'Se connecter avec Microsoft',
    'connexion.msLogout': 'Se déconnecter',
    'connexion.msConnectedAs': 'Connecté avec Microsoft',
    'connexion.msLoggingIn': 'Connexion en cours…',

    'skin.title': 'Skin',
    'skin.searchPlaceholder': 'Pseudo Minecraft (ex: Notch) — Entrée pour chercher',
    'skin.apply': 'Utiliser ce skin',
    'skin.favorite': 'Ajouter/retirer des favoris',
    'skin.favoritesTitle': 'Favoris',
    'skin.browseNamemc': 'Chercher un skin sur NameMC',
    'skin.namemcBack': 'Précédent',
    'skin.namemcForward': 'Suivant',
    'skin.searching': 'Recherche…',
    'skin.notFound': 'Aucun compte Minecraft avec ce pseudo.',
    'skin.applied': 'Skin appliqué.',
    'skin.appliedOfflineNote': "Skin appliqué (aperçu local uniquement — les autres joueurs ne le verront pas en jeu sans compte Microsoft).",
    'skin.error': 'Erreur : {{message}}',

    'play.serverLabel': 'Serveur',
    'play.addServer': '+ Ajouter un serveur',
    'play.play': 'Jouer',
    'play.retry': 'Réessayer',

    'server.crack': 'Crack',
    'server.crackHint': 'Compte non-premium accepté (offline-mode).',
    'server.premium': 'Premium',
    'server.premiumHint': 'Compte Microsoft/premium obligatoire (online-mode).',

    'settings.ram': 'Mémoire allouée (RAM)',
    'settings.ramSuggested': 'Suggéré pour ta machine : {{value}} Go (cliquer pour appliquer)',
    'settings.volume': 'Volume musique',
    'settings.language': 'Langue',
    'settings.save': 'Enregistrer',
    'settings.openFolder': 'Ouvrir le dossier du jeu',
    'settings.copyLogs': 'Copier les logs',
    'settings.copyLogsDone': 'Logs copiés dans le presse-papier.',
    'settings.checkUpdates': 'Vérifier les mises à jour',

    'modal.defaultTitle': 'Modifier le serveur',
    'modal.editTitle': 'Modifier {{name}}',
    'modal.addTitle': 'Ajouter un serveur',
    'modal.cancel': 'Annuler',
    'modal.save': 'Enregistrer',

    'field.name': 'Nom',
    'field.ip': 'Adresse IP',
    'field.port': 'Port',
    'field.loader': 'Loader',
    'field.mcVersion': 'Version Minecraft',
    'field.icon': 'URL icône (optionnel)',
    'field.name': 'Nom',
    'field.description': 'Description',
    'field.manifestUrl': 'Modpack (Modrinth, optionnel)',

    'server.editTitle': "Modifier l'IP",
    'server.deleteButton': 'Supprimer ce serveur',
    'server.deleteWait': 'Patiente {{seconds}}s…',
    'server.deleteConfirmBtn': 'Cliquer pour confirmer la suppression',

    'mute.mute': 'Couper le son',
    'mute.unmute': 'Remettre le son',

    'status.checking': 'Vérification du serveur…',
    'status.online': 'Serveur en ligne',
    'status.offline': 'Serveur injoignable',
    'status.details': '{{online}}/{{max}} joueurs · {{ping}} ms',

    'launch.starting': 'Lancement en cours…',
    'launch.error': 'Erreur : {{error}}',
    'launch.javaDownloadStart': 'Téléchargement de Java {{version}}…',
    'launch.javaDownloadProgress': 'Téléchargement de Java {{version}}… {{percent}}%',
    'launch.javaReady': 'Java prêt, préparation du jeu…',
    'launch.loaderPrep': 'Préparation du loader ({{loader}})…',
    'launch.gamePrep': 'Préparation du jeu…',
    'launch.mcDownload': 'Téléchargement de Minecraft ({{type}})…',
    'launch.modpackCheck': 'Vérification du modpack…',
    'launch.modpackDownload': 'Téléchargement des mods… ({{file}})',

    'update.checking': 'Vérification…',
    'update.upToDate': 'À jour (v{{version}}).',
    'update.newVersion': 'Nouvelle version disponible : v{{latest}} (actuelle : v{{current}}).',
    'update.available': 'Nouvelle version disponible : v{{version}}.',
    'update.notAvailable': 'À jour (v{{version}}).',
    'update.downloading': 'Téléchargement de la mise à jour… {{percent}}%',
    'update.downloaded': 'Mise à jour téléchargée, prête à installer.',
    'update.error': 'Erreur de mise à jour : {{message}}',
    'update.downloadBtn': 'Télécharger',
    'update.installBtn': 'Redémarrer et installer',

    'changelog.title': 'Nouveautés — v{{version}}',
    'changelog.noNotes': "Mise à jour installée, pas de notes de version disponibles.",
    'changelog.close': 'Fermer',

    'addons.mods': 'Mods',
    'addons.shaders': 'Shaders',
    'addons.modsTitle': 'Mods optionnels',
    'addons.shadersTitle': 'Shaders optionnels',
    'addons.texturepacksTitle': 'Texture packs',
    'addons.hint': "En plus du modpack du serveur — activés côté joueur uniquement.",
    'addons.saved': 'Enregistré — pris en compte au prochain lancement.',
    'launch.addonCheck': 'Vérification de {{name}}…',
    'launch.addonDownload': 'Téléchargement de {{name}}…'
  },
  en: {
    'nav.connexion': 'Login',
    'nav.play': 'Play',
    'nav.addons': 'Mods',
    'nav.settings': 'Settings',

    'connexion.pseudoLabel': 'Username',
    'connexion.pseudoPlaceholder': 'Your Minecraft username',
    'connexion.hint': 'Careful with the exact whitelist name — it must match.',
    'connexion.validate': 'Confirm',
    'connexion.msLogin': 'Sign in with Microsoft',
    'connexion.msLogout': 'Sign out',
    'connexion.msConnectedAs': 'Signed in with Microsoft',
    'connexion.msLoggingIn': 'Signing in…',

    'skin.title': 'Skin',
    'skin.searchPlaceholder': 'Minecraft username (e.g. Notch) — Enter to search',
    'skin.apply': 'Use this skin',
    'skin.favorite': 'Add/remove from favorites',
    'skin.favoritesTitle': 'Favorites',
    'skin.browseNamemc': 'Browse skins on NameMC',
    'skin.namemcBack': 'Back',
    'skin.namemcForward': 'Forward',
    'skin.searching': 'Searching…',
    'skin.notFound': 'No Minecraft account with that username.',
    'skin.applied': 'Skin applied.',
    'skin.appliedOfflineNote': "Skin applied (local preview only — other players won't see it in-game without a Microsoft account).",
    'skin.error': 'Error: {{message}}',

    'play.serverLabel': 'Server',
    'play.addServer': '+ Add a server',
    'play.play': 'Play',
    'play.retry': 'Retry',

    'server.crack': 'Crack',
    'server.crackHint': 'Non-premium accounts allowed (offline-mode).',
    'server.premium': 'Premium',
    'server.premiumHint': 'Microsoft/premium account required (online-mode).',

    'settings.ram': 'Allocated memory (RAM)',
    'settings.ramSuggested': 'Suggested for your machine: {{value}} GB (click to apply)',
    'settings.volume': 'Music volume',
    'settings.language': 'Language',
    'settings.save': 'Save',
    'settings.openFolder': 'Open game folder',
    'settings.copyLogs': 'Copy logs',
    'settings.copyLogsDone': 'Logs copied to clipboard.',
    'settings.checkUpdates': 'Check for updates',

    'modal.defaultTitle': 'Edit server',
    'modal.editTitle': 'Edit {{name}}',
    'modal.addTitle': 'Add a server',
    'modal.cancel': 'Cancel',
    'modal.save': 'Save',

    'field.name': 'Name',
    'field.ip': 'IP address',
    'field.port': 'Port',
    'field.loader': 'Loader',
    'field.mcVersion': 'Minecraft version',
    'field.icon': 'Icon URL (optional)',
    'field.name': 'Name',
    'field.description': 'Description',
    'field.manifestUrl': 'Modpack (Modrinth, optional)',

    'server.editTitle': 'Edit IP',
    'server.deleteButton': 'Delete this server',
    'server.deleteWait': 'Wait {{seconds}}s…',
    'server.deleteConfirmBtn': 'Click to confirm deletion',

    'mute.mute': 'Mute',
    'mute.unmute': 'Unmute',

    'status.checking': 'Checking server…',
    'status.online': 'Server online',
    'status.offline': 'Server unreachable',
    'status.details': '{{online}}/{{max}} players · {{ping}} ms',

    'launch.starting': 'Launching…',
    'launch.error': 'Error: {{error}}',
    'launch.javaDownloadStart': 'Downloading Java {{version}}…',
    'launch.javaDownloadProgress': 'Downloading Java {{version}}… {{percent}}%',
    'launch.javaReady': 'Java ready, preparing the game…',
    'launch.loaderPrep': 'Preparing loader ({{loader}})…',
    'launch.gamePrep': 'Preparing the game…',
    'launch.mcDownload': 'Downloading Minecraft ({{type}})…',
    'launch.modpackCheck': 'Checking modpack…',
    'launch.modpackDownload': 'Downloading mods… ({{file}})',

    'update.checking': 'Checking…',
    'update.upToDate': 'Up to date (v{{version}}).',
    'update.newVersion': 'New version available: v{{latest}} (current: v{{current}}).',
    'update.available': 'New version available: v{{version}}.',
    'update.notAvailable': 'Up to date (v{{version}}).',
    'update.downloading': 'Downloading update… {{percent}}%',
    'update.downloaded': 'Update downloaded, ready to install.',
    'update.error': 'Update error: {{message}}',
    'update.downloadBtn': 'Download',
    'update.installBtn': 'Restart and install',

    'changelog.title': "What's new — v{{version}}",
    'changelog.noNotes': 'Update installed, no release notes available.',
    'changelog.close': 'Close',

    'addons.mods': 'Mods',
    'addons.shaders': 'Shaders',
    'addons.modsTitle': 'Optional mods',
    'addons.shadersTitle': 'Optional shaders',
    'addons.texturepacksTitle': 'Texture packs',
    'addons.hint': 'On top of the server modpack — enabled on your side only.',
    'addons.saved': 'Saved — applied on next launch.',
    'launch.addonCheck': 'Checking {{name}}…',
    'launch.addonDownload': 'Downloading {{name}}…'
  }
};

let currentLang = 'en';

function t(key, vars) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.fr;
  let str = dict[key] || TRANSLATIONS.en[key] || key;
  if (vars) {
    Object.keys(vars).forEach((k) => {
      str = str.replace(new RegExp(`{{${k}}}`, 'g'), vars[k]);
    });
  }
  return str;
}

function applyStaticTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
}

function setLang(lang) {
  currentLang = TRANSLATIONS[lang] ? lang : 'en';
  document.documentElement.lang = currentLang;
  applyStaticTranslations();
}

window.i18n = { t, setLang, getLang: () => currentLang };
