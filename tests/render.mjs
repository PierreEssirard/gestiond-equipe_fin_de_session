// Tests du rendu 3D : pas d'écran noir (toutes les caméras, valeurs invalides, perte du contexte WebGL,
// redimensionnement), téléphone léger (une passe, pas d'ombres temps réel, budget de dessin), décor de secours.
// Lancer : npm run e2e:rendu
import { check, wait, page, errors, finish, join } from './harness.mjs';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

/* mesure de l'image juste après une image calculée (même tâche : le tampon WebGL est encore lisible) */
const PROBE = `window.__probe = cv => {
  const w = 160, h = 90, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(cv, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data; let s = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { const l = .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]; s += l; if (l < 6) b++; }
  return { mean: s / (w * h), black: b / (w * h) };
};`;
/* calcule n images puis mesure la dernière */
const frame = (p, who, n = 3) => p.evaluate(([who, n]) => { const R = window[who].R; for (let i = 0; i < n; i++) R.tick(.05); return __probe(R.renderer.domElement); }, [who, n]);

try {
  console.log('Tests du rendu 3D');
  const host = await page('index.html?r=RENDU', 1280, 720, 'projecteur');
  await host.addScriptTag({ content: PROBE });
  await wait(host, () => window.__host && __host.S);
  await host.evaluate(() => { window.__pause = true; __host.S.sound = false; });
  await check('projecteur : salle réaliste chargée', () => wait(host, () => __host.R.room === true, null, 180000));
  await host.evaluate(() => __host.addBots(10));
  await host.evaluate(() => __host.R.advance(8));

  await check('projecteur : aucune caméra ne donne une image noire ou vide', async () => {
    const cams = await host.evaluate(() => __host.R.cams), bad = [];
    for (const k of cams) {
      await host.evaluate(k => __host.R.cam(k, true), k);
      const m = await frame(host, '__host', 4);
      if (m.mean < 35 || m.black > .05) bad.push(`${k} (moyenne ${m.mean.toFixed(0)}, noir ${(m.black * 100).toFixed(1)} %)`);
    }
    if (bad.length) throw new Error(bad.join(', '));
  });

  await host.evaluate(() => __host.R.cam('wide', true));
  const ref = await frame(host, '__host', 4);
  for (const [name, expr] of [['NaN', 'z / z'], ['infini', '1. / z']]) {
    await check(`un pixel invalide (${name}) ne provoque pas de flash noir`, async () => {
      const m = await host.evaluate(async ([url, expr]) => {
        const THREE = await import(url), R = __host.R;
        const mat = new THREE.ShaderMaterial({ uniforms: { z: { value: 0 } }, vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }', fragmentShader: `uniform float z; void main(){ gl_FragColor = vec4(vec3(${expr}), 1.); }` });
        const s = new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 8), mat);
        const dir = new THREE.Vector3(); R.camera.getWorldDirection(dir);
        s.position.copy(R.camera.position).addScaledVector(dir, 3); R.scene.add(s);
        R.tick(.05); R.tick(.05); const out = __probe(R.renderer.domElement);
        R.scene.remove(s); return out;
      }, [THREE_URL, expr]);
      if (m.black - ref.black > .02 || m.mean < ref.mean * .85) throw new Error(`image assombrie : moyenne ${m.mean.toFixed(0)} (réf. ${ref.mean.toFixed(0)}), noir ${(m.black * 100).toFixed(1)} %`);
    });
  }

  await check('redimensionner ne laisse jamais le canevas vide entre deux images', async () => {
    const r = await host.evaluate(() => {
      const R = __host.R, cv = R.renderer.domElement, w0 = cv.width;
      R.resize(1000, 560); const sameNow = cv.width === w0;     // rien n'est effacé avant la prochaine image
      R.tick(.05); const probe = __probe(cv), changed = cv.width !== w0;
      R.resize(innerWidth, innerHeight); R.tick(.05);
      return { sameNow, changed, probe };
    });
    if (!r.sameNow) throw new Error('canevas redimensionné (donc effacé) hors du calcul d’une image');
    if (!r.changed) throw new Error('nouvelle taille jamais appliquée');
    if (r.probe.mean < 35) throw new Error('image noire après redimensionnement');
  });

  await check('perte du contexte WebGL : l’image et les reflets reviennent', async () => {
    const before = await frame(host, '__host', 2);
    await host.evaluate(() => { window.__lc = __host.R.renderer.getContext().getExtension('WEBGL_lose_context'); __lc.loseContext(); });
    await wait(host, () => __host.R.stats().lost === true);
    await host.evaluate(() => { __host.R.tick(.05); setTimeout(() => __lc.restoreContext(), 300); });   // pas d'erreur pendant la perte
    await wait(host, () => __host.R.stats().restored === 1 && !__host.R.stats().lost, null, 20000);
    const after = await frame(host, '__host', 6);
    if (after.mean < before.mean * .8 || after.black > before.black + .03) throw new Error(`image dégradée après restauration : ${after.mean.toFixed(0)} contre ${before.mean.toFixed(0)}`);
  });

  await check('projecteur : aucune recompilation de shaders en cours de partie (pas d’à-coup)', async () => {
    const n = await host.evaluate(() => { const R = __host.R; for (const k of R.cams) { R.cam(k, true); R.tick(.05); } return R.stats().programs; });
    const m = await host.evaluate(() => { const R = __host.R; for (let i = 0; i < 120; i++) { if (i % 20 === 0) R.cam(R.cams[(i / 20) % R.cams.length], true); R.tick(.05); } return R.stats().programs; });
    if (m !== n) throw new Error(`${m - n} programmes compilés en cours de route`);
  });

  // ---- téléphone ----
  const A = await page('player.html?r=RENDU&pid=pR', 390, 780, 'téléphone');
  await A.addScriptTag({ content: PROBE });
  await join(A, 'Rita');
  await check('téléphone : salle réaliste chargée', () => wait(A, () => window.__phone && __phone.R.room === true, null, 180000));
  await A.evaluate(() => { window.__pause = true; });
  await wait(A, () => __phone.R.people.size >= 10, null, 30000);
  await A.evaluate(() => __phone.snap(10));

  await check('téléphone : une seule passe de rendu (ni post-traitement ni carte d’ombres)', async () => {
    const s = await A.evaluate(() => __phone.R.stats());
    if (s.post) throw new Error('post-traitement actif'); if (s.shadows) throw new Error('carte d’ombres active');
  });
  await check('téléphone : soleil et ombres précalculés dans la lightmap', async () => { if (!(await A.evaluate(() => __phone.R.stats().sunBaked))) throw new Error('lightmap mobile sans soleil'); });
  await check('téléphone : budget de dessin respecté (appels et triangles)', async () => {
    const s = await A.evaluate(() => { __phone.snap(2); return __phone.R.stats(); });
    if (s.calls > 260) throw new Error(`${s.calls} appels de dessin (max 260)`);
    if (s.tris > 420000) throw new Error(`${s.tris} triangles (max 420 000)`);
  });
  await check('téléphone : aucun flou d’arrière-plan au-dessus de la 3D (coûteux à chaque image)', async () => {
    const n = await A.evaluate(() => [...document.querySelectorAll('*')].filter(e => { const c = getComputedStyle(e); return (c.backdropFilter && c.backdropFilter !== 'none') || (c.webkitBackdropFilter && c.webkitBackdropFilter !== 'none'); }).map(e => e.id || e.className));
    if (n.length) throw new Error('backdrop-filter sur : ' + n.join(', '));
  });
  await check('projecteur : aucun flou d’arrière-plan au-dessus de la 3D', async () => {
    const n = await host.evaluate(() => [...document.querySelectorAll('*')].filter(e => { const c = getComputedStyle(e); return c.backdropFilter && c.backdropFilter !== 'none'; }).map(e => e.id || e.className));
    if (n.length) throw new Error('backdrop-filter sur : ' + n.join(', '));
  });
  await check('téléphone : image correcte vue de dos, de face et en plan large', async () => {
    const bad = [];
    for (const k of ['back', 'front', 'wide']) {
      await A.evaluate(k => k === 'wide' ? __phone.R.cam('wide', true) : __phone.R.follow('pR', k), k);
      const m = await A.evaluate(() => { __phone.snap(30); return __probe(__phone.R.renderer.domElement); });
      if (m.mean < 30 || m.black > .06) bad.push(`${k} (moyenne ${m.mean.toFixed(0)}, noir ${(m.black * 100).toFixed(1)} %)`);
    }
    if (bad.length) throw new Error(bad.join(', '));
  });
  await check('téléphone : aucune recompilation de shaders en cours de partie', async () => {
    const n = await A.evaluate(() => { __phone.snap(20); return __phone.R.stats().programs; });
    for (let i = 0; i < 3; i++) { await host.evaluate(() => __host.next()); await A.waitForTimeout(1200); await A.evaluate(() => __phone.snap(4)); }   // consigne, question, révélation (zones)
    const m = await A.evaluate(() => { __phone.snap(60); return __phone.R.stats().programs; });
    if (m !== n) throw new Error(`${m - n} programmes compilés en cours de route`);
  });
  await check('téléphone : la résolution baisse si le téléphone peine, sans changer de shaders', async () => {
    const r = await A.evaluate(async () => {
      const R = __phone.R, now = performance.now.bind(performance); let t = now();
      performance.now = () => t; R.setScale(1); const p0 = R.stats().programs;
      for (let i = 0; i < 240; i++) { t += 40 * R.stats().scale ** 2; R.tick(.04); }   // téléphone lent simulé : 25 images/s à pleine résolution
      performance.now = now;
      return { scale: R.stats().scale, programs: R.stats().programs - p0 };
    });
    if (!(r.scale < 1 && r.scale >= .6)) throw new Error('résolution non adaptée : ' + r.scale);
    if (r.programs) throw new Error(r.programs + ' programmes recompilés');
  });

  // ---- décor de secours (salle réaliste indisponible) ----
  await A.close(); await host.close();              // libère la machine de test
  const F = await page('index.html?r=SECOURS&room=0', 1280, 720, 'projecteur (secours)');
  await F.addScriptTag({ content: PROBE });
  await wait(F, () => window.__host && __host.S);
  await F.evaluate(() => { window.__pause = true; __host.S.sound = false; });
  await check('décor de secours (?room=0) : le jeu s’affiche quand même', async () => {
    await wait(F, () => __host.R.ready && true);
    await F.evaluate(() => __host.R.ready);
    const m = await frame(F, '__host', 4), room = await F.evaluate(() => __host.R.room);
    if (room) throw new Error('salle réaliste chargée malgré ?room=0');
    if (m.mean < 25) throw new Error('image noire : ' + m.mean.toFixed(0));
  });
  const FP = await page('player.html?r=SECOURS&pid=pS&room=0', 390, 780, 'téléphone (secours)');
  await FP.addScriptTag({ content: PROBE });
  await join(FP, 'Sam');
  await check('décor de secours sur téléphone : image visible', async () => {
    await wait(FP, () => window.__phone && document.body.classList.contains('s3d'), null, 30000);
    await FP.evaluate(() => { window.__pause = true; return __phone.R.ready; });
    const m = await FP.evaluate(() => { __phone.snap(6); return __probe(__phone.R.renderer.domElement); });
    if (m.mean < 25) throw new Error('image noire : ' + m.mean.toFixed(0));
  });

  await check('aucune erreur JavaScript', async () => { if (errors.length) throw new Error(errors.slice(0, 5).join(' | ')); });
  await finish();
} catch (e) { await finish(e); }
