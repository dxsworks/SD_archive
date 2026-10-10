// 애니메이션 시트를 PNG로 저장하는 개발용 스크립트
// 사용: npx electron tools/render-sheet.js <출력.png> "<쿼리스트링>"
//   예: npx electron tools/render-sheet.js sheet.png "filter=^Cafe&cols=1&frames=6"
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const [out = 'sheet.png', query = ''] = process.argv.slice(2).filter((a) => !a.startsWith('--') && a !== '.' && !a.endsWith('render-sheet.js'));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1400, height: 800, webPreferences: { offscreen: false } });
  await win.loadFile(path.join(__dirname, 'anim-sheet.html'), { search: query });
  for (let i = 0; i < 100; i++) {
    if ((await win.webContents.executeJavaScript('document.title')) === 'done') break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const dataUrl = await win.webContents.executeJavaScript('document.getElementById("sheet").toDataURL("image/png")');
  fs.writeFileSync(path.resolve(out), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('saved', path.resolve(out));
  app.quit();
});
