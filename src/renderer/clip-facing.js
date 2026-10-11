import * as THREE from 'three';

// 학생마다 같은 이름의 동작이라도 몸이 보는 방향이 다르다(수영복 호시노는 전투 자세가 40°쯤 더 옆으로, 달리기가 45° 비껴 있고,
// 쓰러짐은 반대쪽으로 돈다). 펫의 방향 값(FACE_BATTLE, FACE_NAP, HANG_FACE …)은 원래 호시노에 맞춘 것이라,
// 동작마다 골반이 평균적으로 보는 방향을 재서 원래 호시노의 같은 동작 방향으로 돌려 맞춘다.

// 원래 호시노(models/Hoshino.glb)에서 잰 동작별 골반 방향(도, Cafe_Idle = 0, +는 위에서 봐서 반시계).
// 차림 번호를 뗀 소문자 이름. 여기 없는 동작(카페 동작 등 거의 정면)은 돌리지 않는다.
const REFERENCE = {
  normal_idle: -54, normal_attack_start: -54, normal_attack_ing: -59, normal_attack_end: -54, normal_attack_delay: -54,
  normal_reload: -50, normal_callsign: -54,
  stand_attack_start: -90, stand_attack_ing: -56, stand_attack_end: -122, stand_attack_delay: -54,
  stand_reload: -161, stand_callsign: -157,
  // 무릎 자세는 원래 호시노에 없어서 시로코(서서 쏘기 방향이 호시노와 10°쯤 차이)에서 잰 값
  kneel_idle: -157, kneel_attack_start: -83, kneel_attack_ing: -72, kneel_attack_end: -115, kneel_attack_delay: -73,
  kneel_reload: -159, kneel_callsign: -157,
  move_ing: -1, move_end_normal: -42, move_end_stand: -129, move_end_kneel: -129, move_jump: 5, move_callsign: -2,
  exs: -43, victory_start: -11, victory_end: -27, formation_idle: 17, formation_pickup: -8,
  vital_death: -82, vital_retreat: -154,
};
const MIN_TURN = THREE.MathUtils.degToRad(20); // 이보다 작은 차이는 그냥 둔다
const SAMPLES = 8;

// 동작마다 잰 방향. nameKey: 동작 이름을 REFERENCE 키로 바꾸는 함수
//   turns: 동작 이름 → 원래 호시노와 같은 방향이 되도록 더 돌릴 각도(라디안)
//   heads: 동작 이름 → 머리(얼굴)가 평균적으로 보는 방향(라디안, Cafe_Idle = 0). 전투 동작은 얼굴이 총구보다 왼쪽을 본다
export function measureClips(root, animations, nameKey) {
  const turns = new Map();
  const heads = new Map();
  const bone = (re) => { let b = null; root.traverse((o) => { if (!b && re.test(o.name)) b = o; }); return b; };
  const pelvis = bone(/^bip001[ _]pelvis$/i);
  const head = bone(/^bip001[ _]head$/i);
  const base = animations.find((c) => c.name === 'Cafe_Idle');
  if (!pelvis || !head || !base) return { turns, heads };

  // 재는 동안 움직인 뼈·모프를 원래대로 되돌리려고 저장
  const saved = [];
  root.traverse((o) => saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone(), o.morphTargetInfluences?.slice()]));

  const mixer = new THREE.AnimationMixer(root);
  const q = new THREE.Quaternion();
  const pose = (clip, t) => {
    mixer.stopAllAction();
    mixer.clipAction(clip).reset().play();
    mixer.setTime(t);
    root.updateMatrixWorld(true);
  };
  pose(base, base.duration / 2);
  // 뼈 기준 "앞" (Cafe_Idle에서 카메라 쪽)
  const forward = (b) => new THREE.Vector3(0, 0, 1).applyQuaternion(b.getWorldQuaternion(q).invert());
  const fPelvis = forward(pelvis), fHead = forward(head);
  const yaw = (b, f) => { const v = f.clone().applyQuaternion(b.getWorldQuaternion(q)); return Math.atan2(v.x, v.z); };

  const diffs = new Map(); // 묶음 → 각도 차이 합
  for (const clip of animations) {
    let px = 0, pz = 0, hx = 0, hz = 0;
    for (let k = 0; k < SAMPLES; k++) {
      pose(clip, (clip.duration * (k + 0.5)) / SAMPLES);
      const p = yaw(pelvis, fPelvis), h = yaw(head, fHead);
      px += Math.sin(p); pz += Math.cos(p); hx += Math.sin(h); hz += Math.cos(h);
    }
    heads.set(clip.name, Math.atan2(hx, hz));
    const key = nameKey(clip.name);
    const ref = REFERENCE[key];
    if (ref === undefined) continue;
    // 전투 자세 동작(normal_*, stand_*, kneel_*)은 자세·차림마다 한 값으로 돌린다. 동작마다 따로 돌리면
    // 대기 ↔ 사격처럼 이어지는 동작 사이에 몸이 20°씩 돌아간다(시로코 Normal_Idle만 기준을 넘어 돌던 일)
    const stance = /^(normal|stand|kneel)_/.exec(key)?.[1];
    const group = stance ? `${stance}|${/[a-z]0(\d)/i.exec(clip.name)?.[1] ?? '1'}` : clip.name;
    const d = THREE.MathUtils.degToRad(ref) - Math.atan2(px, pz);
    const g = diffs.get(group) ?? { x: 0, z: 0, names: [] };
    g.x += Math.sin(d); g.z += Math.cos(d); g.names.push(clip.name);
    diffs.set(group, g);
  }
  for (const { x, z, names } of diffs.values()) {
    const turn = Math.atan2(x, z);
    if (Math.abs(turn) >= MIN_TURN) for (const n of names) turns.set(n, turn);
  }

  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  for (const [o, p, r, s, m] of saved) {
    o.position.copy(p); o.quaternion.copy(r); o.scale.copy(s);
    if (m) o.morphTargetInfluences.splice(0, m.length, ...m);
  }
  root.updateMatrixWorld(true);
  return { turns, heads };
}
