/* Génère toutes les voix du jeu avec ElevenLabs, une seule fois, sur votre ordinateur.
   La clé API reste chez vous : elle n'est jamais envoyée sur GitHub.

   Utilisation (Node.js 18 ou plus récent), depuis la racine du dépôt :
     Windows PowerShell :  $env:ELEVENLABS_API_KEY="votre_clé"; node tools/generer-voix.mjs
     macOS / Linux / Git Bash :  ELEVENLABS_API_KEY=votre_clé node tools/generer-voix.mjs

   Options :
     --force     régénère tout (sinon, seuls les fichiers manquants sont créés)
     --dry       affiche seulement le nombre de répliques et de caractères
   Ensuite : git add voix && git commit -m "Voix ElevenLabs" && git push */

import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { GAME, LINES, ELEVEN } from '../config.js';
import { allLines, keyFor, spoken } from '../voices.js';

const KEY = process.env.ELEVENLABS_API_KEY;
const force = process.argv.includes('--force'), dry = process.argv.includes('--dry');
const dir = new URL('../voix/', import.meta.url);
const lines = allLines(GAME, LINES);
const chars = lines.reduce((s, l) => s + spoken(l.text).length, 0);
console.log(`${lines.length} répliques, ${chars} caractères au total.`);
if (dry) process.exit(0);
if (!KEY) { console.error('Variable ELEVENLABS_API_KEY manquante (voir l’en-tête du script).'); process.exit(1); }
await mkdir(dir, { recursive: true });

async function tts(l) {
  const voice = ELEVEN.voices[l.who];
  const body = { text: spoken(l.text), model_id: ELEVEN.model, voice_settings: ELEVEN.settings[l.who] || ELEVEN.settings.default };
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
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
const queue = lines.slice();
async function worker() {
  while (queue.length) {
    const l = queue.shift(), file = new URL(keyFor(l.who, l.text) + '.mp3', dir);
    if (!force && existsSync(file)) { skipped++; continue; }
    try { await writeFile(file, await tts(l)); done++; console.log(`✓ [${l.who}] ${l.text.slice(0, 70)}`); }
    catch (e) { failed++; console.error(`✗ [${l.who}] ${l.text.slice(0, 50)} → ${e.message}`); if (/401|quota|credits/i.test(e.message)) queue.length = 0; }
  }
}
await Promise.all([worker(), worker(), worker()]);

const files = (await readdir(dir)).filter(f => f.endsWith('.mp3')).map(f => f.slice(0, -4));
await writeFile(new URL('index.json', dir), JSON.stringify(files));
console.log(`\nTerminé : ${done} générées, ${skipped} déjà présentes, ${failed} en échec. voix/index.json mis à jour (${files.length} fichiers).`);
if (failed) process.exitCode = 1;
