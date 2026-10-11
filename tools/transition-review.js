// 넘어가는 곳 확인 창: 펫이 실제로 동작을 이어 트는 곳을 모아(펫 상태 머신을 빨리 돌려 기록) 하나씩 펫과 똑같이 다시 틀어 주고,
// 사람이 "이상함 / 괜찮음 / 모르겠음"을 표시한다. 표시는 docs/data/transition-marks.json에 저장(다음에 열면 이어서)
// 사용: npx electron tools/transition-review.js   (정적 서버 불필요, 이 창 안에서만 클릭)
const { app, BrowserWindow, ipcMain } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('disable-http-cache');
const ROOT = path.resolve(__dirname, '..');
const MARKS = path.join(ROOT, 'docs', 'data', 'transition-marks.json');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary' };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

ipcMain.handle('models', () => fs.readdirSync(path.join(ROOT, 'models')).filter((f) => f.endsWith('.glb')));
ipcMain.handle('load', () => (fs.existsSync(MARKS) ? JSON.parse(fs.readFileSync(MARKS, 'utf8')) : {}));
ipcMain.handle('save', (_e, data) => fs.writeFileSync(MARKS, `${JSON.stringify(data, null, 1)}\n`));

app.whenReady().then(async () => {
  const port = await serve();
  const win = new BrowserWindow({
    width: 1380, height: 860, title: '넘어가는 곳 확인',
    webPreferences: { preload: path.join(__dirname, 'transition-review-preload.js'), backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[page]', message); });
  await win.loadURL(`http://127.0.0.1:${port}/tools/transition-review.html`);
});
app.on('window-all-closed', () => app.quit());
