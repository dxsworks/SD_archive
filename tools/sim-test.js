// 바탕화면 흉내 모드(?sim)를 화면 밖 창에서 띄워 걷기·드래그를 시험하는 개발용 스크립트
// 사용: (정적 서버가 8765에서 실행 중일 때) npx electron tools/sim-test.js <출력폴더>
// 마우스 입력은 이 창 안에만 보내므로 실제 바탕화면에는 영향이 없다.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const outDir = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('-') && a !== '.' && !a.endsWith('sim-test.js')) ?? 'sim-out');
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 1440, height: 852,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  win.webContents.setFrameRate(60);
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[page]', message); });
  await win.loadURL('http://localhost:8765/src/renderer/index.html?sim');
  const js = (code) => win.webContents.executeJavaScript(code);
  for (let i = 0; i < 50 && !(await js('Boolean(window.__pet?.state)')); i++) await sleep(200);
  await js('__pet.toIdle?.(); 0');
  await sleep(1000);

  const log = [];
  const info = async (label) => {
    const p = await js('JSON.stringify(__pet.floorPos)');
    const box = await js('JSON.stringify((({left, top}) => ({left, top}))(document.getElementById("pet").style))');
    log.push(`${label}: state=${await js('__pet.state')} pos=${p} win=${box}`);
  };
  const snap = async (name) => fs.writeFileSync(path.join(outDir, `${name}.png`), (await win.webContents.capturePage()).toPNG());

  // 1) 걷기: 여러 번 걸으며 위치/크기/방향 기록 (중간 스냅샷)
  await info('start');
  await snap('0-start');
  for (let i = 1; i <= 4; i++) {
    await js('__pet.walk()');
    await sleep(1500);
    await info(`walk${i} mid`);
    await snap(`${i}-walk-mid`);
    for (let t = 0; t < 120 && (await js('__pet.state')) === 'walk'; t++) await sleep(100);
    await info(`walk${i} end`);
  }

  // 2) 드래그: 캐릭터 몸통을 잡아 화면 위쪽(먼 곳)으로 옮겼다가 놓기
  const rect = JSON.parse(await js('JSON.stringify(document.getElementById("pet").getBoundingClientRect())'));
  const sx = Math.round(rect.left + rect.width / 2), sy = Math.round(rect.top + rect.height * 0.6);
  const send = (type, x, y) => win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
  send('mouseMove', sx, sy);
  await sleep(200);
  send('mouseDown', sx, sy);
  const tx = 500, ty = 330;
  for (let i = 1; i <= 30; i++) {
    send('mouseMove', Math.round(sx + ((tx - sx) * i) / 30), Math.round(sy + ((ty - sy) * i) / 30));
    await sleep(25);
  }
  await sleep(400);
  await info('dragging');
  await snap('5-dragging');
  send('mouseUp', tx, ty);
  await sleep(1200);
  await info('dropped');
  await snap('6-dropped');

  console.log(log.join('\n'));
  app.quit();
});
