"""Débruite la lightmap (OpenImageDenoise via le compositeur de Blender) puis l'encode pour le jeu.
Processus séparé et léger (pas de scène 3D en mémoire).
    python denoise.py --dir OUT   (lit lm_raw.exr et lm_normal.exr ; écrit lm_dn.exr, lm.png, room_meta.json)"""
import bpy, numpy as np, argparse, os, json, math, time
from PIL import Image
ap = argparse.ArgumentParser(); ap.add_argument('--dir', required=True); ap.add_argument('--samples', type=int, default=0)
A = ap.parse_args(); D = A.dir; t0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True); S = bpy.context.scene
raw = bpy.data.images.load(os.path.join(D, 'lm_raw.exr')); n = raw.size[0]
nrm = bpy.data.images.load(os.path.join(D, 'lm_normal.exr'))
px = np.empty(n * n * 4, np.float32); nrm.pixels.foreach_get(px); px = px.reshape(-1, 4); px[:, :3] = px[:, :3] * 2 - 1
n2 = bpy.data.images.new('N2', n, n, alpha=True, float_buffer=True); n2.pixels.foreach_set(px.ravel()); del px
bpy.data.images.remove(nrm)
alb = bpy.data.images.new('AL', n, n, alpha=True, float_buffer=True); alb.pixels.foreach_set(np.ones(n * n * 4, np.float32))
ng = bpy.data.node_groups.new('DN', 'CompositorNodeTree'); S.compositing_node_group = ng
ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
a = ng.nodes.new('CompositorNodeImage'); a.image = raw
b = ng.nodes.new('CompositorNodeImage'); b.image = n2
c = ng.nodes.new('CompositorNodeImage'); c.image = alb
dn = ng.nodes.new('CompositorNodeDenoise'); out = ng.nodes.new('NodeGroupOutput')
ng.links.new(a.outputs['Image'], dn.inputs['Image']); ng.links.new(b.outputs['Image'], dn.inputs['Normal']); ng.links.new(c.outputs['Image'], dn.inputs['Albedo'])
try: dn.inputs['HDR'].default_value = True
except Exception: pass
ng.links.new(dn.outputs['Image'], out.inputs[0])
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); S.collection.objects.link(cam); S.camera = cam
S.render.engine = 'CYCLES'; S.cycles.samples = 1; S.render.resolution_x = S.render.resolution_y = n; S.render.resolution_percentage = 100
S.view_settings.view_transform = 'Standard'; S.render.image_settings.file_format = 'OPEN_EXR'; S.render.image_settings.color_depth = '32'
S.render.filepath = os.path.join(D, 'lm_dn.exr')
bpy.ops.render.render(write_still=True); print(f'débruité en {time.time() - t0:.0f} s', flush=True)
for im in (raw, n2, alb): bpy.data.images.remove(im)
r = bpy.data.images.load(S.render.filepath)
lmv = np.empty(n * n * 4, np.float32); r.pixels.foreach_get(lmv); lmv = lmv.reshape(n, n, 4)[..., :3]
lum = lmv @ np.array([.2126, .7152, .0722], np.float32)
P = float(np.percentile(lum[lum > 1e-4], 99.6)) * 2.0          # marge pour les zones très éclairées
enc = np.clip(lmv / P, 0, 1); del lmv
srgb = np.where(enc <= .0031308, enc * 12.92, 1.055 * np.power(enc, 1 / 2.4) - .055)
Image.fromarray((np.flipud(srgb) * 255 + .5).astype(np.uint8)).save(os.path.join(D, 'lm.png'))   # Blender : origine en bas
meta = {'lightMapIntensity': math.pi * P, 'size': n, 'samples': A.samples}
json.dump(meta, open(os.path.join(D, 'room_meta.json'), 'w'), indent=1); print('encodé', meta, flush=True)
