import * as THREE from 'three';

// 캔버스를 캐릭터 둘레만큼만 (2026-11-02 사용자: GPU 줄이기). 창 전체 캔버스는 그림이 창의 3%뿐인데
// 창 전체를 MSAA로 지우고 합치는 데 GPU 대부분을 썼다(보통 창 35~40% → 캐릭터 둘레만 7~10%, 화면 밖 창에서 잼).
// 모델이 어디까지 그려지는지는 뼈마다 붙은 정점이 뼈에서 가장 먼 거리(반지름)를 모델을 읽을 때 한 번 재 두고,
// 매 프레임 "보이는 메시의 뼈 위치 ± 반지름"으로 잡는다 (정점을 매 프레임 스키닝하지 않아 가볍다)

const MIN_WEIGHT = 0.1; // 이보다 작게 붙은 뼈는 그 정점의 반지름에 안 셈 (머리카락 끝이 골반에 0.01로 붙은 것 등)

// 모델을 읽을 때 한 번: 메시마다 [뼈, 반지름(뼈 자신의 좌표 단위)] 목록. 뼈에 안 붙은 메시는 바운딩 구
// thickOf(mesh): 외곽선 두께(메시 좌표 단위, outline.js). 반지름에 더한다: 동작이 뼈 크기를 키운 작은 소품은 외곽선도 같이 커져
// 여유(CANVAS_PAD 12px)를 넘었음 (리츠 EX에서 두고 가는 고리, 외곽선이 소품만큼 두꺼워 캔버스 끝에서 11px 잘림, 2026-11-04)
export function meshSpheres(root, thickOf = () => 0) {
  const out = [];
  const v = new THREE.Vector3();
  const local = new THREE.Vector3();
  const m = new THREE.Matrix4();
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position;
    const thick = thickOf(mesh);
    if (!mesh.isSkinnedMesh) {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      out.push({ mesh, center: mesh.geometry.boundingSphere.center.clone(), radius: mesh.geometry.boundingSphere.radius + thick });
      return;
    }
    const { bones, boneInverses } = mesh.skeleton;
    const radius = new Float32Array(bones.length);
    const idx = mesh.geometry.attributes.skinIndex;
    const wt = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix);
      for (let k = 0; k < 4; k++) {
        if (wt.getComponent(i, k) < MIN_WEIGHT) continue;
        const j = idx.getComponent(i, k);
        const d = local.copy(v).applyMatrix4(boneInverses[j]).length();
        if (d > radius[j]) radius[j] = d;
      }
    }
    const joints = [];
    // 외곽선 두께를 뼈 좌표 단위로 (bindMatrix → 뼈 역행렬의 크기)
    bones.forEach((bone, j) => { if (radius[j] > 0) joints.push({ bone, radius: radius[j] + thick * maxScale(m.multiplyMatrices(boneInverses[j], mesh.bindMatrix)) }); });
    out.push({ mesh, joints });
  });
  return out;
}

// 보이는 메시를 화면(창 CSS px)에 투영한 범위 { left, top, right, bottom }. 없으면 null
// points: 더 넣을 월드 점들 (그림자 둘레), toScreen(world Vector3) → { x, y } 창 px,
// pxPerUnit: 월드 1단위가 몇 px (정사영이라 어디서나 같음)
const p = new THREE.Vector3();
function maxScale(m) {
  const e = m.elements;
  return Math.sqrt(Math.max(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], e[4] * e[4] + e[5] * e[5] + e[6] * e[6], e[8] * e[8] + e[9] * e[9] + e[10] * e[10]));
}
export function screenBounds(spheres, points, toScreen, pxPerUnit) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const add = (world, r) => {
    const q = toScreen(world);
    const rp = r * pxPerUnit;
    if (q.x - rp < left) left = q.x - rp;
    if (q.x + rp > right) right = q.x + rp;
    if (q.y - rp < top) top = q.y - rp;
    if (q.y + rp > bottom) bottom = q.y + rp;
  };
  for (const sp of spheres) {
    if (!sp.mesh.visible) continue;
    if (sp.joints) {
      for (const { bone, radius } of sp.joints) {
        const sc = maxScale(bone.matrixWorld);
        if (sc < 1e-4) continue; // 크기 0으로 숨긴 소품 뼈 (그 아래 뼈도 같이 0)
        add(p.setFromMatrixPosition(bone.matrixWorld), radius * sc);
      }
    } else {
      add(p.copy(sp.center).applyMatrix4(sp.mesh.matrixWorld), sp.radius * maxScale(sp.mesh.matrixWorld));
    }
  }
  for (const q of points) add(q, 0);
  return left === Infinity ? null : { left, top, right, bottom };
}
