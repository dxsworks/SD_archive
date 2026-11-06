// 학생 얼굴 아이콘 만들기: 우클릭 메뉴 "합동 승리" 줄(src/menu)에 쓰는 동그란 얼굴. 합동 승리 조합 학생(src/joint-victory.json)마다
// 평소 대기(Cafe_Idle) 첫 자세의 머리를 화면 밖 창에서 그려 src/menu/faces/<학생 파일 이름>.png(128px, 투명 바탕)로.
//   npx electron tools/make-faces.js ["모델.glb" …]
process.on('uncaughtException', (e) => { console.error(e); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error(e); process.exit(1); });
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'menu', 'faces');
const { modelFiles } = require(path.join(ROOT, 'src', 'model-files'));
const files = modelFiles([path.join(app.getPath('appData'), 'bluearchive-desktop-pet', 'models'), path.join(ROOT, 'models'), path.join(ROOT, 'pack-cache')]);
const asked = process.argv.slice(2).filter((a) => a.endsWith('.glb'));
const models = asked.length ? asked : [...new Set(require(path.join(ROOT, 'src', 'joint-victory.json')).combos.flatMap((c) => c.members.map((m) => m.model)))];

ipcMain.handle('read', (_e, name) => {
  const file = files.pathOf(name);
  if (!file) throw new Error(`학생 파일이 없음: ${name}`);
  return fs.readFileSync(file);
});
ipcMain.handle('save', (_e, name, dataUrl) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name.replace(/\.glb$/i, '.png')), Buffer.from(dataUrl.split(',')[1], 'base64'));
});

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 256, height: 256, useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(__dirname, 'make-faces-preload.js') },
  });
  win.webContents.on('console-message', (_e, level, m) => { if (level >= 2) console.log('[page]', m); });
  await win.loadFile(path.join(__dirname, 'make-faces.html'));
  for (const name of models) {
    const r = await win.webContents.executeJavaScript(`window.face(${JSON.stringify(name)})`).catch((e) => String(e));
    console.log(name, r);
  }
  app.exit(0);
});
