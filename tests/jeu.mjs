// Partie complète jouée depuis deux téléphones, en touchant les vrais boutons, pour chaque type d'activité
// (coins, vrai/faux debout-assis, ligne 0-100, course après la scène, fusion) : réponses reçues, révélation,
// points identiques sur le téléphone et le projecteur, résultat final cohérent.
// Vérifie aussi les répliques des profs sur toute la partie : YOUHOU (gros plan, saut, rire de Mélanie)
// à la première bonne réponse majoritaire, « Tabarouette » au moins 3 fois, « vilains étudiants » au moins 2 fois,
// « CréH, arrête d'utiliser Claude » une fois, et aucune réplique répétée.
// Lancer : npm run e2e:jeu
import { check, wait, page, errors, finish, join } from './harness.mjs';

const hs = h => h.evaluate(() => ({ k: __host.cur().k, phase: __host.S.phase, step: __host.S.step }));
/* attend que les profs aient parlé pendant cette étape (et cette phase), puis que tout soit dit */
const spoke = (h, phase) => h.evaluate(phase => { const st = __host.S.step; return new Promise(res => { const t0 = Date.now(); const go = () => { const ok = __host.said().some(x => x.step === st && x.w !== 'N' && (!phase || x.phase === phase)); if ((ok && __host.quiet()) || Date.now() - t0 > 20000) res(ok); else setTimeout(go, 100); }; go(); }); }, phase);

