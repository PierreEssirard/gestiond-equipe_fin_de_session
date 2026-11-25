"""Construit les avatars de Philippe (joe) et Mélanie (louise) : visage photo, tenue, cheveux, bijoux.
À lancer depuis tools/profs : photos dans photos/, modèles d'origine dans src/, géométrie de repos extraite par geo.py,
textures d'origine extraites des glb ; LITE=1 pour la version téléphone."""
import json, subprocess, numpy as np
from PIL import Image
import face
from dress import *
from hairgen import *
A = '../../assets/'
S = 2048

def head_bones(g): return {k: np.array(v).reshape(4, 4).T for k, v in g['bones'].items()}
def pack(P, N, I, M, UV=None):
    d = {'pos': to_local(P, M).ravel().tolist(), 'nrm': nrm_local(N, M).ravel().tolist(), 'idx': I.astype(int).ravel().tolist()}
    if UV is not None: d['uv'] = UV.ravel().tolist()
    return d

# ---------------- Philippe ----------------
face.run(json.load(open('cfg_joe.json')))
g = geo('joe_geo.json'); tex = load('out/joe_diffuse.png')
tex = recolor(tex, uvmask(mesh(g, '_Suit'), S), (38, 40, 46), .9)                 # veste anthracite
tex = recolor(tex, uvmask(mesh(g, '_Pants'), S), (48, 50, 56), .55)               # pantalon sombre
sm = uvmask(mesh(g, '_Shirt'), S); shirt = srgb2lin(pattern(S, (24, 25, 34), [(92, 74, 116), (120, 116, 132), (62, 48, 84), (150, 146, 160)], density=.09, r=(1.2, 3)))
L = srgb2lin(tex) @ lumw; rel = (L / (L[sm].mean() + 1e-6)) ** .6
t = srgb2lin(tex); t[sm] = (shirt * rel[..., None])[sm]; tex = lin2srgb(np.clip(t, 0, 1))        # chemise sombre à motifs
tex = iris(tex, (760, 0, 1120, 200), (118, 104, 62))                              # yeux noisette-vert
save(tex, 'out/joe_final.png')
hair = load('joe_hd_Ch33_1002_Diffuse.png'); hm = uvmask(mesh(g, '_Hair'), S, grow=6) & ~uvmask(mesh(g, '_Eyelashes'), S, grow=2)
hair = hair_recolor(hair, hm, (16, 14, 12), (38, 33, 29), (78, 71, 66), grey=(150, 148, 145), grey_amt=.33)   # brun foncé poivre et sel
save(hair, 'out/joe_hair.png')
json.dump({'images': {'Ch33_1001_Diffuse': 'out/joe_final.png', 'Ch33_1001_Normal': 'out/joe_normal.png', 'Ch33_1002_Diffuse': 'out/joe_hair.png'},
           'hide': ['Ch33_Tie'], 'boneScale': {'Head': [.93, 1.03, .97]}}, open('spec_joe.json', 'w'))

# ---------------- Mélanie ----------------
face.run(json.load(open('cfg_lou.json')))
g = geo('louise_geo.json'); B = head_bones(g); tex = load('out/lou_diffuse.png')
tex = recolor(tex, uvmask(mesh(g, '_Suit'), S), (234, 232, 226), .75)            # chemisier blanc
tex = recolor(tex, uvmask(mesh(g, '_Shirt'), S), (243, 242, 238), .6)
tex = iris(tex, (680, 0, 1040, 220), (112, 86, 52))                               # yeux noisette
Ph, Nh, Uh, Th = face.load_head('louise_geo.json'); pos_h, _, cov_h = face.raster(Ph, Nh, Uh, Th, S); Wf = np.load('out/lou_diffuse.png.w.npy')
scalp = cov_h & ((tex @ lumw) < .2) & (Wf < .02) & (pos_h[..., 1] > 1.6); tex[scalp] = np.array([186, 148, 98]) / 255 * (.8 + .35 * np.random.default_rng(2).random((scalp.sum(), 1)))   # cuir chevelu blond sous les mèches
save(tex, 'out/lou_final.png')
UVBOX = (.315, .507, .459, .995)
import os
HAIR = {'ncard': 60, 'nrow': 36, 'layers': ((0.0, 0.0), (.006, .45))} if os.environ.get('LITE') != '1' else {'ncard': 40, 'nrow': 26, 'layers': ((0.0, 0.0),)}
hair = load('louise_hd_Ch07_1002_Diffuse.png')
box = np.zeros((S, S), bool); box[int(UVBOX[1] * S) - 4:int(UVBOX[3] * S) + 4, int(UVBOX[0] * S) - 4:int(UVBOX[2] * S) + 4] = True
hm = (uvmask(mesh(g, '_Hair'), S, grow=6) | box) & ~uvmask(mesh(g, '_Eyelashes'), S, grow=2)
hair = hair_recolor(hair, hm, (118, 84, 50), (186, 146, 96), (240, 216, 168))   # blond miel, mèches claires
save(hair, 'out/lou_hair.png')
body = mesh(g, '_Body'); P = np.array(body['pos']).reshape(-1, 3); hw = np.array(body['headW'])
cap = np.array(mesh(g, '_Hair')['pos']).reshape(-1, 3)
Vh = P[hw > .9]; sk = P[(hw > .9) & (P[:, 1] > 1.6)]
C = np.array([0, 1.635, (sk[:, 2].min() + sk[:, 2].max()) / 2]); print('centre du crâne', np.round(C, 3))
CUT_DF = [0, .5, 1.0, 1.28, 1.6, 1.78]; CUT_AL = [.74, .70, .46, .22, .02, -1.6]
def open_alpha(th, al):   # 0 = visage dégagé, 1 = cheveux ; transition douce (contour naturel avec la transparence des mèches)
    df = np.pi - abs(th); cut = np.interp(df, CUT_DF, CUT_AL)
    return float(np.clip((al - cut) / .05, 0, 1))
