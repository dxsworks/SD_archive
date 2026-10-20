import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DesktopFloor } from './floor.js';
import { hiddenPartsUpdater, clipsChangingParts, restUnderHiddenBones } from './hidden-parts.js';
import { addOutlines } from './outline.js';
import { measureClips, hipYaw, thighBones } from './clip-facing.js';
import {
  ANIM, REACTION, ARMED_IDLE, ARMED_FIDGETS, ARMED_REACTIONS, STANCES, STANCE_IDLE, ATTACK_STEPS, BATTLE_ENTRY,
  DRAW_WEAPON, RUN_CALLSIGN, VICTORIES, RELOAD_VARIANT, RELOAD_VARIANTS, OTHER_CLIPS, stanceAll, clipKey, indexClips, exVariants as exVariantsOf,
  formVariants,
} from './clip-names.js';

// ---- 화면 구성 ----
// 창 높이에 들어갈 월드 단위 높이. 검사 도구가 예전 창을 흉내 낼 때만 주소의 ?viewHeight=로 바꾼다 (tools/edge-check.js --window)
const VIEW_HEIGHT = Number(new URLSearchParams(location.search).get('viewHeight')) || 2.5;
const TILT = THREE.MathUtils.degToRad(12);       // 카페처럼 살짝 위에서 내려다보는 각도
// 발 자리(바닥 원점)가 창 맨 아래에서 이만큼 위 (월드 단위). 카메라가 내려다봐서 앞으로 내디딘 발·그림자는 발 자리보다
// 25~40px 아래에 그려지므로 0.2단위를 더 둔다(main.js BELOW). ?footMargin=은 검사 도구가 예전 창을 흉내 낼 때
const FOOT_MARGIN = Number(new URLSearchParams(location.search).get('footMargin')) || 0.23;
const FACE_FRONT = 0;
const FACE_BATTLE = THREE.MathUtils.degToRad(60); // 전투 동작은 옆을 보도록 만들어져 있어서 카메라 쪽으로 돌림
const FACE_SPREAD = THREE.MathUtils.degToRad(30);   // 평소 동작은 정면에서 이만큼 안쪽 아무 방향
const BATTLE_SPREAD = THREE.MathUtils.degToRad(20); // 전투·EX는 FACE_BATTLE에서 이만큼 안쪽 아무 방향
const RUN_SPREAD = THREE.MathUtils.degToRad(15);    // 전투 중 자리 옮기기: 도착해서 볼 방향에서 이만큼 흔들어 뛴다
const HEAD_LIMIT = THREE.MathUtils.degToRad(45); // 얼굴이 카메라에서 이보다 돌아가면 그만큼 몸을 돌려 얼굴이 보이게
const HEAD_FIX_MAX = THREE.MathUtils.degToRad(30); // 동작 하나 때문에 더 돌리는 건 이만큼까지 (재장전·구호 때 몸이 휙 돌지 않게)
const FACE_NAP = THREE.MathUtils.degToRad(58);    // 뒤로 눕는 동작을 옆으로 눕는 것처럼 보이게
const NAP_OFFSET = new THREE.Vector3(0.33, 0.08, 0.1); // 누운 몸이 창 가운데 바닥에 오도록 (원래 호시노 기준)
// 원래 호시노 Vital_Death가 끝났을 때 몸 가운데(모델 기준, clip-facing.js ends). 학생마다 쓰러지는 방향·거리가 달라서
// (수영복 호시노·시로코는 머리가 창 오른쪽 밖으로 나감) 끝 자세 몸 가운데가 원래 호시노와 같은 자리에 오도록 NAP_OFFSET을 옮긴다
const NAP_BODY = new THREE.Vector3(-0.07, 0, -0.334);
const UP = new THREE.Vector3(0, 1, 0);

// ---- 바닥 위 움직임 (단위: 캐릭터 키 ≈ 1) ----
const WALK_SPEED = 0.4;        // 단위/초
const MAX_WALK = 3;            // 한 번에 걷는 최대 거리
const DRAG_LIFT = 0.3;         // 들었을 때 바닥에서 뜨는 높이
const GRAVITY = 9;             // 놓았을 때 떨어지는 가속도
const RUN_SPEED = 1.1;         // 전투 중 뛰어서 자리 옮길 때
// 종료: 위에서 내려온 밧줄에 매달려 끌려 올라간다
const ROPE_DROP = 0.35;        // 밧줄이 손까지 내려오는 시간(초)
const HOIST_START = 0.5;       // 이때부터 끌려 올라감(초)
// 매달린 방향. Vital_Retreat는 카메라 반대쪽을 보도록 만들어져 있고, 손이 얼굴 앞에 있어서
// 정면(π)에서는 밧줄이 얼굴을 가린다 → π에서 60° 비껴 보면 얼굴이 보이고 밧줄은 얼굴 옆으로 지나간다
const HANG_FACE = Math.PI - THREE.MathUtils.degToRad(60);
const HANG_SPREAD = THREE.MathUtils.degToRad(15);
const HOIST_ACCEL = 4;         // 끌어올리는 가속도(단위/초²)
const RETREAT_TIME = 3;        // 화면 위로 다 나가지 않아도 이 시간이 지나면 종료(초). 메인은 5초까지 기다림

// ---- 전투 모드 (총을 꺼내면 한동안 총 관련 동작을 무작위로 한다) ----
const BATTLE_TIME = [30, 60];   // 전투 지속 시간(초)
const BATTLE_COOLDOWN = 90;     // 전투가 끝나고 다음 전투까지 최소 간격(초)
const BATTLE_REST = [1.2, 3.5]; // 동작 사이 전투 대기 시간(초)
const MAGAZINE = 3;             // 이만큼 쏘면 재장전할 확률이 크게 오른다

// ---- 잠깐 무장 (평소에 가끔 총 든 동작들을 몰아서 하다가 맨손으로 돌아온다) ----
const ARMED_TIME = [15, 40];    // 총을 들고 있는 시간(초)

const canvas = document.getElementById('pet');
// Electron 밖(일반 브라우저)에서 열었을 때 화면 확인용 대체 브리지 (?sim 이면 바탕화면 흉내)
const bridge = window.petBridge ?? createBrowserStub();
const cursorOf = bridge.cursor ?? ((e) => ({ x: e.screenX, y: e.screenY }));

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);

function layout() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w, h, false);
  const halfH = VIEW_HEIGHT / 2;
  const halfW = halfH * (w / h);
  Object.assign(camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
  // 원점(발밑)이 화면 맨 아래에서 FOOT_MARGIN 위에 오도록 시점 중심을 잡는다
  const targetY = (halfH - FOOT_MARGIN) / Math.cos(TILT);
  camera.position.set(0, targetY + 10 * Math.sin(TILT), 10 * Math.cos(TILT));
  camera.lookAt(0, targetY, 0);
  camera.updateProjectionMatrix();
}
layout();
window.addEventListener('resize', layout);

// ---- 모델 & 애니메이션 ----
// root: 멀고 가까움에 따른 크기 / pivot: 방향과 자세 보정 / 그 안에 모델
const root = new THREE.Group();
const pivot = new THREE.Group();
root.add(pivot);
scene.add(root);

// 발밑 그림자 — 들어 올려도 바닥에 남아서 떠 있는 느낌을 준다
const shadow = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.3, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -1;
  return mesh;
})();
scene.add(shadow);

// 그림자는 몸을 따라간다: 발·골반·머리를 바닥에 내린 가운데로 옮기고, 누운 몸(엎드려 쏘기, 낮잠)은 발 → 머리 방향으로 늘인다.
// 예전엔 발 자리(원점)에 고정이라 사격 자세에서 엄폐물 밖으로 옆으로 나가거나 엎드리면 그림자가 몸 옆에 남았다
// (Shun 02 엎드림, 시로코 무릎·엄폐, 2026-10-18 사용자). 서 있으면 발·골반·머리가 거의 한 점이라 지금과 같다
const SHADOW_SIZE = 0.6; // 그림자 지름 (모델 단위, 위 PlaneGeometry와 같음)
const SHADOW_PAD = 0.55; // 늘일 때 발 → 머리 길이에 더할 몸 끝 여유
let bodyBones = [];      // [발 왼쪽, 발 오른쪽, 골반, 머리]
let shadowBase = 1;      // 바닥 원근에 따른 크기 (placeWindow)
const shadowAt = { x: 0, z: 0, dx: 0, dz: 1, stretch: 1 };
function updateShadow(dt, { snap = false } = {}) {
  let target = { x: 0, z: 0, dx: 0, dz: 1, stretch: 1 };
  if (bodyBones.length === 4) {
    scene.updateMatrixWorld();
    const [l, r, hip, head] = bodyBones.map((b) => b.getWorldPosition(new THREE.Vector3()));
    const feet = l.add(r).multiplyScalar(0.5);
    const unit = root.scale.x;
    const dx = head.x - feet.x, dz = head.z - feet.z, len = Math.hypot(dx, dz) / unit;
    target = { x: (feet.x + hip.x + head.x) / 3, z: (feet.z + hip.z + head.z) / 3,
      dx: len > 1e-4 ? dx / (len * unit) : shadowAt.dx, dz: len > 1e-4 ? dz / (len * unit) : shadowAt.dz,
      stretch: Math.max(1, (len + SHADOW_PAD) / SHADOW_SIZE) };
  }
  const k = snap ? 1 : Math.min(1, dt * 10);
  for (const key of Object.keys(shadowAt)) shadowAt[key] += (target[key] - shadowAt[key]) * k;
  shadow.position.set(shadowAt.x, 0, shadowAt.z);
  shadow.rotation.z = Math.atan2(-shadowAt.dz, shadowAt.dx); // 평면의 가로(x)를 발 → 머리 방향으로
  shadow.scale.set(shadowBase * shadowAt.stretch, shadowBase, 1);
}

// 종료할 때 매달리는 밧줄 — 손에서 창 위 끝까지, 위로 갈수록 투명해져 하늘에서 내려온 것처럼 보인다
const ROPE_TOP = (VIEW_HEIGHT - FOOT_MARGIN) / Math.cos(TILT); // 창 위 끝의 높이
const rope = (() => {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64); // 캔버스 위 = 밧줄 위쪽
  grad.addColorStop(0, '#000');
  grad.addColorStop(0.45, '#fff');
  grad.addColorStop(1, '#fff');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, 64);
  const geo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 1, true);
  geo.translate(0, 0.5, 0); // 아래 끝이 원점
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: 0x3d3a33, alphaMap: new THREE.CanvasTexture(c), transparent: true, depthWrite: false,
  }));
  mesh.visible = false;
  return mesh;
})();
scene.add(rope);

let mixer = null;
let updateHiddenParts = () => {};
let updateOutlines = () => {};
let hands = []; // 밧줄을 잡는 손 뼈
let clips = {};
let clipTurns = new Map(); // 동작 이름 → 원래 호시노와 같은 방향이 되도록 더 돌릴 각도
let clipHeads = new Map(); // 동작 이름 → 얼굴이 보는 방향 (얼굴이 보이게 돌릴 때 씀)
let clipEnds = new Map();  // 동작 이름 → 동작이 끝난 순간 몸 가운데 (모델 기준)
let clipHips = new Map();  // 동작 이름 → 막 시작했을 때 몸(허벅지 선) 방향 (모델 기준)
let clipFronts = new Map(); // 동작 이름 → 몸 앞쪽 방향 (모델 기준, 0 = 카메라 쪽, 어깨선·허벅지 선으로 잼)
let thighs = [];
let gearClips = new Set(); // 평소 대기와 장비 모습이 다른 동작 (아리스(배틀) 등 뒤 장비가 생기거나 사라짐). 평소 상태에서는 피한다
let form2Off = new Set(); // 02 차림 전투 대기(Normal_Idle02)와 모습이 다른 동작. 02 차림으로 끝난 전투의 승리 포즈를 고를 때 씀
let currentAction = null;
const weaponMeshes = [];

function toUnlit(mat) {
  // 게임 텍스처에 음영이 이미 그려져 있어서 조명 없는 재질이 원작 느낌에 가깝다
  return new THREE.MeshBasicMaterial({
    name: mat.name,
    map: mat.map,
    color: mat.color,
    transparent: mat.transparent,
    alphaTest: mat.alphaTest,
    side: THREE.DoubleSide,
  });
}

