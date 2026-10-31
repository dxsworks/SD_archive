import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DesktopFloor } from './floor.js';
import { hiddenPartsUpdater, clipsChangingParts, restUnderHiddenBones, hiddenPropsAt, showsProp } from './hidden-parts.js';
import { addOutlines } from './outline.js';
import { measureClips, hipYaw, thighBones } from './clip-facing.js';
import {
  ANIM, REACTION, ARMED_IDLE, ARMED_FIDGETS, ARMED_REACTIONS, STANCES, STANCE_IDLE, ATTACK_STEPS, BATTLE_ENTRY,
  DRAW_WEAPON, RUN_CALLSIGN, VICTORIES, RELOAD_VARIANT, RELOAD_VARIANTS, OTHER_CLIPS, FORM_RELEASE, stanceAll, clipKey, indexClips, exVariants as exVariantsOf, skipClip, cafeOutfitFile, hasCafeIdle,
  formVariants,
} from './clip-names.js';

// ---- 화면 구성 ----
// 창 높이에 들어갈 월드 단위 높이. 검사 도구가 예전 창을 흉내 낼 때만 주소의 ?viewHeight=로 바꾼다 (tools/edge-check.js --window)
// 3.4 = 발 위 2.87단위 + 발 아래 FOOT_MARGIN. 위로 0.6 늘림(2026-10-30 사용자): 이즈나 EX 공중제비가 창 위로 최대 93px 나가 잘렸음
const VIEW_HEIGHT = Number(new URLSearchParams(location.search).get('viewHeight')) || 3.4;
const TILT = THREE.MathUtils.degToRad(12);       // 카페처럼 살짝 위에서 내려다보는 각도
// 발 자리(바닥 원점)가 창 맨 아래에서 이만큼 위 (월드 단위). 카메라가 내려다봐서 앞으로 내디딘 발·그림자는 발 자리보다
// 25~40px 아래에 그려지므로 0.2단위, 날개·헤일로가 발밑 아래로 내려오는 동작(츠루기 낮잠, 스미레 EX)에 0.3단위를 더 둔다
// (main.js BELOW). 정사영 카메라라 늘려도 발 위쪽 그림은 그대로. ?footMargin=은 검사 도구가 예전 창을 흉내 낼 때
const FOOT_MARGIN = Number(new URLSearchParams(location.search).get('footMargin')) || 0.53;
const FACE_FRONT = 0;
// 전투 동작은 옆을 보도록 만들어져 있어서 카메라 쪽으로 돌림. ?battleFace=(도)는 각도 비교용
const FACE_BATTLE = THREE.MathUtils.degToRad(Number(new URLSearchParams(location.search).get('battleFace')) || 60);
const FACE_SPREAD = THREE.MathUtils.degToRad(30);   // 평소 동작은 정면에서 이만큼 안쪽 아무 방향
const BATTLE_SPREAD = THREE.MathUtils.degToRad(20); // 전투·EX는 FACE_BATTLE에서 이만큼 안쪽 아무 방향
const RUN_SPREAD = THREE.MathUtils.degToRad(15);    // 전투 중 자리 옮기기: 도착해서 볼 방향에서 이만큼 흔들어 뛴다
// 얼굴이 카메라에서 이보다 돌아가면 그만큼 몸을 돌려 얼굴이 보이게. ?headLimit=(도)는 각도 비교용
// 45°였을 때 왼쪽을 겨누면 몸이 70~115° 옆을 봐서 35°로 줄임(2026-10-20 사용자, 45/35/25/15 비교 그림에서 고름)
const HEAD_LIMIT = THREE.MathUtils.degToRad(Number(new URLSearchParams(location.search).get('headLimit')) || 35);
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
  // 원점(발밑)이 화면 맨 아래에서 FOOT_MARGIN 위에 오도록 시점 중심을 잡는다
  const targetY = (VIEW_HEIGHT / 2 - FOOT_MARGIN) / Math.cos(TILT);
  camera.position.set(0, targetY + 10 * Math.sin(TILT), 10 * Math.cos(TILT));
  camera.lookAt(0, targetY, 0);
  setViewShift(viewShift.x, viewShift.y, true);
}

