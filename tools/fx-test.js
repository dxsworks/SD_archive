// 클릭 효과 창(src/fx)을 화면 밖 창에서 띄워 클릭 → 끌기 → 놓기를 재생하고 시점별 스냅샷을 남기는 개발용 스크립트
// 사용: npx electron tools/fx-test.js <출력폴더> [효과 배율, 기본 0.5]
// 실제 앱과 같은 IPC 경로(fx:pointer)로 신호를 보낸다. 실제 바탕화면에는 영향이 없다.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const outDir = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('-') && a !== '.' && !a.endsWith('fx-test.js')) ?? 'fx-out');
fs.mkdirSync(outDir, { recursive: true });
const scale = process.argv.slice(2).find((a) => /^\d*\.?\d+$/.test(a)) ?? '0.5';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 800, height: 500,
    webPreferences: {
      offscreen: true, backgroundThrottling: false,
      preload: path.join(__dirname, '..', 'src', 'fx', 'preload.js'),
    },
  });
  win.webContents.setFrameRate(60);
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[page]', message); });
  await win.loadFile(path.join(__dirname, '..', 'src', 'fx', 'index.html'), { query: { test: '', scale } });
  const js = (code) => win.webContents.executeJavaScript(code);
  for (let i = 0; i < 50 && !(await js('Boolean(window.__fx)')); i++) await sleep(100);
  if (!(await js('Boolean(window.__fx)'))) { console.log('효과 창이 뜨지 않음'); app.exit(1); return; }

  const send = (type, x, y) => win.webContents.send('fx:pointer', type, x, y);
  const snap = async (name) => fs.writeFileSync(path.join(outDir, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  await sleep(500);
  const cfg = JSON.parse(await js('JSON.stringify((({ resolvedEffectBackend, resolvedBloomBackend, hostCompositingSurface, inputSource }) => ({ resolvedEffectBackend, resolvedBloomBackend, hostCompositingSurface, inputSource }))(__fx.fx.getConfig()))'));
  console.log('config', cfg);
  await snap('0-empty');

  // 1) 클릭만 (누르고 바로 놓기)
  send('down', 150, 150);
  await sleep(30);
  send('up');
  await sleep(120);
  await snap('1-click-0.15s');
  await sleep(250);
  await snap('2-click-0.4s');
  await sleep(1500);
  await snap('3-click-done');

  // 2) 끌기: 누른 채로 오른쪽 아래로 곡선을 그리며 이동 → 놓기
  send('down', 200, 300);
  for (let i = 1; i <= 30; i++) {
    const t = i / 30;
    send('move', Math.round(200 + 450 * t), Math.round(300 - 120 * Math.sin(Math.PI * t)));
    await sleep(16);
  }
  await snap('4-dragging');
  send('up');
  await sleep(150);
  await snap('5-released-0.15s');
  await sleep(1500);
  await snap('6-drag-done');

  // 3) up을 못 받은 채로 다시 누르기 → 그래도 효과가 나야 함
  send('down', 600, 120);
  await sleep(150);
  send('down', 650, 160);
  await sleep(150);
  await snap('7-down-without-up');
  send('cancel');
  await sleep(300);
  await snap('8-cancelled');

  console.log('saved to', outDir);
  app.exit(0);
});
