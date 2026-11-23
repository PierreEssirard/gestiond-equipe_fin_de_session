// Tests rapides des règles du jeu (aucun navigateur) : node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGameId, answerKey, countAnswered, allAnswered, pruneSent, phoneMode, scoreRound, zoneSpot, lineSpot, crowdSpot, finalSpots, winner } from '../logic.js';
import { GAME, LINES, PROFS } from '../config.js';

const P = { a: { name: 'Ana', team: 0 }, b: { name: 'Ben', team: 1 }, ghost: { score: 3 } };

test('chaque partie a des clés de réponses différentes', () => {
  const g1 = newGameId(), g2 = newGameId();
  assert.notEqual(g1, g2);
  assert.notEqual(answerKey(g1, 3), answerKey(g2, 3));
  assert.match(answerKey(g1, 3), /^[a-z0-9]+_s3$/); // clé valide pour Firebase
});

test('régression : une réponse d’une partie précédente ne ferme pas la question', () => {
  // ancienne partie : tout le monde avait répondu à la question 3
  const old = answerKey('ancienne', 3), now = answerKey('nouvelle', 3);
  const db = { [old]: { a: { v: 1 }, b: { v: 2 } } };
  assert.equal(allAnswered(db[now] || {}, P), false);
  // le téléphone oublie ses anciennes réponses et montre les boutons
  const sent = pruneSent({ [old]: 1 }, 'nouvelle');
  assert.deepEqual(sent, {});
  assert.equal(phoneMode({ kind: 'q', phase: 'open', key: now }, sent, P.a), 'open');
});

test('la question se ferme seulement quand tous les joueurs présents ont répondu', () => {
  assert.equal(allAnswered({}, {}), false);
  assert.equal(allAnswered({ a: { v: 1 } }, P), false);
  assert.equal(allAnswered({ a: { v: 1 }, intrus: { v: 2 } }, P), false); // réponse d'un joueur absent : ignorée
  assert.equal(countAnswered({ a: { v: 1 }, intrus: { v: 2 } }, P), 1);
  assert.equal(allAnswered({ a: { v: 1 }, b: { v: 0 } }, P), true);
});

test('pruneSent garde les réponses de la partie en cours', () => {
  assert.deepEqual(pruneSent({ g1_s3: 1, g2_s3: 0, g1_s4: true }, 'g1'), { g1_s3: 1, g1_s4: true });
  assert.deepEqual(pruneSent({ g1_s3: 1 }, undefined), {});
});

test('affichage du téléphone selon l’état', () => {
  const me = P.a, k = 'g_s3';
  assert.equal(phoneMode(null, {}, null), 'join');
  assert.equal(phoneMode(null, {}, me), 'lobby');
  assert.equal(phoneMode({ kind: 'intro' }, {}, me), 'intro');
  assert.equal(phoneMode({ kind: 'q', phase: 'scene', key: k }, {}, me), 'scene');
  assert.equal(phoneMode({ kind: 'q', phase: 'open', key: k }, {}, me), 'open');
  assert.equal(phoneMode({ kind: 'q', phase: 'open', key: k }, { [k]: 2 }, me), 'sent');
  assert.equal(phoneMode({ kind: 'q', phase: 'open', key: k }, { [k]: false }, me), 'sent'); // « Faux » est une vraie réponse
  assert.equal(phoneMode({ kind: 'q', phase: 'closed', key: k }, {}, me), 'closed');
  assert.equal(phoneMode({ kind: 'q', phase: 'reveal', key: k }, {}, me), 'reveal');
  assert.equal(phoneMode({ kind: 'final' }, {}, me), 'final');
});

