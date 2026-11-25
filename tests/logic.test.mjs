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

import { packPerson, unpackPerson, sampleSnaps, makeClock, GAP } from '../logic.js';
test('instantanés : encodage compact sans perte utile', () => {
  const p = { x: 1.234, z: -4.567, yaw: 7, sitting: true, walking: false, react: 'cheer', talk: true, hidden: false };
  const q = unpackPerson(packPerson(p));
  assert.equal(q.x, 1.23); assert.equal(q.z, -4.57); assert.ok(Math.abs(Math.sin(q.yaw) - Math.sin(7)) < .01);
  assert.equal(q.sitting, true); assert.equal(q.react, 'cheer'); assert.equal(q.talk, true); assert.equal(q.hidden, false);
  assert.ok(packPerson({ x: 0, z: 0, yaw: 0 }).every(Number.isFinite));
});
test('instantanés : interpolation fluide entre deux positions', () => {
  const P = (x, z, o = {}) => packPerson({ x, z, yaw: 0, ...o });
  const buf = [{ t: 1000, a: { a: P(0, 0) } }, { t: 1200, a: { a: P(1, 0, { walking: true }) } }, { t: 1400, a: { a: P(2, 0) } }];
  assert.equal(sampleSnaps(buf, 900).a.x, 0);              // avant : premier état
  assert.equal(sampleSnaps(buf, 1100).a.x, .5);            // au milieu
  assert.ok(sampleSnaps(buf, 1100).a.walking);
  assert.equal(sampleSnaps(buf, 1300).a.x, 1.5);
  assert.equal(sampleSnaps(buf, 5000).a.x, 2);             // après : dernier état, à l'arrêt
  assert.equal(sampleSnaps(buf, 5000).a.walking, false);
  assert.deepEqual(sampleSnaps([], 1000), {});
});
test('instantanés : après une longue pause, le départ n’est pas étiré', () => {
  const P = x => packPerson({ x, z: 0, yaw: 0 });
  const buf = [{ t: 0, a: { a: P(0) } }, { t: 10000, a: { a: P(.3) } }];
  assert.equal(sampleSnaps(buf, 5000).a.x, 0);              // immobile jusqu'à 300 ms avant
  assert.equal(sampleSnaps(buf, 10000 - GAP / 2).a.x, .15);
});
test('instantanés : projecteur lent pendant une marche = mouvement continu, sans saccade', () => {
  const P = (x, w) => packPerson({ x, z: 0, yaw: 0, walking: w });
  const buf = [{ t: 0, a: { a: P(0, true) } }, { t: 1000, a: { a: P(1.3, true) } }];
  assert.equal(sampleSnaps(buf, 500).a.x, .65);
});
test('instantanés : téléportation et personnages qui arrivent ou partent', () => {
  const P = x => packPerson({ x, z: 0, yaw: 0 });
  const buf = [{ t: 0, a: { a: P(0), gone: P(1) } }, { t: 200, a: { a: P(6), b: P(2) } }];
  assert.equal(sampleSnaps(buf, 100).a.x, 0);               // 6 m en 200 ms : pas de glissade
  assert.equal(sampleSnaps(buf, 200).a.x, 6);
  assert.equal(sampleSnaps(buf, 100).b.x, 2);               // nouveau : apparaît directement
  assert.equal(sampleSnaps(buf, 100).gone, undefined);      // parti : retiré
});
test('horloge : latence minimale et redémarrage du projecteur', () => {
  const c = makeClock();
  assert.equal(c.toHost(5000), null);
  c.sample(1000, 5300, 'x'); c.sample(1200, 5450, 'x'); c.sample(1400, 5800, 'x');
  assert.equal(c.offset, 4250); assert.equal(c.toHost(6250), 2000);
  assert.equal(c.sample(1600, 5900, 'x'), false);
  assert.equal(c.sample(50, 6000, 'y'), true);              // nouveau projecteur : on repart de zéro
  assert.equal(c.offset, 5950);
});

