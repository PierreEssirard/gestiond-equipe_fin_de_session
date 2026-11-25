"""Tenues, cheveux et bijoux des profs : recoloration par pièce de vêtement (masques UV) et objets ajoutés."""
import json, sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter
from face import raster

def geo(f): return json.load(open(f))
def mesh(g, suffix): return [m for m in g['meshes'] if m['name'].endswith(suffix)][0]
def uvmask(m, S, grow=3):
    UV = np.array(m['uv']).reshape(-1, 2) * S; I = np.array(m['idx']).reshape(-1, 3)
    im = Image.new('L', (S, S), 0); d = ImageDraw.Draw(im)
    for t in I: d.polygon([tuple(UV[k]) for k in t], fill=255)
    if grow: im = im.filter(ImageFilter.MaxFilter(2 * grow + 1))
    return np.asarray(im) > 0
lumw = np.array([.2126, .7152, .0722])
def srgb2lin(c): return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)
def lin2srgb(c): return np.where(c <= .0031308, c * 12.92, 1.055 * np.power(np.clip(c, 0, None), 1 / 2.4) - .055)
def recolor(tex, mask, rgb, contrast=1.0):
    """garde les plis et le grain du tissu (luminance relative), change la couleur"""
    t = srgb2lin(tex); L = t @ lumw; m = L[mask].mean(); rel = (L / (m + 1e-6)) ** contrast
    target = srgb2lin(np.array(rgb, float) / 255)
    new = target[None, None, :] * rel[..., None]
    t[mask] = new[mask]; return lin2srgb(np.clip(t, 0, 1))
def pattern(S, base, dots, seed=1, density=.012, r=(2, 5)):
    """tissu à petits motifs (chemise de Philippe)"""
    rng = np.random.default_rng(seed); im = Image.new('RGB', (S, S), tuple(base)); d = ImageDraw.Draw(im)
    n = int(S * S * density / 10)
    for _ in range(n):
        x, y = rng.uniform(0, S, 2); rr = rng.uniform(*r); c = dots[rng.integers(len(dots))]
        d.ellipse([x - rr, y - rr * .7, x + rr, y + rr * .7], fill=tuple(c))
        if rng.random() < .5: d.arc([x - rr * 2, y - rr * 2, x + rr * 2, y + rr * 2], rng.uniform(0, 360), rng.uniform(0, 360) + 140, fill=tuple(c), width=1)
    return np.asarray(im.filter(ImageFilter.GaussianBlur(.6)), np.float32) / 255
def hair_recolor(tex_rgba, mask, dark, mid, light, grey=None, grey_amt=0.0, seed=3):
    rgb = tex_rgba[..., :3]; L = rgb @ lumw; lo, hi = np.percentile(L[mask], [5, 97]); x = np.clip((L - lo) / (hi - lo + 1e-6), 0, 1)
    d, m_, l = [np.array(c, float) / 255 for c in (dark, mid, light)]
    col = np.where(x[..., None] < .5, d + (m_ - d) * (x[..., None] * 2), m_ + (l - m_) * ((x[..., None] - .5) * 2))
    if grey is not None:   # poivre et sel : mèches grises dans le sens des cheveux
        rng = np.random.default_rng(seed); S = rgb.shape[0]; n = rng.random(S)
        streak = np.asarray(Image.fromarray((np.tile(n[None, :], (S, 1)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1)), np.float32) / 255
        g = np.clip((streak - (1 - grey_amt)) / .12, 0, 1) * (.4 + .6 * x)
        col = col * (1 - g[..., None]) + (np.array(grey, float) / 255)[None, None, :] * (.55 + .6 * x[..., None]) * g[..., None]
    out = rgb.copy(); out[mask] = col[mask]; return np.concatenate([out, tex_rgba[..., 3:]], -1)
def iris(tex, box, rgb, amt=.7):
    """yeux : teinte de l'iris (zone sombre du motif d'œil)"""
    x0, y0, x1, y1 = box; sub = tex[y0:y1, x0:x1]; L = sub @ lumw
    red = sub[..., 0] > sub[..., 1] * 1.35
    m = (L < np.percentile(L, 40)) & ~red
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5)), np.float32)[..., None] / 255 * amt
    tint = (np.array(rgb, float) / 255) * (L[..., None] / (L[m[..., 0] > .3].mean() + 1e-6))
    tex[y0:y1, x0:x1] = sub * (1 - m) + np.clip(tint, 0, 1) * m; return tex
def save(a, f): Image.fromarray((np.clip(a, 0, 1) * 255 + .5).astype(np.uint8)).save(f)
def load(f): return np.asarray(Image.open(f), np.float32) / 255

def sclera(tex, box, gain=1.12):
    """blanc des yeux plus lumineux : regard plus net"""
    x0, y0, x1, y1 = box; sub = tex[y0:y1, x0:x1]; L = sub @ lumw; sat = sub.max(-1) - sub.min(-1)
    m = np.clip((L - .45) / .2, 0, 1) * np.clip((.25 - sat) / .15, 0, 1)
    tex[y0:y1, x0:x1] = np.clip(sub * (1 + (gain - 1) * m[..., None]), 0, 1); return tex