// 학생별로 같은 뼈대의 다른 파일에서 동작을 가져와 이름을 바꿔 넣는다 (있던 같은 이름 동작은 바꿈)
// - 아리스(배틀): 카페 동작은 장비를 벗은 모습이라, 장비를 두른 대기·걷기(Carrier 파일의 Idle·Walk)를 평소 대기·걷기로 쓴다
//   → 평소 대기가 장비 모습이 되어, 장비를 벗는 카페 반응 대신 승리 포즈 등으로 반응한다(gearClips)
//   아리스(배틀) 파일은 장비 없는 몸(CH0334_Body)과 장비 두른 몸(CH0334_Arms_Body)을 모프 값으로 골라 보이는데(기본은 장비 없는 몸)
//   Carrier 동작엔 그 값이 없다 → look 동작에서 lookTracks에 맞는 모프 값을 복사해 넣는다.
//   그 밖에 빠진 모프 값(입 모양 등)은 바꿔치기 전 원래 동작에서 채운다
const BORROWED_CLIPS = {
  'Arisu (Battle).glb': {
    from: 'Arisu (Battle) (Carrier).glb',
    clips: { Idle: 'Cafe_Idle', Walk: 'Cafe_Walk' },
    look: 'Formation_Idle',
    lookTracks: /^CH0334_(Arms_)?Body/,
  },
};
const toArrayBuffer = (data) => (data instanceof ArrayBuffer
  ? data
  : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));

async function borrowClips(gltf) {
  const extra = BORROWED_CLIPS[settings.model];
  if (!extra) return;
  let source;
  try {
    source = await new GLTFLoader().parseAsync(toArrayBuffer(await bridge.readModelFile(extra.from)), '');
  } catch (e) {
    console.warn(`${extra.from}을(를) 읽지 못해 원래 동작을 씁니다`, e);
    return;
  }
  const morphable = new Set();
  gltf.scene.traverse((o) => { if (o.morphTargetInfluences?.length) morphable.add(THREE.PropertyBinding.sanitizeNodeName(o.name)); });
  const isMorph = (track) => track.name.endsWith('.morphTargetInfluences');
  const meshOf = (track) => track.name.slice(0, track.name.lastIndexOf('.'));
  const look = gltf.animations.find((c) => c.name === extra.look);
  for (const [from, to] of Object.entries(extra.clips)) {
    const clip = source.animations.find((c) => c.name === from);
    if (!clip) continue;
    const original = gltf.animations.find((c) => c.name === to);
    // 이 모델에서 모프가 없는 메시의 값은 버린다 (Carrier는 무기를 모프로 숨기지만 Battle 무기엔 모프가 없음)
    let tracks = clip.tracks.filter((tr) => !isMorph(tr) || morphable.has(meshOf(tr)))
      .filter((tr) => !(isMorph(tr) && extra.lookTracks.test(tr.name)));
    const add = (source, test) => {
      for (const tr of source?.tracks ?? []) {
        if (!isMorph(tr) || !test(tr) || tracks.some((t) => t.name === tr.name)) continue;
        // 첫 값을 동작 내내 유지
        const n = tr.getValueSize();
        tracks.push(new THREE.NumberKeyframeTrack(tr.name, [0, clip.duration], [...tr.values.slice(0, n), ...tr.values.slice(0, n)]));
      }
    };
    add(look, (tr) => extra.lookTracks.test(tr.name));
    add(original, () => true);
    const copy = new THREE.AnimationClip(to, clip.duration, tracks.map((tr) => tr.clone()));
    gltf.animations = [...gltf.animations.filter((c) => c.name !== to), copy];
  }
}

async function loadModel() {
  const gltf = await new GLTFLoader().parseAsync(toArrayBuffer(await bridge.readModel()), '');
  await borrowClips(gltf);
  restUnderHiddenBones(gltf.scene, gltf.animations); // 숨긴 소품 아래 뼈가 섞일 때 늘어나지 않게

  gltf.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.frustumCulled = false; // 스킨 메시는 바운딩이 정확하지 않아 잘려 보일 수 있음
    if (/weapon|shield/i.test(obj.name)) weaponMeshes.push(obj);
    obj.material = Array.isArray(obj.material) ? obj.material.map(toUnlit) : toUnlit(obj.material);
  });
  updateHiddenParts = hiddenPartsUpdater(gltf.scene);
  updateOutlines = addOutlines(gltf.scene); // 숨김 판정·무기 목록을 만든 뒤에 (외곽선 메시는 거기 들어가지 않게)
  refreshWeapons(); // 동작을 틀기 전에는 무기를 숨김
  pivot.add(gltf.scene);
  hands = ['Bip001_L_Hand', 'Bip001_R_Hand'].map((n) => gltf.scene.getObjectByName(n)).filter(Boolean);

  clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  ({ index: clipIndex, forms } = indexClips(Object.keys(clips)));
  variantForms = formVariants(clipIndex, forms);
  if (variantForms) forms.delete(2); // 차림이 아니라 변형: EX 뒤에도 01 차림 그대로, 변형은 playSequence에서 섞음
  gearClips = clipsChangingParts(gltf.scene, gltf.animations, 'Cafe_Idle');
  const idle2 = forms.has(2) ? clipIndex.get(clipKey(ARMED_IDLE))?.find((c) => c.form === 2)?.name : undefined;
  form2Off = idle2 ? clipsChangingParts(gltf.scene, gltf.animations, idle2) : new Set();
  ({ turns: clipTurns, heads: clipHeads, ends: clipEnds, hips: clipHips, fronts: clipFronts } = measureClips(gltf.scene, gltf.animations, (n) => clipKey(n)));
  thighs = thighBones(gltf.scene).filter(Boolean);
  measureFrontFaces();
  bodyBones = ['Bip001_L_Foot', 'Bip001_R_Foot', 'Bip001_Pelvis', 'Bip001_Head'].map((n) => gltf.scene.getObjectByName(n)).filter(Boolean);
  mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.addEventListener('finished', (e) => {
    const cb = doneCallbacks.get(e.action);
    if (!cb || e.action !== currentAction) return;
    doneCallbacks.delete(e.action);
    cb();
  });
}

let clipIndex = new Map(); // 묶은 이름 → [{ name, form }] (clip-names.js indexClips)
let forms = new Set();     // 이 모델에 있는 차림 번호들
let variantForms = false;  // 01/02가 차림이 아니라 변형인 학생 (clip-names.js formVariants)
let form = 1; // 지금 차림 번호. 전투 중 EX를 쓰면 2, 전투가 끝나면 1
const currentForm = () => form;
function resolve(name) {
  if (!name || clips[name]) return name;
  const list = clipIndex.get(clipKey(name));
  if (!list) return undefined;
  return (list.find((c) => c.form === currentForm()) ?? list.find((c) => c.form === 1) ?? list[0]).name;
}
const has = (name) => Boolean(resolve(name));
const clipTurn = () => clipTurns.get(currentAction?.getClip().name) ?? 0;
// 지금 차림에 맞는 동작인지: 01 차림이면 다 맞고, 02 차림이면 02 번호가 붙은 것만
// (번호 없는 동작은 01 차림 모습이라 02 차림 중에 틀면 벗은 겉옷이 다시 나타난다. 예: 수영복 호시노 Normal_Callsign)
const fitsForm = (name) => currentForm() === 1 || ownForm(name);
// 지금 차림 번호의 것이 있는지 (01 차림에서도 02만 있는 동작은 아님)
const ownForm = (name) => Boolean(clipIndex.get(clipKey(name))?.some((c) => c.form === currentForm()));
// 재장전: 변형(_Random)이 지금 차림에 있으면 원래 것과 반반
const reloadClip = (name) => (ownForm(RELOAD_VARIANT(name)) && Math.random() < 0.5 ? RELOAD_VARIANT(name) : name);
const first = (names) => names.find(has) ?? Object.keys(clips)[0];
const clipName = (name) => (ANIM[name] ? first(ANIM[name]) : name);
// 평소(맨손) 상태에 틀어도 되는 동작인지: 장비 모습이 평소 대기와 달라지는 동작은 무장·전투 때만
const calmOk = (name) => !gearClips.has(resolve(name));
// 평소 상태용: 목록에서 장비가 안 나오는 첫 동작 (전부 나오면 원래대로)
const calmClip = (key) => ANIM[key].filter(has).find(calmOk) ?? clipName(key);

// 무기는 "지금 동작이 그 무기의 뼈대를 움직일 때만" 보인다. 보이는 동안 실제로 들지 말지는 애니메이션이 정한다.
// - 총: 모든 동작에 움직임이 있고, 카페 동작은 크기를 0으로 줄여 숨긴다 → 편성·승리·쓰러짐 등에선 자연스럽게 듦
// - 호시노 방패: EX 스킬에만 움직임이 있어서, 다른 동작에서 보이면 몸 한가운데 기본 위치에 박혀 보인다
const animatesCache = new Map();
function clipAnimates(clip, mesh) {
  const key = `${clip.name}|${mesh.uuid}`;
  if (!animatesCache.has(key)) {
    const bones = new Set(mesh.skeleton?.bones.map((b) => THREE.PropertyBinding.sanitizeNodeName(b.name)) ?? []);
    animatesCache.set(key, clip.tracks.some((t) => bones.has(t.name.slice(0, t.name.lastIndexOf('.')))));
  }
  return animatesCache.get(key);
}

function refreshWeapons() {
  const clip = currentAction?.getClip();
  for (const m of weaponMeshes) m.visible = Boolean(clip) && clipAnimates(clip, m);
}

let lastPicked = '';
function pickRandom(names) {
  const list = names.filter(has);
  const pool = list.length > 2 ? list.filter((n) => n !== lastPicked) : list; // 둘뿐이면 피하면 번갈아 나오기만 해서 무작위가 아님
  lastPicked = pool[Math.floor(Math.random() * pool.length)];
  return lastPicked;
}

const usedActions = new Set();
const doneCallbacks = new Map();

// 동작 가중치의 합이 1보다 작아지면 모델의 기본(바인드) 자세가 섞여 크게 일그러져 보인다.
// 그래서 항상 "이전 동작 → 새 동작" 두 개만 합이 1이 되도록 교차 페이드한다.
// 새 동작을 틀면 이전 동작의 onDone은 버려지므로, 끼어든 동작이 순서를 자연스럽게 취소한다.
function play(name, { once = false, fade = 0.2, onDone = null } = {}) {
  const action = mixer.clipAction(clips[resolve(clipName(name))]);
  doneCallbacks.clear();
  if (once && onDone) doneCallbacks.set(action, onDone);
  if (action === currentAction && !once) return;
  const prev = currentAction;
  if (transitionLog && prev) logTransition(prev, action, once, fade);
  usedActions.add(action);
  for (const a of usedActions) {
    if (a !== prev && a !== action) a.stop();
  }

  action.reset();
  action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  action.clampWhenFinished = once;
  action.setEffectiveWeight(1);
  action.play();

  if (prev && prev !== action) {
    if (fade > 0 && prev.enabled && prev.getEffectiveWeight() > 0.99) {
      action.crossFadeFrom(prev, fade, false);
    } else {
      prev.stop(); // 이전 동작이 아직 페이드 중이면 섞지 않고 바로 전환
    }
  }
  currentAction = action;
  refreshWeapons();
  if (prev !== action) carryTurn(action.getClip().name);
  if (frontFaces.has(action.getClip().name)) facing = frontFaces.get(action.getClip().name);
}

