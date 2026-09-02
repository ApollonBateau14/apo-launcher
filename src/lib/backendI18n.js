// Traductions FR/EN pour les messages générés côté process principal
// (main.js, launcher.js), affichés directement dans l'UI (statut serveur,
// erreurs de lancement). Séparé de src/i18n.js (qui tourne côté renderer)
// car ce fichier est require() par du code Node, pas chargé en <script>.
//
// Portée volontairement limitée à NOS messages authored (pas aux erreurs
// techniques brutes remontées par fetch/HTTP/librairies tierces, qui
// restent telles quelles, généralement déjà en anglais).

const STRINGS = {
  fr: {
    ipNotConfigured: 'IP non configurée — clique sur ⚙ pour la renseigner.',
    usernameMissing: 'Pseudo manquant',
    noServerSelected: 'Aucun serveur sélectionné',
    cantDeleteLastServer: 'Impossible de supprimer le dernier serveur.',
    noGithubRelease: 'Aucune release publiée sur GitHub pour le moment.',
    githubError: (status) => `Erreur GitHub (HTTP ${status})`,
    javaError: (msg) => `Java : ${msg}`,
    loaderError: (loader, msg) => `Loader (${loader}) : ${msg}`,
    modpackError: (msg) => `Modpack : ${msg}`,
    launchFailed: 'Le lancement a échoué (voir la console pour les détails).'
  },
  en: {
    ipNotConfigured: 'IP not configured — click ⚙ to set it.',
    usernameMissing: 'Missing username',
    noServerSelected: 'No server selected',
    cantDeleteLastServer: 'Cannot delete the last server.',
    noGithubRelease: 'No release published on GitHub yet.',
    githubError: (status) => `GitHub error (HTTP ${status})`,
    javaError: (msg) => `Java: ${msg}`,
    loaderError: (loader, msg) => `Loader (${loader}): ${msg}`,
    modpackError: (msg) => `Modpack: ${msg}`,
    launchFailed: 'Launch failed (see the console for details).'
  }
};

function t(lang, key, ...args) {
  const dict = STRINGS[lang] || STRINGS.en;
  const entry = dict[key] ?? STRINGS.en[key];
  return typeof entry === 'function' ? entry(...args) : entry;
}

module.exports = { t };
