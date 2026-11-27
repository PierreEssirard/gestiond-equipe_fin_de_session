// Test de bout en bout : un projecteur + deux téléphones dans un vrai navigateur, en mode local (sans Firebase).
// Lancer : npm run e2e   (Chrome ou Edge installé ; sinon CHROME_PATH=/chemin/vers/chrome)
import { check, wait, page, errors, finish, ctx } from './harness.mjs';
import { fileURLToPath } from 'node:url';
import { keyFor } from '../voices.js';
import { LINES } from '../config.js';
import { genreDuPrenom } from '../prenoms.js';
import { POOL, LOOK } from '../avatars.js';

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
  await check('Babillage : rien ne se passe avant « Lancer la partie »', async () => {
    const r = await host.evaluate(() => { if (__host.started()) return 'déjà lancé'; __host.babillage(); return __host.said().some(x => x.fx === 'babil') || __host.babbling() ? 'parlé' : ''; });
    if (r === 'parlé') throw new Error('Philippe crie avant le lancement');
  });
  const A = await page(`player.html?r=${ROOM}&pid=pA`, 390, 780, 'téléphone A');
  const B = await page(`player.html?r=${ROOM}&pid=pB`, 390, 780, 'téléphone B');
  for (const [p, n, g] of [[A, 'Alice', 'f'], [B, 'Bruno', 'm']]) {
    await p.fill('#nm', n);
    await check(`${n} : avatar ${g === 'f' ? 'femme' : 'homme'} proposé d’après le prénom`, async () => {
      const v = await p.evaluate(() => document.querySelector('.av [aria-checked="true"]')?.dataset.g || null); if (v !== g) throw new Error('proposé : ' + v);
    });
    await p.click('#jn');
  }
  await check('les deux joueurs apparaissent sur le projecteur', () => wait(host, () => Object.values(__host.players()).filter(p => p.name).length === 2, null, 60000));
  await check('prénom mixte : rien n’est coché, le joueur choisit, et son choix l’emporte sur le prénom', async () => {
    const C = await page(`player.html?r=${ROOM}&pid=pC`, 390, 780, 'téléphone C');
    await C.fill('#nm', 'Dominique');
    const v = await C.evaluate(() => [document.querySelector('.av [aria-checked="true"]')?.dataset.g || null, document.getElementById('avh').textContent]);
    if (v[0] !== null || !/choisir/.test(v[1])) throw new Error('mixte : ' + JSON.stringify(v));
    await C.click('.av [data-g="f"]'); await C.fill('#nm', 'Bruno');
    const w = await C.evaluate(() => document.querySelector('.av [aria-checked="true"]')?.dataset.g); await C.close();
    if (w !== 'f') throw new Error('le choix du joueur a été remplacé : ' + w);
  });
  await check('équipes équilibrées', async () => { const t = await host.evaluate(() => Object.values(__host.players()).map(p => p.team ? 1 : 0).sort().join()); if (t !== '0,1') throw new Error('équipes : ' + t); });
  await check('chaque joueur reçoit une place', () => wait(host, () => Object.values(__host.players()).every(p => Number.isInteger(p.seat)), null, 60000));
  await check('la salle 3D s’affiche sur le téléphone', () => wait(A, () => window.__phone && document.body.classList.contains('s3d'), null, 30000));
  await check('la salle réaliste précalculée est chargée (projecteur et téléphone)', async () => {
    await wait(host, () => __host.R.room === true, null, 180000);
    await wait(A, () => window.__phone && __phone.R.room === true, null, 180000);
  });
  await check('avatars : femme pour Alice, homme pour Bruno, même personnage et même tenue sur le projecteur et le téléphone', async () => {
    await wait(host, () => ['pA', 'pB'].every(id => __host.players()[id]?.look && __host.R.people.get(id)?.shown), null, 60000);
    const P = await host.evaluate(() => __host.players()), h = await host.evaluate(() => ['pA', 'pB'].map(id => __host.R.people.get(id).shown));
    if (P.pA.g !== 'f' || !POOL.f.includes(P.pA.look)) throw new Error('Alice : ' + P.pA.g + ' ' + P.pA.look);
    if (P.pB.g !== 'm' || !POOL.m.includes(P.pB.look)) throw new Error('Bruno : ' + P.pB.g + ' ' + P.pB.look);
    [P.pA.look, P.pB.look].forEach((k, i) => { const [model, body, hair] = LOOK[k]; if (h[i].model !== model || h[i].body !== (body || null) || h[i].hair !== (hair || null)) throw new Error(`projecteur : ${k} affiché ${JSON.stringify(h[i])}`); });
    await wait(A, () => ['pA', 'pB'].every(id => __phone.R.people.get(id)?.shown), null, 60000);
    const t = await A.evaluate(() => ['pA', 'pB'].map(id => __phone.R.people.get(id).shown));
    if (JSON.stringify(t) !== JSON.stringify(h)) throw new Error('téléphone ' + JSON.stringify(t) + ' ≠ projecteur ' + JSON.stringify(h));
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
  await check('la caméra du téléphone est dans la salle dès le chargement, même si une image arrive horodatée dans le passé', async () => {
    const r = await A.evaluate(() => {
      const R = __phone.R, c = R.camera.position, inside = p => Math.abs(p.x) < 7.6 && p.z < 6.3 && p.z > -6.2 && p.y > 0 && p.y < 4;
      const first = { x: c.x, y: c.y, z: c.z };
      R.tick(-3); R.tick(-.4);            // fil principal occupé au démarrage : la première image peut précéder l'horloge
      return { first, ok1: inside(first), ok2: inside(c), now: [c.x, c.z].map(v => v.toFixed(1)).join(',') };
    });
    if (!r.ok1) throw new Error(`caméra hors de la salle au chargement : ${JSON.stringify(r.first)}`);
    if (!r.ok2) throw new Error(`pas de temps négatif : caméra partie en ${r.now}`);
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

  // ---- bouton Babillage, avec le son : la voix en cours se met en pause, Philippe crie, puis elle reprend ----
  // (tout se joue dans la page, minuté par des setTimeout : rien n'est manqué même si l'image est lente)
  const CLIP = fileURLToPath(new URL(`../voix/${keyFor(...LINES.babil[0])}.mp3`, import.meta.url));
  const fakeLine = async text => {          // une réplique de Mélanie avec un vrai clip audio (servi depuis le dépôt)
    const k = keyFor('M', text);
    await ctx.route(`**/voix/${k}.mp3`, r => r.fulfill({ path: CLIP, contentType: 'audio/mpeg' }));
    await host.evaluate(([k, t]) => {
      window.__sleep = ms => new Promise(r => setTimeout(r, ms));
      window.__until = async (f, t = 15000) => { const t0 = performance.now(); while (!f()) { if (performance.now() - t0 > t) return false; await __sleep(20); } return true; };
      __host.hush(); __host.voix().add(k); __host.say([['M', t]]);
    }, [k, text]);
  };
  const startLine = async () => {           // attend que la réplique joue, la ralentit (≈ 3 s), puis appuie sur Babillage
    if (!await __until(() => { const a = __host.audio(); return a && !a.paused; })) return null;
    const line = __host.audio(); line.playbackRate = .4;
    await __until(() => line.currentTime > .1, 5000);
    window.__n0 = __spoken.length; window.__at = line.currentTime; __host.babillage();
    return line;
  };
  await check('Babillage : la réplique en cours se met en pause, Philippe crie en gros plan, puis elle reprend où elle en était', async () => {
    const TL = 'Réplique de test : Philippe va me couper la parole.';
    await fakeLine(TL);
    const r = await host.evaluate(async start => {
      const line = await (0, eval)(start)(); if (!line) return { err: 'la réplique de test ne démarre pas' };
      const now = { paused: line.paused, b: __host.babbling(), cap: document.getElementById('capT').textContent, view: __host.R.view };
      await __until(() => !__host.babbling(), 10000); await __sleep(150);
      const after = { paused: line.paused, t: line.currentTime, cur: __host.audio() === line, cap: document.getElementById('capT').textContent };
      const plays = __spoken.slice(__n0).map(e => String(e.x));
      return { at: __at, now, after, plays, ended: await __until(() => line.ended, 15000) };
    }, `(${startLine})`);
    if (r.err) throw new Error(r.err);
    if (!r.now.b || !r.now.paused) throw new Error('la réplique n’est pas mise en pause');
    if (r.now.cap !== 'Babillage !') throw new Error('sous-titre : ' + r.now.cap);
    if (r.now.view.key !== 'follow' || r.now.view.follow.id !== 'P' || r.now.view.follow.mode !== 'face') throw new Error('pas de gros plan sur Philippe : ' + JSON.stringify(r.now.view));
    if (!r.plays.some(x => x.startsWith('blob:') || x.includes(keyFor(...LINES.babil[0])))) throw new Error('le cri n’a pas été joué : ' + r.plays.join(' | '));
    if (r.after.paused || !r.after.cur) throw new Error('la réplique interrompue ne reprend pas : ' + JSON.stringify(r.after));
    if (r.after.t < r.at - .05) throw new Error(`reprise depuis le début au lieu de ${r.at.toFixed(2)} s`);
    if (r.after.cap !== TL) throw new Error('sous-titre non rétabli : ' + r.after.cap);
    if (!r.ended) throw new Error('la réplique ne va pas jusqu’au bout');
  });
  await check('Babillage puis « Suivant » vers l’étape suivante : la réplique coupée ne reprend pas plus tard', async () => {
    await fakeLine('Deuxième réplique de test, coupée pour de bon.');
    const r = await host.evaluate(async start => {
      const line = await (0, eval)(start)(); if (!line) return { err: 'la réplique de test ne démarre pas' };
      const t0 = line.currentTime; await __sleep(200);
      __host.go(__host.S.step + 1);
      await __until(() => !__host.babbling(), 10000); await __sleep(1500);
      return { paused: line.paused, moved: line.currentTime - t0, cur: __host.audio() === line };
    }, `(${startLine})`);
    if (r.err) throw new Error(r.err);
    if (!r.paused || r.cur || r.moved > .05) throw new Error('la réplique coupée a repris : ' + JSON.stringify(r));
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
  await check('joueurs fictifs : avatar selon le prénom, et pas deux fois la même tenue tant qu’il en reste', async () => {
    await wait(host, () => Object.values(__host.players()).filter(p => p.name).every(p => p.look), null, 20000);
    const L = await host.evaluate(() => Object.values(__host.players()).filter(p => p.name).map(p => ({ name: p.name, look: p.look })));
    for (const p of L) { const g = genreDuPrenom(p.name); if (g && !POOL[g].includes(p.look)) throw new Error(`${p.name} → ${p.look}`); }
    for (const g of ['m', 'f']) { const ks = L.filter(p => POOL[g].includes(p.look)).map(p => p.look); if (ks.length <= POOL[g].length && new Set(ks).size !== ks.length) throw new Error('jumeaux : ' + ks.join(', ')); }
  });
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
  await finish();
} catch (e) { await finish(e); }
