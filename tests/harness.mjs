// Outils communs aux tests navigateur : serveur statique local (config.js servi avec FIREBASE = null : mode local,
// sans internet), Chrome sans écran avec rendu WebGL logiciel, bibliothèques servies depuis node_modules.
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
export const BASE = `http://127.0.0.1:${server.address().port}/`;

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
export const browser = await chromium.launch({ ...findChrome(), headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
export const ctx = await browser.newContext();
/* bibliothèques servies depuis node_modules : le test tourne sans internet */
await ctx.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', r => { const rel = r.request().url().split('three@0.160.0/')[1]; r.fulfill({ path: path.join(NM, 'three', rel), contentType: 'application/javascript' }); });
await ctx.route('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js', r => r.fulfill({ path: path.join(NM, 'qrcode-generator', 'qrcode.js'), contentType: 'application/javascript' }));
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ body: '', contentType: 'text/css' }));
await ctx.route(/gstatic\.com\/firebasejs|firebaseio\.com|elevenlabs/, r => r.abort());

export const errors = [];
export const score = { fails: 0, passes: 0 };
export async function check(name, fn) {
  try { await fn(); score.passes++; console.log('  ok  ', name); }
  catch (e) { score.fails++; console.log('  ÉCHEC', name, '\n        ', String(e.message || e).split('\n')[0]); }
}
export const wait = (pg, fn, arg, t = 15000) => pg.waitForFunction(fn, arg, { timeout: t });
export async function page(url, w, h, tag) {
  const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h });
  p.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|404/.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
  await p.goto(BASE + url, { timeout: 90000 }); return p;
}

/* fin de série : ferme tout et rend le code de sortie */
export async function finish(e) {
  if (e) { score.fails++; console.log('  ÉCHEC (arrêt)', String(e.message || e).split('\n')[0]); if (errors.length) console.log('  erreurs :', errors.slice(0, 5).join('\n   ')); }
  await browser.close(); server.close();
  console.log(`\n${score.passes} réussis, ${score.fails} échoués`);
  process.exit(score.fails ? 1 : 0);
}
export const ROOT_DIR = ROOT;
/* inscription d'un téléphone (clic différé : le démarrage de la 3D peut occuper la page plusieurs secondes) */
export async function join(p, name) {
  await p.fill('#nm', name);
  await p.evaluate(() => setTimeout(() => document.getElementById('jn').click(), 0));
  await p.waitForFunction(() => !document.getElementById('nm'), null, { timeout: 150000 });
}
