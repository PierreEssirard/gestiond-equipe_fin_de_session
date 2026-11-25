"""Plaque un visage photographié sur la texture d'un personnage (projection depuis une caméra ajustée sur des repères)."""
import json, sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation
from scipy.ndimage import distance_transform_edt

def load_head(geo):
    d = json.load(open(geo)); m = [x for x in d['meshes'] if x['name'].endswith('_Body')][0]
    P = np.array(m['pos']).reshape(-1, 3); UV = np.array(m['uv']).reshape(-1, 2); I = np.array(m['idx']).reshape(-1, 3); hw = np.array(m['headW'])
    N = np.zeros_like(P); fn = np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]])
    for k in range(3): np.add.at(N, I[:, k], fn)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    T = I[hw[I].min(1) > .5]
    # plus grande île UV connexe = peau de la tête (exclut globes oculaires, dents, langue)
    par = np.arange(len(P))
    def f(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    for a, b, c in T:
        for x, y in ((a, b), (b, c)):
            rx, ry = f(x), f(y)
            if rx != ry: par[rx] = ry
    roots = np.array([f(t[0]) for t in T]); u, cnt = np.unique(roots, return_counts=True)
    T = T[roots == u[cnt.argmax()]]
    return P, N, UV, T

def load_all(geo):
    d = json.load(open(geo)); m = [x for x in d['meshes'] if x['name'].endswith('_Body')][0]
    P = np.array(m['pos']).reshape(-1, 3); UV = np.array(m['uv']).reshape(-1, 2); I = np.array(m['idx']).reshape(-1, 3)
    return P, np.zeros_like(P) + [0, 0, 1.], UV, I

def surf_point(P, T, x, y):
    """point de la surface avant de la tête à (x, y) : sommet le plus en avant près de la verticale"""
    V = np.unique(T); Q = P[V]; dd = np.hypot(Q[:, 0] - x, Q[:, 1] - y); near = dd < .004
    if not near.any(): near = dd < dd.min() + .002
    k = np.argmax(np.where(near, Q[:, 2], -9)); return np.array([x, y, Q[k, 2]])

def fit_camera(X3, x2, w, aniso=False):
    def proj(p, X):
        R = Rotation.from_rotvec(p[:3]).as_matrix(); Y = X @ R.T; sy = p[6] if aniso else p[3]
        return np.c_[p[3] * Y[:, 0] + p[4], -sy * Y[:, 1] + p[5]]
    s0 = (x2[:, 0].max() - x2[:, 0].min()) / (X3[:, 0].max() - X3[:, 0].min())
    p0 = np.array([0, 0, 0, s0, x2[:, 0].mean() - s0 * X3[:, 0].mean(), x2[:, 1].mean() + s0 * X3[:, 1].mean()] + ([s0] if aniso else []))
    r = least_squares(lambda p: ((proj(p, X3) - x2) * w[:, None]).ravel(), p0)
    err = np.linalg.norm(proj(r.x, X3) - x2, axis=1)
    return (lambda X: proj(r.x, X)), Rotation.from_rotvec(r.x[:3]).as_matrix(), err

def raster(P, N, UV, T, S):
    """pour chaque texel couvert : position 3D, normale (interpolées)"""
    pos = np.zeros((S, S, 3), np.float32); nrm = np.zeros((S, S, 3), np.float32); cov = np.zeros((S, S), bool)
    for t in T:
        u = UV[t] * S - .5; x0, y0 = np.floor(u.min(0)).astype(int); x1, y1 = np.ceil(u.max(0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, S - 1), min(y1, S - 1)
        if x1 < x0 or y1 < y0: continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        a, b, c = u; den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-12: continue
        l1 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / den
        l2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / den; l3 = 1 - l1 - l2
        m = (l1 >= -.02) & (l2 >= -.02) & (l3 >= -.02)
        if not m.any(): continue
        L = np.stack([l1[m], l2[m], l3[m]], 1); yy, xx = gy[m], gx[m]
        pos[yy, xx] = L @ P[t]; nn = L @ N[t]; nrm[yy, xx] = nn / (np.linalg.norm(nn, axis=1, keepdims=True) + 1e-9); cov[yy, xx] = True
    return pos, nrm, cov

def bilinear(img, x, y):
    H, W = img.shape[:2]; x = np.clip(x, 0, W - 1.001); y = np.clip(y, 0, H - 1.001)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int); fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)

