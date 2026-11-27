/* Génère toutes les voix du jeu avec ElevenLabs, une seule fois, sur votre ordinateur.
   La clé API reste chez vous : elle n'est jamais envoyée sur GitHub.

   Utilisation (Node.js 18 ou plus récent), depuis la racine du dépôt :
     Windows PowerShell :  $env:ELEVENLABS_API_KEY="votre_clé"; node tools/generer-voix.mjs
     macOS / Linux / Git Bash :  ELEVENLABS_API_KEY=votre_clé node tools/generer-voix.mjs

   Par défaut, seules les répliques sans voix sont générées : ni dans voix/, ni dans la base Firebase (voix/).
   Les plus importantes passent en premier (« Tout le monde s'assoit ! », « Dix secondes ! »), puis l'ordre du jeu ;
   si les crédits ElevenLabs s'épuisent, le script s'arrête proprement et garde ce qui est fait.

   Options :
     --force     régénère tout (sinon, seules les répliques manquantes sont créées)
     --dry       affiche seulement les répliques manquantes et le nombre de caractères
   Ensuite : git add voix && git commit -m "Voix ElevenLabs" && git push */

import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { GAME, LINES, ELEVEN, FIREBASE, voiceSettings, voiceText } from '../config.js';
import { allLines, keyFor, spoken } from '../voices.js';

const KEY = process.env.ELEVENLABS_API_KEY;
const force = process.argv.includes('--force'), dry = process.argv.includes('--dry');
const dir = new URL('../voix/', import.meta.url);
const lines = allLines(GAME, LINES), said = l => voiceText(l.who, l.text) || spoken(l.text);
lines.forEach(l => l.key = keyFor(l.who, l.text));
const chars = lines.reduce((s, l) => s + said(l).length, 0);
console.log(`${lines.length} répliques, ${chars} caractères au total.`);
/* voix déjà faites : fichiers du dépôt et clips de la base Firebase */
const have = new Set();
if (!force) {
  try { (await readdir(dir)).filter(f => f.endsWith('.mp3')).forEach(f => have.add(f.slice(0, -4))); } catch (e) { }
  if (FIREBASE && FIREBASE.databaseURL) {
    try { const r = await fetch(FIREBASE.databaseURL + '/voix.json?shallow=true'); Object.keys((await r.json()) || {}).forEach(k => have.add(k)); }
    catch (e) { console.error('Base Firebase injoignable : impossible de savoir quelles voix existent déjà. Réessayez plus tard.'); process.exit(1); }
  }
}
const first = [...LINES.sitDown, ...LINES.tenSec].map(([w, t]) => keyFor(w, t));
const rank = l => { const i = first.indexOf(l.key); return i < 0 ? first.length : i; };
const todo = lines.filter(l => !have.has(l.key)).sort((a, b) => rank(a) - rank(b));
const need = todo.reduce((s, l) => s + said(l).length, 0);
console.log(`${todo.length} à générer, ${need} caractères (crédits ElevenLabs).`);
todo.forEach(l => console.log(`  ${l.key}  [${l.who}] ${said(l).slice(0, 80)}`));
if (dry || !todo.length) process.exit(0);
if (!KEY) { console.error('Variable ELEVENLABS_API_KEY manquante (voir l’en-tête du script).'); process.exit(1); }
await mkdir(dir, { recursive: true });

async function tts(l) {
  const voice = ELEVEN.voices[l.who];
  const body = { text: voiceText(l.who, l.text) || spoken(l.text), model_id: ELEVEN.model, voice_settings: voiceSettings(l.who, l.text) };
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_96`, {
      method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify(body)
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const msg = await r.text();
    if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 2000 * attempt)); continue; }
    throw new Error(`HTTP ${r.status} : ${msg.slice(0, 300)}`);
  }
  throw new Error('trop d’échecs');
}

let done = 0, skipped = 0, failed = 0;
const queue = todo.slice();
async function worker() {
  while (queue.length) {
    const l = queue.shift(), file = new URL(l.key + '.mp3', dir);
    if (!force && existsSync(file)) { skipped++; continue; }
    try { await writeFile(file, await tts(l)); done++; console.log(`✓ [${l.who}] ${l.text.slice(0, 70)}`); }
    catch (e) { failed++; console.error(`✗ [${l.who}] ${l.text.slice(0, 50)} → ${e.message}`); if (/401|quota|credits/i.test(e.message)) queue.length = 0; }
  }
}
await Promise.all([worker()]);   // une à la fois : l'ordre de priorité est respecté si les crédits s'épuisent

const files = (await readdir(dir)).filter(f => f.endsWith('.mp3')).map(f => f.slice(0, -4));
await writeFile(new URL('index.json', dir), JSON.stringify(files));
console.log(`\nTerminé : ${done} générées, ${skipped} déjà présentes, ${failed} en échec. voix/index.json mis à jour (${files.length} fichiers).`);
if (failed) process.exitCode = 1;