// 창은 정수 px로만 옮겨져서(setBounds) 걸을 때 한 프레임에 1px, 다음엔 2px처럼 들쭉날쭉 움직였다(2026-10-20 사용자).
// 반올림하고 남은 만큼(1px 미만) 창 안 그림을 같은 쪽으로 밀어 화면에서는 몸이 고르게 움직이게 한다 (x 오른쪽, y 아래쪽, px)
const viewShift = { x: 0, y: 0 };
function setViewShift(x, y, force = false) {
  if (!force && x === viewShift.x && y === viewShift.y) return;
  Object.assign(viewShift, { x, y });
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const halfH = VIEW_HEIGHT / 2;
  const halfW = halfH * (w / h);
  const ox = (x / h) * VIEW_HEIGHT; // px → 창 안 단위
  const oy = (y / h) * VIEW_HEIGHT;
  Object.assign(camera, { left: -halfW - ox, right: halfW - ox, top: halfH + oy, bottom: -halfH + oy });
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
let clipLifts = new Map(); // 동작 이름 → [처음, 끝] 골반 높이 (모델 기준)
let clipHips = new Map();  // 동작 이름 → 막 시작했을 때 몸(허벅지 선) 방향 (모델 기준)
let clipFronts = new Map(); // 동작 이름 → 몸 앞쪽 방향 (모델 기준, 0 = 카메라 쪽, 어깨선·허벅지 선으로 잼)
let thighs = [];
let gearClips = new Set(); // 평소 대기와 장비 모습이 다른 동작 (아리스(배틀) 등 뒤 장비가 생기거나 사라짐). 평소 상태에서는 피한다
let form2Off = new Set(); // 02 차림 전투 대기(Normal_Idle02)와 모습이 다른 동작. 02 차림으로 끝난 전투의 승리 포즈를 고를 때 씀
let modelRoot = null;
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

// ---- 카페 차림 (2026-10-29 사용자: 토키는 카페 차림과 기본 차림을 오가게) ----
// 원본에 카페 동작이 없는 학생 중 "<학생> (Cafe).glb"(카페 동작 3개뿐인 다른 옷)가 따로 있는 학생: Toki, Saori (Dress).
// 같은 뼈대라 카페 파일의 몸(무기·헤일로 말고 전부)을 이 모델 뼈에 다시 붙이고 카페 동작을 가져온다.
// 평소에는 카페 몸, 총·EX 동작을 틀면 원래(전투) 몸으로 갈아입고 카페·집어 들기·낮잠 동작을 틀 때 돌아온다 (outfitFor). 갈아입는 동작은 없어서 순간 바뀜
// 입 모양 메시는 두 파일에 같은 이름이 있어(Saori Mouth_401) 가져온 것은 이름 앞에 CAFE_PREFIX를 붙이고 카페 동작의 모프 값도 그 이름으로 바꾼다
const CAFE_PREFIX = 'Cafe__';
const SHARED_MESH = /weapon|shield|halo/i; // 두 차림이 같이 쓰는 것 (원래 모델 것을 그대로)
let cafeOutfit = null; // { cafe: [가져온 몸 메시], battle: [원래 몸 메시] }
let wearCafe = true;

async function borrowCafeOutfit(gltf) {
  if (hasCafeIdle(gltf.animations.map((c) => c.name))) return null;
  const from = cafeOutfitFile(settings.model);
  let source;
  try {
    source = await new GLTFLoader().parseAsync(toArrayBuffer(await bridge.readModelFile(from)), '');
  } catch {
    return null; // 카페 파일이 없는 학생 (Nonomi 등): 원래대로
  }
  const nodes = new Map();
  gltf.scene.traverse((o) => nodes.set(o.name, o));
  // 카페 옷에만 있는 뼈(Saori (Dress) 카페 드레스의 리본·귀걸이 63개)는 같은 이름의 부모 뼈 아래에 복사해 붙인다.
  // 카페 동작에선 움직이고, 원래 모델 동작에선 안 움직여 부모를 따라 기본 자세 그대로
  source.scene.traverse((o) => {
    const parent = nodes.get(o.parent?.name);
    if (!o.isBone || nodes.has(o.name) || !parent) return;
    const bone = new THREE.Bone();
    bone.name = o.name;
    bone.position.copy(o.position);
    bone.quaternion.copy(o.quaternion);
    bone.scale.copy(o.scale);
    parent.add(bone);
    nodes.set(o.name, bone);
  });
  const cafe = [];
  const renamed = new Map(); // 카페 파일 메시 이름 → 가져온 이름
  source.scene.traverse((m) => {
    if (!m.isSkinnedMesh || SHARED_MESH.test(m.name)) return;
    const bones = m.skeleton.bones.map((b) => nodes.get(b.name));
    if (bones.some((b) => !b)) { console.warn(`${from} ${m.name}: 이 모델에 없는 뼈가 있어 안 씀`); return; }
    const mesh = new THREE.SkinnedMesh(m.geometry, m.material);
    mesh.name = CAFE_PREFIX + m.name;
    mesh.bind(new THREE.Skeleton(bones, m.skeleton.boneInverses.map((x) => x.clone())), m.bindMatrix.clone());
    gltf.scene.add(mesh);
    cafe.push(mesh);
    renamed.set(m.name, mesh.name);
  });
  if (!cafe.length) return null;
  const nodeOf = (tr) => tr.name.slice(0, tr.name.lastIndexOf('.'));
  // 원래 모델 동작이 크기 0으로 숨기는 소품 뼈(토키 로봇 bone_root_Machine)는 카페 파일에 없어 카페 동작 동안 기본 크기(보임)가 된다.
  // 카페 옷일 땐 그 메시를 숨기지만 카페 → 총 꺼내기로 섞는 0.2초 동안 크기가 1 → 0으로 줄며 로봇이 번쩍 나왔다 (사용자 2026-10-29)
  // → 카페 동작에 없는 크기 값은 01 무장 대기 첫 순간 값으로 고정해 넣는다
  let form2 = false;
  const armedIdle = gltf.animations.find((c) => { form2 = false; return clipKey(c.name, (n) => { form2 = n === 2; }) === clipKey(ARMED_IDLE) && !form2; });
  for (const clip of source.animations) {
    const tracks = clip.tracks.flatMap((tr) => {
      const node = nodeOf(tr);
      if (renamed.has(node)) { const t = tr.clone(); t.name = renamed.get(node) + tr.name.slice(node.length); return [t]; }
      return nodes.has(node) && !tr.name.endsWith('.morphTargetInfluences') ? [tr] : [];
    });
    for (const tr of armedIdle?.tracks ?? []) {
      if (tr.name.endsWith('.scale') && !tracks.some((t) => t.name === tr.name)) tracks.push(new THREE.VectorKeyframeTrack(tr.name, [0], tr.values.slice(0, 3)));
    }
    gltf.animations = [...gltf.animations.filter((c) => c.name !== clip.name), new THREE.AnimationClip(clip.name, clip.duration, tracks)];
  }
  // 카페 동작이 아닐 때(집어 들기·낮잠 등 원래 모델 동작) 가져온 입 모양은 카페 대기 첫 순간 값으로 (기본값이면 입이 여러 개 겹쳐 보임)
  const idle = gltf.animations.find((c) => /^cafe_idle/i.test(c.name));
  for (const tr of idle?.tracks ?? []) {
    const mesh = cafe.find((m) => tr.name === `${m.name}.morphTargetInfluences`);
    if (mesh) mesh.morphTargetInfluences.splice(0, tr.getValueSize(), ...tr.values.slice(0, tr.getValueSize()));
  }
  const battle = [];
  gltf.scene.traverse((o) => { if (o.isMesh && !cafe.includes(o) && !SHARED_MESH.test(o.name)) battle.push(o); });
  return { cafe, battle };
}

// 이 동작을 틀면 입을 옷: true 카페 / false 전투 / undefined 지금 옷 그대로 (승리 포즈·퇴장·구르기는 앞 동작에 따름)
function outfitFor(key) {
  if (/^(cafe_|formation_|vital_death)/.test(key)) return true;
  if (GUN_POSE.test(key) || /^(exs|formrelease|move_(ing|end|callsign))/.test(key)) return false;
  return undefined;
}

// updateHiddenParts 뒤에: 입지 않은 옷의 메시를 숨긴다
function applyOutfit() {
  if (!cafeOutfit) return;
  for (const m of wearCafe ? cafeOutfit.battle : cafeOutfit.cafe) m.visible = false;
}

async function loadModel() {
  const gltf = await new GLTFLoader().parseAsync(toArrayBuffer(await bridge.readModel()), '');
  await borrowClips(gltf);
  cafeOutfit = await borrowCafeOutfit(gltf);
  gltf.animations = gltf.animations.filter((c) => !skipClip(settings.model, c.name)); // 학생별로 안 쓰기로 한 동작 (clip-names.js SKIP_CLIPS)
  restUnderHiddenBones(gltf.scene, gltf.animations); // 숨긴 소품 아래 뼈가 섞일 때 늘어나지 않게

  gltf.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.frustumCulled = false; // 스킨 메시는 바운딩이 정확하지 않아 잘려 보일 수 있음
    if (/weapon|shield/i.test(obj.name)) weaponMeshes.push(obj);
    obj.material = Array.isArray(obj.material) ? obj.material.map(toUnlit) : toUnlit(obj.material);
  });
  const hideParts = hiddenPartsUpdater(gltf.scene);
  // 옷으로 숨긴 메시는 매 프레임 되살린 뒤 모프 숨김 → 옷 숨김 (모프 숨김 타깃이 없는 몸 메시는 hideParts가 다시 켜 주지 않음)
  const outfitMeshes = cafeOutfit ? [...cafeOutfit.cafe, ...cafeOutfit.battle] : [];
  updateHiddenParts = () => { for (const m of outfitMeshes) m.visible = true; hideParts(); applyOutfit(); };
  updateOutlines = addOutlines(gltf.scene); // 숨김 판정·무기 목록을 만든 뒤에 (외곽선 메시는 거기 들어가지 않게)
  refreshWeapons(); // 동작을 틀기 전에는 무기를 숨김
  pivot.add(gltf.scene);
  modelRoot = gltf.scene;
  hands = ['Bip001_L_Hand', 'Bip001_R_Hand'].map((n) => gltf.scene.getObjectByName(n)).filter(Boolean);

  clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  ({ index: clipIndex, forms } = indexClips(Object.keys(clips)));
  variantForms = formVariants(clipIndex, forms);
  if (variantForms) forms.delete(2); // 차림이 아니라 변형: EX 뒤에도 01 차림 그대로, 변형은 playSequence에서 섞음
  gearClips = clipsChangingParts(gltf.scene, gltf.animations, resolve('Cafe_Idle'));
  const idle2 = forms.has(2) ? clipIndex.get(clipKey(ARMED_IDLE))?.find((c) => c.form === 2)?.name : undefined;
  form2Off = idle2 ? clipsChangingParts(gltf.scene, gltf.animations, idle2) : new Set();
  markForm2Props(idle2);
  formEx = findFormEx(idle2);
  ({ turns: clipTurns, heads: clipHeads, ends: clipEnds, hips: clipHips, fronts: clipFronts, lifts: clipLifts } = measureClips(gltf.scene, gltf.animations, (n) => clipKey(n)));
  thighs = thighBones(gltf.scene).filter(Boolean);
  deployStances = findDeployStances();
  proneStances = findProneStances();
  exAfters = findExAfters();
  formChanges = findFormChanges();
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
// 지금 틀 수 있는지: 01 차림에서는 02에만 있는 동작을 쓰지 않는다 (Hoshino (Battle) 재장전은 02(방패 뒤)에만 있어 01에서 틀면 방패가 나왔음).
// 02 차림에서 01 것을 빌려 쓰는 건 그대로 (Subaru 02 재장전은 01)
const canPlay = (name) => has(name) && (currentForm() !== 1 || ownForm(name));
const canReload = (st) => canPlay(`${st}_Reload`);
// 재장전: 변형(_Random)이 지금 차림에 있으면 원래 것과 반반
const reloadClip = (name) => (ownForm(RELOAD_VARIANT(name)) && Math.random() < 0.5 ? RELOAD_VARIANT(name) : name);
// 그 차림 번호의 실제 이름 (없으면 undefined)
const formName = (name, f) => clipIndex.get(clipKey(name))?.find((c) => c.form === f)?.name;
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
// again: 같은 동작을 다시 틀 때(연달아 사격 Attack_Ing → Attack_Ing)도 섞는다. 자기 자신과는 섞을 수 없어
//   예전엔 처음 자세로 바로 돌아가 Kurumi 머리카락이 51° 튀었음 → 같은 데이터의 쌍둥이 동작으로 섞는다
const twins = new Map();
const twinOf = (action) => {
  const clip = action.getClip();
  if (!twins.has(clip)) twins.set(clip, clip.clone());
  return mixer.clipAction(twins.get(clip));
};
function play(name, { once = false, fade = 0.2, onDone = null, again = false } = {}) {
  let action = mixer.clipAction(clips[resolve(clipName(name))]);
  if (again && action === currentAction && once && fade > 0) action = twinOf(action);
  if (cafeOutfit) wearCafe = outfitFor(clipKey(action.getClip().name)) ?? wearCafe;
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

  let blended = false;
  if (prev && prev !== action) {
    if (fade > 0 && prev.enabled && prev.getEffectiveWeight() > 0.99) {
      action.crossFadeFrom(prev, fade, false);
      blended = true;
    } else {
      prev.stop(); // 이전 동작이 아직 페이드 중이면 섞지 않고 바로 전환
    }
  }
  currentAction = action;
  refreshWeapons();
  if (prev?.getClip().name !== action.getClip().name) carryTurn(action.getClip().name);
  if (frontFaces.has(action.getClip().name)) facing = frontFaces.get(action.getClip().name);
  syncTurn(prev, blended ? fade : 0);
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
// 묶는 이름(clipKey)으로 본다: Shiroko＊Terror Normal01_Victory_Start·Normal01_Move_Ing는 총 자세가 아님
const GUN_POSE = /^(normal|stand|kneel)_|^(normal_)?public$/;
const CARRY_MAX = THREE.MathUtils.degToRad(120);
let turnMode = new URLSearchParams(location.search).get('turn') === 'A' ? 'A' : 'C';
let carry = 0;
function carryTurn(name) {
  const key = clipKey(name);
  if (turnMode === 'A' || !GUN_POSE.test(key) || (drawTurns && DRAW_CLIP.test(key))
    || thighs.length < 2 || !clipHips.has(name)) { carry = 0; return; }
  const body = hipYaw(thighs, root); // 지금 몸 방향 (펫 회전 포함)
  const planned = facing + (clipTurns.get(name) ?? 0) + clipHips.get(name);
  carry = THREE.MathUtils.clamp(wrapAngle(body - planned), -CARRY_MAX, CARRY_MAX);
}

// ---- 섞는 동안 몸 돌림도 섞는 비율에 맞추기 (2026-10-31 사용자, 비교 영상에서 B) ----
// 펫 회전은 평소 목표를 dt * 8로 따라가(0.2초에 80%) 동작 섞기와 빠르기가 다르다. 그래서
// - 총 자세로 이어 받으며 넘어갈 때(carry): 두 자세의 골반 방향 차이를 펫 회전이 먼저 메워 몸이 잠깐 돌았다 돌아왔다
//   (코타마 맨손 대기 → 무장 대기는 골반이 107° 달라 오른쪽으로 20° 돌았다 돌아옴, 각도 검사 52°)
// - 낮잠에서 깰 때(0.8초 섞기): 누운 몸과 떨어진 소품이 일어나기도 전에 크게 돌아 에리 모자가 창 오른쪽 끝 밖으로 0.1초 나갔다
// → 이 두 경우만 섞는 동안 펫 회전을 섞는 비율(0 → 1)에 맞춰 돌린다. 걷다 멈추며 돌기 같은 다른 돌기는 그대로.
// ?turnSync=0이면 예전처럼 (비교용)
const SYNC_TURN = new URLSearchParams(location.search).get('turnSync') !== '0';
let turnSync = null; // { t, fade, from }
function syncTurn(prev, fade) {
  turnSync = null;
  if (!SYNC_TURN || !prev || fade <= 0) return;
  const fromNap = clipKey(prev.getClip().name) === clipKey(resolve(clipName('nap')) ?? '');
  if (carry !== 0 || fromNap) turnSync = { t: 0, fade, from: pivot.rotation.y };
}

// 총 꺼내기(Public01)는 이어 받지 않고 펫이 정한 방향(정면 쪽)으로 돌며 시작한다 (2026-10-23 사용자).
// 이어 받으면 화면 안쪽으로 걷다가 총을 꺼낼 때 등을 보인 채 꺼내고 대기로 넘어가며 남은 만큼 휙 돌았다.
// 비교 창에서 지금 / 꺼내기 시작하며 돌기(이것) / 꺼내는 동안 천천히 돌기 / 먼저 맨손으로 돌아선 뒤 꺼내기를 보고 고름.
// 꺼내기 → 대기는 그대로 이어 받는다(꺼내기 끝 자세 그대로 대기). ?draw=carry면 예전처럼 이어 받음 (비교용)
const DRAW_CLIP = /^(Normal\d*_)?Public\d*$/i;
const drawTurns = new URLSearchParams(location.search).get('draw') !== 'carry';

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
  setViewShift(winX - x, winY - y);
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
    // stepFade: 숫자 하나 또는 단계마다(두 번째 동작부터)
    play(list[i++], { once: true, fade: i === 1 ? fade : Array.isArray(stepFade) ? stepFade[i - 2] ?? 0.2 : stepFade, onDone: next, again: i > 1 && !oldShot });
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

// 총 꺼내기는 서 있는 높이에서 시작하는 것만 쓴다. Eimi (Battle)·Otogi의 Public01은 큰 총을 안고 엎드린 자세(골반이 서 있을 때의 25%)에서
// 시작해 서 있다가 순간 엎드렸다 → 사용자 2026-10-29: 빼고 바로 무장 대기 (전투도 구호 없이 바로 전투 대기). 다른 학생은 80% 넘음
const DRAW_LOW = 0.6;
const drawClip = () => DRAW_WEAPON.filter(has).find((n) => !(liftOf(resolve(n)) < DRAW_LOW * (liftOf(resolve('Cafe_Idle')) ?? 0)));
const lowDraw = () => DRAW_WEAPON.some(has) && !drawClip();

function startArmed() {
  if (!has(ARMED_IDLE)) { toIdle(); return; }
  arm();
  playSequence([drawClip()].filter(Boolean)); // 없으면 바로 무장 대기
}

function armedIdle() {
  setState('armed');
  idleDuration = rand(3, 8);
  facing = calmFace();
  play(ARMED_IDLE);
}

// 장비 모습이 평소와 다른 동작은 뺀다 (Shiroko＊Terror Normal01_Callsign_Random은 드론이 나옴). 다 빠지면 원래대로
const calmList = (names) => { const ok = names.filter((n) => canPlay(n) && calmOk(n)); return ok.length ? ok : names; };
const armedFidget = () => { const name = pickRandom(calmList(ARMED_FIDGETS)); playSequence([name.endsWith('_Reload') ? reloadClip(name) : name]); };

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
const stanceClips = (st) => [stanceIdle(st), ...ATTACK_STEPS.map((step) => `${st}_${step}`)];
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
  const draw = wasArmed ? undefined : drawClip();
  if (draw) playSequence([draw], { onEnd });
  else if (!wasArmed && lowDraw()) onEnd(); // 낮은 자세에서 시작하는 총 꺼내기를 뺀 학생: 바로 전투 대기
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
    down: false,    // 엎드려 쏘기 학생이 엎드려 있는지 (proneStances)
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
  // 거치·엎드림 중이면 일어나서 승리 포즈: 낮은 자세에서 시작하는 FormRelease가 있으면 그것으로 일어나며 02를 풀고, 없으면 ReadyEnd
  const low = victory && lowered();
  const releaseUp = low && lowRelease();
  const getUp = low && !releaseUp ? standUp() : null;
  const rise = getUp ?? leaveSteps().map(resolve);
  battle = null;
  // 02 차림으로 끝났고 그 모습 그대로인 승리 포즈 짝이 있으면 그것으로 (수영복 호시노: 겉옷 벗은 Victory_*_Random).
  // 이름을 정해 두고 차림을 01로 돌린다 → 겉옷은 승리 포즈가 끝나고 대기로 돌아갈 때 다시 생김
  // 02 차림을 푸는 동작(FormRelease)이 있으면 그것 → 보통 승리 포즈 (Shiroko＊Terror: 상자 드론이 날아감. 없으면 승리 포즈에서 갑자기 사라졌음).
  // 02 모습 승리 포즈 짝도 있으면 둘 중 반반 (사용자 2026-10-24: Shiroko＊Terror 드론 단 Victory_*_Random / FormRelease → Victory)
  // 서 있는데 FormRelease가 낮은 자세에서 시작하면(Eimi: 엎드려 있다 일어남) 틀지 않는다 (틀면 순간 엎드림)
  const canRelease = victory && form === 2 && !getUp && has(FORM_RELEASE) && (releaseUp || !lowRelease());
  const formPairs = victory && !getUp && !releaseUp ? formVictoryPoses() : [];
  const pairs = releaseUp || (canRelease && Math.random() < 0.5) ? [] : formPairs;
  const steps = pairs.length ? [...rise, ...pickPair(pairs).map(resolve)] : null;
  const release = canRelease && !steps ? [resolve(FORM_RELEASE)]
    : victory && form === 2 && formChanges.has(2) ? [formChanges.get(2)] : []; // 방패를 넣고 (Hoshino (Battle))
  if (!keepForm) form = 1;
  lastBattleEnd = clock();
  if (victory) playSequence(steps ?? [...rise, ...release, ...victoryPose()], { onEnd: toIdle });
}

