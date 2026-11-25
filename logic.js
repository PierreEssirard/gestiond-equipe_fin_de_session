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

/* ---------- synchronisation : instantanés publiés par le projecteur ----------
   Le projecteur est la seule source de vérité. Il publie l'état de chaque personnage
   (position, orientation, posture) ; les téléphones l'affichent avec un léger retard
   en interpolant entre deux instantanés : mouvement fluide et identique partout. */
export const BIT = { sit: 1, walk: 2, cheer: 4, sad: 8, talk: 16, hidden: 32 };
export function packPerson(p) {
  const b = (p.sitting ? BIT.sit : 0) | (p.walking ? BIT.walk : 0) | (p.react === 'cheer' ? BIT.cheer : 0) | (p.react === 'sad' ? BIT.sad : 0) | (p.talk ? BIT.talk : 0) | (p.hidden ? BIT.hidden : 0);
  const yaw = Math.atan2(Math.sin(p.yaw || 0), Math.cos(p.yaw || 0));
  return [Math.round(p.x * 100), Math.round(p.z * 100), Math.round(yaw * 100), b];
}
export function unpackPerson(v) {
  const [x, z, y, b] = v;
  return { x: x / 100, z: z / 100, yaw: y / 100, sitting: !!(b & BIT.sit), walking: !!(b & BIT.walk), react: b & BIT.cheer ? 'cheer' : b & BIT.sad ? 'sad' : null, talk: !!(b & BIT.talk), hidden: !!(b & BIT.hidden) };
}
const angLerp = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };
/* État de chaque personnage à l'instant rt (temps du projecteur).
   buf : instantanés {t, a:{id:[...]}} triés par t croissant. */
export const GAP = 300;     // un mouvement ne démarre jamais plus de 300 ms avant l'instantané qui le montre
export const TELEPORT = 3;  // au-delà de 3 m entre deux instantanés : déplacement instantané
/* chaque instantané n'est décodé qu'une fois (appelé à chaque image sur le téléphone : pas de travail répété) */
const dec = (s, id) => { const u = s.u || Object.defineProperty(s, 'u', { value: {}, enumerable: false }).u; return u[id] || (u[id] = unpackPerson(s.a[id])); };
export function sampleSnaps(buf, rt) {
  const out = {};
  if (!buf || !buf.length) return out;
  const hold = s => { for (const id in s.a || {}) out[id] = { ...dec(s, id), v: 0 }; return out; };
  if (rt <= buf[0].t) return hold(buf[0]);
  let i = buf.length - 1;
  while (i > 0 && buf[i].t > rt) i--;
  if (i === buf.length - 1) return hold(buf[i]);
  const s0 = buf[i], s1 = buf[i + 1];
  for (const id in s1.a || {}) {
    const p1 = dec(s1, id);
    if (!s0.a || !s0.a[id]) { out[id] = { ...p1, v: 0 }; continue; }
    const p0 = dec(s0, id), dist = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    /* immobile avant : le mouvement a commencé juste avant s1 (pas d'étirement) ;
       déjà en marche : le projecteur a simplement publié moins souvent, on interpole sur tout l'intervalle */
    const t0 = p0.walking ? s0.t : Math.max(s0.t, s1.t - GAP), span = Math.max(1, s1.t - t0), k = Math.min(1, Math.max(0, (rt - t0) / span));
    if (dist > TELEPORT) { out[id] = { ...(k < 1 ? p0 : p1), v: 0 }; continue; }
    const base = k >= 1 ? p1 : p0;
    out[id] = { ...base, x: p0.x + (p1.x - p0.x) * k, z: p0.z + (p1.z - p0.z) * k, yaw: angLerp(p0.yaw, p1.yaw, k),
      walking: k >= 1 ? p1.walking : (p0.walking || p1.walking), v: k >= 1 ? 0 : dist / (span / 1000) };
  }
  return out;
}
/* Horloge : convertit le temps du projecteur en temps local (latence minimale observée). */
export function makeClock() {
  let off = null, sid = null, lastT = -Infinity;
  return {
    /* renvoie true si le projecteur a redémarré (le tampon doit être vidé) */
    sample(hostT, localT, hostSid) {
      let reset = false;
      if (hostSid !== sid || hostT < lastT - 1) { off = null; reset = sid !== null || lastT > -Infinity; sid = hostSid; }
      lastT = hostT;
      const o = localT - hostT; off = off === null ? o : Math.min(off, o);
      return reset;
    },
    toHost: localT => off === null ? null : localT - off,
    get offset() { return off; }
  };
}

/* ---------- placement sans chevauchement ----------
   Le projecteur attribue à chaque joueur la place libre la plus proche de sa cible
   (coin, valeur sur la ligne, devant le tableau), à au moins `gap` mètres des autres
   et hors des meubles. Résultat déterministe : même ordre d'arrivée = mêmes places. */
const OBST = [
  { x0: -5.6, x1: -3.2, z0: -5.65, z1: -4.2 },            // bureau du prof
  { x0: -6.35, x1: 6.35, z0: -3.3, z1: 4.6 }              // tables et chaises
];
const ROUND = [{ x: -7.4, z: 6.0, r: .6 }, { x: 7.4, z: -6.0, r: .6 }, { x: -7.4, z: -6.0, r: .6 }, { x: 7.6, z: .2, r: .5 }];
export function floorOk(p) {
  if (p.x < -7.55 || p.x > 7.55 || p.z < -6.15 || p.z > 6.15) return false;
  if (OBST.some(o => p.x > o.x0 && p.x < o.x1 && p.z > o.z0 && p.z < o.z1)) return false;
  return !ROUND.some(o => Math.hypot(p.x - o.x, p.z - o.z) < o.r);
}
let CAND = null;
function candidates() {
  if (CAND) return CAND;
  CAND = [{ dx: 0, dz: 0 }];
  for (let r = .3; r <= 9; r += .3) { const n = Math.max(6, Math.round(2 * Math.PI * r / .3)); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; CAND.push({ dx: Math.cos(a) * r, dz: Math.sin(a) * r }); } }
  return CAND;
}
export function freeSpot(target, taken, { gap = .62, wx = 1, wz = 1, ok = floorOk } = {}) {
  const C = candidates().map(c => ({ x: target.x + c.dx, z: target.z + c.dz, d: Math.hypot(c.dx * wx, c.dz * wz) })).sort((a, b) => a.d - b.d);
  for (const c of C) if (ok(c) && taken.every(t => Math.hypot(t.x - c.x, t.z - c.z) >= gap)) return { x: Math.round(c.x * 100) / 100, z: Math.round(c.z * 100) / 100 };
  return { x: target.x, z: target.z };
}
