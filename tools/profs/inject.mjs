// Remplace des textures d'un glb et y ajoute des objets rigides attachés à des os (cheveux, bijoux).
// node inject.mjs in.glb out.glb spec.json
// spec : { images: { "<nom image>": "fichier.png" }, attach: [{ bone, name, mesh: { pos, nrm, uv, idx }, material: { name, color, rough, map?, alphaTest?, double? } }], maxTex }
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { textureCompress, meshopt } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'node:fs';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [inp, outp, specf] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specf, 'utf8'));
const doc = await io.read(inp), root = doc.getRoot(), buf = root.listBuffers()[0];
for (const [name, file] of Object.entries(spec.images || {})) {
  const t = root.listTextures().find(t => t.getName() === name || (t.getURI && t.getURI() === name));
  if (!t) throw new Error('texture introuvable : ' + name);
  t.setImage(await sharp(file).webp({ quality: spec.quality || 88 }).toBuffer()).setMimeType('image/webp');
}
const texCache = {};
for (const a of spec.attach || []) {
  const bone = root.listNodes().find(n => n.getName() === a.bone); if (!bone) throw new Error('os introuvable : ' + a.bone);
  const m = a.mesh, prim = doc.createPrimitive();
  const acc = (arr, type, C) => doc.createAccessor().setArray(new C(arr)).setType(type).setBuffer(buf);
  prim.setAttribute('POSITION', acc(m.pos, 'VEC3', Float32Array)).setAttribute('NORMAL', acc(m.nrm, 'VEC3', Float32Array));
  if (m.uv) prim.setAttribute('TEXCOORD_0', acc(m.uv, 'VEC2', Float32Array));
  if (m.col) prim.setAttribute('COLOR_0', acc(m.col, 'VEC4', Float32Array));
  prim.setIndices(acc(m.idx, 'SCALAR', Uint32Array));
  const md = a.material, mat = doc.createMaterial(md.name).setBaseColorFactor(md.color || [1, 1, 1, 1]).setRoughnessFactor(md.rough ?? .5).setMetallicFactor(md.metal ?? 0);
  if (md.texRef) { const t = root.listTextures().find(t => t.getName() === md.texRef); if (!t) throw new Error('texture ' + md.texRef); mat.setBaseColorTexture(t); }
  if (md.map) { const t = texCache[md.map] || (texCache[md.map] = doc.createTexture(md.map).setImage(await sharp(md.map).webp({ quality: 88, alphaQuality: 90 }).toBuffer()).setMimeType('image/webp')); mat.setBaseColorTexture(t); }
  if (md.alphaTest) mat.setAlphaMode('MASK').setAlphaCutoff(md.alphaTest);
  if (md.double) mat.setDoubleSided(true);
  prim.setMaterial(mat);
  const node = doc.createNode(a.name).setMesh(doc.createMesh(a.name).addPrimitive(prim));
  bone.addChild(node);
}
for (const [b, sc] of Object.entries(spec.boneScale || {})) { const node = root.listNodes().find(x => x.getName() === b); const s0 = node.getScale(); node.setScale([s0[0] * sc[0], s0[1] * sc[1], s0[2] * sc[2]]); }
for (const [n, col] of Object.entries(spec.vcolor || {})) {        // couleurs par sommet sur un maillage existant
  const node = root.listNodes().find(x => x.getName() === n), prim = node.getMesh().listPrimitives()[0];
  prim.setAttribute('COLOR_0', doc.createAccessor().setArray(new Float32Array(col)).setType('VEC4').setBuffer(buf));
}
for (const [n, keep] of Object.entries(spec.cut || {})) {          // triangles gardés (les autres sont retirés)
  const node = root.listNodes().find(x => x.getName() === n), prim = node.getMesh().listPrimitives()[0], ix = prim.getIndices().getArray(), out = new Uint32Array(keep.length * 3);
  keep.forEach((t, k) => { out[k * 3] = ix[t * 3]; out[k * 3 + 1] = ix[t * 3 + 1]; out[k * 3 + 2] = ix[t * 3 + 2]; });
  prim.setIndices(doc.createAccessor().setArray(out).setType('SCALAR').setBuffer(buf));
}
for (const n of spec.hide || []) { const node = root.listNodes().find(x => x.getName() === n); if (node) node.setMesh(null); }
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
if (spec.maxTex) await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [spec.maxTex, spec.maxTex], quality: 85 }));
await io.write(outp, doc);
console.log('écrit', outp, (fs.statSync(outp).size / 1024).toFixed(0), 'Ko');
