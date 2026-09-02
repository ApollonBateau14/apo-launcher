// Buffer en mémoire des logs du dernier lancement — pas un fichier, juste
// de quoi permettre au bouton "Copier les logs" (Paramètres) de récupérer
// un contexte utile en cas de bug (crash Fabric, mod corrompu, etc.) sans
// avoir à aller fouiller le dossier de jeu ou la console DevTools.

const MAX_LINES = 500;
let lines = [];

function reset() {
  lines = [];
}

function push(line) {
  lines.push(`[${new Date().toISOString()}] ${line}`);
  if (lines.length > MAX_LINES) lines.shift();
}

function getText() {
  return lines.length ? lines.join('\n') : '(aucun log — lance le jeu au moins une fois)';
}

module.exports = { reset, push, getText };
