"""Remodelage d'un visage 3D vers une photo de face.
1) repères du modèle (vue orthographique de face) et de la photo ;
2) caméra affine ajustée (rotation 3D + échelles x/y + translation) : ce qui reste est la vraie différence de forme ;
3) déformation lisse (plaque mince 2D, atténuée vers l'arrière de la tête) appliquée au visage, aux cils et aux yeux
   (globes oculaires déplacés d'un bloc) ; écrit les déplacements dans le repère du maillage (glb).
python3 morph.py cfg.json"""
import json, sys, numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

def px2w(p, cy, h=.085, W=800): return np.array([p[0] / W * 2 * h - h, cy + h - p[1] / W * 2 * h])

def tps_fit(S, D, reg=1e-6):
    n = len(S); r = np.linalg.norm(S[:, None] - S[None], axis=2); K = np.where(r > 0, r * r * np.log(r + 1e-12), 0) + reg * np.eye(n)
    P = np.c_[np.ones(n), S]; A = np.zeros((n + 3, n + 3)); A[:n, :n] = K; A[:n, n:] = P; A[n:, :n] = P.T
    b = np.zeros((n + 3, D.shape[1])); b[:n] = D
    return np.linalg.solve(A, b), S
def tps_eval(model, X):
    W, S = model; n = len(S); r = np.linalg.norm(X[:, None] - S[None], axis=2); U = np.where(r > 0, r * r * np.log(r + 1e-12), 0)
    return U @ W[:n] + np.c_[np.ones(len(X)), X] @ W[n:]

