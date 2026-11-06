// 합동 승리 배치 도구 페이지 (tools/joint-placer.js가 띄움): 조합의 학생들을 한 장면에 놓고 합동 승리 동작을 같이 반복 재생,
// 학생마다 자리(x, z)·방향(도)·거울 뒤집기를 맞춰 저장한다. 좌표는 펫과 같은 three.js 단위(캐릭터 키 ≈ 1), 방향 0 = 카메라(+z)를 봄
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { hiddenPartsUpdater, showSwitchedWeapons, restUnderHiddenBones, limitRevivedScales } from '../src/renderer/hidden-parts.js';
import { addOutlines } from '../src/renderer/outline.js';

const $ = (id) => document.getElementById(id);
const RECORD = new URLSearchParams(location.search).has('record');
if (RECORD) document.body.classList.add('record');
const bridge = window.placerBridge;
const COLORS = ['#e5484d', '#3d7bf7', '#30a46c', '#f5a524', '#8e4ec6', '#12a594'];
const FRAME = 1 / 30; // 한 프레임 넘기기 (게임 동작은 30fps로 뽑음)

// ---- 한글 이름 (학생 메뉴 표) ----
let names = { students: {}, outfits: {} };
const korean = (name) => {
  const m = /^(.*?)(?: \((.*)\))?$/.exec(name);
  const base = names.students[m[1]] ?? m[1];
  return m[2] ? `${base} (${names.outfits[m[2]] ?? m[2]})` : base;
};

// ---- 장면 ----
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: RECORD });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const stageColor = () => getComputedStyle(document.body).getPropertyValue('--stage').trim() || '#e9ecf2';
renderer.setClearColor(new THREE.Color(stageColor()));
const scene = new THREE.Scene();
const grid = new THREE.GridHelper(4, 16, 0x8892a6, 0xb8bfcc);
grid.material.transparent = true;
grid.material.opacity = 0.45;
scene.add(grid);
const fine = new THREE.GridHelper(2, 40, 0xb8bfcc, 0xc8ced8); // 0.05 눈금 (가운데 2×2)
fine.material.transparent = true;
fine.material.opacity = 0.25;
fine.position.y = -0.001;
scene.add(fine);

// 카메라: 펫처럼 정사영으로 살짝 내려다봄(12°). 보기 각도·옆 돌리기·확대·화면 옮기기는 이 도구에서만
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
const view = { height: RECORD ? 2.6 : 2.8, tilt: 12, yaw: 0, target: new THREE.Vector3(0, 0.75, 0) };
function layout() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  const halfH = view.height / 2;
  const halfW = halfH * (w / h);
  Object.assign(camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
  const t = THREE.MathUtils.degToRad(view.tilt);
  const y = THREE.MathUtils.degToRad(view.yaw);
  camera.position.copy(view.target).add(new THREE.Vector3(Math.sin(y) * Math.cos(t), Math.sin(t), Math.cos(y) * Math.cos(t)).multiplyScalar(10));
  if (view.tilt >= 89) camera.up.set(-Math.sin(y), 0, -Math.cos(y));
  else camera.up.set(0, 1, 0);
  camera.lookAt(view.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
new ResizeObserver(() => { layout(); draw(); }).observe(canvas);

// ---- 조합·학생 ----
let combos = [];     // tools/joint-placer.js combos()
let placement = {};  // 저장 값: { [조합 id]: { skip, done, members: [{ name, cid, x, z, deg, flip }] } }
let combo = null;    // 지금 조합
let students = [];   // 지금 장면의 학생 { m, holder, model, mixer, start, end, ... }
let selected = -1;
let time = 0;
let length = 1;
let playing = !RECORD;
let dirty = false;
let loading = 0;

const unlit = (m) => new THREE.MeshBasicMaterial({
  name: m.name, map: m.map, color: m.color, transparent: m.transparent, alphaTest: m.alphaTest, side: THREE.DoubleSide,
});

// 그 동작이 무기 뼈대를 움직일 때만 무기가 보임 (펫과 같은 규칙, pet.js clipAnimates)
function clipAnimates(clip, mesh) {
  const bones = new Set(mesh.skeleton?.bones.map((b) => THREE.PropertyBinding.sanitizeNodeName(b.name)) ?? []);
  return clip.tracks.some((t) => bones.has(t.name.slice(0, t.name.lastIndexOf('.'))));
}

function marker(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.2, 48), mat);
  ring.rotation.x = -Math.PI / 2;
  const tip = new THREE.Shape([new THREE.Vector2(-0.05, 0), new THREE.Vector2(0.05, 0), new THREE.Vector2(0, 0.09)]);
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(tip), mat);
  arrow.rotation.x = -Math.PI / 2; // 모양의 +y가 바닥의 -z → 아래에서 z를 뒤집음
  arrow.scale.y = -1;
  arrow.position.z = 0.21;
  g.add(ring, arrow);
  g.position.y = 0.003;
  g.renderOrder = -1;
  g.userData.mat = mat;
  return g;
}