// ---- 집어 들기·승리 포즈는 무조건 정면 (2026-10-19 사용자) ----
// 펫이 정한 방향(정면 ±30° 무작위)과 학생별 보정(clipTurns, 원래 호시노 방향에 맞춤) 대신, 그 동작의 몸 앞쪽(clipFronts: 어깨선·허벅지 선)이
// 카메라를 보게 돌린다. 예전엔 Shun 승리 포즈가 61°, 집어 들기가 48° 옆을 봤다 (Cafe_Idle부터 비껴 서 있어 보정이 엇나감).
// 승리 포즈 Start → End는 짝마다 한 값(둘의 평균)으로: 따로 맞추면 넘어갈 때 몸이 10~20° 돈다
const FRONT_POSE = /^(victory_(start|end)(_random)?|formation_pickup)$/;
let frontFaces = new Map(); // 동작 이름 → 이 동작 동안의 facing
function measureFrontFaces() {
  const groups = new Map();
  for (const [key, list] of clipIndex) {
    const m = FRONT_POSE.exec(key);
    if (!m) continue;
    for (const { name, form: f } of list) {
      if (!clipFronts.has(name)) continue;
      const group = m[2] ? `victory${m[3] ?? ''}|${f}` : name;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(name);
    }
  }
  frontFaces = new Map();
  for (const names of groups.values()) {
    let x = 0, z = 0;
    for (const n of names) {
      const a = clipFronts.get(n) + (clipTurns.get(n) ?? 0);
      x += Math.sin(a); z += Math.cos(a);
    }
    const front = Math.atan2(x, z);
    for (const n of names) frontFaces.set(n, wrapAngle(-front));
  }
}

// ---- 총 든 자세로 넘어갈 때 몸 방향 이어 받기 ----
// 총 자세 동작으로 넘어가는 순간, 펫이 정한 방향과 그 동작 자세가 지금 몸 방향과 달라 몸 전체가 0.2~0.3초 만에 50~110° 휙 돌았다
// (사용자 판단: 맨손으로 정면을 보며 도는 건 괜찮고, 총 자세로 휙 도는 게 이상함. 총 꺼내기 → 무장 대기, 사격 끝, 뛰고 멈춘 뒤 대기 등).
// 그래서 총 자세로 넘어갈 때는 지금 몸 방향 그대로 그 동작을 시작하고, 총 자세가 이어지는 동안 그 방향을 유지한다.
// 맨손 동작으로 넘어가면 0으로 돌아가 펫이 정한 방향(정면 쪽)을 본다.
// 2026-10-12 세 방법을 확인 창(tools/transition-review.js)에서 비교해 사용자가 고름: A 그대로 / B 이어 받고 1초 동안 풀기 / C 유지(이것)
// carry: 펫 방향(facing)에 더 돌리는 각도. ?turn=A 또는 __pet.turnMode = 'A'면 끔 (비교용)
const GUN_POSE = /^(Normal|Stand|Kneel)\d*_|^(Normal\d*_)?Public\d*$/i;
const CARRY_MAX = THREE.MathUtils.degToRad(120);
let turnMode = new URLSearchParams(location.search).get('turn') === 'A' ? 'A' : 'C';
let carry = 0;
function carryTurn(name) {
  if (turnMode === 'A' || !GUN_POSE.test(name) || thighs.length < 2 || !clipHips.has(name)) { carry = 0; return; }
  const body = hipYaw(thighs, root); // 지금 몸 방향 (펫 회전 포함)
  const planned = facing + (clipTurns.get(name) ?? 0) + clipHips.get(name);
  carry = THREE.MathUtils.clamp(wrapAngle(body - planned), -CARRY_MAX, CARRY_MAX);
}

// ---- 넘어가는 곳 기록 (확인 도구 tools/transition-review.js) ----
// simulate 동안 동작이 바뀔 때마다 앞 동작과 끊긴 시각, 그 순간 몸 방향을 적는다.
// 바뀐 뒤 볼 방향은 한 번 더 update가 지난 뒤에 채운다 (뛰기·걷기는 update에서 방향을 정함)
let transitionLog = null;
let updates = 0;
const pendingLogs = [];
function logTransition(prev, action, once, fade) {
  const rec = {
    from: prev.getClip().name, fromTime: prev.time, fromLoop: prev.loop === THREE.LoopRepeat,
    to: action.getClip().name, toLoop: !once,
    fade: prev !== action && fade > 0 && prev.enabled && prev.getEffectiveWeight() > 0.99 ? fade : 0,
    yawBefore: pivot.rotation.y, pivotPos: pivot.position.toArray(), lift, form, at: updates,
  };
  transitionLog.push(rec);
  pendingLogs.push(rec);
}
function fillTransitionLogs() {
  while (pendingLogs.length && pendingLogs[0].at < updates) {
    Object.assign(pendingLogs.shift(), { faceAfter: facing, state, pivotTarget: pivotTarget.toArray() });
  }
}

// ---- 창 / 바닥 ----
let settings = { walk: true };
let winX = 0, winY = 0, winW = 1, winH = 1;
let workArea = { x: 0, y: 0, width: 1, height: 1 };
const floor = new DesktopFloor({ fov: 36, pitch: 36 });
const pos = new THREE.Vector3();   // 바닥 위 위치 (y는 항상 0)
let lift = 0;                      // 바닥에서 뜬 높이

const footPx = () => (FOOT_MARGIN / VIEW_HEIGHT) * winH;

async function refreshBounds() {
  const b = await bridge.getBounds();
  if (!b) return;
  ({ x: winX, y: winY, width: winW, height: winH } = b.win);
  workArea = b.workArea;
}

// 현재 창의 발밑 위치에서 바닥 좌표를 다시 잡는다 (시작, 크기 변경, 모니터 이동 시)
function syncFloorFromWindow() {
  floor.setup(workArea, winH / VIEW_HEIGHT);
  const p = floor.toFloor(winX + winW / 2, winY + winH - footPx());
  pos.copy(p ?? floor.toFloor(workArea.x + workArea.width / 2, workArea.y + workArea.height - 2));
  floor.clamp(pos);
}

// 행동 시간(무장·전투 끝나는 시각 등)을 재는 시계. 확인 도구가 상태 머신을 빨리 돌릴 때(simulate) 앞으로 당긴다
let clockAhead = 0;
const clock = () => performance.now() + clockAhead;
const rand = (a, b) => a + Math.random() * (b - a);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const spread = (range) => (Math.random() * 2 - 1) * range;
// 평소 방향: 이미 정면 쪽(±FACE_SPREAD)을 보고 있으면 그대로 두고(걷다 멈춘 방향 유지, 동작마다 몸을 돌리지 않음), 아니면 그 안에서 아무 방향
const calmFace = () => (Math.abs(wrapAngle(facing - FACE_FRONT)) <= FACE_SPREAD ? facing : FACE_FRONT + spread(FACE_SPREAD));
// 전투 방향: 적이 있는 쪽(side = ±1)을 보며 카메라 쪽으로 반쯤, 매번 조금씩 다르게
const aimFace = (side) => side * (FACE_BATTLE + spread(BATTLE_SPREAD));
// 얼굴이 보이게: 전투 동작은 얼굴이 총구보다 35~50°(재장전·구호는 90~150°) 왼쪽을 봐서, 왼쪽을 겨누거나 재장전할 때 뒤통수만 보인다.
// 이어서 틀 동작들의 평균 얼굴 방향이 HEAD_LIMIT를 넘으면 넘는 만큼만 몸을 돌린다 (한 번에 정해서 동작 사이에 몸이 왔다 갔다 하지 않게).
// max: 돌리는 양의 한도. 전투 자리 방향은 대기·사격 기준으로 한도 없이 정하고(battleFace), 재장전·구호처럼 얼굴이 훨씬 돌아간
// 동작은 거기서 HEAD_FIX_MAX까지만 더 돌린다 (엄폐 재장전은 원래 뒤돌아 하는 동작이라 다 맞추려면 160°를 돌았다 돌아와야 함)
function showFace(face, names, max = Infinity) {
  let x = 0, z = 0;
  for (const name of names.map(resolve).filter(Boolean)) {
    const a = (clipTurns.get(name) ?? 0) + (clipHeads.get(name) ?? 0);
    x += Math.sin(a); z += Math.cos(a);
  }
  if (!x && !z) return face;
  const head = wrapAngle(face + Math.atan2(x, z));
  const over = Math.abs(head) - HEAD_LIMIT;
  return over > 0 ? face - Math.sign(head) * Math.min(over, max) : face;
}

let lastSent = '';
function placeWindow() {
  // 창은 바닥 위 발 위치에 두고, 떠 있는 높이만큼 창 안에서 모델을 올린다 (그림자는 바닥에)
  const ground = floor.toScreen(pos.x, pos.z);
  const lifted = lift > 0 ? floor.toScreen(pos.x, pos.z, lift) : ground;
  const s = ground.scale;
  root.scale.setScalar(s);
  // 끌려 올라갈 때(종료)는 창이 몸을 따라간다. 그 밖에는 창은 바닥에 두고 창 안에서 모델을 올린다
  const anchor = state === 'retreat' || state === 'gone' ? lifted : ground;
  root.position.y = (anchor.y - lifted.y) / floor.pxNear; // 창 안 1단위 = pxNear px
  shadowBase = s; // 늘이기·위치는 updateShadow
  shadow.material.opacity = state === 'retreat' ? 0.3 * Math.max(0, 1 - lift * 3) : 0.3 * Math.max(0.4, 1 - lift * 2);
  winX = ground.x - winW / 2; // 높이 뜬 점은 원근 때문에 옆으로 밀리므로 가로는 바닥 기준 (똑바로 위로)
  winY = anchor.y - winH + footPx();
  const x = Math.round(winX);
  const y = Math.round(winY);
  const key = `${x},${y}`;
  if (key === lastSent) return;
  lastSent = key;
  bridge.move(x, y);
}

// ---- 상태 ----
// idle: 기본 대기 / walk: 걷기 / action: 일회성 동작 재생 중 / ex: EX 스킬 중
// nap: 낮잠 / drag: 들려 있음 / fall: 떨어지는 중
// battle: 전투 대기 / run: 전투 중 뛰어서 이동 / retreat: 종료하며 뛰어가는 중
let state = 'idle';
let stateTime = 0;
let idleDuration = 4;
let napDuration = 30;
const walkTarget = new THREE.Vector3();
let fallVelocity = 0;
let facing = FACE_FRONT;
const pivotTarget = new THREE.Vector3(); // 자세에 따라 모델 위치 보정
let lastInteraction = clock();

function setState(next) {
  state = next;
  stateTime = 0;
  pivotTarget.set(0, 0, 0);
}

function toIdle({ fade = 0.25 } = {}) {
  setState('idle');
  idleDuration = rand(3, 8);
  facing = calmFace();
  play('idle', { fade });
}

// 일회성 동작들을 차례로 재생하고 끝나면 onEnd (기본: 전투 중이면 전투 대기, 아니면 평소 대기)
// 01/02가 변형인 학생(variantForms): 한 번 이어 트는 동작들은 같은 번호 하나로 골라 실제 이름으로 바꾼다
// (Victory_Start02 → Victory_End02. 01·02가 섞인 짝은 안 나옴). 평소 대기와 장비 모습이 다른 변형은 원래 것과 같을 때만
function pickVariants(list) {
  if (!variantForms) return list;
  const options = (name) => (clipIndex.get(clipKey(name)) ?? []).filter((c) => gearClips.has(c.name) === gearClips.has(resolve(name)));
  const multi = list.map(options).filter((o) => new Set(o.map((c) => c.form)).size > 1);
  if (!multi.length) return list;
  const common = [...new Set(multi[0].map((c) => c.form))].filter((f) => multi.every((o) => o.some((c) => c.form === f)));
  if (!common.length) return list;
  const n = common[Math.floor(Math.random() * common.length)];
  return list.map((name) => options(name).find((c) => c.form === n)?.name ?? name);
}

function playSequence(names, { face = calmFace(), fade = 0.25, stepFade = 0.2, as = 'action', onEnd = rest } = {}) {
  const list = pickVariants(names.map(clipName).filter(has));
  if (!list.length) { onEnd(); return; }
  setState(as);
  facing = showFace(face, list, HEAD_FIX_MAX);
  let i = 0;
  const next = () => {
    if (i >= list.length) { onEnd(); return; }
    play(list[i++], { once: true, fade: i === 1 ? fade : stepFade, onDone: next });
  };
  next();
}

const pickWeighted = (options) => {
  let r = Math.random() * options.reduce((sum, [, w]) => sum + w, 0);
  for (const [fn, w] of options) if ((r -= w) < 0) return fn;
  return options.find(([, w]) => w > 0)?.[0] ?? toIdle;
};

