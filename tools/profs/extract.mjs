// Extrait la géométrie de pose de liaison (bind pose) d'un modèle glb : positions, normales, UV, os, poids, matériaux.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [inp, out] = process.argv.slice(2);
const doc = await io.read(inp), root = doc.getRoot();
const skin = root.listSkins()[0], joints = skin.listJoints().map(j => j.getName());
const ibm = Array.from(skin.getInverseBindMatrices().getArray());
const nodes = root.listNodes().map(n => ({ name: n.getName(), mesh: n.getMesh() ? n.getMesh().getName() : null, t: n.getTranslation(), r: n.getRotation(), s: n.getScale(), world: n.getWorldMatrix(), children: n.listChildren().map(c => c.getName()) }));
const prims = [];
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  const get = k => { const a = p.getAttribute(k); if (!a) return null; const arr = a.getArray(), n = a.getCount(), e = a.getElementSize(), outA = new Float32Array(n * e), tmp = []; for (let i = 0; i < n; i++) { a.getElement(i, tmp); for (let j = 0; j < e; j++) outA[i * e + j] = tmp[j]; } return Array.from(outA); };
  prims.push({ mesh: m.getName(), material: p.getMaterial() ? p.getMaterial().getName() : null, pos: get('POSITION'), nrm: get('NORMAL'), uv: get('TEXCOORD_0'), j: get('JOINTS_0'), w: get('WEIGHTS_0'), idx: Array.from(p.getIndices().getArray()) });
}
fs.writeFileSync(out, JSON.stringify({ joints, ibm, nodes, prims }));
console.log(inp, prims.length, 'primitives', prims.map(p => p.material + ':' + p.pos.length / 3).join(' '));