def run(cfg):
    G = json.load(open(cfg['geo'])); RAW = json.load(open(cfg['raw']))
    body = [m for m in G['meshes'] if m['name'].endswith('_Body')][0]
    P = np.array(body['pos']).reshape(-1, 3); hw = np.array(body['headW']); I = np.array(body['idx']).reshape(-1, 3)
    H = P[hw > .9]; cy = cfg['cy']
    def surf(x, y):
        d = np.hypot(H[:, 0] - x, H[:, 1] - y); near = d < .004
        if not near.any(): near = d < d.min() + .002
        return np.array([x, y, H[near, 2].max()])
    mp = {k: px2w(v, cy) for k, v in json.load(open(cfg['model_lm'])).items()}
    ph = {k: np.array(v, float) for k, v in json.load(open(cfg['photo_lm'])).items()}
    eyeY = (mp['eyeR_in'][1] + mp['eyeL_in'][1] + mp['eyeR_out'][1] + mp['eyeL_out'][1]) / 4
    mouthY = (mp['mouthR'][1] + mp['mouthL'][1]) / 2; alarY = (mp['alarR'][1] + mp['alarL'][1]) / 2
    front = H[H[:, 2] > cfg.get('zface', .035)]
    chinY = H[(np.abs(H[:, 0]) < .008) & (H[:, 2] > .02)][:, 1].min() + cfg.get('chin_up', .004)
    L3 = {k: surf(*v) for k, v in mp.items()}
    L3['chin'] = surf(0, chinY)
    def outline(y, side):
        s = front[np.abs(front[:, 1] - y) < .003]; k = np.argmax(s[:, 0] * side); return s[k].copy()
    pe = ph; pEye = (pe['eyeR_out'][1] + pe['eyeR_in'][1] + pe['eyeL_in'][1] + pe['eyeL_out'][1]) / 4
    pMouth = (pe['mouthR'][1] + pe['mouthL'][1]) / 2; pChin = pe['chin'][1]
    for key, lev in (('e', 'eye'), ('n', 'alar'), ('m', 'mouth'), ('j', None), ('c', None)):
        py = pe[key + 'R'][1]
        if lev == 'eye': y = eyeY
        elif lev == 'alar': y = alarY
        elif lev == 'mouth': y = mouthY
        else: y = mouthY + (py - pMouth) / (pChin - pMouth) * (chinY - mouthY)
        L3[key + 'R'] = outline(y, -1); L3[key + 'L'] = outline(y, 1)
    keys = [k for k in ph if k in L3]
    X3 = np.array([L3[k] for k in keys]); x2 = np.array([ph[k] for k in keys])
    w = np.array([cfg.get('weights', {}).get(k, 1.0) for k in keys])
    def proj(p, X):
        R = Rotation.from_rotvec(p[:3]).as_matrix(); Y = X @ R.T
        return np.c_[p[3] * Y[:, 0] + p[5], -p[4] * Y[:, 1] + p[6]]
    s0 = (x2[:, 0].max() - x2[:, 0].min()) / (X3[:, 0].max() - X3[:, 0].min())
    p0 = np.array([0, 0, 0, s0, s0, x2[:, 0].mean() - s0 * X3[:, 0].mean(), x2[:, 1].mean() + s0 * X3[:, 1].mean()])
    fit = least_squares(lambda p: ((proj(p, X3) - x2) * w[:, None]).ravel(), p0)
    p = fit.x; res = x2 - proj(p, X3)
    print('caméra : rotation (°)', np.round(np.degrees(p[:3]), 1), 'échelles x/y', round(p[3], 1), round(p[4], 1), '(rapport', round(p[4] / p[3], 3), ')')
    print('écarts avant remodelage (px photo) :', {k: round(float(np.linalg.norm(r)), 1) for k, r in zip(keys, res)})
    R = Rotation.from_rotvec(p[:3]).as_matrix()
    D2 = np.c_[res[:, 0] / p[3], -res[:, 1] / p[4], np.zeros(len(res))] @ R      # vers le repère du modèle
    D2 = D2[:, :2] * cfg.get('strength', .8)
    MASK = cfg.get('mask', {})                      # par repère : part du déplacement gardée en x et en y (l'expression ne doit pas déformer la tête)
    D2 = D2 * np.array([MASK.get(k, [1, 1]) for k in keys])
    keep = np.array([k not in cfg.get('drop', []) for k in keys])
    D2 = D2[keep]; X3m = X3[keep]
    lim = cfg.get('max_shift', .012); nrm = np.linalg.norm(D2, axis=1, keepdims=True); D2 = D2 * np.minimum(1, lim / (nrm + 1e-12))
    S = X3m[:, :2]
    # ancrages fixes autour du visage : crâne, oreilles, cou
    a = cfg.get('anchors', {}); ear = a.get('ear', .088)
    anchors = [(0, eyeY + .11), (-.06, eyeY + .095), (.06, eyeY + .095), (-ear, eyeY + .01), (ear, eyeY + .01), (-ear, mouthY + .005), (ear, mouthY + .005),
               (-.045, chinY - .035), (.045, chinY - .035), (0, chinY - .045), (-.085, eyeY + .06), (.085, eyeY + .06)]
    S = np.r_[S, np.array(anchors)]; D2 = np.r_[D2, np.zeros((len(anchors), 2))]
    model = tps_fit(S, D2)
    z0, z1 = cfg.get('zfade', (-.02, .03))
    def disp(V, hwv):
        d = tps_eval(model, V[:, :2]); f = np.clip((V[:, 2] - z0) / (z1 - z0), 0, 1) * np.clip((hwv - .3) / .6, 0, 1)
        return np.c_[d * f[:, None], np.zeros(len(V))]
    out = {}
    node2mesh = {n['name']: n['mesh'] for n in RAW['nodes'] if n['mesh']}
    eyeC = [np.array([(mp['eyeR_in'][0] + mp['eyeR_out'][0]) / 2, eyeY]), np.array([(mp['eyeL_in'][0] + mp['eyeL_out'][0]) / 2, eyeY])]
    for m in G['meshes']:
        if not (m['name'].endswith('_Body') or m['name'].endswith('_Eyelashes')): continue
        V = np.array(m['pos']).reshape(-1, 3); hwv = np.array(m['headW']); d = disp(V, hwv)
        if m['name'].endswith('_Body'):         # globes oculaires : déplacés d'un bloc (composantes connexes près des yeux)
            Ix = np.array(m['idx']).reshape(-1, 3); par = np.arange(len(V))
            def f_(x):
                while par[x] != x: par[x] = par[par[x]]; x = par[x]
                return x
            for a_, b_, c_ in Ix:
                for u, v in ((a_, b_), (b_, c_)):
                    ru, rv = f_(u), f_(v)
                    if ru != rv: par[ru] = rv
            roots = np.array([f_(i) for i in range(len(V))]); comps, cnt = np.unique(roots, return_counts=True)
            for cpt, n in zip(comps, cnt):
                if n > 3000: continue
                sel = roots == cpt; c = V[sel].mean(0)
                if min(np.hypot(c[0] - e[0], c[1] - e[1]) for e in eyeC) < .012 and np.ptp(V[sel][:, 0]) < .035:
                    dc = disp(c[None], np.array([1.0]))[0]; d[sel] = dc
        prim = [p_ for p_ in RAW['prims'] if p_['mesh'] == node2mesh[m['name']]][0]
        raw = np.array(prim['pos']).reshape(-1, 3); sel = hwv > .99
        Xa = np.c_[raw[sel], np.ones(sel.sum())]; sol = np.linalg.lstsq(Xa, V[sel], rcond=None)[0]; A = sol[:3].T
        draw = d @ np.linalg.inv(A).T
        idx = np.where(np.abs(d).max(1) > 1e-5)[0]
        out[m['name']] = {'idx': idx.tolist(), 'd': draw[idx].ravel().tolist()}
        print(m['name'], 'sommets déplacés', len(idx), 'déplacement max (mm)', round(float(np.abs(d).max() * 1000), 1))
    json.dump(out, open(cfg['out'], 'w'))
    # contrôle : où tombent les repères après remodelage
    after = X3.copy(); after[:, :2] += tps_eval(model, X3[:, :2]) * np.clip((X3[:, 2] - z0) / (z1 - z0), 0, 1)[:, None]
    res2 = x2 - proj(p, after)
    print('écarts après remodelage (px photo) :', {k: round(float(np.linalg.norm(r)), 1) for k, r in zip(keys, res2)})
    if cfg.get('lm3_out'): json.dump({k: after[i].tolist() for i, k in enumerate(keys)}, open(cfg['lm3_out'], 'w'))   # repères 3D du visage remodelé

if __name__ == '__main__':
    run(json.load(open(sys.argv[1])))