async function loadStudent(m, i) {
  const res = await fetch(`/game-cache/${m.file.split('/').map(encodeURIComponent).join('/')}`);
  if (!res.ok) throw new Error(`${m.file}: ${res.status}`);
  const gltf = await new GLTFLoader().parseAsync(await res.arrayBuffer(), '');
  const start = gltf.animations.find((c) => c.name === m.start);
  const end = gltf.animations.find((c) => c.name === m.end);
  if (!start || !end) throw new Error(`${m.name}: ${m.start}/${m.end} 동작이 없음 (${gltf.animations.filter((c) => /Interaction/.test(c.name)).map((c) => c.name)})`);
  const clips = [start, end];
  const model = gltf.scene;
  const meshes = [];
  const weapons = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    meshes.push(o);
    if (/weapon|shield/i.test(o.name)) weapons.push(o);
    o.material = Array.isArray(o.material) ? o.material.map(unlit) : unlit(o.material);
  });
  // 펫과 같은 손질: 숨긴 소품 아래 뼈, 되살리는 뼈 크기, 기본 숨김 무기
  restUnderHiddenBones(model, clips);
  const limit = limitRevivedScales(model, clips);
  showSwitchedWeapons(model, clips);
  const hide = hiddenPartsUpdater(model);
  const outline = addOutlines(model);
  const outlines = [];
  model.traverse((o) => { if (o.isMesh && !meshes.includes(o)) outlines.push(o); });
  const holder = new THREE.Group();
  holder.add(model);
  const mark = marker(COLORS[i % COLORS.length]);
  scene.add(mark);
  const mixer = new THREE.AnimationMixer(model);
  const actions = clips.map((c) => {
    const a = mixer.clipAction(c);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.play();
    a.paused = true;
    return a;
  });
  return { m, holder, model, mixer, actions, meshes, weapons, hide, limit, outline, outlines, mark, color: COLORS[i % COLORS.length], phase: -1 };
}

function dispose(s) {
  scene.remove(s.holder, s.mark);
  s.mixer.stopAllAction();
  s.holder.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const mat of [].concat(o.material)) { mat.map?.dispose(); mat.dispose(); }
  });
}

const valuesOf = (id) => placement[id] ?? (placement[id] = { skip: false, done: false, members: [] });
function memberValues(id, m) {
  const p = valuesOf(id);
  let v = p.members.find((x) => x.name === m.name);
  if (!v) { v = { name: m.name, cid: m.cid, ...m.def }; p.members.push(v); }
  return v;
}

