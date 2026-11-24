// Test de bout en bout : un projecteur + deux téléphones dans un vrai navigateur, en mode local (sans Firebase).
// Lancer : npm run e2e   (Chrome ou Edge installé ; sinon CHROME_PATH=/chemin/vers/chrome)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { keyFor } from '../voices.js';
import { LINES } from '../config.js';

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
  await check('la salle réaliste précalculée est chargée (projecteur et téléphone)', async () => {
    await wait(host, () => __host.R.room === true, null, 180000);
    await wait(A, () => window.__phone && __phone.R.room === true, null, 180000);
  });
  // dans ce test, les pages ne dessinent pas (rendu logiciel très lent) ; la synchronisation continue de tourner
  for (const p of [A, B]) await p.evaluate(() => { window.__pause = true; });

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
  await check('le téléphone et le projecteur placent les personnages au même endroit', async () => {
    await A.waitForTimeout(800);
    await host.evaluate(() => __host.R.advance(15)); await A.waitForTimeout(1500);
    const pos = p => p.evaluate(R => ['pA', 'pB'].map(id => { const a = (R === 'h' ? __host.R : __phone.R).people.get(id); return a ? [a.x, a.z] : null; }), p === host ? 'h' : 'p');
    const [h, a] = [await pos(host), await pos(A)];
    for (let i = 0; i < 2; i++) { if (!h[i] || !a[i]) throw new Error('avatar manquant'); const d = Math.hypot(h[i][0] - a[i][0], h[i][1] - a[i][1]); if (d > .03) throw new Error(`écart de ${d.toFixed(2)} m`); }
  });
  await check('la caméra du téléphone reste dans la salle (pas d’écran jaune)', async () => {
    const out = await B.evaluate(() => {
      const R = __phone.R, a = R.people.get('pB'), bad = [];
      for (const [x, z] of [[6.5, 5.3], [-6.5, 5.3], [6.5, -4.7], [0, 6.2], [-7.5, 0]]) {
        a.x = x; a.z = z; a.path = []; R.follow('pB', 'back', true); R.tick(.05);
        R.follow('pB', 'front', true); R.tick(.05);
        const c = R.camera.position; if (Math.abs(c.x) > 7.6 || c.z > 6.3 || c.z < -6.2) bad.push(`${x},${z} -> ${c.x.toFixed(1)},${c.z.toFixed(1)}`);
      }
      return bad;
    });
    if (out.length) throw new Error('caméra hors de la salle : ' + out.join(' ; '));
  });
  await check('le téléphone suit son propre joueur, marqué d’un anneau', async () => {
    const r = await A.evaluate(() => {
      const R = __phone.R; __phone.snap(60);
      const me = R.people.get('pA'), other = R.people.get('pB'), c = R.camera.position;
      return { ring: !!me.ring, otherRing: !!other.ring, d: Math.hypot(c.x - me.x, c.z - me.z) };
    });
    if (!r.ring || r.otherRing) throw new Error('anneau mal placé');
    if (r.d > 3.6) throw new Error(`caméra à ${r.d.toFixed(1)} m de son joueur`);
  });
  await check('le téléphone se recale sur les positions du projecteur', async () => {
    await A.evaluate(() => __phone.R.place('pB', 0, 1.2, 0));   // décalage volontaire sur le téléphone
    await A.waitForTimeout(2500);                                // (pages de test lentes : ~1 image/s)
    const h = await host.evaluate(() => { const a = __host.R.people.get('pB'); return [a.x, a.z]; });
    const p = await A.evaluate(() => { const a = __phone.R.people.get('pB'); return [a.x, a.z]; });
    const d = Math.hypot(h[0] - p[0], h[1] - p[1]); if (d > .1) throw new Error(`écart restant ${d.toFixed(2)} m`);
  });
  await check('pendant un déplacement, le téléphone suit le projecteur de façon fluide et avec moins d’1 s de décalage', async () => {
    // le projecteur fait marcher Bruno à l'autre bout de la salle, en temps réel (sans dessiner, pour aller vite)
    await host.evaluate(() => { __host.R.moveTo('pB', -6.4, 5.2); window.__hist = []; window.__run = setInterval(() => { __host.R.advance(.05); const a = __host.R.people.get('pB'); __hist.push([Date.now(), a.x, a.z]); }, 50); });
    await A.evaluate(() => { window.__ph = []; window.__run = setInterval(() => { __phone.step(); const a = __phone.R.people.get('pB'); __ph.push([Date.now(), a.x, a.z, a.walking]); }, 100); });
    await A.waitForTimeout(9000);
    const H = await host.evaluate(() => { clearInterval(__run); return __hist; });
    const P = await A.evaluate(() => { clearInterval(__run); return __ph; });
    const moving = P.filter((p, i) => i && Math.hypot(p[1] - P[i - 1][1], p[2] - P[i - 1][2]) > .01);
    if (moving.length < 20) throw new Error('le personnage ne bouge pas sur le téléphone');
    let maxStep = 0; for (let i = 1; i < P.length; i++) maxStep = Math.max(maxStep, Math.hypot(P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]));
    if (maxStep > .4) throw new Error(`saccade de ${maxStep.toFixed(2)} m en 0,1 s`);
    const lags = moving.map(p => { let best = null, bd = 1e9; for (const h of H) { const d = Math.hypot(h[1] - p[1], h[2] - p[2]); if (d < bd) { bd = d; best = h; } } return (p[0] - best[0]) / 1000; });
    const lmax = Math.max(...lags), lmin = Math.min(...lags);
    if (lmax > 1 || lmin < -0.1) throw new Error(`décalage entre ${lmin.toFixed(2)} et ${lmax.toFixed(2)} s`);
    if (!moving.some(p => p[3])) throw new Error('pas d’animation de marche sur le téléphone');
    const end = P[P.length - 1], hend = H[H.length - 1]; if (Math.hypot(end[1] - hend[1], end[2] - hend[2]) > .03) throw new Error('position finale différente');
    console.log(`         décalage mesuré : ${lmin.toFixed(2)} à ${lmax.toFixed(2)} s`);
  });
  await check('bouton 2D puis 3D : on revient bien à la 3D', async () => {
    await A.click('#tog'); await wait(A, () => !document.body.classList.contains('s3d') && document.getElementById('tog').textContent === '3D');
    await A.click('#tog'); await wait(A, () => document.body.classList.contains('s3d') && document.getElementById('tog').textContent === '2D');
  });
  await check('la 3D s’affiche par défaut, même après être passé en 2D et avoir rechargé', async () => {
    await A.click('#tog'); await wait(A, () => !document.body.classList.contains('s3d'));
    await A.evaluate(() => localStorage.setItem('choc:2d', '1')); // ancien réglage mémorisé
    await A.reload(); await wait(A, () => document.body.classList.contains('s3d') && window.__phone, null, 30000);
  });
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

  // ---- voix : rien de l'étape précédente ne doit parler après « Suivant » ----
  await host.evaluate(() => {
    window.__spoken = [];
    const log = x => __spoken.push({ x, t: performance.now() });
    const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { log(this.src); return play.call(this); };
    if (window.speechSynthesis) { const sp = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = u => { log(u.text); return sp(u); }; }
    __host.S.sound = true;
  });
  await B.click('[data-v="1"]'); await wait(host, () => __host.S.phase === 'closed');
  await host.evaluate(() => __host.next());             // révélation : les profs vont commenter dans 1,4 s
  await host.waitForTimeout(300);
  const mark = await host.evaluate(() => { __host.next(); return performance.now(); }); // Suivant tout de suite
  await host.waitForTimeout(5000);
  await check('après « Suivant », les profs ne commentent plus la question précédente (pas de voix en double)', async () => {
    const profLines = ['great', 'mid', 'bad', 'none'].flatMap(k => LINES[k].flat()).filter(l => Array.isArray(l));
    const keys = new Set(profLines.map(([w, t]) => keyFor(w, t))), texts = new Set(profLines.map(([, t]) => t));
    const late = (await host.evaluate(m => __spoken.filter(e => e.t > m).map(e => e.x), mark))
      .filter(x => [...keys].some(k => x.includes(k)) || [...texts].some(t => x.includes(t.slice(0, 25))));
    if (late.length) throw new Error('voix en trop : ' + late.slice(0, 2).join(' | ').slice(0, 160));
  });
  await host.evaluate(() => { __host.S.sound = false; });

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
  await check('personne ne se superpose dans les coins (14 joueurs)', async () => {
    await A.click('[data-v="0"]'); await B.click('[data-v="0"]');
    await wait(host, () => Object.keys(__host.answers()).length >= 14 || __host.S.phase !== 'open', null, 25000);
    await host.evaluate(() => __host.R.advance(25));
    const bad = await host.evaluate(() => {
      const L = [...__host.R.people.entries()].filter(([id, a]) => !['M', 'P', 'K', 'Mi'].includes(id) && !a.sitting).map(([id, a]) => [id, a.x, a.z]), out = [];
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const d = Math.hypot(L[i][1] - L[j][1], L[i][2] - L[j][2]); if (d < .55) out.push(`${L[i][0]}/${L[j][0]} ${d.toFixed(2)} m`); }
      return out;
    });
    if (bad.length) throw new Error(bad.slice(0, 3).join(', '));
  });
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
