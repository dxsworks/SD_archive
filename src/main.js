const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// 창 크기 프리셋 (DIP 단위, [너비, 높이])
// 창은 월드 단위로 가로 4.0 × 세로 2.3 (pet.js VIEW_HEIGHT). 캐릭터 크기는 높이로 정해진다(보통 = 1단위당 215px).
// 투명한 창이라 넉넉하게: 아리스(배틀) Exs01은 날아올라 뒤로 1.2단위 갔다 오면서 발밑에서 2.1단위 높이·옆으로 1.8단위까지 간다
// (예전 2.6 × 1.3 창에서는 위·옆이 크게 잘렸음. 호시노 EX 돌진은 옆으로 약 1.3단위)
const SIZES = {
  small: { label: '작게', w: 615, h: 354, fx: 0.4 }, // fx: 클릭 효과 크기 배율
  medium: { label: '보통', w: 862, h: 495, fx: 0.5 },
  large: { label: '크게', w: 1231, h: 708, fx: 0.65 },
};

const DEFAULT_SETTINGS = { model: 'Hoshino.glb', size: 'medium', walk: true, alwaysOnTop: true, clickFx: true };

let win = null;
let tray = null;
let viewerWin = null;
let fxWin = null; // 클릭 효과 창 (펫이 있는 모니터 전체를 덮는 투명 창)
let fxDisplayId = null;
let settings = { ...DEFAULT_SETTINGS };

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
  if (!SIZES[settings.size]) settings.size = DEFAULT_SETTINGS.size;
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('설정 저장 실패:', err);
  }
}

function workAreaFor(bounds) {
  return screen.getDisplayMatching(bounds).workArea;
}

function createWindow() {
  const { w, h } = SIZES[settings.size];
  const wa = screen.getPrimaryDisplay().workArea;

  win = new BrowserWindow({
    width: w,
    height: h,
    x: Math.round(wa.x + wa.width - w - 120),
    y: Math.round(wa.y + wa.height - h),
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: settings.alwaysOnTop,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });

  // 캐릭터가 없는 투명 영역은 클릭이 아래 창으로 통과하도록 시작
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => {
    win = null;
    if (fxWin && !fxWin.isDestroyed()) fxWin.close();
  });
}

// ---- 클릭 효과 창 ----
// 펫 창은 작고 캐릭터를 따라 움직이므로, 효과는 화면 전체를 덮는 별도 창에 그린다.
// 클릭은 항상 아래로 통과하고 포커스도 받지 않는다.
function createFxWindow() {
  const display = screen.getDisplayMatching(win.getBounds());
  fxDisplayId = display.id;
  fxWin = new BrowserWindow({
    ...display.bounds,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    focusable: false,
    hasShadow: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'fx', 'preload.js'),
      backgroundThrottling: false,
    },
  });
  fxWin.setAlwaysOnTop(true, 'screen-saver'); // 펫 창보다 위
  fxWin.setIgnoreMouseEvents(true);
  fxWin.loadFile(path.join(__dirname, 'fx', 'index.html'));
  fxWin.webContents.on('did-finish-load', sendFxConfig);
  fxWin.once('ready-to-show', () => fxWin.showInactive());
  fxWin.on('closed', () => { fxWin = null; });
}

// 효과 크기는 펫 크기에 맞춘다
function sendFxConfig() {
  if (fxWin && !fxWin.isDestroyed()) fxWin.webContents.send('fx:config', { scale: SIZES[settings.size].fx });
}

function sendFx(type, x, y) {
  if (fxWin && !fxWin.isDestroyed()) fxWin.webContents.send('fx:pointer', type, x, y);
}

// 펫 창의 포인터 신호(down/move/up/cancel) → 효과 창. 위치는 실제 커서 위치(DIP)를 쓴다.
function relayFx(type) {
  if (!fxWin || fxWin.isDestroyed()) return;
  if (!settings.clickFx) return;
  const p = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(p);
  if (display.id !== fxDisplayId) {
    // 다른 모니터로 넘어감: 효과 창을 옮기고, 끌던 중이면 그 트레일은 끝낸다
    if (type !== 'down') sendFx('cancel');
    fxDisplayId = display.id;
    fxWin.setBounds(display.bounds);
    if (type !== 'down') return;
  }
  const b = fxWin.getBounds();
  sendFx(type, p.x - b.x, p.y - b.y);
}

