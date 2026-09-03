// Bloqueur de pub pour le navigateur NameMC intégré.
//
// Premier essai : charger uBlock Origin comme une vraie extension Chrome
// (session.loadExtension) — ça se chargeait sans erreur, mais Electron ne
// supporte qu'un sous-ensemble de l'API Chrome extensions (webNavigation,
// privacy… manquants, cf. warnings au chargement), et le background script
// d'uBlock n'arrivait jamais à récupérer/appliquer ses listes de filtres :
// chargé, mais ne bloquait rien de concret.
//
// À la place : @ghostery/adblocker-electron, une lib faite exprès pour
// Electron — elle bloque directement au niveau réseau via session.webRequest
// (pas besoin de charger une vraie extension), avec les mêmes listes que
// les bloqueurs classiques (EasyList, EasyPrivacy, + listes "annoyances"
// avec le preset "Full" — bandeaux cookies, overlays…).

const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { app, session } = require('electron');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');

function getCachePath() {
  return path.join(app.getPath('userData'), 'extensions', 'adblocker-engine.bin');
}

// Best-effort et non bloquant : une erreur ici (pas de réseau au tout
// premier lancement…) ne doit jamais empêcher l'app de démarrer, le
// navigateur NameMC fonctionne très bien sans, juste avec les pubs.
async function ensureAdblockLoaded() {
  try {
    const cachePath = getCachePath();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });

    const blocker = await ElectronBlocker.fromPrebuiltFull(fetch, {
      path: cachePath,
      read: fs.promises.readFile,
      write: fs.promises.writeFile
    });

    // Le filtrage "cosmétique" (masquer les blocs vides restants via CSS
    // injecté) a besoin de session.registerPreloadScript, une API trop
    // récente pour notre version d'Electron (31.x) — plantait au chargement
    // ("registerPreloadScript is not a function"). On garde uniquement le
    // blocage réseau (URL/domaine des pubs), qui suffit pour l'essentiel :
    // les bannières ne se chargent tout simplement plus.
    blocker.config.loadCosmeticFilters = false;

    // Session par défaut : celle qu'utilise le <webview> NameMC (pas de
    // partition custom dessus).
    blocker.enableBlockingInSession(session.defaultSession);
    console.log('[ApoLauncher] Bloqueur de pub actif dans le navigateur NameMC.');
  } catch (err) {
    console.error('[ApoLauncher] Bloqueur de pub non chargé (non bloquant) :', err.message);
  }
}

module.exports = { ensureAdblockLoaded };