// 전투 자세 동작은 두 자세(자리)로 나뉜다: Attack_Ing·Attack_Delay는 "나간" 자세, Idle·Reload·Callsign·Move_End·EX는 "원래" 자세.
// Attack_Start가 나가는 동작, Attack_End가 돌아오는 동작이다. 학생·자세마다 그 차이가 다르다:
//   엄폐·무릎은 엄폐물 밖으로 0.3쯤 옆으로 나가고(시로코·호시노), 수영복 호시노 02 서서 쏘기는 몸을 낮추고(골반 0.33 → 0.15),
//   호시노 서서 쏘기는 거의 같다. 그래서 모든 자세에서 순서를 지킨다: 원래 자세 동작 앞엔 End, 나간 자세 동작 앞엔 Start
//   (안 지키면 순간이동하듯 튐. 사격마다 Start → Ing → End → Delay로 하면 일어섰다 → 튀며 앉음).
// 전투 대기는 엄폐·무릎이면 나간 자세의 Attack_Delay(Idle은 몸이 돌아가 있어 안 씀), 서서 쏘기면 원래 자세의 Normal_Idle
const aimsAtRest = (st) => stanceIdle(st) === `${st}_Attack_Delay`;
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
  play(stanceIdle(battle.stance), { fade: 0.2 });
}

