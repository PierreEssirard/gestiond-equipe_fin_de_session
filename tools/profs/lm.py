"""Repères : affichage sur image (vérification) et conversions pixel <-> monde pour les vues orthographiques."""
import json, sys
from PIL import Image, ImageDraw
def draw(img, pts, out, scale=1, r=4):
    im = Image.open(img).convert('RGB')
    if scale != 1: im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    for k, (x, y) in pts.items():
        X, Y = x * scale, y * scale
        d.ellipse([X - r, Y - r, X + r, Y + r], outline=(0, 255, 0), width=2); d.text((X + 5, Y - 12), k, fill=(0, 255, 0))
    im.save(out, quality=92)
if __name__ == '__main__':
    pts = json.load(open(sys.argv[2])); draw(sys.argv[1], pts, sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 1)
