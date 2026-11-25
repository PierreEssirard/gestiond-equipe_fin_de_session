/* Textes parlés du jeu, partagés entre l'écran (index.html) et le script
   de génération ElevenLabs (tools/generer-voix.mjs).
   Chaque réplique a une clé stable (qui + texte) qui donne le nom du fichier audio. */

export function keyFor(who, text) {
  let h = 2166136261;
  for (const c of who + '|' + text) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return who + '_' + (h >>> 0).toString(16).padStart(8, '0');
}

/* Texte envoyé à la synthèse (sans guillemets typographiques, montants lisibles). */
export const spoken = t => t.replace(/[«»]/g, '').replace(/(\d+(?:,\d+)?) ?G\$/g, '$1 milliards de dollars')
  .replace(/CréH/g, 'Cré-ache')                                         // prénom : « cré » puis la lettre H
  .replace(/\bYOUHOU(U*)/g, (m, u) => 'Youhou' + 'u'.repeat(u.length))  // un cri, pas des lettres épelées
  .replace(/\s+/g, ' ').trim();

export const NARR = {
  welcome: 'Bienvenue dans Choc des cultures. Scannez le code à l’écran avec votre téléphone pour rejoindre la partie.',
  intro: (i, a) => `Activité ${i + 1} : ${a.name}. ${a.rule}`,
  question: (a, q) => (a.type === 'standsit' ? 'Vrai ou faux ? ' : '') + q.q,
  reveal: (a, q, corners) => a.type === 'line' ? `Le score était de ${q.val}.` : a.type === 'standsit' ? `C’était ${q.ok ? 'vrai' : 'faux'}.` : a.type === 'fusion' ? null : `Bonne réponse : ${corners[q.ok].l}, ${q.opts[q.ok]}.`,
  fusion: ok => ok ? 'Fusion réussie !' : 'Fusion ratée…',
  final: (w, teams) => w < 0 ? 'Égalité parfaite ! La fusion est réussie.' : teams[w].name + ' remporte la partie !'
};

/* Toutes les répliques possibles : [{ who, text }]. who = N (narrateur), M, P, k (Klaus), mi (Mike). */
export function allLines(GAME, LINES) {
  const out = [], add = (who, text) => { if (text) out.push({ who, text }); };
  const pairs = arr => arr.forEach(([w, t]) => add(w, t));
  add('N', NARR.welcome);
  GAME.acts.forEach((a, i) => {
    add('N', NARR.intro(i, a));
    a.qs.forEach(q => {
      add('N', NARR.question(a, q));
      add('N', NARR.reveal(a, q, GAME.corners));
      (q.scene || []).forEach(([w, t]) => add(w === 'k' ? 'k' : 'mi', t));
    });
  });
  add('N', NARR.fusion(true)); add('N', NARR.fusion(false));
  [-1, 0, 1].forEach(w => add('N', NARR.final(w, GAME.teams)));
  pairs(LINES.lobby);
  Object.values(LINES.intro).forEach(pairs);
  ['lobbyMore', 'waiting', 'great', 'mid', 'bad', 'none'].forEach(k => (LINES[k] || []).forEach(pairs));
  ['claude', 'waitFusion', 'youhou', 'raceWin', 'fusionOk', 'fusionKo', 'final'].forEach(k => pairs(LINES[k] || []));
  const seen = new Set();
  return out.filter(l => { const k = keyFor(l.who, l.text); if (seen.has(k)) return false; seen.add(k); return true; });
}
