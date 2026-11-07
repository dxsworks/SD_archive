const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, net, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { modelFiles } = require('./model-files');
const { studentStore } = require('./student-store');
const { windowWidth } = require('./pet-window');
const { startUpdater } = require('./updater');
const { jointVictory } = require('./joint-main');

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
// 학생의 창 크기: 프리셋 크기에, 몸보다 훨씬 넓게 움직이는 학생(수영복 아야네 헬기)은 가로만 넓힘 (pet-window.js)
const sizeOf = (model, key = settings.size) => ({ ...SIZES[key], w: windowWidth(model, SIZES[key].w) });
// 발이 작업 영역 맨 아래에 서도록 둘 때 창의 y
const bottomY = (wa, h) => Math.round(wa.y + wa.height - h + h * BELOW);

// 여러 학생 동시에 (2026-11-06 사용자 "단순하게 먼저"): 펫마다 창 하나·학생 하나. 띄운 학생은 settings.pets(파일 이름 목록)에 저장,
// settings.model은 첫 번째 펫 (예전 버전으로 돌아가도 그 학생으로 켜지게). 크기·돌아다니기·클릭 효과 등은 모두 같이 쓴다
// 화면 밖 창 4명 시험: 모두 60fps, GPU 3D 1명 7~8% → 4명 약 31%
const MAX_PETS = 4;
const DEFAULT_SETTINGS = { model: 'Hoshino.glb', pets: null, size: 'medium', walk: true, alwaysOnTop: true, clickFx: true };

const pets = []; // { model, win, leaving: 돌려보내는 중, gone: 종료하며 퇴장을 마침 }
let tray = null;
let joint = null; // 합동 승리 (joint-main.js), app ready 뒤에 만듦
let viewerWin = null;
let fxWin = null; // 클릭 효과 창 (펫이 있는 모니터 전체를 덮는 투명 창)
let fxDisplayId = null;
let menuWin = null; // 우클릭 메뉴 창 (src/menu, 시작할 때 만들어 두고 다시 씀)
let settings = { ...DEFAULT_SETTINGS };

// 앱 이름(productName)이 '샬레 당번'으로 바뀌어도 설정·저장소는 예전 폴더 그대로 쓴다
app.setPath('userData', path.join(app.getPath('appData'), 'bluearchive-desktop-pet'));
// 시험용: 다른 설정·받은 학생 폴더로 켠다 (설치본·개발용과 실행 잠금도 따로라 같이 켜짐)
if (process.env.PET_USER_DATA) app.setPath('userData', path.resolve(process.env.PET_USER_DATA));

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
  if (!Array.isArray(settings.pets) || !settings.pets.length) settings.pets = [settings.model];
  settings.pets = settings.pets.slice(0, MAX_PETS);
}

