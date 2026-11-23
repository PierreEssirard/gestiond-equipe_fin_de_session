// Test de bout en bout : un projecteur + deux téléphones dans un vrai navigateur, en mode local (sans Firebase).
// Lancer : npm run e2e   (Chrome ou Edge installé ; sinon CHROME_PATH=/chemin/vers/chrome)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = path.join(ROOT, 'node_modules');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.png': 'image/png', '.css': 'text/css' };

/* serveur statique ; config.js est servi avec FIREBASE = null pour forcer le mode local */
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(f);
  if (path.basename(f) === 'config.js') body = body.toString().replace(/export const FIREBASE = \{[\s\S]*?\};/, 'export const FIREBASE = null;');
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(body);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

function findChrome() {
  if (process.env.CHROME_PATH) return { executablePath: process.env.CHROME_PATH };
  for (const dir of [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean)) {
    if (!fs.existsSync(dir)) continue;
    for (const d of fs.readdirSync(dir).filter(d => d.startsWith('chromium-')).sort().reverse()) {
      const p = path.join(dir, d, 'chrome-linux64', 'chrome'); if (fs.existsSync(p)) return { executablePath: p };
    }
  }
  return { channel: process.platform === 'win32' ? 'msedge' : 'chrome' };
}
const browser = await chromium.launch({ ...findChrome(), headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const ctx = await browser.newContext();
/* bibliothèques servies depuis node_modules : le test tourne sans internet */
await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', r => { const rel = r.request().url().split('three@0.160.0/')[1]; r.fulfill({ path: path.join(NM, 'three', rel), contentType: 'application/javascript' }); });
await ctx.route('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js', r => r.fulfill({ path: path.join(NM, 'qrcode-generator', 'qrcode.js'), contentType: 'application/javascript' }));
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: '', contentType: 'text/css' }));
await ctx.route(/gstatic\.com\/firebasejs|firebaseio\.com|elevenlabs/, r => r.abort());

const errors = [];
let fails = 0, passes = 0;
async function check(name, fn) {
  try { await fn(); passes++; console.log('  ok  ', name); }
  catch (e) { fails++; console.log('  ÉCHEC', name, '\n        ', String(e.message || e).split('\n')[0]); }
}
const wait = (pg, fn, arg, t = 15000) => pg.waitForFunction(fn, arg, { timeout: t });
async function page(url, w, h, tag) {
  const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h });
  p.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|404/.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
  await p.goto(BASE + url); return p;
}
const ROOM = 'TEST';
const hostState = h => h.evaluate(() => ({ step: __host.S.step, phase: __host.S.phase, gid: __host.S.gid }));
const next = async h => { await h.evaluate(() => __host.next()); await h.waitForTimeout(400); };
/* avance jusqu'à la première question ouverte */
async function toFirstQuestion(h) { await next(h); await next(h); await wait(h, () => __host.S.phase === 'open'); }
const mode = p => p.evaluate(() => {
  const t = document.getElementById('m').innerText + ' ' + document.getElementById('chip').innerText;
  if (document.querySelector('#nm')) return 'join';
  if (document.querySelector('[data-v]') || document.querySelector('#lok')) return 'open';
  if (/Envoyé|Réponse envoyée/.test(t)) return 'sent';
  if (/Temps écoulé/.test(t)) return 'closed';
  return 'other';
});

