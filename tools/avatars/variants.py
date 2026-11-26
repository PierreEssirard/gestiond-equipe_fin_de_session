"""Variantes de tenue, de peau et de cheveux des avatars étudiants (textures seulement : même maillage, même shader).

Chaque variante recolore la texture d'origine du personnage, vêtement par vêtement : les plis, coutures et
motifs sont conservés (on garde le relief de luminance, on change la teinte). Les zones de chaque vêtement
viennent des triangles du maillage (îlots UV), donc aucune bavure d'un vêtement sur l'autre.

Utilisation (depuis la racine du dépôt) :
  node tools/avatars/dump_uv.mjs assets/s_ben.glb /tmp/av/s_ben/uv.json      (pour chaque modèle s_*)
  python3 tools/avatars/variants.py /tmp/av                                  (écrit assets/var/*.webp)
Les textures d'origine sont lues directement dans les .glb (tools/avatars/dump_uv.mjs les extrait aussi). """
import json, sys, os, glob, math
import numpy as np, cv2
from PIL import Image, ImageDraw

S = 1024
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'var')

# couleurs de tissus réalistes (sRGB)
C = {
    'bordeaux': '#5e2230', 'vert_foret': '#2e4536', 'gris_chine': '#7d8085', 'moutarde': '#97793a', 'blanc': '#e6e4df',
    'noir': '#1c1d20', 'marine': '#232c3f', 'jean': '#3a5476', 'beige': '#b8a382', 'gris_fonce': '#4b4e53', 'kaki': '#6e6a4f',
    'terracotta': '#93503c', 'ciel': '#8eb1d4', 'lilas': '#8f86ad', 'rouge': '#9a2f2f', 'camel': '#90704c', 'olive': '#59593a',
    'creme': '#d9cdb5', 'bleu_roi': '#2f4f8f', 'rose_pale': '#d6a7ae', 'vert_sauge': '#8a9a7e', 'jean_clair': '#6d88aa',
}
# cheveux : [L, a, b] cibles (Lab) et contraste des mèches
HAIR = {'chatain': (34, 9, 20, 2.2, 22), 'blond_fonce': (52, 7, 26, 2.6, 22), 'brun': (19, 6, 11, .55, 9), 'auburn': (32, 22, 26, 2.0, 22), 'noir': (9, 1, 2, 1.0, 8)}   # L, a, b, contraste des mèches, éclaircissement max
SKIN = {'hale': (.83, -2, 1.05, 1.0, 1.15, 3), 'brune': (.64, -3, 1.0, 2.0, 1.1, 4.5)}

# vêtements de chaque modèle : nœuds du maillage (ou îlots UV classés par couleur pour Ben, d'un seul tenant)
PARTS = {
    's_ben': {'haut': 'isl:shirt', 'bas': 'isl:pants'},
    's_leonard': {'haut': 'Sweater', 'bas': 'Pants', 'peau': 'Body'},
    's_kate': {'haut': 'Shirt', 'bas': 'Pants', 'peau': 'Body'},
    's_jody': {'haut': 'Shirt', 'bas': 'Pants', 'peau': 'Body'},
    's_megan': {'haut': 'Shirt', 'bas': 'Pants', 'peau': 'Body'},
    's_suzie': {'haut': 'Coat', 'bas': 'Pants', 'peau': 'Body'},
}
# variantes : modèle, haut, bas, peau, cheveux
VARIANTS = {
    'ben_a': ('s_ben', 'bordeaux', 'jean', None, None),
    'ben_b': ('s_ben', 'gris_chine', 'noir', None, None),
    'ben_c': ('s_ben', 'blanc', 'beige', None, None),
    'ben_d': ('s_ben', 'marine', 'kaki', None, None),
    'leo_a': ('s_leonard', 'vert_foret', 'jean', None, 'chatain'),
    'leo_b': ('s_leonard', 'moutarde', 'gris_fonce', 'hale', None),
    'leo_c': ('s_leonard', 'bordeaux', 'beige', None, 'blond_fonce'),
    'leo_d': ('s_leonard', 'gris_chine', 'noir', 'brune', None),
    'leo_e': ('s_leonard', 'bleu_roi', 'kaki', None, 'chatain'),
    'kate_a': ('s_kate', 'bordeaux', 'noir', None, 'brun'),
    'kate_b': ('s_kate', 'blanc', 'jean', 'hale', None),
    'jody_a': ('s_jody', 'ciel', 'noir', None, None),
    'jody_b': ('s_jody', 'gris_chine', 'marine', 'brune', None),
    'megan_a': ('s_megan', 'noir', None, None, 'auburn'),
    'megan_b': ('s_megan', 'terracotta', 'beige', None, None),
    'suzie_a': ('s_suzie', 'camel', 'noir', None, None),
    'suzie_b': ('s_suzie', 'marine', 'gris_chine', None, None),
}

