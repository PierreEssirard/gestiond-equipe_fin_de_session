// Vérifie que chaque réplique du jeu a bien sa voix : dans Firebase (branche « voix », lue en ligne, rien n'est modifié)
// ou dans le dépôt (fichier voix/<clé>.mp3 listé dans voix/index.json).
// Lancer : npm run voix:check   (connexion internet nécessaire ; rien n'est modifié)
import { FIREBASE, GAME, LINES } from '../config.js';
import { allLines, keyFor } from '../voices.js';
import { readFileSync, existsSync } from 'node:fs';

const VOIX = new URL('../voix/', import.meta.url);
let repo = [];
try { repo = JSON.parse(readFileSync(new URL('index.json', VOIX), 'utf8')); } catch (e) { }
const absent = repo.filter(k => !existsSync(new URL(k + '.mp3', VOIX)));
if (absent.length) { console.error('voix/index.json cite des fichiers absents :', absent.join(', ')); process.exit(1); }

if (!FIREBASE || !FIREBASE.databaseURL) { console.log('Pas de Firebase configuré : rien à vérifier.'); process.exit(0); }
const url = FIREBASE.databaseURL.replace(/\/$/, '') + '/voix.json?shallow=true';
const res = await fetch(url);
if (!res.ok) { console.error('Lecture impossible :', res.status, await res.text()); process.exit(1); }
const have = new Set([...Object.keys((await res.json()) || {}), ...repo]);
const lines = allLines(GAME, LINES), miss = lines.filter(l => !have.has(keyFor(l.who, l.text)));
console.log(`${lines.length - miss.length}/${lines.length} répliques ont leur voix (Firebase, ou dépôt pour ${repo.length}).`);
if (miss.length) {
  miss.slice(0, 20).forEach(l => console.log(`  manquante : ${l.who} « ${l.text.slice(0, 70)} »`));
  console.log('Générer les voix manquantes : voir tools/voix.html ou tools/generer-voix.mjs');
  process.exit(1);
}
