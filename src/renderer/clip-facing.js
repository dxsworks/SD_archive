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
  move_ing: -1, move_end_normal: -42, move_end_stand: -129, move_jump: 5, move_callsign: -2,
  exs: -43, victory_start: -11, victory_end: -27, formation_idle: 17, formation_pickup: -8,
  vital_death: -82, vital_retreat: -154,
};
const MIN_TURN = THREE.MathUtils.degToRad(20); // 이보다 작은 차이는 그냥 둔다
const SAMPLES = 8;

// 동작 이름 → 더 돌려야 할 각도(라디안). nameKey: 동작 이름을 REFERENCE 키로 바꾸는 함수
export function measureClipTurns(root, animations, nameKey) {
  const turns = new Map();
  let pelvis = null;
  root.traverse((o) => { if (!pelvis && /^bip001[ _]pelvis$/i.test(o.name)) pelvis = o; });
  const base = animations.find((c) => c.name === 'Cafe_Idle');
  if (!pelvis || !base) return turns;

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
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(pelvis.getWorldQuaternion(q).invert()); // 골반 기준 "앞"

  for (const clip of animations) {
    const ref = REFERENCE[nameKey(clip.name)];
    if (ref === undefined) continue;
    let sx = 0, sz = 0;
    for (let k = 0; k < SAMPLES; k++) {
      pose(clip, (clip.duration * (k + 0.5)) / SAMPLES);
      const f = forward.clone().applyQuaternion(pelvis.getWorldQuaternion(q));
      const a = Math.atan2(f.x, f.z);
      sx += Math.sin(a); sz += Math.cos(a);
    }
    const d = THREE.MathUtils.degToRad(ref) - Math.atan2(sx, sz);
    const turn = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(turn) >= MIN_TURN) turns.set(clip.name, turn);
  }

  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  for (const [o, p, r, s, m] of saved) {
    o.position.copy(p); o.quaternion.copy(r); o.scale.copy(s);
    if (m) o.morphTargetInfluences.splice(0, m.length, ...m);
  }
  root.updateMatrixWorld(true);
  return turns;
}
