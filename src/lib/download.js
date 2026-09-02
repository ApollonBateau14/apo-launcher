// Téléchargement partagé (modpack.js + addons.js) avec vérification
// d'intégrité APRÈS coup, pas seulement avant.
//
// Avant ce fichier, chaque module vérifiait le hash d'un fichier local
// pour décider s'il fallait le (re)télécharger, mais jamais après avoir
// fini d'écrire le nouveau téléchargement. Une coupure réseau en plein
// milieu (sans que le stream lève vraiment une erreur — ça arrive) laissait
// un fichier tronqué/corrompu sur le disque, accepté tel quel jusqu'au
// prochain lancement. Vu en vrai : un mod jar corrompu a fait planter
// Fabric avec une erreur cryptique ("Failed to instantiate language
// adapter"), et relancer l'appli suffisait à "réparer" — preuve que la
// vérification AVANT téléchargement marche très bien, juste une fois trop
// tard pour éviter le crash.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

function fileHash(filePath, algo) {
  return crypto.createHash(algo).update(fs.readFileSync(filePath)).digest('hex');
}

/**
 * Télécharge `url` vers `dest`, vérifie son hash une fois écrit, et
 * recommence (jusqu'à `attempts` fois) si le fichier est corrompu/tronqué —
 * en supprimant systématiquement le fichier invalide avant de réessayer,
 * pour ne jamais laisser un fichier cassé traîner sur le disque.
 *
 * @param {{hash?: string, algo?: string, size?: number}} expected hash à
 *   vérifier après téléchargement ; si absent, aucune vérification (ex:
 *   manifest maison sans hash fourni — on fait confiance à l'URL).
 */
async function downloadAndVerify(url, dest, expected, onProgress, attempts = 3) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Échec téléchargement (HTTP ${res.status})`);
    const total = expected?.size || Number(res.headers.get('content-length')) || 0;
    const fileStream = fs.createWriteStream(dest);

    try {
      await new Promise((resolve, reject) => {
        let downloaded = 0;
        res.body.on('data', (chunk) => {
          downloaded += chunk.length;
          if (onProgress) onProgress(downloaded, total);
        });
        res.body.pipe(fileStream);
        res.body.on('error', reject);
        fileStream.on('error', reject);
        fileStream.on('finish', resolve);
      });
    } catch (err) {
      fs.rmSync(dest, { force: true });
      if (attempt === attempts) throw err;
      continue;
    }

    if (!expected?.hash) return; // rien à vérifier, on fait confiance

    if (fileHash(dest, expected.algo || 'sha1') === expected.hash) return;

    fs.rmSync(dest, { force: true });
    if (attempt === attempts) {
      throw new Error(`Fichier corrompu après ${attempts} tentatives : ${path.basename(dest)}`);
    }
  }
}

module.exports = { downloadAndVerify, fileHash };
