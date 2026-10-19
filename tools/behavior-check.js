// 행동 테스트 (화면 밖, 정적 서버 불필요, 학생 하나에 몇 초): 펫을 가상 시계로 빨리 돌려(__pet.run)
//   1) 명령마다 대기로 돌아오는지: 클릭 반응·잠깐 무장·더블클릭 EX·낮잠 → 깨우기·전투·집어 들었다 놓기·걷기, 종료는 사라지는지
//   2) 펫 시간 30분(사람 손 섞음) 동안 한 상태에 너무 오래 머무는 곳(멈춤)이 없는지, 페이지 오류가 없는지
// 사용: npx electron tools/behavior-check.js ["모델.glb" …]   (모델이 없으면 기본 네 학생) → docs/data/behavior-check.json
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { ROOT, serve, openPet, modelsFromArgs } = require('./pet-page');

const OUT = path.join(ROOT, 'docs', 'data', 'behavior-check.json');
// [이름, 시작 명령, 끝났다고 볼 상태, 제한 시간(펫 초), 중간에 할 것]
const TESTS = [
  ['클릭 반응', '__pet.react()', 'idle', 20],
  ['클릭 반응 (두 번째)', '__pet.react()', 'idle', 20],
  ['잠깐 무장 (5초)', '__pet.armFor(5)', 'idle', 60],
  ['더블클릭 EX → 전투', '__pet.doubleClick()', 'idle', 150],
  ['낮잠 → 클릭으로 깨우기', '__pet.nap()', 'idle', 20, { after: 3, then: '__pet.react()', expect: 'nap' }],
  ['전투 (20초)', '__pet.battleFor(20)', 'idle', 60],
  ['집어 들었다 놓기', '__pet.grab()', 'idle', 10, { after: 1, then: '__pet.release()', expect: 'drag' }],
  ['걷기', '__pet.walk()', 'idle', 20],
  ['종료 (밧줄)', '__pet.retreat()', 'gone', 6],
];
// 한 상태에 이보다 오래 있으면 멈춘 것으로 본다 (펫 초). 대기·무장 대기·전투 대기·낮잠은 같은 대기를 다시 고르면 이어지므로 넉넉히
// (무장은 최대 40초, 전투 대기 1.2~3.5초씩, 낮잠 20~45초), 한 번 트는 동작·걷기·뛰기는 그 길이 + 여유
const STUCK = { idle: 60, armed: 60, battle: 15, nap: 50, action: 20, ex: 15, walk: 12, run: 8, fall: 3, drag: 3 };
const SIM_SECONDS = 1800;

app.whenReady().then(async () => {
  const port = await serve();
  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const win = new BrowserWindow({ show: false, width: 862, height: 538, webPreferences: { offscreen: true, backgroundThrottling: false } });
  let errors = [];
  win.webContents.on('console-message', (_e, level, m) => { if (level >= 3) errors.push(m); });
  let failed = 0;
  for (const model of modelsFromArgs()) {
    errors = [];
    const js = await openPet(win, port, model);
    const tests = [];
    for (const [name, start, until, limit, mid] of TESTS) {
      await js('__pet.reset(); 0');
      await js(`${start}; 0`);
      let trace = [];
      let ok = true, why = '';
      try {
        if (mid) {
          trace = await js(`__pet.run(${mid.after})`);
          const st = await js('__pet.state');
          if (st !== mid.expect) { ok = false; why = `${mid.after}초 뒤 상태가 ${mid.expect}가 아니라 ${st}`; }
          await js(`${mid.then}; 0`);
        }
        const rest = await js(`__pet.run(${limit}, { until: '${until}' })`);
        trace = trace.concat(rest.map((r) => ({ ...r, t: +(r.t + (mid?.after ?? 0)).toFixed(2) })));
        const st = await js('__pet.state');
        if (ok && st !== until) { ok = false; why = `${limit}초 안에 ${until}로 안 돌아옴 (지금 ${st})`; }
      } catch (e) {
        ok = false; why = `오류: ${e.message}`;
      }
      const clips = [...new Set(trace.map((r) => r.clip))];
      const time = trace.length ? trace[trace.length - 1].t : 0;
      tests.push({ name, ok, why, time, clips });
      if (!ok) failed++;
    }
    // 30분 동안 멈춘 곳 찾기
    await js('__pet.reset(); 0');
    const trace = await js(`__pet.run(${SIM_SECONDS}, { pokes: true })`);
    const longest = {};
    const stuck = [];
    let from = 0;
    for (let i = 1; i <= trace.length; i++) {
      const cur = trace[i - 1].state;
      if (i < trace.length && trace[i].state === cur && !trace[i].poke) continue; // 사람 손이 들어간 곳(poke)에서는 끊어 잰다
      const end = i < trace.length ? trace[i].t : SIM_SECONDS;
      const dur = +(end - trace[from].t).toFixed(1);
      if (dur > (longest[cur]?.dur ?? -1)) longest[cur] = { dur, at: trace[from].t, clip: trace[from].clip };
      if (STUCK[cur] !== undefined && dur > STUCK[cur] && i < trace.length) stuck.push({ state: cur, dur, at: trace[from].t, clip: trace[from].clip });
      if (!(cur in STUCK)) stuck.push({ state: cur, dur, at: trace[from].t, clip: trace[from].clip, unknown: true });
      from = i;
    }
    failed += stuck.length + errors.length;
    out[model] = { tests, longest, stuck, errors: [...new Set(errors)] };
    console.log(`\n== ${model}`);
    for (const t of tests) console.log(`${t.ok ? '  ok ' : '실패 '} ${t.name.padEnd(16)} ${String(t.time).padStart(6)}초  ${t.ok ? t.clips.join(' → ') : t.why}`);
    console.log(`  30분: ${Object.entries(longest).map(([s, l]) => `${s} 최대 ${l.dur}초`).join(', ')}`);
    for (const s of stuck) console.log(`멈춤 ${s.state} ${s.dur}초 (${s.at}초부터, ${s.clip})${s.unknown ? ' — 모르는 상태' : ''}`);
    for (const e of out[model].errors) console.log(`오류 ${e}`);
  }
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`\n실패·멈춤·오류 ${failed}개.`);
  app.quit();
});
