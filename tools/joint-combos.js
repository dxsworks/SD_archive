// 합동 승리 조합 목록: game-cache의 게임 표·조합 계획으로 조합마다 학생·동작 이름·처음 자리를 만든다.
// 배치 도구(tools/joint-placer.js)와 앱 자료 만들기(tools/make-joint-data.js)가 같이 씀
const path = require('path');
const fs = require('fs');

// game-cache는 메인 폴더에만 있음(worktree에서 돌려도 찾게 위로 올라가며 찾음)
function findCache(from) {
  for (let d = from; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'game-cache', 'joint-glb'))) return path.join(d, 'game-cache');
    if (path.dirname(d) === d) throw new Error('game-cache/joint-glb 폴더를 찾지 못함');
  }
}

// 처음 자리(우리 좌표 x, z, 회전도): game-cache/tools/build_slots.py와 같은 값.
// 공격 학생 자리 1~4(First/Second/Third/Leader), 지원(스페셜) 학생은 Support_* (z 0.41)
const MAIN = { 1: [-0.9, 0, 20], 2: [-0.3, 0, 5], 3: [0.3, 0, 5], 4: [0.9, 0, -20] };
const SUP = { 1: [0.37, 0.41, 5], 2: [-0.37, 0.41, -5], 3: [-0.37, 0.41, -5], 4: [-0.37, 0.41, -5], 5: [-0.37, 0.41, -5], 6: [-0.37, 0.41, -5] };
const NOTES = {};
// 표의 동작 이름 → 우리 복사본의 이름 (game-cache/tools/build_all.py와 같은 규칙)
const ourClip = (p) => {
  const m = /Victory_(Start|End)_interaction(_0\d)?$/i.exec(p.split('/').pop());
  return m && `Victory_${m[1]}_Interaction${m[2] ?? ''}`;
};

function combos(CACHE) {
  const plan = JSON.parse(fs.readFileSync(path.join(CACHE, 'joint-slot', 'plan.json'), 'utf8'));
  let rows = JSON.parse(fs.readFileSync(path.join(CACHE, 'tables-victory-interaction.json'), 'utf8'));
  rows = rows.DataList ?? rows;
  return plan.map((p) => {
    const row = rows.find((r) => r.InteractionId === p.row);
    const members = p.members.map((m) => {
      const name = path.basename(m.model).replace(/ r\d+\.glb$/, '');
      let start = 'Victory_Start_Interaction';
      let end = 'Victory_End_Interaction';
      for (let i = 1; i <= 6 && row; i++) {
        if (row[`VictoryStartAnimationPath0${i}`]?.split('/')[0].toLowerCase() !== m.cid) continue;
        start = ourClip(row[`VictoryStartAnimationPath0${i}`]) ?? start;
        end = ourClip(row[`VictoryEndAnimationPath0${i}`]) ?? end;
      }
      const [x, z, deg] = (m.special ? SUP : MAIN)[m.idx];
      return { name, cid: m.cid, idx: m.idx, special: m.special, file: `joint-glb/${name}.glb`, start, end, def: { x, z, deg, flip: false } };
    });
    return { id: String(p.row), members, note: NOTES[p.row] ?? '' };
  });
}


module.exports = { combos, findCache };
