// 얼굴 아이콘 그리기 (tools/make-faces.js): 평소 대기 첫 자세에서 머리 뼈 둘레를 정사영으로, 투명 바탕
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { hiddenPartsUpdater, restUnderHiddenBones } from '../src/renderer/hidden-parts.js';
import { addOutlines } from '../src/renderer/outline.js';

const SIZE = 128;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(SIZE, SIZE, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const unlit = (m) => new THREE.MeshBasicMaterial({ name: m.name, map: m.map, color: m.color, transparent: m.transparent, alphaTest: m.alphaTest, side: THREE.DoubleSide });

const HALF = 0.2;      // 그릴 범위 반 (모델 단위, 캐릭터 키 ≈ 1)
const LIFT = 0.07;     // 머리 뼈보다 이만큼 위가 가운데 (머리카락)
window.face = async (name) => {
  const buf = await window.faceBridge.read(name);
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const model = gltf.scene;
  const idle = gltf.animations.find((c) => /^cafe_idle(0?1)?$/i.test(c.name)) ?? gltf.animations[0];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.material = Array.isArray(o.material) ? o.material.map(unlit) : unlit(o.material);
    if (/weapon|shield/i.test(o.name)) o.userData.weapon = true;
  });
  restUnderHiddenBones(model, gltf.animations);
  const hide = hiddenPartsUpdater(model);
  const outline = addOutlines(model);
  const scene = new THREE.Scene();
  scene.add(model);
  const mixer = new THREE.AnimationMixer(model);
  if (idle) { mixer.clipAction(idle).play(); mixer.update(0.5); }
  hide();
  model.traverse((o) => { if (o.userData.weapon) o.visible = false; });
  outline();
  model.updateMatrixWorld(true);
  const head = model.getObjectByName('Bip001_Head') ?? model.getObjectByName('Bip001 Head');
  if (!head) return 'no head';
  const at = head.getWorldPosition(new THREE.Vector3());
  at.y += LIFT;
  const cam = new THREE.OrthographicCamera(-HALF, HALF, HALF, -HALF, 0.01, 20);
  cam.position.set(at.x, at.y + 0.6 * Math.sin(0.12), at.z + 3);
  cam.lookAt(at);
  renderer.render(scene, cam);
  await window.faceBridge.save(name, canvas.toDataURL('image/png'));
  scene.remove(model);
  return 'ok';
};