// 다음 총 동작을 무작위로 고른다 (탄약이 떨어졌으면 재장전할 확률이 크게 오름)
function battleAction() {
  const reloads = canReload(battle.stance); // 재장전이 없는 차림(Hoshino (Battle) 01)은 탄약을 세지 않음
  const empty = reloads && battle.ammo <= 0;
  pickWeighted([
    [burst, empty ? 5 : 40],
    [reload, !reloads ? 0 : empty ? 60 : battle.ammo < MAGAZINE ? 25 : 8],
    [switchStance, settings.walk && otherStance(battle.stance) ? 12 : 0],
    [startRun, settings.walk ? 15 : 0],
    [callsign, hasCallsign(battle.stance) ? 10 : 0],
    [exSkill, exReady() ? 6 : 0], // 가끔 EX 스킬 (끝나면 전투 대기로)
    [deployGun, form === 1 && deployStances.has(battle.stance) ? 12 : 0],
    [undeployGun, lowered() ? 10 : 0],
    [changeForm, formChanges.has(form) && battle.until - clock() > CHANGE_LEFT * 1000 ? 10 : 0],
  ])();
}

// 사격 뒤(사격 → 사격, 사격 → 조준 대기)는 0.3초 섞는다 (2026-10-27 사용자). 예전 0.08초에는 Kurumi 사격 끝에 옆으로 휘날리던
// 머리카락·치마가 두 프레임 만에 내려앉고(52°) 바로 멈춘 조준 대기라 끊겨 보였음. 사격 대기 없이 사격 끝(Attack_End)으로 잇는 것과
// 비교 영상에서 고름. ?shoot=old면 예전처럼 (비교용)
const SHOT_FADE = 0.3;
const oldShot = new URLSearchParams(location.search).get('shoot') === 'old';

// 사격: 시작 → 사격 1~3번 → 끝 → 조준 대기
function burst(fixedShots) {
  if (!battle) { startBattle({ thenAttack: true }); return; }
  battle.ammo = Math.max(0, battle.ammo - 1);
  const shots = fixedShots ?? 1 + Math.floor(Math.random() * 3);
  const [start, ing, , delay] = ATTACK_STEPS.map((step) => `${battle.stance}_${step}`);
  // 엎드려 쏘기: 서 있으면 먼저 엎드린다 (ReadyStart) → 일어날 때까지 엎드린 채
  const lieDown = form === 2 && proneStances.has(battle.stance) && !battle.down;
  if (lieDown) { battle.down = true; battle.engaged = false; }
  const lead = [...(lieDown ? [`${battle.stance}_ReadyStart`] : []), ...(battle.engaged ? [] : [start])];
  const steps = [...lead, ...Array(shots).fill(ing), delay];
  battle.engaged = true;
  // 시작 → 사격은 이어지도록 만들어진 동작이라 짧게 섞는다
  const stepFade = oldShot ? 0.08 : [...lead.map(() => 0.08), ...Array(shots).fill(SHOT_FADE)];
  playSequence(steps, { face: battleFace(), stepFade });
}

function reload() {
  battle.ammo = MAGAZINE;
  playSequence([...toStanding(), reloadClip(`${battle.stance}_Reload`)], { face: battleFace() });
}

const callsign = () => (hasCallsign(battle.stance) ? playSequence([...toStanding(), `${battle.stance}_Callsign`], { face: battleFace() }) : rest());
// 전투 중 클릭 대답: 구호 / 재장전 무작위 (구호가 없는 자세·차림이면 재장전, 재장전이 없으면 구호)
const battleReply = () => (canReload(battle.stance)
  ? pickWeighted([[callsign, hasCallsign(battle.stance) ? 1 : 0], [reload, 1]]) : callsign)();

// 자세 바꾸기: 근처로 뛰어가 도착하며 다른 자세를 잡는다.
// Move_End_*는 뛰다가 멈추는 동작이라 제자리에서 틀면 제자리에서 몇 걸음 뛰는 것처럼 보인다.
const switchStance = () => startRun({ switchStance: true });

