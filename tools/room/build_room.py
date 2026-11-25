"""Salle de classe réaliste : modélisation (mêmes cotes que scene.js), éclairage précalculé (Cycles), export glTF.

    python build_room.py --tex DIR --sky DIR --out DIR [--lm 4096] [--samples 256] [--preview] [--no-bake]

Le module bpy (Blender 5) est requis : pip install bpy (Python 3.11).
Repère : on écrit les coordonnées comme dans three.js (x droite, y haut, z vers le fond de la classe) ;
V() les convertit en coordonnées Blender (z haut). L'export glTF revient au repère three.js.

Éclairage précalculé (lightmap) : plafonniers, ciel vu par les fenêtres, écrans, et TOUS les rebonds,
y compris ceux du soleil. La lumière directe du soleil est exclue : le jeu la calcule en temps réel
(ombres mobiles des personnages)."""
import bpy, bmesh, math, os, sys, json, time, argparse, random, faulthandler
faulthandler.enable()
import numpy as np
from mathutils import Vector, Matrix

ap = argparse.ArgumentParser()
ap.add_argument('--tex', required=True); ap.add_argument('--sky', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--lm', type=int, default=2048); ap.add_argument('--samples', type=int, default=128)
ap.add_argument('--preview', action='store_true'); ap.add_argument('--no-bake', action='store_true')
ap.add_argument('--reuse', action='store_true'); ap.add_argument('--sun-scale', type=float, default=0.0); ap.add_argument('--pack-lm', type=int, default=0); ap.add_argument('--check', default=''); ap.add_argument('--bake-only', action='store_true'); ap.add_argument('--preview-samples', type=int, default=48); ap.add_argument('--cam', default='wide'); ap.add_argument('--only-preview', action='store_true')
A = ap.parse_args()
os.makedirs(A.out, exist_ok=True)
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:7.1f}s]', *a, flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
S = bpy.context.scene
S.render.engine = 'CYCLES'; S.cycles.device = 'CPU'
rnd = random.Random(761)

# ------------------------------------------------------------------ repère, collections
def V(x, y, z): return Vector((x, -z, y))           # three.js -> Blender
def coll(name):
    c = bpy.data.collections.get(name)
    if not c: c = bpy.data.collections.new(name); S.collection.children.link(c)
    return c
BAKE, EMIT, GLASS, IBL = coll('BAKE'), coll('EMIT'), coll('GLASS'), coll('IBL')
KIND = {'bake': BAKE, 'emit': EMIT, 'glass': GLASS, 'ibl': IBL}   # IBL : pièces trop fines pour la lightmap (éclairées par les reflets de la salle)

# ------------------------------------------------------------------ matériaux
def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c]
IMG = {}
def image(name, data=False):
    k = (name, data)
    if k not in IMG:
        im = bpy.data.images.load(os.path.join(A.tex, name + '.png')); im.colorspace_settings.name = 'Non-Color' if data else 'sRGB'; IMG[k] = im
    return IMG[k]
M = {}
def mat(name, color='#ffffff', rough=.6, metal=0., albedo=None, rmap=None, nmap=None, nstr=1., emit=None, estr=0., emap=None,
        coat=0., coat_rough=.12, tile=1.0, alpha=None, double=False):
    if name in M: return M[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    def tx(n, data):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = image(n, data); nt.links.new(uv.outputs['UV'], t.inputs['Vector']); return t
    b.inputs['Base Color'].default_value = (*lin(color), 1)
    if albedo: nt.links.new(tx(albedo, False).outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    if rmap: nt.links.new(tx(rmap, True).outputs['Color'], b.inputs['Roughness'])
    b.inputs['Metallic'].default_value = metal
    if nmap:
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.uv_map = 'UVMap'; nm.inputs['Strength'].default_value = nstr
        nt.links.new(tx(nmap, True).outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if emit or emap:
        b.inputs['Emission Color'].default_value = (*lin(emit or '#ffffff'), 1); b.inputs['Emission Strength'].default_value = estr
        if emap: nt.links.new(tx(emap, False).outputs['Color'], b.inputs['Emission Color'])
    if coat: b.inputs['Coat Weight'].default_value = coat; b.inputs['Coat Roughness'].default_value = coat_rough
    if alpha is not None:
        b.inputs['Alpha'].default_value = alpha
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    m.use_backface_culling = not double
    m['tile'] = tile; M[name] = m; return m

# matériaux de la salle (les textures viennent de textures.py)
mat('floor', albedo='floor_a', rmap='floor_r', nmap='floor_n', nstr=.6, coat=.55, coat_rough=.1, tile=1.22)
mat('block', albedo='block_a', rmap='block_r', nmap='block_n', nstr=1.0, tile=.8)
mat('plaster', albedo='plaster_a', nmap='plaster_n', nstr=.5, rough=.8, tile=1.0)
mat('ceiling', albedo='ceil_a', nmap='ceil_n', nstr=.8, rough=.95, tile=.6)
mat('tbar', '#efefeb', rough=.42)
mat('fixture', '#f3f3f0', rough=.35)
mat('laminate', albedo='lam_a', rmap='lam_r', nmap='lam_n', nstr=.4, tile=1.0)
mat('edge', '#36393d', rough=.45)
mat('steel', '#3f4348', rough=.42, metal=.35)
mat('chair', '#2c2f34', rmap='pp_r', nmap='pp_n', nstr=.8, tile=.25)
mat('wood', albedo='wood_a', rmap='wood_r', nmap='wood_n', nstr=.5, tile=1.0)
mat('frame', '#e9e9e5', rough=.38)                 # cadres de fenêtres peints
mat('sill', '#eeebe4', rough=.32)
mat('radiator', '#e8e6e0', rough=.42)
mat('base', '#2d2d2c', rough=.7)
mat('alu', '#c4c8cc', rough=.32, metal=.75)
mat('chrome', '#d9dce0', rough=.14, metal=1.0)
mat('board', '#f7f8f7', rmap='board_r', tile=1.0)
mat('doorframe', '#565b61', rough=.4, metal=.2)
mat('darkglass', '#1d2327', rough=.06)
mat('plastic_w', '#f1f0ec', rough=.38)
mat('plastic_k', '#1e2023', rough=.4)
mat('red', '#b31d17', rough=.28)
mat('cork', albedo='cork_a', nmap='cork_n', nstr=.8, rough=.85, tile=.5)
mat('paper', '#f6f4ee', rough=.8)
mat('poster', albedo='poster_a', rough=.35); mat('poster2', albedo='poster2_a', rough=.35)
for k in range(3): mat(f'sheet{k}', albedo=f'sheet{k}_a', rough=.8)
mat('clock', albedo='clock_a', rough=.25)
mat('pot', '#efeeea', rough=.3); mat('soil', '#2e241c', rough=.95)
mat('leaf', albedo='leaf_a', rough=.45, double=True)
mat('blind', '#d9d6cf', rough=.85, nmap='fabric_n', nstr=.6, tile=.3)
mat('fabric_k', '#232528', rough=.8, nmap='fabric_n', nstr=.8, tile=.3)
BAG = ['#1f3352', '#2a2a2c', '#5a5e63', '#7d2423', '#3f4f2e', '#1f5b63', '#6b4e2f', '#334a7a']
for i, c in enumerate(BAG): mat(f'bag{i}', c, rough=.78, nmap='fabric_n', nstr=.9, tile=.3)
mat('books', albedo='books_a', rough=.6)
mat('bottle_s', '#c9ced3', rough=.25, metal=.9); mat('bottle_b', '#24548f', rough=.35, metal=.6); mat('bottle_k', '#1f2124', rough=.4, metal=.4)
mat('laptop_s', '#b8bcc1', rough=.3, metal=.75); mat('laptop_k', '#2b2d31', rough=.35, metal=.4)
mat('phone', '#0f1012', rough=.12)
mat('cup', '#f3f1ec', rough=.5); mat('sleeve', '#8a6542', rough=.8)
mat('marker_b', '#1d4fa8', rough=.4); mat('marker_r', '#b3261e', rough=.4); mat('marker_k', '#222222', rough=.4); mat('marker_g', '#2d7d46', rough=.4)
# émissifs (sources de lumière, non précalculés)
mat('light', '#fff3e3', emit='#fff3e3', estr=8.0, rough=.5)
mat('screen', '#20303a', emit='#33414a', estr=.35, rough=.9)
mat('exit', albedo='exit_a', emap='exit_a', estr=2.2, rough=.4)
mat('display', '#9fb8d8', emit='#a9c4e8', estr=.9, rough=.2); mat('display2', '#d8e2ec', emit='#e4ecf5', estr=.9, rough=.2)
mat('glass', '#cfe2ea', rough=.04, alpha=.12)

# ------------------------------------------------------------------ géométrie
OBJS = []
def new_obj(name, bm, m, kind='bake', lmw=1.0, uv='box', smooth=0, bevel=0., seg=3):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); KIND[kind].objects.link(ob)
    me.materials.append(M[m] if isinstance(m, str) else m)
    ob['lmw'] = lmw; ob['uv'] = uv; ob['smooth'] = smooth
    if bevel:
        for p in me.polygons: p.use_smooth = True
        md = ob.modifiers.new('bevel', 'BEVEL'); md.width = bevel; md.segments = seg; md.limit_method = 'ANGLE'
        md.angle_limit = math.radians(35); md.harden_normals = True; ob['hard'] = 1
    OBJS.append(ob); return ob
def RM(rx=0., ry=0., rz=0.):  # rotations autour des axes three.js (x, y vers le haut, z)
    return Matrix.Rotation(ry, 4, 'Z') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(-rz, 4, 'Y')
def bm_box(w, h, d, x, y, z, rx=0., ry=0., rz=0.):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * w, v.co.y * d, v.co.z * h))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(V(x, y, z)) @ RM(rx, ry, rz), verts=bm.verts); return bm
def box(name, w, h, d, x, y, z, m, kind='bake', bevel=.003, seg=3, lmw=1., rx=0., ry=0., rz=0., uv='box'):
    return new_obj(name, bm_box(w, h, d, x, y, z, rx, ry, rz), m, kind, lmw, uv=uv, bevel=bevel, seg=seg)
