import * as THREE from 'three';

// 게임 모델은 몸 일부(입 모양, 겉옷 바꾸기 등)를 모프 타깃 하나로 숨긴다: 값 1이면 모든 정점이 한 점으로 모인다.
// 그런데 모이는 건 스키닝 전이라, 그 점의 정점들이 서로 다른 뼈를 따라가면서 다시 벌어져 길쭉한 조각으로 보인다.
// (예: 수영복 호시노 Body02는 02 동작에서만 켜지고, 다른 동작에서는 피부색 삼각형 조각이 몸에 붙어 보였다)
// → 이런 "숨김 타깃"을 찾아 두고, 값이 절반을 넘으면 메시 자체를 안 보이게 한다. mixer.update() 뒤에 매 프레임 부른다.
export function hiddenPartsUpdater(root) {
  const parts = [];
  root.traverse((o) => {
    o.morphTargetInfluences?.forEach((_, i) => { if (collapses(o.geometry, i)) parts.push([o, i]); });
  });
  return () => { for (const [mesh, i] of parts) mesh.visible = mesh.morphTargetInfluences[i] < 0.5; };
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