def enhance(photo, up=4, clahe=1.8, amount=1.0, sigma=.9, denoise=0):
    """photo agrandie (Lanczos) puis traits renforcés : contraste local (CLAHE) et accentuation des contours"""
    import cv2
    im = (np.clip(photo, 0, 1) * 255).astype(np.uint8); h, w = im.shape[:2]
    im = np.asarray(Image.fromarray(im).resize((w * up, h * up), Image.LANCZOS))
    if denoise: im = cv2.bilateralFilter(im, 0, denoise, 1.6 * up)          # lisse la peau (bruit, compression) sans adoucir les contours
    if clahe:
        lab = cv2.cvtColor(im, cv2.COLOR_RGB2LAB); L0 = lab[..., 0].copy()
        L1 = cv2.createCLAHE(clipLimit=clahe, tileGridSize=(6, 6)).apply(L0)
        lab[..., 0] = (L0 * .45 + L1 * .55).astype(np.uint8); im = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)
    f = im.astype(np.float32) / 255
    if amount: f = f + amount * (f - cv2.GaussianBlur(f, (0, 0), sigma * up))
    return np.clip(f, 0, 1)

def run(cfg):
    P, N, UV, T = load_head(cfg['geo'])
    if cfg.get('lm3'):          # repères 3D du visage remodelé + repères de la photo (relevés fins)
        L3 = json.load(open(cfg['lm3'])); PH = json.load(open(cfg['photo_lm'])); keys = [k for k in L3 if k in PH and k not in cfg.get('skip', [])]
        X3 = np.array([L3[k] for k in keys]); x2 = np.array([PH[k] for k in keys], float)
        w = np.array([cfg.get('weights', {}).get(k, 1.0) for k in keys])
        project, R, err = fit_camera(X3, x2, w, aniso=True)
    else:
        keys = cfg['keys']; lm = cfg['model']; X3 = np.array([surf_point(P, T, *lm[k]) for k in keys]); x2 = np.array([cfg['photo'][k] for k in keys], float)
        w = np.array([cfg.get('weights', {}).get(k, 1.0) for k in keys])
        project, R, err = fit_camera(X3, x2, w)
    print('erreur des repères (px photo) :', dict(zip(keys, np.round(err, 1))))
    photo = np.asarray(Image.open(cfg['img']).convert('RGB'), np.float32) / 255
    Hh, Wp = photo.shape[:2]
    mask = Image.new('L', (Wp, Hh), 0); ImageDraw.Draw(mask).polygon([tuple(p) for p in cfg['poly']], fill=255)
    mk = np.asarray(mask) > 0; dist = distance_transform_edt(mk); feather = cfg['feather'] * (x2[1, 0] - x2[0, 0])
    alpha_ph = np.clip(dist / feather, 0, 1); alpha_ph = alpha_ph * alpha_ph * (3 - 2 * alpha_ph)
    base = Image.open(cfg['tex']).convert('RGB'); S = base.size[0]; tex = np.asarray(base, np.float32) / 255
    pos, nrm, cov = raster(P, N, UV, T, S)
    view = R.T @ np.array([0, 0, 1.]); facing = np.clip((nrm @ view - .25) / .35, 0, 1)
    pp = project(pos.reshape(-1, 3)).reshape(S, S, 2)
    U = cfg.get('up', 4); photoU = enhance(photo, U, cfg.get('clahe', 1.8), cfg.get('sharpen', 1.0), cfg.get('sharp_sigma', .9), cfg.get('denoise', 0))
    col = bilinear(photoU, pp[..., 0] * U + (U - 1) / 2, pp[..., 1] * U + (U - 1) / 2); a = bilinear(alpha_ph[..., None], pp[..., 0], pp[..., 1])[..., 0]
    W = np.where(cov, a * facing, 0).astype(np.float32)
    W = np.asarray(Image.fromarray((W * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)), np.float32) / 255 * cov
    # teint commun : cible entre le teint de la photo et celui du personnage ; visage ET reste de la peau (cou, oreilles, mains) y sont ramenés
    P2, N2, UV2, Tall = load_all(cfg['geo'])
    _, _, cov_all = raster(P2, N2, UV2, Tall, S)
    lum = tex @ np.array([.2126, .7152, .0722])
    skin_t = cov_all & (lum > .22) & (tex[..., 0] > tex[..., 2] + .03) & (tex[..., 0] >= tex[..., 1])
    plum = photo @ np.array([.2126, .7152, .0722])
    skin_p = (alpha_ph > .5) & (plum > .3) & (plum < .9) & (photo[..., 0] > photo[..., 2] + .03)
    pm = photo[skin_p].mean(0) * cfg.get('expo', .9); tm = tex[skin_t & (W < .05)].mean(0); t = cfg.get('tone', .6)
    target = pm ** t * tm ** (1 - t); print('teint photo', np.round(pm, 3), 'texture', np.round(tm, 3), 'cible', np.round(target, 3))
    col = col * (target / (pm / cfg.get('expo', .9)))
    soft = np.clip((lum - .15) / .1, 0, 1) * skin_t
    tex = tex * (1 + (target / tm - 1)[None, None, :] * soft[..., None])
    out = tex * (1 - W[..., None]) + np.clip(col, 0, 1) * W[..., None]
    if cfg.get('post_sharpen', .5):          # netteté finale à la résolution de la texture, sur le visage seulement
        from scipy.ndimage import gaussian_filter
        bl = np.stack([gaussian_filter(out[..., c], 1.6) for c in range(3)], -1)
        out = np.clip(out + cfg.get('post_sharpen', .5) * (out - bl) * W[..., None], 0, 1)
    proj_col = np.clip(col, 0, 1)
    Image.fromarray((out * 255 + .5).astype(np.uint8)).save(cfg['out'])
    if cfg.get('normal'):
        nm = np.asarray(Image.open(cfg['normal']).convert('RGB'), np.float32) / 255; flat = np.array([.5, .5, 1.])
        k = (W * cfg.get('flatten', .65))[..., None]; nm = nm * (1 - k) + flat * k
        if cfg.get('relief', 0):             # relief tiré de la photo : rides, plis du sourire, paupières, contour des lèvres
            from scipy.ndimage import gaussian_filter
            Lp = proj_col @ np.array([.2126, .7152, .0722]); Lp = np.where(W > .02, Lp, gaussian_filter(Lp, 8))
            hgt = gaussian_filter(Lp, cfg.get('relief_fine', 2.2)) - gaussian_filter(Lp, 9)          # détails seulement (pas l'éclairage de la photo)
            gr, gc = np.gradient(hgt); st = cfg['relief'] * W
            n3 = nm * 2 - 1; n3[..., 0] += -gc * st; n3[..., 1] += gr * st     # convention des cartes d'origine (OpenGL, v vers le haut)
            n3 /= np.linalg.norm(n3, axis=-1, keepdims=True) + 1e-9; nm = n3 * .5 + .5
        Image.fromarray((nm * 255 + .5).astype(np.uint8)).save(cfg['normal_out'])
    np.save(cfg['out'] + '.w.npy', W)
    return W

if __name__ == '__main__':
    run(json.load(open(sys.argv[1])))
