import * as THREE from 'three';

// 게임 모델은 몸 일부(입 모양, 겉옷 바꾸기 등)를 모프 타깃 하나로 숨긴다: 값 1이면 모든 정점이 한 점으로 모인다.
// 그런데 모이는 건 스키닝 전이라, 그 점의 정점들이 서로 다른 뼈를 따라가면서 다시 벌어져 길쭉한 조각으로 보인다.
// (예: 수영복 호시노 Body02는 02 동작에서만 켜지고, 다른 동작에서는 피부색 삼각형 조각이 몸에 붙어 보였다)
// → 이런 "숨김 타깃"을 찾아 두고, 값이 절반을 넘으면 메시 자체를 안 보이게 한다. mixer.update() 뒤에 매 프레임 부른다.
export function hiddenPartsUpdater(root) {
  const parts = findHiddenParts(root);
  return () => { for (const [mesh, i] of parts) mesh.visible = mesh.morphTargetInfluences[i] < 0.5; };
}

function findHiddenParts(root) {
  const parts = [];
  root.traverse((o) => {
    o.morphTargetInfluences?.forEach((_, i) => { if (collapses(o.geometry, i)) parts.push([o, i]); });
  });
  return parts;
}

// 게임 동작은 소품을 뼈 크기를 0 가까이로 줄여서도 숨기는데, 그 아래 뼈들의 값은 아무렇게나 들어 있다
// (예: 수영복 호시노 02 차림 동작은 방수 케이스를 크기 0.002로 숨기고, 그 끈 뼈는 위치가 9.8 — 보통 0.2).
// 숨긴 동안엔 안 보이지만, 다른 동작과 섞는 0.2초 동안 크기는 커지고 위치는 아직 커서 끈이 창 아래까지 늘어나 번쩍였다.
// EX처럼 처음·끝에만 숨기는 동작도 있어서(수영복 호시노 Exs → 승리 포즈에서도 번쩍임) 숨긴 순간마다 따진다.
// → 숨겨진 뼈 아래 뼈들은 숨긴 순간의 값을 기본 자세 값으로 바꾼다 (트랙은 남겨서 "그 동작이 움직이는 뼈"는 그대로).
//   키를 직접 고치면 곡선 접선 때문에 깨지므로, 원래 보간으로 원래 키 시각 + 1/60초마다 값을 뽑아 직선 보간 트랙으로 새로 담는다.
// 모델을 읽은 뒤, 동작을 틀기 전에 한 번 부른다
const HIDDEN_SCALE = 0.02;
const STEP = 1 / 60;
export function restUnderHiddenBones(root, animations) {
  const nodes = new Map();
  root.traverse((o) => nodes.set(THREE.PropertyBinding.sanitizeNodeName(o.name), o));
  const split = (tr) => { const i = tr.name.lastIndexOf('.'); return [nodes.get(tr.name.slice(0, i)), tr.name.slice(i + 1)]; };
  const tiny = (values) => values.every((v) => Math.abs(v) < HIDDEN_SCALE);
  for (const clip of animations) {
    // 어느 순간이라도 크기가 0 가까이 되는 뼈 → 그 순간을 알려 주는 함수
    const hiders = clip.tracks.filter((tr) => split(tr)[0] && split(tr)[1] === 'scale').map((tr) => {
      const f = tr.createInterpolant();
      return { bone: split(tr)[0], tr, at: (t) => tiny(f.evaluate(t)) };
    }).filter((h) => h.tr.times.some(h.at));
    if (!hiders.length) continue;
    clip.tracks = clip.tracks.map((tr) => {
      const [node, prop] = split(tr);
      if (!node || !['position', 'quaternion', 'scale'].includes(prop)) return tr;
      const above = hiders.filter((h) => h.bone !== node && node.parent && isAncestor(h.bone, node));
      if (!above.length) return tr;
      const times = [...new Set([...tr.times, ...Array.from({ length: Math.floor(clip.duration / STEP) + 1 }, (_, i) => i * STEP), clip.duration])]
        .filter((t) => t <= clip.duration + 1e-6).sort((a, b) => a - b);
      const f = tr.createInterpolant();
      const rest = node[prop].toArray();
      const hiddenAt = times.map((t) => above.some((h) => h.at(t)));
      if (!hiddenAt.some(Boolean)) return tr;
      const Track = prop === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
      if (hiddenAt.every(Boolean)) return new Track(tr.name, [0], rest);
      const values = times.flatMap((t, i) => (hiddenAt[i] ? rest : [...f.evaluate(t)]));
      return new Track(tr.name, times, values);
    });
  }
}

function isAncestor(a, node) {
  for (let p = node.parent; p; p = p.parent) if (p === a) return true;
  return false;
}

// 평소 대기(baseName)와 장비 같은 큰 부분의 보임/숨김이 다른 동작들의 이름.
// 예: 아리스(배틀)는 등 뒤 장비(CH0334_Arms_Body)를 카페 동작에서만 숨기고 편성·승리·전투 동작에서는 보인다
// → 평소 상태에서 이런 동작을 틀면 장비가 갑자기 생기거나 사라지므로 펫이 평소에는 피한다
const GEAR_SIZE = 0.25;
export function clipsChangingParts(root, animations, baseName) {
  const changing = new Set();
  const base = animations.find((c) => c.name === baseName);
  // 입 모양(Mouth_*) 같은 표정용 작은 조각은 동작마다 바뀌므로 빼고, 모델 전체의 GEAR_SIZE 이상인 큰 부분만 본다
  const size = (mesh) => { mesh.geometry.computeBoundingBox(); return mesh.geometry.boundingBox.getSize(new THREE.Vector3()).length(); };
  let biggest = 0;
  root.traverse((o) => { if (o.isMesh) biggest = Math.max(biggest, size(o)); });
  const parts = findHiddenParts(root).filter(([mesh]) => size(mesh) >= biggest * GEAR_SIZE);
  if (!base || !parts.length) return changing;
  const saved = [];
  root.traverse((o) => saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone(), o.morphTargetInfluences?.slice()]));
  const mixer = new THREE.AnimationMixer(root);
  const hidden = (t, clip) => {
    mixer.stopAllAction();
    mixer.clipAction(clip).reset().play();
    mixer.setTime(t);
    return parts.map(([mesh, i]) => mesh.morphTargetInfluences[i] >= 0.5);
  };
  const baseHidden = hidden(base.duration / 2, base);
  const SAMPLES = 6;
  for (const clip of animations) {
    for (let k = 0; k < SAMPLES && !changing.has(clip.name); k++) {
      const now = hidden((clip.duration * (k + 0.5)) / SAMPLES, clip);
      if (now.some((h, j) => h !== baseHidden[j])) changing.add(clip.name);
    }
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  for (const [o, p, r, s, m] of saved) {
    o.position.copy(p); o.quaternion.copy(r); o.scale.copy(s);
    if (m) o.morphTargetInfluences.splice(0, m.length, ...m);
  }
  return changing;
}

// 모프 타깃 i를 끝까지 적용하면 모든 정점이 한 점으로 모이는지
function collapses(geometry, i) {
  const pos = geometry.attributes.position;
  const target = geometry.morphAttributes.position?.[i];
  if (!target) return false;
  const box = new THREE.Box3();
  const v = new THREE.Vector3(), p = new THREE.Vector3();
  for (let k = 0; k < pos.count; k++) {
    v.fromBufferAttribute(target, k);
    if (geometry.morphTargetsRelative) v.add(p.fromBufferAttribute(pos, k));
    box.expandByPoint(v);
  }
  return box.getSize(v).length() < 1e-4;
}