function startWalk() {
  const target = floor.randomPoint();
  if (!target) { toIdle(); return; }
  // 너무 먼 곳이면 그 방향으로 MAX_WALK만큼만
  const d = target.distanceTo(pos);
  if (d > MAX_WALK) target.sub(pos).multiplyScalar(MAX_WALK / d).add(pos);
  if (target.distanceTo(pos) < 0.5) { toIdle(); return; }
  walkTarget.copy(target);
  setState('walk');
  play('walk');
}

// 랜덤 행동 = 잠깐 무장 (이미 무장 중이면 총 든 동작 하나)
const fidget = () => (armed ? armedFidget() : startArmed());
const wakeUp = () => playSequence(calmOk(clipName('wake')) ? ['wake'] : victoryPose(), { fade: 0.8, onEnd: toIdle });

function startNap() {
  if (!has(clipName('nap'))) { fidget(); return; }
  setState('nap');
  napDuration = rand(20, 45);
  facing = FACE_NAP;
  play('nap', { once: true, fade: 0.3 });
  const name = currentAction.getClip().name;
  const end = clipEnds.get(name);
  pivotTarget.copy(NAP_OFFSET).add(NAP_BODY.clone().applyAxisAngle(UP, FACE_NAP));
  if (end) pivotTarget.sub(end.clone().applyAxisAngle(UP, FACE_NAP + (clipTurns.get(name) ?? 0)));
  else pivotTarget.copy(NAP_OFFSET);
}

// ---- 잠깐 무장 ----
let armed = null;                  // { until }
const arm = () => { armed = { until: clock() + rand(...ARMED_TIME) * 1000 }; };

function startArmed() {
  if (!has(ARMED_IDLE)) { toIdle(); return; }
  arm();
  playSequence(DRAW_WEAPON.filter(has).slice(0, 1)); // 없으면 바로 무장 대기
}

function armedIdle() {
  setState('armed');
  idleDuration = rand(3, 8);
  facing = calmFace();
  play(ARMED_IDLE);
}

const armedFidget = () => { const name = pickRandom(ARMED_FIDGETS); playSequence([name.endsWith('_Reload') ? reloadClip(name) : name]); };

function chooseArmedBehavior() {
  if (clock() > armed.until) { armed = null; toIdle(); return; }
  pickWeighted([
    [armedFidget, 60],
    [startBattle, battleReady() ? 10 : 0],
    [armedIdle, 30],
  ])();
}

// ---- 전투 모드 ----
// BATTLE_TIME 동안 전투 대기 ↔ 무작위 총 동작을 반복하고, 승리 포즈로 끝낸다
let battle = null;                 // { until, stance, ammo, side, aim, engaged, next }
let battleRest = 2;
let lastBattleEnd = -Infinity;
let runJumpAt = null;              // 뛰다가 남은 거리가 이만큼일 때 구르기
const stanceReady = (st) => has(STANCE_IDLE[st]) && ATTACK_STEPS.every((step) => has(`${st}_${step}`));
// 지금 자세 말고 쓸 수 있는 자세 중 아무거나 (없으면 undefined)
const otherStance = (st) => {
  const list = STANCES.filter((s) => s !== st && stanceReady(s));
  return list[Math.floor(Math.random() * list.length)];
};
// 구호는 자세마다 있을 수도 없을 수도 있다 (Kneel_Callsign은 무릎 자세 학생 중 일부만)
const hasCallsign = (st) => has(`${st}_Callsign`) && fitsForm(`${st}_Callsign`);
const battleReady = () => (clock() - lastBattleEnd) / 1000 > BATTLE_COOLDOWN;
// 한 자리에서는 같은 방향으로 싸우고, 뛰어서 자리를 옮기면 새로 정한다
// 전투 자리 방향: 겨누는 쪽(aim)에서 그 자세의 대기·사격 동작 얼굴이 보이도록 돌린 방향
const stanceClips = (st) => [STANCE_IDLE[st], ...ATTACK_STEPS.map((step) => `${st}_${step}`)];
const battleFace = () => (battle ? showFace(battle.aim, stanceClips(battle.stance)) : aimFace(Math.random() < 0.5 ? 1 : -1));

function rest() {
  if (battle) battleIdle();
  else if (armed) armedIdle();
  else toIdle();
}

// 시작 동작: 맨손이면 총 꺼내기(정면 쪽에서 손짓), 이미 총을 들고 있었거나 총 꺼내기가 없으면 구호.
// 더블클릭 EX로 시작하는 전투는 여기를 거치지 않고 EX로 바로 시작한다
function startBattle({ thenAttack = false } = {}) {
  const wasArmed = Boolean(armed);
  if (!beginBattle()) { fidget(); return; }
  const onEnd = thenAttack ? burst : rest;
  const draw = wasArmed ? undefined : DRAW_WEAPON.find(has);
  if (draw) playSequence([draw], { onEnd });
  else playSequence([pickRandom(BATTLE_ENTRY)], { face: battleFace(), onEnd });
}

// 전투 상태만 만든다 (전투 자세가 없는 학생이면 false)
function beginBattle() {
  const stances = STANCES.filter(stanceReady);
  if (!stances.length) return false;
  armed = null;
  form = 1;
  battle = {
    until: clock() + rand(...BATTLE_TIME) * 1000,
    stance: stances[Math.floor(Math.random() * stances.length)],
    ammo: MAGAZINE,
    side: Math.random() < 0.5 ? 1 : -1,
    engaged: false, // 나간 자세(Attack_Ing·Attack_Delay)인지 (aimsAtRest 설명)
  };
  battle.aim = aimFace(battle.side);
  return true;
}

// keepForm: 종료(밧줄)처럼 전투 차림 그대로 이어서 할 동작이 있을 때
function endBattle({ victory = false, keepForm = false } = {}) {
  if (!battle) return;
  // 무릎·엄폐 자세면 일어나고 나서 승리 포즈. 일어나는 동작(Attack_End)은 지금 차림 것으로 이름을 정해 둔다:
  // 01로 먼저 돌리면 02 사격 대기 → 01 사격 끝으로 섞여 자세가 튐 (Shun 무릎 02 엎드림 → 01 앉음, 발이 창 아래 끝에 닿음).
  // 2026-10-18 사용자: 사격 끝은 지금 차림 그대로, 01로는 승리 포즈에서 돌아감 (수영복 호시노 겉옷도 승리 포즈에서 다시 생김)
  const rise = leaveSteps().map(resolve);
  battle = null;
  // 02 차림으로 끝났고 그 모습 그대로인 승리 포즈 짝이 있으면 그것으로 (수영복 호시노: 겉옷 벗은 Victory_*_Random).
  // 이름을 정해 두고 차림을 01로 돌린다 → 겉옷은 승리 포즈가 끝나고 대기로 돌아갈 때 다시 생김
  const pairs = victory ? formVictoryPoses() : [];
  const steps = pairs.length ? [...rise, ...pickPair(pairs).map(resolve)] : null;
  if (!keepForm) form = 1;
  lastBattleEnd = clock();
  if (victory) playSequence(steps ?? [...rise, ...victoryPose()], { onEnd: toIdle });
}

// 전투 자세 동작은 두 자세(자리)로 나뉜다: Attack_Ing·Attack_Delay는 "나간" 자세, Idle·Reload·Callsign·Move_End·EX는 "원래" 자세.
// Attack_Start가 나가는 동작, Attack_End가 돌아오는 동작이다. 학생·자세마다 그 차이가 다르다:
//   엄폐·무릎은 엄폐물 밖으로 0.3쯤 옆으로 나가고(시로코·호시노), 수영복 호시노 02 서서 쏘기는 몸을 낮추고(골반 0.33 → 0.15),
//   호시노 서서 쏘기는 거의 같다. 그래서 모든 자세에서 순서를 지킨다: 원래 자세 동작 앞엔 End, 나간 자세 동작 앞엔 Start
//   (안 지키면 순간이동하듯 튐. 사격마다 Start → Ing → End → Delay로 하면 일어섰다 → 튀며 앉음).
// 전투 대기는 엄폐·무릎이면 나간 자세의 Attack_Delay(Idle은 몸이 돌아가 있어 안 씀), 서서 쏘기면 원래 자세의 Normal_Idle
const aimsAtRest = (st) => STANCE_IDLE[st] === `${st}_Attack_Delay`;
const leaveSteps = () => (battle?.engaged ? [`${battle.stance}_Attack_End`] : []);
// 원래 자세에서 할 동작 앞에 (나가 있으면) 돌아오는 동작을 붙인다
const fromCover = (steps) => {
  const back = leaveSteps();
  if (battle) battle.engaged = false;
  return [...back, ...steps];
};

function battleIdle() {
  if (clock() > battle.until) { endBattle({ victory: true }); return; }
  // 대기 동작과 지금 자세가 다르면 먼저 나가거나(Start) 돌아온다(End)
  if (aimsAtRest(battle.stance) !== battle.engaged) {
    const step = battle.engaged ? 'Attack_End' : 'Attack_Start';
    battle.engaged = !battle.engaged;
    playSequence([`${battle.stance}_${step}`], { face: battleFace(), onEnd: battleIdle });
    return;
  }
  setState('battle');
  battleRest = rand(...BATTLE_REST);
  facing = battleFace();
  play(STANCE_IDLE[battle.stance], { fade: 0.2 });
}

// 다음 총 동작을 무작위로 고른다 (탄약이 떨어졌으면 재장전할 확률이 크게 오름)
function battleAction() {
  const empty = battle.ammo <= 0;
  pickWeighted([
    [burst, empty ? 5 : 40],
    [reload, empty ? 60 : battle.ammo < MAGAZINE ? 25 : 8],
    [switchStance, settings.walk && otherStance(battle.stance) ? 12 : 0],
    [startRun, settings.walk ? 15 : 0],
    [callsign, hasCallsign(battle.stance) ? 10 : 0],
    [exSkill, has(clipName('ex')) ? 6 : 0], // 가끔 EX 스킬 (끝나면 전투 대기로)
  ])();
}

// 사격: 시작 → 사격 1~3번 → 끝 → 조준 대기
function burst() {
  if (!battle) { startBattle({ thenAttack: true }); return; }
  battle.ammo = Math.max(0, battle.ammo - 1);
  const shots = 1 + Math.floor(Math.random() * 3);
  const [start, ing, , delay] = ATTACK_STEPS.map((step) => `${battle.stance}_${step}`);
  const steps = [...(battle.engaged ? [] : [start]), ...Array(shots).fill(ing), delay];
  battle.engaged = true;
  // 이어지도록 만들어진 동작들이라 단계 사이는 짧게 섞는다
  playSequence(steps, { face: battleFace(), stepFade: 0.08 });
}

function reload() {
  battle.ammo = MAGAZINE;
  playSequence(fromCover([reloadClip(`${battle.stance}_Reload`)]), { face: battleFace() });
}

const callsign = () => (hasCallsign(battle.stance) ? playSequence(fromCover([`${battle.stance}_Callsign`]), { face: battleFace() }) : rest());
// 전투 중 클릭 대답: 구호 / 재장전 무작위 (구호가 없는 자세·차림이면 재장전)
const battleReply = () => pickWeighted([[callsign, hasCallsign(battle.stance) ? 1 : 0], [reload, 1]])();

// 자세 바꾸기: 근처로 뛰어가 도착하며 다른 자세를 잡는다.
// Move_End_*는 뛰다가 멈추는 동작이라 제자리에서 틀면 제자리에서 몇 걸음 뛰는 것처럼 보인다.
const switchStance = () => startRun({ switchStance: true });