function sendToPet(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function setSize(key) {
  if (!SIZES[key] || !win) return;
  const old = win.getBounds();
  const { w, h } = SIZES[key];
  // 발밑 중앙을 기준으로 크기 변경
  const x = Math.round(old.x + old.width / 2 - w / 2);
  const y = Math.round(old.y + old.height - h);
  win.setBounds({ x, y, width: w, height: h });
  settings.size = key;
  saveSettings();
  sendToPet('pet:bounds-changed');
  sendFxConfig();
  rebuildMenus();
}

function resetPosition() {
  if (!win) return;
  const { w, h } = SIZES[settings.size];
  const wa = screen.getPrimaryDisplay().workArea;
  win.setBounds({ x: Math.round(wa.x + wa.width - w - 120), y: Math.round(wa.y + wa.height - h), width: w, height: h });
  sendToPet('pet:bounds-changed');
}

function modelsDir() {
  return path.join(__dirname, '..', 'models');
}

function listModels() {
  try {
    return fs.readdirSync(modelsDir()).filter((f) => f.toLowerCase().endsWith('.glb')).sort();
  } catch {
    return [];
  }
}

// 펫으로 쓸 수 있는 모델: 카페 대기 동작이 있는 것 (이름에 cafe_idle이 들어간 동작. Hoshino (Battle)의 01_Cafe_Idle 포함)
// 아리스(배틀) (Carrier)·(Scenario)처럼 동작 몇 개뿐인 장면용 모델은 학생 메뉴에서 뺀다 (애니메이션 보기 창에는 모두 나옴)
// .glb 앞부분의 JSON만 읽어서 동작 이름을 본다
const usableCache = new Map(); // 파일 → { mtime, usable }
function petUsable(file) {
  const full = path.join(modelsDir(), file);
  try {
    const { mtimeMs } = fs.statSync(full);
    const hit = usableCache.get(file);
    if (hit?.mtime === mtimeMs) return hit.usable;
    const fd = fs.openSync(full, 'r');
    try {
      const head = Buffer.alloc(20);
      fs.readSync(fd, head, 0, 20, 0);
      const json = Buffer.alloc(head.readUInt32LE(12));
      fs.readSync(fd, json, 0, json.length, 20);
      const names = (JSON.parse(json.toString('utf8')).animations ?? []).map((a) => a.name ?? '');
      const usable = names.some((n) => /cafe_idle/i.test(n));
      usableCache.set(file, { mtime: mtimeMs, usable });
      return usable;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}
const petModels = () => listModels().filter(petUsable);

function setModel(file) {
  settings.model = file;
  saveSettings();
  rebuildMenus();
  if (win) win.reload();
}

function openViewer() {
  if (viewerWin && !viewerWin.isDestroyed()) {
    viewerWin.show();
    viewerWin.focus();
    return;
  }
  viewerWin = new BrowserWindow({
    width: 1180,
    height: 760,
    title: '애니메이션 보기',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  viewerWin.loadFile(path.join(__dirname, 'viewer', 'index.html'));
  viewerWin.on('closed', () => { viewerWin = null; });
}

// 종료: 펫이 후퇴 동작으로 화면 밖으로 뛰어간 뒤 꺼진다. 다시 누르거나 응답이 없으면 바로 종료.
let quitting = false;
function quitWithRetreat() {
  if (quitting || !win || win.isDestroyed()) { app.quit(); return; }
  quitting = true;
  sendToPet('pet:command', 'retreat');
  setTimeout(() => app.quit(), 5000);
}

function buildMenuTemplate() {
  const models = petModels();
  return [
    {
      label: '동작',
      submenu: [
        { label: '반응', click: () => sendToPet('pet:command', 'react') },
        { label: '랜덤 행동', click: () => sendToPet('pet:command', 'fidget') },
        { label: '낮잠', click: () => sendToPet('pet:command', 'nap') },
        { label: '전투 모드', click: () => sendToPet('pet:command', 'battle') },
        { label: '공격', click: () => sendToPet('pet:command', 'attack') },
        { label: 'EX 스킬', click: () => sendToPet('pet:command', 'ex') },
      ],
    },
    { label: '애니메이션 보기', click: openViewer },
    {
      label: '학생',
      submenu: models.length
        ? models.map((file) => ({
            label: file.replace(/\.glb$/i, ''),
            type: 'radio',
            checked: settings.model === file,
            click: () => setModel(file),
          }))
        : [{ label: 'models 폴더에 .glb 파일이 없습니다', enabled: false }],
    },
    {
      label: '돌아다니기',
      type: 'checkbox',
      checked: settings.walk,
      click: (item) => {
        settings.walk = item.checked;
        saveSettings();
        sendToPet('pet:settings', settings);
        rebuildMenus();
      },
    },
    {
      label: '크기',
      submenu: Object.entries(SIZES).map(([key, s]) => ({
        label: s.label,
        type: 'radio',
        checked: settings.size === key,
        click: () => setSize(key),
      })),
    },
    {
      label: '항상 위에 표시',
      type: 'checkbox',
      checked: settings.alwaysOnTop,
      click: (item) => {
        settings.alwaysOnTop = item.checked;
        if (win) win.setAlwaysOnTop(item.checked);
        saveSettings();
        rebuildMenus();
      },
    },
    {
      label: '클릭 효과',
      type: 'checkbox',
      checked: settings.clickFx,
      click: (item) => {
        settings.clickFx = item.checked;
        if (!item.checked) sendFx('cancel');
        saveSettings();
        rebuildMenus();
      },
    },
    { label: '위치 초기화', click: resetPosition },
    { type: 'separator' },
    { label: '종료', click: quitWithRetreat },
  ];
}

function rebuildMenus() {
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate()));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Blue Archive Desktop Pet');
  tray.on('click', () => sendToPet('pet:command', 'react'));
  rebuildMenus();
}

// ---- IPC ----
ipcMain.handle('pet:read-model', () => {
  let file = path.join(modelsDir(), path.basename(settings.model));
  if (!fs.existsSync(file)) {
    // 설정의 모델이 없으면 폴더의 첫 번째 모델로 대체
    const first = listModels()[0];
    if (!first) throw new Error('models 폴더에 .glb 파일이 없습니다');
    settings.model = first;
    file = path.join(modelsDir(), first);
  }
  return fs.readFileSync(file);
});

ipcMain.handle('pet:get-settings', () => settings);

ipcMain.handle('pet:list-models', () => ({ models: listModels(), current: settings.model }));

ipcMain.handle('pet:read-model-file', (_e, name) => fs.readFileSync(path.join(modelsDir(), path.basename(name))));

ipcMain.handle('pet:get-bounds', () => {
  if (!win) return null;
  const b = win.getBounds();
  return { win: b, workArea: workAreaFor(b) };
});

// (x, y) 지점에 가장 가까운 모니터의 작업 영역 — 드래그로 다른 모니터에 옮길 때 사용
ipcMain.handle('pet:get-work-area', (_e, x, y) => {
  return screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea;
});

ipcMain.on('pet:move', (_e, x, y) => {
  if (!win) return;
  const { w, h } = SIZES[settings.size];
  // setPosition은 고DPI에서 창 크기가 조금씩 변하는 문제가 있어 setBounds 사용
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: w, height: h });
});

ipcMain.on('pet:set-ignore', (_e, ignore) => {
  if (win) win.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.on('pet:fx', (_e, type) => relayFx(type));

ipcMain.on('pet:quit', () => app.quit());

ipcMain.on('pet:show-menu', () => {
  if (!win) return;
  Menu.buildFromTemplate(buildMenuTemplate()).popup({ window: win });
});

// ---- 앱 수명주기 ----
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    loadSettings();
    // 설정의 모델이 펫으로 못 쓰는 장면용 모델이면(예: 메뉴에서 빠지기 전에 고른 Arisu (Battle) (Carrier)) 쓸 수 있는 첫 모델로
    if (fs.existsSync(path.join(modelsDir(), path.basename(settings.model ?? ''))) && !petUsable(path.basename(settings.model))) {
      const first = petModels()[0];
      if (first) { settings.model = first; saveSettings(); }
    }
    createWindow();
    createFxWindow();
    createTray();
    if (process.argv.includes('--viewer')) openViewer(); // 시작하면서 애니메이션 보기 창 열기
  });
  app.on('window-all-closed', () => app.quit()); // 펫 창까지 모두 닫혔을 때만
}
