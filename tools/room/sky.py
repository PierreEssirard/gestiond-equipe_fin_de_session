"""Panorama extérieur (vue par les fenêtres) à partir des 6 faces Park2 (Humus, CC BY 3.0).
Produit : sky_three.jpg (équirectangulaire, convention three.js) et sky_blender.png (convention Blender),
tournés du même angle YAW pour que la lumière précalculée corresponde à la vue.
Usage : python3 sky.py <dossier_faces> <dossier_sortie> [yaw_degres]"""
import sys, numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]; YAW = np.radians(float(sys.argv[3]) if len(sys.argv) > 3 else 0)
F = {k: np.asarray(Image.open(f'{src}/Park2_{k}.jpg').convert('RGB'), np.float32) / 255 for k in ['posx', 'negx', 'posy', 'negy', 'posz', 'negz']}
N = F['posx'].shape[0]

def cube(d):
    """d : directions (...,3) en coordonnées three.js -> couleur (convention cube map OpenGL)"""
    c, s = np.cos(YAW), np.sin(YAW)
    x = d[..., 0] * c - d[..., 2] * s; z = d[..., 0] * s + d[..., 2] * c; y = d[..., 1]
    ax, ay, az = np.abs(x), np.abs(y), np.abs(z)
    out = np.zeros(d.shape[:-1] + (3,), np.float32)
    faces = [('posx', (ax >= ay) & (ax >= az) & (x > 0), -z, -y, ax), ('negx', (ax >= ay) & (ax >= az) & (x <= 0), z, -y, ax),
             ('posy', (ay > ax) & (ay >= az) & (y > 0), x, z, ay), ('negy', (ay > ax) & (ay >= az) & (y <= 0), x, -z, ay),
             ('posz', (az > ax) & (az > ay) & (z > 0), x, -y, az), ('negz', (az > ax) & (az > ay) & (z <= 0), -x, -y, az)]
    for k, m, sc, tc, ma in faces:
        if not m.any(): continue
        s_ = (sc[m] / ma[m] + 1) * .5 * (N - 1); t_ = (tc[m] / ma[m] + 1) * .5 * (N - 1)
        i0, j0 = np.floor(t_).astype(int), np.floor(s_).astype(int); i1, j1 = np.minimum(i0 + 1, N - 1), np.minimum(j0 + 1, N - 1)
        fi, fj = (t_ - i0)[:, None], (s_ - j0)[:, None]; im = F[k]
        out[m] = (im[i0, j0] * (1 - fi) * (1 - fj) + im[i0, j1] * (1 - fi) * fj + im[i1, j0] * fi * (1 - fj) + im[i1, j1] * fi * fj)
    return out

def equirect(W, H, conv):
    r, c = np.mgrid[0:H, 0:W].astype(np.float32); u = (c + .5) / W; v = 1 - (r + .5) / H
    if conv == 'three':        # three.js : u = atan2(z, x)/2π + .5 ; v = asin(y)/π + .5
        ph, th = (u - .5) * 2 * np.pi, (v - .5) * np.pi
        d = np.stack([np.cos(th) * np.cos(ph), np.sin(th), np.cos(th) * np.sin(ph)], -1)
    else:                      # Blender : u = -atan2(y_b, x_b)/2π + .5 ; v = atan2(z_b, |xy|)/π + .5 ; three = (x_b, z_b, -y_b)
        ph, th = -(u - .5) * 2 * np.pi, (v - .5) * np.pi
        db = np.stack([np.cos(th) * np.cos(ph), np.cos(th) * np.sin(ph), np.sin(th)], -1)
        d = np.stack([db[..., 0], db[..., 2], -db[..., 1]], -1)
    out = np.zeros((H, W, 3), np.float32)
    for i in range(0, H, 256): out[i:i + 256] = cube(d[i:i + 256])
    return out

a = equirect(4096, 2048, 'three'); Image.fromarray((np.clip(a, 0, 1) * 255 + .5).astype(np.uint8)).save(f'{out}/sky_three.jpg', quality=90)
b = equirect(2048, 1024, 'blender'); Image.fromarray((np.clip(b, 0, 1) * 255 + .5).astype(np.uint8)).save(f'{out}/sky_blender.png')
# vue depuis la salle : ce qu'on voit par les fenêtres (direction -x, three.js)
W, H = 1600, 600; r, c = np.mgrid[0:H, 0:W].astype(np.float32); fov = np.radians(120)
ph = np.pi + (c / W - .5) * fov; th = (.5 - r / H) * fov * H / W
d = np.stack([np.cos(th) * np.cos(ph), np.sin(th), np.cos(th) * np.sin(ph)], -1)
Image.fromarray((np.clip(cube(d), 0, 1) * 255).astype(np.uint8)).save(f'{out}/sky_view.jpg')
print('ok', a.shape, b.shape)
