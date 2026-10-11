import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DesktopFloor } from './floor.js';
import { hiddenPartsUpdater } from './hidden-parts.js';
import { addOutlines } from './outline.js';
import { measureClips } from './clip-facing.js';

// ---- 화면 구성 ----
const VIEW_HEIGHT = 1.3;                         // 창 높이에 들어갈 월드 단위 높이
const TILT = THREE.MathUtils.degToRad(12);       // 카페처럼 살짝 위에서 내려다보는 각도
const FOOT_MARGIN = 0.03;                        // 발밑 여백 (월드 단위)
const FACE_FRONT = 0;
const FACE_BATTLE = THREE.MathUtils.degToRad(60); // 전투 동작은 옆을 보도록 만들어져 있어서 카메라 쪽으로 돌림
const FACE_SPREAD = THREE.MathUtils.degToRad(30);   // 평소 동작은 정면에서 이만큼 안쪽 아무 방향
const BATTLE_SPREAD = THREE.MathUtils.degToRad(20); // 전투·EX는 FACE_BATTLE에서 이만큼 안쪽 아무 방향
const RUN_SPREAD = THREE.MathUtils.degToRad(15);    // 전투 중 자리 옮기기: 도착해서 볼 방향에서 이만큼 흔들어 뛴다
const HEAD_LIMIT = THREE.MathUtils.degToRad(45); // 얼굴이 카메라에서 이보다 돌아가면 그만큼 몸을 돌려 얼굴이 보이게
const HEAD_FIX_MAX = THREE.MathUtils.degToRad(30); // 동작 하나 때문에 더 돌리는 건 이만큼까지 (재장전·구호 때 몸이 휙 돌지 않게)
const FACE_NAP = THREE.MathUtils.degToRad(58);    // 뒤로 눕는 동작을 옆으로 눕는 것처럼 보이게
const NAP_OFFSET = new THREE.Vector3(0.33, 0.08, 0.1); // 누운 몸이 창 가운데 바닥에 오도록

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
let currentAction = null;
const weaponMeshes = [];

// 동작 이름 목록. 학생마다 없는 동작이 있으니 앞에서부터 있는 것을 쓴다.
const ANIM = {
  idle: ['Cafe_Idle', 'Normal_Idle', 'Formation_Idle'],
  walk: ['Cafe_Walk', 'Move_Ing'],
  pickup: ['Formation_Pickup', 'Victory_Start', 'Cafe_Reaction'], // 편성 화면에서 학생을 집어 들었을 때 동작
  nap: ['Vital_Death'],
  wake: ['Cafe_Reaction'],
  ex: ['Exs'],
};
// 클릭 반응: 카페 반응 / 승리 포즈 무작위 (학생마다 승리 포즈에 총을 드는 경우가 있어 그때는 총이 0.25초 만에 생김)
const REACTIONS = ['Cafe_Reaction', 'Victory_Start'];
// 총을 든 동작들. 맨손 ↔ 총 든 동작을 넘나들 때마다 총이 0.25초 만에 생기고 사라지므로, 무장 중에 몰아서 쓴다
const ARMED_IDLE = 'Formation_Idle';
// 승리 포즈는 넣지 않는다(무장은 총을 들고 있어 전투처럼 보여서, 전투 중간에 승리 포즈가 나오는 것처럼 보였음). 승리 포즈는 평소·전투 끝에
// 구호·재장전은 카페 동작이 있는 모델 265개 중 약 177개, Rearrange_*는 2~3개에만 있음
const ARMED_FIDGETS = ['Normal_Callsign', 'Normal_Callsign_Random', 'Normal_Reload', 'Rearrange_Idle'];
const ARMED_REACTIONS = ['Normal_Callsign', 'Normal_Callsign_Random', 'Rearrange_Reaction'];
// 전투 자세: 서서 쏘기(Normal) / 방패 뒤에 숨어 쏘기(Stand) / 무릎 꿇고 쏘기(Kneel). 학생마다 있는 자세만 쓴다
// 공격 한 번은 시작 → 사격 → 끝 → 대기 순서로 이어야 자연스럽다
const STANCES = ['Normal', 'Stand', 'Kneel'];
// 자세별 전투 대기 동작. Stand_Idle은 쓰지 않는다(방패 데이터가 없어 허공을 보고 돌아선 것처럼 보임) → 조준 대기로 대신
// Kneel_Idle도 몸이 쏘는 방향과 90°쯤 어긋나 왼쪽을 볼 때 등만 보인다 → 마찬가지로 조준 대기로 대신
const STANCE_IDLE = { Normal: 'Normal_Idle', Stand: 'Stand_Attack_Delay', Kneel: 'Kneel_Attack_Delay' };
const ATTACK_STEPS = ['Attack_Start', 'Attack_Ing', 'Attack_End', 'Attack_Delay'];
const BATTLE_ENTRY = ['Normal_Callsign'];
// 총 꺼내기: 빈손으로 손짓하다가 끝에 총을 꺼내 드는 동작(Public01, 수영복 호시노는 Normal01_Public01). 약 190개 모델에 있음.
// 맨손에서 무장·전투로 넘어갈 때 틀면 총이 갑자기 나타나지 않는다. 총을 든 상태에서 틀면 총이 사라졌다 다시 나타나므로 맨손일 때만
const DRAW_WEAPON = ['Public', 'Normal_Public'];
const RUN_CALLSIGN = 'Move_Callsign'; // 뛰면서 하는 구호. 제자리에서 틀면 제자리 뛰기가 되므로 실제로 뛸 때만 쓴다
const VICTORY = ['Victory_Start', 'Victory_End'];

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

