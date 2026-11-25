// Partie complète jouée depuis deux téléphones, en touchant les vrais boutons, pour chaque type d'activité
// (coins, vrai/faux debout-assis, ligne 0-100, course après la scène, fusion) : réponses reçues, révélation,
// points identiques sur le téléphone et le projecteur, résultat final cohérent.
// Lancer : npm run e2e:jeu
import { check, wait, page, errors, finish, join } from './harness.mjs';

const hs = h => h.evaluate(() => ({ k: __host.cur().k, phase: __host.S.phase, step: __host.S.step }));

try {
  console.log('Partie complète depuis les téléphones');
  const host = await page('index.html?r=JEU', 1280, 720, 'projecteur');
  await wait(host, () => window.__host && __host.S);
  await host.evaluate(() => { __host.S.sound = false; });
  const A = await page('player.html?r=JEU&pid=pA', 390, 780, 'téléphone A');
  const B = await page('player.html?r=JEU&pid=pB', 390, 780, 'téléphone B');
  for (const [p, n] of [[A, 'Alice'], [B, 'Bruno']]) await join(p, n);
  await wait(host, () => Object.values(__host.players()).filter(p => p.name).length === 2);
  for (const p of [A, B]) await wait(p, () => window.__phone && document.body.classList.contains('s3d') && __phone.R.room, null, 240000);

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

  for (let i = 0; i < 80; i++) {
    const s = await hs(host);
    if (s.k === 'final') break;
    if (s.k !== 'q') { await host.evaluate(() => __host.next()); await host.waitForTimeout(250); continue; }
    if (s.phase === 'scene') { await wait(host, () => __host.S.phase !== 'scene', null, 90000); continue; }
    if (s.phase === 'reveal') { await host.evaluate(() => __host.next()); await host.waitForTimeout(250); continue; }
    if (s.phase === 'closed') { await host.evaluate(() => __host.next()); continue; }
    // question ouverte
    const q = await host.evaluate(() => { const st = __host.cur(); return { ...__host.q(), type: __host.act().type, label: `${__host.act().type} ${st.qi + 1}` }; });
    seen[q.type] = (seen[q.type] || 0) + 1;
    await host.evaluate(() => { if (__host.S.timer) __host.S.timer.left = 120; });   // machine de test lente : le chrono ne doit pas fermer la question
    await check(`${q.label} : les deux téléphones répondent avec les boutons`, async () => {
      await answer(A, q, true); await answer(B, q, false);
      await wait(host, () => ['pA', 'pB'].every(id => __host.answers()[id]) && __host.S.phase === 'closed', null, 20000);
    });
    await host.evaluate(() => __host.next());
    await check(`${q.label} : révélation identique sur les téléphones et le projecteur`, async () => {
      for (const [p, id] of [[A, 'pA'], [B, 'pB']]) {
        await wait(host, id => __host.players()[id]?.last?.key && __host.S.phase === 'reveal', id);
        const last = await host.evaluate(id => __host.players()[id].last, id);
        try { await wait(p, ({ ok, pts }) => { const t = document.getElementById('big').innerText; return t.includes(ok ? 'Bien joué' : 'Raté') && (!pts || t.includes(`+${pts} pts`)); }, last, 20000); }
        catch (e) { throw new Error(`${id} attend ${JSON.stringify(last)}, affiche « ${(await p.evaluate(() => document.getElementById('big').innerText + ' | ' + document.getElementById('m').innerText)).replace(/\s+/g, ' ').slice(0, 160)} »`); }
        if (id === 'pA' && q.type !== 'fusion' && !(last.ok && last.pts > 0)) throw new Error('bonne réponse non récompensée : ' + JSON.stringify(last));
        if (id === 'pB' && q.type !== 'fusion' && q.type !== 'line' && last.ok) throw new Error('mauvaise réponse comptée juste');
      }
    });
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
  await check('aucune erreur JavaScript', async () => { if (errors.length) throw new Error(errors.slice(0, 5).join(' | ')); });
  await finish();
} catch (e) { await finish(e); }
