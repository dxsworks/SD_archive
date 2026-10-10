// 종료 후퇴 동작을 화면 밖 창(바탕화면 흉내 모드)에서 시험하고 스냅샷을 저장하는 개발용 스크립트
// 사용: (정적 서버가 8765에서 실행 중일 때) npx electron tools/retreat-test.js <출력폴더>
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const outDir = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('-') && a !== '.' && !a.endsWith('retreat-test.js')) ?? 'retreat-out');
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1440, height: 852, webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.setFrameRate(60);
  await win.loadURL('http://localhost:8765/src/renderer/index.html?sim');
  const js = (code) => win.webContents.executeJavaScript(code);
  for (let i = 0; i < 50 && !(await js('Boolean(window.__pet?.state)')); i++) await sleep(200);
  await sleep(1000);

  const log = [];
  const t0 = Date.now();
  await js('__pet.retreat(); 0');
  for (const at of [300, 900, 1500, 2100, 2500, 3000]) {
    await sleep(at - (Date.now() - t0));
    const info = JSON.parse(await js(`JSON.stringify({ s: __pet.state, c: __pet.clip, p: __pet.floorPos, o: document.getElementById('pet').style.opacity, l: document.getElementById('pet').style.left, t: document.getElementById('pet').style.top })`));
    log.push(`${at}ms state=${info.s} clip=${info.c} scale=${info.p.scale.toFixed(2)} opacity=${info.o} win=(${info.l}, ${info.t})`);
    fs.writeFileSync(path.join(outDir, `${at}.png`), (await win.webContents.capturePage()).toPNG());
  }
  console.log(log.join('\n'));
  app.quit();
});
