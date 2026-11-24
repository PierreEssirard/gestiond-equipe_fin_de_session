"""Textures procédurales raccordables (seamless) pour la salle : albedo, rugosité, normales.
Bruit fractal par synthèse spectrale (FFT) : périodique par construction, donc sans couture.
Usage : python3 textures.py <dossier_sortie>"""
import sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else 'tex'
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(761)

def fbm(n, beta=2.0, kmin=1, kmax=None, seed=None, aniso=(1, 1)):
    r = np.random.default_rng(seed if seed is not None else rng.integers(1 << 30))
    fy = np.fft.fftfreq(n)[:, None] * n * aniso[1]; fx = np.fft.rfftfreq(n)[None, :] * n * aniso[0]
    k = np.sqrt(fx * fx + fy * fy); k[0, 0] = 1
    amp = k ** (-beta / 2); amp[0, 0] = 0
    if kmin > 1: amp *= 1 / (1 + np.exp(-(k - kmin) * 2))
    if kmax: amp *= 1 / (1 + np.exp(np.minimum((k - kmax) * .5, 60)))
    ph = r.normal(size=amp.shape) + 1j * r.normal(size=amp.shape)
    x = np.fft.irfft2(ph * amp, s=(n, n)); return (x - x.mean()) / (x.std() + 1e-9)

def blur(a, s):  # flou gaussien périodique (FFT)
    n0, n1 = a.shape[:2]; fy = np.fft.fftfreq(n0)[:, None]; fx = np.fft.fftfreq(n1)[None, :]
    g = np.exp(-2 * (np.pi * s) ** 2 * (fx * fx + fy * fy))
    if a.ndim == 2: return np.real(np.fft.ifft2(np.fft.fft2(a) * g))
    return np.stack([np.real(np.fft.ifft2(np.fft.fft2(a[..., c]) * g)) for c in range(a.shape[2])], -1)

def normal(h, strength):
    """carte de normales OpenGL (+Y = haut de l'image, convention Blender et glTF)"""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * .5; dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * .5
    nx, ny, nz = -dx * strength, dy * strength, np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l, ny / l, nz / l], -1) * .5 + .5