async function openCombo(id) {
  const token = ++loading;
  combo = combos.find((c) => c.id === id);
  for (const s of students) dispose(s);
  students = [];
  selected = -1;
  renderList();
  renderSide();
  $('title').innerHTML = `${comboTitle(combo)}<small>불러오는 중…</small>`;
  const loaded = await Promise.all(combo.members.map((m, i) => loadStudent(m, i)));
  if (token !== loading) { loaded.forEach(dispose); return length; }
  students = loaded;
  for (const s of students) scene.add(s.holder);
  length = Math.max(...students.map((s) => s.actions[0].getClip().duration + s.actions[1].getClip().duration));
  time = 0;
  selected = RECORD ? -1 : 0;
  apply();
  renderSide();
  $('title').innerHTML = `${comboTitle(combo)}<small>${combo.members.map((m) => korean(m.name)).join(' · ')}</small>`;
  setTime(0);
  return length;
}

const comboTitle = (c) => `${c.id}번 조합`;

// 저장 값 → 장면
function apply() {
  if (!combo) return;
  for (const s of students) {
    const v = memberValues(combo.id, s.m);
    s.holder.position.set(v.x, 0, v.z);
    s.holder.rotation.y = THREE.MathUtils.degToRad(v.deg);
    s.holder.scale.x = v.flip ? -1 : 1; // 거울: 모습도 좌우가 바뀜
    s.mark.position.x = v.x;
    s.mark.position.z = v.z;
    s.mark.rotation.y = THREE.MathUtils.degToRad(v.deg);
  }
  showMarks();
}

function showMarks() {
  students.forEach((s, i) => {
    s.mark.visible = $('rings').checked && !RECORD;
    s.mark.userData.mat.opacity = i === selected ? 0.95 : 0.45;
    s.mark.scale.setScalar(i === selected ? 1.15 : 1);
  });
}

// 시간 t: 학생마다 Start를 처음부터, 끝나면 End (End가 먼저 끝난 학생은 마지막 자세로 기다림). 모두 끝나면 처음부터
function setTime(t) {
  time = t;
  for (const s of students) {
    const [a0, a1] = s.actions;
    const d0 = a0.getClip().duration;
    const d1 = a1.getClip().duration;
    const phase = t < d0 ? 0 : 1;
    a0.enabled = phase === 0;
    a1.enabled = phase === 1;
    a0.time = Math.min(t, d0 - 1e-4);
    a1.time = Math.min(Math.max(0, t - d0), d1 - 1e-4);
    s.mixer.update(0);
    s.limit(s.mixer);
    if (phase !== s.phase) {
      s.phase = phase;
      const clip = s.actions[phase].getClip();
      s.weaponOn = new Map(s.weapons.map((w) => [w, clipAnimates(clip, w)]));
    }
    s.hide();
    for (const w of s.weapons) if (!s.weaponOn.get(w)) w.visible = false;
    s.outline();
    if (!$('outlines').checked) for (const o of s.outlines) o.visible = false;
  }
  draw();
  if (!RECORD) {
    $('seek').value = String(Math.round((t / length) * 10000));
    const parts = students.map((s) => (t < s.actions[0].getClip().duration ? 'Start' : 'End'));
    $('time').textContent = `${t.toFixed(2)} / ${length.toFixed(2)}s · ${Math.round(t * 30)}프레임 ${[...new Set(parts)].join('/')}`;
  } else {
    $('title').querySelector('small').textContent = `${combo.members.map((m) => korean(m.name)).join(' · ')}   ${t.toFixed(1)}s`;
  }
}

function draw() { renderer.render(scene, camera); }

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing && students.length) {
    let t = time + dt * Number($('speed').value);
    if (t >= length) t = 0;
    setTime(t);
  }
  requestAnimationFrame(tick);
}

// ---- 왼쪽 목록 ----
function renderList() {
  const list = $('list');
  list.textContent = '';
  for (const c of combos) {
    const p = placement[c.id];
    const b = document.createElement('button');
    b.className = `combo${c === combo ? ' active' : ''}`;
    const tag = p?.skip ? '<span class="tag">안 씀</span>' : p?.done ? '<span class="tag done">✓</span>' : '';
    b.innerHTML = `${tag}${comboTitle(c)}<small>${c.members.map((m) => korean(m.name)).join(' · ')}</small>`;
    b.addEventListener('click', () => openCombo(c.id).catch(showError));
    list.append(b);
  }
}