// 근처로 뛰어서 자리 옮기기 (가끔 뛰면서 구호, 가끔 중간에 구르기)
function startRun({ switchStance = false } = {}) {
  if (!has('Move_Ing')) { callsign(); return; }
  const getUp = lowered() ? standUp() : null; // 거치·엎드림 중이면 먼저 일어난다 (거치 자세 학생의 뛰기·도착 자세는 01)
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
  if (dist < 0.6) { if (getUp) playSequence(getUp, { face: battleFace(), onEnd: stoodUp(rest) }); else callsign(); return; }
  walkTarget.copy(target);
  battle.next = next;
  const shout = has(RUN_CALLSIGN) && fitsForm(RUN_CALLSIGN) && Math.random() < 0.3;
  runJumpAt = !shout && has('Move_Jump') && dist > 1.6 && Math.random() < 0.3 ? dist * 0.6 : null;
  const rise = getUp ?? leaveSteps();
  battle.engaged = false;
  if (rise.length) { playSequence(rise, { face: battleFace(), onEnd: stoodUp(() => run(shout)) }); return; } // 일어나고 나서 뛴다
  if (getUp) form = 1;
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

// ---- 거치 자세 (Otogi) ----
// 02가 EX로 바뀌는 차림이 아니라 앉아서 저격총을 받침대에 세운 자세인 학생. EX는 서서 끝나고, 02 대기(Normal_Idle02)가 없다.
// 01 대기 높이에서 시작해 02 사격 대기 높이로 앉는 ReadyStart(거치)와 그 반대 ReadyEnd(일어남)로 드나든다.
// 예전엔 다른 02 학생처럼 EX 뒤에 02로 가서 EX 끝(서 있음) → 02 사격(앉음), 02 사격 끝 → 01 대기·뛰기로 벌떡 튀었다.
// 사용자 2026-10-27(B): 전투 중 무작위로 거치 → 02로 쏘기·재장전 → 일어남. EX는 서서만. 뛰거나 전투가 끝나면 먼저 일어난다.
// Shun도 Ready 동작이 있지만 02 대기가 있고 EX가 02 자세로 끝나서 해당 없음 (Shun의 ReadyStart는 웅크려 앉는 다른 동작)
let deployStances = new Set();
const DEPLOY_NEAR = 0.15; // 골반 높이가 서 있을 때(카페 대기)의 이만큼 안이면 같은 높이로 봄
const liftOf = (name, end) => clipLifts.get(name)?.[end ? 1 : 0];
const nearLift = (a, b) => a !== undefined && b !== undefined && Math.abs(a - b) < DEPLOY_NEAR * (liftOf(resolve('Cafe_Idle')) ?? 0.35);
// 그 자세의 02 ReadyStart가 rest(서 있는 대기)에서 02 사격 대기 높이로 낮아지고, ReadyEnd가 그 반대인지
function lowersTo(st, rest) {
  const [start, end, delay] = [`${st}_ReadyStart`, `${st}_ReadyEnd`, `${st}_Attack_Delay`].map((n) => formName(n, 2));
  if (!start || !end || !delay || !rest) return false;
  return nearLift(liftOf(start), liftOf(rest)) && nearLift(liftOf(start, true), liftOf(delay)) && nearLift(liftOf(end), liftOf(delay))
    && !nearLift(liftOf(start), liftOf(delay));
}
function findDeployStances() {
  if (!forms.has(2) || variantForms || formName(ARMED_IDLE, 2)) return new Set();
  return new Set(STANCES.filter((st) => lowersTo(st, formName(STANCE_IDLE[st], 1))));
}
// 거치 중의 대기는 사격 대기 (02 Normal_Idle이 없어 01 서 있는 대기로 가면 벌떡 섬). 엎드려 쏘기도 엎드려 있는 동안은 같음
const stanceIdle = (st) => (form === 2 && (deployStances.has(st) || (proneStances.has(st) && battle?.down)) ? `${st}_Attack_Delay` : STANCE_IDLE[st]);
const deployed = () => Boolean(battle) && form === 2 && deployStances.has(battle.stance);
const lying = () => Boolean(battle?.down) && form === 2 && proneStances.has(battle.stance);
const lowered = () => deployed() || lying(); // 서서 하는 동작(뛰기·재장전·승리 포즈) 전에 일어나야 하는 자세
function deployGun() {
  const back = fromCover([]).map(resolve); // 나가 있으면 01 사격 끝 (이름을 01로 정해 둔다)
  form = 2;
  playSequence([...back, `${battle.stance}_ReadyStart`], { face: battleFace() });
}
// 일어나는 동작들: 나가 있으면 02 사격 끝 → ReadyEnd (02 이름). 거치 자세는 다 일어난 뒤에 차림을 01로 (stoodUp):
// 먼저 바꾸면 일어나는 중에 클릭한 재장전이 01(서서)로 골라져 앉은 채 벌떡 섰음. 엎드려 쏘기는 02 차림 그대로 (02 대기·재장전이 서 있음)
function standUp() {
  const steps = [...leaveSteps(), `${battle.stance}_ReadyEnd`].map(resolve);
  battle.engaged = false;
  battle.down = false;
  return steps;
}
const stoodUp = (then) => () => { if (battle && deployStances.has(battle.stance)) form = 1; then(); };
const undeployGun = () => playSequence(standUp(), { face: battleFace(), onEnd: stoodUp(rest) });
// 서서 하는 동작 앞: 엎드려 있으면 일어나고, 아니면 (나가 있으면) 돌아온다
const toStanding = () => (lying() ? standUp() : fromCover([]));

// ---- 엎드려 쏘기 (Eimi (Battle)) ----
// EX로 바뀐 02 차림에 서 있는 02 대기·재장전이 있고, 02 사격만 엎드린 자세(저격총에 받침대)인 학생. 02 사격 시작·끝은 0.1초짜리 엎드린 자세라
// 예전엔 02 대기(섬) → 0.1초 만에 엎드리고, 사격 끝 → 02 대기로 벌떡 섰다. 엎드림 ReadyStart·일어남 ReadyEnd로 드나든다.
// 사용자 2026-10-27(B, Otogi와 같은 방법): 한 번 엎드리면 엎드린 채 대기하며 여러 번 쏘고, 재장전·뛰기 전과 가끔 무작위로 일어난다.
// 전투가 엎드린 채 끝나면 FormRelease(엎드려 있다 일어나며 02를 푸는 동작)로 일어남, 서 있으면 FormRelease 없이 승리 포즈
let proneStances = new Set();
function findProneStances() {
  if (!forms.has(2) || variantForms) return new Set();
  return new Set(STANCES.filter((st) => STANCE_IDLE[st] !== `${st}_Attack_Delay` && lowersTo(st, formName(STANCE_IDLE[st], 2))));
}
const lowRelease = () => has(FORM_RELEASE) && !nearLift(liftOf(resolve(FORM_RELEASE)), liftOf(resolve('Cafe_Idle'))); // 낮은 자세에서 시작

const exVariants = () => exVariantsOf(Object.keys(clips), forms);
// EX가 있는지 (clipName('ex')는 없으면 아무 동작이나 돌려줘서 has()로 못 봄)
const hasEx = () => exVariants().length > 0 || has('Exs');
// 02로 바꾸는 EX: EX가 여럿인 02 차림 학생(Shiroko＊Terror Exs01~04)은 끝 모습(크기 0으로 숨긴 소품)이 02 전투 대기와 같은 것.
// Exs04는 상자 드론이 날아와 어깨 옆에 붙고, Exs01~03은 드론을 숨긴 채라 끝나고 02로 넘어가면 드론이 갑자기 생겼다 (사용자 2026-10-24)
let formEx = null;
function findFormEx(idle2) {
  const exs = (clipIndex.get(clipKey('Exs')) ?? []).map((c) => clips[c.name]);
  const idle1 = clipIndex.get(clipKey(ARMED_IDLE))?.find((c) => c.form === 1)?.name;
  if (!idle1 || !idle2 || exs.length < 2) return null;
  const [h1, h2] = [idle1, idle2].map((n) => hiddenPropsAt(clips[n], 0));
  const differ = [...new Set([...h1, ...h2])].filter((b) => h1.has(b) !== h2.has(b)); // 01·02 대기에서 보임이 다른 소품
  if (!differ.length) return null;
  const like2 = exs.filter((c) => { const h = hiddenPropsAt(c, c.duration); return differ.every((b) => h.has(b) === h2.has(b)); });
  return like2.length === 1 ? like2[0].name : null;
}
// 02 차림에만 보이는 소품(Shiroko＊Terror 상자 드론): 뼈 크기 0으로 숨겨서 모프로 보는 위 판정(clipsChangingParts)에 안 잡힌다.
// 카페 대기·01 전투 대기에서 숨기고 02 전투 대기에서 보이는 소품만 (수영복 호시노 방수 케이스는 01 전투에서도 보여서 아님).
// 그 소품이 보이는 동작 = 평소 모습과 다름(gearClips, 01 차림에서 피함: Victory_*_Random·Normal01_Callsign_Random은 드론이 나옴),
// 안 보이는 동작 = 02 모습과 다름(form2Off: 02로 끝난 전투는 드론 단 승리 포즈 짝을 고를 수 있게)
function markForm2Props(idle2) {
  const idle1 = clipIndex.get(clipKey(ARMED_IDLE))?.find((c) => c.form === 1)?.name;
  if (!idle1 || !idle2) return;
  const hidden2 = hiddenPropsAt(clips[idle2], 0);
  const cafe = clips[resolve('Cafe_Idle')];
  const only2 = [...hiddenPropsAt(clips[idle1], 0)].filter((b) => !hidden2.has(b) && (!cafe || hiddenPropsAt(cafe, 0).has(b)));
  if (!only2.length) return;
  for (const clip of Object.values(clips)) (only2.some((b) => showsProp(clip, b)) ? gearClips : form2Off).add(clip.name);
}
// 검사 도구용(sheet-check → check-student "02 차림과 모습이 같은 동작"): 02 차림 모습의 기준 동작과, 그것과 모습(큰 몸 조각·숨긴 소품)이 다른 동작들.
// 02 전투 대기가 없는 학생(Subaru: 02는 한 손 사격 8개뿐, 대기·재장전은 01)은 02 사격 대기를 기준으로.
// 소품은 01·02 사격 대기에서 보임이 다른 것만 본다 (재장전 첫 순간 탄창이 숨는 건 01 전투에서도 같음)
function form2Looks() {
  const idle2 = formName(ARMED_IDLE, 2);
  const stance = idle2 ? null : STANCES.find((st) => formName(`${st}_Attack_Delay`, 2) && formName(`${st}_Attack_Delay`, 1));
  const ref = idle2 ?? (stance && formName(`${stance}_Attack_Delay`, 2));
  if (!ref) return { ref: null, off: [] };
  if (ref === idle2) return { ref, off: [...form2Off] };
  const off = clipsChangingParts(modelRoot, Object.values(clips), ref);
  const [h1, h2] = [formName(`${stance}_Attack_Delay`, 1), ref].map((n) => hiddenPropsAt(clips[n], 0));
  const differ = [...new Set([...h1, ...h2])].filter((b) => h1.has(b) !== h2.has(b));
  for (const clip of Object.values(clips)) {
    const h = hiddenPropsAt(clip, 0);
    if (differ.some((b) => h.has(b) !== h2.has(b))) off.add(clip.name);
  }
  return { ref, off: [...off] };
}

// 02 차림이면 EX를 다시 쓰지 않는다 (사용자 2026-10-24: Shiroko＊Terror는 02에서 쓸 EX가 없음 — Exs04는 드론이 바닥에서 시작,
// Exs01~03은 드론을 숨김. 모든 02 차림 학생에게). 전투가 끝나 01로 돌아오면 다시 씀
// 차림을 FormChange 동작으로 바꾸는 학생(Hoshino (Battle))은 02에도 02 EX가 있어 그대로 씀
const exReady = () => hasEx() && (form !== 2 || formChanges.size > 0);
function exSkill() {
  // 나가 있으면 지금 차림 그대로 돌아온 뒤 EX (02로 먼저 바꾸면 01 사격 대기 → 02 사격 끝으로 섞여 자세가 크게 튐: Shun 무릎 01 → 02 엎드림)
  const back = fromCover([]).map(resolve);
  // 거치 자세 학생은 EX가 서서 끝나 01 그대로, 차림을 FormChange로 바꾸는 학생은 EX가 차림을 안 바꿈
  const toForm2 = battle && forms.has(2) && !deployStances.size && !formChanges.size;
  if (toForm2) form = 2;
  const variants = exVariants();
  const ex = toForm2 && formEx ? formEx : variants.length ? pickRandom(variants) : 'ex';
  playSequence([...back, ex, ...(exAfters.get(ex) ?? [])], { face: battleFace(), as: 'ex' });
}

// ---- 차림 바꾸기 (Hoshino (Battle)) ----
// 01(공격형, 총만)과 02(탱커형, 방패 뒤)를 편성 화면 동작 Formation_FormChange_*로 오가는 학생: 01_Formation_FormChange_Attacker는
// 총을 든 채 방패를 꺼내 02 모습으로, 02_Formation_FormChange_Tanker는 방패를 넣고 01 모습으로 끝난다.
// → 그 차림에 있는 FormChange 동작이 다른 차림으로 바꾼다. 전투 중 무작위로 바꾸고, EX는 지금 차림의 것.
// 02로 끝난 전투는 FormChange로 방패를 넣은 뒤 승리 포즈 (조사 295개 중 이 학생뿐).
// 사용자 2026-10-30: 비교 영상(A 01만 / B EX 뒤 02 / C 이것 / D 더블클릭 EX를 쓰면 반대 차림으로)에서 C.
// B는 방패가 EX 시작에 갑자기 나오고 승리 포즈에서 갑자기 사라졌음
const FORM_CHANGE = /^formation_formchange_/;
const CHANGE_LEFT = 8; // 전투가 이만큼(초) 넘게 남았을 때만 바꾼다 (방패를 꺼내자마자 전투가 끝나 바로 다시 넣었음)
let formChanges = new Map(); // 차림 번호 → 그 차림에서 다른 차림으로 바꾸는 동작
function findFormChanges() {
  const out = new Map();
  if (!forms.has(2) || variantForms) return out;
  for (const [key, list] of clipIndex) if (FORM_CHANGE.test(key)) for (const c of list) out.set(c.form, c.name);
  return out.has(1) && out.has(2) ? out : new Map();
}
function changeForm() {
  const to = form === 1 ? 2 : 1;
  playSequence([...fromCover([]).map(resolve), formChanges.get(form)], { face: battleFace(), onEnd: () => { form = to; rest(); } });
}

// EX가 바꾼 자세를 푸는 동작 (02 차림이 없는 학생): 히나(드레스)는 EX마다 Exs0N_Idle(그 자세로 대기)·Exs0N_FormRelease(풀기),
// 수영복 미카는 Exs03(0.17초, 후광을 키우고 날개를 편 자세) → 번호 없는 FormRelease. EX가 웅크리거나 날개를 편 채 끝나서
// 바로 전투 대기로 가면 0.2초 만에 자세가 확 바뀌었음 → EX 끝 자세에서 이어지는 대기·풀기를 EX 뒤에 붙인다 (2026-10-30)
// 이어지는지는 이름이 아니라 자세로 본다(수영복 미카 FormRelease는 Exs01·Exs02 끝과 뼈 회전 평균 21~24° 차이, Exs03 끝과 0.1°)
let exAfters = new Map(); // EX 이름 → 뒤에 이어 트는 동작들
const POSE_JOIN = THREE.MathUtils.degToRad(3);
function posesJoin(a, b) { // a 끝 자세와 b 첫 자세의 뼈 회전 차이 평균이 POSE_JOIN 안
  const ends = new Map(clips[a].tracks.filter((t) => t.name.endsWith('.quaternion')).map((t) => [t.name, t]));
  const [qa, qb] = [new THREE.Quaternion(), new THREE.Quaternion()];
  let sum = 0, n = 0;
  for (const t of clips[b].tracks) {
    const u = ends.get(t.name);
    if (!u) continue;
    sum += qa.fromArray(u.createInterpolant().evaluate(clips[a].duration)).angleTo(qb.fromArray(t.createInterpolant().evaluate(0)));
    n++;
  }
  return n > 0 && sum / n < POSE_JOIN;
}
function findExAfters() {
  const out = new Map();
  if (forms.has(2)) return out;
  for (const ex of exVariants()) {
    const idle = clips[`${ex}_Idle`] && posesJoin(ex, `${ex}_Idle`) ? [`${ex}_Idle`] : [];
    const release = [`${ex}_FormRelease`, resolve(FORM_RELEASE)].find((n) => clips[n] && posesJoin(idle[0] ?? ex, n));
    if (!release) continue;
    out.set(ex, [...idle, release]);
    // 짝처럼 EX와 같은 방향 보정 (따로면 넘어갈 때 몸이 돎. 대기·풀기는 원래 호시노에 없어 보정이 없음)
    for (const n of [...idle, release]) if (clipTurns.has(ex)) clipTurns.set(n, clipTurns.get(ex)); else clipTurns.delete(n);
  }
  return out;
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
  if (armed) { playSequence([pickRandom(calmList(ARMED_REACTIONS))]); return; }
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
        // 내려놓으면 잠깐 무장도 끝내고 평소 대기로 (2026-10-30 사용자). 무장 대기로 돌아가면 들어 올리는 동작과 골반 방향이 크게 다른
        // 학생(Toki 97°)은 섞이는 동안 몸이 58° 휙 돌았다
        lift = 0;
        armed = null;
        toIdle({ fade: 0.15 });
      }
      break;
  }
  placeWindow();
  fillTransitionLogs();
  // 방향 전환과 자세 보정을 부드럽게 (섞는 동안 맞춰 도는 경우는 syncTurn)
  const turnTo = facing + clipTurn() + carry; // clipTurn: 학생별 동작 방향 차이 보정
  if (turnSync) {
    turnSync.t += dt;
    const w = Math.min(1, turnSync.t / turnSync.fade);
    pivot.rotation.y = turnSync.from + wrapAngle(turnTo - turnSync.from) * w;
    if (w >= 1) turnSync = null;
  } else {
    pivot.rotation.y += wrapAngle(turnTo - pivot.rotation.y) * Math.min(1, dt * 8);
  }
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
  if (battle) { endBattle(); arm(); } // 집어 들면 전투는 끝 (들고 있는 동안은 총을 든 무장 상태, 내려놓으면 평소)
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
  if (isDouble && state !== 'nap' && hasEx()) {
    lastInteraction = now;
    doubleClickEx();
  } else {
    react();
  }
}

