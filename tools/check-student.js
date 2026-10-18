// 학생 검사 한 번에 (새 학생을 붙이기 전에): 아래 검사를 차례로 돌리고 학생마다 보고서 한 장(reports/<모델>.html)을 만든다
//   1) 동작 이름 (tools/check-model.js): 펫이 그 학생에게 하는 것, 못 알아보는 이름, 특징
//   2) 넘어가는 곳 각도 (tools/transition-check.js): 총 자세로 몸이 휙 도는 곳 (사용자 판단 규칙)
//   3) 창 끝 (tools/edge-check.js): 창 위·옆에 닿는 동작
//   4) 행동 (tools/behavior-check.js): 명령마다 대기로 돌아오는지, 30분 동안 멈춤·오류
//   5) 동작 시트: 펫이 쓰는 동작마다 5장 + 사람이 볼 동작만 고른 시트(연출 판단·이 학생만의 특징, __pet.picks)
// 결과: reports/<모델>.html(사람용), reports/<모델>.json(Claude용 요약: 경고·고칠 곳·알고 둔 경고·볼 동작, ok = 경고 없음 → 바로 추가)
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

// 사용자가 보고 그대로 두기로 한 경고 (2026-10-12). 새 학생에게 같은 종류가 나와도 "바로 추가"를 막지 않고 따로 적는다
//   model: 특정 학생만(없으면 모든 학생), clip: 동작 이름, side: 창 끝 방향 / key: 넘어가는 곳(앞 → 뒤)
const ACCEPTED = [
  { kind: 'edge', clip: /^Formation_Pickup/i, side: '아래', why: '집어 드는 순간 늘어진 총이 창 아래에 닿음' },
  { kind: 'edge', model: 'Hoshino.glb', clip: /^Exs$/i, side: '아래', why: '호시노 EX 끝에 바닥에 놓인 방패' },
  { kind: 'edge', model: 'Arisu (Battle).glb', clip: /^Normal_Callsign_Random$/i, side: '위', why: '총 꺼내기 0.07초 만에 클릭으로 끊으면 공중 첫 프레임으로 감(30분에 2번)' },
  { kind: 'angle', key: /^Cafe_(Idle|Walk)\d* → (Normal\d*_)?Public\d*$/i, why: '걷다 등을 보인 채 총 꺼내기 (사용자 "모르겠음", 그대로 둠)' },
  { kind: 'angle', key: /^Exs\w* → \w+_Callsign/i, why: 'EX 뒤 구호 (드묾, 그대로 둠)' },
  { kind: 'angle', model: 'Arisu (Battle).glb', key: /^Public01 → Normal_Callsign_Random$/i, why: '위 창 끝 닿음과 같은 경우' },
];
const accepted = (model, w) => ACCEPTED.find((a) => a.kind === w.kind && (!a.model || a.model === model)
  && (a.clip ? a.clip.test(w.clip) && w.what.startsWith(a.side) : a.key.test(w.key)));

// 경고 종류별로 Claude가 먼저 볼 곳
const FIX = {
  names: 'src/renderer/clip-names.js (clipKey 차림 번호 규칙, CLIP_TYPOS 오타 별칭). node tools/check-model.js로 다시',
  angle: 'pet.js carryTurn·clip-facing.js 방향 보정. npx electron tools/transition-review.js로 펫과 똑같이 다시 틀어 보기 (판단 규칙은 CLAUDE.md "이어지는 곳 각도")',
  edge: '그 순간을 그려 볼 것(__pet.still). 몸 전체가 나가면 창 크기(VIEW_HEIGHT·main.js BELOW), 가는 선이 튀면 뼈 늘어남(hidden-parts.js restUnderHiddenBones처럼)',
  behavior: 'pet.js 상태 머신. docs/data/behavior-check.json의 지나간 동작 순서로 어디서 안 돌아오는지',
  stuck: 'pet.js 상태 머신 (그 상태에서 끝나는 조건)',
  error: '펫 페이지 오류: 메시지의 파일·줄',
};

// "이어 트는 동작의 차림 번호가 섞임 (차림 02 중)"은 01 동작이 02 차림과 모습이 다를 때만(수영복 호시노 겉옷) 문제다.
// Shun처럼 02가 총 드는 자세만 다른 학생은 01 뛰기 → 02 뛰기 끝이 자연스럽다 (2026-10-18 그려서 확인) → 모습이 같으면 알고 둔 것으로
const sameLook = (w, looks) => {
  const m = /차림 번호가 섞임 \(차림 0\d 중\): (.+)$/.exec(w.what);
  return m && looks && m[1].split(' → ').every((n) => !looks.form2Off.includes(n));
};

