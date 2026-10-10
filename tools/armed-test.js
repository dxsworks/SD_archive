// 잠깐 무장(총 든 대기 ↔ 총 든 동작 → 맨손 대기)을 화면 밖 창(바탕화면 흉내 모드)에서 돌려 동작 순서를 기록하는 개발용 스크립트
// 사용: (정적 서버가 8765에서 실행 중일 때) npx electron tools/armed-test.js <출력폴더> [무장 초]
//   처음 보는 동작마다 스냅샷
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2).filter((a) => !a.startsWith('-') && a !== '.' && !a.endsWith('armed-test.js'));
const outDir = path.resolve(args[0] ?? 'armed-out');
const seconds = Number(args[1] ?? 20);
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1440, height: 852, webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.setFrameRate(60);
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 2 && !message.includes('Security')) console.log('[page]', message); });
  await win.loadURL('http://localhost:8765/src/renderer/index.html?sim');
  const js = (code) => win.webContents.executeJavaScript(code);
  for (let i = 0; i < 50 && !(await js('Boolean(window.__pet?.state)')); i++) await sleep(200);
  await sleep(1000);

  await js(`__pet.armFor(${seconds}); 0`);
  const t0 = Date.now();
  const timeline = [];
  let last = '';
  let clicked = false;
  while (Date.now() - t0 < (seconds + 20) * 1000) {
    const { s, c, a, b } = JSON.parse(await js('JSON.stringify({ s: __pet.state, c: __pet.clip, a: __pet.armed, b: __pet.battle })'));
    const key = `${s}/${c}`;
    if (key !== last) {
      timeline.push(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s  ${s.padEnd(7)} ${c}${a ? `  [무장 남은 ${a.left}s]` : ''}${b ? '  [전투]' : ''}`);
      last = key;
      if (!fs.existsSync(path.join(outDir, `${c}.png`))) {
        await sleep(350);
        fs.writeFileSync(path.join(outDir, `${c}.png`), (await win.webContents.capturePage()).toPNG());
      }
    }
    // 무장 대기 중 한 번 클릭 반응 시험
    if (!clicked && s === 'armed' && Date.now() - t0 > 6000) { clicked = true; await js('__pet.react(); 0'); }
    if (s === 'idle' && !a && !b && Date.now() - t0 > 3000) break;
    await sleep(60);
  }
  console.log(timeline.join('\n'));
  app.quit();
});
