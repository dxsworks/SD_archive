// 학생 검사 한 번에 (새 학생을 붙이기 전에): 아래 검사를 차례로 돌리고 학생마다 보고서 한 장(reports/<모델>.html)을 만든다
//   1) 동작 이름 (tools/check-model.js): 펫이 그 학생에게 하는 것, 못 알아보는 이름, 특징
//   2) 넘어가는 곳 각도 (tools/transition-check.js): 총 자세로 몸이 휙 도는 곳 (사용자 판단 규칙)
//   3) 창 끝 (tools/edge-check.js): 창 위·옆에 닿는 동작
//   4) 행동 (tools/behavior-check.js): 명령마다 대기로 돌아오는지, 30분 동안 멈춤·오류
//   5) 동작 시트: 펫이 쓰는 동작마다 5장 (사람이 눈으로 볼 것)
// 사용: node tools/check-student.js ["모델.glb" …] [--open]   (모델이 없으면 기본 네 학생, --open: 다 되면 보고서 열기)
//   학생 하나에 약 3분. 각 검사의 전체 결과는 docs/data/*.json에도 남는다
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const ELECTRON = require('electron'); // node에서 부르면 electron.exe 경로
const DEFAULT_MODELS = ['Hoshino.glb', 'Hoshino (Swimsuit).glb', 'Shiroko.glb', 'Arisu (Battle).glb'];
const REPORTS = path.join(ROOT, 'reports');
const DATA = path.join(ROOT, 'docs', 'data');
const readData = (name) => JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const list = (items, empty = '없음') => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : `<p class="dim">${empty}</p>`);

// 검사 도구를 하나씩 따로 띄워 끝날 때까지 기다린다 (이 도구는 Electron이 아니라 node로 돈다:
// Electron 안에서 띄우면 끝난 뒤 펫 페이지를 다시 열지 못하고 멈춘 적이 있음)
function run(label, cmd, args) {
  console.log(`  ${label}…`);
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err = (err + d).slice(-3000); });
    child.on('close', (code) => {
      if (code !== 0) console.log(`  ${label} 실패 (종료 코드 ${code})\n${err}`);
      resolve(code === 0);
    });
  });
}

function report(model, names, angles, edges, behavior, sheetFile) {
  const bad = angles.filter((r) => r.verdict === 'bad').sort((a, b) => b.count - a.count);
  const edgeWarn = edges.filter((b) => b.warn.length);
  const failed = behavior.tests.filter((t) => !t.ok);
  const counts = [
    ['동작 이름 경고', names.warnings.length], ['휙 도는 곳', bad.length], ['창 끝 경고', edgeWarn.length],
    ['행동 실패', failed.length], ['멈춤', behavior.stuck.length], ['오류', behavior.errors.length],
  ];
  const total = counts.reduce((s, [, n]) => s + n, 0);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(model)} 검사</title>
<style>
  :root { color-scheme: dark; --bg:#15181f; --panel:#1e222b; --line:#2d3340; --text:#e6e8ec; --dim:#8b93a3; --bad:#e5534b; --ok:#3fb950; }
  body { margin: 0 auto; max-width: 1100px; padding: 24px 16px 60px; background: var(--bg); color: var(--text); font: 15px/1.6 'Malgun Gothic', sans-serif; }
  h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 18px; margin: 32px 0 8px; border-bottom: 1px solid var(--line); padding-bottom: 4px; }
  .dim { color: var(--dim); } code { font-family: Consolas, monospace; font-size: 13.5px; }
  .badges { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
  .badge { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 14px; }
  .badge b { font-size: 20px; margin-left: 6px; } .badge.bad b { color: var(--bad); } .badge.ok b { color: var(--ok); }
  table { border-collapse: collapse; width: 100%; } td, th { border-bottom: 1px solid var(--line); padding: 4px 8px; text-align: left; vertical-align: top; }
  th { color: var(--dim); font-weight: normal; } .bad { color: var(--bad); } .num { text-align: right; font-variant-numeric: tabular-nums; }
  img { max-width: 100%; border-radius: 6px; }
</style></head><body>
<h1>${esc(model)}</h1>
<div class="dim">학생 검사 ${new Date().toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })} · ${total ? `확인할 것 ${total}개` : '경고 없음'}</div>
<div class="badges">${counts.map(([l, n]) => `<div class="badge ${n ? 'bad' : 'ok'}">${l}<b>${n}</b></div>`).join('')}</div>

<h2>펫이 이 학생에게 하는 것</h2>
${list(names.does.map(esc))}
<h2>동작 이름 경고</h2>
${list(names.warnings.map((w) => `<span class="bad">${esc(w)}</span>`))}
${names.notes.length ? `<p class="dim">특징</p>${list(names.notes.map(esc))}` : ''}

