import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { hiddenPartsUpdater } from '../renderer/hidden-parts.js';
import { addOutlines } from '../renderer/outline.js';

// Electron 창에서는 preload 브리지로, 브라우저에서는 models/ 폴더를 직접 읽는다
const bridge = window.petBridge ?? {
  listModels: async () => ({ models: ['Hoshino.glb'], current: 'Hoshino.glb' }),
  readModelFile: (name) => fetch(`../../models/${encodeURIComponent(name)}`).then((r) => r.arrayBuffer()),
};

// 동작 이름 앞부분으로 묶어서 보여준다
const GROUPS = [
  ['Cafe', '카페'], ['Formation', '편성'], ['Rearrange', '재배치'], ['Public', '기타'], ['Victory', '승리'],
  ['Normal', '전투 · 서서'], ['Stand', '전투 · 방패'], ['Move', '이동'], ['Exs', 'EX 스킬'], ['Vital', '피격 · 쓰러짐'],
];
const ATTACK_STEPS = ['Attack_Start', 'Attack_Ing', 'Attack_End', 'Attack_Delay'];

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const grid = new THREE.GridHelper(4, 16, 0x8892a6, 0xb8bfcc);
grid.material.transparent = true;
grid.material.opacity = 0.5;
scene.add(grid);

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
camera.position.set(0, 1.1, 3.4);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.5, 0);
controls.enableDamping = true;
controls.update();

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

let model = null;
let mixer = null;
let updateHiddenParts = () => {};
let updateOutlines = () => {};
let clips = [];
let current = null;          // 지금 재생 중인 action
let sequence = null;         // 공격 순서 재생 중이면 { names, index }
let paused = false;
const weaponMeshes = [];

const unlit = (m) => new THREE.MeshBasicMaterial({
  map: m.map, color: m.color, transparent: m.transparent, alphaTest: m.alphaTest, side: THREE.DoubleSide,
});

async function loadModel(name) {
  if (model) scene.remove(model);
  weaponMeshes.length = 0;
  const data = await bridge.readModelFile(name);
  const buffer = data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    if (/weapon|shield/i.test(o.name)) weaponMeshes.push(o);
    o.material = Array.isArray(o.material) ? o.material.map(unlit) : unlit(o.material);
  });
  updateHiddenParts = hiddenPartsUpdater(gltf.scene);
  updateOutlines = addOutlines(gltf.scene);
  model = gltf.scene;
  scene.add(model);
  mixer = new THREE.AnimationMixer(model);
  mixer.addEventListener('finished', onFinished);
  clips = gltf.animations;
  current = null;
  sequence = null;
  renderList();
  const start = clips.find((c) => c.name === 'Cafe_Idle') ?? clips[0];
  if (start) playClip(start.name);
  $('attackNormal').disabled = !hasAttack('Normal');
  $('attackStand').disabled = !hasAttack('Stand');
}

const findClip = (name) => clips.find((c) => c.name === name);
const hasAttack = (stance) => ATTACK_STEPS.every((s) => findClip(`${stance}_${s}`));

function renderList() {
  const list = $('list');
  list.textContent = '';
  const used = new Set();
  const addGroup = (title, items) => {
    if (!items.length) return;
    const g = document.createElement('div');
    g.className = 'group';
    const h = document.createElement('h2');
    h.textContent = `${title} (${items.length})`;
    g.append(h);
    for (const c of items) {
      used.add(c.name);
      const b = document.createElement('button');
      b.className = 'clip';
      b.dataset.name = c.name;
      const n = document.createElement('span');
      n.textContent = c.name;
      const d = document.createElement('small');
      d.textContent = `${c.duration.toFixed(1)}s`;
      b.append(n, d);
      b.addEventListener('click', () => { sequence = null; playClip(c.name); });
      g.append(b);
    }
    list.append(g);
  };
  for (const [prefix, title] of GROUPS) addGroup(title, clips.filter((c) => c.name.startsWith(prefix)));
  addGroup('그 외', clips.filter((c) => !used.has(c.name)));
}