// ---- 오른쪽 학생 값 ----
function renderSide() {
  const box = $('members');
  box.textContent = '';
  if (!combo) return;
  combo.members.forEach((m, i) => {
    const v = memberValues(combo.id, m);
    const d = document.createElement('div');
    d.className = `member${i === selected ? ' sel' : ''}`;
    const slot = m.special ? `지원 ${m.idx}` : `자리 ${m.idx}`;
    d.innerHTML = `<div class="head"><span class="chip" style="background:${COLORS[i % COLORS.length]}"></span>${korean(m.name)}<span class="slot">${slot}</span></div>
      <div class="vals">
        <label>x (좌우)<input type="number" step="0.01" data-k="x" value="${v.x}"></label>
        <label>z (앞뒤)<input type="number" step="0.01" data-k="z" value="${v.z}"></label>
        <label>방향°<input type="number" step="1" data-k="deg" value="${v.deg}"></label>
      </div>
      <div class="row2"><label><input type="checkbox" data-k="flip" ${v.flip ? 'checked' : ''}> 거울 뒤집기</label>
        <span>처음 ${m.def.x}, ${m.def.z}, ${m.def.deg}°</span></div>`;
    d.addEventListener('mousedown', () => { if (selected !== i) { selected = i; showMarks(); markSelected(); draw(); } });
    for (const input of d.querySelectorAll('input')) {
      input.addEventListener('input', () => {
        const k = input.dataset.k;
        if (k === 'flip') v.flip = input.checked;
        else if (input.value !== '' && Number.isFinite(Number(input.value))) v[k] = Number(input.value);
        changed(false);
      });
    }
    box.append(d);
  });
  const p = valuesOf(combo.id);
  $('done').checked = Boolean(p.done);
  $('skip').checked = Boolean(p.skip);
  $('note').textContent = combo.note;
}
function markSelected() {
  [...$('members').children].forEach((d, i) => d.classList.toggle('sel', i === selected));
}
// 입력 칸 숫자만 다시 (끌기·키로 바꿀 때)
function refreshInputs() {
  if (!combo) return;
  [...$('members').children].forEach((d, i) => {
    const v = memberValues(combo.id, combo.members[i]);
    for (const input of d.querySelectorAll('input')) {
      if (input === document.activeElement) continue;
      if (input.dataset.k === 'flip') input.checked = v.flip;
      else input.value = String(v[input.dataset.k]);
    }
  });
}

function changed(inputs = true) {
  dirty = true;
  $('saved').textContent = '저장 안 한 변경 있음 ●';
  $('saved').className = 'dirty';
  apply();
  if (inputs) refreshInputs();
  if (!playing) setTime(time);
  else draw();
}

const round = (n, k = 1000) => Math.round(n * k) / k;
function move(i, dx, dz) {
  const v = memberValues(combo.id, combo.members[i]);
  v.x = round(v.x + dx);
  v.z = round(v.z + dz);
  changed();
}
function turn(i, d) {
  const v = memberValues(combo.id, combo.members[i]);
  v.deg = round(((((v.deg + d + 180) % 360) + 360) % 360) - 180, 10);
  changed();
}

// ---- 마우스: 고르기·끌기·돌리기 ----
const ray = new THREE.Raycaster();
const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function pointer(e) {
  const r = canvas.getBoundingClientRect();
  return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}
function floorAt(e) {
  ray.setFromCamera(pointer(e), camera);
  return ray.ray.intersectPlane(floor, new THREE.Vector3());
}
const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
function pick(e) {
  ray.setFromCamera(pointer(e), camera);
  let best = null;
  students.forEach((s, i) => {
    for (const mesh of s.meshes) {
      if (!shown(mesh)) continue;
      if (mesh.isSkinnedMesh) mesh.computeBoundingSphere(); // 지금 자세로
      for (const hit of ray.intersectObject(mesh, false)) if (!best || hit.distance < best.distance) best = { distance: hit.distance, i };
    }
  });
  if (best) return best.i;
  // 몸에 안 맞으면 발밑 고리 둘레
  const p = floorAt(e);
  if (!p) return -1;
  let near = -1;
  let nd = 0.25;
  students.forEach((s, i) => {
    const d = Math.hypot(s.holder.position.x - p.x, s.holder.position.z - p.z);
    if (d < nd) { nd = d; near = i; }
  });
  return near;
}

