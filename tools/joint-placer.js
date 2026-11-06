// 합동 승리 배치 도구: 게임에서 뽑은 합동 승리 동작(Victory_Start_Interaction → Victory_End_Interaction)을
// 조합의 학생들과 한 장면에 같이 틀고, 사람이 학생마다 자리(x, z)·방향(도)·거울 뒤집기를 맞춰 저장한다.
//   npx electron tools/joint-placer.js                      창 열기 (사람이 씀)
//   npx electron tools/joint-placer.js --record=<폴더> [--rows=1,3] [--fps=12] [--size=1280x720]
//                                                           화면 밖에서 저장한 자리로 조합마다 한 바퀴 찍어 PNG(<폴더>/r<번호>/)로
//   --out=<파일>  저장 파일(기본 docs/data/joint-victory-placement.json)
// 자료: 프로젝트 폴더(또는 위 폴더)의 game-cache/ (git 제외): joint-glb/<모델>.glb(동작만 넣은 복사본), joint-slot/plan.json(조합),
//       tables-victory-interaction.json(게임 표: 학생마다 어느 동작 이름인지)
process.on('uncaughtException', (e) => { console.error(e); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error(e); process.exit(1); });
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('disable-http-cache');
const ROOT = path.resolve(__dirname, '..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const OUT = path.resolve(arg('out') ?? path.join(ROOT, 'docs', 'data', 'joint-victory-placement.json'));
const RECORD = arg('record');

// game-cache는 메인 폴더에만 있음(worktree에서 돌려도 찾게 위로 올라가며 찾음)
function findCache() {
  for (let d = ROOT; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'game-cache', 'joint-glb'))) return path.join(d, 'game-cache');
    if (path.dirname(d) === d) throw new Error('game-cache/joint-glb 폴더를 찾지 못함');
  }
}
const CACHE = findCache();

// 처음 자리(우리 좌표 x, z, 회전도): game-cache/tools/build_slots.py와 같은 값.
// 공격 학생 자리 1~4(First/Second/Third/Leader), 지원(스페셜) 학생은 Support_* (z 0.41)
const MAIN = { 1: [-0.9, 0, 20], 2: [-0.3, 0, 5], 3: [0.3, 0, 5], 4: [0.9, 0, -20] };
const SUP = { 1: [0.37, 0.41, 5], 2: [-0.37, 0.41, -5], 3: [-0.37, 0.41, -5], 4: [-0.37, 0.41, -5], 5: [-0.37, 0.41, -5], 6: [-0.37, 0.41, -5] };
const NOTES = {
  13: '게임에선 케이가 따로 있는 기계 장비(carrier) 위에 올라탐: 장비가 없어 불완전',
};
// 표의 동작 이름 → 우리 복사본의 이름 (game-cache/tools/build_all.py와 같은 규칙)
const ourClip = (p) => {
  const m = /Victory_(Start|End)_interaction(_0\d)?$/i.exec(p.split('/').pop());
  return m && `Victory_${m[1]}_Interaction${m[2] ?? ''}`;
};

function combos() {
  const plan = JSON.parse(fs.readFileSync(path.join(CACHE, 'joint-slot', 'plan.json'), 'utf8'));
  let rows = JSON.parse(fs.readFileSync(path.join(CACHE, 'tables-victory-interaction.json'), 'utf8'));
  rows = rows.DataList ?? rows;
  return plan.map((p) => {
    const row = rows.find((r) => r.InteractionId === p.row);
    const members = p.members.map((m) => {
      const name = path.basename(m.model).replace(/ r\d+\.glb$/, '');
      let start = 'Victory_Start_Interaction';
      let end = 'Victory_End_Interaction';
      for (let i = 1; i <= 6 && row; i++) {
        if (row[`VictoryStartAnimationPath0${i}`]?.split('/')[0].toLowerCase() !== m.cid) continue;
        start = ourClip(row[`VictoryStartAnimationPath0${i}`]) ?? start;
        end = ourClip(row[`VictoryEndAnimationPath0${i}`]) ?? end;
      }
      const [x, z, deg] = (m.special ? SUP : MAIN)[m.idx];
      return { name, cid: m.cid, idx: m.idx, special: m.special, file: `joint-glb/${name}.glb`, start, end, def: { x, z, deg, flip: false } };
    });
    return { id: String(p.row), members, note: NOTES[p.row] ?? '' };
  });
}

const load = () => (fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {});
function save(data) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(data, null, 1)}\n`);
  return OUT;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary' };
function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const [base, rel] = url.startsWith('/game-cache/') ? [CACHE, url.slice('/game-cache/'.length)] : [ROOT, url];
    const file = path.join(base, rel);
    if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

ipcMain.handle('combos', () => combos());
ipcMain.handle('load', () => load());
ipcMain.handle('save', (_e, data) => save(data));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function record(port) {
  const [w, h] = (arg('size') ?? '1280x720').split('x').map(Number);
  const fps = Number(arg('fps') ?? 12);
  const want = arg('rows')?.split(',');
  const win = new BrowserWindow({
    show: false, width: w, height: h, useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(__dirname, 'joint-placer-preload.js') },
  });
  win.setContentSize(w, h);
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[page]', message); });
  await win.loadURL(`http://127.0.0.1:${port}/tools/joint-placer.html?record`);
  const js = (code) => win.webContents.executeJavaScript(code);
  for (let i = 0; i < 100 && !(await js('Boolean(window.__placer?.ready)')); i++) await sleep(100);
  const ids = (await js('__placer.ids()')).filter((id) => !want || want.includes(id));
  for (const id of ids) {
    const dir = path.join(path.resolve(RECORD), `r${id}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const length = await js(`__placer.open(${JSON.stringify(id)})`);
    const n = Math.ceil(length * fps);
    for (let i = 0; i < n; i++) {
      await js(`__placer.at(${i / fps})`);
      fs.writeFileSync(path.join(dir, `${String(i).padStart(5, '0')}.png`), (await win.webContents.capturePage()).toPNG());
    }
    console.log(`r${id}`, n, 'frames', length.toFixed(2), 's');
  }
  app.exit(0);
}

app.whenReady().then(async () => {
  const port = await serve();
  if (RECORD) { await record(port); return; }
  // --offscreen: 보이지 않는 창(도구 시험용, --remote-debugging-port로 들여다봄)
  const hidden = process.argv.includes('--offscreen');
  const win = new BrowserWindow({
    width: 1400, height: 900, title: '합동 승리 배치', show: !hidden,
    webPreferences: { preload: path.join(__dirname, 'joint-placer-preload.js'), backgroundThrottling: false, offscreen: hidden },
  });
  win.setMenuBarVisibility(false);
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[page]', message); });
  // 저장 안 한 변경이 있으면 닫기 전에 물음
  let closing = false;
  win.on('close', async (e) => {
    if (closing) return;
    e.preventDefault();
    const dirty = await win.webContents.executeJavaScript('window.__placer?.dirty ?? false').catch(() => false);
    if (dirty) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'question', buttons: ['저장하고 닫기', '저장 안 하고 닫기', '취소'], defaultId: 0, cancelId: 2,
        title: '합동 승리 배치', message: '저장하지 않은 배치가 있어요',
      });
      if (response === 2) return;
      if (response === 0) await win.webContents.executeJavaScript('__placer.save()');
    }
    closing = true;
    win.close();
  });
  await win.loadURL(`http://127.0.0.1:${port}/tools/joint-placer.html`);
});
app.on('window-all-closed', () => app.quit());
