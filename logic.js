/* Règles du jeu sans affichage : partagées par le projecteur (index.html) et le téléphone (player.html),
   et testées automatiquement (npm test). */

/* Identifiant unique de partie : chaque partie a ses propres clés de réponses,
   donc une réponse d'une partie précédente (même code de salle) ne compte jamais. */
export const newGameId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
export const answerKey = (gid, step) => `${gid}_s${step}`;

/* Joueurs inscrits (avec un prénom). */
export const isLive = p => !!(p && p.name);
export const liveIds = players => Object.entries(players || {}).filter(([, p]) => isLive(p)).map(([id]) => id);

/* Nombre de réponses venant de joueurs présents dans la partie. */
export function countAnswered(answers, players) {
  return Object.keys(answers || {}).filter(id => isLive((players || {})[id])).length;
}
/* La question se ferme toute seule quand tous les joueurs présents ont répondu. */
export function allAnswered(answers, players) {
  const n = liveIds(players).length;
  return n > 0 && countAnswered(answers, players) >= n;
}

/* Mémoire locale du téléphone : ne garde que les réponses de la partie en cours. */
export function pruneSent(sent, gid) {
  const o = {};
  if (!gid) return o;
  for (const [k, v] of Object.entries(sent || {})) if (k.startsWith(gid + '_')) o[k] = v;
  return o;
}

/* Ce que le téléphone doit afficher. */
export function phoneMode(state, sent, me) {
  if (!me || !me.name) return 'join';
  const s = state;
  if (!s || s.kind === 'lobby') return 'lobby';
  if (s.kind === 'intro') return 'intro';
  if (s.kind === 'final') return 'final';
  if (s.phase === 'scene') return 'scene';
  if (s.phase === 'reveal') return 'reveal';
  if (sent && sent[s.key] !== undefined) return 'sent';
  if (s.phase === 'closed') return 'closed';
  if (s.phase === 'open') return 'open';
  return 'wait';
}

/* Points d'une question.
   ans : [{pid, v, t}] trié par temps de réponse ; teamOf(pid) -> 0 | 1 */
export function scoreRound(type, q, ans, teamOf) {
  const pts = {}, okSet = new Set(); let extra = {};
  const isOk = x => type === 'line' ? Math.abs(+x.v - q.val) <= 10 : x.v === q.ok;
  ans.forEach(x => { if (isOk(x)) okSet.add(x.pid); });
  if (type === 'line') ans.forEach(x => pts[x.pid] = Math.max(0, Math.round(150 - 3 * Math.abs(+x.v - q.val))));
  else if (type === 'fusion') {
    const maj = t => { const c = [0, 0, 0, 0]; ans.filter(x => teamOf(x.pid) === t).forEach(x => c[x.v]++); const m = Math.max(...c); return m ? c.indexOf(m) : -1; };
    const m0 = maj(0), m1 = maj(1), success = m0 === q.ok && m1 === q.ok;
    extra = { m0, m1, success };
    ans.forEach(x => pts[x.pid] = success ? 150 : (x.v === q.ok ? 50 : 0));
  } else {
    const good = ans.filter(x => okSet.has(x.pid));
    good.forEach((x, i) => pts[x.pid] = 100 + Math.round(50 * (1 - i / Math.max(1, good.length))));
    if (type === 'race') {
      const firsts = [0, 1].map(t => good.find(x => teamOf(x.pid) === t)).filter(Boolean);
      firsts.forEach(x => pts[x.pid] += 50); extra.firsts = firsts.map(x => x.pid);
    }
  }
  return { pts, okSet, extra };
}

/* ---------- placements identiques sur le projecteur et les téléphones ----------
   Au lieu de positions au hasard, chaque position dépend du joueur et de la question :
   tout le monde voit la même scène. */
export const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
export const rand = seed => (hash(seed) % 100000) / 100000;
/* point dans un disque autour d'une zone (coins) */
export function zoneSpot(zone, pid, key, r = .8) {
  const a = rand(pid + key + 'a') * Math.PI * 2, d = Math.sqrt(rand(pid + key + 'd')) * r;
  return { x: zone.x + Math.cos(a) * d, z: zone.z + Math.sin(a) * d, face: rand(pid + key + 'f') * Math.PI * 2 };
}
/* place sur la ligne 0-100 */
export function lineSpot(v, pid, key, lineX, LINE_Z) {
  return { x: lineX(+v) + (rand(pid + key + 'x') - .5) * .3, z: LINE_Z - .35 + rand(pid + key + 'z') * .7, face: Math.PI };
}
/* attroupement devant le tableau (fusion) */
export function crowdSpot(pid, key) {
  return { x: -3.5 + rand(pid + key + 'cx') * 7, z: -3.4 - rand(pid + key + 'cz') * 1.2, face: 0, delay: rand(pid + key + 'cd') * 1.5 };
}
/* alignement final : chaque équipe de son côté, ordre stable (par identifiant) */
export function finalSpots(list) {
  const out = {}, k = [0, 0];
  [...list].sort((a, b) => a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : 0).forEach(({ pid, team }) => {
    const t = team ? 1 : 0, i = k[t]++;
    out[pid] = { x: (t ? 1 : -1) * (1 + (i % 6) * .6), z: -2.9 - Math.floor(i / 6) * .55, face: 0 };
  });
  return out;
}
/* gagnant final d'après la moyenne de points par joueur (-1 = égalité) */
export function winner(players) {
  const s = [0, 1].map(t => { const L = Object.values(players || {}).filter(p => isLive(p) && (p.team ? 1 : 0) === t); return L.length ? Math.round(L.reduce((x, p) => x + (p.score || 0), 0) / L.length) : 0; });
  return { avg: s, w: s[0] === s[1] ? -1 : s[0] > s[1] ? 0 : 1 };
}