let drag = null;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.focus();
  if (e.button === 2) { drag = { pan: true, x: e.clientX, y: e.clientY, target: view.target.clone() }; canvas.setPointerCapture(e.pointerId); return; }
  if (e.button !== 0) return;
  const i = pick(e);
  if (i < 0) return;
  selected = i;
  showMarks();
  markSelected();
  draw();
  const p = floorAt(e);
  const v = memberValues(combo.id, combo.members[i]);
  if (p) drag = { i, p0: p, x: v.x, z: v.z };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (drag.pan) {
    const k = view.height / canvas.clientHeight;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    view.target.copy(drag.target).addScaledVector(right, -(e.clientX - drag.x) * k).addScaledVector(up, (e.clientY - drag.y) * k);
    layout();
    draw();
    return;
  }
  const p = floorAt(e);
  if (!p) return;
  let dx = p.x - drag.p0.x;
  let dz = p.z - drag.p0.z;
  if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dz)) dz = 0; else dx = 0; }
  const v = memberValues(combo.id, combo.members[drag.i]);
  v.x = round(drag.x + dx, 100);
  v.z = round(drag.z + dz, 100);
  changed();
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey) {
    view.height = THREE.MathUtils.clamp(view.height * (e.deltaY > 0 ? 1.1 : 1 / 1.1), 0.6, 8);
    layout();
    draw();
    return;
  }
  if (selected < 0) return;
  turn(selected, (e.deltaY > 0 ? -1 : 1) * (e.shiftKey ? 1 : 5));
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const step = e.shiftKey ? 0.05 : 0.01;
  const k = e.key;
  if (k === ' ') { e.preventDefault(); togglePlay(); return; }
  if (k === ',') { stepFrame(-1); return; }
  if (k === '.') { stepFrame(1); return; }
  if (k === 'Tab') { e.preventDefault(); if (students.length) { selected = (selected + (e.shiftKey ? students.length - 1 : 1)) % students.length; showMarks(); markSelected(); draw(); } return; }
  if (selected < 0) return;
  if (k === 'ArrowLeft') { e.preventDefault(); move(selected, -step, 0); }
  else if (k === 'ArrowRight') { e.preventDefault(); move(selected, step, 0); }
  else if (k === 'ArrowUp') { e.preventDefault(); move(selected, 0, -step); }
  else if (k === 'ArrowDown') { e.preventDefault(); move(selected, 0, step); }
  else if (k.toLowerCase() === 'q') turn(selected, e.shiftKey ? 5 : 1);
  else if (k.toLowerCase() === 'e') turn(selected, e.shiftKey ? -5 : -1);
});

// ---- 재생 ----
function togglePlay() {
  playing = !playing;
  $('play').textContent = playing ? '멈춤' : '재생';
}
function stepFrame(n) {
  if (playing) togglePlay();
  setTime(THREE.MathUtils.clamp(Math.round(time / FRAME + n) * FRAME, 0, length - 1e-3));
}
$('play').addEventListener('click', togglePlay);
$('prev').addEventListener('click', () => stepFrame(-1));
$('next').addEventListener('click', () => stepFrame(1));
$('seek').addEventListener('input', () => { if (playing) togglePlay(); setTime((Number($('seek').value) / 10000) * length); });