// 더블클릭: 첫 클릭의 반응을 끊고 EX 스킬. 전투 모드로 이어진다 (구호 없이 바로 EX)
function doubleClickEx() {
  if (!exReady()) { react(); return; } // 02 차림이면 EX 대신 보통 클릭처럼 (구호·재장전)
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

// 커서 밑 픽셀이 투명한지. 예전엔 바로 읽어서(readPixels) GPU가 다 그릴 때까지 프레임마다 4~7ms 기다렸다
// (Intel 내장 GPU, tools/perf-check.js의 hit). 이제 GPU 버퍼로 읽어 두고 다 그려졌을 때(fence) 꺼내 쓴다 → 1~2프레임 늦게 바뀜
const hitRead = { buf: null, sync: null };
// 마우스가 잠깐 창 밖으로 잡혀도(바탕화면에서는 통과 중 mouseleave가 자주 옴) 읽던 것은 버리지 않는다.
// 버리면 다 읽기 전에 계속 새로 시작해서 한 번도 "몸 위"가 안 나왔음(2026-10-20 클릭·끌기 안 됨)
function hitTest() {
  const gl = renderer.getContext();
  let hit = mouse ? hovering : false;
  if (hitRead.sync) {
    if (gl.clientWaitSync(hitRead.sync, 0, 0) === gl.TIMEOUT_EXPIRED) return hit; // 아직 그리는 중
    gl.deleteSync(hitRead.sync);
    hitRead.sync = null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, hitRead.buf);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixelBuf);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); // 묶인 채 두면 다른 readPixels(창 끝 검사 measureEdges)가 실패해 빈 값이 됨
    hit = false;
    for (let i = 3; mouse && i < pixelBuf.length; i += 4) {
      if (pixelBuf[i] > 16) { hit = true; break; }
    }
  } else if (!hitRead.buf) {
    hitRead.buf = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, hitRead.buf);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, pixelBuf.byteLength, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  }
  // 다음 읽기: 렌더 직후에 해야 픽셀이 남아 있다
  if (!mouse) return false;
  const dpr = renderer.getPixelRatio();
  const px = Math.floor(mouse.x * dpr) - 2;
  const py = Math.floor((canvas.clientHeight - mouse.y) * dpr) - 2;
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, hitRead.buf);
  gl.readPixels(px, py, 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, 0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  hitRead.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  return hit;
}