async function loadModel() {
  const data = await bridge.readModel();
  const buffer = data instanceof ArrayBuffer
    ? data
    : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buffer, '');

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
  indexClips();
  ({ turns: clipTurns, heads: clipHeads } = measureClips(gltf.scene, gltf.animations, (n) => n.replace(FORM_NUMBER, '$1').toLowerCase()));
  mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.addEventListener('finished', (e) => {
    const cb = doneCallbacks.get(e.action);
    if (!cb || e.action !== currentAction) return;
    doneCallbacks.delete(e.action);
    cb();
  });
}

// 학생마다 동작 이름이 조금씩 다르다: 대소문자(Vital_Dying_ing), 차림 번호(수영복 호시노 Normal_Idle01/02, Normal_Attack01_Start,
// 다른 학생 Normal01_Attack_End, Move01_Ing, Exs01 …). 글자 바로 뒤에 붙은 01·02를 차림 번호로 보고 떼어 낸 소문자 이름으로 묶어 두고,
// 코드에서는 번호 없는 이름(Normal_Idle)으로 부르면 지금 차림의 것을 고른다 (없으면 01, 그것도 없으면 아무거나)
const FORM_NUMBER = /([a-z])0(\d)/gi;
let clipIndex = new Map(); // 묶은 이름 → [{ name, form }]
let forms = new Set();     // 이 모델에 있는 차림 번호들
function indexClips() {
  clipIndex = new Map();
  forms = new Set([1]);
  for (const name of Object.keys(clips)) {
    let number = 1;
    const key = name.replace(FORM_NUMBER, (_, ch, n) => { number = Number(n); return ch; }).toLowerCase();
    clipIndex.set(key, [...(clipIndex.get(key) ?? []), { name, form: number }]);
    forms.add(number);
  }
}
let form = 1; // 지금 차림 번호. 전투 중 EX를 쓰면 2, 전투가 끝나면 1
const currentForm = () => form;
function resolve(name) {
  if (!name || clips[name]) return name;
  const list = clipIndex.get(name.replace(FORM_NUMBER, '$1').toLowerCase());
  if (!list) return undefined;
  return (list.find((c) => c.form === currentForm()) ?? list.find((c) => c.form === 1) ?? list[0]).name;
}
const has = (name) => Boolean(resolve(name));
const clipTurn = () => clipTurns.get(currentAction?.getClip().name) ?? 0;
// 지금 차림에 맞는 동작인지: 01 차림이면 다 맞고, 02 차림이면 02 번호가 붙은 것만
// (번호 없는 동작은 01 차림 모습이라 02 차림 중에 틀면 벗은 겉옷이 다시 나타난다. 예: 수영복 호시노 Normal_Callsign)
const fitsForm = (name) => currentForm() === 1
  || Boolean(clipIndex.get(name.replace(FORM_NUMBER, '$1').toLowerCase())?.some((c) => c.form === currentForm()));
