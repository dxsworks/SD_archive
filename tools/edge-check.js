// 창 끝 검사 (화면 밖, 정적 서버 불필요): 펫이 그 학생에게 쓰는 동작이 펫 창(보통 크기 862×538) 안에 드는지
//   1) 펫을 펫 시간 30분 빨리 돌려 실제로 넘어간 곳(transition-marks.json, 없으면 모음)을 펫과 같은 방향·자세로 넘겨
//      뒤 동작이 끝날 때까지 그려 보고(__pet.edges) 모델이 창 위·왼쪽·오른쪽 끝에서 몇 px 떨어지는지 잰다
//   2) 그동안 안 나온 동작(드문 EX 변형, 승리 포즈 _Random 등, __pet.usedClips)은 그 동작이 나올 만한 방향 몇 개로 따로 잰다
//   바닥에서 가장 가까운 자리(모델이 가장 크게 보임)에 세워 잰다. 작게·크게 창은 같은 비율이라 px만 비례해서 달라진다
//   경고: 위 여유 35px 미만(CLAUDE.md), 옆·아래 여유 3px 미만(닿아서 잘림). 아래는 발밑 그림자를 빼고 잰다. 밧줄 종료(Vital_Retreat)는 창이 몸을 따라가서 안 봄
// 사용: npx electron tools/edge-check.js ["모델.glb" …] [--window=가로x세로@높이]   (모델이 없으면 기본 네 학생) → docs/data/edge-check.json
//   --window: 다른 창 크기로 (예: 예전 창 --window=560x280@1.3 = 560×280px에 1.3단위). 결과는 저장하지 않음
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { ROOT, serve, openPet, loadMarks, pairsOf, modelsFromArgs } = require('./pet-page');

const OUT = path.join(ROOT, 'docs', 'data', 'edge-check.json');
const TOP_MIN = 35;
const SIDE_MIN = 3; // 옆·아래
const SKIP = /^Vital_Retreat/i;
const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;

// 흉내 중에 안 나온 동작을 잴 방향(도)과 높이: 평소 동작은 정면 ±30°, 총·EX 동작은 전투 방향 40~80°(얼굴 보이게 더 돌리는 것 포함),
// 걷기·뛰기는 아무 방향, 집어 들기는 들린 높이
function extraCases(clip) {
  if (/^(Cafe_Walk|Move_Ing|Move_Callsign|Move_Jump)/i.test(clip)) return [0, 90, -90, 180].map((f) => [f, 0]);
  if (/^Formation_Pickup/i.test(clip)) return [[0, 0.3]];
  if (/^(Normal|Stand|Kneel|Move_End|Exs)/i.test(clip) || /Public/i.test(clip)) return [-80, -40, 40, 80].map((f) => [f, 0]);
  return [-30, 0, 30].map((f) => [f, 0]);
}