def bm_cyl(r, h, seg=16, r2=None, caps=True):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h); return bm
def cyl(name, r, h, x, y, z, m, seg=16, r2=None, axis='y', kind='bake', lmw=1., caps=True, rot=0.):
    bm = bm_cyl(r, h, seg, r2, caps)
    A_ = {'y': Matrix.Identity(4), 'x': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'z': Matrix.Rotation(math.pi / 2, 4, 'X')}[axis]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(V(x, y, z)) @ RM(ry=rot) @ A_, verts=bm.verts)
    return new_obj(name, bm, m, kind, lmw, smooth=40)
def tube(name, p1, p2, r, m, seg=12, kind='bake', lmw=.6):
    a, b = V(*p1), V(*p2); d = b - a; L = d.length
    bm = bm_cyl(r, L, seg, caps=True)
    q = d.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ q, verts=bm.verts)
    return new_obj(name, bm, m, kind, lmw, smooth=40)
FACE = {'+z': Matrix.Rotation(math.pi / 2, 4, 'X'), '-z': Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'),
        '+x': Matrix.Rotation(math.pi / 2, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'), '-x': Matrix.Rotation(-math.pi / 2, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'),
        'up': Matrix.Identity(4), 'down': Matrix.Rotation(math.pi, 4, 'X')}
def plane(name, w, h, x, y, z, m, face='+z', kind='bake', lmw=1., uv='keep', spin=0.):
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=.5, calc_uvs=True)
    for v in bm.verts: v.co.x *= w; v.co.y *= h
    bmesh.ops.transform(bm, matrix=Matrix.Translation(V(x, y, z)) @ FACE[face] @ Matrix.Rotation(spin, 4, 'Z'), verts=bm.verts)
    return new_obj(name, bm, m, kind, lmw, uv=uv)
def disc(name, r, x, y, z, m, face='+z', seg=48, kind='bake', lmw=1.):
    bm = bmesh.new(); res = bmesh.ops.create_circle(bm, cap_ends=True, segments=seg, radius=r)
    uvl = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        for l in f.loops: l[uvl].uv = (.5 + l.vert.co.x / (2 * r), .5 + l.vert.co.y / (2 * r))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(V(x, y, z)) @ FACE[face], verts=bm.verts)
    return new_obj(name, bm, m, kind, lmw, uv='keep')
def rbox(name, w, h, d, x, y, z, m, r=.03, seg=4, lmw=.7, **k):   # boîte aux bords très arrondis (sacs, coussins)
    return box(name, w, h, d, x, y, z, m, bevel=r, seg=seg, lmw=lmw, **k)

# ================================================================== LA SALLE
log('modélisation')
# ---- coque : sol, plafond, murs
SHELL = []
SHELL.append(box('floor', 16, .1, 13, 0, -.05, 0, 'floor', bevel=0, lmw=1.45))
SHELL.append(box('ceiling', 16, .1, 13, 0, 3.30, 0, 'ceiling', bevel=0, lmw=.55))
SHELL.append(box('wall_front', 16.5, 3.4, .25, 0, 1.7, -6.625, 'plaster', bevel=0, lmw=.85))
SHELL.append(box('wall_back', 16.5, 3.4, .25, 0, 1.7, 6.625, 'block', bevel=0, lmw=.8))
WIN = [(-5.3, -2.7), (-1.3, 1.3), (2.7, 5.3)]
SHELL.append(box('wall_left_low', .25, .9, 13, -8.125, .45, 0, 'block', bevel=0, lmw=.8))
SHELL.append(box('wall_left_high', .25, .8, 13, -8.125, 3.0, 0, 'block', bevel=0, lmw=.8))
for i, (a, b) in enumerate([(-6.5, -5.3), (-2.7, -1.3), (1.3, 2.7), (5.3, 6.5)]):
    SHELL.append(box(f'pier{i}', .25, 1.7, b - a, -8.125, 1.75, (a + b) / 2, 'block', bevel=0, lmw=.8))
DZ0, DZ1 = -2.35, -1.05                                     # ouverture de la porte (mur de droite)
SHELL.append(box('wall_right_a', .25, 3.4, DZ0 + 6.5, 8.125, 1.7, (-6.5 + DZ0) / 2, 'block', bevel=0, lmw=.8))
SHELL.append(box('wall_right_b', .25, 3.4, 6.5 - DZ1, 8.125, 1.7, (6.5 + DZ1) / 2, 'block', bevel=0, lmw=.8))
SHELL.append(box('wall_right_c', .25, 1.25, DZ1 - DZ0, 8.125, 2.775, (DZ0 + DZ1) / 2, 'block', bevel=0, lmw=.8))

