// 동작 시트 (화면 밖, 정적 서버 불필요): 펫이 그 학생에게 쓰는 동작(__pet.usedClips)마다 한 줄에 5장(__pet.sheet)
// 사용: npx electron tools/sheet-check.js "모델.glb" [출력.png]   (기본 reports/<모델>.sheet.png)
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { ROOT, serve, openPet } = require('./pet-page');

const [model = 'Hoshino.glb', out = path.join(ROOT, 'reports', `${model}.sheet.png`)] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.endsWith('sheet-check.js'));

app.whenReady().then(async () => {
  const port = await serve();
  const win = new BrowserWindow({ show: false, width: 862, height: 538, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const js = await openPet(win, port, model);
  const clips = await js('__pet.usedClips()');
  const png = await js(`__pet.sheet(${JSON.stringify(clips)})`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
  console.log(`${clips.length}개 동작 → ${out}`);
  app.quit();
}).catch((e) => { console.error(e); app.exit(1); });
