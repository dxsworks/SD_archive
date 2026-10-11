// 넘어가는 곳 재기 (화면 밖, 정적 서버 불필요): docs/data/transition-marks.json에 모아 둔 넘어가는 곳(없으면 펫을 빨리 돌려 모음)을
// 펫과 똑같이 넘기며(__pet.measure) 몸 전체가 더 도는 양과 바닥에 닿은 발이 미끄러지고 도는 양을 잰다.
// 뒤 동작만 틀 때 원래 움직이는 만큼은 뺀다. 결과는 docs/data/transition-metrics.json
// 사용: npx electron tools/transition-check.js ["모델.glb" …] [--turn=A]   (모델이 없으면 확인 창의 기본 네 학생)
//   --turn=A: 총 자세로 넘어갈 때 몸 방향 이어 받기(pet.js carryTurn)를 끄고 예전처럼 잼 → transition-metrics.turn-A.json
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { ROOT, wrap, serve, openPet, loadMarks, pairsOf, modelsFromArgs } = require('./pet-page');

const METRICS = path.join(ROOT, 'docs', 'data', 'transition-metrics.json');
const PX = 215; // 1 모델 단위 ≈ 215px (펫 창 기본 크기)
// 판단 (2026-10-12 사용자 표시 19곳에 맞춘 것): 총 든 자세 동작(Normal_/Stand_/Kneel_, 총 꺼내기 Public)으로 넘어가는데
// 그 동작은 별로 안 도는데 몸 전체가 50° 넘게 더 돌면 이상함. 평소 대기·승리 포즈·집어 들기처럼 정면 쪽 맨손 자세로 도는 것,
// 걷기·뛰기를 시작하며 가는 쪽으로 도는 것은 괜찮음 (걷다 멈추며 150° 돌아 정면을 봐도 사용자는 괜찮다고 함)
const GUN_POSE = /^(Normal|Stand|Kneel)\d*_|^(Normal\d*_)?Public\d*$/i;
const MOVING = /^(Cafe_Walk|Move_Ing|Move_Callsign|Move_Jump)/i;
const BAD_SPIN = 50;
const verdict = (to, { spin, own }) => (GUN_POSE.test(to) && !MOVING.test(to) && spin >= BAD_SPIN && own < spin ? 'bad' : 'ok');

// 몸 전체(허벅지 선)가 도는 총량(도)
const hipTravel = (frames) => frames.slice(1).reduce((s, f, i) => s + Math.abs(wrap(f.hip - frames[i].hip)), 0);
// 발마다 바닥에 닿아 있는 동안 밀린 거리(px)·발끝이 돈 각도(도). 닿음 = 그 발의 가장 낮은 높이 + 0.03 안
function footTravel(frames, ground) {
  return [0, 1].map((k) => {
    let slide = 0, twist = 0;
    for (let i = 1; i < frames.length; i++) {
      const [p, q] = [frames[i - 1].feet[k], frames[i].feet[k]];
      if (p.h > ground[k] || q.h > ground[k]) continue;
      slide += Math.hypot(q.x - p.x, q.z - p.z) * PX;
      twist += Math.abs(wrap(q.dir - p.dir));
    }
    return { slide, twist };
  });
}

function score(trans, alone) {
  const ground = [0, 1].map((k) => Math.min(...trans.concat(alone).map((f) => f.feet[k].h)) + 0.03);
  const ft = footTravel(trans, ground), fa = footTravel(alone, ground);
  return {
    spin: Math.round(hipTravel(trans) - hipTravel(alone)),                 // 몸 전체가 더 돈 양
    own: Math.round(hipTravel(alone)),                                      // 뒤 동작이 원래 도는 양 (크면 더 돈 것이 묻힘)
    gap: Math.round(Math.abs(wrap(trans[0].hip - alone[0].hip))),           // 넘어가는 순간 몸 방향 차이
    slide: Math.round(Math.max(...[0, 1].map((k) => ft[k].slide - fa[k].slide))), // 발이 더 밀린 거리(px)
    twist: Math.round(Math.max(...[0, 1].map((k) => ft[k].twist - fa[k].twist))), // 발끝이 더 돈 각도
  };
}

app.whenReady().then(async () => {
  const port = await serve();
  const turn = process.argv.find((a) => a.startsWith('--turn='))?.slice(7) === 'A' ? 'A' : 'C';
  const metricsFile = turn === 'C' ? METRICS : METRICS.replace(/\.json$/, `.turn-${turn}.json`);
  const marks = loadMarks();
  const out = fs.existsSync(metricsFile) ? JSON.parse(fs.readFileSync(metricsFile, 'utf8')) : {};
  const win = new BrowserWindow({ show: false, width: 862, height: 495, webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.on('console-message', (_e, level, m) => { if (level >= 3) console.log('[page]', m); });
  for (const model of modelsFromArgs()) {
    const js = await openPet(win, port, model);
    await pairsOf(js, model, marks);
    await js(`__pet.turnMode = '${turn}'`);
    const rows = [];
    for (const p of marks[model].pairs) {
      const per = [];
      for (const rec of p.examples) {
        const trans = await js(`__pet.measure(${JSON.stringify(rec)})`);
        const alone = await js(`__pet.measure(${JSON.stringify(rec)}, { alone: true })`);
        if (trans?.length && alone?.length) per.push(score(trans, alone));
      }
      if (!per.length) continue;
      const worst = (k) => Math.max(...per.map((s) => s[k]));
      const top = per.reduce((a, s) => (s.spin > a.spin ? s : a));
      rows.push({ key: p.key, count: p.count, mark: p.mark ?? null, verdict: verdict(p.to, top), spin: worst('spin'), own: per.reduce((a, s) => (s.spin > a.spin ? s : a)).own, gap: worst('gap'), slide: worst('slide'), twist: worst('twist'), examples: per });
    }
    out[model] = rows;
    console.log(`\n== ${model} (${rows.length}곳)  spin 몸 전체가 더 돈 양° · own 뒤 동작이 원래 도는 양° · gap 넘어갈 때 몸 방향 차이° · slide 발 밀림px · twist 발끝 더 돈°`);
    for (const r of [...rows].sort((a, b) => b.spin - a.spin)) {
      console.log(`${r.verdict === 'bad' ? '이상' : '    '} ${String(r.spin).padStart(4)} ${String(r.own).padStart(4)} ${String(r.gap).padStart(4)} ${String(r.slide).padStart(4)} ${String(r.twist).padStart(4)}  ${String(r.count).padStart(3)}번  ${r.key}${r.mark ? `  [${r.mark}]` : ''}`);
    }
  }
  fs.writeFileSync(metricsFile, `${JSON.stringify(out, null, 1)}\n`);
  app.quit();
});