import { freeSpot, floorOk } from '../logic.js';
test('placement : 30 joueurs dans le même coin, sans chevauchement ni meuble', () => {
  for (const Z of [{ x: -6.5, z: -4.7 }, { x: 6.5, z: -4.7 }, { x: -6.5, z: 5.3 }, { x: 6.5, z: 5.3 }]) {
    const taken = [{ x: -2.7, z: -5.3 }, { x: .5, z: -5.4 }];
    for (let i = 0; i < 30; i++) taken.push(freeSpot(Z, taken));
    for (let i = 0; i < taken.length; i++) for (let j = i + 1; j < taken.length; j++) assert.ok(Math.hypot(taken[i].x - taken[j].x, taken[i].z - taken[j].z) >= .61, 'chevauchement');
    taken.slice(2).forEach(p => assert.ok(floorOk(p), 'dans un meuble ou un mur : ' + JSON.stringify(p)));
    assert.ok(Math.hypot(taken[2].x - Z.x, taken[2].z - Z.z) < .01, 'le premier arrivé est au centre du coin');
  }
});
test('placement : sur la ligne, on s’écarte vers l’avant ou l’arrière plutôt que de changer de valeur', () => {
  const taken = [], T = { x: 0, z: 5.55 };
  for (let i = 0; i < 3; i++) taken.push(freeSpot(T, taken, { wx: 3 }));
  assert.ok(taken.slice(0, 2).every(p => Math.abs(p.x) < .35), JSON.stringify(taken)); // deux rangées dans le couloir du fond
  assert.ok(Math.abs(taken[2].x) < .75, JSON.stringify(taken));                      // la troisième juste à côté
});
test('placement : obstacles', () => {
  assert.equal(floorOk({ x: 0, z: 0 }), false);       // tables
  assert.equal(floorOk({ x: -4.4, z: -4.9 }), false); // bureau du prof
  assert.equal(floorOk({ x: 9, z: 0 }), false);       // hors salle
  assert.equal(floorOk({ x: 0, z: -4.5 }), true);     // devant le tableau
});

/* ---------- voix ---------- */
import { allLines, keyFor } from '../voices.js';
import { ELEVEN } from '../config.js';
import { sampleSnaps as sample2, packPerson as pack2 } from '../logic.js';

test('voix : chaque réplique a une voix ElevenLabs et une clé unique', () => {
  const L = allLines(GAME, LINES), keys = new Map();
  for (const l of L) {
    assert.ok(ELEVEN.voices[l.who], 'voix manquante pour ' + l.who);
    const k = keyFor(l.who, l.text);
    if (keys.has(k)) assert.equal(keys.get(k), l.text, 'deux répliques différentes avec la même clé : ' + k);
    keys.set(k, l.text);
  }
  assert.ok(L.length > 60);
});

test('instantanés : un même tampon donne toujours le même résultat (cache de décodage sans effet de bord)', () => {
  const p = (x, z, w) => pack2({ x, z, yaw: 0, walking: w });
  const buf = [{ t: 0, a: { a: p(0, 0, false), b: p(1, 1, false) } }, { t: 200, a: { a: p(1, 0, true), b: p(1, 1, false) } }, { t: 400, a: { a: p(2, 0, true) } }];
  const r1 = sample2(buf, 300), r2 = sample2(buf, 300);
  assert.deepEqual(r1, r2);
  r1.a.x = 99; r1.b && (r1.b.x = 99);                 // modifier un résultat ne doit pas toucher les suivants
  assert.deepEqual(sample2(buf, 300), r2);
  assert.deepEqual(Object.keys(buf[0]), ['t', 'a']);  // le cache n'apparaît pas dans l'instantané (envoi réseau, comparaison)
  assert.equal(sample2(buf, 500).b, undefined);       // personnage parti : plus affiché
});
