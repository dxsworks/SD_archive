import * as THREE from 'three';

// 게임 모델은 몸 일부(입 모양, 겉옷 바꾸기 등)를 모프 타깃 하나로 숨긴다: 값 1이면 모든 정점이 한 점으로 모인다.
// 그런데 모이는 건 스키닝 전이라, 그 점의 정점들이 서로 다른 뼈를 따라가면서 다시 벌어져 길쭉한 조각으로 보인다.
// (예: 수영복 호시노 Body02는 02 동작에서만 켜지고, 다른 동작에서는 피부색 삼각형 조각이 몸에 붙어 보였다)
// → 이런 "숨김 타깃"을 찾아 두고, 값이 절반을 넘으면 메시 자체를 안 보이게 한다. mixer.update() 뒤에 매 프레임 부른다.
export function hiddenPartsUpdater(root) {
  const parts = findHiddenParts(root);
  return () => { for (const [mesh, i] of parts) mesh.visible = mesh.morphTargetInfluences[i] < 0.5; };
}

// 무기를 기본 값 1(숨김)인 모프로 숨겨 두고 일부 동작만 값 0(보임) 키를 넣은 학생이 있다 (메구: 무장 대기·구호·뛰기·편성만 보임,
// 사격·재장전·EX·승리 포즈엔 키가 없음). 게임은 마지막 값을 이어 써서 사격 중에도 보이지만, three.js는 키가 없는 동작에서 기본 값으로
// 돌아가 맨손으로 쏘는 것처럼 보였다 → 키가 "보임"뿐인 무기 숨김 타깃은 기본 값을 보임으로 바꾼다 (카페 동작은 뼈 크기 0으로 숨김).
// 원본 289개 중 메구뿐 (몸 두 벌을 바꾸는 아리스(배틀)·수영복 호시노·토키는 무기가 아니라 해당 없음). 모델을 읽은 뒤, 동작을 틀기 전에 한 번
export function showSwitchedWeapons(root, animations) {
  const keyed = new Map(); // 트랙 이름 → 값들
  for (const clip of animations) for (const tr of clip.tracks) if (tr.name.endsWith('.morphTargetInfluences')) keyed.set(tr.name, [...(keyed.get(tr.name) ?? []), tr]);
  for (const [mesh, i] of findHiddenParts(root)) {
    if (!/weapon/i.test(mesh.name) || mesh.morphTargetInfluences[i] < 0.5) continue;
    const tracks = keyed.get(`${THREE.PropertyBinding.sanitizeNodeName(mesh.name)}.morphTargetInfluences`) ?? [];
    const n = mesh.morphTargetInfluences.length;
    const values = tracks.flatMap((tr) => [...tr.values].filter((_, k) => k % n === i));
    if (values.length && values.every((v) => v < 0.5)) mesh.morphTargetInfluences[i] = 0;
  }
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
// 단 아래 뼈가 크기를 도로 키워 되살리면 숨긴 게 아니다: 수영복 아야네는 몸 뼈대가 헬기 뼈(Bone_Body) 아래에 있어,
// 카페 동작이 헬기를 0.001로 줄이고 몸(character_root)을 1000배로 되돌린다. 예전엔 그 1000배도 기본 값 1로 바꿔 몸이 사라지고
// 가방만 떠 있었다 → 숨긴 뼈부터 그 뼈의 부모까지, 그리고 그 뼈까지 크기를 곱한 값이 둘 다 0 가까울 때만 숨긴 것으로 본다
// (부모까지만 보면 몸을 되살리는 character_root를, 그 뼈까지만 보면 몸 아래에서 따로 숨는 총 뼈를 잘못 바꿈) (2026-11-02)
// 모델을 읽은 뒤, 동작을 틀기 전에 한 번 부른다
const HIDDEN_SCALE = 0.02;
const STEP = 1 / 60;
export function restUnderHiddenBones(root, animations) {
  const nodes = new Map();
  root.traverse((o) => nodes.set(THREE.PropertyBinding.sanitizeNodeName(o.name), o));
  const split = (tr) => { const i = tr.name.lastIndexOf('.'); return [nodes.get(tr.name.slice(0, i)), tr.name.slice(i + 1)]; };
  const tiny = (values) => values.every((v) => Math.abs(v) < HIDDEN_SCALE);
  const largest = (values) => Math.max(...[...values].map(Math.abs));
  for (const clip of animations) {
    // 어느 순간이라도 크기가 0 가까이 되는 뼈 → 그 순간을 알려 주는 함수
    const hiders = clip.tracks.filter((tr) => split(tr)[0] && split(tr)[1] === 'scale').map((tr) => {
      const f = tr.createInterpolant();
      return { bone: split(tr)[0], tr, at: (t) => tiny(f.evaluate(t)) };
    }).filter((h) => h.tr.times.some(h.at));
    if (!hiders.length) continue;
    // t초에 이 뼈의 크기 (이 동작이 안 움직이면 기본 값)
    const scales = new Map(clip.tracks.filter((tr) => split(tr)[0] && split(tr)[1] === 'scale').map((tr) => [split(tr)[0], tr.createInterpolant()]));
    const scaleOf = (node, t) => (scales.has(node) ? largest(scales.get(node).evaluate(t)) : largest(node.scale.toArray()));
    // 숨긴 뼈 h 때문에 node가 안 보이는지: h부터 node의 부모까지 곱한 크기가 0 가깝고(중간에 도로 키우면 보임),
    // node 자기 크기로도 되살리지 않을 때
    const stillHidden = (h, node, t) => {
      let s = 1;
      for (let n = node.parent; n && n !== h.bone; n = n.parent) s *= scaleOf(n, t);
      s *= scaleOf(h.bone, t);
      return s < HIDDEN_SCALE && s * scaleOf(node, t) < HIDDEN_SCALE;
    };
    clip.tracks = clip.tracks.map((tr) => {
      const [node, prop] = split(tr);
      if (!node || !['position', 'quaternion', 'scale'].includes(prop)) return tr;
      const above = hiders.filter((h) => h.bone !== node && node.parent && isAncestor(h.bone, node));
      if (!above.length) return tr;
      const times = [...new Set([...tr.times, ...Array.from({ length: Math.floor(clip.duration / STEP) + 1 }, (_, i) => i * STEP), clip.duration])]
        .filter((t) => t <= clip.duration + 1e-6).sort((a, b) => a - b);
      const f = tr.createInterpolant();
      const rest = node[prop].toArray();
      const hiddenAt = times.map((t) => above.some((h) => h.at(t) && stillHidden(h, node, t)));
      if (!hiddenAt.some(Boolean)) return tr;
      const Track = prop === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
      if (hiddenAt.every(Boolean)) return new Track(tr.name, [0], rest);
      const values = times.flatMap((t, i) => (hiddenAt[i] ? rest : [...f.evaluate(t)]));
      return new Track(tr.name, times, values);
    });
  }
}

// 숨긴 뼈 아래에서 크기를 도로 키워 되살리는 뼈는 두 동작을 섞을 때 크기가 뼈마다 따로 직선으로 섞여 곱이 부푼다:
// 수영복 아야네 카페 동작(헬기 0.001 × 몸 1000) → 헬기 동작(0.6 × 1)이면 섞는 중간에 0.3 × 500 = 150배 → 무장을 시작할 때마다
// 몸이 창을 덮어 살구색으로 번쩍였다. 미나 낮잠 → 카페 반응의 소품, 나구사 카페 동작의 총알도 창 끝까지 커졌다 (2026-11-02)
// → 되살리는 뼈와 그 아래 크기 키가 있는 뼈마다 "숨긴 뼈부터 그 뼈까지 곱한 크기"가 섞이는 동작들의 그 순간 값보다 커지면 줄인다.
// 모델을 읽을 때(restUnderHiddenBones 뒤, 동작을 틀기 전) 한 번 부르고, 돌려주는 함수를 mixer.update() 뒤마다 mixer를 주고 부른다
export function limitRevivedScales(root, animations) {
  const nodes = new Map();
  root.traverse((o) => nodes.set(THREE.PropertyBinding.sanitizeNodeName(o.name), o));
  const split = (tr) => { const i = tr.name.lastIndexOf('.'); return [nodes.get(tr.name.slice(0, i)), tr.name.slice(i + 1)]; };
  const largest = (values) => Math.max(...[...values].map(Math.abs));
  const scaleTracks = (clip) => clip.tracks.filter((tr) => split(tr)[0] && split(tr)[1] === 'scale');
  // 1) 되살리는 뼈 → 그 위 가장 높은 숨긴 뼈
  //    숨긴 뼈는 크기 키가 0 가까운 뼈, 또는 그 동작이 크기를 안 움직여 기본 크기(0 가까이)로 숨어 있는 뼈:
  //    카즈사(밴드)는 디저트 소품 뼈(bone_desert_root)를 기본 크기 0.001로 두고 대부분 동작이 포크를 1460배로 되살리는데,
  //    두 번째 구호만 디저트 뼈를 1로 키우고 포크 키가 없어(기본 1.46) 섞는 0.1초 동안 포크가 150~290배로 부풀어
  //    창을 덮었음 (2026-11-03. 원본 289개 중 이 경우는 이 학생뿐)
  const top = new Map();
  for (const clip of animations) {
    const tracks = new Map(scaleTracks(clip).map((tr) => [split(tr)[0], tr]));
    const scales = new Map([...tracks].map(([n, tr]) => [n, tr.createInterpolant()]));
    const scaleOf = (node, t) => (scales.has(node) ? largest(scales.get(node).evaluate(t)) : largest(node.scale.toArray()));
    const hiders = new Map([...tracks].map(([n, tr]) => [n, [...tr.times]])); // 숨긴 뼈 → 따져 볼 시각 (null: 되살리는 뼈의 키 시각)
    for (const node of tracks.keys()) {
      for (let n = node.parent; n; n = n.parent) if (!tracks.has(n) && largest(n.scale.toArray()) < HIDDEN_SCALE) hiders.set(n, null);
    }
    for (const [h, times] of hiders) {
      for (const node of scales.keys()) {
        if (node === h || !isAncestor(h, node)) continue;
        if (top.has(node) && !isAncestor(h, top.get(node))) continue; // 이미 같거나 더 높은 숨긴 뼈를 찾음
        const hidden = (times ?? [...tracks.get(node).times]).filter((t) => scaleOf(h, t) < HIDDEN_SCALE);
        for (const t of hidden) {
          let s = scaleOf(h, t);
          for (let n = node; n !== h; n = n.parent) s *= scaleOf(n, t);
          if (s >= HIDDEN_SCALE) { top.set(node, h); break; }
        }
      }
    }
  }
  if (!top.size) return () => {};
  // 2) 되살리는 뼈와 그 아래 크기 키가 있는 뼈: 숨긴 뼈까지 곱한 크기의 최대 (모든 동작의 키 시각, 안 움직이면 기본 값)
  const keyed = new Set(animations.flatMap((c) => scaleTracks(c).map((tr) => split(tr)[0])));
  const under = new Map(); // 뼈 → 그 위 가장 높은 숨긴 뼈 (되살리는 뼈가 겹쳐 있어도 한 번만)
  for (const [revived, h] of top) {
    for (const node of keyed) {
      if (node !== revived && !isAncestor(revived, node)) continue;
      if (!under.has(node) || isAncestor(h, under.get(node))) under.set(node, h);
    }
  }
  const depthOf = (node) => { let d = 0; for (let n = node.parent; n; n = n.parent) d++; return d; };
  const scaleOfClip = new Map(animations.map((clip) => [clip, new Map(scaleTracks(clip).map((tr) => [split(tr)[0], tr]))]));
  const limits = [...under].map(([node, h]) => {
    const chain = [];
    for (let n = node; n !== h; n = n.parent) chain.push(n);
    chain.push(h);
    // 동작마다 t초에 이 사슬의 크기를 곱한 값 (그 동작이 안 움직이는 뼈는 기본 값: 섞을 때 믹서도 기본 값을 씀)
    const of = new Map(animations.map((clip) => { // 이름으로 (연달아 사격의 쌍둥이 동작은 같은 이름의 복사본)
      const f = chain.map((n) => scaleOfClip.get(clip).get(n)?.createInterpolant() ?? largest(n.scale.toArray()));
      return [clip.name, (t) => f.reduce((p, x) => p * (typeof x === 'number' ? x : largest(x.evaluate(t))), 1)];
    }));
    return { node, chain, of, rest: chain.reduce((p, n) => p * largest(n.scale.toArray()), 1), depth: depthOf(node) };
  });
  limits.sort((a, b) => a.depth - b.depth); // 위 뼈부터 줄여야 아래 뼈가 줄인 값으로 잼
  const size = (v) => Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));
  // 3) 크기만 묶으면 위치가 남는다: 숨긴 뼈 아래 값은 그 작은 크기 기준이라(나구사 카페 동작은 총 0.01배 안에서 총알 위치가 100배)
  //    섞는 동안 부모는 커지는데 위치는 아직 커서 총알이 창 끝까지 날아갔음 → 섞이는 동작 중 부모를 숨긴 것과 안 숨긴 것이 같이 있으면
  //    되살리는 뼈는 안 숨긴 동작(그중 가중치가 큰 것)의 값을 그대로 씀 (아야네는 헬기 동작의 몸 자리로 헬기와 같이 커짐)
  const transformTracks = (clip, node) => ['position', 'quaternion', 'scale'].map((prop) => clip.tracks.find((tr) => split(tr)[0] === node && split(tr)[1] === prop));
  const revivedList = [...top].map(([node, h]) => {
    const above = [];
    for (let n = node.parent; n !== h; n = n.parent) above.push(n);
    above.push(h);
    const restParent = above.reduce((p, n) => p * largest(n.scale.toArray()), 1);
    const rest = [node.position.toArray(), node.quaternion.toArray(), node.scale.toArray()];
    const of = new Map(animations.map((clip) => {
      const f = above.map((n) => scaleOfClip.get(clip).get(n)?.createInterpolant() ?? largest(n.scale.toArray()));
      const own = transformTracks(clip, node).map((tr, i) => (tr ? tr.createInterpolant() : rest[i]));
      return [clip.name, {
        parent: (t) => f.reduce((p, x) => p * (typeof x === 'number' ? x : largest(x.evaluate(t))), 1),
        apply: (t) => {
          const [pos, quat, scale] = own.map((x) => (Array.isArray(x) ? x : x.evaluate(t)));
          node.position.fromArray(pos);
          node.quaternion.fromArray(quat).normalize();
          node.scale.fromArray(scale);
        },
      }];
    }));
    return { of, restParent };
  });
  // 크기 상한 = 지금 섞이는 동작들의 그 순간 값 중 최대 (모든 동작의 최대로 하면 나구사는 재장전 한 순간에 총알이 0.97배라
  // 카페 → EX를 섞는 동안 총알이 평소 0.1배의 10배로 커지는 걸 못 막았음). 동작 하나뿐이고 가중치가 1이면 섞는 게 아님
  return (mixer) => {
    const actions = mixer._actions.slice(0, mixer._nActiveActions).filter((a) => a.getEffectiveWeight() > 0);
    const weight = actions.reduce((s, a) => s + a.getEffectiveWeight(), 0);
    if (actions.length < 2 && weight > 0.999) return;
    for (const { of, restParent } of revivedList) {
      let hidden = weight < 0.999 && restParent < HIDDEN_SCALE; // 가중치가 모자라면 믹서가 기본 값을 섞음
      let pick = null;
      for (const a of actions) {
        const f = of.get(a.getClip().name);
        if (!f) continue;
        if (f.parent(a.time) < HIDDEN_SCALE) hidden = true;
        else if (!pick || a.getEffectiveWeight() > pick.a.getEffectiveWeight()) pick = { a, f };
      }
      if (hidden && pick) pick.f.apply(pick.a.time);
    }
    for (const { node, chain, of, rest } of limits) {
      let max = weight < 0.999 ? rest : 0; // 가중치가 모자라면 믹서가 기본 값을 섞음
      for (const a of actions) max = Math.max(max, of.get(a.getClip().name)?.(a.time) ?? rest);
      const p = chain.reduce((s, n) => s * size(n.scale), 1);
      if (p > max * 1.01) node.scale.multiplyScalar(max / p);
    }
  };
}

