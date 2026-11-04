const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { modelFiles } = require('./model-files');
const { windowWidth } = require('./pet-window');
const { startUpdater } = require('./updater');

// 창 크기 프리셋 (DIP 단위, [너비, 높이])
// 창은 월드 단위로 가로 4.0 × 세로 5.30 (pet.js VIEW_HEIGHT, 수영복 아야네만 가로 6.55: pet-window.js). 캐릭터 크기는 높이로 정해진다(보통 = 1단위당 215px).
// 그중 아래 0.85단위(BELOW)는 발밑보다 아래: 카메라가 내려다봐서 앞으로 내디딘 발·그림자가 발 자리보다 25~40px 아래에 그려진다
// (2026-10-12 시로코 웅크린 자세 등에서 잘렸음, 그때 0.2단위). 0.3단위 더 늘림(2026-10-30 사용자): 츠루기 날개가 낮잠으로 쓰러질 때
// 최대 49px, 스미레 EX 공중제비 때 헤일로가 24px 창 아래로 나가 잘렸음. 0.35단위 더(2026-11-02 사용자): 수영복 사오리 EX 끝에
// DJ 테이블이 아래로 빠지며 창 아래로 최대 약 67px 나가 잘렸음.
// 발이 화면에 서는 자리는 그대로이고 창만 아래로 늘어나, 맨 아래에 서면 작업 표시줄에 걸치고 화면 밖까지 나갈 수 있다
// 투명한 창이라 넉넉하게: 아리스(배틀) Exs01은 날아올라 뒤로 1.2단위 갔다 오면서 발밑에서 2.1단위 높이·옆으로 1.8단위까지 간다
// (예전 2.6 × 1.3 창에서는 위·옆이 크게 잘렸음. 호시노 EX 돌진은 옆으로 약 1.3단위)
// 위로 0.6단위 더 늘림(2026-10-30 사용자): 이즈나 EX 공중제비가 발밑에서 2.7단위까지 올라가 창 위로 최대 93px 나가 잘렸음
// 위로 0.15단위 더(2026-10-31 사용자): 미네 EX 점프 꼭대기에서 머리카락·날개가 창 위 10px까지 감
// 위로 1.4단위 더(2026-11-01 사용자): 수영복 와카모 EX에서 던진 양산이 창 위로 최대 약 260px 나가 2초쯤 잘렸음.
// 보통도 사용자 화면 작업 영역(852px)보다 높아짐 → createWindow에서 만든 뒤 크기를 다시 정한다
const SIZES = {
  small: { label: '작게', w: 615, h: 815, fx: 0.4 }, // fx: 클릭 효과 크기 배율
  medium: { label: '보통', w: 862, h: 1140, fx: 0.5 },
  large: { label: '크게', w: 1231, h: 1632, fx: 0.65 },
};
const BELOW = 0.85 / 5.30; // 창 높이 중 발 자리보다 아래인 비율 (pet.js FOOT_MARGIN의 대부분)
// 지금 학생의 창 크기: 프리셋 크기에, 몸보다 훨씬 넓게 움직이는 학생(수영복 아야네 헬기)은 가로만 넓힘 (pet-window.js)
const sizeOf = (key = settings.size) => ({ ...SIZES[key], w: windowWidth(settings.model, SIZES[key].w) });
// 발이 작업 영역 맨 아래에 서도록 둘 때 창의 y
const bottomY = (wa, h) => Math.round(wa.y + wa.height - h + h * BELOW);

const DEFAULT_SETTINGS = { model: 'Hoshino.glb', size: 'medium', walk: true, alwaysOnTop: true, clickFx: true };

let win = null;
let tray = null;
let viewerWin = null;
let fxWin = null; // 클릭 효과 창 (펫이 있는 모니터 전체를 덮는 투명 창)
let fxDisplayId = null;
let menuWin = null; // 우클릭 메뉴 창 (src/menu, 시작할 때 만들어 두고 다시 씀)
let settings = { ...DEFAULT_SETTINGS };

