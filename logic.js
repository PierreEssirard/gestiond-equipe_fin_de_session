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
