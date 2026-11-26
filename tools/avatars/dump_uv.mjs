// Extrait d'un personnage .glb ses textures et, pour chaque maillage, les UV, positions et triangles (pour tools/avatars/variants.py).
// Utilisation : node tools/avatars/dump_uv.mjs assets/s_ben.glb /tmp/av/s_ben/uv.json   (nécessite @gltf-transform/core, extensions, meshoptimizer)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [inp, outp] = process.argv.slice(2);
const doc = await io.read(inp), out = [], dir = path.dirname(outp);
fs.mkdirSync(dir, { recursive: true });
for (const t of doc.getRoot().listTextures()) fs.writeFileSync(path.join(dir, `${t.getName()}.${t.getMimeType().split('/')[1]}`), t.getImage());
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  mesh.listPrimitives().forEach((p, pi) => {
    const dq = a => { const arr = a.getArray(), n = a.getElementSize(), c = a.getCount(), o = new Array(c * n), ct = a.getComponentType();
      const f = a.getNormalized() ? ({ 5121: 1 / 255, 5123: 1 / 65535, 5120: 1 / 127, 5122: 1 / 32767 }[ct] || 1) : 1; for (let i = 0; i < c * n; i++) o[i] = +(arr[i] * f).toFixed(5); return o; };
    out.push({ node: node.getName(), mesh: mesh.getName(), prim: pi, mat: p.getMaterial()?.getName(), uv: dq(p.getAttribute('TEXCOORD_0')), pos: dq(p.getAttribute('POSITION')), idx: Array.from(p.getIndices().getArray()) });
  });
}
fs.writeFileSync(outp, JSON.stringify(out));
console.log(path.basename(inp), out.map(o => `${o.node} (${o.mat}, ${o.idx.length / 3} triangles)`).join(', '));