# ---- fenêtres : cadres peints, vitrage, tablettes, convecteurs, stores
for i, (a, b) in enumerate(WIN):
    zc, L = (a + b) / 2, b - a
    for y, h in ((.925, .05), (2.575, .05), (2.05, .04)):
        box(f'win{i}_h{y}', .07, h, L, -8.10, y, zc, 'frame', bevel=.004, lmw=.5)
    for z in (a + .025, zc, b - .025):
        box(f'win{i}_v{z}', .07, 1.7, .05 if z != zc else .045, -8.10, 1.75, z, 'frame', bevel=.004, lmw=.5)
    plane(f'glass{i}', L, 1.7, -8.10, 1.75, zc, 'glass', face='+x', kind='glass')
    box(f'sill{i}', .32, .035, L + .1, -7.86, .9175, zc, 'sill', bevel=.006, lmw=.9)
    n = int((L - .4) / .075)
    for k in range(n):
        box(f'rad{i}_{k}', .07, .5, .055, -7.915, .46, zc - (n - 1) * .075 / 2 + k * .075, 'radiator', bevel=.012, seg=3, lmw=.35)
    for yy in (.2, .71):
        cyl(f'radpipe{i}_{yy}', .018, (n - 1) * .075 + .08, -7.915, yy, zc, 'radiator', axis='z', lmw=.35)
    box(f'blindbox{i}', .09, .09, L - .02, -7.955, 2.655, zc, 'plastic_w', bevel=.01, lmw=.5)
box('blind2', .006, .85, WIN[2][1] - WIN[2][0] - .08, -7.95, 2.2, sum(WIN[2]) / 2, 'blind', bevel=0, lmw=.7)
box('blindbar2', .025, .03, WIN[2][1] - WIN[2][0] - .06, -7.95, 1.775, sum(WIN[2]) / 2, 'alu', bevel=.006, lmw=.3)

# ---- plinthes (vinyle)
box('base_f', 16, .1, .006, 0, .05, -6.497, 'base', bevel=0, lmw=.4)
box('base_b', 16, .1, .006, 0, .05, 6.497, 'base', bevel=0, lmw=.4)
box('base_l', .006, .1, 13, -7.997, .05, 0, 'base', bevel=0, lmw=.4)
box('base_r1', .006, .1, DZ0 - .07 + 6.5, 7.997, .05, (-6.5 + DZ0 - .07) / 2, 'base', bevel=0, lmw=.4)
box('base_r2', .006, .1, 6.5 - DZ1 - .07, 7.997, .05, (6.5 + DZ1 + .07) / 2, 'base', bevel=0, lmw=.4)

# ---- porte : cadre métallique, battant en chêne, hublot, poignée, plaque de propreté, ferme-porte
for z in (DZ0 + .025, DZ1 - .025):
    box(f'jamb{z}', .27, 2.17, .05, 8.125, 1.085, z, 'doorframe', bevel=.004, lmw=.4)
box('head', .27, .05, DZ1 - DZ0, 8.125, 2.145, (DZ0 + DZ1) / 2, 'doorframe', bevel=.004, lmw=.4)
for z in (DZ0 - .03, DZ1 + .03):
    box(f'casing{z}', .015, 2.2, .06, 7.995, 1.1, z, 'doorframe', bevel=.003, lmw=.4)
box('casing_top', .015, .06, DZ1 - DZ0 + .12, 7.995, 2.2, (DZ0 + DZ1) / 2, 'doorframe', bevel=.003, lmw=.4)
door = box('door', .045, 2.09, 1.2, 8.10, 1.055, -1.7, 'wood', bevel=.003, lmw=.8, uv='box_v')
box('door_glass', .004, .7, .14, 8.077, 1.55, -1.42, 'darkglass', bevel=0, lmw=.3)
for (h, w, y, z) in ((.03, .2, 1.915, -1.42), (.03, .2, 1.185, -1.42), (.76, .03, 1.55, -1.505), (.76, .03, 1.55, -1.335)):
    box(f'door_gframe{y}{z}', .012, h, w, 8.073, y, z, 'doorframe', bevel=.002, lmw=.2)
cyl('door_rose', .032, .012, 8.072, 1.0, -2.18, 'chrome', axis='x', lmw=.15)
box('door_lever', .02, .022, .13, 8.055, 1.0, -2.13, 'chrome', bevel=.006, lmw=.15)
box('kick', .002, .25, 1.14, 8.0765, .135, -1.7, 'alu', bevel=0, lmw=.3)
box('closer', .06, .055, .3, 8.05, 2.05, -1.36, 'alu', bevel=.008, lmw=.2)
for y in (.25, 1.05, 1.85): cyl(f'hinge{y}', .012, .11, 8.075, y, -1.105, 'alu', lmw=.1)
box('exit_box', .07, .2, .4, 7.965, 2.42, -1.7, 'plastic_w', bevel=.008, lmw=.2)
plane('exit_face', .38, .18, 7.9295, 2.42, -1.7, 'exit', face='-x', kind='emit')
box('switch', .008, .115, .072, 7.996, 1.2, -2.55, 'plastic_w', bevel=.002, lmw=.15)
box('switch_t', .012, .03, .012, 7.99, 1.2, -2.55, 'plastic_w', bevel=.002, lmw=.05)
box('thermo', .02, .09, .13, 7.99, 1.45, -.2, 'plastic_w', bevel=.008, lmw=.15)
# extincteur sur support mural
cyl('ext_body', .075, .42, 7.83, .55, -.6, 'red', seg=24, lmw=.4)
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=.075)
for v in bm.verts:
    if v.co.z < 0: v.co.z = 0
bmesh.ops.transform(bm, matrix=Matrix.Translation(V(7.83, .76, -.6)), verts=bm.verts); new_obj('ext_top', bm, 'red', lmw=.3, smooth=50)
box('ext_valve', .05, .07, .05, 7.83, .87, -.6, 'plastic_k', bevel=.008, lmw=.1)
box('ext_handle', .025, .015, .12, 7.83, .9, -.56, 'alu', bevel=.004, lmw=.05)
tube('ext_hose', (7.83, .87, -.64), (7.80, .45, -.69), .009, 'plastic_k')
box('ext_bracket', .02, .12, .1, 7.985, .6, -.6, 'plastic_k', bevel=.004, lmw=.1)

# ---- plafond : ossature en T, luminaires encastrés, diffuseurs d'air, détecteur
XL = [-7.8 + 1.2 * k for k in range(14)]; ZL = [-6.3 + .6 * k for k in range(22)]
for x in XL: box(f'tb_x{x:.1f}', .024, .012, 13, x, 3.244, 0, 'tbar', bevel=0, kind='ibl')
for z in ZL: box(f'tb_z{z:.1f}', 16, .012, .024, 0, 3.244, z, 'tbar', bevel=0, kind='ibl')
LIGHTS = [(x, z) for x in (-4.8, 0, 4.8) for z in (-3.0, .6, 4.2)]
for i, (x, z) in enumerate(LIGHTS):
    for (w, d, dx, dz) in ((1.2, .035, 0, -.2825), (1.2, .035, 0, .2825), (.035, .6, -.5825, 0), (.035, .6, .5825, 0)):
        box(f'troffer{i}_{dx}{dz}', w, .03, d, x + dx, 3.232, z + dz, 'fixture', bevel=.003, kind='ibl')
    box(f'troffer{i}_mid', .02, .02, .53, x, 3.237, z, 'fixture', bevel=.002, kind='ibl')
    for sx in (-.285, .285): plane(f'lamp{i}_{sx}', .545, .53, x + sx, 3.236, z, 'light', face='down', kind='emit')