function summarize(model, names, angles, edges, behavior, looks) {
  const all = [
    ...names.warnings.map((w) => ({ kind: 'names', what: w })),
    ...angles.filter((r) => r.verdict === 'bad').map((r) => ({ kind: 'angle', key: r.key, what: `${r.key}: 총 자세로 ${r.spin}° 휙 돎 (30분에 ${r.count}번)`, clickOnly: Boolean(r.clickOnly) })),
    ...edges.flatMap((b) => b.warn.map((w) => ({ kind: 'edge', clip: b.clip, what: w, gunOnly: (b.gunOnly ?? []).some((side) => w.startsWith(side)) }))),
    ...behavior.tests.filter((t) => !t.ok).map((t) => ({ kind: 'behavior', what: `${t.name}: ${t.why}`, clips: t.clips })),
    ...behavior.stuck.map((x) => ({ kind: 'stuck', what: `${x.state} ${x.dur}초 (${x.clip})` })),
    ...behavior.errors.map((e) => ({ kind: 'error', what: e })),
  ].map((w) => ({ ...w, fix: FIX[w.kind] }));
  const warnings = [], known = [];
  for (const w of all) {
    const a = accepted(model, w)
      ?? (w.kind === 'names' && sameLook(w, looks) ? { why: '02 차림과 모습이 같은 동작이라 넘어가도 옷이 안 바뀜' } : null)
      // 2026-10-18 사용자: 총이 생기거나 사라지며 섞이는 동안 늘어진 총만 창 끝에 닿는 건 그대로 둠 (몸은 안 닿음)
      ?? (w.gunOnly ? { why: '총·방패만 닿음 (총이 생기거나 사라지며 섞이는 동안 늘어짐)' } : null)
      // 2026-10-18 사용자: 클릭이 하던 동작을 끊고 휙 도는 건 그대로 둠
      ?? (w.clickOnly ? { why: '클릭으로 하던 동작을 끊은 곳 (뛰기·총 꺼내기·EX 중 클릭)' } : null);
    if (a) known.push({ ...w, why: a.why }); else warnings.push(w);
  }
  return { warnings, known };
}

function report(model, names, angles, edges, behavior, sheetFile, summary, picks, picksFile) {
  const bad = angles.filter((r) => r.verdict === 'bad').sort((a, b) => b.count - a.count);
  const edgeWarn = edges.filter((b) => b.warn.length);
  const n = (kind) => summary.warnings.filter((w) => w.kind === kind).length;
  const counts = [
    ['동작 이름 경고', n('names')], ['휙 도는 곳', n('angle')], ['창 끝 경고', n('edge')],
    ['행동 실패', n('behavior')], ['멈춤', n('stuck')], ['오류', n('error')],
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
${summary.known.length ? `<p class="dim">알고 그대로 둔 경고 ${summary.known.length}개 (세지 않음)</p>${list(summary.known.map((w) => `${esc(w.what)} <span class="dim">— ${esc(w.why)}</span>`))}` : ''}

<h2>사람이 볼 동작</h2>
<p class="dim">연출 판단이 필요하거나 이 학생만의 특징인 동작만 (몸이 크게 뜸, 쓰러질 때 멀리 떨어지는 조각, 빌려온 동작, EX 여러 개, 장비 모습이 다름, 02 차림)</p>
${picks.length ? `${list(picks.map((p) => `<code>${esc(p.clip)}</code> ${esc(p.why.join(' / '))}`))}<img src="${esc(path.basename(picksFile))}" alt="볼 동작">` : '<p class="dim">없음</p>'}

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

<h2>동작 시트 (전체)</h2>
<p class="dim">펫이 이 학생에게 쓰는 동작마다 고르게 5장 (평소 동작은 정면 쪽, 총·EX는 옆 45°, 걷기·뛰기는 70°): <a href="${esc(path.basename(sheetFile))}">열기</a></p>
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
      // 각도 검사가 넘어가는 곳을 지금 코드로 다시 모으고(--fresh, 사용자 표시는 옮겨 옴) 창 끝 검사는 그것을 씀
      await run(label, ELECTRON, [path.join(__dirname, tool), model, ...(tool === 'transition-check.js' ? ['--fresh'] : [])]);
    }
    const sheetFile = path.join(REPORTS, `${model}.sheet.png`);
    await run('동작 시트', ELECTRON, [path.join(__dirname, 'sheet-check.js'), model, sheetFile]);
    const picksFile = path.join(REPORTS, `${model}.picks.png`);
    await run('볼 동작 고르기', ELECTRON, [path.join(__dirname, 'sheet-check.js'), model, picksFile, '--picks']);
    const picks = JSON.parse(fs.readFileSync(picksFile.replace(/\.png$/, '.json'), 'utf8'));
    const [angles, edges, behavior] = [readData('transition-metrics.json')[model] ?? [], readData('edge-check.json')[model] ?? [], readData('behavior-check.json')[model]];
    const looksFile = path.join(REPORTS, `${model}.looks.json`);
    const looks = fs.existsSync(looksFile) ? JSON.parse(fs.readFileSync(looksFile, 'utf8')) : null;
    const summary = summarize(model, names, angles, edges, behavior, looks);
    const file = path.join(REPORTS, `${model}.html`);
    fs.writeFileSync(file, report(model, names, angles, edges, behavior, sheetFile, summary, picks, picksFile));
    const json = path.join(REPORTS, `${model}.json`);
    fs.writeFileSync(json, `${JSON.stringify({
      model, checked: new Date().toISOString(), ok: summary.warnings.length === 0,
      warnings: summary.warnings, known: summary.known, picks, does: names.does, notes: names.notes,
      files: { report: path.relative(ROOT, file), picks: picks.length ? path.relative(ROOT, picksFile) : null, sheet: path.relative(ROOT, sheetFile) },
    }, null, 1)}\n`);
    console.log(`  ${summary.warnings.length ? `경고 ${summary.warnings.length}개` : '경고 없음'} · 알고 둔 경고 ${summary.known.length}개 · 볼 동작 ${picks.length}개`);
    console.log(`  보고서: ${path.relative(ROOT, file)} · 요약: ${path.relative(ROOT, json)}`);
    done.push(file);
  }
  if (args.includes('--open')) for (const f of done) spawn('cmd', ['/c', 'start', '', f], { detached: true, stdio: 'ignore' }).unref();
}

main().catch((e) => { console.error(e); process.exit(1); });