def hex2lab(h):
    rgb = np.array([[[int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]]], np.float32)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)[0, 0]

def raster(o, sel=None):
    uv = np.array(o['uv']).reshape(-1, 2); idx = np.array(o['idx']).reshape(-1, 3)
    im = Image.new('L', (S, S), 0); d = ImageDraw.Draw(im)
    for t, (a, b, c) in enumerate(idx):
        if sel is not None and not sel[t]: continue
        d.polygon([(uv[i, 0] * S, uv[i, 1] * S) for i in (a, b, c)], fill=255)
    return np.array(im) > 0

def islands_by_colour(o, tex, kind):
    """Ben : un seul maillage pour tout le corps ; on classe chaque îlot UV par sa couleur moyenne."""
    uv = np.array(o['uv']).reshape(-1, 2); idx = np.array(o['idx']).reshape(-1, 3)
    par = np.arange(len(uv))
    def f(x):
        while par[x] != x: par[x] = par[par[x]]; x = par[x]
        return x
    for a, b, c in idx:
        ra = f(a); par[f(b)] = ra; par[f(c)] = ra
    isl = np.array([f(i) for i in idx[:, 0]])
    cu = uv[idx].mean(1); px = tex[np.clip((cu[:, 1] * S).astype(int), 0, S - 1), np.clip((cu[:, 0] * S).astype(int), 0, S - 1)]
    sel = np.zeros(len(idx), bool)
    for k in np.unique(isl):
        m = isl == k; c = px[m].mean(0); mx, mn = c.max(), c.min(); l = (mx + mn) / 2; s = (mx - mn) / (1 - abs(2 * l - 1) + 1e-6)
        h = (math.degrees(math.atan2(math.sqrt(3) * (c[1] - c[2]), 2 * c[0] - c[1] - c[2])) + 360) % 360
        if kind == 'shirt' and 160 < h < 210 and l > .35: sel |= m
        if kind == 'pants' and 35 < h < 95 and .09 < l < .26 and s < .25: sel |= m
    return raster(o, sel)

def soft(mask, occupied, grow=8):
    """Déborde dans la marge de l'atlas (évite un liseré de l'ancienne couleur au loin), jamais sur un autre îlot."""
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1))
    d = cv2.dilate(mask.astype(np.uint8), k) > 0
    d &= ~(occupied & ~mask)
    return cv2.GaussianBlur(d.astype(np.float32), (0, 0), 1.2)

def recolour(lab, w, target, chroma_keep=.3, detail=1.0, cap=22):
    m = w > .5
    if m.sum() < 50: return lab
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    Lm, Am, Bm = np.median(L[m]), np.median(A[m]), np.median(B[m])
    tL, tA, tB = target
    s = detail * float(np.clip(((tL + 12) / (Lm + 12)) ** .55, .7, 2.4))
    out = lab.copy()
    out[..., 0] = np.clip(tL + np.clip((L - Lm) * s, -35, cap), 0, 100)
    f = np.clip((np.maximum(out[..., 0], 1) / max(tL, 1)) ** .5, .7, 1.2)    # zones plus claires (revers, côtes) : même teinte, pas blanchie
    out[..., 1] = tA * f + (A - Am) * chroma_keep
    out[..., 2] = tB * f + (B - Bm) * chroma_keep
    return lab * (1 - w[..., None]) + out * w[..., None]