// 근처로 뛰어서 자리 옮기기 (가끔 뛰면서 구호, 가끔 중간에 구르기)
function startRun({ switchStance = false } = {}) {
  if (!has('Move_Ing')) { callsign(); return; }
  // 도착해서 잡을 자세·방향을 먼저 정하고 그 방향으로 뛴다. Move_End는 뛰던 방향 그대로 멈추며 자세를 잡는 동작이라,
  // 아무 방향으로 뛰다가 도착해서 겨누는 방향으로 돌리면 멈추는 순간 몸이 90~150° 휙 돈다
  const stance = (switchStance || Math.random() < 0.4 ? otherStance(battle.stance) : null) ?? battle.stance;
  const first = Math.random() < 0.3 ? -battle.side : battle.side; // 가끔 반대쪽을 겨누러 간다
  let target = null, dist = 0, next = null;
  for (const side of [first, -first]) { // 그쪽이 바닥 끝에 막혀 있으면 반대쪽으로
    const aim = aimFace(side);
    const dir = showFace(aim, stanceClips(stance)) + spread(RUN_SPREAD);
    target = pos.clone().add(new THREE.Vector3(Math.sin(dir), 0, Math.cos(dir)).multiplyScalar(rand(1, 2.5)));
    floor.clamp(target);
    dist = target.distanceTo(pos);
    next = { stance, side, aim };
    if (dist >= 0.6) break;
  }
  // 앞쪽(카메라 쪽)이 막혀 있으면(창이 화면 아래 끝) 아무 방향으로. 이때는 뛰던 방향으로 멈춘 뒤 자세를 잡으며 돌아본다
  for (let i = 0; i < 6 && dist < 0.6; i++) {
    const dir = Math.random() * Math.PI * 2;
    target = pos.clone().add(new THREE.Vector3(Math.sin(dir), 0, Math.cos(dir)).multiplyScalar(rand(1, 2.5)));
    floor.clamp(target);
    dist = target.distanceTo(pos);
  }
  if (dist < 0.6) { callsign(); return; }
  walkTarget.copy(target);
  battle.next = next;
  const shout = has(RUN_CALLSIGN) && fitsForm(RUN_CALLSIGN) && Math.random() < 0.3;
  runJumpAt = !shout && has('Move_Jump') && dist > 1.6 && Math.random() < 0.3 ? dist * 0.6 : null;
  const rise = leaveSteps();
  battle.engaged = false;
  if (rise.length) { playSequence(rise, { face: battleFace(), onEnd: () => run(shout) }); return; } // 일어나고 나서 뛴다
  run(shout);
}

function run(shout) {
  setState('run');
  if (shout) play(RUN_CALLSIGN, { once: true, fade: 0.15, onDone: () => { if (state === 'run') play('Move_Ing', { fade: 0.15 }); } });
  else play('Move_Ing', { fade: 0.15 });
}

function arriveRun() {
  // 도착하면 뛰기 전에 정해 둔 자세를 잡는다 (뛰던 방향 그대로 멈춘다)
  const next = battle.next;
  battle.next = null;
  if (next) Object.assign(battle, { stance: next.stance, side: next.side, aim: next.aim });
  battle.engaged = false; // Move_End는 원래 자리에서 끝난다 → 다음 대기 때 Start로 나간다
  playSequence([`Move_End_${battle.stance}`], { face: facing, fade: 0.15 });
}

const exVariants = () => exVariantsOf(Object.keys(clips), forms);
function exSkill() {
  // 나가 있으면 지금 차림 그대로 돌아온 뒤 EX (02로 먼저 바꾸면 01 사격 대기 → 02 사격 끝으로 섞여 자세가 크게 튐: Shun 무릎 01 → 02 엎드림)
  const back = fromCover([]).map(resolve);
  if (battle && forms.has(2)) form = 2;
  const variants = exVariants();
  playSequence([...back, variants.length > 1 ? pickRandom(variants) : 'ex'], { face: battleFace(), as: 'ex' });
}

// 종료: 밧줄 잡는 자세(Vital_Retreat = 밧줄에 매달린 동작)로 손을 들면 위에서 밧줄이 손으로 내려오고,
// 점점 빨라지며 끌려 올라가 화면 위로 사라진 뒤 앱을 끈다
let hoistFrom = 0;
function retreat({ face = null } = {}) { // face: 시험용으로 매달린 방향 지정
  if (state === 'retreat') return;
  endBattle({ keepForm: true }); // 02 차림으로 싸우다 종료하면 02 차림으로 매달린다
  armed = null;
  if (drag) bridge.fx('cancel');
  drag = null;
  hoistFrom = lift; // 들고 있던 중이면 그 높이에서 바로 올라간다
  setState('retreat');
  // 돌아서는 모습(대기 자세의 뒷모습)이 보이지 않게 방향과 자세를 한 번에 바꾼다
  if (has('Vital_Retreat')) {
    facing = face ?? HANG_FACE + spread(HANG_SPREAD);
    play('Vital_Retreat', { fade: 0 });
    pivot.rotation.y = facing + clipTurn();
  } else {
    facing = face ?? FACE_FRONT;
    play('pickup', { fade: 0.15 });
  }
}

function updateHoist() {
  const t = stateTime;
  const h = Math.max(0, t - HOIST_START);
  lift = hoistFrom + 0.5 * HOIST_ACCEL * h * h;
  canvas.style.opacity = String(Math.max(0, Math.min(1, 2.6 - t)));
  const windowBottom = floor.toScreen(pos.x, pos.z, lift).y + footPx();
  if (windowBottom < workArea.y || t > RETREAT_TIME) { setState('gone'); bridge.quit(); }
}

// 밧줄: 두 손 사이에서 창 위 끝까지. 처음 ROPE_DROP초 동안 위에서 내려온다
const ropeBottom = new THREE.Vector3();
const handPos = new THREE.Vector3();
function updateRope() {
  rope.visible = state === 'retreat';
  if (!rope.visible) return;
  if (hands.length) {
    ropeBottom.set(0, 0, 0);
    for (const b of hands) ropeBottom.add(b.getWorldPosition(handPos));
    ropeBottom.divideScalar(hands.length);
  } else {
    pivot.getWorldPosition(ropeBottom).y += 0.75 * root.scale.y; // 손 뼈를 못 찾으면 가슴 높이
  }
  const k = Math.min(1, stateTime / ROPE_DROP);
  ropeBottom.y = THREE.MathUtils.lerp(ROPE_TOP, ropeBottom.y, 1 - (1 - k) ** 2);
  rope.position.copy(ropeBottom);
  rope.scale.set(root.scale.x, Math.max(0.001, ROPE_TOP - ropeBottom.y), root.scale.x);
}

function react() {
  if (state === 'drag' || state === 'fall' || !mixer) return;
  lastInteraction = clock();
  if (state === 'nap') { wakeUp(); return; }
  if (battle) { battleReply(); return; } // 전투 중에는 구호나 재장전으로 대답하고 계속 싸운다
  if (armed) { playSequence([pickRandom(ARMED_REACTIONS)]); return; }
  const options = [...(has(REACTION) && calmOk(REACTION) ? [[REACTION]] : []), ...victoryPoses()];
  if (!options.length) options.push([REACTION]);
  const first = pickRandom(options.map(([name]) => name)); // 바로 전과 같은 반응은 되도록 피함
  playSequence(options.find(([name]) => name === first) ?? [REACTION]);
}

// 승리 포즈: 전투가 끝날 때 말고도 평소에 가끔.
// 이 학생에게 있고 평소 모습과 같은 짝 중에서 고른다 (수영복 호시노 _Random은 겉옷 벗은 02 차림 모습이라 빠짐 → 02 차림으로 끝난 전투에서만, endBattle)
const victoryPoses = () => VICTORIES.filter((pair) => pair.every(has) && pair.every(calmOk));
const pickPair = (pairs) => pairs[Math.floor(Math.random() * pairs.length)];
const victoryPose = () => { const pairs = victoryPoses(); return pairs.length ? pickPair(pairs) : VICTORIES[0]; };
// 02 차림 중에 틀어도 모습이 그대로인 짝 (01 차림이면 없음)
const formVictoryPoses = () => (form === 2 && form2Off.size
  ? VICTORIES.filter((pair) => pair.every(has) && pair.every((n) => !form2Off.has(resolve(n)))) : []);
const cheer = () => playSequence(victoryPose());

// 대기 시간이 끝나면 다음 행동을 가중치로 고른다
function chooseNextBehavior() {
  const idleMinutes = (clock() - lastInteraction) / 60000;
  pickWeighted([
    [startWalk, settings.walk ? 40 : 0],
    [startArmed, 20],
    [startBattle, battleReady() ? 8 : 0],
    [cheer, victoryPoses().length ? 8 : 0],
    [startNap, idleMinutes > 2 ? 25 : 3], // 오래 안 건드리면 졸기 쉬움
    [toIdle, 12],
  ])();
}

// 메뉴 명령. 전투·무장과 관계없는 동작을 고르면 전투·무장을 끝낸다.
const unarmed = (fn) => () => { endBattle(); armed = null; fn(); };
const COMMANDS = {
  react,
  battle: () => (battle ? battleReply() : startBattle()),
  attack: burst,
  ex: exSkill,
  nap: unarmed(startNap),
  fidget: () => { if (battle) { endBattle(); arm(); } fidget(); }, // 전투 중이면 총을 든 채로 무장 상태가 된다
  walk: unarmed(startWalk),
  retreat,
};

function update(dt) {
  stateTime += dt;
  updates++;
  switch (state) {
    case 'replay':
      updateReplay();
      break;
    case 'idle':
      if (lift > 0) { fallVelocity = 0; setState('fall'); }
      else if (stateTime > idleDuration) chooseNextBehavior();
      break;
    case 'armed':
      if (stateTime > idleDuration) chooseArmedBehavior();
      break;
    case 'nap':
      if (stateTime > napDuration) wakeUp();
      break;
    case 'battle':
      if (clock() > battle.until) endBattle({ victory: true }); // 시간이 다 되면 대기 중 바로 마무리
      else if (stateTime > battleRest) battleAction();
      break;
    case 'run': {
      const dx = walkTarget.x - pos.x;
      const dz = walkTarget.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const step = RUN_SPEED * dt;
      if (dist <= step) {
        pos.copy(walkTarget);
        arriveRun();
        break;
      }
      pos.x += (dx / dist) * step;
      pos.z += (dz / dist) * step;
      facing = Math.atan2(dx, dz);
      if (runJumpAt !== null && dist < runJumpAt) {
        runJumpAt = null;
        play('Move_Jump', { once: true, fade: 0.1, onDone: () => { if (state === 'run') play('Move_Ing', { fade: 0.1 }); } });
      }
      break;
    }
    case 'walk': {
      const dx = walkTarget.x - pos.x;
      const dz = walkTarget.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const step = WALK_SPEED * dt;
      if (dist <= step) {
        pos.copy(walkTarget);
        toIdle();
      } else {
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
        facing = Math.atan2(dx, dz); // 0 = 카메라(화면 아래) 쪽, ±π = 뒷모습
      }
      break;
    }
    case 'drag':
      updateDrag(dt);
      break;
    case 'retreat':
      updateHoist();
      break;
    case 'fall':
      fallVelocity += GRAVITY * dt;
      lift -= fallVelocity * dt;
      if (lift <= 0) {
        lift = 0;
        if (armed) armedIdle();
        else toIdle({ fade: 0.15 });
      }
      break;
  }
  placeWindow();
  fillTransitionLogs();
  // 방향 전환과 자세 보정을 부드럽게
  pivot.rotation.y += wrapAngle(facing + clipTurn() + carry - pivot.rotation.y) * Math.min(1, dt * 8); // clipTurn: 학생별 동작 방향 차이 보정
  pivot.position.lerp(pivotTarget, Math.min(1, dt * 3));
}

// ---- 마우스: 캐릭터 위에서만 클릭을 받고 나머지는 통과 ----
let mouse = null;      // 창(캔버스) 기준 좌표
let hovering = false;
let ignoringMouse = true;
let drag = null;
const pixelBuf = new Uint8Array(5 * 5 * 4);

window.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
});
document.addEventListener('mouseleave', () => { mouse = null; });
window.addEventListener('blur', () => { if (!drag) mouse = null; });
window.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  if (!hovering || state === 'retreat' || state === 'gone') return;
  if (e.button === 2) { bridge.showMenu(); return; }
  if (e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  drag = { start: cursorOf(e), cursor: cursorOf(e), moved: false, offset: null, switching: false };
  bridge.fx('down'); // 클릭 효과 (위치는 메인이 실제 커서로 정함)
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.cursor = cursorOf(e);
  bridge.fx('move'); // 끄는 동안 트레일
  if (!drag.moved && Math.hypot(drag.cursor.x - drag.start.x, drag.cursor.y - drag.start.y) > 4) {
    drag.moved = true;
    lastInteraction = clock();
    // 잡은 지점과 발 사이의 거리를 캐릭터 크기 기준으로 기억 → 멀어져 작아져도 같은 곳을 잡고 있음
    const s = floor.toScreen(pos.x, pos.z, lift);
    const unit = floor.pxNear * s.scale;
    drag.offset = { x: (drag.start.x - s.x) / unit, y: (drag.start.y - s.y) / unit };
    pickUp();
  }
});

