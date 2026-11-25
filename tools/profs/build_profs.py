"""Construit les avatars de Philippe (joe) et Mélanie (louise) : visage photo, tenue, cheveux, bijoux."""
import json, subprocess, numpy as np
from PIL import Image
import face
from dress import *
from hairgen import *
A = '/home/claude/gestiond-equipe_fin_de_session/assets/'
S = 2048

def head_bones(g): return {k: np.array(v).reshape(4, 4).T for k, v in g['bones'].items()}
def pack(P, N, I, M, UV=None):
    d = {'pos': to_local(P, M).ravel().tolist(), 'nrm': nrm_local(N, M).ravel().tolist(), 'idx': I.astype(int).ravel().tolist()}
    if UV is not None: d['uv'] = UV.ravel().tolist()
    return d

# ---------------- Philippe ----------------
face.run(json.load(open('cfg_joe.json')))
g = geo('joe_geo_m.json'); tex = load('out/joe_diffuse.png')
tex = recolor(tex, uvmask(mesh(g, '_Suit'), S), (38, 40, 46), .9)                 # veste anthracite
tex = recolor(tex, uvmask(mesh(g, '_Pants'), S), (48, 50, 56), .55)               # pantalon sombre
sm = uvmask(mesh(g, '_Shirt'), S); shirt = srgb2lin(pattern(S, (24, 25, 34), [(92, 74, 116), (120, 116, 132), (62, 48, 84), (150, 146, 160)], density=.09, r=(1.2, 3)))
L = srgb2lin(tex) @ lumw; rel = (L / (L[sm].mean() + 1e-6)) ** .6
t = srgb2lin(tex); t[sm] = (shirt * rel[..., None])[sm]; tex = lin2srgb(np.clip(t, 0, 1))        # chemise sombre à motifs
tex = iris(tex, (760, 0, 1120, 200), (118, 104, 62))                              # yeux noisette-vert
Pj, Nj, Uj, Tj = face.load_head('joe_geo_m.json'); posj, _, covj = face.raster(Pj, Nj, Uj, Tj, S); Wj = np.load('out/joe_diffuse.png.w.npy')
fore = covj & (Wj > .8) & (posj[..., 1] > 1.665) & (posj[..., 1] < 1.69); skin = tex[fore].mean(0) if fore.any() else np.array([.69, .54, .46])
ax_ = np.abs(posj[..., 0]); temple = covj & (posj[..., 2] > .02) & (ax_ > .02) & (ax_ < .085) & (posj[..., 1] > 1.675) & (posj[..., 1] < 1.76)
dark = np.clip((.3 - tex @ lumw) / .2, 0, 1) * temple      # cuir chevelu foncé dans le golfe des tempes : remplacé par la peau du front
tex = tex * (1 - dark[..., None]) + skin[None, None, :] * (.92 + .08 * np.random.default_rng(4).random((S, S, 1))) * dark[..., None]
save(tex, 'out/joe_final.png')
hair = load('joe_hd_Ch33_1002_Diffuse.png'); hm = uvmask(mesh(g, '_Hair'), S, grow=6) & ~uvmask(mesh(g, '_Eyelashes'), S, grow=2)
hair = hair_recolor(hair, hm, (36, 32, 29), (88, 82, 77), (170, 166, 160), grey=(178, 176, 172), grey_amt=.45)   # poivre et sel clair : le sommet est foncé par les couleurs de sommets
save(hair, 'out/joe_hair.png')
# couleur par sommet : sommet du crâne brun foncé, tempes et nuque grises (comme sur la photo)
hm_ = mesh(g, '_Hair'); HP = np.array(hm_['pos']).reshape(-1, 3); HI = np.array(hm_['idx']).reshape(-1, 3)
ss = lambda a, b, x: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))
greyk = np.maximum(ss(.042, .072, np.abs(HP[:, 0])) * (1 - ss(1.70, 1.745, HP[:, 1])), ss(-.02, -.075, HP[:, 2]) * (1 - ss(1.66, 1.71, HP[:, 1])) * .8)
mult = .34 + (1 - .34) * greyk
hair_vc = np.c_[mult * 1.0, mult * .97, mult * .95, np.ones(len(HP))]
# golfe des tempes (front dégarni sur les côtés) : on retire les mèches de devant dans les coins
cen = HP[HI].mean(1); ax = np.abs(cen[:, 0])
recede = (cen[:, 2] > .035) & (ax > .026) & (ax < .078) & (cen[:, 1] > 1.685) & (cen[:, 1] < 1.70 + (ax - .026) * 1.05)
hair_keep = np.arange(len(HI)); print('mèches retirées aux tempes :', int(recede.sum()), 'triangles')
json.dump({'images': {'Ch33_1001_Diffuse': '../out/joe_final.png', 'Ch33_1001_Normal': '../out/joe_normal.png', 'Ch33_1002_Diffuse': '../out/joe_hair.png'},
           'hide': ['Ch33_Tie'], 'vcolor': {'Ch33_Hair': hair_vc.ravel().tolist()}, 'cut': {'Ch33_Hair': hair_keep.tolist()}, 'boneScale': {'Head': [1.04, .96, 1.0]}}, open('spec_joe.json', 'w'))