for i, (x, z) in enumerate([(-2.4, -1.2), (2.4, 2.4), (-2.4, 4.2)]):
    for k, s in enumerate((.58, .44, .30)):
        for (w, d, dx, dz) in ((s, .03, 0, -s / 2), (s, .03, 0, s / 2), (.03, s, -s / 2, 0), (.03, s, s / 2, 0)):
            box(f'hvac{i}_{k}_{dx}{dz}', w, .012 + k * .008, d, x + dx, 3.243 - k * .006, z + dz, 'fixture', bevel=0, kind='ibl')
    box(f'hvac{i}_c', .2, .02, .2, x, 3.228, z, 'fixture', bevel=.003, kind='ibl')
cyl('smoke', .06, .03, 0, 3.235, -1.2, 'fixture', kind='ibl')

# ---- mur avant : tableau blanc, écran de projection, horloge, affiche
for (w, h, x, y) in ((4.7, .05, -1.2, 2.3), (4.7, .05, -1.2, .9), (.05, 1.45, -3.525, 1.6), (.05, 1.45, 1.125, 1.6)):
    box(f'bframe{x}{y}', w, h, .03, x, y, -6.485, 'alu', bevel=.006, lmw=.4)
plane('board', 4.6, 1.35, -1.2, 1.6, -6.4845, 'board', face='+z', lmw=1.2)
box('tray', 4.4, .025, .09, -1.2, .885, -6.44, 'alu', bevel=.004, lmw=.4)
box('tray_lip', 4.4, .035, .008, -1.2, .893, -6.396, 'alu', bevel=.002, lmw=.2)
for k, c in enumerate(['marker_b', 'marker_r', 'marker_k', 'marker_g']):
    cyl(f'marker{k}', .009, .13, -2.45 + k * .07, .907, -6.43, c, seg=10, axis='x', lmw=.05)
box('eraser', .15, .035, .055, -1.6, .915, -6.435, 'plastic_k', bevel=.006, lmw=.1)
box('scr_case', 3.0, .1, .12, 4.5, 2.83, -6.43, 'plastic_w', bevel=.012, lmw=.4)
plane('screen', 2.86, 1.7, 4.5, 1.92, -6.42, 'screen', face='+z', kind='emit')
box('scr_bar', 2.88, .025, .02, 4.5, 1.06, -6.415, 'plastic_k', bevel=.004, lmw=.2)
bm = bm_cyl(.2, .045, 48, caps=False); bmesh.ops.transform(bm, matrix=Matrix.Translation(V(-5.6, 2.65, -6.475)) @ Matrix.Rotation(math.pi / 2, 4, 'X'), verts=bm.verts)
new_obj('clock_rim', bm, 'plastic_k', lmw=.3, smooth=40)
disc('clock_face', .195, -5.6, 2.65, -6.485, 'clock', lmw=.5)
plane('poster', .6, .84, 6.9, 1.7, -6.496, 'poster', face='+z', lmw=.6)
for (w, h, x, y) in ((.63, .015, 6.9, 2.127), (.63, .015, 6.9, 1.273), (.015, .87, 6.592, 1.7), (.015, .87, 7.208, 1.7)):
    box(f'pframe{x}{y}', w, h, .012, x, y, -6.494, 'plastic_k', bevel=.002, lmw=.1)
plane('poster2', .45, .63, 7.9965, 1.5, -3.3, 'poster2', face='-x', lmw=.5)
for k, x in enumerate((-6.0, 3.0)): box(f'outlet_f{k}', .07, .11, .006, x, .3, -6.497, 'plastic_w', bevel=.002, lmw=.05)

# ---- mur du fond : babillard en liège avec feuilles punaisées
box('cork_frame_t', 2.44, .035, .03, -3.0, 2.15, 6.485, 'alu', bevel=.005, lmw=.3)
box('cork_frame_b', 2.44, .035, .03, -3.0, .95, 6.485, 'alu', bevel=.005, lmw=.3)
box('cork_frame_l', .035, 1.235, .03, -4.2, 1.55, 6.485, 'alu', bevel=.005, lmw=.3)
box('cork_frame_r', .035, 1.235, .03, -1.8, 1.55, 6.485, 'alu', bevel=.005, lmw=.3)
box('cork', 2.36, 1.165, .012, -3.0, 1.55, 6.492, 'cork', bevel=0, lmw=.8)
for k, (x, y, s) in enumerate([(-3.8, 1.75, .04), (-3.05, 1.6, -.03), (-2.3, 1.72, .02)]):
    plane(f'sheet{k}', .21, .297, x, y, 6.4855, f'sheet{k}', face='-z', lmw=.4, spin=s)
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=.007)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(V(x, y + .13, 6.482)), verts=bm.verts); new_obj(f'pin{k}', bm, ['marker_r', 'marker_b', 'marker_g'][k], lmw=.02, smooth=60)
for k, x in enumerate((-5.0, 0.0, 5.0)): box(f'outlet_b{k}', .07, .11, .006, x, .3, 6.497, 'plastic_w', bevel=.002, lmw=.05)

# ---- bureau du prof (chêne), chaise de bureau, objets
box('tdesk_top', 1.7, .035, .8, -4.4, .757, -4.9, 'wood', bevel=.004, lmw=1.0)
box('tdesk_modesty', 1.62, .62, .025, -4.4, .42, -4.53, 'wood', bevel=.003, lmw=.6)
for x in (-5.235, -3.565): box(f'tdesk_side{x}', .03, .74, .76, x, .37, -4.9, 'wood', bevel=.003, lmw=.6)
box('tdesk_ped', .42, .6, .7, -3.84, .32, -4.95, 'wood', bevel=.003, lmw=.5)
for k, y in enumerate((.52, .3)):
    box(f'tdesk_drw{k}', .4, .2, .006, -3.84, y, -4.598, 'wood', bevel=.002, lmw=.2)
    box(f'tdesk_pull{k}', .12, .012, .012, -3.84, y + .06, -4.59, 'chrome', bevel=.003, lmw=.05)