app.whenReady().then(async () => {
  const port = await serve();
  const marks = loadMarks();
  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const size = /^--window=(\d+)x(\d+)@([\d.]+)$/.exec(process.argv.find((a) => a.startsWith('--window=')) ?? '');
  const [W, H] = size ? [+size[1], +size[2]] : [862, 538];
  const query = size ? `&window=${W}x${H}&viewHeight=${size[3]}&footMargin=0.03` : '';
  const win = new BrowserWindow({ show: false, width: W, height: H, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.on('console-message', (_e, level, m) => { if (level >= 3) console.log('[page]', m); });
  let bad = 0;
  for (const model of modelsFromArgs()) {
    const js = await openPet(win, port, model, query);
    const pairs = await pairsOf(js, model, marks);
    const cases = new Map(); // 같은 동작·방향(10° 단위)·높이는 한 번만
    for (const p of pairs) {
      for (const rec of p.examples) {
        if (SKIP.test(rec.to)) continue;
        const key = `${rec.to}|${Math.round(deg(rec.yawBefore) / 10)}|${Math.round(deg(rec.faceAfter) / 10)}|${rec.lift > 0}|${rec.pivotTarget.join()}`;
        if (!cases.has(key)) cases.set(key, { clip: rec.to, how: `${p.from} 다음`, rec, alone: false });
      }
    }
    const seen = new Set([...cases.values()].map((c) => c.clip));
    const missing = (await js('__pet.usedClips()')).filter((c) => !seen.has(c) && !SKIP.test(c));
    for (const clip of missing) {
      if (/^Vital_Death/i.test(clip)) { // 낮잠은 방향·자리가 정해져 있음
        cases.set(clip, { clip, how: '흉내에 안 나옴, 낮잠 자리', rec: await js(`__pet.poseRec('${clip}')`), alone: true });
        continue;
      }
      for (const [face, lift] of extraCases(clip)) {
        const rec = { ...(await js(`__pet.poseRec('${clip}', ${face})`)), lift };
        cases.set(`${clip}|${face}|${lift}`, { clip, how: `흉내에 안 나옴, 방향 ${face}°${lift ? ` 높이 ${lift}` : ''}`, rec, alone: true });
      }
    }
    const rows = [];
    for (const c of cases.values()) {
      const m = await js(`__pet.edges(${JSON.stringify(c.rec)}, { alone: ${c.alone} })`);
      if (m) rows.push({ clip: c.clip, how: c.how, ...m });
    }
    // 동작마다 가장 가까운 값만
    const byClip = new Map();
    for (const r of rows) {
      const b = byClip.get(r.clip) ?? { clip: r.clip, top: Infinity, left: Infinity, right: Infinity, bottom: Infinity,
        body: { top: Infinity, left: Infinity, right: Infinity, bottom: Infinity } };
      for (const k of ['top', 'left', 'right', 'bottom']) {
        if (r[k] < b[k]) Object.assign(b, { [k]: r[k], [`${k}At`]: r[`${k}At`], [`${k}How`]: r.how });
        b.body[k] = Math.min(b.body[k], r.body[k]);
      }
      byClip.set(r.clip, b);
    }
    const SIDES = { top: ['위', TOP_MIN], left: ['왼쪽', SIDE_MIN], right: ['오른쪽', SIDE_MIN], bottom: ['아래', SIDE_MIN] };
    const list = [...byClip.values()].map((b) => ({
      ...b, warn: Object.entries(SIDES).filter(([k, [, min]]) => b[k] < min).map(([k, [name]]) => `${name} ${b[k]}px (${b[`${k}How`]}, ${b[`${k}At`]}초)`),
      // 총·방패를 빼면 괜찮은 쪽 (check-student.js가 알고 둔 것으로 셈)
      gunOnly: Object.entries(SIDES).filter(([k, [, min]]) => b[k] < min && b.body[k] >= min).map(([, [name]]) => name),
    })).sort((a, b) => Math.min(a.top - TOP_MIN, a.left, a.right, a.bottom) - Math.min(b.top - TOP_MIN, b.left, b.right, b.bottom));
    out[model] = list;
    const warned = list.filter((b) => b.warn.length);
    bad += warned.length;
    console.log(`\n== ${model}: 동작 ${list.length}개 (흉내에서 ${list.length - missing.length}개 + 따로 ${missing.length}개), 경우 ${rows.length}개 — 경고 ${warned.length}개`);
    for (const b of list.slice(0, 8)) {
      console.log(`${b.warn.length ? '경고' : '    '} ${b.clip.padEnd(24)} 위 ${String(b.top).padStart(4)}  왼 ${String(b.left).padStart(4)}  오 ${String(b.right).padStart(4)}  아래 ${String(b.bottom).padStart(4)}${b.warn.length ? `   ← ${b.warn.join(', ')}` : ''}${b.gunOnly.length ? ` (총만: ${b.gunOnly.join(', ')})` : ''}`);
    }
  }
  if (!size) fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`\n경고 ${bad}개.${size ? '' : ' 전체 결과: docs/data/edge-check.json'}`);
  app.quit();
});
