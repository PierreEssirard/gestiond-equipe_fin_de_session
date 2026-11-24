"""Emballe la sortie de build_room.py pour le jeu (dossier assets/) :
room.glb (projecteur), room_m.glb (téléphones, textures réduites), room_lm*.webp (éclairage précalculé),
sky*.jpg (vue extérieure), room.json (réglages).
Usage : python3 package.py <sortie_build> <dossier_sky> <assets> [gltf-transform]"""
import sys, os, json, subprocess, shutil
from PIL import Image
src, sky, dst = sys.argv[1], sys.argv[2], sys.argv[3]
G = sys.argv[4] if len(sys.argv) > 4 else 'gltf-transform'
tmp = os.path.join(src, '_pkg'); os.makedirs(tmp, exist_ok=True)
def run(*a): subprocess.run([G, *a], check=True, stdout=subprocess.DEVNULL)
def glb(out, size, q):
    run('webp', f'{src}/room_raw.glb', f'{tmp}/a.glb', '--quality', str(q))
    run('resize', f'{tmp}/a.glb', f'{tmp}/b.glb', '--width', str(size), '--height', str(size))
    run('meshopt', f'{tmp}/b.glb', out, '--level', 'medium', '--quantize-texcoord', '16')
glb(f'{dst}/room.glb', 2048, 90)
glb(f'{dst}/room_m.glb', 512, 82)
lm = Image.open(f'{src}/lm.png').convert('RGB')
lm.save(f'{dst}/room_lm.webp', quality=94, method=6)
lm.resize((max(512, lm.width // 2),) * 2, Image.LANCZOS).save(f'{dst}/room_lm_m.webp', quality=90, method=6)
s = Image.open(f'{sky}/sky_three.jpg').convert('RGB')
s.save(f'{dst}/sky.jpg', quality=88); s.resize((2048, 1024), Image.LANCZOS).save(f'{dst}/sky_m.jpg', quality=85)
meta = json.load(open(f'{src}/room_meta.json'))
old = json.load(open(f'{dst}/room.json')) if os.path.exists(f'{dst}/room.json') else {}
meta = {**{'gain': 1, 'skyIntensity': 1.5, 'envIntensity': 1, 'charEnv': 1}, **{k: v for k, v in old.items() if k in ('gain', 'skyIntensity', 'envIntensity', 'charEnv')}, **meta,
        'lightmap': 'room_lm.webp', 'lightmapMobile': 'room_lm_m.webp', 'sky': 'sky.jpg', 'skyMobile': 'sky_m.jpg'}
json.dump(meta, open(f'{dst}/room.json', 'w'), indent=1)
shutil.rmtree(tmp)
for f in ('room.glb', 'room_m.glb', 'room_lm.webp', 'room_lm_m.webp', 'sky.jpg', 'sky_m.jpg', 'room.json'):
    print(f'{f:16s} {os.path.getsize(f"{dst}/{f}") / 1e6:6.2f} Mo')