box('papers', .21, .02, .297, -4.85, .785, -4.85, 'paper', bevel=.001, lmw=.2, ry=.15)
cyl('mug', .042, .1, -3.75, .825, -4.75, 'cup', seg=24, lmw=.15)
cyl('pencup', .035, .1, -5.0, .825, -5.1, 'plastic_k', seg=20, lmw=.1)
for k in range(3): tube(f'pen{k}', (-5.0 + k * .01 - .01, .82, -5.1), (-5.0 + k * .02 - .02, .94, -5.1 + k * .01), .004, ['marker_b', 'marker_r', 'marker_k'][k], seg=6)
# chaise de bureau (dossier vers le tableau)
cx, cz = -4.55, -5.72
for k in range(5):
    a = k / 5 * 2 * math.pi + .3
    box(f'oc_leg{k}', .3, .03, .045, cx + math.cos(a) * .15, .07, cz + math.sin(a) * .15, 'plastic_k', bevel=.008, lmw=.1, ry=-a)
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=.025)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(V(cx + math.cos(a) * .3, .025, cz + math.sin(a) * .3)), verts=bm.verts); new_obj(f'oc_caster{k}', bm, 'plastic_k', lmw=.05, smooth=60)
cyl('oc_gas', .025, .34, cx, .26, cz, 'chrome', lmw=.1)
rbox('oc_seat', .5, .09, .48, cx, .47, cz, 'fabric_k', r=.035, lmw=.4)
rbox('oc_back', .46, .52, .07, cx, .88, cz - .25, 'fabric_k', r=.03, lmw=.4, rx=.12)
for s in (-1, 1):
    box(f'oc_arm{s}', .05, .03, .26, cx + s * .27, .66, cz - .02, 'plastic_k', bevel=.01, lmw=.1)
    box(f'oc_armp{s}', .03, .18, .03, cx + s * .27, .56, cz - .08, 'plastic_k', bevel=.005, lmw=.05)

# ---- plantes (sansevieria) dans des pots en céramique
def leaf(name, base, L, w, lean, yaw, twist):
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); rows = 9; verts = []
    for i in range(rows):
        t = i / (rows - 1); half = w * (1 - .82 * t ** 1.4) / 2
        cx_ = base[0] + math.cos(yaw) * lean * L * t * t; cz_ = base[2] + math.sin(yaw) * lean * L * t * t; cy = base[1] + L * t
        ang = yaw + math.pi / 2 + twist * t
        row = []
        for s in (-1, 0, 1):
            off = s * half; fold = (.18 * half if s == 0 else 0)
            p = V(cx_ + math.cos(ang) * off - math.cos(yaw) * fold, cy, cz_ + math.sin(ang) * off - math.sin(yaw) * fold)
            row.append(bm.verts.new(p))
        verts.append(row)
    for i in range(rows - 1):
        for j in range(2):
            f = bm.faces.new((verts[i][j], verts[i][j + 1], verts[i + 1][j + 1], verts[i + 1][j]))
            for l, (u, v) in zip(f.loops, ((j / 2, i / (rows - 1)), ((j + 1) / 2, i / (rows - 1)), ((j + 1) / 2, (i + 1) / (rows - 1)), (j / 2, (i + 1) / (rows - 1)))):
                l[uvl].uv = (u, v)
    return new_obj(name, bm, 'leaf', lmw=.35, uv='keep', smooth=70)
for p, (px, pz) in enumerate([(-7.4, 6.0), (7.4, -6.0), (-7.4, -6.0)]):
    cyl(f'pot{p}', .2, .42, px, .21, pz, 'pot', seg=32, r2=.17, lmw=.5)
    disc(f'soil{p}', .185, px, .395, pz, 'soil', face='up', seg=24, lmw=.2)
    for k in range(13):
        a = rnd.uniform(0, 2 * math.pi); rr = rnd.uniform(0, .11)
        leaf(f'leaf{p}_{k}', (px + math.cos(a) * rr, .39, pz + math.sin(a) * rr), rnd.uniform(.55, 1.0), rnd.uniform(.05, .085), rnd.uniform(.05, .3), a, rnd.uniform(-.6, .6))

# ---- poubelles
bm = bm_cyl(.17, .5, 32, r2=.15, caps=False)
bmesh.ops.transform(bm, matrix=Matrix.Translation(V(7.6, .25, .2)), verts=bm.verts); new_obj('bin', bm, 'plastic_k', lmw=.4, smooth=40)
disc('bin_bottom', .16, 7.6, .02, .2, 'plastic_k', face='up', lmw=.1)
rbox('recycle', .3, .55, .32, 7.62, .275, .7, 'bottle_b', r=.02, lmw=.4)

# ---- projecteur au plafond
rbox('proj', .36, .13, .3, 4.5, 3.10, -2.0, 'plastic_w', r=.025, lmw=.25)
cyl('proj_lens', .045, .05, 4.42, 3.095, -2.165, 'plastic_k', axis='z', lmw=.05)
cyl('proj_pole', .02, .1, 4.5, 3.2, -2.0, 'fixture', kind='ibl')
cyl('proj_plate', .07, .01, 4.5, 3.245, -2.0, 'fixture', kind='ibl')

# ---- tables (stratifié, chant, piètement acier) et chaises (coque polypropylène)
ROWS, TABLES = [-2.6, -.6, 1.4, 3.4], [-4.6, 0, 4.6]
def catmull(pts, n):
    out = []
    P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = map(Vector, (P[i - 1], P[i], P[i + 1], P[i + 2]))
        for k in range(n):
            t = k / n
            out.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(Vector(pts[-1])); return out
# profil de la coque (dz vers le dossier, y) : lèvre avant -> assise -> courbe -> dossier
PROFILE = catmull([(-.215, .452), (-.2, .478), (-.15, .487), (0, .482), (.13, .478), (.19, .49), (.225, .54), (.245, .64), (.262, .76), (.275, .88), (.272, .925)], 4)
def chair(name, sx, sz):
    """coque d'une chaise d'étudiant, centrée sur le siège (sx, sz + .06), tournée vers le tableau"""
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); NU = 12; grid = []
    for i, p in enumerate(PROFILE):
        dz, y = p.x, p.y; back = max(0., min(1., (dz - .17) / .08)); row = []
        for j in range(NU + 1):
            u = j / NU * 2 - 1; half = .22 - .012 * back
            yy = y + .012 * u * u * (1 - back); zz = dz - .03 * u * u * back
            row.append(bm.verts.new(V(sx + u * half, yy, sz + .06 + zz)))
        grid.append(row)
    for i in range(len(grid) - 1):
        for j in range(NU): bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:            # normales vers le haut (assise) / vers l'élève (dossier)
        if f.normal.z < 0 and abs(f.normal.z) > .3: f.normal_flip()
    ob = new_obj(name, bm, 'chair', lmw=.55, smooth=80)
    sol = ob.modifiers.new('solid', 'SOLIDIFY'); sol.thickness = .009; sol.offset = -1
    # piètement : 4 pieds, montants du dossier, longerons
    for s in (-1, 1):
        tube(f'{name}_fl{s}', (sx + s * .21, 0, sz - .12), (sx + s * .195, .45, sz - .09), .011, 'steel', seg=10)
        tube(f'{name}_bl{s}', (sx + s * .21, 0, sz + .31), (sx + s * .195, .45, sz + .25), .011, 'steel', seg=10)
        tube(f'{name}_rail{s}', (sx + s * .195, .45, sz - .09), (sx + s * .195, .45, sz + .25), .01, 'steel', seg=10)
        tube(f'{name}_up{s}', (sx + s * .195, .45, sz + .25), (sx + s * .17, .74, sz + .315), .01, 'steel', seg=10)
    tube(f'{name}_cross', (sx - .195, .44, sz - .09), (sx + .195, .44, sz - .09), .009, 'steel', seg=10)