def srgb(c):  # couleur hexadécimale -> tableau float (sRGB 0..1)
    c = c.lstrip('#'); return np.array([int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)

def save(name, a, mode='RGB'):
    a = np.clip(a, 0, 1)
    if a.ndim == 2: Image.fromarray((a * 255 + .5).astype(np.uint8), 'L').save(f'{OUT}/{name}.png')
    else: Image.fromarray((a * 255 + .5).astype(np.uint8), mode).save(f'{OUT}/{name}.png')
    print('ok', name, a.shape)

# ---------- sol : dalles vinyle (VCT) 30,5 cm, motif « chips », cire usée ----------
def floor():
    n = 2048; T = 4; s = n // T                      # 4 x 4 dalles = 1,22 m
    yy, xx = np.mgrid[0:n, 0:n]; ti, tj = yy // s, xx // s
    pal = [srgb('#d8d2c3'), srgb('#d3ccbd'), srgb('#ddd8cb'), srgb('#cfc8b8'), srgb('#d6cfbf')]
    tid = (ti * 7 + tj * 3 + (ti * tj) % 5) % len(pal)
    base = np.stack([np.choose(tid, [p[c] for p in pal]) for c in range(3)], -1).astype(np.float32)
    base *= (1 + .025 * rng.normal(size=(T, T))[ti, tj])[..., None]
    # éclats directionnels (« chips ») propres aux dalles VCT
    c1 = fbm(n, .9, kmin=150, aniso=(1, 1.8)); c2 = fbm(n, .9, kmin=220, aniso=(1.6, 1))
    dark = np.clip((c1 - 1.25) * 2.2, 0, 1) * .55 + np.clip((c2 - 1.5) * 2.4, 0, 1) * .4
    light = np.clip((fbm(n, .9, kmin=180) - 1.45) * 2.4, 0, 1) * .5
    base = base * (1 - dark[..., None] * np.array([.30, .30, .33])) + light[..., None] * .07
    # légère variation d'usure à grande échelle
    mott = blur(fbm(n, 2.6, kmax=10), 4); base *= (1 + .012 * mott)[..., None]
    # joints : fin trait sombre + saleté accumulée
    gx = np.minimum(xx % s, s - 1 - xx % s); gy = np.minimum(yy % s, s - 1 - yy % s); g = np.minimum(gx, gy).astype(np.float32)
    seam = np.exp(-(g / 1.3) ** 2); grime = np.exp(-(g / 9) ** 2) * (.5 + .5 * np.clip(fbm(n, 2, kmax=60), -1, 1))
    base *= (1 - .32 * seam - .07 * grime)[..., None]
    # rayures de talons (traînées sombres courbes, très légères)
    img = Image.new('L', (n, n), 0); d = ImageDraw.Draw(img)
    for _ in range(30):
        x, y = rng.uniform(0, n, 2); a = rng.uniform(0, 6.28); L = rng.uniform(20, 90); w = int(rng.integers(2, 4))
        pts = [(x + np.cos(a + k * .002) * k, y + np.sin(a + k * .002) * k) for k in np.linspace(0, L, 6)]
        for dx in (-n, 0, n):
            for dy in (-n, 0, n): d.line([(p[0] + dx, p[1] + dy) for p in pts], fill=int(rng.integers(60, 140)), width=w)
    scuff = np.asarray(img.filter(ImageFilter.GaussianBlur(1.6)), np.float32) / 255
    base *= (1 - .07 * scuff)[..., None]
    save('floor_a', base)
    rough = .30 + .10 * np.clip(blur(fbm(n, 2.2, kmax=40), 6), -1.5, 1.5) / 1.5 + .25 * seam + .08 * grime + .12 * scuff
    save('floor_r', rough)
    h = -seam * 1.0 - grime * .05 + .012 * fbm(n, 1.4, kmin=200) - .25 * scuff * 0
    save('floor_n', normal(blur(h, .8), 2.2))

# ---------- murs : blocs de béton peints (40 x 20 cm, appareil en quinconce) ----------
def block():
    n = 1024; bw, bh = n // 2, n // 4                   # 2 blocs x 4 rangs = 0,8 m
    yy, xx = np.mgrid[0:n, 0:n]; row = yy // bh; xo = (xx + (row % 2) * (bw // 2)) % n
    mx = np.minimum(xo % bw, bw - 1 - xo % bw); my = np.minimum(yy % bh, bh - 1 - yy % bh)
    jd = np.minimum(mx, my).astype(np.float32)            # distance au joint (px ; 1 px = 0,78 mm)
    joint = np.clip(1 - (jd - 4) / 5, 0, 1)               # joint concave ~ 1 cm
    pores = np.clip(fbm(n, 1.0, kmin=160) - 1.4, 0, None) # petits trous de surface sous la peinture
    pits = np.clip(-fbm(n, 1.3, kmin=60) - 1.8, 0, None)
    h = -joint ** 1.6 * 2.2 - pores * .25 - pits * .35 + .05 * fbm(n, 1.8, kmin=30)
    blk = (row * 5 + xo // bw * 3) % 7
    face = .25 * fbm(n, 2.0, kmax=12) * 0 + (blk - 3) * .004
    col = srgb('#e9e5dc') * (1 + face)[..., None]
    col = col * (1 - .06 * joint - .05 * np.clip(pores, 0, 1) - .06 * np.clip(pits, 0, 1))[..., None]
    col *= (1 + .02 * fbm(n, 2.4, kmax=10))[..., None]
    save('block_a', col); save('block_n', normal(blur(h, .9), 1.7))
    save('block_r', .58 + .08 * joint + .04 * fbm(n, 2, kmax=40))

# ---------- mur avant : placoplâtre peint, peau d'orange ----------
def plaster():
    n = 512
    col = srgb('#ded9ce') * (1 + .018 * fbm(n, 2.5, kmax=8))[..., None]
    save('plaster_a', col); save('plaster_n', normal(blur(fbm(n, 1.2, kmin=60), 1.2), .9))

# ---------- plafond : dalles acoustiques fissurées ----------
def ceiling():
    n = 1024
    f = fbm(n, 1.4, kmin=40, aniso=(1, 1)); w = np.abs(blur(fbm(n, 1.6, kmin=25), 1.5))
    fiss = np.clip((.18 - w) * 9, 0, 1) * np.clip(f + .6, 0, 1)      # vermiculures
    pin = np.clip(fbm(n, .8, kmin=260) - 2.3, 0, None)
    col = srgb('#efede7') * (1 - .22 * fiss - .25 * np.clip(pin, 0, 1) + .012 * fbm(n, 2, kmax=10))[..., None]
    save('ceil_a', col); save('ceil_n', normal(blur(-fiss * 1.4 - pin * .6 + .1 * fbm(n, 1.5, kmin=80), .8), 2.0))

# ---------- tables : stratifié gris clair moucheté ----------
def laminate():
    n = 1024
    sp = np.clip(fbm(n, .9, kmin=200) - 1.6, 0, None) * .25 - np.clip(fbm(n, .9, kmin=180) - 1.9, 0, None) * .15
    col = srgb('#d9d6cf') * (1 - sp + .012 * fbm(n, 2.4, kmax=12))[..., None]
    save('lam_a', col)
    save('lam_r', .42 + .07 * blur(fbm(n, 2.2, kmax=50), 3) + .05 * np.clip(fbm(n, 1, kmin=100), -1, 1))
    save('lam_n', normal(blur(fbm(n, 1.0, kmin=300), .6), .35))

# ---------- plastique des chaises : polypropylène texturé ----------
def plastic():
    n = 512
    h = blur(fbm(n, .8, kmin=150), .9)
    save('pp_n', normal(h, 1.1)); save('pp_r', .52 + .06 * h)

# ---------- chêne (bureau du prof, porte) ----------
def wood():
    n = 1024; yy, xx = np.mgrid[0:n, 0:n] / n
    warp = blur(fbm(n, 2.8, kmax=6, aniso=(6, 1)), 1) * .03 + blur(fbm(n, 2.2, kmax=30, aniso=(8, 1)), 1) * .006
    rings = np.sin((yy + warp) * 2 * np.pi * 17)              # cernes : bandes le long de u qui ondulent
    rings = (rings * .5 + .5) ** 2.2
    fine = fbm(n, .9, kmin=90, aniso=(14, 1))                 # fibres fines, très allongées le long de u
    pores = np.clip(fbm(n, .7, kmin=160, aniso=(10, 1)) - 1.6, 0, None)
    light, dark = srgb('#c39a6b'), srgb('#8f6a43')
    t = np.clip(.55 * rings + .12 * fine + .15 * blur(fbm(n, 2.2, kmax=10), 2), 0, 1)
    col = light * (1 - t[..., None]) + dark * t[..., None]; col *= (1 - .25 * np.clip(pores, 0, 1))[..., None]
    save('wood_a', col); save('wood_r', .48 + .1 * t - .05 * fine * .3); save('wood_n', normal(blur(fine * .25 + rings * .2 - pores * .8, .7), 1.0))

# ---------- liège, tissu ----------
def cork():
    n = 512; g = fbm(n, .7, kmin=60); g2 = blur(fbm(n, 1.5, kmax=40), 1)
    col = srgb('#b0835a') * (1 + .18 * np.clip(g, -2, 2) / 2 + .1 * g2)[..., None]
    save('cork_a', col); save('cork_n', normal(blur(g, .7), 1.4))
def fabric():
    n = 512; yy, xx = np.mgrid[0:n, 0:n]
    weave = np.sin(xx * 2 * np.pi / 6) * np.sin(yy * 2 * np.pi / 6) * .5 + .3 * fbm(n, 1, kmin=100)
    save('fabric_n', normal(blur(weave, .6), 1.4)); save('fabric_r', .78 + .05 * weave)

# ---------- tableau blanc : traces d'effacement très légères ----------
def board():
    n = 1024
    smudge = np.clip(blur(fbm(n, 2.2, kmax=18, aniso=(1, .4)), 3), -2, 2) / 2
    save('board_r', .13 + .06 * np.abs(smudge))

# ---------- images : sortie, horloge, affiches ----------
def font(size, bold=True):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
              '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf']:
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()
def images():
    im = Image.new('RGB', (512, 192), '#0f7a3b'); d = ImageDraw.Draw(im)
    d.text((256, 100), 'SORTIE', fill='white', font=font(104), anchor='mm'); d.polygon([(40, 100), (80, 70), (80, 130)], fill='white'); im.save(f'{OUT}/exit_a.png')
    im = Image.new('RGB', (512, 512), '#f7f6f2'); d = ImageDraw.Draw(im)
    for i in range(60):
        a = i / 60 * 2 * np.pi; r0 = 228 if i % 5 else 205; w = 3 if i % 5 else 9
        d.line([(256 + np.sin(a) * r0, 256 - np.cos(a) * r0), (256 + np.sin(a) * 238, 256 - np.cos(a) * 238)], fill='#1a1a1a', width=w)
    for i, t in enumerate(['12', '3', '6', '9']):
        a = i * np.pi / 2; d.text((256 + np.sin(a) * 168, 256 - np.cos(a) * 168), t, fill='#1a1a1a', font=font(54), anchor='mm')
    def hand(a, L, w, c): d.line([(256, 256), (256 + np.sin(a) * L, 256 - np.cos(a) * L)], fill=c, width=w)
    hand(2 * np.pi * (10 + 10 / 60) / 12, 120, 14, '#151515'); hand(2 * np.pi * 10 / 60, 190, 9, '#151515'); hand(2 * np.pi * 37 / 60, 205, 3, '#c0251d')
    d.ellipse([244, 244, 268, 268], fill='#151515'); im.save(f'{OUT}/clock_a.png')
    im = Image.new('RGB', (600, 840), '#0f6b45'); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 600, 260], fill='#0b5a39'); d.text((48, 70), 'UdeS', fill='#ffd34d', font=font(120))
    d.text((52, 200), 'Université de Sherbrooke', fill='white', font=font(30, False))
    for i, t in enumerate(['Campus de Longueuil', 'Génie · Automne 2026', '', 'Gestion d’équipe', 'en milieu technologique']):
        d.text((52, 330 + i * 64), t, fill='white' if i < 2 else '#ffd34d', font=font(40 if i >= 3 else 36, i >= 3))
    im.save(f'{OUT}/poster_a.png')
    im = Image.new('RGB', (600, 840), '#f2efe8'); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 600, 120], fill='#c0392b'); d.text((300, 62), 'SÉCURITÉ', fill='white', font=font(64), anchor='mm')
    for i, t in enumerate(['En cas d’évacuation :', '1. Gardez votre calme', '2. Sortie la plus proche', '3. Point de rassemblement :', '    stationnement P2']):
        d.text((40, 180 + i * 70), t, fill='#222', font=font(34, i == 0))
    d.rectangle([40, 560, 560, 800], outline='#444', width=4); [d.line([(60 + k * 50, 580), (60 + k * 50, 780)], fill='#888', width=2) for k in range(10)]
    im.save(f'{OUT}/poster2_a.png')
    # feuilles A4 punaisées sur le liège
    for k in range(3):
        im = Image.new('RGB', (420, 594), '#fbfaf6'); d = ImageDraw.Draw(im)
        d.text((30, 30), ['Horaire GIN761', 'Équipes de projet', 'Bibliothèque'][k], fill='#1d4fa8', font=font(30))
        for i in range(14): d.line([(30, 100 + i * 32), (30 + rng.integers(200, 360), 100 + i * 32)], fill='#777', width=3)
        im.save(f'{OUT}/sheet{k}_a.png')
    # tranches de livres (couleurs de couverture)
    pal = ['#1f4e79', '#8e2c25', '#2e6b3c', '#d9a21b', '#5b2d6e', '#2a2a2a', '#c75a1f', '#3c7fa8']
    im = Image.new('RGB', (1024, 128), 'white'); d = ImageDraw.Draw(im)
    for i, c in enumerate(pal): d.rectangle([i * 128, 0, i * 128 + 127, 127], fill=c); d.rectangle([i * 128 + 10, 30, i * 128 + 117, 40], fill='#e8e0c8')
    im.save(f'{OUT}/books_a.png')
    # feuilles de la plante (sansevieria : bandes vert foncé, liseré jaune)
    w, h = 128, 512; yy, xx = np.mgrid[0:h, 0:w].astype(np.float32); yy /= h; xx /= w
    band = np.sin(yy[..., None] * 60 + fbm(512, 2, kmax=20)[:h, :w, None] * 2) * .5 + .5
    col = srgb('#2f5a2c') * (1 - .35 * band) + srgb('#6f8f3e') * .35 * band
    edge = np.clip((np.abs(xx - .5)[..., None] - .4) * 12, 0, 1)
    col = col * (1 - edge) + srgb('#c8c060') * edge
    save('leaf_a', col)

for f in [floor, block, plaster, ceiling, laminate, plastic, wood, cork, fabric, board, images]: f()