def skin_tone(lab, w, p):
    kL, dL, ka, da, kb, db = p
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    chroma = np.hypot(A, B); hue = np.degrees(np.arctan2(B, A))
    like = np.clip((chroma - 6) / 6, 0, 1) * np.clip((hue - 10) / 10, 0, 1) * np.clip((85 - hue) / 10, 0, 1) * np.clip((L - 12) / 8, 0, 1) * np.clip((92 - L) / 8, 0, 1)
    like = cv2.GaussianBlur(like.astype(np.float32), (0, 0), 1.5) * w
    out = lab.copy(); out[..., 0] = L * kL + dL; out[..., 1] = A * ka + da; out[..., 2] = B * kb + db
    return lab * (1 - like[..., None]) + out * like[..., None]

def to_lab(rgb): return cv2.cvtColor(rgb.astype(np.float32) / 255, cv2.COLOR_RGB2LAB)
def to_rgb(lab): return np.clip(cv2.cvtColor(lab.astype(np.float32), cv2.COLOR_LAB2RGB) * 255 + .5, 0, 255).astype(np.uint8)

def save(rgb, name, alpha=None):
    os.makedirs(OUT, exist_ok=True)
    im = Image.fromarray(rgb)
    if alpha is not None: im = Image.merge('RGBA', (*im.split(), Image.fromarray(alpha)))
    im.save(os.path.join(OUT, name + '.webp'), quality=84, method=6)
    im.resize((S // 2, S // 2), Image.LANCZOS).save(os.path.join(OUT, name + '_m.webp'), quality=82, method=6)   # téléphones

def main(work):
    masks = {}
    for model, parts in PARTS.items():
        data = json.load(open(f'{work}/{model}/uv.json'))
        tex = np.array(Image.open(glob.glob(f'{work}/{model}/*1001_Diffuse.webp')[0]).convert('RGB')).astype(np.float32) / 255
        body = [o for o in data if 'hair' not in (o['mat'] or '').lower()]
        occupied = np.zeros((S, S), bool); per = {}
        for o in body:
            r = raster(o); occupied |= r; per[o['node'].split('_')[-1]] = (o, r)
        mm = {}
        for p, src in parts.items():
            if src.startswith('isl:'): r = islands_by_colour(body[0], tex, src[4:])
            else: r = per[src][1]
            mm[p] = soft(r, occupied, 2 if p == 'peau' else 8)
            print(f'{model} {p}: {r.mean() * 100:.1f} % de la texture')
        masks[model] = mm
    for name, (model, top, bot, skin, hair) in VARIANTS.items():
        src = glob.glob(f'{work}/{model}/*1001_Diffuse.webp')[0]
        lab = to_lab(np.array(Image.open(src).convert('RGB')))
        if top: lab = recolour(lab, masks[model]['haut'], hex2lab(C[top]))
        if bot: lab = recolour(lab, masks[model]['bas'], hex2lab(C[bot]))
        if skin: lab = skin_tone(lab, masks[model]['peau'], SKIN[skin])
        save(to_rgb(lab), name)
        if hair and not os.path.exists(os.path.join(OUT, hair_name(model, hair) + '.webp')):
            hs = glob.glob(f'{work}/{model}/*1002_Diffuse.webp')
            if hs:
                im = np.array(Image.open(hs[0]).convert('RGBA')); a = im[..., 3]
                hl = to_lab(im[..., :3]); tL, tA, tB, det, cap = HAIR[hair]
                w = (a > 20).astype(np.float32)
                hl = recolour(hl, w, (tL, tA, tB), chroma_keep=.25, detail=det, cap=cap)
                save(to_rgb(hl), hair_name(model, hair), a)
        print('variante', name)
    json.dump({k: {'model': v[0], **({'hair': hair_name(v[0], v[4])} if v[4] else {})} for k, v in VARIANTS.items()},
              open(os.path.join(OUT, 'variants.json'), 'w'), indent=1)

def hair_name(model, colour): return f'{model[2:]}_cheveux_{colour}'   # partagé entre variantes (téléchargé une fois)

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '/tmp/av')