SEATS = []
for r in ROWS:
    for c in TABLES:
        box(f'top{c}_{r}', 2.7, .028, .7, c, .746, r, 'laminate', bevel=.002, lmw=1.35)
        for s in (-1, 1):
            box(f'edge_z{c}_{r}_{s}', 2.704, .03, .004, c, .746, r + s * .351, 'edge', bevel=0, lmw=.2)
            box(f'edge_x{c}_{r}_{s}', .004, .03, .708, c + s * 1.351, .746, r, 'edge', bevel=0, lmw=.2)
        for sx in (-1, 1):
            for sz in (-1, 1): box(f'leg{c}_{r}_{sx}{sz}', .04, .73, .04, c + sx * 1.27, .3665, r + sz * .27, 'steel', bevel=.004, lmw=.3)
            box(f'srail{c}_{r}_{sx}', .02, .05, .5, c + sx * 1.27, .705, r, 'steel', bevel=.003, lmw=.2)
        for sz in (-1, 1): box(f'arail{c}_{r}_{sz}', 2.5, .05, .02, c, .705, r + sz * .27, 'steel', bevel=.003, lmw=.2)
        box(f'foot{c}_{r}', 2.5, .03, .03, c, .12, r - .27, 'steel', bevel=.003, lmw=.2)
        for o in (-.9, 0, .9): SEATS.append((c + o, r + .62, c, r))
for k, (sx, sz, c, r) in enumerate(SEATS): chair(f'chair{k}', sx, sz)

# ---- objets des élèves (déterministes) : portables, cahiers, gourdes, téléphones, trousses, sacs
def laptop(name, x, z, ry, alu, y0=.76):
    """ordinateur portable ouvert ; l'écran regarde vers +z local (vers l'élève), tourné de ry"""
    m = 'laptop_s' if alu else 'laptop_k'
    def off(lx, lz): return x + lx * math.cos(ry) + lz * math.sin(ry), z - lx * math.sin(ry) + lz * math.cos(ry)
    box(f'{name}_b', .31, .016, .215, x, y0 + .008, z, m, bevel=.004, lmw=.12, ry=ry)
    lid, tilt = .21, .2
    ly, lz = y0 + .016 + lid / 2 * math.cos(tilt), -.1075 - lid / 2 * math.sin(tilt)
    px, pz = off(0, lz); box(f'{name}_l', .31, lid, .007, px, ly, pz, m, bevel=.003, lmw=.12, rx=-tilt, ry=ry)
    px, pz = off(0, lz + .0042 * math.cos(tilt))
    box(f'{name}_d', .285, .175, .001, px, ly + .0042 * math.sin(tilt), pz, rnd.choice(['display', 'display2']), kind='emit', bevel=0, rx=-tilt, ry=ry)
laptop('tdesk', -4.2, -4.95, math.pi, False, y0=.7745)
for k, (sx, sz, c, r) in enumerate(SEATS):
    z0 = r + .14; slots = [-.18, .02, .22]; rnd.shuffle(slots)
    if rnd.random() < .38: laptop(f'lap{k}', sx + slots.pop() * .6, z0, rnd.uniform(-.12, .12), rnd.random() < .6)
    if rnd.random() < .5:
        x = sx + slots.pop() * .9 if slots else sx
        col = rnd.choice(['bag0', 'bag3', 'bag4', 'bag5', 'paper'])
        box(f'nb{k}', .21, .012, .28, x, .766, z0 + .03, col, bevel=.002, lmw=.12, ry=rnd.uniform(-.25, .25))
        if rnd.random() < .6: tube(f'pen_s{k}', (x - .05, .776, z0), (x + .07, .776, z0 + .05), .004, rnd.choice(['marker_b', 'marker_k']), seg=6)
    if rnd.random() < .3:
        x = sx + rnd.choice([-.3, .3]); bm_ = rnd.choice(['bottle_s', 'bottle_b', 'bottle_k'])
        cyl(f'bottle{k}', .035, .22, x, .87, r - .05, bm_, seg=20, lmw=.1); cyl(f'cap{k}', .025, .04, x, 1.0, r - .05, 'plastic_k', seg=16, lmw=.03)
    if rnd.random() < .22: box(f'phone{k}', .075, .008, .15, sx + rnd.uniform(-.25, .25), .764, z0 + .12, 'phone', bevel=.004, lmw=.05, ry=rnd.uniform(-.5, .5))
    if rnd.random() < .12: rbox(f'case{k}', .2, .05, .07, sx + rnd.uniform(-.2, .2), .785, z0 - .1, f'bag{rnd.randrange(len(BAG))}', r=.02, lmw=.1, ry=rnd.uniform(-.4, .4))
    if rnd.random() < .08:
        cyl(f'cup{k}', .04, .12, sx + .3, .82, r - .1, 'cup', seg=20, r2=.032, lmw=.08); cyl(f'sleeve{k}', .042, .05, sx + .3, .82, r - .1, 'sleeve', seg=20, r2=.036, lmw=.05)
    if c - 1.3 < sx - .45 and rnd.random() < .42:      # sac à dos entre deux chaises
        bx = sx - .45; m_ = f'bag{rnd.randrange(len(BAG))}'; ry = rnd.uniform(-.25, .25) + math.pi / 2
        rbox(f'bag{k}', .3, .42, .17, bx, .215, sz + .05, m_, r=.055, seg=4, lmw=.3, ry=ry, rx=rnd.uniform(-.12, .05))
        rbox(f'bagp{k}', .22, .19, .06, bx + .1 * math.sin(ry), .16, sz + .05 + .1 * math.cos(ry), m_, r=.025, seg=3, lmw=.15, ry=ry)
log('objets', len(OBJS))

# ------------------------------------------------------------------ finalisation : modificateurs, lissage, UV de texture
def finalize():
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in OBJS:
        if ob.modifiers:
            ev = ob.evaluated_get(dg); me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
            old = ob.data; ob.modifiers.clear(); ob.data = me; bpy.data.meshes.remove(old)
        me = ob.data
        if not ob.get('hard'):
            sm = ob['smooth']
            for p in me.polygons: p.use_smooth = sm > 0
            if sm > 0:
                try: me.set_sharp_from_angle(angle=math.radians(sm))
                except Exception: pass
        if not me.uv_layers.get('UVMap'):
            if me.uv_layers: me.uv_layers[0].name = 'UVMap'
            else: me.uv_layers.new(name='UVMap')
        mode = ob['uv']
        if mode in ('box', 'box_v'):
            tile = me.materials[0].get('tile', 1.0)
            bm = bmesh.new(); bm.from_mesh(me); uvl = bm.loops.layers.uv['UVMap']
            for f in bm.faces:
                n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
                for l in f.loops:
                    p = l.vert.co
                    if ax == 0: u, v = p.y * (1 if n.x > 0 else -1), p.z
                    elif ax == 1: u, v = p.x * (-1 if n.y > 0 else 1), p.z
                    else: u, v = p.x, p.y * (1 if n.z > 0 else -1)
                    if mode == 'box_v': u, v = v, u
                    l[uvl].uv = (u / tile, v / tile)
            bm.to_mesh(me); bm.free()
        a = me.attributes.new('lmw', 'FLOAT', 'FACE'); a.data.foreach_set('value', [float(ob['lmw'])] * len(me.polygons))