// 앱 이름(productName)이 '샬레 당번'으로 바뀌어도 설정·저장소는 예전 폴더 그대로 쓴다
app.setPath('userData', path.join(app.getPath('appData'), 'bluearchive-desktop-pet'));

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
  const { w, h } = sizeOf();
  const wa = screen.getPrimaryDisplay().workArea;
  const bounds = { x: Math.round(wa.x + wa.width - w - 120), y: bottomY(wa, h), width: w, height: h };

  win = new BrowserWindow({
    ...bounds,
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

  // 작업 영역보다 높은 창은 만들 때 높이가 작업 영역으로 줄어든다(사용자 화면 862×1065 → 862×852). 만든 뒤에 정하면 그대로 됨
  win.setBounds(bounds);
  // 캐릭터가 없는 투명 영역은 클릭이 아래 창으로 통과하도록 시작
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { win.showInactive(); restartMouseForwarding(); });
  // 페이지가 뜰 때마다(다시 불러오기 포함) 마우스 이동 넘겨받기를 다시 건다
  win.webContents.on('did-finish-load', restartMouseForwarding);
  win.on('closed', () => {
    win = null;
    if (fxWin && !fxWin.isDestroyed()) fxWin.close();
    if (menuWin && !menuWin.isDestroyed()) menuWin.close();
  });
}

// 클릭 통과 중에도 마우스 이동을 페이지로 넘겨받기(forward). Electron은 이미 켜져 있으면 다시 켜도 아무것도 안 해서,
// 페이지가 새로 뜨며 마우스를 받는 안쪽 창이 바뀌어도 예전 창에 걸려 있었다 → 이동마다 mouseleave가 같이 와서
// 펫 위인지 판정을 못 함(켜고 몇 초~1분 넘게 클릭 안 됨, 2026-10-23 사용자). 껐다 켜면 지금 창에 다시 걸린다
function restartMouseForwarding() {
  if (!win) return;
  win.setIgnoreMouseEvents(false);
  win.setIgnoreMouseEvents(true, { forward: true });
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
  const { w, h } = sizeOf(key);
  // 발밑 중앙을 기준으로 크기 변경
  const x = Math.round(old.x + old.width / 2 - w / 2);
  const y = Math.round(old.y + old.height * (1 - BELOW) - h * (1 - BELOW));
  win.setBounds({ x, y, width: w, height: h });
  settings.size = key;
  saveSettings();
  sendToPet('pet:bounds-changed');
  sendFxConfig();
  rebuildMenus();
}

function resetPosition() {
  if (!win) return;
  const { w, h } = sizeOf();
  const wa = screen.getPrimaryDisplay().workArea;
  win.setBounds({ x: Math.round(wa.x + wa.width - w - 120), y: bottomY(wa, h), width: w, height: h });
  sendToPet('pet:bounds-changed');
}

// 학생 폴더: 받은 학생(학생 압축을 풀어 넣는 곳, 메뉴 "학생 폴더 열기") → 설치 폴더 models/ 순서로 찾는다 (src/model-files.js)
const userModelsDir = () => path.join(app.getPath('userData'), 'models');
const studentFiles = modelFiles([userModelsDir(), path.join(__dirname, '..', 'models')]);
const petModels = () => studentFiles.petModels();

function openModelsFolder() {
  fs.mkdirSync(userModelsDir(), { recursive: true });
  shell.openPath(userModelsDir());
}

// 학생 메뉴를 학원별로 나누는 표 (students.json). 파일 이름 "Hoshino (Swimsuit).glb" → 아비도스 / "호시노 (수영복)"
// 표에 없는 학생은 '기타'에 영어 이름 그대로
const STUDENTS = require('./students.json');
const SCHOOL_OF = new Map(STUDENTS.schools.flatMap((s) => Object.entries(s.students).map(([en, ko]) => [en, { school: s.name, ko }])));
const OTHER_SCHOOL = '기타';
function studentInfo(file) {
  const name = file.replace(/\.glb$/i, '');
  const base = name.replace(/ \(.*$/, '');
  const hit = SCHOOL_OF.get(base);
  const outfits = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => STUDENTS.outfits[m[1]] ?? m[1]);
  return {
    school: hit?.school ?? OTHER_SCHOOL,
    label: [hit?.ko ?? base, ...outfits.map((o) => `(${o})`)].join(' '),
  };
}

