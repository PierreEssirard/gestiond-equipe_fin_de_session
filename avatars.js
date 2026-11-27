/* Avatars des joueurs : un personnage 3D et une tenue, homme ou femme selon le prénom (ou le choix du joueur).
   Les tenues sont des variantes de texture des mêmes personnages (tools/avatars/variants.py) : même maillage,
   même shader, donc aucune recompilation quand un joueur arrive. Partagé par le projecteur et les téléphones. */
import { genreDuPrenom } from './prenoms.js?v=24';
import { hash } from './logic.js?v=24';

/* clé → [modèle, texture du corps (assets/var), texture des cheveux] ; sans texture : tenue d'origine.
   Les hommes ne portent jamais la tenue d'origine de Ben et Leonard : ce sont Mike et Klaus dans la scène. */
export const LOOK = {
  ben_a: ['s_ben', 'ben_a'], ben_b: ['s_ben', 'ben_b'], ben_c: ['s_ben', 'ben_c'], ben_d: ['s_ben', 'ben_d'],
  leo_a: ['s_leonard', 'leo_a', 'leonard_cheveux_chatain'], leo_b: ['s_leonard', 'leo_b'], leo_c: ['s_leonard', 'leo_c', 'leonard_cheveux_blond_fonce'],
  leo_d: ['s_leonard', 'leo_d'], leo_e: ['s_leonard', 'leo_e', 'leonard_cheveux_chatain'],
  kate: ['s_kate'], kate_a: ['s_kate', 'kate_a', 'kate_cheveux_brun'], kate_b: ['s_kate', 'kate_b'],
  jody: ['s_jody'], jody_a: ['s_jody', 'jody_a'], jody_b: ['s_jody', 'jody_b'],
  megan: ['s_megan'], megan_a: ['s_megan', 'megan_a', 'megan_cheveux_auburn'], megan_b: ['s_megan', 'megan_b'],
  suzie: ['s_suzie'], suzie_a: ['s_suzie', 'suzie_a'], suzie_b: ['s_suzie', 'suzie_b']
};
export const POOL = {
  m: ['ben_a', 'leo_a', 'ben_b', 'leo_b', 'ben_c', 'leo_c', 'ben_d', 'leo_d', 'leo_e'],
  f: ['kate', 'jody', 'megan', 'suzie', 'kate_a', 'jody_a', 'megan_a', 'suzie_a', 'kate_b', 'jody_b', 'megan_b', 'suzie_b']
};
POOL.x = [...POOL.m, ...POOL.f];

/* genre retenu : celui choisi sur le téléphone, sinon celui du prénom, sinon inconnu (« x ») */
export const genreDe = p => (p && (p.g === 'm' || p.g === 'f')) ? p.g : (genreDuPrenom(p && p.name) || 'x');

/* tenue la moins portée dans la classe (pas de jumeaux tant que c'est possible), départagée par l'identifiant */
export function choisirTenue(pid, g, prises = []) {
  const pool = POOL[g] || POOL.x, n = new Map(pool.map(k => [k, 0]));
  prises.forEach(k => { if (n.has(k)) n.set(k, n.get(k) + 1); });
  const min = Math.min(...n.values()), libres = pool.filter(k => n.get(k) === min);
  return libres[hash(pid + '|' + g) % libres.length];
}

/* description pour scene.js : { model, variant, hair } (+ taille un peu différente d'une personne à l'autre) */
export function tenue(key, pid) {
  const [model, variant, hair] = LOOK[key] || LOOK[POOL.x[hash(String(pid)) % POOL.x.length]];
  return { model, variant, hair, key, scale: 0.97 + (hash(String(pid) + 'h') % 7) / 100 };
}
