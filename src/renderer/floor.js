import * as THREE from 'three';

// 바탕화면(작업 영역)을 비스듬히 내려다본 바닥으로 보고,
// 바닥 좌표(x, z, 높이 y) ↔ 화면 좌표(px)를 바꿔주는 가상 카메라.
// 화면 아래쪽이 가깝고(크게), 위쪽이 멀다(작게).
export class DesktopFloor {
  constructor({ fov = 30, pitch = 35, farLimit = 0.3 } = {}) {
    this.fov = fov;
    this.pitch = THREE.MathUtils.degToRad(pitch);
    this.farLimit = farLimit;            // 발이 화면 위쪽 이 비율보다 올라가지 않게
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 1000);
    this.area = { x: 0, y: 0, width: 1, height: 1 };
    this.pxNear = 1;                     // 화면 맨 아래에서 바닥 1단위가 몇 px인지
    this.zRef = 1;
    this._ray = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._v = new THREE.Vector3();
  }

  // pxNear: 화면 맨 아래(가장 가까운 곳)에서 캐릭터를 그릴 크기 (창 높이 / 월드 높이)
  setup(area, pxNear) {
    this.area = { ...area };
    this.pxNear = pxNear;
    const half = THREE.MathUtils.degToRad(this.fov / 2);
    // 화면 맨 아래 지점의 시야 깊이가 zRef일 때 1단위 = pxNear px
    this.zRef = area.height / (2 * Math.tan(half) * pxNear);
    const height = (this.zRef / Math.cos(half)) * Math.sin(this.pitch + half);
    const cam = this.camera;
    cam.aspect = area.width / area.height;
    cam.position.set(0, height, 0);
    cam.rotation.set(-this.pitch, 0, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  }

  // 바닥 위 점 → 화면 px 좌표와 그 지점의 크기 배율 (맨 아래 = 1)
  toScreen(x, z, y = 0) {
    const v = this._v.set(x, y, z);
    const depth = -v.clone().applyMatrix4(this.camera.matrixWorldInverse).z;
    v.project(this.camera);
    return {
      x: this.area.x + ((v.x + 1) / 2) * this.area.width,
      y: this.area.y + ((1 - v.y) / 2) * this.area.height,
      scale: this.zRef / depth,
    };
  }

  // 화면 px 좌표 → 높이 planeY 평면 위의 점 (못 찾으면 null)
  toFloor(sx, sy, planeY = 0) {
    const ndc = new THREE.Vector2(
      ((sx - this.area.x) / this.area.width) * 2 - 1,
      1 - ((sy - this.area.y) / this.area.height) * 2,
    );
    this._ray.setFromCamera(ndc, this.camera);
    this._plane.constant = -planeY;
    const hit = new THREE.Vector3();
    return this._ray.ray.intersectPlane(this._plane, hit) ? hit : null;
  }

  // 바닥 점을 화면에 보이는 범위 안으로 (marginUnits: 좌우 여백, 바닥 단위)
  clamp(p, marginUnits = 0.3) {
    const s = this.toScreen(p.x, p.z);
    const a = this.area;
    const margin = marginUnits * this.pxNear * s.scale;
    const sx = THREE.MathUtils.clamp(s.x, a.x + margin, a.x + a.width - margin);
    const sy = THREE.MathUtils.clamp(s.y, a.y + a.height * this.farLimit, a.y + a.height - 2);
    if (sx === s.x && sy === s.y) return p.set(p.x, 0, p.z);
    const q = this.toFloor(sx, sy);
    return q ? p.set(q.x, 0, q.z) : p;
  }

  // 보이는 범위 안의 임의의 바닥 점
  randomPoint() {
    const a = this.area;
    const sx = a.x + a.width * (0.05 + Math.random() * 0.9);
    const sy = a.y + a.height * (this.farLimit + Math.random() * (0.97 - this.farLimit));
    const p = this.toFloor(sx, sy);
    return p ? this.clamp(p) : null;
  }
}