// 학생 메뉴: 학원 → 학생. 표의 학원은 학생이 아직 없어도 모두 순서대로 (나중에 학생을 다 넣을 것, 2026-10-29 사용자). 기타는 있을 때만 맨 끝
// 맨 아래 "학생 폴더 열기": 학생 압축을 풀어 넣는 곳 (받은 학생 폴더, 2026-10-29 사용자: 학생은 압축으로 따로 배포)
function studentMenu(models) {
  const openFolder = { label: '학생 폴더 열기', click: openModelsFolder };
  if (!models.length) return [{ label: '학생이 없습니다', enabled: false }, { type: 'separator' }, openFolder];
  return [...schoolMenus(models), { type: 'separator' }, openFolder];
}

function schoolMenus(models) {
  const bySchool = new Map(STUDENTS.schools.map((s) => [s.name, []]));
  for (const file of models) {
    const { school, label } = studentInfo(file);
    if (!bySchool.has(school)) bySchool.set(school, []);
    bySchool.get(school).push({ file, label });
  }
  return [...bySchool].map(([school, list]) => ({
    label: school,
    submenu: !list.length ? [{ label: '아직 학생이 없습니다', enabled: false }] : list
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
      .map(({ file, label }) => ({
        label,
        note: CHECKED.has(file) ? undefined : UNCHECKED_NOTE,
        type: 'radio',
        checked: settings.model === file,
        click: () => setModel(file),
      })),
  }));
}

// 학생 검사를 통과한 학생 (checked-students.json). 나머지는 학생 압축에 같이 들어 있어도 '검사 전' 표시
// (우클릭 메뉴는 이름 옆에 흐리게, 트레이 메뉴는 이름 뒤에 괄호로)
const CHECKED = new Set(require('./checked-students.json').files);
const UNCHECKED_NOTE = '검사 전';

function setModel(file) {
  settings.model = file;
  saveSettings();
  rebuildMenus();
  fitWindowWidth();
  if (win) win.reload();
}

// 학생마다 창 가로가 다를 수 있으니(pet-window.js) 학생을 바꾸면 발밑 가운데를 그대로 두고 가로만 맞춘다
function fitWindowWidth() {
  if (!win) return;
  const old = win.getBounds();
  const { w, h } = sizeOf();
  if (old.width === w) return;
  win.setBounds({ x: Math.round(old.x + old.width / 2 - w / 2), y: old.y, width: w, height: h });
  sendToPet('pet:bounds-changed');
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
  if (quitting || !win || win.isDestroyed()) { quitApp(); return; }
  quitting = true;
  sendToPet('pet:command', 'retreat');
  setTimeout(quitApp, 5000);
}

// 자동 업데이트 (updater.js): 받아 둔 새 버전은 그냥 종료해도 설치되고(다시 켜지지는 않음),
// "업데이트하고 다시 시작"이면 후퇴한 뒤 설치하고 다시 켠다
let updater = null;
let updateReady = null; // 받아 둔 새 버전
let restartForUpdate = false;
const quitApp = () => (restartForUpdate && updater ? updater.install() : app.quit());
function updateAndRestart() {
  restartForUpdate = true;
  quitWithRetreat();
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
      submenu: studentMenu(models),
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
    ...(updateReady ? [{ label: `업데이트하고 다시 시작 (${updateReady})`, click: updateAndRestart }] : []),
    { label: '종료', click: quitWithRetreat },
  ];
}

// ---- 우클릭 메뉴 창 ----
// 캐릭터 우클릭 메뉴는 윈도우 기본 메뉴 대신 블루 아카이브 느낌으로 직접 그린다 (트레이 메뉴는 기본 메뉴 그대로).
// 항목은 buildMenuTemplate을 그대로 쓰고, click 함수는 여기 두고 id만 창으로 보낸다
// 창은 숨기지(hide) 않는다: 숨겼다 show()하면 윈도우가 한 프레임 진하게 보였다가 0.2초 동안 흐릿 → 진하게 다시 그려
// 두 번 켜지는 것처럼 보였음(thickFrame: false, DWM 전환 끄기로도 그대로). 닫혀 있을 때는 투명도 0·클릭 통과로 화면 밖에 둔다
let menuSeq = 0;
let menuClicks = new Map(); // id → { click, item }
let menuAt = null; // 연 자리 { seq, p: 커서, wa: 작업 영역 }

