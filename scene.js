/* Salle de classe 3D (Three.js) : décor, lumière, personnages animés, caméra. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ROWS = [-2.6, -0.6, 1.4, 3.4];
export const TABLES = [-4.6, 0, 4.6];
export const SEATS = [];
ROWS.forEach(r => TABLES.forEach(c => [-0.9, 0, 0.9].forEach(o => SEATS.push({ x: c + o, z: r + 0.62 }))));
export const ZONES = [{ x: -6.5, z: -4.7 }, { x: 6.5, z: -4.7 }, { x: -6.5, z: 5.3 }, { x: 6.5, z: 5.3 }];
export const LINE_Z = 5.55;
export const lineX = v => 5 - v / 10;
export const DOOR = { x: 7.4, z: -1.8 };
const AIS = [-6.95, -2.3, 2.3, 6.95], COR = ROWS.map(r => r + 1.18);
const near = (a, v) => a.reduce((b, c) => Math.abs(c - v) < Math.abs(b - v) ? c : b);
const inDesk = p => p.z > -3.05 && p.z < 4.35 && Math.abs(p.x) < 6.1;

export function route(f, t) {
  if (Math.hypot(t.x - f.x, t.z - f.z) < 0.05) return [];
  const pts = []; let cz = f.z;
  if (inDesk(f)) { cz = near(COR, f.z + 0.3); pts.push({ x: f.x, z: cz }); }
  const ax = near(AIS, inDesk(t) ? t.x : (f.x + t.x) / 2);
  pts.push({ x: ax, z: cz });
  if (inDesk(t)) { const tz = near(COR, t.z + 0.3); pts.push({ x: ax, z: tz }, { x: t.x, z: tz }, { x: t.x, z: t.z }); }
  else pts.push({ x: ax, z: t.z }, { x: t.x, z: t.z });
  return pts;
}

export function createClassroom(canvas, opts = {}) {
  const LITE = !!opts.lite;
  /* téléphone : une seule passe de rendu par image (ni post-traitement ni carte d'ombres) ;
     l'étalonnage (courbe en S, saturation) est fait directement dans les matériaux */
  if (LITE && !THREE.ShaderChunk.tonemapping_pars_fragment.includes('GRADE_LITE'))
    THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace('vec3 CustomToneMapping( vec3 color ) { return color; }', `vec3 CustomToneMapping( vec3 color ) { /* GRADE_LITE */
	vec3 s = pow( clamp( ACESFilmicToneMapping( color ), 0., 1. ), vec3( 1. / 2.2 ) );
	s = mix( s, s * s * ( 3. - 2. * s ), .38 );
	float l = dot( s, vec3( .2126, .7152, .0722 ) );
	s = clamp( mix( vec3( l ), s, 1.16 ) + mix( vec3( -.018, .006, .03 ), vec3( .045, .016, -.03 ), smoothstep( .15, .85, l ) ), 0., 1. );
	return pow( s, vec3( 2.2 ) );
}`);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const BASE_PR = Math.min(window.devicePixelRatio || 1, LITE ? 1.35 : 1.5); let rs = 1;
  renderer.setPixelRatio(BASE_PR);
  renderer.shadowMap.autoUpdate = false; let frameN = 0;
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = !LITE; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = LITE ? THREE.CustomToneMapping : THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  /* perte du contexte WebGL (pilote graphique réinitialisé, mémoire saturée) : three.js recrée les ressources,
     on recalcule ce qui n'existe que sur la carte graphique (reflets, ombres) dès que le contexte revient */
  let lost = false, restored = 0;
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false; restored++; resPending = true; renderer.shadowMap.needsUpdate = true;
    try { if (roomOn) captureEnv(); else scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture; } catch (e) { console.warn('reflets après perte du contexte', e); }
  }, false);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0c1113');
  /* décor procédural (secours) : affiché tout de suite, remplacé par la salle précalculée dès qu'elle est chargée */
  const proc = new THREE.Group(); proc.name = 'procedural'; scene.add(proc);
  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 90);

  const mat = (c, r = 0.8, m = 0, x = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r, metalness: m }, x));
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  function add(geo, m, x, y, z, parent = proc, cast = true) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; parent.add(o); return o; }
  function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.userData.canvas = c; return t; }
  let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;

  /* ---------- extérieur ---------- */
  const sky = tex(2048, 800, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#4f78a8'); gr.addColorStop(.45, '#d9a77a'); gr.addColorStop(.75, '#ffc98f'); gr.addColorStop(1, '#ffe2b8');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,214,170,.45)'; for (let i = 0; i < 14; i++) { const x = rnd() * w, y = 80 + rnd() * 220; g.beginPath(); g.ellipse(x, y, 120 + rnd() * 160, 22 + rnd() * 20, 0, 0, 7); g.fill(); }
    for (let i = 0; i < 26; i++) { const bw = 60 + rnd() * 140, bh = 120 + rnd() * 260, x = rnd() * w; g.fillStyle = `rgb(${70 + rnd() * 30 | 0},${66 + rnd() * 22 | 0},${78 + rnd() * 20 | 0})`; g.fillRect(x, h - 200 - bh, bw, bh + 200);
      g.fillStyle = rnd() < .5 ? 'rgba(255,205,140,.55)' : 'rgba(255,230,190,.25)'; for (let yy = h - 190 - bh; yy < h - 210; yy += 22) for (let xx = x + 8; xx < x + bw - 10; xx += 18) g.fillRect(xx, yy, 9, 10); }
    for (let i = 0; i < 70; i++) { const x = rnd() * w, r = 40 + rnd() * 60; g.fillStyle = ['#3d4a30', '#4a5634', '#323d2a', '#5c6038'][i % 4]; g.beginPath(); g.arc(x, h - 60 - rnd() * 60, r, 0, 7); g.fill(); }
  });
  const skyM = new THREE.Mesh(new THREE.PlaneGeometry(70, 27), new THREE.MeshBasicMaterial({ map: sky }));
  skyM.position.set(-24, 3, 0); skyM.rotation.y = Math.PI / 2; scene.add(skyM);

  /* ---------- lumière ---------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  proc.add(new THREE.HemisphereLight('#a9c2df', '#6b5a48', 0.3));
  const SUNP = new THREE.Vector3(-16, 5.6, 7), SUNT = new THREE.Vector3(0, 0, 0.5);
  const sun = new THREE.DirectionalLight('#ffc27a', 5.2);
  sun.position.copy(SUNP); sun.target.position.copy(SUNT); scene.add(sun, sun.target);
  sun.castShadow = !LITE; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 11, bottom: -11, near: 2, far: 45 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  const panels = [];
  [-4.5, 0, 4.5].forEach(x => [-3.2, 0.6, 4.2].forEach(z => {
    const l = new THREE.PointLight('#ffe9cf', 2.7, 0, 2); l.position.set(x, 2.95, z); proc.add(l);
    panels.push([x, z]);
  }));

  /* ---------- sol ---------- */
  const floorT = tex(1024, 1024, (g, w, h) => {
    const n = 4, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 196 + (rnd() - .5) * 14; g.fillStyle = `rgb(${v | 0},${v - 6 | 0},${v - 16 | 0})`; g.fillRect(i * s, j * s, s, s);
      for (let k = 0; k < 900; k++) { const a = rnd() * .09; g.fillStyle = rnd() < .5 ? `rgba(90,80,64,${a})` : `rgba(255,255,255,${a})`; g.fillRect(i * s + rnd() * s, j * s + rnd() * s, 2 + rnd() * 3, 2 + rnd() * 3); }
    }
    g.strokeStyle = 'rgba(110,98,80,.55)'; g.lineWidth = 3; for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
  });
  floorT.wrapS = floorT.wrapT = THREE.RepeatWrapping; floorT.repeat.set(16 / 2.4, 13 / 2.4);
  const floor = add(new THREE.PlaneGeometry(16, 13), new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: floorT, roughness: .5, clearcoat: .55, clearcoatRoughness: .12 }), 0, 0, 0, proc, false);
  floor.rotation.x = -Math.PI / 2;

  /* ---------- murs ---------- */
  const wallM = mat('#ebe7de', .92), frontM = mat('#dfd9cc', .92), trimM = mat('#5b6168', .5, .2), alu = mat('#aeb4ba', .35, .7);
  add(B(16.5, 3.4, .25), frontM, 0, 1.6, -6.625);
  add(B(16.5, 3.4, .25), wallM, 0, 1.6, 6.625);
  const WIN = [[-5.3, -2.7], [-1.3, 1.3], [2.7, 5.3]];
  add(B(.25, .9, 13), wallM, -8.125, .45, 0);
  add(B(.25, .7, 13), wallM, -8.125, 2.95, 0);
  [[-6.5, -5.3], [-2.7, -1.3], [1.3, 2.7], [5.3, 6.5]].forEach(([a, b]) => add(B(.25, 1.7, b - a), wallM, -8.125, 1.75, (a + b) / 2));
  const glass = new THREE.MeshStandardMaterial({ color: '#cfe6f2', roughness: .05, metalness: .1, transparent: true, opacity: .12, depthWrite: false });
  WIN.forEach(([a, b]) => {
    const zc = (a + b) / 2, len = b - a;
    add(new THREE.PlaneGeometry(len, 1.7), glass, -8.06, 1.75, zc, proc, false).rotation.y = Math.PI / 2;
    add(B(.08, .06, len), alu, -8.02, .93, zc); add(B(.08, .06, len), alu, -8.02, 2.57, zc); add(B(.08, .06, len), alu, -8.02, 1.9, zc);
    [a + .03, zc, b - .03].forEach(z => add(B(.08, 1.7, .05), alu, -8.02, 1.75, z));
    add(B(.3, .04, len + .1), mat('#f3f1ec', .6), -7.88, .9, zc);
    const rad = add(B(.1, .5, len - .4), mat('#e8e6e1', .5, .2), -7.9, .5, zc);
    for (let z = a + .3; z < b - .25; z += .09) add(B(.02, .46, .02), mat('#d7d4ce', .5, .2), -7.84, .5, z, proc, false);
  });
  /* rayons de soleil volumétriques (faux) et poussière */
  const SD = SUNT.clone().sub(SUNP).normalize(), fxObjects = [];
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCol: { value: new THREE.Color('#ffcf91') }, uI: { value: .07 } },
    vertexShader: 'attribute float t; varying float vT; varying vec3 vP; void main(){ vT=t; vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 uCol; uniform float uI; varying float vT; varying vec3 vP; void main(){ float a=uI*(1.-vT)*(0.75+0.25*sin(vP.z*3.+vP.y*2.)); gl_FragColor=vec4(uCol*a,a); }'
  });
  const toFloor = p => p.clone().addScaledVector(SD, -p.y / SD.y);
  WIN.forEach(([a, b]) => {
    const top = a > 2 ? 1.75 : 2.55;   // le store de la fenêtre du fond est à moitié baissé
    const w = [[a + .05, .95], [b - .05, .95], [b - .05, top], [a + .05, top]].map(([z, y]) => new THREE.Vector3(-8.0, y, z));
    const f = w.map(toFloor);
    const pos = [], tt = [];
    const quad = (p0, p1, p2, p3, t0, t1, t2, t3) => { [[p0, t0], [p1, t1], [p2, t2], [p0, t0], [p2, t2], [p3, t3]].forEach(([p, t]) => { pos.push(p.x, p.y, p.z); tt.push(t); }); };
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(w[i], w[j], f[j], f[i], 0, 0, 1, 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('t', new THREE.Float32BufferAttribute(tt, 1));
    const m = new THREE.Mesh(g, beamMat); m.renderOrder = 5; m.frustumCulled = false; scene.add(m); fxObjects.push(m);
  });
  /* poussière : uniquement dans les faisceaux de soleil (pas de points blancs dans toute la salle) */
  const dustN = 520, dp = new Float32Array(dustN * 3), dSeed = [];
  for (let i = 0; i < dustN; i++) {
    const [a, b] = WIN[i % 3], w0 = new THREE.Vector3(-8.0, .95 + rnd() * 1.6, a + .05 + rnd() * (b - a - .1)), f0 = toFloor(w0);
    const p = w0.lerp(f0, .08 + rnd() * .8); dp.set([p.x, p.y, p.z], i * 3); dSeed.push(rnd() * 6.28);
  }
  const dustG = new THREE.BufferGeometry(); dustG.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustG, new THREE.PointsMaterial({ color: '#ffd9a8', size: .011, transparent: true, opacity: .26, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust); fxObjects.push(dust); dust.visible = !LITE;
  add(B(.25, 3.4, 4.3), wallM, 8.125, 1.6, -4.45);
  add(B(.25, 3.4, 8.1), wallM, 8.125, 1.6, 2.45);
  add(B(.25, 1.2, 1.4), wallM, 8.125, 2.7, -1.7);
  const door = add(B(.06, 2.1, 1.3), mat('#8c6b4b', .55), 7.98, 1.05, -1.7);
  add(B(.06, .04, .16), alu, 7.92, 1.0, -2.2); add(B(.1, 2.2, .06), trimM, 7.97, 1.1, -2.38); add(B(.1, 2.2, .06), trimM, 7.97, 1.1, -1.02); add(B(.1, .06, 1.42), trimM, 7.97, 2.16, -1.7);
  const exitT = tex(256, 96, (g, w, h) => { g.fillStyle = '#108a3f'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '700 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SORTIE', w / 2, h / 2 + 3); });
  const exit = add(B(.08, .22, .55), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffffff', emissiveMap: exitT, map: exitT, emissiveIntensity: .9 }), 7.95, 2.45, -1.7, proc, false);
  add(new THREE.CylinderGeometry(.08, .08, .5, 16), mat('#c4231d', .4, .2), 7.82, .55, -0.6);
  [[-8.0, 0], [8.0, 0]].forEach(([x]) => { });
  add(B(16, .1, .03), trimM, 0, .05, -6.49, proc, false); add(B(.03, .1, 13), trimM, -7.99, .05, 0, proc, false); add(B(.03, .1, 13), trimM, 7.99, .05, 0, proc, false);
  // plafond
  const ceilT = tex(512, 512, (g, w, h) => { g.fillStyle = '#efeeea'; g.fillRect(0, 0, w, h); for (let k = 0; k < 3000; k++) { g.fillStyle = `rgba(120,120,110,${rnd() * .12})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); } g.strokeStyle = '#c9c7c0'; g.lineWidth = 6; g.strokeRect(0, 0, w, h); });
  ceilT.wrapS = ceilT.wrapT = THREE.RepeatWrapping; ceilT.repeat.set(16 / 1.2, 13 / 0.6);
  add(B(16.6, .12, 13.6), mat('#ffffff', .95, 0, { map: ceilT }), 0, 3.31, 0);
  const lightM = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff7ea', emissiveIntensity: 1.6 });
  panels.forEach(([x, z]) => { add(B(1.2, .03, .6), lightM, x, 3.24, z, proc, false); add(B(1.26, .05, .66), alu, x, 3.255, z, proc, false); });

  /* ---------- tableau blanc ---------- */
  const boardT = tex(2048, 600, (g, w, h) => {
    g.fillStyle = '#f7f8f8'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(200,210,215,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.font = '64px "Segoe Print","Bradley Hand","Comic Neue",cursive'; g.fillStyle = '#1d4fa8'; g.fillText('GIN761 · Gestion d’équipe en milieu technologique', 80, 120);
    g.font = '52px "Segoe Print","Bradley Hand","Comic Neue",cursive'; g.fillStyle = '#222'; g.fillText('Management interculturel · O. Meier', 80, 205);
    g.fillStyle = '#b3261e'; g.fillText('Présentation : 4 déc.', 80, 300); g.strokeStyle = '#b3261e'; g.lineWidth = 5; g.beginPath(); g.ellipse(330, 285, 290, 55, -.03, 0, 7); g.stroke();
    g.strokeStyle = '#222'; g.lineWidth = 6; g.beginPath(); g.moveTo(1300, 520); g.lineTo(1300, 250); g.moveTo(1300, 520); g.lineTo(1950, 520); g.stroke();
    [['PDI', 68, 35], ['IDV', 71, 67], ['UAI', 86, 65], ['MAS', 43, 66]].forEach(([n, a, b], i) => { const x = 1340 + i * 155; g.fillStyle = '#1d4fa8'; g.fillRect(x, 520 - a * 2.6, 50, a * 2.6); g.fillStyle = '#b3261e'; g.fillRect(x + 56, 520 - b * 2.6, 50, b * 2.6); g.fillStyle = '#222'; g.font = '34px "Segoe Print",cursive'; g.fillText(n, x + 18, 568); });
    g.font = '34px "Segoe Print",cursive'; g.fillStyle = '#1d4fa8'; g.fillText('France', 1320, 230); g.fillStyle = '#b3261e'; g.fillText('Allemagne', 1480, 230);
    g.strokeStyle = '#2d7d46'; g.lineWidth = 5; g.beginPath(); g.moveTo(80, 420); g.bezierCurveTo(300, 360, 520, 470, 780, 400); g.stroke(); g.fillStyle = '#2d7d46'; g.font = '44px "Segoe Print",cursive'; g.fillText('Tuckman → Lencioni → Thomas-Kilmann', 80, 500);
  });
  add(B(4.7, 1.45, .05), alu, -1.2, 1.6, -6.48);
  add(new THREE.PlaneGeometry(4.6, 1.35), mat('#ffffff', .25, 0, { map: boardT }), -1.2, 1.6, -6.45, proc, false);
  add(B(4.4, .04, .1), alu, -1.2, .9, -6.42);
  [['#1d4fa8', -2.4], ['#b3261e', -2.25], ['#222', -2.1]].forEach(([c, x]) => add(new THREE.CylinderGeometry(.012, .012, .12, 8), mat(c, .5), x, .935, -6.41, proc, false).rotation.z = Math.PI / 2);

  /* ---------- écran de projection (dynamique) ---------- */
  const scrC = document.createElement('canvas'); scrC.width = 1280; scrC.height = 760;
  const scrT = new THREE.CanvasTexture(scrC); scrT.colorSpace = THREE.SRGBColorSpace;
  add(B(3.0, .12, .14), mat('#d8d8d5', .5, .3), 4.5, 2.83, -6.4);
  add(new THREE.PlaneGeometry(2.86, 1.7), new THREE.MeshStandardMaterial({ map: scrT, emissive: '#ffffff', emissiveMap: scrT, emissiveIntensity: .55, roughness: .9 }), 4.5, 1.92, -6.42, proc, false);
  add(B(.36, .14, .3), mat('#e5e5e2', .5, .2), 4.5, 3.12, -2.0); add(new THREE.CylinderGeometry(.05, .05, .04, 16), mat('#222', .3), 4.5, 3.11, -2.17, proc, false).rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(.015, .015, .12, 6), alu, 4.5, 3.22, -2.0, proc, false);
  function setScreen(lines) {
    const g = scrC.getContext('2d'), w = 1280, h = 760;
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#162027'); gr.addColorStop(1, '#22323b'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd34d'; g.font = '700 54px Barlow, Arial'; g.fillText(lines.top || 'Choc des cultures', 70, 110);
    g.fillStyle = '#ffffff'; g.font = '700 64px Barlow, Arial';
    const words = (lines.main || '').split(' '); let line = '', y = 250;
    for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > w - 140) { g.fillText(line, 70, y); y += 78; line = wd; } else line = t; }
    g.fillText(line, 70, y);
    g.fillStyle = '#9fb3be'; g.font = '600 40px Barlow, Arial'; g.fillText(lines.foot || '', 70, h - 70);
    scrT.needsUpdate = true;
  }
  setScreen({ main: 'Bienvenue' });

  /* ---------- décor ---------- */
  const clockT = tex(256, 256, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill(); g.strokeStyle = '#222'; g.lineWidth = 10; g.stroke(); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.lineWidth = 6; g.beginPath(); g.moveTo(128 + Math.cos(a) * 95, 128 + Math.sin(a) * 95); g.lineTo(128 + Math.cos(a) * 110, 128 + Math.sin(a) * 110); g.stroke(); } g.lineWidth = 8; g.beginPath(); g.moveTo(128, 128); g.lineTo(128, 55); g.moveTo(128, 128); g.lineTo(180, 150); g.stroke(); });
  const clock = add(new THREE.CylinderGeometry(.22, .22, .05, 32), [mat('#333', .4), mat('#fff', .4, 0, { map: clockT }), mat('#333')], -5.6, 2.65, -6.47, proc, false); clock.rotation.x = Math.PI / 2;
  const posterT = tex(300, 420, (g, w, h) => { g.fillStyle = '#0f6b45'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd34d'; g.font = '700 40px Arial'; g.fillText('UdeS', 24, 70); g.fillStyle = '#fff'; g.font = '600 26px Arial'; ['Campus de', 'Longueuil', '', 'Génie', 'Automne 2026'].forEach((t, i) => g.fillText(t, 24, 140 + i * 40)); });
  add(new THREE.PlaneGeometry(.6, .84), mat('#fff', .7, 0, { map: posterT }), 6.9, 1.7, -6.47, proc, false);
  // bureau du prof
  const wood = mat('#9c7a55', .55);
  add(B(1.7, .05, .8), wood, -4.4, .76, -4.9); add(B(1.6, .66, .04), mat('#7c6046', .7), -4.4, .4, -4.55);
  [-5.2, -3.6].forEach(x => add(B(.05, .74, .76), mat('#7c6046', .7), x, .37, -4.9));
  add(B(.36, .02, .25), mat('#2d3135', .4, .5), -4.2, .8, -4.85); const scr = add(B(.36, .24, .015), new THREE.MeshStandardMaterial({ color: '#1a1f24', emissive: '#4c7fb8', emissiveIntensity: .5 }), -4.2, .92, -4.97); scr.rotation.x = -.25;
  add(B(.24, .03, .3), mat('#f4f4f0', .8), -4.75, .79, -4.8);
  // plantes
  function plant(x, z) { add(new THREE.CylinderGeometry(.22, .17, .45, 20), mat('#e6e2da', .6), x, .225, z); for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, r = .14 + rnd() * .12; const l = add(new THREE.SphereGeometry(.16 + rnd() * .08, 12, 10), mat(['#3f7a46', '#4f8f50', '#346b3d'][i % 3], .8), x + Math.cos(a) * r, .62 + rnd() * .55, z + Math.sin(a) * r); l.scale.y = 1.4; } }
  plant(-7.4, 6.0); plant(7.4, -6.0); plant(-7.4, -6.0);
  add(new THREE.CylinderGeometry(.18, .15, .5, 18), mat('#4a5056', .6, .2), 7.6, .25, .2);

  /* ---------- tables et chaises ---------- */
  const lam = mat('#efece6', .45), leg = mat('#6b7178', .35, .7), plastic = mat('#2a2e33', .6);
  ROWS.forEach(r => TABLES.forEach(c => {
    add(B(2.7, .04, .7), lam, c, .74, r); add(B(2.7, .02, .7), mat('#cfccc5', .5), c, .715, r, proc, false);
    [[-1.3, -.3], [1.3, -.3], [-1.3, .3], [1.3, .3]].forEach(([dx, dz]) => add(new THREE.CylinderGeometry(.022, .022, .72, 8), leg, c + dx, .36, r + dz));
    add(B(2.6, .03, .03), leg, c, .12, r - .3);
    const k = rnd(); if (k < .6) add(B(.3, .02, .22), mat(['#2c5aa0', '#c0392b', '#f0f0ea', '#e2b33d'][Math.floor(rnd() * 4)], .7), c - .6 + rnd() * 1.2, .77, r - .05, proc, false);
    if (k < .35) { add(B(.33, .015, .23), mat('#3a3f45', .3, .6), c + .5, .77, r + .05, proc, false); const s = add(B(.33, .22, .01), new THREE.MeshStandardMaterial({ color: '#16191c', emissive: '#6aa0d8', emissiveIntensity: .35 }), c + .5, .87, r - .07, proc, false); s.rotation.x = -.3; }
  }));
  SEATS.forEach(s => {
    const z = s.z + .06;
    add(B(.44, .05, .42), plastic, s.x, .46, z); add(B(.42, .34, .04), plastic, s.x, .78, z + .22).rotation.x = -.1;
    [[-.19, -.17], [.19, -.17], [-.19, .17], [.19, .17]].forEach(([dx, dz]) => add(B(.025, .44, .025), leg, s.x + dx, .22, z + dz, proc, false));
  });

  /* ---------- marquages au sol ---------- */
  const zoneMeshes = opts.corners.map((C, i) => {
    const t = tex(512, 512, (g, w, h) => { g.fillStyle = C.color + '55'; g.strokeStyle = C.color; g.lineWidth = 18; g.beginPath(); g.roundRect ? g.roundRect(14, 14, w - 28, h - 28, 40) : g.rect(14, 14, w - 28, h - 28); g.fill(); g.stroke(); g.fillStyle = C.color; g.font = '800 300px Barlow, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(C.l, w / 2, h / 2 + 20); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: .7 }));
    m.rotation.x = -Math.PI / 2; m.position.set(ZONES[i].x, .012, ZONES[i].z); m.receiveShadow = true; m.visible = false; scene.add(m); return m;
  });
  const lineT = tex(2048, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#6fc4f0'); gr.addColorStop(1, '#ffd34d'); g.fillStyle = gr; g.fillRect(0, 20, w, 50); g.fillStyle = '#111'; for (let v = 0; v <= 100; v += 5) { const x = 24 + v / 100 * (w - 48); g.fillRect(x - 3, 20, 6, v % 25 ? 22 : 50); } g.font = '700 46px Arial'; g.textAlign = 'center'; [0, 25, 50, 75, 100].forEach(v => g.fillText(v, 24 + v / 100 * (w - 48), 118)); });
  const lineMesh = new THREE.Mesh(new THREE.PlaneGeometry(10.5, .66), new THREE.MeshStandardMaterial({ map: lineT, transparent: true, depthWrite: false }));
  lineMesh.rotation.x = -Math.PI / 2; lineMesh.rotation.z = Math.PI; lineMesh.position.set(0, .013, LINE_Z + .1); lineMesh.visible = false; scene.add(lineMesh);
  const flag = new THREE.Group(); flag.visible = false; scene.add(flag);
  add(new THREE.CylinderGeometry(.025, .025, 2.4, 10), mat('#3a3a3a', .4, .6), 0, 1.2, 0, flag);
  const flagC = document.createElement('canvas'); flagC.width = 256; flagC.height = 160; const flagT = new THREE.CanvasTexture(flagC); flagT.colorSpace = THREE.SRGBColorSpace;
  const flagM = add(new THREE.PlaneGeometry(.8, .5), new THREE.MeshStandardMaterial({ map: flagT, side: THREE.DoubleSide }), .42, 2.1, 0, flag); flag.rotation.y = Math.PI; flagM.castShadow = true;

  proc.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial && !o.material.emissiveMap) o.material.envMapIntensity = .35; });
  /* fusion du décor statique : des centaines d'objets deviennent quelques dizaines d'appels de dessin */
  (function mergeStatic() {
    const skip = new Set([skyM, lineMesh, ...zoneMeshes, ...fxObjects]);
    const groups = new Map(), victims = [];
    const hex = c => c ? c.getHexString() : '';
    proc.children.forEach(o => {
      if (!o.isMesh || o.isSkinnedMesh || skip.has(o) || Array.isArray(o.material) || !o.material.isMeshStandardMaterial || !o.geometry.index) return;
      const m = o.material;
      const key = [m.type, hex(m.color), m.roughness, m.metalness, m.map && m.map.uuid, hex(m.emissive), m.emissiveIntensity, m.emissiveMap && m.emissiveMap.uuid, m.transparent, m.opacity, m.side, m.clearcoat || 0, o.castShadow].join('|');
      if (!groups.has(key)) groups.set(key, { mat: m, cast: o.castShadow, geos: [] });
      o.updateWorldMatrix(true, false);
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld); g.clearGroups();
      for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
      if (!g.attributes.uv) return;
      groups.get(key).geos.push(g); victims.push(o);
    });
    victims.forEach(o => proc.remove(o));
    groups.forEach(({ mat, cast, geos }) => {
      if (!geos.length) return;
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) return;
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = cast; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; proc.add(mesh);
    });
  })();
  try { scene.environment = pmrem.fromScene(scene, 0.02, 0.1, 60).texture; } catch (e) { }
  /* ---------- personnages réalistes (modèles glTF animés) ---------- */
  const people = new Map(); let compiledOnce = false;
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const base = opts.assets || './assets/';
  const modelCache = {}, clips = {}; let charEnv = .35;
  /* progression du chargement (écran d'attente) */
  let loadN = 0, loadDone = 0;
  const track = p => { loadN++; p.then(() => loadDone++, () => loadDone++); return p; };
  const loadModel = name => modelCache[name] || (modelCache[name] = track(loader.loadAsync(base + name + '.glb' + BUST)).then(g => {
    g.scene.traverse(n => { if (n.isMesh) { const ms = Array.isArray(n.material) ? n.material : [n.material]; ms.forEach(m => { if (/^acc_/.test(m.name)) return;   /* bijoux : matériaux d'origine (nacre, argent) */
      m.metalness = 0; m.metalnessMap = null; m.roughnessMap = null; m.roughness = /hair|eye|lash/i.test(m.name) ? .55 : .78; m.envMapIntensity = charEnv; if (/lash|hair/i.test(m.name)) { m.alphaTest = .4; m.transparent = false; m.depthWrite = true; } m.needsUpdate = true; }); } });
    return g;
  }));
  const ANIMS = { idle: 'anim_idle', walk: 'anim_walking', sad: 'anim_sad_idle', cheer: 'anim_celebrating' };
  const animsReady = Promise.all(Object.entries(ANIMS).map(([k, f]) => track(loader.loadAsync(base + f + '.glb')).then(g => {
    const c = g.animations[0];
    c.tracks = c.tracks.filter(t => !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || t.name === 'Hips.position'));
    const hp = c.tracks.find(t => t.name === 'Hips.position');
    if (hp) { const v = hp.values, x0 = v[0], z0 = v[2]; for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; } }
    clips[k] = c;
  })));
  /* ---------- salle précalculée (Blender + Cycles) : géométrie détaillée, éclairage global en lightmap ----------
     Tout l'éclairage de la salle (plafonniers, ciel, rebonds de lumière, y compris ceux du soleil) est
     précalculé dans une texture ; seul le soleil direct reste en temps réel (ombres des personnages).
     En cas d'échec de chargement, le décor procédural reste affiché : le jeu fonctionne toujours. */
  let roomOn = false, useAO = true, roomSunBaked = false;
  const BUST = '?v=21';                                   // nouvelle version des fichiers : pas de mélange avec un cache ancien
  const ROOMURL = opts.room === false ? null : (opts.room || base + (LITE ? 'room_m.glb' : 'room.glb'));
  const killIBLDiffuse = THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );', '');
  const NODIRECT = '#include <lights_fragment_end>\n\treflectedLight.directDiffuse = vec3( 0. ); reflectedLight.directSpecular = vec3( 0. );';
  function installRoom(g, lm, skyT, meta) {
    lm.flipY = false; lm.channel = 1; lm.colorSpace = THREE.SRGBColorSpace; lm.anisotropy = 4; lm.needsUpdate = true;
    /* téléphone : lightmap qui contient aussi le soleil direct et ses ombres (pas de carte d'ombres en temps réel) */
    const sunBaked = LITE && !!meta.lightMapIntensityMobile;
    const LMI = (sunBaked ? meta.lightMapIntensityMobile : meta.lightMapIntensity) * (meta.gain || 1);
    boardT.flipY = false; boardT.needsUpdate = true; scrT.flipY = false; scrT.needsUpdate = true;
    const scrMat = new THREE.MeshStandardMaterial({ map: scrT, emissive: '#ffffff', emissiveMap: scrT, emissiveIntensity: .6, roughness: .9 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: '#e8f2f6', roughness: .02, metalness: 0, transparent: true, opacity: .07, depthWrite: false, envMapIntensity: 1.6 });
    const lit = new Set(), lmMats = new Set();
    g.scene.traverse(o => { if (o.isMesh && o.geometry.attributes.uv1) lmMats.add(o.material); });
    /* petits objets et surfaces plaquées : inutiles dans la passe d'ombre du soleil (plus léger, rendu identique) */
    const NOCAST = /^(floor|ceiling|board|cork|poster|poster2|sheet\d|clock|base|edge|laptop_s|laptop_k|books|bottle_[sbk]|phone|cup|sleeve|paper|marker_[brkg]|pot|soil|leaf|plastic_k|fabric_k|bag\d|tbar|fixture|darkglass|alu|chrome|red)$/;
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material, n = m.name || '';
      o.castShadow = !NOCAST.test(n); o.receiveShadow = true; o.matrixAutoUpdate = false; o.updateMatrix();
      if (n === 'screen') { o.material = scrMat; o.castShadow = false; return; }
      if (n === 'glass') { o.material = glassMat; o.castShadow = false; o.renderOrder = 2; return; }
      if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0 && m.emissiveIntensity > 0) { o.castShadow = false; m.toneMapped = true; return; }
      if (LITE && m.clearcoat) { m.clearcoat = 0; m.needsUpdate = true; }   // téléphone : une couche de vernis en moins à calculer
      if (!o.geometry.attributes.uv1) {                 // pièces fines : éclairées par les reflets de la salle
        if (sunBaked && !lmMats.has(m) && !lit.has(m)) { lit.add(m); m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', NODIRECT); }; m.customProgramCacheKey = () => 'nodirect'; m.needsUpdate = true; }
        return;
      }
      if (n === 'board') m.map = boardT;
      if (lit.has(m)) return; lit.add(m);
      m.lightMap = lm; m.lightMapIntensity = LMI; m.envMapIntensity = meta.envIntensity ?? 1;
      m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_maps>', killIBLDiffuse); if (sunBaked) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', NODIRECT); };
      m.customProgramCacheKey = () => sunBaked ? 'lightmapped-sun' : 'lightmapped';
      m.needsUpdate = true;
    });
    scene.remove(proc); proc.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    scene.remove(dust); fxObjects.splice(fxObjects.indexOf(dust), 1);      // rendu photo : pas de particules
    scene.remove(skyM);
    g.scene.name = 'room'; scene.add(g.scene);
    skyT.colorSpace = THREE.SRGBColorSpace; skyT.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = skyT; scene.backgroundIntensity = meta.skyIntensity ?? 1.5;
    useAO = false; if (gtao) gtao.enabled = false;
    charEnv = meta.charEnv ?? 1; Object.values(modelCache).forEach(p => p.then(m => m.scene.traverse(n => { if (n.isMesh) (Array.isArray(n.material) ? n.material : [n.material]).forEach(x => x.envMapIntensity = charEnv); })).catch(() => { }));
    roomOn = true; roomSunBaked = sunBaked; renderer.shadowMap.needsUpdate = true;
    try { captureEnv(); } catch (e) { console.warn('capture des reflets impossible, reflets génériques conservés', e); }
  }
  /* reflets et lumière ambiante des personnages : capture de la salle elle-même (cube 360° au centre) */
  function captureEnv() {
    const rt = new THREE.WebGLCubeRenderTarget(LITE ? 128 : 256, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(.05, 40, rt); cc.position.set(0, 1.35, .3); scene.add(cc);
    const hidden = [];
    people.forEach(a => { if (a.root.visible) { a.root.visible = false; hidden.push(a.root); } });
    [...fxObjects, lineMesh, flag, ...zoneMeshes].forEach(o => { if (o.visible) { o.visible = false; hidden.push(o); } });
    renderer.shadowMap.needsUpdate = true; cc.update(renderer, scene);
    hidden.forEach(o => o.visible = true); scene.remove(cc);
    const old = scene.environment; scene.environment = pmrem.fromCubemap(rt.texture).texture; rt.dispose();
    if (old && old.dispose) old.dispose();
  }
  const roomReady = !ROOMURL ? Promise.resolve(false) : (async () => {
    const meta = await fetch(base + 'room.json' + BUST, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('room.json ' + r.status); return r.json(); });
    const tl = new THREE.TextureLoader();
    const [g, lm, skyT] = await Promise.all([track(loader.loadAsync(ROOMURL)), track(tl.loadAsync(base + (LITE ? meta.lightmapMobile : meta.lightmap) + BUST)), track(tl.loadAsync(base + (LITE ? meta.skyMobile : meta.sky)))]);
    installRoom(g, lm, skyT, meta); return true;
  })().catch(e => { console.warn('salle précalculée indisponible, décor simplifié conservé', e); return false; });
  /* compile d'avance les shaders des éléments qui n'apparaissent qu'en cours de partie (zones, ligne, drapeau) :
     pas d'à-coup la première fois qu'ils s'affichent */
  function warm() { const h = []; [...zoneMeshes, lineMesh, flag].forEach(o => { if (!o.visible) { o.visible = true; h.push(o); } }); try { renderer.compile(scene, camera); } catch (e) { } h.forEach(o => o.visible = false); }
  /* tout est prêt quand la salle, les animations et TOUS les personnages sont chargés, leurs textures envoyées
     à la carte graphique et leurs shaders compilés : rien ne se charge ni ne se compile ensuite pendant le jeu */
  const modelsReady = Promise.all((opts.preload || []).map(n => loadModel(n).catch(() => null)));
  async function warmGPU() {
    const ms = (await Promise.all(Object.values(modelCache).map(p => p.catch(() => null)))).filter(Boolean);
    const seen = new Set(), up = t => { if (t && t.isTexture && !seen.has(t)) { seen.add(t); try { renderer.initTexture(t); } catch (e) { } } };
    const textures = o => o.traverse(n => { if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => { for (const k in m) if (m[k] && m[k].isTexture) up(m[k]); }); });
    textures(scene); ms.forEach(g => textures(g.scene));
    const stage = new THREE.Group(), dir = new THREE.Vector3(); camera.updateMatrixWorld(); camera.getWorldDirection(dir);
    ms.forEach((g, i) => {
      const c = cloneSkinned(g.scene); c.traverse(n => { if (n.isMesh) { n.castShadow = !LITE; n.receiveShadow = true; n.frustumCulled = false; } });
      c.position.copy(camera.position).addScaledVector(dir, 4).add(new THREE.Vector3((i - ms.length / 2) * .45, -1.4, 0)); stage.add(c);
    });
    const lab = labelSprite('·', '#fff'); stage.add(lab);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.36, .5, 8), new THREE.MeshBasicMaterial({ color: '#ffd34d', transparent: true, opacity: .95, depthWrite: false, side: THREE.DoubleSide })); stage.add(ring);
    const dsc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: .7, depthWrite: false })); stage.add(dsc);
    lab.position.copy(camera.position).addScaledVector(dir, 4); ring.position.copy(lab.position); dsc.position.copy(lab.position);
    scene.add(stage);
    try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera); } catch (e) { }
    renderer.shadowMap.needsUpdate = true;
    try { if (composer && hq) composer.render(0); else renderer.render(scene, camera); } catch (e) { }
    scene.remove(stage); ring.geometry.dispose();
  }
  let readyAt = 0, settleRes = null, settleN = 0, lastFrame = 0;
  const settled = new Promise(r => { settleRes = r; });
  const ready = Promise.all([animsReady.catch(e => console.warn('animations', e)), roomReady, modelsReady]).then(async r => {
    try { await warmGPU(); } catch (e) { console.warn('préparation graphique', e); }
    warm(); readyAt = performance.now(); setTimeout(() => { if (settleRes) { settleRes(true); settleRes = null; } }, 7000); return r;
  });
  function labelSprite(text, color) {
    const c = document.createElement('canvas'), g = c.getContext('2d'); g.font = '700 46px Barlow, Arial';
    const w = Math.ceil(g.measureText(text).width) + 74; c.width = w; c.height = 76;
    g.font = '700 46px Barlow, Arial'; g.fillStyle = 'rgba(12,16,18,.78)'; g.beginPath(); g.roundRect ? g.roundRect(0, 4, w, 68, 16) : g.rect(0, 4, w, 68); g.fill();
    g.fillStyle = color; g.beginPath(); g.arc(30, 38, 11, 0, 7); g.fill(); g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(text, 52, 40);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false }));
    const ls = opts.labelScale || .026; sp.scale.set(w / 76 * ls, ls, 1); sp.position.y = 1.98; sp.renderOrder = 10; return sp;
  }
  const discGeo = new THREE.RingGeometry(.24, .31, 40);
  const blobMat = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(.45, 'rgba(0,0,0,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false });
  })(), blobGeo = new THREE.PlaneGeometry(.8, .8);
  function addPerson(id, look, o = {}) {
    if (people.has(id)) return people.get(id);
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body); scene.add(root);
    const a = { slot: people.size % 3, fast: !!(o.fast || o.me), id, root, body, x: o.x ?? 0, z: o.z ?? 0, yaw: o.yaw ?? 0, tyaw: o.yaw ?? 0, path: [], spd: o.spd || (1.25 + Math.random() * .2), sit: 0, sitting: false, walking: false, react: null, talk: 0, after: 'stand', faceYaw: null, bones: null, mixer: null, actions: null, cur: null };
    if (o.label) { a.label = labelSprite(o.label, o.color || '#fff'); root.add(a.label); }
    if (o.me) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(.36, .5, 48), new THREE.MeshBasicMaterial({ color: '#ffd34d', transparent: true, opacity: .95, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = .02; ring.renderOrder = 4; root.add(ring); a.ring = ring;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(.11, .22, 4), new THREE.MeshBasicMaterial({ color: '#ffd34d' }));
      arrow.rotation.x = Math.PI; arrow.position.y = 2.25; root.add(arrow); a.arrow = arrow;
    }
    { const bl = new THREE.Mesh(blobGeo, blobMat); bl.rotation.x = -Math.PI / 2; bl.position.y = .006; bl.renderOrder = 1; root.add(bl); a.blob = bl; }
    if (o.color) { const d = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: .7, depthWrite: false })); d.rotation.x = -Math.PI / 2; d.position.y = .015; root.add(d); a.disc = d; }
    Promise.all([loadModel(look.model || 'kate'), ready]).then(([g]) => {
      if (!people.has(id)) return;
      const m = cloneSkinned(g.scene); m.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; if (n.geometry) { n.geometry.computeBoundingSphere(); n.geometry.boundingSphere.radius *= 1.4; } } });
      if (!compiledOnce) { compiledOnce = true; setTimeout(() => { try { renderer.compile(scene, camera); } catch (e) { } }, 0); }
      const B = {}; m.traverse(n => { if (n.isBone) B[n.name] = n; });
      a.bones = B; a.mixer = new THREE.AnimationMixer(m); a.actions = {};
      for (const k in clips) a.actions[k] = a.mixer.clipAction(clips[k]);
      a.actions.idle.time = Math.random() * 3; a.actions.idle.play(); a.cur = 'idle';
      body.add(m);
    }).catch(e => console.warn('modèle', look.model, e));
    people.set(id, a); return a;
  }
  function removePerson(id) { const a = people.get(id); if (!a) return; scene.remove(a.root); people.delete(id); }
  function moveTo(id, x, z, o = {}) {
    const a = people.get(id); if (!a) return;
    a.sitting = false; a.after = o.after || 'stand'; a.faceYaw = o.face ?? null; a.delay = o.delay || 0;
    a.path = o.direct ? [{ x, z }] : route(a, { x, z });
    if (!a.path.length) { if (a.after === 'sit') { a.sitting = true; a.tyaw = Math.PI; } else if (a.faceYaw !== null) a.tyaw = a.faceYaw; }
  }
  const sitAt = (id, s, delay) => moveTo(id, s.x, s.z, { after: 'sit', delay });
  function react(id, kind, sec = 2.5) { const a = people.get(id); if (a) a.react = { kind, until: T + sec }; }
  function jump(id, sec = 2.2) { const a = people.get(id); if (a) { a.jumpT0 = T; a.jumpUntil = T + sec; } }
  function talk(id, sec) { const a = people.get(id); if (a) a.talk = T + sec; }
  function setVisible(id, v) { const a = people.get(id); if (a) a.root.visible = v; }
  function place(id, x, z, yaw) { const a = people.get(id); if (!a) return; a.x = x; a.z = z; a.path = []; if (yaw !== undefined) a.yaw = a.tyaw = yaw; a.sitting = false; a.sit = 0; }

  const lerp = (a, b, k) => a + (b - a) * k;
  const qx = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
  /* marionnette : le téléphone ne simule rien, il affiche l'état publié par le projecteur */
  function drive(id, s) {
    const a = people.get(id); if (!a) return;
    if (!a.puppet) { a.puppet = true; a.sit = s.sitting ? 1 : 0; }
    a.path = []; a.delay = 0; a.x = s.x; a.z = s.z; a.yaw = a.tyaw = s.yaw;
    a.walking = !!s.walking; a.sitting = !!s.sitting;
    a.react = s.react ? { kind: s.react, until: T + .5 } : null;
    if (s.jump) { if (!(a.jumpUntil > T)) a.jumpT0 = T; a.jumpUntil = T + .35; }
    a.talk = s.talk ? T + .5 : 0;
    a.root.visible = !s.hidden;
    if (s.v > .3) a.spd = Math.min(2.2, s.v);
  }
  function animate(a, dt) {
    if (a.puppet) { }
    else if (a.delay > 0) a.delay -= dt;
    else if (a.path.length) {
      const t = a.path[0], dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz), st = a.spd * dt;
      if (d <= st) { a.x = t.x; a.z = t.z; a.path.shift(); if (!a.path.length) { a.walking = false; if (a.after === 'sit') { a.sitting = true; a.tyaw = Math.PI; } else if (a.faceYaw !== null) a.tyaw = a.faceYaw; } }
      else { a.x += dx / d * st; a.z += dz / d * st; a.walking = true; a.tyaw = Math.atan2(dx, dz); }
    } else a.walking = false;
    if (!a.puppet) { let dy = a.tyaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yaw += dy * Math.min(1, dt * 7); }
    a.sit = lerp(a.sit, a.sitting ? 1 : 0, Math.min(1, dt * 5));
    let hop = 0;
    if (a.jumpUntil > T) { const ph = T - a.jumpT0, n = Math.min(1, (a.jumpUntil - T) / .3, ph / .06); hop = Math.abs(Math.sin(ph * Math.PI / .52)) * .26 * n; }
    a.hopY = hop;
    a.root.position.set(a.x, -0.46 * a.sit + hop, a.z); a.root.rotation.y = a.yaw;
    if (a.label) a.label.position.y = a.arrow ? 2.55 : 1.98;
    if (a.ring) { const k = 1 + Math.sin(T * 4) * .08; a.ring.scale.set(k, k, 1); a.arrow.position.y = 2.25 - .46 * a.sit + Math.sin(T * 3) * .06; a.arrow.rotation.y = T * 1.5; if (a.label) a.label.position.y = 2.55 - .46 * a.sit; }
    if (a.disc) a.disc.position.y = .015 + .46 * a.sit;
    if (a.blob) { a.blob.position.y = .006 + .46 * a.sit - hop; const bs = 1 - hop * 1.6; a.blob.scale.set(bs, bs, 1); }
    if (a.disc) a.disc.position.y -= hop;
    if (a.ring) a.ring.position.y = .02 - hop;
    if (!a.mixer) return;
    const r = a.react && a.react.until > T ? a.react.kind : null;
    const want = a.walking ? 'walk' : r === 'cheer' && a.sit < .5 ? 'cheer' : r === 'sad' ? 'sad' : 'idle';
    if (want !== a.cur) { const n = a.actions[want], o = a.actions[a.cur]; n.reset().play(); if (o) n.crossFadeFrom(o, .35, false); a.cur = want; }
    a.actions.walk.timeScale = a.spd / 1.3;
    a.acc = (a.acc || 0) + dt;
    if (!a.fast && !a.walking) {
      sph.center.set(a.x, .9, a.z);
      if (!frustum.intersectsSphere(sph) && a.acc < 1) return;          // hors champ : pose mise à jour au plus 1 fois par seconde
      if ((frameN + a.slot) % (LITE ? 3 : 2)) return;
    }
    a.mixer.update(a.acc); a.acc = 0;
    const B = a.bones;
    if (a.sit > .01) {
      const k = a.sit;
      ['LeftUpLeg', 'RightUpLeg'].forEach(n => B[n] && B[n].quaternion.multiply(qx.setFromAxisAngle(AX, 1.45 * k)));
      ['LeftLeg', 'RightLeg'].forEach(n => B[n] && B[n].quaternion.multiply(qx.setFromAxisAngle(AX, -1.45 * k)));
      if (r === 'cheer') ['LeftArm', 'RightArm'].forEach((n, i) => B[n] && B[n].quaternion.multiply(qx.setFromAxisAngle(AX, -1.2 - Math.abs(Math.sin(T * 6 + i)) * .5)));
    }
    if (a.jumpUntil > T) {                    // saut de joie : bras en V au-dessus de la tête, jambes qui amortissent
      const k = Math.min(1, (T - a.jumpT0) / .12, (a.jumpUntil - T) / .3), land = (1 - Math.min(1, hop / .07)) * k;
      if (B.LeftArm) B.LeftArm.quaternion.multiply(qx.setFromAxisAngle(AZ, -2.5 * k));
      if (B.RightArm) B.RightArm.quaternion.multiply(qx.setFromAxisAngle(AZ, 2.5 * k));
      ['LeftUpLeg', 'RightUpLeg'].forEach(n => B[n] && B[n].quaternion.multiply(qx.setFromAxisAngle(AX, .4 * land)));
      ['LeftLeg', 'RightLeg'].forEach(n => B[n] && B[n].quaternion.multiply(qx.setFromAxisAngle(AX, -.7 * land)));
    }
    if (r === 'laugh' && B.Head) {             // rire : tête qui bascule un peu en arrière, épaules qui sautillent
      const s1 = Math.sin(T * 15), s2 = Math.sin(T * 7.5);
      B.Head.quaternion.multiply(qx.setFromAxisAngle(AX, -.07 + s1 * .05));
      if (B.Spine2) B.Spine2.quaternion.multiply(qx.setFromAxisAngle(AX, -.03 + s2 * .025));
      if (B.LeftShoulder) B.LeftShoulder.quaternion.multiply(qx.setFromAxisAngle(AZ, s1 * .05));
      if (B.RightShoulder) B.RightShoulder.quaternion.multiply(qx.setFromAxisAngle(AZ, -s1 * .05));
    }
    if (a.talk > T && B.Head) { B.Head.quaternion.multiply(qx.setFromAxisAngle(AX, Math.sin(T * 5.5) * .06)); B.Head.quaternion.multiply(qx.setFromAxisAngle(AY, Math.sin(T * 1.7) * .15)); if (B.RightForeArm) B.RightForeArm.quaternion.multiply(qx.setFromAxisAngle(AX, -.5 - Math.sin(T * 3.1) * .3)); }
  }

  /* ---------- caméra ---------- */
  const CAMS = {
    wide: [[7.2, 2.85, 6.2], [-1.6, .25, -2.6]],
    lobby: [[7.0, 2.8, 6.0], [-1.0, .35, -2.2]],
    profs: [[-.3, 1.7, -2.3], [-1.1, 1.42, -5.6]],
    scene: [[7.5, 1.62, -3.0], [3.7, 1.25, -4.4]],
    line: [[0, 3.1, -.4], [0, 0, 5.8]],
    final: [[0, 2.4, 3.8], [0, 1.0, -4.2]]
  };
  let camKey = 'lobby';
  const camPos = new THREE.Vector3(...CAMS.lobby[0]), camLook = new THREE.Vector3(...CAMS.lobby[1]);
  const tp = new THREE.Vector3(), tl = new THREE.Vector3();
  let fol = { id: null, mode: 'back' };
  /* [dx, hauteur, dz, visée] : de dos on regarde vers le tableau, de face on regarde le personnage */
  const FOLLOW = {
    back: [[.75, 2.15, 2.35, 'ahead'], [-.75, 2.15, 2.35, 'ahead'], [2.3, 2.0, 1.0, 'me'], [-2.3, 2.0, 1.0, 'me'], [.8, 2.3, -2.3, 'me'], [0, 2.8, 0, 'me']],
    front: [[.55, 1.75, -2.1, 'me'], [-.55, 1.75, -2.1, 'me'], [2.1, 1.7, -1.1, 'me'], [-2.1, 1.7, -1.1, 'me'], [2.2, 1.8, .9, 'me'], [-2.2, 1.8, .9, 'me'], [.6, 2.2, 2.3, 'me'], [0, 2.8, 0, 'me']]
  };
  function follow(id, mode = 'back', snap) { fol = { id, mode }; camKey = 'follow'; if (snap) snapNext = true; }
  let snapNext = false;
  function cam(k, snap) { if (!CAMS[k]) return; camKey = k; if (snap) { camPos.set(...CAMS[k][0]); camLook.set(...CAMS[k][1]); } }

  let T = 0;
  const v3 = new THREE.Vector3();
  function screenPos(id, y = 2.0) {
    const a = people.get(id); if (!a) return null;
    v3.set(a.x, y + (a.sit * -.38), a.z).project(camera);
    if (v3.z > 1) return null;
    const c = renderer.domElement; return { x: (v3.x + 1) / 2 * c.clientWidth, y: (1 - v3.y) / 2 * c.clientHeight };
  }
  let composer = null, gtao = null, grade = null, bloom = null, hq = true;
  /* valeurs invalides (NaN, infini) : un seul pixel fautif (normale dégénérée, reflet trop intense) serait étalé par le halo
     sur tout l'écran et donnerait un écran noir pendant quelques images. On les neutralise à l'entrée du halo et en sortie. */
  const SANE = 'vec3 sane( vec3 c ) { return ( any( isnan( c ) ) || any( isinf( c ) ) ) ? vec3( 0. ) : c; }\n';
  if (!LITE) try {
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(800, 450, { type: THREE.HalfFloatType, samples: BASE_PR > 1.2 ? 2 : 4 })); composer.addPass(new RenderPass(scene, camera));
    {
    gtao = new GTAOPass(scene, camera, 800, 450); gtao.updateGtaoMaterial({ radius: .5, distanceExponent: 1.6, thickness: 1.3, scale: 1.1 }); gtao.blendIntensity = 1.0; composer.addPass(gtao);
    const gtaoSize = gtao.setSize.bind(gtao); gtao.setSize = (w, h) => gtaoSize(Math.max(2, w >> 1), Math.max(2, h >> 1));
    const gtaoRender = gtao.render.bind(gtao); gtao.render = (...args) => { fxObjects.forEach(o => o.visible = false); people.forEach(a => a.body.visible = false); gtaoRender(...args); fxObjects.forEach(o => o.visible = true); people.forEach(a => a.body.visible = true); };
    bloom = new UnrealBloomPass(new THREE.Vector2(400, 225), .3, .55, .82); const bloomSize = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => bloomSize(Math.max(2, w >> 1), Math.max(2, h >> 1)); composer.addPass(bloom);
    const hp = bloom.materialHighPassFilter, TEX = 'vec4 texel = texture2D( tDiffuse, vUv );';
    if (!hp.fragmentShader.includes(TEX)) throw new Error('filtre du halo inattendu');
    hp.fragmentShader = SANE + hp.fragmentShader.replace(TEX, TEX + ' texel.rgb = min( sane( texel.rgb ), vec3( 24. ) );');
    }
    composer.addPass(new OutputPass());
    grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(800, 450) }, sharp: { value: .55 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform vec2 res; uniform float sharp; varying vec2 vUv;
        ${SANE}
        float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec2 d = vUv - .5; float r2 = dot(d, d); vec2 off = d * r2 * .004; vec2 px = 1. / res;
          vec3 c = sane(vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b));
          vec3 nb = sane(texture2D(tDiffuse, vUv + vec2(px.x, 0.)).rgb + texture2D(tDiffuse, vUv - vec2(px.x, 0.)).rgb + texture2D(tDiffuse, vUv + vec2(0., px.y)).rgb + texture2D(tDiffuse, vUv - vec2(0., px.y)).rgb);
          c = clamp(c + (c - nb * .25) * sharp, 0., 1.);
          c = mix(c, c * c * (3. - 2. * c), .38);
          float l = dot(c, vec3(.2126, .7152, .0722));
          c = mix(vec3(l), c, 1.16);
          c += mix(vec3(-.018, .006, .03), vec3(.045, .016, -.03), smoothstep(.15, .85, l));
          c *= mix(1., smoothstep(1.05, .3, length(d) * 1.3), .5);
          c += (rand(vUv * res + fract(time) * 91.) - .5) * .018;
          gl_FragColor = vec4(clamp(c, 0., 1.), 1.);
        }`
    });
    composer.addPass(grade);
  } catch (e) { console.warn('post-traitement indisponible', e); composer = null; }
  let VW = 800, VH = 450;
  /* changer la taille du canevas l'efface : on l'applique juste avant de dessiner, jamais entre deux images (sinon écran noir) */
  let resPending = true;
  function applyRes() { resPending = true; }
  function doRes() { resPending = false; const pr = BASE_PR * rs; renderer.setPixelRatio(pr); renderer.setSize(VW, VH, false); if (composer) { composer.setPixelRatio(pr); composer.setSize(VW, VH); } if (grade) { grade.uniforms.res.value.set(VW * pr, VH * pr); grade.uniforms.sharp.value = .45 + (1 - rs) * .6; } }
  function resize(w, h) { VW = w; VH = h; applyRes(); camera.aspect = w / h; camera.fov = w / h < 1.2 ? 62 : 48; camera.updateProjectionMatrix(); }
  /* fait avancer les déplacements sans dessiner (rattrapage après une pause) */
  function advance(sec) { if (!(sec > 0)) return; const n = Math.ceil(sec / .1), d = sec / n; for (let i = 0; i < n; i++) { T += d; people.forEach(a => animate(a, d)); } }
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere(new THREE.Vector3(), 1.3);
  function tick(dt) {
    if (lost) return;
    { const now = performance.now(), fdt = now - lastFrame; lastFrame = now;          // images régulières : l'écran d'attente peut disparaître
      if (readyAt && settleRes) { settleN = fdt < 45 ? settleN + 1 : 0; if (settleN >= 12 || now - readyAt > 7000) { settleRes(true); settleRes = null; } } }
    adapt(); if (resPending) doRes();
    renderer.info.reset(); T += dt;
    frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    people.forEach(a => animate(a, dt));
    if (camKey === 'follow') {
      const a = people.get(fol.id);
      if (a && fol.mode === 'face') {        // gros plan de face, assez large pour voir les bras levés
        const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), d = 2.25;
        tp.set(a.x + fx * d + fz * .25, 1.62, a.z + fz * d - fx * .25); tl.set(a.x, 1.38 + (a.hopY || 0) * .6, a.z);
      } else if (a) {
        const sy = a.sit * -.3;
        /* plusieurs angles possibles : on prend le premier qui reste dans la salle (jamais derrière un mur) */
        const C = FOLLOW[fol.mode] || FOLLOW.back, inRoom = (x, z) => x > -7.3 && x < 7.3 && z > -5.9 && z < 6.0;
        let c = C.find(o => inRoom(a.x + o[0], a.z + o[2])) || C[C.length - 1];
        tp.set(Math.max(-7.3, Math.min(7.3, a.x + c[0])), c[1] + sy * .5, Math.max(-5.9, Math.min(6.0, a.z + c[2])));
        if (c[3] === 'ahead') tl.set(a.x - .25, .85, a.z - 2.6); else tl.set(a.x, 1.0 + sy, a.z);
      }
    } else { const [p, l] = CAMS[camKey]; tp.set(...p); tl.set(...l); }
    if (camKey === 'lobby' || camKey === 'wide') { tp.x += Math.sin(T * .12) * .35; tp.z += Math.cos(T * .1) * .2; }
    if (snapNext) { snapNext = false; camPos.copy(tp); camLook.copy(tl); }
    const k = 1 - Math.exp(-dt * (camKey === 'follow' && fol.mode === 'face' ? 6 : 2.2)); camPos.lerp(tp, k); camLook.lerp(tl, k);
    camera.position.copy(camPos); camera.position.x += Math.sin(T * .9) * .012 + Math.sin(T * 2.3) * .004; camera.position.y += Math.sin(T * 1.3) * .01;
    camera.lookAt(camLook);
    if (grade) grade.uniforms.time.value = T;
    if (!LITE) { const a = dustG.attributes.position.array; for (let i = 0; i < dustN; i++) { a[i * 3 + 1] += Math.sin(T * .6 + dSeed[i]) * .0009; a[i * 3] += Math.cos(T * .4 + dSeed[i]) * .0006; } dustG.attributes.position.needsUpdate = true; }
    zoneMeshes.forEach(m => { if (m.userData.hi) { const s = 1 + Math.sin(T * 5) * .05; m.scale.set(s, s, 1); } else m.scale.set(1, 1, 1); });
    flagM.rotation.y = Math.sin(T * 3) * .15;
    if (++frameN % (LITE ? 3 : 2) === 0 || frameN < 4) renderer.shadowMap.needsUpdate = true;
    if (composer && hq) composer.render(dt); else renderer.render(scene, camera);
  }
  /* qualité adaptative : baisse la résolution interne puis les effets si l'ordinateur peine,
     et annule toute baisse qui n'apporte pas de gain (écran plafonné à 30 ou 60 Hz, onglet en arrière-plan…) */
  let fpsT0 = performance.now(), fpsN = 0, fps = 60, auto = true, last = null, capped = false, lastL = null, cappedL = false;
  const levels = [() => { rs = 1; }, () => { rs = .85; }, () => { rs = .7; }, () => { rs = .7; if (gtao) gtao.enabled = false; }, () => { rs = .6; if (gtao) gtao.enabled = false; if (bloom) bloom.enabled = false; }];
  let lvl = 0;
  function setLevel(n) { lvl = n; if (gtao) gtao.enabled = useAO; if (bloom) bloom.enabled = true; levels[n](); applyRes(); }
  function adapt() {
    fpsN++; const now = performance.now(); if (now - fpsT0 < (LITE ? 1500 : 3000)) return;
    fps = fpsN * 1000 / (now - fpsT0); fpsN = 0; fpsT0 = now;
    if (!auto || !hq || document.hidden) return;
    if (LITE) {   /* téléphone : seule la résolution interne bouge (aucune recompilation, donc aucun à-coup) */
      if (lastL) { if (fps / lastL.fps < 1.08) { rs = lastL.rs; applyRes(); cappedL = true; } lastL = null; return; }
      if (fps < 48 && rs > .6 && !cappedL) { lastL = { fps, rs }; rs = Math.max(.6, Math.round((rs - .1) * 100) / 100); applyRes(); }
      else if (fps > 58 && rs < 1) { cappedL = false; rs = Math.min(1, Math.round((rs + .05) * 100) / 100); applyRes(); }
      return;
    }
    if (last) { const gain = fps / last.fps; if (gain < 1.12) { setLevel(last.lvl); capped = true; } last = null; return; }
    if (fps < 42 && lvl < levels.length - 1 && !capped) { last = { fps, lvl }; setLevel(lvl + 1); }
    else if (fps > 57 && lvl > 0) { capped = false; setLevel(lvl - 1); }
  }
  function setZones(show, hi = -1) { zoneMeshes.forEach((m, i) => { m.visible = show; m.userData.hi = i === hi; m.material.opacity = hi < 0 || i === hi ? 1 : .3; }); }
  function setLine(show) { lineMesh.visible = show; }
  function setFlag(v) {
    if (v === null || v === undefined) { flag.visible = false; return; }
    const g = flagC.getContext('2d'); g.fillStyle = '#ffd34d'; g.fillRect(0, 0, 256, 160); g.fillStyle = '#111'; g.font = '800 110px Barlow, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(v, 128, 86); flagT.needsUpdate = true;
    flag.position.set(lineX(v), 0, LINE_Z); flag.visible = true;
  }
  function setQuality(high) {
    hq = high;
    rs = high ? 1 : .7; applyRes();
    if (LITE) return;
    renderer.shadowMap.enabled = high; sun.castShadow = high;
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
  }
  const setScale = x => { rs = x; lastL = last = null; cappedL = capped = false; fpsN = 0; fpsT0 = performance.now(); applyRes(); };
  const stats = () => ({ fps: Math.round(fps), scale: rs, ao: !!(gtao && gtao.enabled), bloom: !!(bloom && bloom.enabled), calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
    shadows: renderer.shadowMap.enabled, post: !!(composer && hq), pr: renderer.getPixelRatio(), lite: LITE, lost, restored, programs: renderer.info.programs ? renderer.info.programs.length : 0, textures: renderer.info.memory.textures, sunBaked: roomSunBaked });
  return { get room() { return roomOn; }, get cams() { return Object.keys(CAMS); }, get progress() { return loadN ? Math.min(1, loadDone / loadN) : 0; }, settled, jump, get view() { return { key: camKey, follow: { ...fol } }; }, setScale, stats, ready, setQuality, scene, camera, renderer, addPerson, removePerson, moveTo, sitAt, react, talk, place, setVisible, cam, follow, advance, drive, tick, resize, screenPos, setZones, setLine, setFlag, setScreen, people, get T() { return T; } };
}