// ---- 오른쪽 버튼 ----
$('mirrorAll').addEventListener('click', () => {
  for (const m of combo.members) {
    const v = memberValues(combo.id, m);
    v.x = round(-v.x);
    v.deg = round(-v.deg, 10);
  }
  changed();
});
$('reset').addEventListener('click', () => {
  const p = valuesOf(combo.id);
  p.members = combo.members.map((m) => ({ name: m.name, cid: m.cid, ...m.def }));
  changed();
});
$('done').addEventListener('change', () => { valuesOf(combo.id).done = $('done').checked; dirty = true; renderList(); changed(false); });
$('skip').addEventListener('change', () => { valuesOf(combo.id).skip = $('skip').checked; dirty = true; renderList(); changed(false); });
for (const id of ['tilt', 'yaw']) $(id).addEventListener('change', () => { view[id] = Number($(id).value); layout(); draw(); });
$('rings').addEventListener('change', () => { showMarks(); draw(); });
$('outlines').addEventListener('change', () => setTime(time));
$('save').addEventListener('click', save);

// 조합 순서대로, 학생은 조합 순서대로 저장 (처음 값 그대로인 조합도)
async function save() {
  const out = {
    _about: '합동 승리 배치 (tools/joint-placer.js). 조합 id = 게임 표 CharacterVictoryInteractionExcel의 InteractionId. '
      + '학생마다 x(좌우, 오른쪽 +)·z(앞뒤, 카메라 쪽 +)는 펫 좌표 단위(캐릭터 키 ≈ 1), deg는 y축 회전(0 = 카메라를 봄, + = 위에서 볼 때 반시계), '
      + 'flip은 모델을 좌우 거울로. done = 사람이 맞춤 끝, skip = 이 조합 안 씀',
  };
  for (const c of combos) {
    const p = valuesOf(c.id);
    out[c.id] = { done: Boolean(p.done), skip: Boolean(p.skip), members: c.members.map((m) => {
      const v = memberValues(c.id, m);
      return { name: m.name, cid: m.cid, x: v.x, z: v.z, deg: v.deg, flip: Boolean(v.flip) };
    }) };
  }
  const file = await bridge.save(out);
  dirty = false;
  $('saved').textContent = `저장함 ${new Date().toLocaleTimeString()} → ${file}`;
  $('saved').className = '';
  return file;
}

function showError(e) {
  console.error(e?.stack ?? String(e));
  $('title').innerHTML = `오류<small>${String(e?.message ?? e)}</small>`;
}

// ---- 시작 ----
async function main() {
  names = await fetch('/src/students.json').then((r) => r.json()).then((j) => ({
    students: Object.assign({}, ...j.schools.map((s) => s.students)), outfits: j.outfits,
  })).catch(() => names);
  combos = await bridge.combos();
  const saved = await bridge.load();
  for (const [id, p] of Object.entries(saved)) if (!id.startsWith('_')) placement[id] = p;
  layout();
  renderList();
  if (!RECORD) {
    await openCombo(combos[0].id);
    requestAnimationFrame(tick);
  }
  window.__placer.ready = true;
}

// 화면 밖 녹화·시험용 (tools/joint-placer.js --record)
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
window.__placer = {
  ready: false,
  get dirty() { return dirty; },
  get time() { return time; },
  get selected() { return selected; },
  get drag() { return drag && { ...drag }; },
  // 학생 i의 뼈가 화면(페이지 CSS px) 어디인지 (시험용)
  screenOf: (i, bone = 'Bip001_Spine1') => {
    const p = students[i].model.getObjectByName(bone).getWorldPosition(new THREE.Vector3()).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  },
  ids: () => combos.map((c) => c.id),
  open: (id) => openCombo(id),
  at: async (t) => { setTime(t); await frame(); return time; },
  values: () => (combo ? combo.members.map((m) => memberValues(combo.id, m)) : []),
  move: (i, dx, dz) => move(i, dx, dz),
  turn: (i, d) => turn(i, d),
  flip: (i) => { const v = memberValues(combo.id, combo.members[i]); v.flip = !v.flip; changed(); },
  pause: () => { if (playing) togglePlay(); },
  view: (o) => { Object.assign(view, o); layout(); draw(); },
  save: () => save(),
};
main().catch(showError);