function createMenuWindow() {
  menuWin = new BrowserWindow({
    width: 360,
    height: 320,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'menu', 'preload.js'),
      backgroundThrottling: false,
    },
  });
  menuWin.setAlwaysOnTop(true, 'pop-up-menu'); // 펫 창보다 위
  menuWin.loadFile(path.join(__dirname, 'menu', 'index.html'));
  menuWin.once('ready-to-show', () => {
    parkMenu();
    menuWin.showInactive();
  });
  menuWin.on('closed', () => { menuWin = null; });
}

// 닫힌 메뉴: 안 보이고 클릭 통과, 모든 모니터 왼쪽 바깥
function parkMenu() {
  menuWin.setOpacity(0);
  menuWin.setIgnoreMouseEvents(true);
  const left = Math.min(...screen.getAllDisplays().map((d) => d.bounds.x));
  menuWin.setPosition(left - 2000, 0);
}

function hideMenu() {
  if (!menuAt) return;
  menuAt = null;
  if (!menuWin || menuWin.isDestroyed()) return;
  if (menuWin.isFocused()) menuWin.blur(); // Esc·항목 클릭으로 닫으면 포커스를 돌려줌
  parkMenu();
}

// 메뉴 템플릿 → 창으로 보낼 수 있는 항목 (click 함수는 menuClicks에)
function toMenuItems(template) {
  return template.map((item) => {
    const id = menuClicks.size + 1;
    if (item.click) menuClicks.set(id, { click: item.click, item });
    return {
      id,
      label: item.label,
      note: item.note,
      type: item.type ?? 'normal',
      checked: !!item.checked,
      enabled: item.enabled !== false,
      danger: item.click === quitWithRetreat,
      submenu: item.submenu ? toMenuItems(item.submenu) : undefined,
    };
  });
}

function showPetMenu() {
  if (!menuWin) createMenuWindow();
  menuClicks = new Map();
  const items = toMenuItems(buildMenuTemplate());
  const p = screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(p).workArea;
  menuAt = { seq: ++menuSeq, p, wa };
  const data = { seq: menuSeq, items, title: studentInfo(settings.model).label, roomRight: wa.x + wa.width - p.x };
  if (menuWin.webContents.isLoading()) menuWin.webContents.once('did-finish-load', () => menuWin.webContents.send('menu:open', data));
  else menuWin.webContents.send('menu:open', data);
}

// 창이 그린 뒤 크기를 알려 오면 (아직 투명한 채로) 커서 옆에 옮기고, 그 크기로 다시 그린 뒤(menu:painted) 보이게 한다.
// 창 안 판은 10px 안쪽 (그림자 자리). h는 하위 메뉴를 다 제자리에 펼친 높이, mainH는 메인 판, minH는 가장 큰 판이 들어갈 높이
// 메인 판은 커서 옆에 두고(아래에 다 안 들어가면 윈도우 기본 메뉴처럼 커서 위로) 창은 화면 아래 끝까지만: 하위 메뉴가 넘치면 그 판만 올린다.
// 예전엔 창 전체(h)를 화면에 넣느라 커서가 화면 위쪽이 아니면 메인 판까지 커서보다 한참 위에 떴음(학원별 학생 목록이 길어 h 585px)
// 판을 올릴 자리가 메인 판 위에 필요하면 창을 위로 늘리고 그만큼(offset) 메인 판을 아래로 내려 그린다
ipcMain.on('menu:ready', (_e, seq, w, h, flip, mainH, minH) => {
  if (!menuAt || seq !== menuAt.seq || !menuWin) return;
  const { p, wa } = menuAt;
  const pad = 10;
  const waBottom = wa.y + wa.height;
  let x = flip ? p.x - w + pad - 2 : p.x - pad + 2;
  x = Math.max(wa.x, Math.min(x, wa.x + wa.width - w));
  let top = p.y - pad + 2; // 메인 판 위 끝 - pad
  if (top + mainH + pad * 2 > waBottom) top = p.y - mainH - pad - 2;
  top = Math.max(wa.y, Math.min(top, waBottom - mainH - pad * 2));
  const bottom = Math.min(top + h, waBottom);
  const y = Math.max(wa.y, Math.min(top, bottom - minH));
  menuWin.setBounds({ x: Math.round(x), y: Math.round(y), width: w, height: Math.round(bottom - y) });
  menuWin.webContents.send('menu:placed', seq, Math.round(top - y), Math.round(bottom - y));
});