<h2>넘어가는 곳: 총 자세로 휙 도는 곳</h2>
<p class="dim">펫 시간 30분 동안 실제로 넘어간 ${angles.length}곳 중. 기준: 총 자세로 넘어가며 몸 전체가 50° 넘게 더 돎 (2026-10-12 사용자 판단).
다시 보기: <code>npx electron tools/transition-review.js</code></p>
${bad.length ? `<table><tr><th>넘어가는 곳</th><th class="num">30분에</th><th class="num">더 돈 양</th></tr>
${bad.map((r) => `<tr><td><code>${esc(r.key)}</code></td><td class="num">${r.count}번</td><td class="num">${r.spin}°</td></tr>`).join('')}</table>` : '<p class="dim">없음</p>'}

<h2>창 끝</h2>
<p class="dim">펫 창(보통 862×538)에서 모델이 위·옆·아래 끝까지 남는 여백(px). 경고: 위 35px 미만, 옆·아래 3px 미만</p>
<table><tr><th>동작</th><th class="num">위</th><th class="num">왼쪽</th><th class="num">오른쪽</th><th class="num">아래</th><th>경고</th></tr>
${edges.slice(0, Math.max(6, edgeWarn.length)).map((b) => `<tr><td><code>${esc(b.clip)}</code></td><td class="num">${b.top}</td><td class="num">${b.left}</td><td class="num">${b.right}</td><td class="num">${b.bottom}</td><td class="bad">${esc(b.warn.join(', '))}</td></tr>`).join('')}</table>

<h2>행동</h2>
<table><tr><th>시험</th><th></th><th class="num">걸린 시간</th><th>지나간 동작</th></tr>
${behavior.tests.map((t) => `<tr><td>${esc(t.name)}</td><td class="${t.ok ? '' : 'bad'}">${t.ok ? (t.name.startsWith('종료') ? '사라짐' : '대기로 돌아옴') : esc(t.why)}</td><td class="num">${t.time}초</td><td><code>${esc(t.clips.join(' → '))}</code></td></tr>`).join('')}</table>
<p class="dim">펫 시간 30분(클릭 등 섞음): ${Object.entries(behavior.longest).map(([s, l]) => `${s} 최대 ${l.dur}초`).join(' · ')}</p>
${behavior.stuck.length ? list(behavior.stuck.map((s) => `<span class="bad">멈춤: ${esc(s.state)} ${s.dur}초 (${esc(s.clip)})</span>`)) : ''}
${behavior.errors.length ? list(behavior.errors.map((e) => `<span class="bad">오류: ${esc(e)}</span>`)) : ''}

<h2>동작 시트</h2>
<p class="dim">펫이 이 학생에게 쓰는 동작마다 고르게 5장 (평소 동작은 정면 쪽, 총·EX는 옆 45°, 걷기·뛰기는 70°)</p>
<img src="${esc(path.basename(sheetFile))}" alt="동작 시트">
</body></html>`;
}

async function main() {
  const args = process.argv.slice(2);
  const models = args.filter((a) => a.endsWith('.glb'));
  fs.mkdirSync(REPORTS, { recursive: true });
  const done = [];
  for (const model of models.length ? models : DEFAULT_MODELS) {
    console.log(`\n== ${model}`);
    const tmp = path.join(REPORTS, `${model}.names.json`);
    await run('동작 이름', process.execPath, [path.join(__dirname, 'check-model.js'), model, '--brief', `--json=${tmp}`]);
    const names = JSON.parse(fs.readFileSync(tmp, 'utf8'))[0];
    fs.unlinkSync(tmp);
    if (!names.usable) { console.log('  펫으로 못 쓰는 모델 (Cafe_Idle 없음) — 건너뜀'); continue; }
    for (const [label, tool] of [['넘어가는 곳 각도', 'transition-check.js'], ['창 끝', 'edge-check.js'], ['행동', 'behavior-check.js']]) {
      await run(label, ELECTRON, [path.join(__dirname, tool), model]);
    }
    const sheetFile = path.join(REPORTS, `${model}.sheet.png`);
    await run('동작 시트', ELECTRON, [path.join(__dirname, 'sheet-check.js'), model, sheetFile]);
    const file = path.join(REPORTS, `${model}.html`);
    fs.writeFileSync(file, report(model, names, readData('transition-metrics.json')[model] ?? [],
      readData('edge-check.json')[model] ?? [], readData('behavior-check.json')[model], sheetFile));
    console.log(`  보고서: ${path.relative(ROOT, file)}`);
    done.push(file);
  }
  if (args.includes('--open')) for (const f of done) spawn('cmd', ['/c', 'start', '', f], { detached: true, stdio: 'ignore' }).unref();
}

main().catch((e) => { console.error(e); process.exit(1); });
