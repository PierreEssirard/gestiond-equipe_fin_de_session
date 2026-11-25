// Applique des déplacements de sommets (repère du maillage) à des nœuds d'un glb : node morph.mjs in.glb out.glb morph.json
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { meshopt } from '@gltf-transform/functions';
import fs from 'node:fs';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [inp, outp, mf] = process.argv.slice(2);
const M = JSON.parse(fs.readFileSync(mf, 'utf8'));
const doc = await io.read(inp), root = doc.getRoot();
for (const [name, { idx, d }] of Object.entries(M)) {
  const node = root.listNodes().find(n => n.getName() === name); if (!node) throw new Error('nœud ' + name);
  const prims = node.getMesh().listPrimitives(); if (prims.length !== 1) throw new Error('primitives ' + prims.length);
  let pos = prims[0].getAttribute('POSITION');
  if (pos.getComponentType() !== 5126 || pos.getNormalized()) {   // position quantifiée : on repasse en flottants (requantifiée à l'écriture)
    const n = pos.getCount(), arr = new Float32Array(n * 3), t = [];
    for (let i = 0; i < n; i++) { pos.getElement(i, t); arr.set(t, i * 3); }
    const np_ = doc.createAccessor().setArray(arr).setType('VEC3').setBuffer(root.listBuffers()[0]); prims[0].setAttribute('POSITION', np_); pos = np_;
  }
  const t = [];
  idx.forEach((i, k) => { pos.getElement(i, t); pos.setElement(i, [t[0] + d[k * 3], t[1] + d[k * 3 + 1], t[2] + d[k * 3 + 2]]); });
  console.log(name, idx.length, 'sommets déplacés');
}
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(outp, doc);
console.log('écrit', outp, (fs.statSync(outp).size / 1024).toFixed(0), 'Ko');