const first = (names) => names.find(has) ?? Object.keys(clips)[0];
const clipName = (name) => (ANIM[name] ? first(ANIM[name]) : name);

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
  shadow.scale.set(s * (state === 'nap' ? 2.2 : 1), s, 1);
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
let lastInteraction = performance.now();

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
function playSequence(names, { face = calmFace(), fade = 0.25, stepFade = 0.2, as = 'action', onEnd = rest } = {}) {
  const list = names.map(clipName).filter(has);
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
const wakeUp = () => playSequence(['wake'], { fade: 0.8, onEnd: toIdle });

function startNap() {
  if (!has(clipName('nap'))) { fidget(); return; }
  setState('nap');
  napDuration = rand(20, 45);
  facing = FACE_NAP;
  pivotTarget.copy(NAP_OFFSET);
  play('nap', { once: true, fade: 0.3 });
}

// ---- 잠깐 무장 ----
let armed = null;                  // { until }
const arm = () => { armed = { until: performance.now() + rand(...ARMED_TIME) * 1000 }; };

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

const armedFidget = () => playSequence([pickRandom(ARMED_FIDGETS)]);

function chooseArmedBehavior() {
  if (performance.now() > armed.until) { armed = null; toIdle(); return; }
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
const battleReady = () => (performance.now() - lastBattleEnd) / 1000 > BATTLE_COOLDOWN;
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
    until: performance.now() + rand(...BATTLE_TIME) * 1000,
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
  const rise = leaveSteps(); // 무릎·엄폐 자세면 일어나고 나서 승리 포즈
  battle = null;
  if (!keepForm) form = 1;
  lastBattleEnd = performance.now();
  if (victory) playSequence([...rise, ...VICTORY], { onEnd: toIdle });
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
  if (performance.now() > battle.until) { endBattle({ victory: true }); return; }
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
  playSequence(fromCover([`${battle.stance}_Reload`]), { face: battleFace() });
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

// EX를 쓰면 차림이 바뀌는 학생이 있다(수영복 호시노: 겉옷을 벗고 고래 튜브를 듦 = 02 동작들)
// → 전투 중에 EX를 쓰면 전투가 끝날 때까지 02 차림 동작을 쓴다 (02가 없는 학생은 그대로 01)
function exSkill() {
  if (battle && forms.has(2)) form = 2;
  playSequence(fromCover(['ex']), { face: battleFace(), as: 'ex' });
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
  lastInteraction = performance.now();
  if (state === 'nap') { wakeUp(); return; }
  if (battle) { battleReply(); return; } // 전투 중에는 구호나 재장전으로 대답하고 계속 싸운다
  playSequence([pickRandom(armed ? ARMED_REACTIONS : REACTIONS)]);
}

// 승리 포즈: 전투가 끝날 때 말고도 평소에 가끔
const cheer = () => playSequence(VICTORY);

// 대기 시간이 끝나면 다음 행동을 가중치로 고른다
function chooseNextBehavior() {
  const idleMinutes = (performance.now() - lastInteraction) / 60000;
  pickWeighted([
    [startWalk, settings.walk ? 40 : 0],
    [startArmed, 20],
    [startBattle, battleReady() ? 8 : 0],
    [cheer, has(VICTORY[0]) ? 8 : 0],
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
  switch (state) {
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
      if (performance.now() > battle.until) endBattle({ victory: true }); // 시간이 다 되면 대기 중 바로 마무리
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
  // 방향 전환과 자세 보정을 부드럽게
  pivot.rotation.y += wrapAngle(facing + clipTurn() - pivot.rotation.y) * Math.min(1, dt * 8); // clipTurn: 학생별 동작 방향 차이 보정
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
    lastInteraction = performance.now();
    // 잡은 지점과 발 사이의 거리를 캐릭터 크기 기준으로 기억 → 멀어져 작아져도 같은 곳을 잡고 있음
    const s = floor.toScreen(pos.x, pos.z, lift);
    const unit = floor.pxNear * s.scale;
    drag.offset = { x: (drag.start.x - s.x) / unit, y: (drag.start.y - s.y) / unit };
    if (battle) { endBattle(); arm(); } // 집어 들면 전투는 끝 (총은 든 채로 무장 상태)
    setState('drag');
    facing = FACE_FRONT;
    play('pickup', { fade: 0.15 }); // 들고 있는 동안 반복
  }
});

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
  const now = performance.now();
  const isDouble = now - lastClickAt < 350;
  lastClickAt = isDouble ? 0 : now;
  if (state === 'ex') return; // EX 스킬은 끝까지 보여준다
  if (isDouble && state !== 'nap' && has(clipName('ex'))) {
    lastInteraction = now;
    if (!battle) beginBattle(); // 더블클릭 EX는 전투 모드로 이어진다 (구호 없이 바로 EX)
    exSkill(); // 더블클릭: 첫 클릭의 반응을 끊고 EX 스킬
  } else {
    react();
  }
}

function endDrag(e) {
  if (!drag) return;
  bridge.fx(e?.type === 'pointercancel' ? 'cancel' : 'up');
  const wasDragged = drag.moved;
  drag = null;
  if (wasDragged) {
    fallVelocity = 0;
    setState('fall');
  } else {
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
function frame(now) {
  requestAnimationFrame(frame);
  const targetFps = state === 'idle' || state === 'nap' ? 30 : 60;
  if (now - lastFrame < 1000 / targetFps - 2) return;
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;

  if (renderer.getPixelRatio() !== window.devicePixelRatio) layout(); // 배율이 다른 모니터로 옮겨졌을 때
  update(dt);
  mixer.update(dt);
  updateHiddenParts();
  updateOutlines();
  updateRope(); // 손 위치는 이번 프레임 자세로
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
  get clipHeads() { return Object.fromEntries([...clipHeads].map(([n, r]) => [n, Math.round(THREE.MathUtils.radToDeg(r))])); },
  set timeScale(f) { mixer.timeScale = f; }, // 동작 확인용 느린 재생
  // 동작 확인용: 상태 머신을 멈추고(state 'pose') 이 동작만 반복
  pose(name, { face = FACE_FRONT, height = 0 } = {}) { endBattle(); armed = null; drag = null; setState('pose'); facing = face; lift = height; play(name); },
  get armed() { return armed && { left: Math.round((armed.until - performance.now()) / 1000) }; },
  armFor(seconds) { endBattle(); startArmed(); if (armed) armed.until = performance.now() + seconds * 1000; },
  get battle() { return battle && { ...battle, form, left: Math.round((battle.until - performance.now()) / 1000) }; },
  // stance: 시험용으로 전투 자세 고정 ('Normal' | 'Stand' | 'Kneel', 그 학생에게 있을 때)
  battleFor(seconds, stance) {
    endBattle(); startBattle();
    if (!battle) return;
    battle.until = performance.now() + seconds * 1000;
    if (stance && stanceReady(stance)) battle.stance = stance;
  },
  run() { if (battle) startRun(); }, // 전투 중 뛰어서 자리 옮기기
};

main().catch((err) => console.error('펫 초기화 실패:', err));

// 브라우저에서 열었을 때: 페이지 전체를 작업 영역으로, 캔버스를 펫 창으로 흉내 낸다 (?sim)
function createBrowserStub() {
  const q = new URLSearchParams(location.search);
  const sim = q.has('sim');
  const model = q.get('model') ?? 'Hoshino.glb'; // 테스트 도구의 --model=
  const W = 560, H = 280; // main.js SIZES.medium과 같게
  const area = () => ({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });
  if (sim) {
    document.body.classList.add('sim');
    Object.assign(canvas.style, {
      position: 'absolute', width: `${W}px`, height: `${H}px`,
      left: `${window.innerWidth - W - 120}px`, top: `${window.innerHeight - H}px`,
    });
  }
  const winRect = () => (sim
    ? { x: parseFloat(canvas.style.left), y: parseFloat(canvas.style.top), width: W, height: H }
    : area());
  return {
    readModel: () => fetch(new URL(`../../models/${encodeURIComponent(model)}`, import.meta.url)).then((r) => r.arrayBuffer()),
    getSettings: async () => ({ walk: sim }),
    getBounds: async () => ({ win: winRect(), workArea: area() }),
    getWorkArea: async () => area(),
    move(x, y) { if (sim) Object.assign(canvas.style, { left: `${x}px`, top: `${y}px` }); },
    cursor: (e) => ({ x: e.clientX, y: e.clientY }),
    setIgnoreMouse() {}, showMenu() {}, quit() {}, fx() {},
    onCommand() {}, onSettings() {}, onBoundsChanged() {},
  };
}
