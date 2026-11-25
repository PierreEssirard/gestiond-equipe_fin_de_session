"""Cheveux longs (mi-longs, raides) construits autour du crâne : cartes de mèches en couches, plus bijoux."""
import json, numpy as np

def to_local(P, M):    # monde -> repère de l'os
    Mi = np.linalg.inv(M); return (np.c_[P, np.ones(len(P))] @ Mi.T)[:, :3]
def nrm_local(Nw, M):
    R = M[:3, :3] / np.linalg.norm(M[:3, 0]); n = Nw @ R          # rotation pure : local = Rᵀ·n
    return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-9)

def skull_radius(V, C, nth=96, nal=48):
    """rayon max du crâne (et du chignon) par direction (azimut depuis l'arrière, élévation)"""
    d = V - C; r = np.linalg.norm(d, axis=1); th = np.arctan2(d[:, 0], -d[:, 2]); al = np.arcsin(np.clip(d[:, 1] / (r + 1e-9), -1, 1))
    ti = ((th + np.pi) / (2 * np.pi) * nth).astype(int) % nth; ai = np.clip(((al + np.pi / 2) / np.pi * nal).astype(int), 0, nal - 1)
    G = np.zeros((nal, nth)); np.maximum.at(G, (ai, ti), r)
    for _ in range(40):   # bouche les trous par diffusion
        z = G == 0
        if not z.any(): break
        Gp = np.pad(G, ((1, 1), (0, 0)), mode='edge'); nb = np.stack([np.roll(G, 1, 1), np.roll(G, -1, 1), Gp[:-2], Gp[2:]])
        cnt = (nb > 0).sum(0); s = nb.sum(0); G[z & (cnt > 0)] = (s / np.maximum(cnt, 1))[z & (cnt > 0)]
    from scipy.ndimage import uniform_filter
    G = np.maximum(G, uniform_filter(G, size=(3, 5), mode=('nearest', 'wrap')))
    def R(th, al):
        ti = ((np.asarray(th) + np.pi) / (2 * np.pi) * nth).astype(int) % nth; ai = np.clip(((np.asarray(al) + np.pi / 2) / np.pi * nal).astype(int), 0, nal - 1)
        return G[ai, ti]
    return R

def long_hair(V, C, uvbox, ncard=44, nrow=30, layers=((0.0, 0.0), (.005, .37), (.010, .71)), seed=5, tilt=.5, side=0.0, roots=.7,
              open_alpha=lambda th, al: 1.0, al_top=np.pi / 2 - .22, y_end=lambda th: 1.42, al_min=-.42, off=lambda al: .012, flare=.03, n_h=10):
    """mèches qui partent de la raie (pôle incliné vers le front) et tombent sur les côtés et dans le dos"""
    R = skull_radius(V, C); rng = np.random.default_rng(seed); u0, v0, u1, v1 = uvbox
    ct, st = np.cos(tilt), np.sin(tilt)
    def world_dir(th, al):   # repère local (pôle = vertical) incliné vers l'avant d'un angle tilt autour de x
        d = np.array([np.sin(th) * np.cos(al), np.sin(al), -np.cos(th) * np.cos(al)])
        e = np.array([d[0], ct * d[1] + st * d[2], -st * d[1] + ct * d[2]])
        cs, sn = np.cos(side), np.sin(side)          # raie décalée sur le côté (rotation autour de l'axe avant-arrière)
        return np.array([cs * e[0] - sn * e[1], sn * e[0] + cs * e[1], e[2]])
    def angles(d): return np.arctan2(d[0], -d[2]), np.arcsin(np.clip(d[1], -1, 1))
    P, N, UV, I, A_, RT = [], [], [], [], [], []
    dth = 2 * np.pi / ncard
    for li, (lo, ush) in enumerate(layers):
        for c in range(ncard):
            ths = np.linspace(c * dth - np.pi, (c + 1) * dth - np.pi, 4) + li * dth * .33
            als = np.linspace(al_top, al_min, nrow)
            cols, opens = [], []
            for th in ths:
                pts = []
                for al in als:
                    d = world_dir(th, al); wth, wal = angles(d)
                    r = R(wth, wal) + off(wal) + lo; pts.append(C + d * r)
                last = pts[-1]; wth, _ = angles(world_dir(th, als[-1])); ye = y_end(wth) - lo * .5 + rng.uniform(-.012, .012)
                for k in range(1, n_h + 1):
                    f = k / n_h; p = last.copy(); p[1] = last[1] + (ye - last[1]) * f
                    p += np.array([np.sin(wth), 0, -np.cos(wth)]) * flare * f ** 1.5; pts.append(p)
                cols.append(np.array(pts))
            cols = np.array(cols); nr = cols.shape[1]
            alpha = np.ones((4, nr))
            for a_ in range(4):
                for j in range(nr):
                    m = cols[a_, j] - C
                    if j >= len(als): m = cols[a_, len(als) - 1] - C; m[1] -= .25 * np.linalg.norm(m) * (j - len(als) + 1) / n_h
                    wth, wal = angles(m / np.linalg.norm(m)); alpha[a_, j] = open_alpha(wth, wal)
            keep = (alpha[:, :-1] + alpha[:, 1:]).max(0) > .05
            if not keep.any(): continue
            seg = np.cumsum(np.r_[0, np.linalg.norm(np.diff(cols[1], axis=0), axis=1)]); seg /= seg[-1]
            base = len(P)
            for a in range(4):
                for j in range(nr):
                    A_.append(alpha[a, j]); RT.append(roots + (1 - roots) * min(1, seg[j] / .35) ** .8); P.append(cols[a, j]); dd = cols[a, j] - C; dd[1] *= .3; N.append(dd / (np.linalg.norm(dd) + 1e-9))
                    ua = u0 + (u1 - u0) * ((c * .37 + ush) % .55); UV.append([ua + (u1 - u0) * .45 * a / 3, v0 + (v1 - v0) * seg[j]])
            for a in range(3):
                for j in range(nr - 1):
                    if not keep[j]: continue
                    p = base + a * nr + j; q = base + (a + 1) * nr + j
                    I += [[p, q, p + 1], [q, q + 1, p + 1]]
    return np.array(P), np.array(N), np.array(UV), np.array(I), np.array(A_), np.array(RT)

def sphere(c, r, n=10, m=14):
    P, N, I = [], [], []
    for i in range(n + 1):
        a = np.pi * i / n
        for j in range(m + 1):
            b = 2 * np.pi * j / m; d = np.array([np.sin(a) * np.cos(b), np.cos(a), np.sin(a) * np.sin(b)]); P.append(c + d * r); N.append(d)
    for i in range(n):
        for j in range(m):
            p = i * (m + 1) + j; q = p + m + 1; I += [[p, q, p + 1], [q, q + 1, p + 1]]
    return np.array(P), np.array(N), np.array(I)
def merge(parts):
    P, N, I, o = [], [], [], 0
    for p, n, i in parts: P.append(p); N.append(n); I.append(i + o); o += len(p)
    return np.concatenate(P), np.concatenate(N), np.concatenate(I)
