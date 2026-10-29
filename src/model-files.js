// 학생 모델 파일(.glb) 찾기. 폴더 여러 곳을 앞에서부터 본다: 펫은 [받은 학생 폴더(%APPDATA%/bluearchive-desktop-pet/models), 설치 폴더 models/]
// 같은 이름이 두 곳에 있으면 앞 폴더 것 (학생 압축을 풀어 넣은 새 파일이 설치 파일에 든 것보다 먼저)
// 하위 폴더도 두 단계까지 본다: 윈도우 "압축 풀기"는 압축 이름으로 폴더를 하나 더 만들어 그 안에 푼다
// 메인 프로세스와 검사·압축 도구가 같이 쓰도록 Electron 없이 Node만 씀
const fs = require('fs');
const path = require('path');

const isGlb = (f) => f.toLowerCase().endsWith('.glb');

const SUBFOLDER_DEPTH = 2;

function modelFiles(dirs) {
  // 파일 이름 → 실제 경로. 폴더 순서대로, 같은 폴더 안에서는 얕은 곳 먼저
  function index() {
    const found = new Map();
    const walk = (dir, depth) => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return; // 아직 없는 폴더 (받은 학생 폴더는 처음엔 없음)
      }
      for (const e of entries) if (e.isFile() && isGlb(e.name) && !found.has(e.name)) found.set(e.name, path.join(dir, e.name));
      if (depth < SUBFOLDER_DEPTH) for (const e of entries) if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
    };
    for (const dir of dirs) walk(dir, 0);
    return found;
  }

  // 파일 이름 → 실제 경로 (없으면 null). 경로가 섞여 들어와도 이름만 봄
  function pathOf(file) {
    const name = path.basename(file ?? '');
    return (name && index().get(name)) ?? null;
  }

  const list = () => [...index().keys()].sort();

  // 펫으로 쓸 수 있는 모델: 카페 대기 동작이 있는 것 (이름에 cafe_idle이 들어간 동작. Hoshino (Battle)의 01_Cafe_Idle 포함)
  // 아리스(배틀) (Carrier)·(Scenario)처럼 동작 몇 개뿐인 장면용 모델은 학생 메뉴에서 뺀다 (애니메이션 보기 창에는 모두 나옴)
  // .glb 앞부분의 JSON만 읽어서 동작 이름을 본다
  const usableCache = new Map(); // 경로 → { mtime, usable }
  function usable(file) {
    const full = pathOf(file);
    if (!full) return false;
    try {
      const { mtimeMs } = fs.statSync(full);
      const hit = usableCache.get(full);
      if (hit?.mtime === mtimeMs) return hit.usable;
      const fd = fs.openSync(full, 'r');
      try {
        const head = Buffer.alloc(20);
        fs.readSync(fd, head, 0, 20, 0);
        const json = Buffer.alloc(head.readUInt32LE(12));
        fs.readSync(fd, json, 0, json.length, 20);
        const names = (JSON.parse(json.toString('utf8')).animations ?? []).map((a) => a.name ?? '');
        const result = names.some((n) => /cafe_idle/i.test(n));
        usableCache.set(full, { mtime: mtimeMs, usable: result });
        return result;
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return false;
    }
  }

  return { dirs, pathOf, list, usable, petModels: () => list().filter(usable) };
}

module.exports = { modelFiles };
