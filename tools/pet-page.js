// 학생 검사 도구들이 같이 쓰는 것: 프로젝트 폴더를 내주는 작은 서버, 화면 밖 펫 페이지 열기, 넘어가는 곳 모으기
// (tools/transition-check.js, tools/edge-check.js)
const http = require('http');
const path = require('path');
const fs = require('fs');

// 서버의 파일을 Electron이 캐시해서 코드를 고친 직후 예전 코드로 도는 일이 있음 → 캐시 끔 (pet-url.js와 같음)
require('electron').app.commandLine.appendSwitch('disable-http-cache');
const ROOT = path.resolve(__dirname, '..');
const MARKS = path.join(ROOT, 'docs', 'data', 'transition-marks.json');
const DEFAULT_MODELS = ['Hoshino.glb', 'Hoshino (Swimsuit).glb', 'Shiroko.glb', 'Arisu (Battle).glb'];
const SIM_SECONDS = 1800; // 펫 시간 30분
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

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

// 화면 밖 창에 펫 페이지(?review)를 열고 모델을 다 읽을 때까지 기다린다. 돌려주는 js(코드)로 페이지 안에서 실행
async function openPet(win, port, model, query = '') {
  await win.loadURL(`http://127.0.0.1:${port}/src/renderer/index.html?review${query}&model=${encodeURIComponent(model)}`);
  const js = (code) => win.webContents.executeJavaScript(code);
  for (let i = 0; i < 100 && !(await js('Boolean(window.__pet?.clip)')); i++) await sleep(100);
  if (!(await js('Boolean(window.__pet?.clip)'))) throw new Error(`${model}: 펫을 불러오지 못함`);
  return js;
}

const loadMarks = () => (fs.existsSync(MARKS) ? JSON.parse(fs.readFileSync(MARKS, 'utf8')) : {});
const saveMarks = (marks) => fs.writeFileSync(MARKS, `${JSON.stringify(marks, null, 1)}\n`);

// 넘어가는 곳: transition-marks.json에 모아 둔 것, 없으면 펫을 SIM_SECONDS만큼 빨리 돌려 모아 저장 (확인 창 collect와 같은 방법)
// 같은 곳(앞 → 뒤 동작)마다 예를 4개까지: 몸이 가장 많이 도는 것부터 고르게
// --fresh: 모아 둔 것이 있어도 지금 코드로 다시 모은다 (펫 코드를 고치면 넘어가는 곳이 바뀜). 사용자 표시(mark·note)는 같은 곳이면 옮겨 온다
async function pairsOf(js, model, marks) {
  const old = marks[model]?.pairs ?? [];
  if (old.length && !process.argv.includes('--fresh')) return old.filter((p) => !p.unseen);
  const log = await js(`__pet.simulate(${SIM_SECONDS})`);
  const turns = await js('__pet.clipTurns');
  const swing = (r) => Math.abs(wrap((r.faceAfter * 180) / Math.PI + (turns[r.to] ?? 0) - (r.yawBefore * 180) / Math.PI));
  const groups = new Map();
  for (const r of log) {
    const key = `${r.from} → ${r.to}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  marks[model] = {
    collected: new Date().toISOString().slice(0, 10), simSeconds: SIM_SECONDS,
    pairs: [...groups].map(([key, recs]) => {
      recs.sort((a, b) => swing(b) - swing(a));
      const picks = [...new Set([0, 1, 2, 3].map((i) => Math.round((i * (recs.length - 1)) / 3)))];
      const was = old.find((p) => p.key === key);
      return { key, from: recs[0].from, to: recs[0].to, count: recs.length, examples: picks.map((i) => recs[i]), mark: was?.mark ?? null, note: was?.note ?? '' };
    }).sort((a, b) => b.count - a.count),
  };
  // 이번 흉내에서 안 나온 곳도 사용자가 표시한 것은 남긴다 (예전 예와 함께 unseen. 검사 도구는 건너뜀)
  for (const p of old) {
    if (p.mark && !groups.has(p.key)) marks[model].pairs.push({ ...p, count: 0, unseen: true });
  }
  saveMarks(marks);
  return marks[model].pairs.filter((p) => !p.unseen);
}

const modelsFromArgs = () => {
  const list = process.argv.slice(2).filter((a) => a.endsWith('.glb'));
  return list.length ? list : DEFAULT_MODELS;
};

module.exports = { ROOT, sleep, wrap, serve, openPet, loadMarks, saveMarks, pairsOf, modelsFromArgs };