function pickUp() {
  if (battle) { endBattle(); arm(); } // 집어 들면 전투는 끝 (총은 든 채로 무장 상태)
  setState('drag');
  facing = FACE_FRONT;
  play(armed ? 'pickup' : calmClip('pickup'), { fade: 0.15 }); // 들고 있는 동안 반복
}

function drop() {
  drag = null;
  fallVelocity = 0;
  setState('fall');
}

function updateDrag(dt) {
  lift += (DRAG_LIFT - lift) * Math.min(1, dt * 12);
  const { cursor, offset } = drag ?? {};
  if (!offset) return;
  const a = workArea;
  const outside = cursor.x < a.x || cursor.x >= a.x + a.width || cursor.y < a.y || cursor.y >= a.y + a.height;
  if (outside && !drag.switching) switchMonitor(cursor);
  // 커서 아래에 "잡은 지점"이 오도록, 발이 있어야 할 화면 위치 → 높이 lift 평면 위의 점
  const unit = floor.pxNear * floor.toScreen(pos.x, pos.z, lift).scale;
  const p = floor.toFloor(cursor.x - offset.x * unit, cursor.y - offset.y * unit, lift);
  if (p) floor.clamp(pos.set(p.x, 0, p.z));
}

// 커서가 다른 모니터로 넘어가면 그 모니터의 바닥으로 갈아탄다
async function switchMonitor(cursor) {
  drag.switching = true;
  const wa = await bridge.getWorkArea(cursor.x, cursor.y);
  if (drag) drag.switching = false;
  if (!wa || (wa.x === workArea.x && wa.y === workArea.y && wa.width === workArea.width && wa.height === workArea.height)) return;
  workArea = wa;
  floor.setup(workArea, winH / VIEW_HEIGHT);
  const p = floor.toFloor(cursor.x, cursor.y);
  if (p) floor.clamp(pos.set(p.x, 0, p.z));
}

let lastClickAt = 0;
function handleClick() {
  const now = clock();
  const isDouble = now - lastClickAt < 350;
  lastClickAt = isDouble ? 0 : now;
  if (state === 'ex') return; // EX 스킬은 끝까지 보여준다
  if (isDouble && state !== 'nap' && has(clipName('ex'))) {
    lastInteraction = now;
    doubleClickEx();
  } else {
    react();
  }
}

// 더블클릭: 첫 클릭의 반응을 끊고 EX 스킬. 전투 모드로 이어진다 (구호 없이 바로 EX)
function doubleClickEx() {
  if (!battle) beginBattle();
  exSkill();
}