def y_end(th): return 1.43 + .045 * min(1, abs(th) / (np.pi / 2)) ** 1.5
hp, hn, huv, hi, ha = long_hair(Vh, C, UVBOX, tilt=-.9, al_top=np.pi / 2 - .07, ncard=HAIR['ncard'], nrow=HAIR['nrow'], layers=HAIR['layers'], open_alpha=open_alpha, y_end=y_end, off=lambda al: .009 + .006 * (1 - max(al, 0) / (np.pi / 2)))
print('cheveux :', len(hp), 'sommets', len(hi), 'triangles')
# perles d'oreilles : sous le lobe de chaque oreille
ear = P[(hw > .9) & (np.abs(P[:, 0]) > .07) & (P[:, 1] > 1.56) & (P[:, 1] < 1.64) & (P[:, 2] > -.04) & (P[:, 2] < .06)]
pearls = []
for sgn in (-1, 1):
    e = ear[np.sign(ear[:, 0]) == sgn]; lobe = e[e[:, 1].argmin()]
    pearls.append(sphere(lobe + np.array([sgn * .003, -.0045, .004]), .0048))
ep, en, ei = merge(pearls)
# collier : grosses perles argent et nacre autour du cou, plus bas devant
neck = P[(P[:, 1] > 1.44) & (P[:, 1] < 1.5) & (np.abs(P[:, 0]) < .09)]
zc = (neck[:, 2].min() + neck[:, 2].max()) / 2; beads_s, beads_p = [], []
for k in range(34):
    t = 2 * np.pi * k / 34; fr = (1 + np.cos(t)) / 2                       # fr = 1 devant
    c = np.array([.078 * np.sin(t), 1.492 - .04 * fr ** 1.6, zc + .07 * np.cos(t) + .012 * fr])
    (beads_p if k % 3 == 1 else beads_s).append(sphere(c, .0056 if k % 3 == 1 else .0062, 8, 10))
sp, sn, si = merge(beads_s); pp_, pn, pi_ = merge(beads_p)
Mh, Ms = B['Head'], B['Spine2']
spec = {'images': {'Ch07_1001_Diffuse': 'out/lou_final.png', 'Ch07_1001_Normal': 'out/lou_normal.png', 'Ch07_1002_Diffuse': 'out/lou_hair.png'},
        'attach': [
            {'bone': 'Head', 'name': 'Ch07_LongHair', 'mesh': {**pack(hp, hn, hi, Mh, huv), 'col': np.c_[np.ones((len(ha), 3)), ha].ravel().tolist()}, 'material': {'name': 'Ch07_hair_long', 'texRef': 'Ch07_1002_Diffuse', 'rough': .55, 'alphaTest': .4, 'double': True}},
            {'bone': 'Head', 'name': 'acc_earrings', 'mesh': pack(ep, en, ei, Mh), 'material': {'name': 'acc_pearl', 'color': [.93, .91, .86, 1], 'rough': .22}},
            {'bone': 'Spine2', 'name': 'acc_necklace_silver', 'mesh': pack(sp, sn, si, Ms), 'material': {'name': 'acc_silver', 'color': [.78, .78, .8, 1], 'rough': .28, 'metal': .9}},
            {'bone': 'Spine2', 'name': 'acc_necklace_pearl', 'mesh': pack(pp_, pn, pi_, Ms), 'material': {'name': 'acc_pearl', 'color': [.93, .91, .86, 1], 'rough': .22}}],
        'hide': ['Ch07_Hair'], 'boneScale': {'Head': [.95, 1.03, .97]}}
json.dump(spec, open('spec_lou.json', 'w'))
LITE = os.environ.get('LITE') == '1'
for who, src in (('joe', 'joe_hd'), ('lou', 'louise_hd')):
    if LITE:   # téléphones : textures 1024 px, cheveux plus légers
        sp = json.load(open(f'spec_{who}.json')); sp['maxTex'] = 1024; json.dump(sp, open(f'spec_{who}.json', 'w'))
    subprocess.run(['node', 'inject.mjs', f'src/{src}.glb', f'out/{who}_{"m" if LITE else "hd"}.glb', f'spec_{who}.json'], cwd='.', check=True)