finalize()
def strip_hidden(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data); dead = []
    for f in bm.faces:
        c = f.calc_center_median(); n = f.normal; x, z, y = c.x, -c.y, c.z      # retour en coordonnées three.js
        nx, nz, ny = n.x, -n.y, n.z
        if ob.name == 'floor': kill = ny < .9
        elif ob.name == 'ceiling': kill = ny > -.9
        else: kill = (abs(x) > 8.249 or abs(z) > 6.749 or (abs(ny) > .9 and (y < .001 or y > 3.399))
                      or (abs(nz) > .9 and abs(z) > 6.499 and abs(x) > 7.99) or (abs(nx) > .9 and abs(x) > 8.249))
        if kill: dead.append(f)
    bmesh.ops.delete(bm, geom=dead, context='FACES'); bm.to_mesh(ob.data); bm.free()
for ob in SHELL: strip_hidden(ob)
log('finalisé')

def join(c, name):
    obs = [o for o in c.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]; bpy.ops.object.join(); o = bpy.context.view_layer.objects.active; o.name = name; return o
room, emit, glass, props = join(BAKE, 'Room'), join(EMIT, 'Emissive'), join(GLASS, 'Glass'), join(IBL, 'Props')
log('triangles', sum(len(p.vertices) - 2 for p in room.data.polygons), '(+', sum(len(p.vertices) - 2 for p in emit.data.polygons), 'émissifs)')
for ob in (glass,):          # le vitrage laisse passer la lumière du ciel pendant le précalcul
    ob.visible_diffuse = ob.visible_glossy = ob.visible_shadow = ob.visible_transmission = ob.visible_volume_scatter = False

# ------------------------------------------------------------------ lumières : soleil (rebonds seulement), ciel
SUNP, SUNT = (-16, 5.6, 7), (0, 0, .5)
d = (V(*SUNT) - V(*SUNP)).normalized()
sun = bpy.data.lights.new('Sun', 'SUN'); sun.energy = 5.2; sun.angle = math.radians(.6); sun.color = lin('#ffc27a')
so = bpy.data.objects.new('Sun', sun); S.collection.objects.link(so); so.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
sun.use_nodes = True
snt = sun.node_tree; sem = [n for n in snt.nodes if n.type == 'EMISSION'][0]
slp = snt.nodes.new('ShaderNodeLightPath'); sgt = snt.nodes.new('ShaderNodeMath'); sgt.operation = 'GREATER_THAN'; sgt.inputs[1].default_value = .5
def sun_direct(on):
    for l in list(sem.inputs['Strength'].links): snt.links.remove(l)
    if on: sem.inputs['Strength'].default_value = 1.0
    else: snt.links.new(slp.outputs['Diffuse Depth'], sgt.inputs[0]); snt.links.new(sgt.outputs[0], sem.inputs['Strength'])
world = bpy.data.worlds.new('Sky'); S.world = world; world.use_nodes = True
wnt = world.node_tree; bg = wnt.nodes['Background']; env = wnt.nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(os.path.join(A.sky, 'sky_blender.png')); wnt.links.new(env.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 1.0
S.cycles.max_bounces = 6; S.cycles.diffuse_bounces = 4; S.cycles.glossy_bounces = 2; S.cycles.transmission_bounces = 2
S.cycles.transparent_max_bounces = 4; S.cycles.caustics_reflective = False; S.cycles.caustics_refractive = False
S.cycles.sample_clamp_indirect = 8.0

# ------------------------------------------------------------------ rendu d'aperçu (contrôle de la modélisation)
CAMS = {'wide': ((7.2, 2.85, 6.2), (-1.6, .25, -2.6)), 'front': ((0, 1.6, 4.5), (-.5, 1.2, -6)), 'window': ((5.5, 1.6, -4.5), (-8, 1.2, 1.5)),
        'desk': ((-1.2, 1.3, 2.2), (-.2, .7, .2)), 'profs': ((-.3, 1.7, -2.3), (-1.1, 1.42, -5.6))}
def preview(name, samples):
    cam = bpy.data.objects.get('cam') or bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    if cam.name not in S.collection.objects: S.collection.objects.link(cam)
    p, t = CAMS[name]; cam.location = V(*p); cam.rotation_euler = (V(*t) - V(*p)).to_track_quat('-Z', 'Y').to_euler()
    cam.data.sensor_fit = 'VERTICAL'; cam.data.angle = math.radians(46)
    S.camera = cam; S.render.resolution_x, S.render.resolution_y = 960, 540; S.render.resolution_percentage = 100
    S.cycles.samples = samples; S.cycles.use_denoising = True
    S.view_settings.view_transform = 'AgX'; S.view_settings.look = 'None'; S.view_settings.exposure = 0
    S.render.image_settings.file_format = 'JPEG'; S.render.filepath = os.path.join(A.out, f'preview_{name}.jpg')
    sun_direct(True); bpy.ops.render.render(write_still=True); log('aperçu', S.render.filepath)
if A.preview or A.only_preview:
    for c in A.cam.split(','): preview(c, A.preview_samples)
    if A.only_preview: log('aperçu seulement'); sys.exit(0)

# ------------------------------------------------------------------ UV de lightmap + précalcul
def lightmap_uv():
    me = room.data
    lm = me.uv_layers.new(name='Lightmap'); me.uv_layers.active = lm; me.uv_layers['UVMap'].active_render = True
    bpy.ops.object.select_all(action='DESELECT'); room.select_set(True); bpy.context.view_layer.objects.active = room
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(52), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    me = room.data; lm = me.uv_layers['Lightmap']          # références invalidées par le passage en édition
    w = np.zeros(len(me.polygons), np.float32); me.attributes['lmw'].data.foreach_get('value', w)
    uv = np.zeros(len(me.loops) * 2, np.float32); lm.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    li = np.zeros(len(me.loops), np.int32); pi_ = np.zeros(len(me.polygons), np.int32); me.polygons.foreach_get('loop_start', pi_)
    tot = np.zeros(len(me.polygons), np.int32); me.polygons.foreach_get('loop_total', tot)
    for k in range(len(me.polygons)): li[pi_[k]:pi_[k] + tot[k]] = k
    uv *= w[li][:, None]; lm.data.foreach_set('uv', uv.ravel())
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    pad = 3.0 / (A.pack_lm or A.lm)         # même rangement que la lightmap principale (--pack-lm 4096) : mêmes UV
    kw = dict(margin_method='FRACTION', margin=pad, shape_method=os.environ.get('LM_SHAPE', 'CONCAVE'))
    rot = os.environ.get('LM_ROT', 'CARDINAL')
    if rot == 'none': kw['rotate'] = False
    else: kw.update(rotate=True, rotate_method=rot)
    bpy.ops.uv.pack_islands(**kw)
    bpy.ops.object.mode_set(mode='OBJECT'); log('UV de lightmap ok')

def bake():
    img = bpy.data.images.new('LM', A.lm, A.lm, alpha=False, float_buffer=True)
    nimg = bpy.data.images.new('LMN', A.lm, A.lm, alpha=False, float_buffer=True)
    def target(im):
        for m in room.data.materials:
            nt = m.node_tree; n = nt.nodes.get('LMBAKE') or nt.nodes.new('ShaderNodeTexImage'); n.name = 'LMBAKE'; n.image = im; nt.nodes.active = n
    bpy.ops.object.select_all(action='DESELECT'); room.select_set(True); bpy.context.view_layer.objects.active = room
    S.render.bake.margin = 12; S.render.bake.margin_type = 'EXTEND'; S.render.bake.use_clear = True
    target(nimg); S.cycles.samples = 4
    bpy.ops.object.bake(type='NORMAL', normal_space='OBJECT', margin=12); log('normales précalculées')
    target(img); S.cycles.samples = A.samples
    if A.sun_scale > 0: sun.energy = 5.2 * A.sun_scale; sun_direct(True)   # version téléphone : soleil direct précalculé aussi
    else: sun_direct(False)
    t = time.time(); bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=12); log(f'lumière précalculée en {time.time() - t:.0f} s')
    for im, f in ((img, 'lm_raw.exr'), (nimg, 'lm_normal.exr')):
        im.filepath_raw = os.path.join(A.out, f); im.file_format = 'OPEN_EXR'; im.save()
    for m in room.data.materials:
        n = m.node_tree.nodes.get('LMBAKE')
        if n: m.node_tree.nodes.remove(n)
    bpy.data.images.remove(img); bpy.data.images.remove(nimg)      # mémoire : le débruitage se fait dans un autre processus