// 지금 띄운 학생을 설정에 (앱을 끄며 창이 닫힐 때는 안 함: 다음에 켜면 그대로 나오게)
function savePets() {
  if (appQuitting) return;
  const live = livePets();
  if (!live.length) return;
  settings.pets = live.map((p) => p.model);
  settings.model = settings.pets[0];
  saveSettings();
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

const alive = (p) => p?.win && !p.win.isDestroyed();
const livePets = () => pets.filter(alive);
const petOf = (sender) => pets.find((p) => alive(p) && p.win.webContents === sender);

// 처음 자리: 주 모니터 오른쪽 아래, 둘째부터는 왼쪽으로 반 창씩 비켜서
function homeBounds(model, index) {
  const { w, h } = sizeOf(model);
  const wa = screen.getPrimaryDisplay().workArea;
  const x = Math.max(wa.x, Math.round(wa.x + wa.width - w - 120 - index * w * 0.55));
  return { x, y: bottomY(wa, h), width: w, height: h };
}

// 더 부른 학생: 메뉴를 연 학생 옆(왼쪽, 자리가 없으면 오른쪽)에 같은 발 높이로
function besideBounds(model, near) {
  const { w, h } = sizeOf(model);
  const b = near.win.getBounds();
  const wa = workAreaFor(b);
  const footY = b.y + b.height * (1 - BELOW);
  let x = Math.round(b.x + b.width / 2 - w / 2 - b.width * 0.55);
  if (x < wa.x) x = Math.round(b.x + b.width / 2 - w / 2 + b.width * 0.55);
  x = Math.max(wa.x, Math.min(x, wa.x + wa.width - w));
  return { x, y: Math.round(footY - h * (1 - BELOW)), width: w, height: h };
}

function createWindow(model, bounds) {
  const pet = { model, win: null };
  const win = new BrowserWindow({
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
  win.once('ready-to-show', () => { win.showInactive(); restartMouseForwarding(pet); });
  // 페이지가 뜰 때마다(다시 불러오기 포함) 마우스 이동 넘겨받기를 다시 건다
  win.webContents.on('did-finish-load', () => restartMouseForwarding(pet));
  win.webContents.on('did-finish-load', sendDownloadBadge); // 받는 중에 페이지를 다시 읽었으면 (크기 바꾸기 등은 안 읽음)
  win.on('closed', () => {
    joint?.abortFor(pet);
    pet.win = null;
    pets.splice(pets.indexOf(pet), 1);
    if (!pets.length) {
      if (fxWin && !fxWin.isDestroyed()) fxWin.close();
      if (menuWin && !menuWin.isDestroyed()) menuWin.close();
      return;
    }
    if (appQuitting) return;
    if (quitting) { if (livePets().every((p) => p.gone)) quitApp(); return; }
    savePets();
    rebuildMenus();
  });
  pet.win = win;
  pets.push(pet);
  return pet;
}

// 클릭 통과 중에도 마우스 이동을 페이지로 넘겨받기(forward). Electron은 이미 켜져 있으면 다시 켜도 아무것도 안 해서,
// 페이지가 새로 뜨며 마우스를 받는 안쪽 창이 바뀌어도 예전 창에 걸려 있었다 → 이동마다 mouseleave가 같이 와서
// 펫 위인지 판정을 못 함(켜고 몇 초~1분 넘게 클릭 안 됨, 2026-10-23 사용자). 껐다 켜면 지금 창에 다시 걸린다
function restartMouseForwarding(pet) {
  if (!alive(pet)) return;
  pet.win.setIgnoreMouseEvents(false);
  pet.win.setIgnoreMouseEvents(true, { forward: true });
}

// 학생 하나 더 띄우기 (최대 MAX_PETS)
function addPet(model, near) {
  if (livePets().length >= MAX_PETS) return;
  createWindow(model, alive(near) ? besideBounds(model, near) : homeBounds(model, pets.length));
  savePets();
  rebuildMenus();
}

// 이 학생만 보내기(펫 우클릭 메뉴 "종료"): 종료처럼 밧줄에 매달려 올라간 뒤 그 창만 닫는다 (마지막 한 명이면 앱 종료)
function dismissPet(pet) {
  if (!alive(pet) || pet.leaving) return;
  if (livePets().length <= 1) { quitWithRetreat(); return; }
  joint?.abortFor(pet);
  pet.leaving = true;
  sendToPet(pet, 'pet:command', 'retreat');
  setTimeout(() => { if (alive(pet)) pet.win.close(); }, 5000);
}

// ---- 클릭 효과 창 ----
// 펫 창은 작고 캐릭터를 따라 움직이므로, 효과는 화면 전체를 덮는 별도 창에 그린다.
// 클릭은 항상 아래로 통과하고 포커스도 받지 않는다.
function createFxWindow() {
  const display = screen.getDisplayMatching(pets[0].win.getBounds());
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

function sendToPet(pet, channel, payload) {
  if (alive(pet)) pet.win.webContents.send(channel, payload);
}
const sendToAll = (channel, payload) => livePets().forEach((p) => sendToPet(p, channel, payload));

// 크기는 모든 학생이 같이 바꾼다
function setSize(key) {
  if (!SIZES[key]) return;
  settings.size = key;
  for (const pet of livePets()) {
    const old = pet.win.getBounds();
    const { w, h } = sizeOf(pet.model, key);
    // 발밑 중앙을 기준으로 크기 변경
    const x = Math.round(old.x + old.width / 2 - w / 2);
    const y = Math.round(old.y + old.height * (1 - BELOW) - h * (1 - BELOW));
    pet.win.setBounds({ x, y, width: w, height: h });
    sendToPet(pet, 'pet:bounds-changed');
  }
  saveSettings();
  sendFxConfig();
  rebuildMenus();
}

// 위치 초기화: 모든 학생을 처음 자리로 (나란히)
function resetPosition() {
  livePets().forEach((pet, i) => {
    pet.win.setBounds(homeBounds(pet.model, i));
    sendToPet(pet, 'pet:bounds-changed');
  });
}

// 학생 폴더: 받은 학생(학생 압축을 풀어 넣는 곳, 메뉴 "학생 폴더 열기") → 설치 폴더 models/ 순서로 찾는다 (src/model-files.js)
const userModelsDir = () => path.join(app.getPath('userData'), 'models');
const studentFiles = modelFiles([userModelsDir(), path.join(__dirname, '..', 'models')]);
const petModels = () => studentFiles.petModels();

function openModelsFolder() {
  fs.mkdirSync(userModelsDir(), { recursive: true });
  shell.openPath(userModelsDir());
}

// 앱 안에서 학생 받기 (student-store.js): 학생 메뉴에 아직 없는 학생도 크기와 함께 나오고, 고르면 받아서 바로 바꾼다.
// 목록·학생 파일은 버전 릴리스와 따로 둔 릴리스(태그 students)에 있다. 시험: PET_STUDENTS_URL=<students-index.json이 있는 주소>
const STUDENTS_URL = process.env.PET_STUDENTS_URL ?? 'https://github.com/dxsworks/SD_archive/releases/download/students';
const STUDENTS_REFRESH = 6 * 60 * 60 * 1000;
let store = null; // app ready 뒤에 만듦 (net.fetch)
let jointStore = null; // 합동 승리 동작 (같은 릴리스의 joint-index.json, tools/make-joint-pack.js). 조합 학생을 다 받으면 joint-main.js가 받음
const jointClipsDir = () => path.join(app.getPath('userData'), 'joint-clips');
const jointClipOf = (file) => { const f = path.join(jointClipsDir(), file); return fs.existsSync(f) ? f : null; };
let want = null; // { file, pet, add } 받는 중에 다른 학생을 고르면 마지막에 고른 학생만 바꾼다(더 띄운다). pet = 메뉴를 연 학생

function startStudentStore() {
  store = studentStore({
    dir: userModelsDir(),
    cacheFile: path.join(app.getPath('userData'), 'students-index.json'),
    baseUrl: STUDENTS_URL.replace(/\/$/, ''),
    fetch: (url) => net.fetch(url),
    has: (file) => !!studentFiles.pathOf(file),
    onChange: () => { rebuildMenus(); sendDownloadBadge(); },
  });
  jointStore = studentStore({
    dir: jointClipsDir(),
    cacheFile: path.join(app.getPath('userData'), 'joint-index.json'),
    baseUrl: STUDENTS_URL.replace(/\/$/, ''),
    fetch: (url) => net.fetch(url),
    has: (file) => !!jointClipOf(file),
    onChange: () => rebuildMenus(),
    indexName: 'joint-index.json',
  });
  store.refresh();
  jointStore.refresh();
  setInterval(() => { store.refresh(); jointStore.refresh(); }, STUDENTS_REFRESH);
}

// 합동 승리 얼굴 줄의 +: 받은 학생이면 바로 띄우고, 아니면 받은 뒤 띄움(받는 동안 메뉴를 연 학생 머리 위에 표시)
function addStudent(file, near) {
  if (studentFiles.pathOf(file)) addPet(file, near);
  else if (store?.listed(file)) downloadAndUse(file, near, true);
}

function downloadAndUse(file, pet, add = false) {
  const mine = { file, pet, add };
  want = mine;
  sendDownloadBadge();
  store.download(file).then(() => {
    if (want !== mine) { rebuildMenus(); return; }
    want = null;
    sendDownloadBadge();
    if (add) addPet(file, pet);
    else setModel(pet, file);
  }).catch((err) => {
    console.error('학생 받기 실패:', err.message);
    notify('학생을 받지 못했어요', `${studentInfo(file).label}: 인터넷 연결을 확인하고 학생 메뉴에서 다시 골라 주세요.`);
    setTimeout(() => { // 펫 위 '받지 못했어요'는 잠깐만
      if (want !== mine || !store.job(file)?.error) return;
      want = null;
      sendDownloadBadge();
    }, BADGE_ERROR_MS);
  });
}

// 받는 동안 펫 머리 위에 학생 이름·진행 막대 (2026-11-05 사용자: GitHub 첫 연결이 가끔 10초쯤 걸려 고른 뒤 아무 반응이 없어 보였음).
// 마지막에 고른 학생 것만, 메뉴를 연 학생 머리 위에(그 학생이 없어졌으면 첫 학생). 다 받으면 학생이 바뀌며 페이지를 다시 읽어 사라지고,
// 실패하면 BADGE_ERROR_MS 동안 '받지 못했어요'
const BADGE_ERROR_MS = 4000;
function sendDownloadBadge() {
  const job = want && store?.job(want.file);
  const at = job ? (alive(want.pet) ? want.pet : livePets()[0]) : null;
  for (const pet of livePets()) {
    sendToPet(pet, 'pet:download', pet === at ? { label: studentInfo(want.file).label, got: job.got, total: job.total, error: !!job.error } : null);
  }
}

function notify(title, body) {
  app.setAppUserModelId('com.bluearchive.desktoppet'); // 윈도우 알림은 앱 ID가 있어야 뜬다 (updater.js와 같음)
  if (Notification.isSupported()) new Notification({ title, body }).show();
}

const MB = (n) => `${(n / 1e6).toFixed(1)}MB`;
// 아직 없는 학생 이름 옆 글자: 받을 크기 / 받는 중 % / 실패 (메뉴 칸이 좁아 짧게: "받기 · 2.7MB"는 학생 이름이 잘렸음)
function downloadNote(file) {
  const job = store?.job(file);
  if (job?.error) return '다시 받기';
  if (job) return `받는 중 ${job.total ? Math.floor((job.got / job.total) * 100) : 0}%`;
  return `↓ ${MB(store.sizeOf(file))}`;
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
// 맨 아래 "학생 폴더 열기": 받은 학생이 있는 곳 (예전에 받은 학생 압축을 직접 풀어 넣어도 됨)
// 아직 없는 학생(앱 안에서 받기 목록에만 있는 것)도 같이 나오고, 고르면 받는다
// pet: 메뉴를 연 학생. add면 "학생 하나 더 띄우기"(고른 학생을 더 띄움, 체크 표시 없음), 아니면 그 학생을 바꿈
function studentMenu(models, pet, add = false) {
  const openFolder = { label: '학생 폴더 열기', click: openModelsFolder };
  const local = new Set(models);
  const remote = (store?.remotePets() ?? []).map((f) => f.file).filter((f) => !local.has(f));
  const tail = [{ type: 'separator' }, openFolder];
  if (store?.indexError) tail.unshift({ label: '학생 목록 다시 받기', note: '실패', click: () => store.refresh() });
  if (!models.length && !remote.length) return [{ label: '학생이 없습니다', enabled: false }, ...tail];
  return [...schoolMenus(models, remote, pet, add), ...tail];
}

function schoolMenus(models, remote, pet, add) {
  const bySchool = new Map(STUDENTS.schools.map((s) => [s.name, []]));
  for (const [file, have] of [...models.map((f) => [f, true]), ...remote.map((f) => [f, false])]) {
    const { school, label } = studentInfo(file);
    if (!bySchool.has(school)) bySchool.set(school, []);
    bySchool.get(school).push({ file, label, have });
  }
  return [...bySchool].map(([school, list]) => ({
    label: school,
    submenu: !list.length ? [{ label: '아직 학생이 없습니다', enabled: false }] : list
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
      .map(({ file, label, have }) => ({
        label,
        note: !have ? downloadNote(file) : CHECKED.has(file) ? undefined : UNCHECKED_NOTE,
        ...(add ? {} : { type: 'radio', checked: pet?.model === file }),
        click: () => (!have ? downloadAndUse(file, pet, add) : add ? addPet(file, pet) : setModel(pet, file)),
      })),
  }));
}

// 학생 검사를 통과한 학생 (checked-students.json). 나머지는 학생 압축에 같이 들어 있어도 '검사 전' 표시
// (우클릭 메뉴는 이름 옆에 흐리게, 트레이 메뉴는 이름 뒤에 괄호로)
const CHECKED = new Set(require('./checked-students.json').files);
const UNCHECKED_NOTE = '검사 전';

function setModel(pet, file) {
  if (want) { want = null; sendDownloadBadge(); } // 받는 중에 다른(이미 있는) 학생을 고르면 받은 뒤 그 학생으로 바꾸지 않음
  if (!alive(pet)) return;
  joint?.abortFor(pet);
  pet.model = file;
  savePets();
  rebuildMenus();
  fitWindowWidth(pet);
  pet.win.reload();
}

// 학생마다 창 가로가 다를 수 있으니(pet-window.js) 학생을 바꾸면 발밑 가운데를 그대로 두고 가로만 맞춘다
function fitWindowWidth(pet) {
  if (!alive(pet)) return;
  const old = pet.win.getBounds();
  const { w, h } = sizeOf(pet.model);
  if (old.width === w) return;
  pet.win.setBounds({ x: Math.round(old.x + old.width / 2 - w / 2), y: old.y, width: w, height: h });
  sendToPet(pet, 'pet:bounds-changed');
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

// 종료: 모든 학생이 후퇴 동작(밧줄)으로 올라간 뒤 꺼진다. 다시 누르거나 응답이 없으면 바로 종료.
let quitting = false;
let appQuitting = false; // 창이 닫혀도 띄운 학생 목록을 지우지 않게
app.on('before-quit', () => { appQuitting = true; });
function quitWithRetreat() {
  const live = livePets();
  if (quitting || !live.length) { quitApp(); return; }
  quitting = true;
  joint?.abortFor(null);
  savePets();
  for (const pet of live) sendToPet(pet, 'pet:command', 'retreat');
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

// pet: 우클릭한 학생 (동작·학생 바꾸기·돌려보내기가 그 학생에게). 트레이 메뉴는 pet 없이: 동작은 모든 학생, 학생 바꾸기는 첫 학생
function buildMenuTemplate(pet = null) {
  const models = petModels();
  const target = alive(pet) ? pet : livePets()[0];
  const command = (cmd) => () => (pet ? sendToPet(pet, 'pet:command', cmd) : sendToAll('pet:command', cmd));
  const count = livePets().length;
  return [
    {
      label: '동작',
      submenu: [
        { label: '반응', click: command('react') },
        { label: '랜덤 행동', click: command('fidget') },
        { label: '낮잠', click: command('nap') },
        { label: '전투 모드', click: command('battle') },
        { label: '공격', click: command('attack') },
        { label: 'EX 스킬', click: command('ex') },
      ],
    },
    { label: '애니메이션 보기', click: openViewer },
    {
      label: '학생',
      submenu: studentMenu(models, target),
    },
    count < MAX_PETS
      ? { label: '학생 하나 더 띄우기', submenu: studentMenu(models, target, true) }
      : { label: '학생 하나 더 띄우기', note: `최대 ${MAX_PETS}명`, enabled: false },
    {
      label: '돌아다니기',
      type: 'checkbox',
      checked: settings.walk,
      click: (item) => {
        settings.walk = item.checked;
        saveSettings();
        sendToAll('pet:settings', { walk: settings.walk }); // settings.model(첫 학생)이 다른 학생 페이지의 학생을 덮지 않게
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
        for (const p of livePets()) p.win.setAlwaysOnTop(item.checked);
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
    // 펫 우클릭 메뉴의 종료는 그 학생만 밧줄로 보냄(2026-11-07 사용자, 예전 "이 학생 돌려보내기"), 마지막 한 명이면 앱 종료. 트레이 종료는 모두
    { label: '종료', danger: true, click: pet && count > 1 ? () => dismissPet(pet) : quitWithRetreat },
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
      danger: item.danger || item.click === quitWithRetreat,
      submenu: item.submenu ? toMenuItems(item.submenu) : undefined,
    };
  });
}

const jointRows = (pet) => joint?.rowsFor(pet, () => livePets().length < MAX_PETS);
function showPetMenu(pet) {
  if (!menuWin) createMenuWindow();
  menuClicks = new Map();
  const items = toMenuItems(buildMenuTemplate(pet));
  const p = screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(p).workArea;
  menuAt = { seq: ++menuSeq, p, wa };
  // 합동 승리 얼굴 줄 (joint-main.js rowsFor): 누르는 것은 메뉴 항목처럼 id로
  const clickId = (fn) => { if (!fn) return null; const id = menuClicks.size + 1; menuClicks.set(id, { click: fn, item: {} }); return id; };
  const jointData = (jointRows(pet) ?? []).map((r) => ({
    members: r.members.map((m) => ({ face: `faces/${encodeURIComponent(m.model.replace(/\.glb$/i, '.png'))}`, label: m.label, here: m.here, me: m.me, add: clickId(m.add) })),
    go: clickId(r.go),
  }));
  const data = { seq: menuSeq, items, joint: jointData, title: studentInfo(pet.model).label, roomRight: wa.x + wa.width - p.x };
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
  return template.map(({ note, submenu, danger, ...item }) => ({
    ...item,
    ...(note && { label: `${item.label}  (${note})` }),
    ...(submenu && { submenu: forTray(submenu) }),
  }));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('샬레 당번');
  tray.on('click', () => sendToAll('pet:command', 'react'));
  rebuildMenus();
}

// ---- IPC ----
// 페이지마다 자기 학생: 보낸 창(e.sender)으로 어느 학생인지 찾는다
ipcMain.handle('pet:read-model', (e) => {
  const pet = petOf(e.sender);
  if (!pet) throw new Error('펫 창이 아닙니다');
  let file = studentFiles.pathOf(pet.model);
  if (!file) {
    // 설정의 모델이 없으면(받은 학생 파일을 지웠을 때 등) 펫으로 쓸 수 있는 첫 번째 모델로 대체
    const first = petModels()[0] ?? studentFiles.list()[0];
    if (!first) throw new Error('models 폴더에 .glb 파일이 없습니다');
    pet.model = first;
    file = studentFiles.pathOf(first);
    fitWindowWidth(pet);
    savePets();
  }
  return fs.readFileSync(file);
});

ipcMain.handle('pet:get-settings', (e) => ({ ...settings, model: petOf(e.sender)?.model ?? settings.model }));

ipcMain.handle('pet:list-models', () => ({ models: studentFiles.list(), current: livePets()[0]?.model ?? settings.model }));

ipcMain.handle('pet:read-model-file', (_e, name) => {
  const file = studentFiles.pathOf(name);
  if (!file) throw new Error(`학생 파일이 없습니다: ${path.basename(name)}`);
  return fs.readFileSync(file);
});

ipcMain.handle('pet:get-bounds', (e) => {
  const pet = petOf(e.sender);
  if (!pet) return null;
  const b = pet.win.getBounds();
  return { win: b, workArea: workAreaFor(b) };
});

// (x, y) 지점에 가장 가까운 모니터의 작업 영역 — 드래그로 다른 모니터에 옮길 때 사용
ipcMain.handle('pet:get-work-area', (_e, x, y) => {
  return screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea;
});

ipcMain.on('pet:move', (e, x, y) => {
  const pet = petOf(e.sender);
  if (!pet) return;
  const { w, h } = sizeOf(pet.model);
  // setPosition은 고DPI에서 창 크기가 조금씩 변하는 문제가 있어 setBounds 사용
  pet.win.setBounds({ x: Math.round(x), y: Math.round(y), width: w, height: h });
});

ipcMain.on('pet:set-ignore', (e, ignore) => {
  petOf(e.sender)?.win.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.on('pet:fx', (_e, type) => relayFx(type));

// 학생이 퇴장(밧줄)을 마침: 돌려보내는 학생이면 그 창만 닫고, 종료 중이면 모두 마쳤을 때 끈다
ipcMain.on('pet:quit', (e) => {
  const pet = petOf(e.sender);
  if (pet && !quitting && (pet.leaving || livePets().length > 1)) { pet.win.close(); return; }
  if (pet) pet.gone = true;
  if (!quitting || livePets().every((p) => p.gone)) quitApp();
});

// 합동 승리 (joint-main.js)
ipcMain.on('pet:status', (e, s) => { const pet = petOf(e.sender); if (pet) { pet.status = s; joint?.onStatus(pet); } });
ipcMain.on('pet:joint-loaded', (e) => { const pet = petOf(e.sender); if (pet) joint?.onLoaded(pet); });
// 합동 동작: 개발용 모델이면 { full }, 받은 합동 동작이면 { model: 학생 파일, clips } (pet.js가 합침)
ipcMain.handle('pet:read-joint-file', (_e, model) => {
  const src = joint?.sourceOf(model);
  if (!src) throw new Error(`합동 동작이 없습니다: ${model}`);
  return src.full ? { full: fs.readFileSync(src.full) } : { model: fs.readFileSync(src.model), clips: fs.readFileSync(src.clips) };
});
ipcMain.on('pet:joint-ready', (e) => { const pet = petOf(e.sender); if (pet) joint?.onReady(pet); });
ipcMain.on('pet:joint-done', (e, ends) => { const pet = petOf(e.sender); if (pet) joint?.onDone(pet, ends); });

ipcMain.on('pet:show-menu', (e) => {
  const pet = petOf(e.sender);
  if (pet) showPetMenu(pet);
});

// 시험용: 화면 밖에서 메인 쪽을 움직여 보는 도구가 쓴다 (PET_TEST_HOOK=1)
if (process.env.PET_TEST_HOOK) {
  global.__petMain = { pets, joint: () => joint, settings: () => settings, addPet, dismissPet, setModel, setSize, buildMenuTemplate, quitWithRetreat, resetPosition,
    // 우클릭 메뉴를 화면 밖(보이지 않게)에서 그려 PNG로: 커서·포커스를 건드리지 않음
    async menuShot(pet, file) {
      showPetMenu(pet);
      menuAt = null; // menu:ready로 커서 옆에 옮기지 않게
      menuWin.setBounds({ x: -4000, y: 0, width: 600, height: 700 });
      await new Promise((r) => setTimeout(r, 600));
      fs.writeFileSync(file, (await menuWin.webContents.capturePage()).toPNG());
      return file;
    } };
}

// ---- 앱 수명주기 ----
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    loadSettings();
    // 설정의 모델이 펫으로 못 쓰는 장면용 모델이면(예: 메뉴에서 빠지기 전에 고른 Arisu (Battle) (Carrier)) 쓸 수 있는 첫 모델로.
    // 파일이 아예 없는 학생은 페이지가 읽을 때(pet:read-model) 바꾼다
    const first = petModels()[0];
    settings.pets = settings.pets.map((m) => (studentFiles.pathOf(m) && !studentFiles.usable(m) && first ? first : m));
    settings.pets.forEach((model, i) => createWindow(model, homeBounds(model, i)));
    savePets();
    createFxWindow();
    createMenuWindow(); // 처음 우클릭할 때 만들면 창을 띄우고 페이지를 읽느라 늦게 떴음
    createTray();
    startStudentStore();
    // stack: 펫 창을 이 순서로 위에 올림 (뒤에 있는 학생부터, 클릭 효과 창은 늘 맨 위)
    const stack = (list) => {
      for (const p of list) if (alive(p)) p.win.moveTop();
      if (fxWin && !fxWin.isDestroyed()) fxWin.moveTop();
    };
    joint = jointVictory({
      livePets, alive, sendToPet, addStudent, stack, label: (f) => studentInfo(f).label,
      clips: { pathOf: jointClipOf, listed: (f) => !!jointStore?.listed(f), download: (f) => jointStore.download(f), job: (f) => jointStore?.job(f) },
      studentPath: (f) => (studentFiles.usable(f) ? studentFiles.pathOf(f) : null),
      canGetStudent: (f) => !!store?.listed(f),
    });
    updater = startUpdater({ onReady: (version) => { updateReady = version; rebuildMenus(); } });
    if (process.argv.includes('--viewer')) openViewer(); // 시작하면서 애니메이션 보기 창 열기
  });
  app.on('window-all-closed', () => app.quit()); // 펫 창까지 모두 닫혔을 때만
}
