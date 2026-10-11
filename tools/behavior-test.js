// 펫 렌더러를 화면 밖 창에서 띄워 행동 전환을 시험하고 스냅샷을 저장하는 개발용 스크립트
// 사용: (정적 서버가 8765에서 실행 중일 때) npx electron tools/behavior-test.js <출력폴더>
const { app, BrowserWindow } = require('electron');
const path = require('path');
const petUrl = require('./pet-url');
const fs = require('fs');

const outDir = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('-') && a !== '.' && !a.endsWith('behavior-test.js')) ?? 'behavior-out');
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 862,
    height: 495,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  win.webContents.setFrameRate(60);
  await win.loadURL(petUrl());
  const js = (code) => win.webContents.executeJavaScript(code);
  for (let i = 0; i < 50 && !(await js('Boolean(window.__pet?.state)')); i++) await sleep(200);
  await sleep(1500);

  const log = [];
  const snap = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
  };
  const waitIdle = async (label, timeoutMs) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if ((await js('__pet.state')) === 'idle') { log.push(`${label}: idle 복귀 ${Date.now() - t0}ms`); return; }
      await sleep(100);
    }
    log.push(`${label}: ${timeoutMs}ms 안에 idle로 돌아오지 않음 (state=${await js('__pet.state')})`);
  };

  // 랜덤 행동(fidget)은 총을 꺼내 15~40초 무장하므로 시험에선 3초짜리 무장(armFor)으로 대신한다
  for (const [cmd, call] of [['react', 'react()'], ['react', 'react()'], ['armed', 'armFor(3)'], ['ex', 'ex()']]) {
    await js(`__pet.${call}`);
    await sleep(900);
    await snap(`${log.length}-${cmd}`);
    await waitIdle(cmd, 20000);
  }
  await js('__pet.nap()');
  await sleep(2500);
  await snap('nap');
  log.push(`nap 상태: ${await js('__pet.state')}`);
  await js('__pet.react()');
  await sleep(500);
  await snap('wake');
  await waitIdle('wake', 6000);

  console.log(log.join('\n'));
  app.quit();
});
