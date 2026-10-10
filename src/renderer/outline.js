import * as THREE from 'three';

// 게임처럼 검은 외곽선: 메시마다 뒷면만 그리는 복사본을 법선 방향으로 살짝 부풀려 뒤에 깐다.
// 몸·무기·소품 등 모델의 모든 메시에 단다. 두께는 모델 키 대비 비율로,
// 게임 느낌의 기본(키의 0.6%)에서 23%만 쓴다(사용자 결정).
const THICKNESS = 0.006 * 0.23;

// 모델을 화면에 놓기 전(루트가 원점·배율 1일 때) 부른다. 돌려주는 함수를 매 프레임 불러 원본 메시의 보임/숨김을 따라가게 한다.
export function addOutlines(root) {
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); }); // 스킨 메시 크기를 재려면 뼈 행렬이 필요
  const height = new THREE.Box3().setFromObject(root, true).getSize(new THREE.Vector3()).y;
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });

  const pairs = meshes.map((mesh) => {
    if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals(); // 부풀릴 방향이 필요
    const scale = new THREE.Vector3().setFromMatrixScale(mesh.matrixWorld).x;
    const thick = (THICKNESS * height) / scale; // 메시 자신의 좌표 단위로
    const toOutline = (m) => outlineMaterial(m, thick);
    const material = Array.isArray(mesh.material) ? mesh.material.map(toOutline) : toOutline(mesh.material);
    const outline = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(mesh.geometry, material) : new THREE.Mesh(mesh.geometry, material);
    if (mesh.isSkinnedMesh) outline.bind(mesh.skeleton, mesh.bindMatrix);
    outline.morphTargetInfluences = mesh.morphTargetInfluences; // 입 모양 등 모프도 원본과 같이
    outline.frustumCulled = false;
    outline.position.copy(mesh.position);
    outline.quaternion.copy(mesh.quaternion);
    outline.scale.copy(mesh.scale);
    mesh.parent.add(outline);
    return [mesh, outline];
  });
  return () => { for (const [mesh, outline] of pairs) outline.visible = mesh.visible; };
}

function outlineMaterial(src, thick) {
  // 머리카락처럼 텍스처 알파로 오려낸 면은 오려낸 모양대로 선을 그리도록 텍스처·알파 기준을 가져온다
  const cutout = src.alphaTest > 0;
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    map: cutout ? src.map : null,
    alphaTest: src.alphaTest,
    side: THREE.BackSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.outlineThickness = { value: thick };
    shader.vertexShader = `uniform float outlineThickness;
${shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed += normalize(normal) * outlineThickness;`)}`;
  };
  return mat;
}