// 자동: 그 동작이 무기의 뼈대를 움직일 때만 보인다 (총을 들지 숨길지는 애니메이션이 정함).
// 움직임 데이터가 없는 무기(호시노 방패 등)는 몸 한가운데 기본 위치에 박혀 보이기 때문에 숨긴다.
function clipAnimates(clip, mesh) {
  const bones = new Set(mesh.skeleton?.bones.map((b) => THREE.PropertyBinding.sanitizeNodeName(b.name)) ?? []);
  return clip.tracks.some((t) => bones.has(t.name.slice(0, t.name.lastIndexOf('.'))));
}

function applyWeapons(name) {
  const mode = $('weapons').value;
  const clip = findClip(name);
  for (const m of weaponMeshes) {
    m.visible = mode === 'on' || (mode === 'auto' && clipAnimates(clip, m));
  }
}

// 순서 재생 중이면 다음 단계로 짧게 섞어 넘어가고, 아니면 바로 바꾼다
function playClip(name, { fade = 0 } = {}) {
  const clip = findClip(name);
  if (!clip) return;
  const action = mixer.clipAction(clip);
  const prev = current;
  for (const a of mixer._actions) if (a !== prev && a !== action) a.stop();
  const loop = !sequence && $('loop').checked;
  action.reset();
  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  action.clampWhenFinished = !loop;
  action.setEffectiveWeight(1);
  action.play();
  if (prev && prev !== action) {
    if (fade > 0) action.crossFadeFrom(prev, fade, false);
    else prev.stop();
  }
  current = action;
  paused = false;
  $('pause').textContent = '일시정지';
  applyWeapons(name);
  $('now').textContent = sequence ? `${name}  (${sequence.index + 1}/${sequence.names.length})` : name;
  for (const b of document.querySelectorAll('.clip')) b.classList.toggle('active', b.dataset.name === name);
}

function onFinished(e) {
  if (e.action !== current || !sequence) return;
  sequence.index += 1;
  if (sequence.index < sequence.names.length) {
    playClip(sequence.names[sequence.index], { fade: 0.08 });
  } else {
    sequence = null;
    $('now').textContent += '  — 끝';
  }
}

function playAttack(stance) {
  sequence = { names: ATTACK_STEPS.map((s) => `${stance}_${s}`), index: 0 };
  playClip(sequence.names[0]);
}

// ---- 조작 ----
$('attackNormal').addEventListener('click', () => playAttack('Normal'));
$('attackStand').addEventListener('click', () => playAttack('Stand'));
$('weapons').addEventListener('change', () => current && applyWeapons(current.getClip().name));
$('loop').addEventListener('change', () => { if (current && !sequence) playClip(current.getClip().name); });
$('pause').addEventListener('click', () => {
  paused = !paused;
  $('pause').textContent = paused ? '재생' : '일시정지';
});
$('seek').addEventListener('input', () => {
  if (!current) return;
  paused = true;
  $('pause').textContent = '재생';
  current.paused = false;
  current.time = (Number($('seek').value) / 1000) * current.getClip().duration;
  mixer.update(0);
});
$('model').addEventListener('change', () => loadModel($('model').value));

// ---- 루프 ----
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = clock.getDelta();
  if (mixer && !paused) mixer.update(dt * Number($('speed').value));
  updateHiddenParts();
  updateOutlines();
  if (current) {
    const dur = current.getClip().duration;
    const t = Math.min(current.time, dur);
    $('time').textContent = `${t.toFixed(2)} / ${dur.toFixed(2)}s`;
    if (!paused) $('seek').value = String(Math.round((t / dur) * 1000));
  }
  controls.update();
  renderer.render(scene, camera);
}

(async () => {
  const { models, current: cur } = await bridge.listModels();
  for (const m of models) {
    const o = document.createElement('option');
    o.value = m;
    o.textContent = m.replace(/\.glb$/i, '');
    $('model').append(o);
  }
  $('model').value = models.includes(cur) ? cur : models[0];
  resize();
  await loadModel($('model').value);
  requestAnimationFrame(frame);
})().catch((err) => {
  $('now').textContent = `불러오기 실패: ${err.message}`;
  console.error(err);
});

window.__viewer = { playClip, playAttack, get current() { return current?.getClip().name; } };