function endDrag(e) {
  if (!drag) return;
  bridge.fx(e?.type === 'pointercancel' ? 'cancel' : 'up');
  if (drag.moved) drop();
  else {
    drag = null;
    handleClick();
  }
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

function hitTest() {
  if (!mouse) return false;
  const gl = renderer.getContext();
  const dpr = renderer.getPixelRatio();
  const px = Math.floor(mouse.x * dpr) - 2;
  const py = Math.floor((canvas.clientHeight - mouse.y) * dpr) - 2;
  gl.readPixels(px, py, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuf);
  for (let i = 3; i < pixelBuf.length; i += 4) {
    if (pixelBuf[i] > 16) return true;
  }
  return false;
}

function updateMousePassthrough() {
  hovering = drag ? true : hitTest(); // 렌더 직후에 읽어야 픽셀이 남아 있다
  if (ignoringMouse === hovering) {
    ignoringMouse = !hovering;
    bridge.setIgnoreMouse(ignoringMouse);
  }
  canvas.style.cursor = drag?.moved ? 'grabbing' : hovering ? 'grab' : 'default';
}

// ---- 메인 루프 (가만히 있을 땐 30fps, 움직일 땐 60fps) ----
let lastFrame = performance.now();
let speed = 1; // 느린 재생 (__pet.timeScale)
function frame(now) {
  requestAnimationFrame(frame);
  const targetFps = state === 'idle' || state === 'nap' ? 30 : 60;
  if (now - lastFrame < 1000 / targetFps - 2) return;
  const dt = Math.min((now - lastFrame) / 1000, 0.1) * speed;
  lastFrame = now;

  if (renderer.getPixelRatio() !== window.devicePixelRatio) layout(); // 배율이 다른 모니터로 옮겨졌을 때
  update(dt);
  mixer.update(dt);
  updateHiddenParts();
  updateOutlines();
  updateRope(); // 손 위치는 이번 프레임 자세로
  updateShadow(dt);
  renderer.render(scene, camera);
  updateMousePassthrough();
}

async function main() {
  settings = { ...settings, ...(await bridge.getSettings()) };
  await refreshBounds();
  syncFloorFromWindow();
  await loadModel();
  toIdle();

  bridge.onCommand((cmd) => {
    if (cmd === 'retreat') retreat(); // 종료는 들고 있거나 떨어지는 중에도 바로
    else if (!['drag', 'fall', 'retreat', 'gone'].includes(state)) COMMANDS[cmd]?.();
  });
  bridge.onSettings((s) => { settings = { ...settings, ...s }; if (!settings.walk && state === 'walk') toIdle(); });
  bridge.onBoundsChanged(async () => {
    await refreshBounds();
    layout();
    syncFloorFromWindow();
  });

  requestAnimationFrame(frame);
}

// 디버깅/테스트용
window.__pet = {
  play, has, ...COMMANDS,
  get state() { return state; },
  get floorPos() { return { x: pos.x, z: pos.z, lift, scale: root.scale.x, facing }; },
  get clip() { return currentAction?.getClip().name; },
  get yaw() { return Math.round(THREE.MathUtils.radToDeg(pivot.rotation.y)); }, // 실제로 돌아가 있는 각도(도)
  get clipTurns() { return Object.fromEntries([...clipTurns].map(([n, r]) => [n, Math.round(THREE.MathUtils.radToDeg(r))])); },
  get victoryPoses() { return victoryPoses(); },
  get exVariants() { return exVariants(); },
  get forms() { return [...forms]; },
  get gearClips() { return [...gearClips]; },
  get form2Off() { return [...form2Off]; },
  get clipEnds() { return Object.fromEntries([...clipEnds].map(([n, v]) => [n, [+v.x.toFixed(3), +v.z.toFixed(3)]])); },
  get clipHeads() { return Object.fromEntries([...clipHeads].map(([n, r]) => [n, Math.round(THREE.MathUtils.radToDeg(r))])); },
  get clipFronts() { return Object.fromEntries([...clipFronts].map(([n, r]) => [n, Math.round(THREE.MathUtils.radToDeg(r))])); },
  get clipHips() { return Object.fromEntries([...clipHips].map(([n, r]) => [n, Math.round(THREE.MathUtils.radToDeg(r))])); },
  set timeScale(f) { speed = f; }, // 동작 확인용 느린 재생 (몸 돌리기도 같이 느려짐)
  // 동작 확인용: 상태 머신을 멈추고(state 'pose') 이 동작만 반복
  pose(name, { face = FACE_FRONT, height = 0 } = {}) { endBattle(); armed = null; drag = null; setState('pose'); facing = face; lift = height; play(name); },
  get armed() { return armed && { left: Math.round((armed.until - clock()) / 1000) }; },
  armFor(seconds) { endBattle(); startArmed(); if (armed) armed.until = clock() + seconds * 1000; },
  get battle() { return battle && { ...battle, form, left: Math.round((battle.until - clock()) / 1000) }; },
  // stance: 시험용으로 전투 자세 고정 ('Normal' | 'Stand' | 'Kneel', 그 학생에게 있을 때)
  battleFor(seconds, stance) {
    endBattle(); startBattle();
    if (!battle) return;
    battle.until = clock() + seconds * 1000;
    if (stance && stanceReady(stance)) battle.stance = stance;
  },
  run() { if (battle) startRun(); }, // 전투 중 뛰어서 자리 옮기기
  simulate,
  bodies(seconds) { const out = []; simulate(seconds, { bodies: out }); return out; }, // 몸 방향 기록만
  replay: startReplay,
  get turnMode() { return turnMode; },
  set turnMode(m) { turnMode = m === 'A' ? 'A' : 'C'; carry = 0; },
  measure: measureTransition,
  edges: measureEdges,
  usedClips,
  picks: pickClips, // 사람이 볼 동작만 [{ clip, why }]
  clipStats: (name) => clipStats(resolve(name), 1), // 골반 최대 높이(월드/크기), 끝 자세에서 가장 먼 몸 조각
  sheet: drawSheet,
  poseRec: (name, faceDeg = null) => poseRec(name, faceDeg === null ? null : THREE.MathUtils.degToRad(faceDeg)),
  // 행동 테스트 (tools/behavior-check.js): 사람 손 없이 seconds초 돌리며 바뀐 상태·동작 기록 (until 상태가 되면 멈춤)
  //   pokes: 가끔 사람이 하는 것(클릭·더블클릭·집어 들기·메뉴 전투)도 섞음
  run(seconds, { until = null, pokes = false } = {}) { const trace = []; simulate(seconds, { poke: pokes ? [5, 40] : null, trace, until }); return trace; },
  reset() { endBattle(); armed = null; drag = null; lift = 0; form = 1; toIdle(); },
  grab() { drag = { moved: true, offset: null }; pickUp(); },
  release: drop,
  doubleClick: doubleClickEx,
  // 넘어간 순간에서 t초 뒤(음수면 전) 모습으로 멈춰 그린다 (동작 시트용, 다시 움직이려면 timeScale = 1)
  still(rec, t, { alone = false } = {}) {
    speed = 0;
    measureTransition(rec, { span: t, alone, record: false });
    updateHiddenParts();
    updateOutlines();
    updateShadow(0, { snap: true });
    renderer.render(scene, camera);
  },
};

// ---- 넘어가는 곳 확인 도구용 (tools/transition-review.js) ----
// 상태 머신을 가상 시계로 seconds초만큼 한 번에 돌려(그리지 않음) 넘어가는 곳 기록을 돌려준다.
// 가끔 사람이 하는 것(클릭, 더블클릭 EX, 집어 들었다 놓기, 메뉴 전투)을 섞는다
// click: 사람이 클릭(더블클릭·메뉴 전투 포함)해서 하던 동작을 끊고 넘어간 곳은 기록에 click 표시.
//   2026-10-18 사용자: 클릭이 다른 동작(뛰기·총 꺼내기·EX 등)을 끊고 휙 도는 건 그대로 둠 → 각도 검사가 알고 둔 것으로 셈
const POKES = [
  [() => clicked(react), 50],
  [() => { if (state !== 'ex' && state !== 'nap' && has(clipName('ex'))) clicked(doubleClickEx); }, 15],
  [() => { drag = { moved: true, offset: null }; pickUp(); }, 15],
  [() => clicked(COMMANDS.battle), 20],
];
function clicked(fn) {
  const from = transitionLog?.length ?? 0;
  fn();
  for (const rec of transitionLog?.slice(from) ?? []) rec.click = true;
}
// bodies: 배열을 주면 0.25초마다 [상태, 지금 동작, 몸 방향(도, 0 = 평소 대기 정면)]을 넣는다 (방향 잇기 방법 비교용)
// poke: null이면 사람 손 없이. trace: 배열을 주면 상태나 동작이 바뀔 때마다 { t, state, clip }. until: 이 상태가 되면 멈춤
function simulate(seconds, { dt = 1 / 30, poke = [5, 40], bodies = null, trace = null, until = null } = {}) {
  transitionLog = [];
  const front = clipHips.get(resolve('Cafe_Idle')) ?? 0;
  let nextSample = 0;
  pendingLogs.length = 0;
  let nextPoke = poke ? rand(...poke) : Infinity;
  let last = '';
  for (let t = 0; t < seconds; t += dt) {
    clockAhead += dt * 1000;
    if (t >= nextPoke && !['drag', 'fall', 'retreat', 'gone'].includes(state)) {
      pickWeighted(POKES)();
      lastInteraction = clock();
      nextPoke = t + rand(...poke);
      // 사람 손이 들어간 곳 표시 (행동 테스트가 여기서 끊어 잼: 승리 포즈 중 클릭 → 승리 포즈가 이어져도 한 동작에 멈춘 게 아님)
      if (trace) {
        last = `${state}|${currentAction?.getClip().name}`;
        trace.push({ t: +t.toFixed(2), state, clip: currentAction?.getClip().name, poke: true });
      }
    }
    if (state === 'drag' && stateTime > 1.5) drop();
    update(dt);
    mixer.update(dt);
    if (bodies && t >= nextSample && thighs.length === 2) {
      nextSample = t + 0.25;
      root.updateMatrixWorld(true);
      bodies.push([state, currentAction.getClip().name, Math.round(THREE.MathUtils.radToDeg(wrapAngle(hipYaw(thighs, root) - front)))]);
    }
    const now = `${state}|${currentAction?.getClip().name}`;
    if (trace && now !== last) trace.push({ t: +t.toFixed(2), state, clip: currentAction?.getClip().name });
    last = now;
    if (until && state === until) break;
  }
  fillTransitionLogs();
  const log = transitionLog.filter((r) => r.faceAfter !== undefined);
  transitionLog = null;
  return log;
}

// 기록 하나를 펫과 똑같이 반복해서 보여 준다: 앞 동작을 끊긴 시각 REPLAY_LEAD초 전부터 틀다가 그때 몸 방향 그대로 넘어가고
// REPLAY_TAIL초 더 본 뒤 처음부터 (상태 'replay', 다른 행동은 안 함)
const REPLAY_LEAD = 1;
const REPLAY_TAIL = 1.5;
let replaying = null;
function startReplay(rec) {
  endBattle();
  armed = null; drag = null;
  setState('replay');
  form = rec.form;
  lift = rec.lift;
  mixer.stopAllAction();
  currentAction = null;
  facing = rec.yawBefore - (clipTurns.get(rec.from) ?? 0);
  play(rec.from, { once: !rec.fromLoop, fade: 0 });
  carry = 0; // 앞 동작은 기록한 몸 방향 그대로 (이어 받는 건 넘어갈 때만 봄)
  currentAction.time = Math.max(0, rec.fromTime - REPLAY_LEAD);
  replaying = { rec, lead: rec.fromTime - currentAction.time, switched: false };
  pivot.rotation.y = rec.yawBefore;
  pivot.position.fromArray(rec.pivotPos);
  pivotTarget.fromArray(rec.pivotPos);
}
// 다시 틀기·재기에서 기록의 뒤 동작으로 넘긴다. 앞 동작은 이어 받은 방향(carry)을 facing에 녹여 틀고 있으므로,
// 같은 동작을 다시 틀 때(연달아 사격 Attack_Ing → Attack_Ing)는 play()가 이어 받기를 새로 정하지 않아 carry 0으로 돌아가 버린다.
// 펫에서는 같은 순서 안이라 방향도 이어 받기도 그대로다 → 넘어가기 전 몸 방향을 그대로 유지한다 (Shun에서 76~103° 휙 도는 것처럼 잘못 잼)
function switchLikePet(rec) {
  facing = rec.faceAfter;
  pivotTarget.fromArray(rec.pivotTarget);
  play(rec.to, { once: !rec.toLoop, fade: rec.fade });
  if (rec.to === rec.from) carry = wrapAngle(rec.yawBefore - facing - clipTurn());
}

// 기록 하나를 펫과 똑같이 넘기며(자체 시계 1/60초, 그리지 않음) 넘어간 순간부터 span초 동안 매 프레임 잰다.
// alone: 뒤 동작만 넘어간 뒤 방향으로 처음부터 (그 동작이 원래 도는 만큼을 빼려고)
//   돌려주는 값: [{ t, hip, feet: [{ x, z, h, dir }] }] hip: 두 허벅지 뼈를 잇는 선의 방향(도, 몸 전체가 도는 양을 볼 때),
//   발: 바닥 위 위치 x, z와 높이 h(모델 단위), dir 발끝 방향(도). 모두 펫 회전까지 넣은 값
//   onFrame(t): 넘어간 뒤 매 프레임 (창 끝 재기 등)
function measureTransition(rec, { span = 0.8, alone = false, record = true, onFrame = null } = {}) {
  const hips = ['L', 'R'].map((s) => pivot.getObjectByName(`Bip001_${s}_Thigh`));
  const feet = ['L', 'R'].map((s) => [`Bip001_${s}_Foot`, `Bip001_${s}_Toe0`].map((n) => pivot.getObjectByName(n)));
  if ([...hips, ...feet.flat()].some((b) => !b)) return null;
  endBattle();
  armed = null; drag = null;
  setState('pose');
  form = rec.form;
  lift = rec.lift ?? 0;
  mixer.stopAllAction();
  currentAction = null;
  const DT = 1 / 60, deg = THREE.MathUtils.radToDeg;
  let t = 0, switched = alone;
  if (alone) {
    facing = rec.faceAfter;
    play(rec.to, { once: !rec.toLoop, fade: 0 });
    carry = 0;
    pivot.rotation.y = facing + clipTurn();
    pivot.position.fromArray(rec.pivotTarget);
    pivotTarget.fromArray(rec.pivotTarget);
  } else {
    facing = rec.yawBefore - (clipTurns.get(rec.from) ?? 0);
    play(rec.from, { once: !rec.fromLoop, fade: 0 });
    carry = 0;
    currentAction.time = Math.max(0, rec.fromTime - 0.1);
    t = Math.min(currentAction.time - rec.fromTime, span);
    if (span < 0) currentAction.time = Math.max(0, rec.fromTime + span);
    pivot.rotation.y = rec.yawBefore;
    pivot.position.fromArray(rec.pivotPos);
    pivotTarget.fromArray(rec.pivotPos);
  }
  mixer.update(0);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const frames = [];
  for (let n = 0; n < 600 && t < span; n++) {
    if (!switched && t >= -1e-6) {
      switched = true;
      switchLikePet(rec);
    }
    update(DT);
    mixer.update(DT);
    t += DT;
    if (!switched) continue;
    onFrame?.(t);
    if (!record) continue;
    scene.updateMatrixWorld(true);
    root.worldToLocal(hips[0].getWorldPosition(a));
    root.worldToLocal(hips[1].getWorldPosition(b));
    const hip = deg(Math.atan2(b.x - a.x, b.z - a.z));
    frames.push({
      t: +t.toFixed(4), hip: +hip.toFixed(2),
      feet: feet.map(([foot, toe]) => {
        root.worldToLocal(foot.getWorldPosition(a));
        root.worldToLocal(toe.getWorldPosition(b));
        return { x: +a.x.toFixed(4), z: +a.z.toFixed(4), h: +a.y.toFixed(4), dir: +deg(Math.atan2(b.x - a.x, b.z - a.z)).toFixed(1) };
      }),
    });
  }
  return frames;
}

// 창 끝 재기 (tools/edge-check.js): 기록 하나를 넘긴 뒤 뒤 동작이 끝날 때까지 every 프레임마다 그려서
// 모델(외곽선 포함, 그림자 빼고)이 펫 창 위·왼쪽·오른쪽·아래 끝에서 몇 px 떨어지는지 가장 가까운 값과 그 시각을 돌려준다 (0 = 닿아서 잘림).
// 바닥에서 가장 가까운 자리(화면 아래 가운데, 모델이 가장 큼)에 세워 잰다
//   every: 몇 프레임마다 그릴지(60fps 기준), 픽셀은 가로세로 2칸마다 본다 (빠르게. 여백이 1~2px 덜 정확함)
function measureEdges(rec, { every = 3, alone = false } = {}) {
  const clip = clips[resolve(rec.to)];
  if (!clip) return null;
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, dpr = w / canvas.clientWidth;
  const buf = new Uint8Array(w * h * 4);
  const near = floor.toFloor(workArea.x + workArea.width / 2, workArea.y + workArea.height - 2);
  if (near) pos.copy(near);
  const m = { top: Infinity, left: Infinity, right: Infinity, bottom: Infinity, topAt: 0, leftAt: 0, rightAt: 0, bottomAt: 0 };
  // 총·방패를 빼고 잰 여백도 따로: 총이 생기거나 사라지며 섞이는 0.1~0.4초 동안 작은 총이 늘어져 창 끝에 닿는 건 알고 둔 것 (2026-10-18 사용자)
  const body = { top: Infinity, left: Infinity, right: Infinity, bottom: Infinity };
  const draw = () => {
    shadow.visible = false; // 발밑 그림자는 빼고 모델만 (그림자는 늘 창 아래 끝까지 감)
    renderer.render(scene, camera);
    shadow.visible = true;
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let top = h, left = w, right = w, bottom = h;
    for (let y = 0; y < h; y += 2) {
      const row = y * w * 4;
      for (let x = 0; x < w; x += 2) {
        if (buf[row + x * 4 + 3] <= 16) continue;
        top = Math.min(top, h - 1 - y); // readPixels는 아래 줄부터
        left = Math.min(left, x);
        right = Math.min(right, w - 1 - x);
        bottom = Math.min(bottom, y);
      }
    }
    return { top: top / dpr, left: left / dpr, right: right / dpr, bottom: bottom / dpr };
  };
  let n = 0;
  measureTransition(rec, {
    span: clip.duration, record: false, alone,
    onFrame: (t) => {
      if (n++ % every) return;
      updateHiddenParts();
      updateOutlines();
      const all = draw();
      for (const k of ['top', 'left', 'right', 'bottom']) {
        if (all[k] < m[k]) { m[k] = all[k]; m[`${k}At`] = +t.toFixed(2); }
      }
      const shown = weaponMeshes.filter((o) => o.visible);
      let only = all;
      if (shown.length) {
        for (const o of shown) o.visible = false;
        updateOutlines();
        only = draw();
        for (const o of shown) o.visible = true;
        updateOutlines();
      }
      for (const k of ['top', 'left', 'right', 'bottom']) body[k] = Math.min(body[k], only[k]);
    },
  });
  for (const k of ['top', 'left', 'right', 'bottom']) { m[k] = Math.round(m[k]); body[k] = Math.round(body[k]); }
  m.body = body;
  return m;
}

// 이 학생에게 펫이 쓸 수 있는 동작 전부 (차림마다 실제 이름으로). 창 끝 검사에서 흉내 중에 안 나온 동작을 채울 때 씀
function usedClips() {
  const names = [...Object.values(ANIM).flat(), REACTION, ARMED_IDLE, ...ARMED_FIDGETS, ...ARMED_REACTIONS,
    ...STANCES.flatMap(stanceAll), ...RELOAD_VARIANTS, ...BATTLE_ENTRY, ...DRAW_WEAPON, RUN_CALLSIGN, ...VICTORIES.flat(), ...OTHER_CLIPS, ...exVariants()];
  const keep = form;
  const out = new Set();
  for (const f of forms) {
    form = f;
    for (const n of names) if (has(n)) out.add(resolve(n));
  }
  form = keep;
  // 01/02 변형도 (playSequence pickVariants가 섞어 씀)
  if (variantForms) for (const n of [...out]) for (const c of clipIndex.get(clipKey(n)) ?? []) out.add(c.name);
  return [...out];
}

// ---- 사람이 볼 동작 고르기 (tools/check-student.js) ----
// 동작 시트 전체는 너무 많아서(사용자 2026-10-12) 사람이 판단해야 할 것만 고른다:
// 연출 판단(몸이 크게 뜨는 동작, 쓰러질 때 멀리 떨어지는 총·소품, 다른 파일에서 빌려온 동작)과 이 학생만의 특징(02 차림, EX 여러 개, 장비 모습이 다른 동작)
const PICK_RISE = 1.6;   // 골반 높이가 서 있을 때의 몇 배를 넘으면 "몸이 크게 뜸" (아리스 Victory_Start 하늘에서 착지)
const PICK_FAR = 1.0;    // 낮잠 끝 자세에서 몸 조각(총·소품) 가운데가 몸 상자에서 골반 높이의 몇 배 넘게 떨어지면 "멀리 떨어짐"
const PICK_SAMPLES = 24;

// 동작 하나를 혼자 틀어 고르게 샘플: 골반 높이 최대(서 있을 때 대비), 끝 자세에서 가장 멀리 떨어진 몸 조각
function clipStats(name, standHip) {
  const hips = ['L', 'R'].map((s) => pivot.getObjectByName(`Bip001_${s}_Thigh`));
  if (hips.some((b) => !b)) return null;
  const V = THREE.Vector3;
  const hipAt = () => hips[0].getWorldPosition(new V()).add(hips[1].getWorldPosition(new V())).multiplyScalar(0.5);
  const base = () => root.getWorldPosition(new V());
  const clip = clips[name];
  mixer.stopAllAction();
  const action = mixer.clipAction(clip);
  action.reset().play();
  let rise = 0, far = 0, farPart = '';
  for (let k = 0; k <= PICK_SAMPLES; k++) {
    action.time = (clip.duration * k) / PICK_SAMPLES;
    mixer.update(0);
    updateHiddenParts();
    scene.updateMatrixWorld(true);
    const unit = root.scale.x;
    const hip = hipAt();
    rise = Math.max(rise, (hip.y - base().y) / unit / standHip);
    if (k < PICK_SAMPLES) continue;
    // 몸(정점이 가장 많은 메시)의 상자에서 다른 조각 가운데까지. 헤일로는 원래 몸에서 떠 있으니 뺀다
    const parts = [];
    root.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position || /outline|halo/i.test(o.name)) return;
      o.computeBoundingBox?.();
      const box = (o.boundingBox ?? o.geometry.boundingBox)?.clone();
      if (box) parts.push({ o, box: box.applyMatrix4(o.matrixWorld) });
    });
    const body = parts.reduce((a, b) => (b.o.geometry.attributes.position.count > (a?.o.geometry.attributes.position.count ?? -1) ? b : a), null);
    for (const p of parts) {
      if (p === body) continue;
      const d = body.box.distanceToPoint(p.box.getCenter(new V())) / unit / standHip;
      if (d > far) { far = d; farPart = p.o.name; }
    }
  }
  action.stop();
  return { rise: Math.round(rise * 100) / 100, far: Math.round(far * 100) / 100, farPart };
}

