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
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .82;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0c1113');
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 90);

  const mat = (c, r = 0.8, m = 0, x = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r, metalness: m }, x));
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  function add(geo, m, x, y, z, parent = scene, cast = true) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; parent.add(o); return o; }
  function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.userData.canvas = c; return t; }
  let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;

  /* ---------- extérieur ---------- */
  const sky = tex(2048, 800, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6fa6d6'); gr.addColorStop(.6, '#bcd7ea'); gr.addColorStop(1, '#e6eef2');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 14; i++) { const x = rnd() * w, y = 80 + rnd() * 220; g.beginPath(); g.ellipse(x, y, 120 + rnd() * 160, 22 + rnd() * 20, 0, 0, 7); g.fill(); }
    for (let i = 0; i < 26; i++) { const bw = 60 + rnd() * 140, bh = 120 + rnd() * 260, x = rnd() * w; g.fillStyle = `rgb(${120 + rnd() * 30 | 0},${132 + rnd() * 25 | 0},${145 + rnd() * 20 | 0})`; g.fillRect(x, h - 200 - bh, bw, bh + 200);
      g.fillStyle = 'rgba(230,240,250,.35)'; for (let yy = h - 190 - bh; yy < h - 210; yy += 22) for (let xx = x + 8; xx < x + bw - 10; xx += 18) g.fillRect(xx, yy, 9, 10); }
    for (let i = 0; i < 70; i++) { const x = rnd() * w, r = 40 + rnd() * 60; g.fillStyle = ['#5f7d4f', '#6d8c55', '#4f6c44', '#86995c'][i % 4]; g.beginPath(); g.arc(x, h - 60 - rnd() * 60, r, 0, 7); g.fill(); }
  });
  const skyM = new THREE.Mesh(new THREE.PlaneGeometry(70, 27), new THREE.MeshBasicMaterial({ map: sky }));
  skyM.position.set(-24, 3, 0); skyM.rotation.y = Math.PI / 2; scene.add(skyM);

  /* ---------- lumière ---------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.add(new THREE.HemisphereLight('#e4edf5', '#857a68', 0.25));
  const sun = new THREE.DirectionalLight('#fff0d4', 3.1);
  sun.position.set(-15, 8.5, 3.5); sun.target.position.set(0, 0, 0.5); scene.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 10, bottom: -10, near: 2, far: 40 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  const panels = [];
  [-4.5, 0, 4.5].forEach(x => [-3.2, 0.6, 4.2].forEach(z => {
    const l = new THREE.PointLight('#fff6e8', 3.2, 0, 2); l.position.set(x, 2.95, z); scene.add(l);
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
  const floor = add(new THREE.PlaneGeometry(16, 13), mat('#ffffff', .62, 0, { map: floorT }), 0, 0, 0, scene, false);
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
    add(new THREE.PlaneGeometry(len, 1.7), glass, -8.06, 1.75, zc, scene, false).rotation.y = Math.PI / 2;
    add(B(.08, .06, len), alu, -8.02, .93, zc); add(B(.08, .06, len), alu, -8.02, 2.57, zc); add(B(.08, .06, len), alu, -8.02, 1.9, zc);
    [a + .03, zc, b - .03].forEach(z => add(B(.08, 1.7, .05), alu, -8.02, 1.75, z));
    add(B(.3, .04, len + .1), mat('#f3f1ec', .6), -7.88, .9, zc);
    const rad = add(B(.1, .5, len - .4), mat('#e8e6e1', .5, .2), -7.9, .5, zc);
    for (let z = a + .3; z < b - .25; z += .09) add(B(.02, .46, .02), mat('#d7d4ce', .5, .2), -7.84, .5, z, scene, false);
  });
  add(B(.25, 3.4, 4.3), wallM, 8.125, 1.6, -4.45);
  add(B(.25, 3.4, 8.1), wallM, 8.125, 1.6, 2.45);
  add(B(.25, 1.2, 1.4), wallM, 8.125, 2.7, -1.7);
  const door = add(B(.06, 2.1, 1.3), mat('#8c6b4b', .55), 7.98, 1.05, -1.7);
  add(B(.06, .04, .16), alu, 7.92, 1.0, -2.2); add(B(.1, 2.2, .06), trimM, 7.97, 1.1, -2.38); add(B(.1, 2.2, .06), trimM, 7.97, 1.1, -1.02); add(B(.1, .06, 1.42), trimM, 7.97, 2.16, -1.7);
  const exitT = tex(256, 96, (g, w, h) => { g.fillStyle = '#108a3f'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '700 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SORTIE', w / 2, h / 2 + 3); });
  const exit = add(B(.08, .22, .55), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffffff', emissiveMap: exitT, map: exitT, emissiveIntensity: .9 }), 7.95, 2.45, -1.7, scene, false);
  add(new THREE.CylinderGeometry(.08, .08, .5, 16), mat('#c4231d', .4, .2), 7.82, .55, -0.6);
  [[-8.0, 0], [8.0, 0]].forEach(([x]) => { });
  add(B(16, .1, .03), trimM, 0, .05, -6.49, scene, false); add(B(.03, .1, 13), trimM, -7.99, .05, 0, scene, false); add(B(.03, .1, 13), trimM, 7.99, .05, 0, scene, false);
  // plafond
  const ceilT = tex(512, 512, (g, w, h) => { g.fillStyle = '#efeeea'; g.fillRect(0, 0, w, h); for (let k = 0; k < 3000; k++) { g.fillStyle = `rgba(120,120,110,${rnd() * .12})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); } g.strokeStyle = '#c9c7c0'; g.lineWidth = 6; g.strokeRect(0, 0, w, h); });
  ceilT.wrapS = ceilT.wrapT = THREE.RepeatWrapping; ceilT.repeat.set(16 / 1.2, 13 / 0.6);
  add(B(16.6, .12, 13.6), mat('#ffffff', .95, 0, { map: ceilT }), 0, 3.31, 0);
  const lightM = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff7ea', emissiveIntensity: 1.6 });
  panels.forEach(([x, z]) => { add(B(1.2, .03, .6), lightM, x, 3.24, z, scene, false); add(B(1.26, .05, .66), alu, x, 3.255, z, scene, false); });

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
  add(new THREE.PlaneGeometry(4.6, 1.35), mat('#ffffff', .25, 0, { map: boardT }), -1.2, 1.6, -6.45, scene, false);
  add(B(4.4, .04, .1), alu, -1.2, .9, -6.42);
  [['#1d4fa8', -2.4], ['#b3261e', -2.25], ['#222', -2.1]].forEach(([c, x]) => add(new THREE.CylinderGeometry(.012, .012, .12, 8), mat(c, .5), x, .935, -6.41, scene, false).rotation.z = Math.PI / 2);

  /* ---------- écran de projection (dynamique) ---------- */
  const scrC = document.createElement('canvas'); scrC.width = 1280; scrC.height = 760;
  const scrT = new THREE.CanvasTexture(scrC); scrT.colorSpace = THREE.SRGBColorSpace;
  add(B(3.0, .12, .14), mat('#d8d8d5', .5, .3), 4.5, 2.83, -6.4);
  add(new THREE.PlaneGeometry(2.86, 1.7), new THREE.MeshStandardMaterial({ map: scrT, emissive: '#ffffff', emissiveMap: scrT, emissiveIntensity: .55, roughness: .9 }), 4.5, 1.92, -6.42, scene, false);
  add(B(.36, .14, .3), mat('#e5e5e2', .5, .2), 4.5, 3.12, -2.0); add(new THREE.CylinderGeometry(.05, .05, .04, 16), mat('#222', .3), 4.5, 3.11, -2.17, scene, false).rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(.015, .015, .12, 6), alu, 4.5, 3.22, -2.0, scene, false);
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
  const clock = add(new THREE.CylinderGeometry(.22, .22, .05, 32), [mat('#333', .4), mat('#fff', .4, 0, { map: clockT }), mat('#333')], -5.6, 2.65, -6.47, scene, false); clock.rotation.x = Math.PI / 2;
  const posterT = tex(300, 420, (g, w, h) => { g.fillStyle = '#0f6b45'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd34d'; g.font = '700 40px Arial'; g.fillText('UdeS', 24, 70); g.fillStyle = '#fff'; g.font = '600 26px Arial'; ['Campus de', 'Longueuil', '', 'Génie', 'Automne 2026'].forEach((t, i) => g.fillText(t, 24, 140 + i * 40)); });
  add(new THREE.PlaneGeometry(.6, .84), mat('#fff', .7, 0, { map: posterT }), 6.9, 1.7, -6.47, scene, false);
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
    add(B(2.7, .04, .7), lam, c, .74, r); add(B(2.7, .02, .7), mat('#cfccc5', .5), c, .715, r, scene, false);
    [[-1.3, -.3], [1.3, -.3], [-1.3, .3], [1.3, .3]].forEach(([dx, dz]) => add(new THREE.CylinderGeometry(.022, .022, .72, 8), leg, c + dx, .36, r + dz));
    add(B(2.6, .03, .03), leg, c, .12, r - .3);
    const k = rnd(); if (k < .6) add(B(.3, .02, .22), mat(['#2c5aa0', '#c0392b', '#f0f0ea', '#e2b33d'][Math.floor(rnd() * 4)], .7), c - .6 + rnd() * 1.2, .77, r - .05, scene, false);
    if (k < .35) { add(B(.33, .015, .23), mat('#3a3f45', .3, .6), c + .5, .77, r + .05, scene, false); const s = add(B(.33, .22, .01), new THREE.MeshStandardMaterial({ color: '#16191c', emissive: '#6aa0d8', emissiveIntensity: .35 }), c + .5, .87, r - .07, scene, false); s.rotation.x = -.3; }
  }));
  SEATS.forEach(s => {
    const z = s.z + .06;
    add(B(.44, .05, .42), plastic, s.x, .46, z); add(B(.42, .34, .04), plastic, s.x, .78, z + .22).rotation.x = -.1;
    [[-.19, -.17], [.19, -.17], [-.19, .17], [.19, .17]].forEach(([dx, dz]) => add(B(.025, .44, .025), leg, s.x + dx, .22, z + dz, scene, false));
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

  scene.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial && !o.material.emissiveMap) o.material.envMapIntensity = .35; });
  /* ---------- personnages réalistes (modèles glTF animés) ---------- */
  const people = new Map();
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const base = opts.assets || './assets/';
  const modelCache = {}, clips = {};
  const loadModel = name => modelCache[name] || (modelCache[name] = loader.loadAsync(base + name + '.glb').then(g => {
    g.scene.traverse(n => { if (n.isMesh) { const ms = Array.isArray(n.material) ? n.material : [n.material]; ms.forEach(m => { m.metalness = 0; m.metalnessMap = null; m.roughnessMap = null; m.roughness = /hair|eye|lash/i.test(m.name) ? .55 : .78; m.envMapIntensity = .35; if (/lash|hair/i.test(m.name)) { m.alphaTest = .4; m.transparent = false; m.depthWrite = true; } m.needsUpdate = true; }); } });
    return g;
  }));
  const ANIMS = { idle: 'anim_idle', walk: 'anim_walking', sad: 'anim_sad_idle', cheer: 'anim_celebrating' };
  const animsReady = Promise.all(Object.entries(ANIMS).map(([k, f]) => loader.loadAsync(base + f + '.glb').then(g => {
    const c = g.animations[0];
    c.tracks = c.tracks.filter(t => !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || t.name === 'Hips.position'));
    const hp = c.tracks.find(t => t.name === 'Hips.position');
    if (hp) { const v = hp.values, x0 = v[0], z0 = v[2]; for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; } }
    clips[k] = c;
  })));
  const ready = animsReady.catch(e => console.warn('animations', e));
  (opts.preload || []).forEach(n => loadModel(n).catch(() => { }));
  function labelSprite(text, color) {
    const c = document.createElement('canvas'), g = c.getContext('2d'); g.font = '700 46px Barlow, Arial';
    const w = Math.ceil(g.measureText(text).width) + 74; c.width = w; c.height = 76;
    g.font = '700 46px Barlow, Arial'; g.fillStyle = 'rgba(12,16,18,.78)'; g.beginPath(); g.roundRect ? g.roundRect(0, 4, w, 68, 16) : g.rect(0, 4, w, 68); g.fill();
    g.fillStyle = color; g.beginPath(); g.arc(30, 38, 11, 0, 7); g.fill(); g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(text, 52, 40);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false }));
    sp.scale.set(w / 76 * .026, .026, 1); sp.position.y = 1.98; sp.renderOrder = 10; return sp;
  }
  const discGeo = new THREE.CircleGeometry(.32, 32);
  function addPerson(id, look, o = {}) {
    if (people.has(id)) return people.get(id);
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body); scene.add(root);
    const a = { id, root, body, x: o.x ?? 0, z: o.z ?? 0, yaw: o.yaw ?? 0, tyaw: o.yaw ?? 0, path: [], spd: o.spd || (1.25 + Math.random() * .2), sit: 0, sitting: false, walking: false, react: null, talk: 0, after: 'stand', faceYaw: null, bones: null, mixer: null, actions: null, cur: null };
    if (o.label) { a.label = labelSprite(o.label, o.color || '#fff'); root.add(a.label); }
    if (o.color) { const d = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: .55, depthWrite: false })); d.rotation.x = -Math.PI / 2; d.position.y = .015; root.add(d); a.disc = d; }
    Promise.all([loadModel(look.model || 'kate'), ready]).then(([g]) => {
      if (!people.has(id)) return;
      const m = cloneSkinned(g.scene); m.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false; } });
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
  function talk(id, sec) { const a = people.get(id); if (a) a.talk = T + sec; }
  function setVisible(id, v) { const a = people.get(id); if (a) a.root.visible = v; }
  function place(id, x, z, yaw) { const a = people.get(id); if (!a) return; a.x = x; a.z = z; a.path = []; if (yaw !== undefined) a.yaw = a.tyaw = yaw; a.sitting = false; a.sit = 0; }

  const lerp = (a, b, k) => a + (b - a) * k;
  const qx = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);
  function animate(a, dt) {
    if (a.delay > 0) a.delay -= dt;
    else if (a.path.length) {
      const t = a.path[0], dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz), st = a.spd * dt;
      if (d <= st) { a.x = t.x; a.z = t.z; a.path.shift(); if (!a.path.length) { a.walking = false; if (a.after === 'sit') { a.sitting = true; a.tyaw = Math.PI; } else if (a.faceYaw !== null) a.tyaw = a.faceYaw; } }
      else { a.x += dx / d * st; a.z += dz / d * st; a.walking = true; a.tyaw = Math.atan2(dx, dz); }
    } else a.walking = false;
    let dy = a.tyaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yaw += dy * Math.min(1, dt * 7);
    a.sit = lerp(a.sit, a.sitting ? 1 : 0, Math.min(1, dt * 5));
    a.root.position.set(a.x, -0.46 * a.sit, a.z); a.root.rotation.y = a.yaw;
    if (a.label) a.label.position.y = 1.98;
    if (a.disc) a.disc.position.y = .015 + .46 * a.sit;
    if (!a.mixer) return;
    const r = a.react && a.react.until > T ? a.react.kind : null;
    const want = a.walking ? 'walk' : r === 'cheer' && a.sit < .5 ? 'cheer' : r === 'sad' ? 'sad' : 'idle';
    if (want !== a.cur) { const n = a.actions[want], o = a.actions[a.cur]; n.reset().play(); if (o) n.crossFadeFrom(o, .35, false); a.cur = want; }
    a.actions.walk.timeScale = a.spd / 1.3;
    a.mixer.update(dt);
    const B = a.bones;
    if (a.sit > .01) {
      const k = a.sit;
      ['LeftUpLeg', 'RightUpLeg'].forEach(n => B[n] && B[n].quaternion.multiply(qx.setFromAxisAngle(AX, 1.45 * k)));
      ['LeftLeg', 'RightLeg'].forEach(n => B[n] && B[n].quaternion.multiply(qx.setFromAxisAngle(AX, -1.45 * k)));
      if (r === 'cheer') ['LeftArm', 'RightArm'].forEach((n, i) => B[n] && B[n].quaternion.multiply(qx.setFromAxisAngle(AX, -1.2 - Math.abs(Math.sin(T * 6 + i)) * .5)));
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
  function cam(k, snap) { if (!CAMS[k]) return; camKey = k; if (snap) { camPos.set(...CAMS[k][0]); camLook.set(...CAMS[k][1]); } }

  let T = 0;
  const v3 = new THREE.Vector3();
  function screenPos(id, y = 2.0) {
    const a = people.get(id); if (!a) return null;
    v3.set(a.x, y + (a.sit * -.38), a.z).project(camera);
    if (v3.z > 1) return null;
    const c = renderer.domElement; return { x: (v3.x + 1) / 2 * c.clientWidth, y: (1 - v3.y) / 2 * c.clientHeight };
  }
  let composer = null, gtao = null, hq = true;
  try {
    composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
    gtao = new GTAOPass(scene, camera, 800, 450); gtao.updateGtaoMaterial({ radius: .45, distanceExponent: 1.5, thickness: 1.2, scale: 1 }); gtao.blendIntensity = .9; composer.addPass(gtao);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(800, 450), .14, .35, 1.0));
    composer.addPass(new OutputPass());
  } catch (e) { console.warn('post-traitement indisponible', e); composer = null; }
  function resize(w, h) { renderer.setSize(w, h, false); if (composer) composer.setSize(w, h); camera.aspect = w / h; camera.fov = w / h < 1.2 ? 66 : 52; camera.updateProjectionMatrix(); }
  function tick(dt) {
    T += dt;
    people.forEach(a => animate(a, dt));
    const [p, l] = CAMS[camKey]; tp.set(...p); tl.set(...l);
    if (camKey === 'lobby' || camKey === 'wide') { tp.x += Math.sin(T * .12) * .35; tp.z += Math.cos(T * .1) * .2; }
    const k = 1 - Math.exp(-dt * 2.2); camPos.lerp(tp, k); camLook.lerp(tl, k);
    camera.position.copy(camPos); camera.lookAt(camLook);
    zoneMeshes.forEach(m => { if (m.userData.hi) { const s = 1 + Math.sin(T * 5) * .05; m.scale.set(s, s, 1); } else m.scale.set(1, 1, 1); });
    flagM.rotation.y = Math.sin(T * 3) * .15;
    if (composer && hq) composer.render(dt); else renderer.render(scene, camera);
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
    renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio || 1, 1.75) : 1);
    renderer.shadowMap.enabled = high; sun.castShadow = high;
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
  }
  return { ready, setQuality, scene, camera, renderer, addPerson, removePerson, moveTo, sitAt, react, talk, place, setVisible, cam, tick, resize, screenPos, setZones, setLine, setFlag, setScreen, people, get T() { return T; } };
}