ipcMain.on('menu:painted', (_e, seq) => {
  if (!menuAt || seq !== menuAt.seq || !menuWin) return;
  menuWin.setIgnoreMouseEvents(false);
  menuWin.setOpacity(1);
  menuWin.focus();
});

ipcMain.on('menu:click', (_e, id) => {
  const hit = menuClicks.get(id);
  hideMenu();
  if (!hit) return;
  // 기본 메뉴처럼 체크 항목은 바뀐 뒤의 값으로 click을 부른다
  const { type, checked } = hit.item;
  hit.click({ checked: type === 'checkbox' ? !checked : type === 'radio' ? true : checked });
});

ipcMain.on('menu:close', hideMenu);

function rebuildMenus() {
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(forTray(buildMenuTemplate())));
}

// 트레이(윈도우 기본 메뉴)에는 note 칸이 없어서 이름 뒤에 괄호로
function forTray(template) {
  return template.map(({ note, submenu, ...item }) => ({
    ...item,
    ...(note && { label: `${item.label}  (${note})` }),
    ...(submenu && { submenu: forTray(submenu) }),
  }));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('샬레 당번');
  tray.on('click', () => sendToPet('pet:command', 'react'));
  rebuildMenus();
}

// ---- IPC ----
ipcMain.handle('pet:read-model', () => {
  let file = studentFiles.pathOf(settings.model);
  if (!file) {
    // 설정의 모델이 없으면(받은 학생 파일을 지웠을 때 등) 펫으로 쓸 수 있는 첫 번째 모델로 대체
    const first = petModels()[0] ?? studentFiles.list()[0];
    if (!first) throw new Error('models 폴더에 .glb 파일이 없습니다');
    settings.model = first;
    file = studentFiles.pathOf(first);
    fitWindowWidth();
  }
  return fs.readFileSync(file);
});

ipcMain.handle('pet:get-settings', () => settings);

ipcMain.handle('pet:list-models', () => ({ models: studentFiles.list(), current: settings.model }));

ipcMain.handle('pet:read-model-file', (_e, name) => {
  const file = studentFiles.pathOf(name);
  if (!file) throw new Error(`학생 파일이 없습니다: ${path.basename(name)}`);
  return fs.readFileSync(file);
});

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
  const { w, h } = sizeOf();
  // setPosition은 고DPI에서 창 크기가 조금씩 변하는 문제가 있어 setBounds 사용
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: w, height: h });
});

ipcMain.on('pet:set-ignore', (_e, ignore) => {
  if (win) win.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.on('pet:fx', (_e, type) => relayFx(type));

ipcMain.on('pet:quit', quitApp);

ipcMain.on('pet:show-menu', () => {
  if (win) showPetMenu();
});

// ---- 앱 수명주기 ----
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    loadSettings();
    // 설정의 모델이 펫으로 못 쓰는 장면용 모델이면(예: 메뉴에서 빠지기 전에 고른 Arisu (Battle) (Carrier)) 쓸 수 있는 첫 모델로
    if (studentFiles.pathOf(settings.model) && !studentFiles.usable(settings.model)) {
      const first = petModels()[0];
      if (first) { settings.model = first; saveSettings(); }
    }
    createWindow();
    createFxWindow();
    createMenuWindow(); // 처음 우클릭할 때 만들면 창을 띄우고 페이지를 읽느라 늦게 떴음
    createTray();
    updater = startUpdater({ onReady: (version) => { updateReady = version; rebuildMenus(); } });
    if (process.argv.includes('--viewer')) openViewer(); // 시작하면서 애니메이션 보기 창 열기
  });
  app.on('window-all-closed', () => app.quit()); // 펫 창까지 모두 닫혔을 때만
}
