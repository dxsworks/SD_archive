// 합동 승리 앱 자료 만들기: 배치 도구에서 맞춘 자리(docs/data/joint-victory-placement.json, done이고 skip 아닌 조합)와
// 게임 표의 동작 이름을 합쳐 앱이 읽는 src/joint-victory.json으로.
//   node tools/make-joint-data.js
// 학생 모델 이름은 학생 메뉴와 같은 파일 이름("Hina (Dress).glb"), 합동 동작이 든 모델은 joint-glb/<같은 이름> (main.js jointFile)
const path = require('path');
const fs = require('fs');
const { combos, findCache } = require('./joint-combos');

const ROOT = path.resolve(__dirname, '..');
const placement = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'data', 'joint-victory-placement.json'), 'utf8'));
const out = [];
for (const c of combos(findCache(ROOT))) {
  const p = placement[c.id];
  if (!p?.done || p.skip) continue;
  out.push({
    id: c.id,
    members: c.members.map((m) => {
      const v = p.members.find((x) => x.name === m.name) ?? m.def;
      return { model: `${m.name}.glb`, start: m.start, end: m.end, x: v.x, z: v.z, deg: v.deg, flip: !!v.flip };
    }),
  });
}
const file = path.join(ROOT, 'src', 'joint-victory.json');
fs.writeFileSync(file, `${JSON.stringify({ _about: '합동 승리 조합 (tools/make-joint-data.js로 만듦, 손으로 고치지 않음). x·z·deg·flip은 조합 가운데 기준 학생 자리', combos: out }, null, 1)}\n`);
console.log(`${out.length}개 조합 → ${path.relative(ROOT, file)}`);
