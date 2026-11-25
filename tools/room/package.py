"""Emballe la sortie de build_room.py pour le jeu (dossier assets/) :
room.glb (projecteur), room_m.glb (téléphones, textures réduites), room_lm*.webp (éclairage précalculé),
sky*.jpg (vue extérieure), room.json (réglages).
Usage : python3 package.py <sortie_build> <dossier_sky> <assets> [gltf-transform] [--mobile <sortie_build_mobile>] [--mobile-only]
  --mobile : lightmap des téléphones (calcul séparé avec le soleil direct, voir README) ; sinon version réduite de la principale
  --mobile-only : ne met à jour que la lightmap des téléphones"""
import sys, os, json, subprocess, shutil
from PIL import Image
args = sys.argv[1:]
mob = args[args.index('--mobile') + 1] if '--mobile' in args else None
only = '--mobile-only' in args
args = [a for i, a in enumerate(args) if a not in ('--mobile', '--mobile-only') and not (i and args[i - 1] == '--mobile')]
src, sky, dst = args[0], args[1], args[2]
G = args[3] if len(args) > 3 else 'gltf-transform'
tmp = os.path.join(src, '_pkg'); os.makedirs(tmp, exist_ok=True)
def run(*a): subprocess.run([G, *a], check=True, stdout=subprocess.DEVNULL)
def glb(out, size, q):
    run('webp', f'{src}/room_raw.glb', f'{tmp}/a.glb', '--quality', str(q))
    run('resize', f'{tmp}/a.glb', f'{tmp}/b.glb', '--width', str(size), '--height', str(size))
    run('meshopt', f'{tmp}/b.glb', out, '--level', 'medium', '--quantize-texcoord', '16')
old = json.load(open(f'{dst}/room.json')) if os.path.exists(f'{dst}/room.json') else {}
if not only:
    glb(f'{dst}/room.glb', 2048, 90)
    glb(f'{dst}/room_m.glb', 512, 82)
    lm = Image.open(f'{src}/lm.png').convert('RGB')
    lm.save(f'{dst}/room_lm.webp', quality=94, method=6)
    if not mob: lm.resize((max(512, lm.width // 2),) * 2, Image.LANCZOS).save(f'{dst}/room_lm_m.webp', quality=90, method=6)
    s = Image.open(f'{sky}/sky_three.jpg').convert('RGB')
    s.save(f'{dst}/sky.jpg', quality=88); s.resize((2048, 1024), Image.LANCZOS).save(f'{dst}/sky_m.jpg', quality=85)
    meta = json.load(open(f'{src}/room_meta.json'))
    meta = {**{'gain': 1, 'skyIntensity': 1.5, 'envIntensity': 1, 'charEnv': 1}, **{k: v for k, v in old.items() if k in ('gain', 'skyIntensity', 'envIntensity', 'charEnv')}, **meta,
            'lightmap': 'room_lm.webp', 'lightmapMobile': 'room_lm_m.webp', 'sky': 'sky.jpg', 'skyMobile': 'sky_m.jpg'}
else: meta = old
if mob:   # téléphones : soleil direct et ses ombres inclus (calculé avec --sun-scale 1/gain : même rendu que le soleil temps réel)
    Image.open(f'{mob}/lm.png').convert('RGB').save(f'{dst}/room_lm_m.webp', quality=90, method=6)
    meta['lightMapIntensityMobile'] = json.load(open(f'{mob}/room_meta.json'))['lightMapIntensity']
elif not only: meta.pop('lightMapIntensityMobile', None)
json.dump(meta, open(f'{dst}/room.json', 'w'), indent=1)
shutil.rmtree(tmp, ignore_errors=True)
for f in ('room.glb', 'room_m.glb', 'room_lm.webp', 'room_lm_m.webp', 'sky.jpg', 'sky_m.jpg', 'room.json'):
    print(f'{f:16s} {os.path.getsize(f"{dst}/{f}") / 1e6:6.2f} Mo')