try {
  console.log('Test de bout en bout');
  const host = await page(`index.html?r=${ROOM}`, 1280, 720, 'projecteur');
  await wait(host, () => window.__host && __host.S);
  await host.evaluate(() => { window.__pause = true; __host.S.sound = false; });
  const A = await page(`player.html?r=${ROOM}&pid=pA`, 390, 780, 'téléphone A');
  const B = await page(`player.html?r=${ROOM}&pid=pB`, 390, 780, 'téléphone B');
  for (const [p, n] of [[A, 'Alice'], [B, 'Bruno']]) { await p.fill('#nm', n); await p.click('#jn'); }

  await check('les deux joueurs apparaissent sur le projecteur', () => wait(host, () => Object.values(__host.players()).filter(p => p.name).length === 2));
  await check('équipes équilibrées', async () => { const t = await host.evaluate(() => Object.values(__host.players()).map(p => p.team ? 1 : 0).sort().join()); if (t !== '0,1') throw new Error('équipes : ' + t); });
  await check('chaque joueur reçoit une place', () => wait(host, () => Object.values(__host.players()).every(p => Number.isInteger(p.seat))));
  await check('la salle 3D s’affiche sur le téléphone', () => wait(A, () => window.__phone && document.body.classList.contains('s3d'), null, 30000));

  await toFirstQuestion(host);
  await check('question ouverte : les deux téléphones montrent les boutons', async () => { await wait(A, () => !!document.querySelector('[data-v]')); await wait(B, () => !!document.querySelector('[data-v]')); });
  await A.click('[data-v="1"]');
  await check('A répond : A voit « envoyé », B voit encore les boutons', async () => {
    await wait(A, () => /Envoyé/.test(document.getElementById('chip').innerText));
    await host.waitForTimeout(600);
    if (await mode(B) !== 'open') throw new Error('B : ' + await mode(B));
    const s = await hostState(host); if (s.phase !== 'open') throw new Error('la question s’est fermée trop tôt : ' + s.phase);
  });
  await B.click('[data-v="0"]');
  await check('tout le monde a répondu : la question se ferme', () => wait(host, () => __host.S.phase === 'closed'));
  await host.evaluate(() => __host.next());
  await check('révélation : points affichés sur les téléphones', async () => { await wait(A, () => /\+\d+ pts/.test(document.getElementById('big').innerText)); await wait(B, () => /Raté/.test(document.getElementById('big').innerText)); });

  // ---- régression : on recharge le projecteur (même salle) et on rejoue ----
  const gid1 = (await hostState(host)).gid;
  await host.reload(); await wait(host, () => window.__host && __host.S);
  await host.evaluate(() => { window.__pause = true; __host.S.sound = false; });
  await check('nouvelle partie = nouvel identifiant', async () => { const g = (await hostState(host)).gid; if (g === gid1) throw new Error('même identifiant'); });
  await toFirstQuestion(host);
  await check('après rechargement : la question reste ouverte (pas de réponses fantômes)', async () => { await host.waitForTimeout(800); const s = await hostState(host); if (s.phase !== 'open') throw new Error('phase ' + s.phase); });
  await check('après rechargement : les téléphones peuvent répondre (pas de « Temps écoulé » / « Envoyé »)', async () => {
    await wait(A, () => !!document.querySelector('[data-v]')); await wait(B, () => !!document.querySelector('[data-v]'));
  });
  await A.click('[data-v="2"]');
  await check('après rechargement : la réponse de A est bien reçue', () => wait(host, () => Object.keys(__host.answers()).length === 1 && __host.S.phase === 'open'));

  // ---- nouvelle partie avec la touche N (deux fois) ----
  await host.evaluate(() => __host.reset());
  await wait(host, () => __host.S.step === 0);
  await check('après « nouvelle partie » : les joueurs doivent se réinscrire', () => wait(A, () => !!document.querySelector('#nm')));
  for (const [p, n] of [[A, 'Alice'], [B, 'Bruno']]) { await p.fill('#nm', n); await p.click('#jn'); }
  await wait(host, () => Object.values(__host.players()).filter(p => p.name).length === 2);
  await toFirstQuestion(host);
  await check('après « nouvelle partie » : les boutons sont disponibles', async () => { await wait(A, () => !!document.querySelector('[data-v]')); await wait(B, () => !!document.querySelector('[data-v]')); });

  // ---- partie complète avec 12 joueurs fictifs ----
  await host.evaluate(() => __host.addBots(12));
  await check('partie complète jusqu’au résultat final sans blocage', async () => {
    for (let i = 0; i < 40; i++) {
      const s = await host.evaluate(() => ({ k: __host.cur().k }));
      if (s.k === 'final') return;
      await host.evaluate(() => { __host.S.phase === 'scene' ? __host.go(__host.S.step + 1) : __host.next(); });
      await host.waitForTimeout(250);
    }
    throw new Error('le résultat final n’a pas été atteint');
  });
  await check('téléphone : écran final', () => wait(A, () => /sur \d+/.test(document.getElementById('m').innerText)));

  await check('aucune erreur JavaScript', async () => { if (errors.length) throw new Error(errors.slice(0, 5).join(' | ')); });
} catch (e) { fails++; console.log('  ÉCHEC (arrêt)', e.message.split('\n')[0]); if (errors.length) console.log('  erreurs :', errors.slice(0, 5).join('\n   ')); }
await browser.close(); server.close();
console.log(`\n${passes} réussis, ${fails} échoués`);
process.exit(fails ? 1 : 0);