const team = id => (P[id] || { team: id.startsWith('b') ? 1 : 0 }).team;
test('points : bonne réponse + bonus de rapidité', () => {
  const r = scoreRound('corners', { ok: 1 }, [{ pid: 'a', v: 1, t: 1 }, { pid: 'b', v: 1, t: 2 }, { pid: 'c', v: 0, t: 3 }], team);
  assert.equal(r.pts.a, 150); assert.equal(r.pts.b, 125); assert.equal(r.pts.c, undefined);
  assert.ok(r.okSet.has('a') && !r.okSet.has('c'));
});
test('points : vrai / faux accepte false comme bonne réponse', () => {
  const r = scoreRound('standsit', { ok: false }, [{ pid: 'a', v: false, t: 1 }, { pid: 'b', v: true, t: 2 }], team);
  assert.ok(r.okSet.has('a')); assert.ok(!r.okSet.has('b'));
});
test('points : ligne (plus on est proche, plus on gagne)', () => {
  const r = scoreRound('line', { val: 80 }, [{ pid: 'a', v: 80 }, { pid: 'b', v: 70 }, { pid: 'c', v: 10 }], team);
  assert.equal(r.pts.a, 150); assert.equal(r.pts.b, 120); assert.equal(r.pts.c, 0);
  assert.ok(r.okSet.has('b') && !r.okSet.has('c'));
});
test('points : course, +50 au premier juste de chaque équipe', () => {
  const r = scoreRound('race', { ok: 2 }, [{ pid: 'a', v: 2, t: 1 }, { pid: 'b', v: 2, t: 2 }, { pid: 'a2', v: 2, t: 3 }], team);
  assert.deepEqual(r.extra.firsts, ['a', 'b']);
  assert.equal(r.pts.a, 200);
});
test('points : fusion réussie seulement si les deux équipes convergent', () => {
  const ok = scoreRound('fusion', { ok: 1 }, [{ pid: 'a', v: 1 }, { pid: 'b', v: 1 }], team);
  assert.equal(ok.extra.success, true); assert.equal(ok.pts.a, 150);
  const ko = scoreRound('fusion', { ok: 1 }, [{ pid: 'a', v: 1 }, { pid: 'b', v: 3 }], team);
  assert.equal(ko.extra.success, false); assert.equal(ko.pts.a, 50); assert.equal(ko.pts.b, 0);
});

test('configuration : questions cohérentes', () => {
  assert.equal(GAME.teams.length, 2);
  assert.equal(GAME.corners.length, 4);
  for (const a of GAME.acts) {
    assert.ok(['corners', 'line', 'standsit', 'race', 'fusion'].includes(a.type), a.type);
    assert.ok(a.name && a.rule, 'activité sans nom ou consigne');
    assert.ok(a.qs.length > 0);
    for (const q of a.qs) {
      assert.ok(q.q && q.q.length > 5, 'question vide');
      assert.ok(q.t >= 5, 'temps trop court');
      if (a.type === 'line') assert.ok(q.val >= 0 && q.val <= 100, 'valeur de ligne hors 0-100');
      else if (a.type === 'standsit') assert.equal(typeof q.ok, 'boolean');
      else { assert.equal(q.opts.length, 4); assert.ok(Number.isInteger(q.ok) && q.ok >= 0 && q.ok < 4, 'bonne réponse hors A-D'); }
      if (a.type === 'race') assert.ok(Array.isArray(q.scene) && q.scene.length > 0, 'course sans scène');
    }
  }
});
test('répliques : profs connus et « Tabarnak » rare', () => {
  const all = JSON.stringify(LINES);
  for (const m of all.matchAll(/\["(\w+)",/g)) assert.ok(PROFS[m[1]] || ['N', 'k', 'mi'].includes(m[1]), 'locuteur inconnu ' + m[1]);
  assert.ok((all.match(/tabarnak/gi) || []).length <= 3, 'trop de Tabarnak');
  assert.ok((all.match(/vilains/gi) || []).length <= 3, 'trop de « vilains étudiants »');
});

test('placements identiques sur tous les écrans (déterministes)', () => {
  const Z = { x: 6.5, z: 5.3 };
  assert.deepEqual(zoneSpot(Z, 'pA', 'g_s3'), zoneSpot(Z, 'pA', 'g_s3'));
  assert.notDeepEqual(zoneSpot(Z, 'pA', 'g_s3'), zoneSpot(Z, 'pB', 'g_s3'));
  const z = zoneSpot(Z, 'pA', 'g_s3'); assert.ok(Math.hypot(z.x - Z.x, z.z - Z.z) <= .8 + 1e-9);
  assert.deepEqual(lineSpot(40, 'pA', 'k', v => 5 - v / 10, 5.55), lineSpot(40, 'pA', 'k', v => 5 - v / 10, 5.55));
  assert.deepEqual(crowdSpot('pA', 'k'), crowdSpot('pA', 'k'));
  const L = [{ pid: 'b', team: 1 }, { pid: 'a', team: 0 }, { pid: 'c', team: 0 }];
  assert.deepEqual(finalSpots(L), finalSpots([...L].reverse())); // l'ordre d'arrivée ne change rien
  assert.ok(finalSpots(L).a.x < 0 && finalSpots(L).b.x > 0);
});
test('gagnant final', () => {
  assert.equal(winner({ a: { name: 'a', team: 0, score: 300 }, b: { name: 'b', team: 1, score: 100 } }).w, 0);
  assert.equal(winner({ a: { name: 'a', team: 0, score: 100 }, b: { name: 'b', team: 1, score: 100 } }).w, -1);
});
