// 전투 모드를 화면 밖 창(바탕화면 흉내 모드)에서 돌려 동작 순서를 기록하고 스냅샷을 저장하는 개발용 스크립트
// 사용: (정적 서버가 8765에서 실행 중일 때) npx electron tools/battle-test.js <출력폴더> [전투 초]
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2).filter((a) => !a.startsWith('-') && a !== '.' && !a.endsWith('battle-test.js'));
const outDir = path.resolve(args[0] ?? 'battle-out');
const seconds = Number(args[1] ?? 40);
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

  await js(`__pet.battleFor(${seconds}); 0`);
  const t0 = Date.now();
  const timeline = [];
  let last = '';
  let shot = 0;
  while (Date.now() - t0 < (seconds + 15) * 1000) {
    const cur = await js('JSON.stringify({ s: __pet.state, c: __pet.clip, b: __pet.battle })');
    const { s, c, b } = JSON.parse(cur);
    const key = `${s}/${c}`;
    if (key !== last) {
      timeline.push(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s  ${s.padEnd(7)} ${c}${b ? `  [${b.stance}, 탄약 ${b.ammo}, 남은 ${b.left}s]` : ''}`);
      last = key;
      // 처음 보는 동작이면 스냅샷
      if (!fs.existsSync(path.join(outDir, `${c}.png`)) && shot < 30) {
        await sleep(350);
        fs.writeFileSync(path.join(outDir, `${c}.png`), (await win.webContents.capturePage()).toPNG());
        shot++;
      }
    }
    if (s === 'idle' && !b && Date.now() - t0 > 3000) break;
    await sleep(60);
  }
  console.log(timeline.join('\n'));
  app.quit();
});