function updateMousePassthrough() {
  hovering = drag ? true : hitTest();
  if (ignoringMouse === hovering) {
    ignoringMouse = !hovering;
    bridge.setIgnoreMouse(ignoringMouse);
  }
  canvas.style.cursor = drag?.moved ? 'grabbing' : hovering ? 'grab' : 'default';
}

// ---- 메인 루프 (항상 60fps) ----
// 예전엔 대기·낮잠을 30fps로 그렸는데 숨쉬기·흔들림이 뚝뚝 끊겨 보였음(2026-10-20 사용자: 렉 걸린 느낌).
// 한 프레임 CPU가 1~2ms라(tools/perf-check.js) 늘 60fps로 그려도 부담이 적다. 주사율이 더 높은 모니터에서도 60fps까지만
const TARGET_FPS = 60;
let lastFrame = performance.now();
let speed = 1; // 느린 재생 (__pet.timeScale)
function frame(now) {
  requestAnimationFrame(frame);
  if (now - lastFrame < 1000 / TARGET_FPS - 2) return;
  const dt = Math.min((now - lastFrame) / 1000, 0.1) * speed;
  lastFrame = now;

  if (renderer.getPixelRatio() !== window.devicePixelRatio) layout(); // 배율이 다른 모니터로 옮겨졌을 때
  const t0 = performance.now();
  update(dt);
  mixer.update(dt);
  const t1 = performance.now();
  updateHiddenParts();
  updateOutlines();
  updateRope(); // 손 위치는 이번 프레임 자세로
  updateShadow(dt);
  const t2 = performance.now();
  renderer.render(scene, camera);
  const t3 = performance.now();
  updateMousePassthrough();
  perfLog?.push({ at: now, state, clip: currentAction?.getClip().name, wx: winX, wy: winY, anim: t1 - t0, extra: t2 - t1, render: t3 - t2, hit: performance.now() - t3 });
}
let perfLog = null; // 성능 재기 (tools/perf-check.js): __pet.perfStart() → __pet.perfStop()

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
  get outfit() { return cafeOutfit && (wearCafe ? 'cafe' : 'battle'); }, // 카페 차림 학생(Toki 등)이 지금 입은 옷
  get yaw() { return Math.round(THREE.MathUtils.radToDeg(pivot.rotation.y)); }, // 실제로 돌아가 있는 각도(도)
  get clipTurns() { return Object.fromEntries([...clipTurns].map(([n, r]) => [n, Math.round(THREE.MathUtils.radToDeg(r))])); },
  get victoryPoses() { return victoryPoses(); },
  get exVariants() { return exVariants(); },
  get exAfters() { return Object.fromEntries(exAfters); },
  get formEx() { return formEx; },
  get forms() { return [...forms]; },
  get gearClips() { return [...gearClips]; },
  get form2Off() { return [...form2Off]; },
  form2Looks,
  get clipEnds() { return Object.fromEntries([...clipEnds].map(([n, v]) => [n, [+v.x.toFixed(3), +v.z.toFixed(3)]])); },
  get clipHeads() { return Object.fromEntries([...clipHeads].map(([n, r]) => [n, Math.round(THREE.MathUtils.radToDeg(r))])); },
  get clipFronts() { return Object.fromEntries([...clipFronts].map(([n, r]) => [n, Math.round(THREE.MathUtils.radToDeg(r))])); },
  get deployStances() { return [...deployStances]; },
  get proneStances() { return [...proneStances]; },
  get clipLifts() { return Object.fromEntries([...clipLifts].map(([n, v]) => [n, v.map((y) => +y.toFixed(3))])); },
  get clipHips() { return Object.fromEntries([...clipHips].map(([n, r]) => [n, Math.round(THREE.MathUtils.radToDeg(r))])); },
  set timeScale(f) { speed = f; }, // 동작 확인용 느린 재생 (몸 돌리기도 같이 느려짐)
  perfStart() { perfLog = []; },
  perfStop() { const log = perfLog; perfLog = null; return log; },
  // 동작 확인용: 상태 머신을 멈추고(state 'pose') 이 동작만 반복
  pose(name, { face = FACE_FRONT, height = 0 } = {}) { endBattle(); armed = null; drag = null; setState('pose'); facing = face; lift = height; play(name); },
  get armed() { return armed && { left: Math.round((armed.until - clock()) / 1000) }; },
  armFor(seconds) { endBattle(); startArmed(); if (armed) armed.until = clock() + seconds * 1000; },
  get battle() { return battle && { ...battle, form, left: Math.round((battle.until - clock()) / 1000) }; },
  // stance: 시험용으로 전투 자세 고정 ('Normal' | 'Stand' | 'Kneel', 그 학생에게 있을 때)
  // 사격 녹화용: 전투 중 사격 shots번. side(±1)를 주면 그쪽을 겨눔 (yaw: 몸을 그 각도(도)로 돌려 두고 시작 → 이어 받기로 유지)
  fire(shots, side, yaw) { if (!battle) return; if (side) { battle.side = side; battle.aim = aimFace(side); facing = battleFace(); carry = 0; pivot.rotation.y = yaw === undefined ? facing + clipTurn() : THREE.MathUtils.degToRad(yaw); } burst(shots); },
  battleFor(seconds, stance) {
    endBattle(); startBattle();
    if (!battle) return;
    battle.until = clock() + seconds * 1000;
    if (stance && stanceReady(stance)) battle.stance = stance;
  },
  run() { if (battle) startRun(); }, // 전투 중 뛰어서 자리 옮기기
  deploy() { if (battle && form === 1 && deployStances.has(battle.stance)) deployGun(); }, // 거치 자세 학생: 바로 거치
  changeForm() { if (battle && formChanges.has(form)) changeForm(); }, // FormChange 학생: 바로 차림 바꾸기
  get formChanges() { return Object.fromEntries(formChanges); },
  win() { if (battle) battle.until = 0; }, // 전투 대기로 돌아오면 바로 승리 포즈로 끝냄
  // 영상 녹화용: 상태 머신과 시계를 dt초 진행하고 바로 그린다 (화면 밖 창은 rAF가 멈춰 있을 수 있음. timeScale = 0과 같이)
  step(dt) {
    clockAhead += dt * 1000;
    update(dt);
    mixer.update(dt);
    updateHiddenParts();
    updateOutlines();
    updateRope();
    updateShadow(dt);
    renderer.render(scene, camera);
  },
  // 각도 비교용: 그 자세로 side(±1)쪽을 겨눌 때 펫이 정할 방향(도, 무작위 흔들기 없이)
  battleFaceOf: (side, stance) => Math.round(THREE.MathUtils.radToDeg(showFace(side * FACE_BATTLE, stanceClips(stance)))),
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
  [() => { if (state !== 'ex' && state !== 'nap' && hasEx()) clicked(doubleClickEx); }, 15], // 02 차림이면 클릭 대답
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
  // 발가락 뼈(Toe0)가 없는 모델도 있음(289개 중 18개, 모모이·미도리·후부키 등) → 발끝 방향(dir)만 빼고 잰다
  // (예전엔 null을 돌려 각도·창 끝 검사가 아무것도 안 재고 ok였음, 2026-10-30)
  if ([...hips, ...feet.map(([foot]) => foot)].some((b) => !b)) return null;
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
        if (toe) root.worldToLocal(toe.getWorldPosition(b));
        return { x: +a.x.toFixed(4), z: +a.z.toFixed(4), h: +a.y.toFixed(4), dir: toe ? +deg(Math.atan2(b.x - a.x, b.z - a.z)).toFixed(1) : null };
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
    ...STANCES.flatMap(stanceAll), ...RELOAD_VARIANTS, ...BATTLE_ENTRY, ...[drawClip()].filter(Boolean), RUN_CALLSIGN, ...VICTORIES.flat(), ...OTHER_CLIPS, ...exVariants(), ...[...exAfters.values()].flat()];
  const keep = form;
  const out = new Set();
  for (const f of forms) {
    form = f;
    for (const n of names) if (canPlay(n)) out.add(resolve(n));
  }
  form = keep;
  // 02로 바꾸는 EX가 따로 있으면 02 차림 EX 이름(Shiroko＊Terror Exs02)은 안 씀 (02에서는 EX를 안 씀)
  if (formEx) for (const c of clipIndex.get(clipKey('Exs')) ?? []) if (c.form !== 1) out.delete(c.name);
  if (formEx) out.add(formEx);
  for (const st of [...deployStances, ...proneStances]) for (const n of [`${st}_ReadyStart`, `${st}_ReadyEnd`, `${st}_Attack_Delay`]) out.add(formName(n, 2));
  for (const n of formChanges.values()) out.add(n);
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
  const raw = used.filter((n) => !/^vital_retreat/.test(clipKey(n))).map((n) => [n, clipStats(n, 1)]).filter(([, x]) => x);
  const highs = raw.filter(([n]) => !/kneel/.test(clipKey(n))).map(([, x]) => x.rise).sort((a, b) => a - b);
  const standHip = highs[Math.floor(highs.length / 2)] ?? 1;
  const r2 = (v) => Math.round(v * 100) / 100;
  for (const [name, x] of raw) { // 밧줄에 매달려 올라가는 종료(Vital_Retreat)는 원래 뜨므로 뺐음
    const rise = x.rise / standHip, far = x.far / standHip;
    if (rise > PICK_RISE) add(name, `몸이 크게 뜸 (골반이 서 있을 때의 ${r2(rise)}배 높이)`);
    if (/^vital_death/.test(clipKey(name)) && far > PICK_FAR) add(name, `쓰러질 때 ${x.farPart}이(가) 몸에서 멀리 떨어짐 (골반 높이의 ${r2(far)}배)`);
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
    add(formOf.get(idle2) === 2 ? idle2 : form2[0], deployStances.size ? `거치 자세 (전투 중 무작위로 앉아서 거치, 02 동작 ${form2.length}개)`
      : `02 차림 (전투 중 ${formChanges.size ? 'FormChange로 무작위로' : 'EX 뒤에'} 바뀜, 02 동작 ${form2.length}개${proneStances.size ? ', 엎드려 쏘기' : ''})`);
  }
  if (variantForms) for (const n of used) if (formOf.get(n) === 2) add(n, '02 변형 (01과 무작위로 섞음, 짝은 같은 번호끼리)');
  window.__pet.reset();
  return [...out].map(([clip, why]) => ({ clip, why }));
}