function pickClips() {
  window.__pet.reset();
  const used = usedClips();
  const formOf = new Map([...clipIndex.values()].flat().map((c) => [c.name, c.form]));
  const out = new Map(); // 동작 → 이유들
  const add = (clip, why) => { if (clips[clip]) out.set(clip, [...(out.get(clip) ?? []), why]); };
  // 서 있을 때 골반 높이(월드 단위 / 크기): 펫이 쓰는 동작들의 최대 골반 높이 가운데값 (카페 대기 하나로 재면 아리스처럼 빌려온 대기가 낮은 학생에서 틀림)
  // 무릎 자세 동작은 원래 낮으니 가운데값에서 뺀다 (Shun은 무릎 동작이 많아 가운데값이 앉은 높이가 되어 서 있는 동작이 모두 "2배 뜸"으로 잡혔음)
  const raw = used.filter((n) => !/^Vital_Retreat/i.test(n)).map((n) => [n, clipStats(n, 1)]).filter(([, x]) => x);
  const highs = raw.filter(([n]) => !/Kneel/i.test(n)).map(([, x]) => x.rise).sort((a, b) => a - b);
  const standHip = highs[Math.floor(highs.length / 2)] ?? 1;
  const r2 = (v) => Math.round(v * 100) / 100;
  for (const [name, x] of raw) { // 밧줄에 매달려 올라가는 종료(Vital_Retreat)는 원래 뜨므로 뺐음
    const rise = x.rise / standHip, far = x.far / standHip;
    if (rise > PICK_RISE) add(name, `몸이 크게 뜸 (골반이 서 있을 때의 ${r2(rise)}배 높이)`);
    if (/^Vital_Death/i.test(name) && far > PICK_FAR) add(name, `쓰러질 때 ${x.farPart}이(가) 몸에서 멀리 떨어짐 (골반 높이의 ${r2(far)}배)`);
  }
  const borrowed = BORROWED_CLIPS[settings.model];
  for (const to of Object.values(borrowed?.clips ?? {})) add(to, `다른 파일(${borrowed.from})에서 빌려온 동작`);
  const exs = exVariants();
  if (exs.length > 1) for (const n of exs) add(n, `EX가 ${exs.length}개 (무작위로 섞음)`);
  // 02 차림 동작은 겉모습이 다른 게 당연하니 아래 02 항목 하나로 (EX에만 붙은 번호 Exs02_01은 차림이 아님)
  const form2 = forms.has(2) ? used.filter((n) => formOf.get(n) === 2 && !exs.includes(n)) : [];
  for (const n of used) if (gearClips.has(n) && !form2.includes(n)) add(n, '평소 대기와 장비 모습이 다름');
  if (form2.length) {
    const keep = form; form = 2;
    const idle2 = resolve(ARMED_IDLE);
    form = keep;
    add(formOf.get(idle2) === 2 ? idle2 : form2[0], `02 차림 (전투 중 EX 뒤에 바뀜, 02 동작 ${form2.length}개)`);
  }
  if (variantForms) for (const n of used) if (formOf.get(n) === 2) add(n, '02 변형 (01과 무작위로 섞음, 짝은 같은 번호끼리)');
  window.__pet.reset();
  return [...out].map(([clip, why]) => ({ clip, why }));
}

// 동작 하나를 혼자 틀 때 쓸 기록 (measureTransition alone): 그 동작이 나올 만한 방향으로.
// 평소 동작은 정면 쪽 15°, 총·EX는 45°, 걷기·뛰기는 70°, 낮잠은 펫과 같은 방향·자리(startNap), 집어 들기는 들린 높이
function poseRec(name, face = null) {
  const formOf = [...clipIndex.values()].flat().find((c) => c.name === name)?.form ?? 1;
  face ??= THREE.MathUtils.degToRad(/^(Cafe_Walk|Move_Ing|Move_Callsign|Move_Jump)/i.test(name) ? 70
    : /^(Normal|Stand|Kneel|Move_End|Exs)|Public/i.test(name) ? 45 : 15);
  const rec = { to: name, toLoop: false, faceAfter: face, yawBefore: face, form: formOf, fade: 0,
    lift: /^Formation_Pickup/i.test(name) ? DRAG_LIFT : 0, pivotPos: [0, 0, 0], pivotTarget: [0, 0, 0] };
  if (/^Vital_Death/i.test(name)) {
    rec.faceAfter = rec.yawBefore = FACE_NAP;
    const end = clipEnds.get(name);
    const t = NAP_OFFSET.clone().add(NAP_BODY.clone().applyAxisAngle(UP, FACE_NAP));
    if (end) t.sub(end.clone().applyAxisAngle(UP, FACE_NAP + (clipTurns.get(name) ?? 0)));
    rec.pivotTarget = rec.pivotPos = t.toArray();
  }
  return rec;
}

// 동작 시트 (tools/check-student.js): 동작마다 한 줄, 고르게 frames장. 그 동작이 나올 만한 방향으로 혼자 틀어 그린다
// 창에서 가운데 60%·아래 80%만 (위쪽은 날아오르는 EX 말고는 비어 있음)
// notes: { 동작: [이유, …] } 있으면 이름 아래에 적는다 (사람이 볼 동작만 고른 시트)
function drawSheet(names, { frames = 5, cell = [260, 200], label = 210, notes = {} } = {}) {
  const [cw, ch] = cell;
  const sheet = document.createElement('canvas');
  sheet.width = label + cw * frames;
  sheet.height = ch * names.length;
  const g = sheet.getContext('2d');
  g.fillStyle = '#3c465f';
  g.fillRect(0, 0, sheet.width, sheet.height);
  const src = renderer.domElement;
  const [sx, sw, sy, sh] = [src.width * 0.2, src.width * 0.6, src.height * 0.2, src.height * 0.8];
  const near = floor.toFloor(workArea.x + workArea.width / 2, workArea.y + workArea.height - 2);
  names.forEach((name, i) => {
    const clip = clips[name];
    if (!clip) return;
    const rec = poseRec(name);
    g.fillStyle = '#fff';
    g.font = '15px "Malgun Gothic", sans-serif';
    g.fillText(name, 8, i * ch + 24);
    g.fillStyle = '#b8c0d0';
    g.fillText(`${clip.duration.toFixed(2)}초`, 8, i * ch + 46);
    g.fillStyle = '#ffd479';
    g.font = '13px "Malgun Gothic", sans-serif';
    let y = i * ch + 70;
    for (const note of notes[name] ?? []) { // 칸 너비에 맞춰 글자 단위로 줄바꿈
      let line = '';
      for (const c of `· ${note}`) {
        if (g.measureText(line + c).width > label - 14) { g.fillText(line, 8, y); y += 17; line = '  '; }
        line += c;
      }
      g.fillText(line, 8, y); y += 21;
    }
    for (let k = 0; k < frames; k++) {
      if (near) pos.copy(near);
      measureTransition(rec, { span: (clip.duration * (k + 0.5)) / frames, alone: true, record: false });
      updateHiddenParts();
      updateOutlines();
      updateShadow(0, { snap: true });
      renderer.render(scene, camera);
      g.drawImage(src, sx, sy, sw, sh, label + k * cw, i * ch, cw, ch);
    }
  });
  return sheet.toDataURL('image/png');
}

function updateReplay() {
  const { rec, lead, switched } = replaying;
  if (!switched && stateTime >= lead) {
    replaying.switched = true;
    switchLikePet(rec);
  } else if (switched && stateTime >= lead + rec.fade + REPLAY_TAIL) startReplay(rec);
}

main().catch((err) => console.error('펫 초기화 실패:', err));

// 브라우저에서 열었을 때: 페이지 전체를 작업 영역으로, 캔버스를 펫 창으로 흉내 낸다 (?sim)
function createBrowserStub() {
  const q = new URLSearchParams(location.search);
  const sim = q.has('sim');
  const model = q.get('model') ?? 'Hoshino.glb'; // 테스트 도구의 --model=
  // main.js SIZES.medium과 같게. 검사 도구가 예전 창을 흉내 낼 때만 ?window=560x280
  const [W, H] = (q.get('window') ?? '862x538').split('x').map(Number);
  // ?review: 넘어가는 곳 확인 도구. 페이지는 펫 창 크기 그대로, 바닥은 1920×1040 바탕화면인 셈 치고 걷기·뛰기도 한다
  const review = q.has('review');
  const area = () => (review ? { x: 0, y: 0, width: 1920, height: 1040 } : { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });
  if (sim) {
    document.body.classList.add('sim');
    Object.assign(canvas.style, {
      position: 'absolute', width: `${W}px`, height: `${H}px`,
      left: `${window.innerWidth - W - 120}px`, top: `${window.innerHeight - H}px`,
    });
  }
  const winRect = () => (sim
    ? { x: parseFloat(canvas.style.left), y: parseFloat(canvas.style.top), width: W, height: H }
    : review ? { x: (1920 - W) / 2, y: 1040 - H, width: W, height: H } : area());
  return {
    readModel: () => fetch(new URL(`../../models/${encodeURIComponent(model)}`, import.meta.url)).then((r) => r.arrayBuffer()),
    readModelFile: (name) => fetch(new URL(`../../models/${encodeURIComponent(name)}`, import.meta.url)).then((r) => r.arrayBuffer()),
    getSettings: async () => ({ walk: sim || review, model }),
    getBounds: async () => ({ win: winRect(), workArea: area() }),
    getWorkArea: async () => area(),
    move(x, y) { if (sim) Object.assign(canvas.style, { left: `${x}px`, top: `${y}px` }); },
    cursor: (e) => ({ x: e.clientX, y: e.clientY }),
    setIgnoreMouse() {}, showMenu() {}, quit() {}, fx() {},
    onCommand() {}, onSettings() {}, onBoundsChanged() {},
  };
}