# ---------------- Mélanie ----------------
face.run(json.load(open('cfg_lou.json')))
g = geo('louise_geo_m.json'); B = head_bones(g); tex = load('out/lou_diffuse.png')
tex = recolor(tex, uvmask(mesh(g, '_Suit'), S), (234, 232, 226), .75)            # chemisier blanc
tex = recolor(tex, uvmask(mesh(g, '_Shirt'), S), (243, 242, 238), .6)
tex = iris(tex, (680, 0, 1040, 220), (112, 86, 52))                               # yeux noisette
Ph, Nh, Uh, Th = face.load_head('louise_geo_m.json'); pos_h, _, cov_h = face.raster(Ph, Nh, Uh, Th, S); Wf = np.load('out/lou_diffuse.png.w.npy')
scalp = cov_h & ((tex @ lumw) < .2) & (Wf < .02) & (pos_h[..., 1] > 1.6)
UVBOX = (.315, .507, .459, .995)
import os
HAIR = {'ncard': 60, 'nrow': 36, 'layers': ((0.0, 0.0), (.006, .45))} if os.environ.get('LITE') != '1' else {'ncard': 40, 'nrow': 26, 'layers': ((0.0, 0.0),)}
hair = load('louise_hd_Ch07_1002_Diffuse.png')
box = np.zeros((S, S), bool); box[int(UVBOX[1] * S) - 4:int(UVBOX[3] * S) + 4, int(UVBOX[0] * S) - 4:int(UVBOX[2] * S) + 4] = True
hm = (uvmask(mesh(g, '_Hair'), S, grow=6) | box) & ~uvmask(mesh(g, '_Eyelashes'), S, grow=2)
hair = hair_recolor(hair, hm, (92, 68, 44), (166, 132, 92), (228, 203, 162))   # blond miel, mèches plus foncées dessous (comme sur la photo)
save(hair, 'out/lou_hair.png')
body = mesh(g, '_Body'); P = np.array(body['pos']).reshape(-1, 3); hw = np.array(body['headW'])
cap = np.array(mesh(g, '_Hair')['pos']).reshape(-1, 3)
Vh = P[hw > .9]; sk = P[(hw > .9) & (P[:, 1] > 1.6)]
C = np.array([0, 1.635, (sk[:, 2].min() + sk[:, 2].max()) / 2]); print('centre du crâne', np.round(C, 3))
TILT, SIDE = -.9, -.22
# cuir chevelu : on y peint des mèches qui partent de la raie (pas de zone unie visible entre les cartes de cheveux)
def paint_scalp(tex, P3, mask, k=9):
    d = P3[mask] - C; d /= np.linalg.norm(d, axis=1, keepdims=True)
    cs, sn = np.cos(SIDE), np.sin(SIDE); e = np.c_[cs * d[:, 0] + sn * d[:, 1], -sn * d[:, 0] + cs * d[:, 1], d[:, 2]]
    ct, st = np.cos(TILT), np.sin(TILT); xl, yl, zl = e[:, 0], ct * e[:, 1] - st * e[:, 2], st * e[:, 1] + ct * e[:, 2]
    th = np.arctan2(xl, -zl); al = np.arcsin(np.clip(yl, -1, 1)); u0, v0, u1, v1 = UVBOX
    uu = u0 + (u1 - u0) * (.05 + .45 * ((th / (2 * np.pi) * k) % 1)); vv = v0 + (v1 - v0) * .55 * np.clip((np.pi / 2 - al) / (np.pi / 2 + .42), 0, 1)
    smp = face.bilinear(hair, uu * S - .5, vv * S - .5); a = smp[:, 3:4]
    base = np.array([96, 72, 46]) / 255
    tex[mask] = (smp[:, :3] * a + base * (1 - a)) * .85
    return tex