def check_layout(exr):
    """vérifie que les UV de lightmap reconstruites correspondent à l'éclairage déjà calculé"""
    from PIL import Image, ImageDraw
    me = room.data; lm = me.uv_layers['Lightmap']; N = 1024
    uv = np.empty(len(me.loops) * 2, np.float32); lm.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    mask = Image.new('L', (N, N), 0); d = ImageDraw.Draw(mask)
    for p in me.polygons:
        pts = [(float(uv[i, 0]) * N, (1 - float(uv[i, 1])) * N) for i in range(p.loop_start, p.loop_start + p.loop_total)]
        d.polygon(pts, fill=255)
    m = np.asarray(mask) > 0
    im = bpy.data.images.load(exr); n = im.size[0]; px = np.empty(n * n * 4, np.float32); im.pixels.foreach_get(px)
    lum = np.flipud(px.reshape(n, n, 4)[..., :3].sum(-1)) > 0; bpy.data.images.remove(im); del px
    k = n // N; baked = lum.reshape(N, k, N, k).max(axis=(1, 3))
    inter = (m & baked).sum() / max(1, m.sum())                 # faces cachées (dessous posés, dos plaqués) : légitimement noires
    md = m.copy()                                               # marges de précalcul (12 px à 4096) : on dilate le masque
    for _ in range(4): md = md | np.roll(md, 1, 0) | np.roll(md, -1, 0) | np.roll(md, 1, 1) | np.roll(md, -1, 1)
    cover = (baked & md).sum() / max(1, baked.sum())            # toute la lumière calculée doit tomber dans les nouvelles UV
    log(f'contrôle UV : faces éclairées {inter * 100:.2f} %, lumière couverte {cover * 100:.2f} %')
    if cover < .99 or inter < .9: raise SystemExit('UV différentes de celles du calcul : arrêt (relancer le calcul complet)')

def denoise(img, nimg):
    ng = bpy.data.node_groups.new('DN', 'CompositorNodeTree'); S.compositing_node_group = ng
    ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    px = np.array(nimg.pixels[:], np.float32).reshape(-1, 4); px[:, :3] = px[:, :3] * 2 - 1
    n2 = bpy.data.images.new('LMN2', A.lm, A.lm, alpha=True, float_buffer=True); n2.pixels.foreach_set(px.ravel())
    w1 = bpy.data.images.new('LMA', A.lm, A.lm, alpha=True, float_buffer=True); w1.pixels.foreach_set(np.ones(A.lm * A.lm * 4, np.float32))
    a = ng.nodes.new('CompositorNodeImage'); a.image = img
    n = ng.nodes.new('CompositorNodeImage'); n.image = n2
    al = ng.nodes.new('CompositorNodeImage'); al.image = w1
    dn = ng.nodes.new('CompositorNodeDenoise'); out = ng.nodes.new('NodeGroupOutput')
    ng.links.new(a.outputs['Image'], dn.inputs['Image']); ng.links.new(n.outputs['Image'], dn.inputs['Normal']); ng.links.new(al.outputs['Image'], dn.inputs['Albedo'])
    try: dn.inputs['HDR'].default_value = True
    except Exception: pass
    ng.links.new(dn.outputs['Image'], out.inputs[0])
    cam = bpy.data.objects.get('cam') or bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    if cam.name not in S.collection.objects: S.collection.objects.link(cam)
    S.camera = cam; S.render.resolution_x = S.render.resolution_y = A.lm; S.render.resolution_percentage = 100
    S.cycles.samples = 1; S.cycles.use_denoising = False; S.view_settings.view_transform = 'Standard'
    S.render.image_settings.file_format = 'OPEN_EXR'; S.render.image_settings.color_depth = '32'
    S.render.filepath = os.path.join(A.out, 'lm_dn.exr')
    for o in (room, emit, glass, props): o.hide_render = True
    bpy.ops.render.render(write_still=True)
    for o in (room, emit, glass, props): o.hide_render = False
    S.compositing_node_group = None
    r = bpy.data.images.load(S.render.filepath)
    return np.array(r.pixels[:], np.float32).reshape(A.lm, A.lm, 4)[..., :3]

def encode(lmv):
    """lightmap 8 bits sRGB + échelle (three.js : intensité = π × échelle ; Cycles donne E/π)"""
    from PIL import Image
    lum = lmv @ np.array([.2126, .7152, .0722], np.float32)
    P = float(np.percentile(lum[lum > 1e-4], 99.6)) * 2.0       # marge pour les zones très éclairées (tablettes, ébrasements)
    enc = np.clip(lmv / P, 0, 1)
    srgb = np.where(enc <= .0031308, enc * 12.92, 1.055 * np.power(enc, 1 / 2.4) - .055)
    im = Image.fromarray((np.flipud(srgb) * 255 + .5).astype(np.uint8))   # Blender : origine en bas
    im.save(os.path.join(A.out, 'lm.png'))
    meta = {'lightMapIntensity': math.pi * P, 'size': A.lm, 'samples': A.samples}
    json.dump(meta, open(os.path.join(A.out, 'room_meta.json'), 'w'), indent=1); log('lightmap encodée', meta)

def export():
    me = room.data; me.uv_layers.active = me.uv_layers['UVMap']
    bpy.ops.object.select_all(action='DESELECT')
    for o in (room, emit, glass, props): o.select_set(True)
    so.select_set(False)
    kw = dict(filepath=os.path.join(A.out, 'room_raw.glb'), export_format='GLB', use_selection=True, export_texcoords=True,
              export_normals=True, export_materials='EXPORT', export_yup=True, export_apply=False, export_cameras=False, export_lights=False)
    try: bpy.ops.export_scene.gltf(**kw, export_image_format='AUTO')
    except TypeError: bpy.ops.export_scene.gltf(**kw)
    log('exporté', kw['filepath'])

import subprocess
DENOISE = [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'denoise.py'), '--dir', A.out, '--samples', str(A.samples)]
if A.reuse:                     # éclairage déjà calculé : même géométrie, mêmes UV (vérifiées), export seul
    lightmap_uv(); check_layout(os.path.join(A.out, 'lm_raw.exr')); export()
    if not os.path.exists(os.path.join(A.out, 'lm.png')): subprocess.run(DENOISE, check=True)
elif not A.no_bake:
    lightmap_uv()
    if A.check: check_layout(A.check)        # UV identiques à celles d'un calcul existant (lightmap mobile)
    bake()
    if not A.bake_only: export()
    subprocess.run(DENOISE, check=True)
else:
    lightmap_uv(); export()
log('terminé')
