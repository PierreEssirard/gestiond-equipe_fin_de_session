"""Construit prenoms.js : genre le plus probable d'un prénom (pour choisir un avatar homme ou femme).

Source : INSEE, Fichier des prénoms (naissances en France depuis 1900), Licence Ouverte / Etalab.
  Fichier national « nat2021.csv » (sexe;preusuel;annais;nombre), par ex. depuis
  https://www.insee.fr/fr/statistiques/2540004 (ou le dépôt GitHub ThinkR-open/prenoms, data-raw/nat2021.csv).

Utilisation : python3 tools/prenoms/build.py chemin/vers/nat2021.csv   (écrit prenoms.js à la racine du dépôt)

Règles :
  - naissances depuis 1955 (âge des étudiants et des profs), prénoms donnés au moins 30 fois ;
  - « m » ou « f » si au moins 70 % des personnes portant ce prénom sont de ce sexe, sinon prénom mixte (rien) ;
  - pour un prénom inconnu : la terminaison la plus longue qui est nettement masculine ou féminine dans les données ;
  - quelques prénoms courants au Québec absents ou rares en France sont ajoutés à la main (SUPPL). """
import csv, sys, re, unicodedata, json, os
from collections import defaultdict

def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z-]', '', s).strip('-')

SUPPL = {
    'm': 'pier pierluc pier-luc pier-olivier pier-alexandre pier-marc jean-sebastien louis-philippe marc-antoine charles-antoine '
         'jean-christophe jean-michel jean-felix samuel-olivier zachary zackary zack xavier-alexandre william-james '
         'carl-eric jean-simon jean-nicolas pierre-nicolas pierre-louis mathys loic alexis-olivier',
    'f': 'marie-pier marie-soleil marie-eve marie-michele marie-philippe marie-andree marie-josee marie-claude marie-christine '
         'marie-helene marie-laurence marie-maude marie-noelle marie-pierre audrey-anne ann-sophie anne-marie marilou maika '
         'alexe arianne meganne laurie-anne sarah-maude kelly-ann mary-lee mya maeva emy noemi'
}

def main(path, out):
    M = defaultdict(int); F = defaultdict(int)
    with open(path, encoding='utf-8') as f:
        r = csv.reader(f, delimiter=';'); next(r)
        for sexe, pre, an, nb in r:
            if pre.startswith('_') or not an.isdigit() or int(an) < 1955: continue
            k = norm(pre)
            if k: (M if sexe == '1' else F)[k] += int(nb)
    g = {}
    for k in set(M) | set(F):
        n = M[k] + F[k]
        if n < 30: continue
        p = M[k] / n
        if p >= .7: g[k] = 'm'
        elif p <= .3: g[k] = 'f'
        else: g[k] = 'x'                                   # mixte : l'avatar est demandé au joueur
    for s, names in SUPPL.items():
        for k in names.split(): g[norm(k)] = s
    # terminaisons nettement marquées (au moins 300 naissances, 90 % d'un sexe), de la plus longue à la plus courte
    suf = {}
    for L in (4, 3, 2):
        cnt = defaultdict(lambda: [0, 0])
        for k in set(M) | set(F):
            base = k.split('-')[-1]
            if len(base) <= L: continue
            c = cnt[base[-L:]]; c[0] += M[k]; c[1] += F[k]
        for s, (m, f) in cnt.items():
            n = m + f
            if n >= 300 and (m / n >= .9 or f / n >= .9): suf[s] = 'm' if m > f else 'f'
    # on ne garde une terminaison que si elle apporte quelque chose par rapport à sa terminaison plus courte
    keep = {s: v for s, v in suf.items() if not (len(s) > 2 and suf.get(s[1:]) == v)}
    lists = {v: ','.join(sorted(k for k, x in g.items() if x == v)) for v in 'mfx'}
    sufs = {v: ','.join(sorted(s for s, x in keep.items() if x == v)) for v in 'mf'}
    js = f"""/* Genre le plus probable d'un prénom, pour choisir un avatar homme ou femme.
   Généré par tools/prenoms/build.py à partir du Fichier des prénoms de l'INSEE (Licence Ouverte / Etalab),
   naissances depuis 1955 ; plus quelques prénoms courants au Québec. Ne pas modifier à la main. */
const L = {json.dumps(lists, ensure_ascii=True)};
const SUF = {json.dumps(sufs, ensure_ascii=True)};
let T = null, S = null;
const table = () => {{ if (!T) {{ T = new Map(); for (const g of 'mfx') for (const k of L[g].split(',')) T.set(k, g); S = new Map(); for (const g of 'mf') for (const k of SUF[g].split(',')) if (k) S.set(k, g); }} return T; }};
export const normPrenom = s => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z\\s-]/g, ' ').trim().split(/\\s+/)[0].replace(/^-+|-+$/g, '') || '';
/* « m », « f », ou null (prénom mixte ou inconnu : on demande au joueur) */
export function genreDuPrenom(nom) {{
  const k = normPrenom(nom); if (k.length < 2) return null;
  const t = table(), look = w => t.get(w);
  let g = look(k);
  if (!g && k.includes('-')) {{ const p = k.split('-').filter(Boolean); g = look(p[0]) || look(p.join('')); if (!g || g === 'x') g = look(p[p.length - 1]) || g; }}
  if (g) return g === 'x' ? null : g;
  const b = k.split('-').pop();
  for (let n = Math.min(4, b.length - 1); n >= 2; n--) {{ const s = S.get(b.slice(-n)); if (s) return s; }}
  return null;
}}
"""
    open(out, 'w', encoding='utf-8').write(js)
    print(f"{len(g)} prénoms ({sum(v=='m' for v in g.values())} m, {sum(v=='f' for v in g.values())} f, {sum(v=='x' for v in g.values())} mixtes), {len(keep)} terminaisons → {out} ({os.path.getsize(out)//1024} Ko)")

if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    main(sys.argv[1], os.path.join(root, 'prenoms.js'))
