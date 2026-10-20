// 성능 재기: 펫 창과 같은 투명 창을 화면 밖에 띄워 상태별로 프레임 간격과 한 프레임에 드는 시간을 잰다 (정적 서버 불필요)
//   npx electron tools/perf-check.js ["모델.glb"] [--seconds=10]
// anim = 상태 머신 + 애니메이션 섞기, extra = 숨김·외곽선·밧줄·그림자, render = three.js 그리기(CPU),
// hit = 마우스 통과 판정(readPixels — GPU가 다 그릴 때까지 기다리므로 GPU 시간이 여기에 잡힘)
const { app, BrowserWindow } = require('electron');
const { serve, openPet, sleep } = require('./pet-page');

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion'); // 화면 밖이라도 가려진 창으로 보고 멈추지 않게
const model = process.argv.find((a) => a.endsWith('.glb')) ?? 'Hoshino.glb';
const SECONDS = Number(process.argv.find((a) => a.startsWith('--seconds='))?.slice(10)) || 10;

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
const avg = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
const r1 = (v) => Math.round(v * 10) / 10;

function summarize(name, log) {
  const gaps = log.slice(1).map((f, i) => f.at - log[i].at);
  const span = (log.at(-1).at - log[0].at) / 1000;
  const out = { name, fps: r1((log.length - 1) / span), gapAvg: r1(avg(gaps)), gapP95: r1(pct(gaps, 0.95)), gapMax: r1(Math.max(...gaps)), longGaps: gaps.filter((g) => g > 40).length };
  for (const k of ['anim', 'extra', 'render', 'hit']) out[k] = `${r1(avg(log.map((f) => f[k])))} / p95 ${r1(pct(log.map((f) => f[k]), 0.95))}`;
  out.hitches = log.slice(1).map((f, i) => [f.at - log[i].at, log[i].clip + ' → ' + f.clip]).filter(([g]) => g > 60).map(([g, c]) => `${Math.round(g)}ms ${c}`).join('; ');
  out.states = [...new Set(log.map((f) => f.state))].join(',');
  return out;
}

app.whenReady().then(async () => {
  const port = await serve();
  const win = new BrowserWindow({
    x: -6000, y: 100, width: 862, height: 538, useContentSize: true, transparent: true, frame: false, show: false,
    backgroundColor: '#00000000', webPreferences: { backgroundThrottling: false },
  });
  win.showInactive();
  const js = await openPet(win, port, model);
  console.log(model, 'dpr', await js('devicePixelRatio'));
  const scenes = [
    ['idle', '__pet.reset()'],
    // 마우스가 창 위에 있으면 매 프레임 픽셀을 읽는다 (창 안에만 보내는 가짜 이동)
    ['idle+hover', `__pet.reset(); window.dispatchEvent(new MouseEvent('mousemove', { clientX: 431, clientY: 300 }))`],
    ['walk', '__pet.reset(); __pet.walk()'],
    ['battle', '__pet.reset(); __pet.battleFor(60)'],
  ];
  const rows = [];
  for (const [name, setup] of scenes) {
    await js(setup);
    await sleep(500);
    await js('__pet.perfStart()');
    await sleep(SECONDS * 1000);
    rows.push(summarize(name, await js('__pet.perfStop()')));
  }
  console.table(rows);
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(1); });
