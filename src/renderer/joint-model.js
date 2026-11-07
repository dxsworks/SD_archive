// 합동 승리 학생 하나: 게임에서 뽑은 합동 동작(Start → End)을 시간 t로 바로 맞춰 그린다 (섞지 않음).
// 펫(pet.js 합동 승리)과 배치 도구(tools/joint-placer-page.js)가 같이 씀
import * as THREE from 'three';
import { hiddenPartsUpdater, showSwitchedWeapons, restUnderHiddenBones, limitRevivedScales } from './hidden-parts.js';
import { addOutlines } from './outline.js';
import { clipKey } from './clip-names.js';

// 그 동작이 무기 뼈대를 움직일 때만 무기가 보임 (펫과 같은 규칙, pet.js clipAnimates)
function clipAnimates(clip, mesh) {
  const bones = new Set(mesh.skeleton?.bones.map((b) => THREE.PropertyBinding.sanitizeNodeName(b.name)) ?? []);
  return clip.tracks.some((t) => bones.has(t.name.slice(0, t.name.lastIndexOf('.'))));
}

// gltf: 합동 동작을 넣은 학생 모델 (game-cache/joint-glb), toMaterial: 재질 바꾸기 (펫과 같은 조명 없는 재질)
export function jointStudent(gltf, startName, endName, toMaterial) {
  const start = gltf.animations.find((c) => c.name === startName);
  const end = gltf.animations.find((c) => c.name === endName);
  if (!start || !end) throw new Error(`${startName}/${endName} 동작이 없음 (${gltf.animations.filter((c) => /Interaction/.test(c.name)).map((c) => c.name)})`);
  const clips = [start, end];
  // 평소 대기: 펫의 대기 자세에서 섞여 들어가고 끝나면 섞여 나오게 (pet.js 합동 승리). 합동 동작 모델은 원래 학생 파일 + 합동 동작이라 같은 대기가 있음
  const idleClip = gltf.animations.find((c) => clipKey(c.name) === 'cafe_idle');
  // 게임에서 뽑은 합동 동작엔 모프 값(몸 두 벌 고르기)이 없다 → 그 학생 보통 승리 포즈의 몸 고르기 값을 동작 내내 씀
  // (아리스(배틀): 기본은 장비 없는 몸 CH0334_Body라 장비 뼈는 움직이는데 기계가 안 보이고 공중에 떠 있었음)
  const pose = gltf.animations.find((c) => c.name === 'Victory_Start');
  for (const tr of pose?.tracks ?? []) {
    if (!tr.name.endsWith('.morphTargetInfluences') || !/_Body(_\d+)?\./.test(tr.name)) continue;
    const n = tr.getValueSize();
    for (const c of clips) {
      if (c.tracks.some((t) => t.name === tr.name)) continue;
      c.tracks.push(new THREE.NumberKeyframeTrack(tr.name, [0, c.duration], [...tr.values.slice(0, n), ...tr.values.slice(0, n)]));
    }
  }
  const model = gltf.scene;
  const meshes = [];
  const weapons = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    meshes.push(o);
    if (/weapon|shield/i.test(o.name)) weapons.push(o);
    o.material = Array.isArray(o.material) ? o.material.map(toMaterial) : toMaterial(o.material);
  });
  // 펫과 같은 손질: 숨긴 소품 아래 뼈, 되살리는 뼈 크기, 기본 숨김 무기
  const all = idleClip ? [...clips, idleClip] : clips;
  restUnderHiddenBones(model, all);
  const limit = limitRevivedScales(model, all);
  showSwitchedWeapons(model, all);
  const hide = hiddenPartsUpdater(model);
  const outline = addOutlines(model);
  const outlines = [];
  model.traverse((o) => { if (o.isMesh && !meshes.includes(o)) outlines.push(o); });
  const mixer = new THREE.AnimationMixer(model);
  const actions = clips.map((c) => {
    const a = mixer.clipAction(c);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.play();
    a.paused = true;
    return a;
  });
  const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
  if (idleAction) { idleAction.play(); idleAction.paused = true; idleAction.enabled = false; }
  let phase = -1;
  let weaponOn = new Map();
  // 시간 t: Start를 처음부터, 끝나면 End (End가 끝나면 마지막 자세 그대로)
  // idle: { time, weight } 평소 대기를 이 비율로 섞음 (가중치 합은 늘 1: 1보다 작으면 바인드 자세가 섞여 일그러짐)
  function set(t, idle = null) {
    const [a0, a1] = actions;
    const d0 = start.duration;
    const p = t < d0 ? 0 : 1;
    const w = idleAction && idle ? Math.min(1, Math.max(0, idle.weight)) : 0;
    a0.enabled = p === 0;
    a1.enabled = p === 1;
    actions[p].setEffectiveWeight(1 - w);
    if (idleAction) {
      idleAction.enabled = w > 0;
      idleAction.setEffectiveWeight(w);
      if (w > 0) idleAction.time = ((idle.time % idleClip.duration) + idleClip.duration) % idleClip.duration;
    }
    a0.time = Math.min(t, d0 - 1e-4);
    a1.time = Math.min(Math.max(0, t - d0), end.duration - 1e-4);
    mixer.update(0);
    limit(mixer);
    if (p !== phase) {
      phase = p;
      weaponOn = new Map(weapons.map((w) => [w, clipAnimates(clips[p], w)]));
    }
    hide();
    for (const w of weapons) if (!weaponOn.get(w)) w.visible = false;
    outline();
  }
  function dispose() {
    mixer.stopAllAction();
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const mat of [].concat(o.material)) { mat.map?.dispose(); mat.dispose(); }
    });
  }
  return { model, length: start.duration + end.duration, startLength: start.duration, hasIdle: !!idleAction, set, dispose, outlines, meshes };
}