tex = paint_scalp(tex, pos_h, scalp); save(tex, 'out/lou_final.png')
CUT_DF = [0, .5, 1.0, 1.28, 1.6, 1.78]; CUT_AL = [.74, .70, .46, .22, .02, -1.6]
def open_alpha(th, al):   # 0 = visage dégagé, 1 = cheveux ; transition douce (contour naturel avec la transparence des mèches)
    df = np.pi - abs(th); cut = np.interp(df, CUT_DF, CUT_AL)
    return float(np.clip((al - cut) / .05, 0, 1))
def y_end(th): return 1.43 + .045 * min(1, abs(th) / (np.pi / 2)) ** 1.5
hp, hn, huv, hi, ha, hrt = long_hair(Vh, C, UVBOX, tilt=TILT, side=SIDE, roots=.62, al_top=np.pi / 2 - .05, ncard=HAIR['ncard'], nrow=HAIR['nrow'], layers=HAIR['layers'], open_alpha=open_alpha, y_end=y_end, off=lambda al: .009 + .006 * (1 - max(al, 0) / (np.pi / 2)))
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
spec = {'images': {'Ch07_1001_Diffuse': '../out/lou_final.png', 'Ch07_1001_Normal': '../out/lou_normal.png', 'Ch07_1002_Diffuse': '../out/lou_hair.png'},
        'attach': [
            {'bone': 'Head', 'name': 'Ch07_LongHair', 'mesh': {**pack(hp, hn, hi, Mh, huv), 'col': np.c_[hrt, hrt * .97, hrt * .93, ha].ravel().tolist()}, 'material': {'name': 'Ch07_hair_long', 'texRef': 'Ch07_1002_Diffuse', 'rough': .55, 'alphaTest': .4, 'double': True}},
            {'bone': 'Head', 'name': 'acc_earrings', 'mesh': pack(ep, en, ei, Mh), 'material': {'name': 'acc_pearl', 'color': [.93, .91, .86, 1], 'rough': .22}},
            {'bone': 'Spine2', 'name': 'acc_necklace_silver', 'mesh': pack(sp, sn, si, Ms), 'material': {'name': 'acc_silver', 'color': [.78, .78, .8, 1], 'rough': .28, 'metal': .9}},
            {'bone': 'Spine2', 'name': 'acc_necklace_pearl', 'mesh': pack(pp_, pn, pi_, Ms), 'material': {'name': 'acc_pearl', 'color': [.93, .91, .86, 1], 'rough': .22}}],
        'hide': ['Ch07_Hair'], 'boneScale': {'Head': [.975, 1.025, 1.0]}}
json.dump(spec, open('spec_lou.json', 'w'))
LITE = os.environ.get('LITE') == '1'
for who, src in (('joe', 'joe_hd'), ('lou', 'louise_hd')):
    if LITE:   # téléphones : textures 1024 px, cheveux plus légers
        sp = json.load(open(f'spec_{who}.json')); sp['maxTex'] = 1024; json.dump(sp, open(f'spec_{who}.json', 'w'))
    subprocess.run(['node', 'inject.mjs', f'/home/claude/profs/src/{src}_m.glb', f'../out/{who}_{"m" if LITE else "hd"}.glb', f'../spec_{who}.json'], cwd='tools', check=True)