// t초에 크기를 0 가까이로 숨긴 소품 뼈 이름들. 몸 뼈(Bip001*)는 뺀다: 주먹 쥘 때 손가락 뼈를 크기 0으로 하는 동작이 있음
export function hiddenPropsAt(clip, t) {
  const out = new Set();
  for (const tr of clip.tracks) {
    if (!tr.name.endsWith('.scale') || tr.name.startsWith('Bip001')) continue;
    if ([...tr.createInterpolant().evaluate(t)].every((v) => Math.abs(v) < HIDDEN_SCALE)) out.add(tr.name.slice(0, -'.scale'.length));
  }
  return out;
}

// 이 동작이 그 소품 뼈를 한 번이라도 보이게 하는지 (키 값으로 봄. 그 뼈를 안 움직이는 동작은 false)
export function showsProp(clip, bone) {
  const tr = clip.tracks.find((t) => t.name === `${bone}.scale`);
  if (!tr) return false;
  for (let i = 0; i < tr.values.length; i += 3) if (Math.abs(tr.values[i]) >= HIDDEN_SCALE) return true;
  return false;
}

function isAncestor(a, node) {
  for (let p = node.parent; p; p = p.parent) if (p === a) return true;
  return false;
}

// 평소 대기(baseName)와 장비 같은 큰 부분의 보임/숨김이 다른 동작들의 이름.
// 예: 아리스(배틀)는 등 뒤 장비(CH0334_Arms_Body)를 카페 동작에서만 숨기고 편성·승리·전투 동작에서는 보인다
// → 평소 상태에서 이런 동작을 틀면 장비가 갑자기 생기거나 사라지므로 펫이 평소에는 피한다
const GEAR_SIZE = 0.25;
// 표정용 얼굴 메시 (Ibuki_Original_Face01_Outline, CH0238_Face02, CH0291_Face_02, CH0310_Face01_Mesh …)
const FACE_MESH = /_Face(_?\d+)?(_|$)/i;
export function clipsChangingParts(root, animations, baseName) {
  const changing = new Set();
  const base = animations.find((c) => c.name === baseName);
  // 입 모양(Mouth_*) 같은 표정용 작은 조각은 동작마다 바뀌므로 빼고, 모델 전체의 GEAR_SIZE 이상인 큰 부분만 본다.
  // 얼굴을 통째로 바꿔 표정을 짓는 학생도 뺀다(원본 289개 중 약 20개): 이부키 Face01(> < 눈)이 크기로는 걸려서 장비로 잡혀
  // 평소에 집어 들면 Formation_Pickup 대신 승리 포즈를 틀고 Victory_*_Random을 안 썼음 (2026-10-31).
  // 펫이 붙인 외곽선 메시(outline.js)는 이름이 없고 원본과 모프 값 배열을 같이 쓰므로 그 배열로 가린다
  const size = (mesh) => { mesh.geometry.computeBoundingBox(); return mesh.geometry.boundingBox.getSize(new THREE.Vector3()).length(); };
  let biggest = 0;
  const faces = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    biggest = Math.max(biggest, size(o));
    if (FACE_MESH.test(o.name) && o.morphTargetInfluences) faces.add(o.morphTargetInfluences);
  });
  const parts = findHiddenParts(root).filter(([mesh]) => size(mesh) >= biggest * GEAR_SIZE && !faces.has(mesh.morphTargetInfluences));
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