try {
  console.log('Partie complète depuis les téléphones');
  const host = await page('index.html?r=JEU', 1280, 720, 'projecteur');
  await wait(host, () => window.__host && __host.S);
  await host.evaluate(() => { __host.S.sound = false; window.__fastVoice = true; });
  const A = await page('player.html?r=JEU&pid=pA', 390, 780, 'téléphone A');
  const B = await page('player.html?r=JEU&pid=pB', 390, 780, 'téléphone B');
  for (const [p, n] of [[A, 'Alice'], [B, 'Bruno']]) await join(p, n);
  await wait(host, () => Object.values(__host.players()).filter(p => p.name).length === 2);
  for (const p of [A, B]) await wait(p, () => window.__phone && document.body.classList.contains('s3d') && __phone.R.room, null, 240000);
  await check('projecteur : écran de chargement jusqu’à ce que la 3D soit prête, puis la partie démarre', async () => {
    await wait(host, () => __host.started(), null, 120000);
    if (!(await host.evaluate(() => __host.R.room))) throw new Error('démarré avant la salle');
  });
  await check('téléphones : la 3D ne s’affiche qu’une fois la salle prête', async () => {
    for (const p of [A, B]) { await wait(p, () => !!window.__loadDone, null, 60000); const d = await p.evaluate(() => window.__loadDone); if (!d.room) throw new Error('écran de chargement retiré avant la salle'); }
  });
  await check('accueil : les profs parlent après le lancement', async () => { if (!(await spoke(host))) throw new Error('aucune réplique à l’accueil'); });

  const seen = {}, answer = async (p, q, good) => {
    if (q.type === 'line') {
      const v = good ? q.val : (q.val > 50 ? 0 : 100);
      await wait(p, () => !!document.getElementById('lr'));
      await p.evaluate(v => { const r = document.getElementById('lr'); r.value = v; r.dispatchEvent(new Event('input')); }, v);
      await p.click('#lok'); return;
    }
    let v;
    if (q.type === 'standsit') v = String(good ? q.ok : !q.ok);
    else if (q.type === 'fusion') v = '0';                         // fusion : les deux équipes votent pareil
    else v = String(good ? q.ok : (q.ok + 1) % q.opts.length);
    await wait(p, v => !!document.querySelector(`[data-v="${v}"]`), v);
    await p.click(`[data-v="${v}"]`);
  };

  let first = true;
  for (let i = 0; i < 80; i++) {
    const s = await hs(host);
    if (s.k === 'final') break;
    if (s.k !== 'q') { await spoke(host); await host.evaluate(() => __host.next()); await host.waitForTimeout(250); continue; }
    if (s.phase === 'scene') { await wait(host, () => __host.S.phase !== 'scene', null, 90000); continue; }
    if (s.phase === 'reveal') { await spoke(host, 'reveal'); await host.evaluate(() => __host.next()); await host.waitForTimeout(250); continue; }
    if (s.phase === 'closed') { await host.evaluate(() => __host.next()); continue; }
    // question ouverte
    const q = await host.evaluate(() => { const st = __host.cur(); return { ...__host.q(), type: __host.act().type, label: `${__host.act().type} ${st.qi + 1}` }; });
    seen[q.type] = (seen[q.type] || 0) + 1;
    await host.evaluate(() => { if (__host.S.timer) __host.S.timer.left = 120; });   // machine de test lente : le chrono ne doit pas fermer la question
    const bothGood = first;                                                          // première question : tout le monde a juste → YOUHOU
    await check(`${q.label} : les deux téléphones répondent avec les boutons`, async () => {
      await answer(A, q, true); await answer(B, q, bothGood);
      await wait(host, () => ['pA', 'pB'].every(id => __host.answers()[id]) && __host.S.phase === 'closed', null, 20000);
    });
    await host.evaluate(() => __host.next());
    if (first) {
      await check('première bonne réponse majoritaire : YOUHOU de Philippe, gros plan, saut bras levés, Mélanie rit', async () => {
        await wait(host, () => __host.said().some(x => x.fx === 'youhou'), null, 15000);
        const r = await host.evaluate(() => { const y = __host.said().find(x => x.fx === 'youhou'), R = __host.R, P = R.people.get('P'), M = R.people.get('M');
          return { w: y.w, t: y.t, view: y.view, jumping: P.jumpUntil > R.T, laugh: !!(M.react && M.react.kind === 'laugh' && M.react.until > R.T) }; });
        if (r.w !== 'P' || !/^YOUHOU/.test(r.t)) throw new Error('mauvaise réplique : ' + r.t);
        if (r.view.key !== 'follow' || r.view.follow.id !== 'P' || r.view.follow.mode !== 'face') throw new Error('pas de gros plan : ' + JSON.stringify(r.view));
        if (!r.jumping) throw new Error('Philippe ne saute pas');
        if (!r.laugh) throw new Error('Mélanie ne rit pas');
      });
    }
    await check(`${q.label} : révélation identique sur les téléphones et le projecteur`, async () => {
      for (const [p, id] of [[A, 'pA'], [B, 'pB']]) {
        await wait(host, id => __host.players()[id]?.last?.key && __host.S.phase === 'reveal', id);
        const last = await host.evaluate(id => __host.players()[id].last, id);
        try { await wait(p, ({ ok, pts }) => { const t = document.getElementById('big').innerText; return t.includes(ok ? 'Bien joué' : 'Raté') && (!pts || t.includes(`+${pts} pts`)); }, last, 20000); }
        catch (e) { throw new Error(`${id} attend ${JSON.stringify(last)}, affiche « ${(await p.evaluate(() => document.getElementById('big').innerText + ' | ' + document.getElementById('m').innerText)).replace(/\s+/g, ' ').slice(0, 160)} »`); }
        if (id === 'pA' && q.type !== 'fusion' && !(last.ok && last.pts > 0)) throw new Error('bonne réponse non récompensée : ' + JSON.stringify(last));
        if (id === 'pB' && !bothGood && q.type !== 'fusion' && q.type !== 'line' && last.ok) throw new Error('mauvaise réponse comptée juste');
      }
    });
    first = false;
  }
  await check('chaque type d’activité a été joué (coins, debout-assis, ligne, course, fusion)', async () => {
    const miss = ['corners', 'standsit', 'line', 'race', 'fusion'].filter(t => !seen[t]);
    if (miss.length) throw new Error('jamais joué : ' + miss.join(', '));
  });
  await check('résultat final : rang et points des téléphones = ceux du projecteur', async () => {
    await wait(host, () => __host.cur().k === 'final');
    for (const [p, id] of [[A, 'pA'], [B, 'pB']]) {
      const sc = await host.evaluate(id => __host.players()[id].score || 0, id);
      await wait(p, sc => new RegExp(`sur 2 · ${sc} points`).test(document.getElementById('m').innerText), sc, 15000);
    }
    const [a, b] = await host.evaluate(() => [__host.players().pA.score, __host.players().pB.score]);
    if (!(a > b)) throw new Error(`Alice (toujours juste) devrait devancer Bruno : ${a} contre ${b}`);
  });
  await spoke(host);
  const said = await host.evaluate(() => __host.said().filter(x => x.w !== 'N').map(x => [x.w, x.t]));
  await check('Philippe dit « Tabarouette » au moins 3 fois et jamais « tabarnak »', async () => {
    const n = said.filter(([w, t]) => w === 'P' && /Tabarouette/.test(t)).length;
    if (n < 3) throw new Error(`${n} fois seulement`);
    if (said.some(([, t]) => /tabarnak/i.test(t))) throw new Error('tabarnak encore présent');
  });
  await check('Philippe dit « vilains étudiants » au moins 2 fois', async () => {
    const n = said.filter(([w]) => w === 'P').reduce((s, [, t]) => s + (t.match(/vilains étudiants/g) || []).length, 0);
    if (n < 2) throw new Error(`${n} fois seulement`);
  });
  await check('Philippe dit une fois « CréH, arrête d’utiliser Claude »', async () => {
    const n = said.filter(([w, t]) => w === 'P' && /CréH, arrête d’utiliser Claude/.test(t)).length;
    if (n !== 1) throw new Error(`${n} fois`);
  });
  await check('Mélanie rit aux blagues de Philippe (plusieurs fois)', async () => {
    const n = said.filter(([w, t]) => w === 'M' && /^Ha\b/.test(t)).length;
    if (n < 3) throw new Error(`${n} rires seulement`);
  });
  await check('aucune réplique des profs n’est répétée pendant la partie', async () => {
    const seenL = new Set(), dup = [];
    for (const [w, t] of said) { const k = w + '|' + t; if (seenL.has(k)) dup.push(t.slice(0, 50)); seenL.add(k); }
    if (dup.length) throw new Error('répétées : ' + dup.join(' / '));
    if (said.length < 25) throw new Error(`seulement ${said.length} répliques entendues`);
  });
  await check('aucune erreur JavaScript', async () => { if (errors.length) throw new Error(errors.slice(0, 5).join(' | ')); });
  await finish();
} catch (e) { await finish(e); }