// 동작 하나를 혼자 틀 때 쓸 기록 (measureTransition alone): 그 동작이 나올 만한 방향으로.
// 평소 동작은 정면 쪽 15°, 총·EX는 45°, 걷기·뛰기는 70°, 낮잠은 펫과 같은 방향·자리(startNap), 집어 들기는 들린 높이
function poseRec(name, face = null) {
  const formOf = [...clipIndex.values()].flat().find((c) => c.name === name)?.form ?? 1;
  const key = clipKey(name);
  face ??= THREE.MathUtils.degToRad(/^(cafe_walk|move_ing|move_callsign|move_jump)/.test(key) ? 70
    : /^(normal|stand|kneel|move_end|exs)|public/.test(key) ? 45 : 15);
  const rec = { to: name, toLoop: false, faceAfter: face, yawBefore: face, form: formOf, fade: 0,
    lift: /^formation_pickup/.test(key) ? DRAG_LIFT : 0, pivotPos: [0, 0, 0], pivotTarget: [0, 0, 0] };
  if (/^vital_death/.test(key)) {
    rec.faceAfter = rec.yawBefore = FACE_NAP;
    const end = clipEnds.get(name);
    const t = NAP_OFFSET.clone().add(NAP_BODY.clone().applyAxisAngle(UP, FACE_NAP));
    if (end) t.sub(end.clone().applyAxisAngle(UP, FACE_NAP + (clipTurns.get(name) ?? 0)));
    rec.pivotTarget = rec.pivotPos = t.toArray();
  }
  return rec;
}

// 동작 시트 (tools/check-student.js): 동작마다 한 줄, 고르게 frames장. 그 동작이 나올 만한 방향으로 혼자 틀어 그린다
// 창에서 가운데 60%·아래 2.24단위만 (위쪽은 날아오르는 EX 말고는 비어 있음. 창을 위로 늘려도 시트 그림은 그대로)
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
  const sh = src.height * Math.min(1, 2.24 / VIEW_HEIGHT);
  const [sx, sw, sy] = [src.width * 0.2, src.width * 0.6, src.height - sh];
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
  const [W, H] = (q.get('window') ?? '862x732').split('x').map(Number);
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
