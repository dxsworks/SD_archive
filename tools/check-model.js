// 학생 검사 도구: 모델을 펫에 붙이기 전에 문제를 찾아 보고서로 보여 준다
//   node tools/check-model.js                       models/ 안의 모델 전체
//   node tools/check-model.js "Shiroko.glb" ...     고른 모델만 (models/ 안 이름 또는 경로)
//   node tools/check-model.js --survey [이름 ...]   받지 않은 모델도: docs/data/model-survey.json의 동작 이름으로 (295개)
//   --brief  모델마다 한 줄 + 경고만     --json=파일  결과를 JSON으로도 저장
// 지금 하는 검사: 동작 확인 (화면에 그리지 않고 .glb 앞부분 JSON의 동작 이름만 본다)
//   - 펫이 그 학생에게 무엇을 하게 되는지(평소·무장·전투·EX·낮잠·종료)와 쓰는 동작 이름
//   - 경고: 꼭 필요한 동작이 없음, 펫이 못 알아보는 이름(01_ 접두사, 새 오타), 이어 트는 동작의 차림 번호가 섞임
//   - 특징: 차림 02, EX 여러 개, 짝 파일
// 동작 이름 규칙은 펫과 같은 코드(src/renderer/clip-names.js)를 쓴다
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MODELS = path.join(ROOT, 'models');
const SURVEY = path.join(ROOT, 'docs', 'data', 'model-survey.json');

// .glb 앞부분의 JSON만 읽어서 동작 이름을 본다 (main.js petUsable과 같은 방법)
function readClipNames(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(20);
    fs.readSync(fd, head, 0, 20, 0);
    const json = Buffer.alloc(head.readUInt32LE(12));
    fs.readSync(fd, json, 0, json.length, 20);
    return (JSON.parse(json.toString('utf8')).animations ?? []).map((a) => a.name ?? '');
  } finally {
    fs.closeSync(fd);
  }
}

// 짝 파일: 같은 이름 뒤에 " (…)"가 붙은 모델 (아리스(배틀) ← (Carrier)·(Scenario))
const companionsOf = (file, all) => {
  const base = file.replace(/\.glb$/i, '');
  return all.filter((f) => f !== file && f.startsWith(`${base} (`));
};

// 펫은 쓰지 않기로 정했거나 펫과 상관없는 동작 (docs/animations.md 4장 등). 처음 보는 이름 목록에서 뺀다
const KNOWN_UNUSED = [
  /^exs/, /^stand_idle$/, /^kneel_idle$/, /^vital_panic$/, /^vital_dying_ing$/, /^vital_hit$/,
  /^tactical_start/, /^formation_idle_random$/, /^formation_formchange/, /^move_end_stand_random$/,
  /^nonweapon_/, /^tank_/, /^riding_/, /^sm\d/, /^st_/, /^dicerace_/, /^tss_/,
];

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

function checkModel(file, names, { companions = [] }, N) {
  const { index, forms } = N.indexClips(names);
  const pick = (name, form = 1) => {
    if (!name) return undefined;
    const list = index.get(N.clipKey(name));
    return list && (list.find((c) => c.form === form) ?? list.find((c) => c.form === 1) ?? list[0]);
  };
  const has = (name) => Boolean(pick(name));
  const first = (list) => list.find(has);
  const nameOf = (name, form) => pick(name, form)?.name;
  const warnings = [];
  const notes = [];
  const does = [];
  const warn = (text) => warnings.push(text);

  // 펫으로 쓸 수 있는지: 학생 메뉴는 이름에 cafe_idle이 들어간 동작이 있는 모델만 보여 준다 (main.js petUsable)
  // 못 쓰는 모델(아리스(배틀) (Carrier)처럼 동작 몇 개뿐인 장면용)은 더 보지 않는다
  const usable = names.some((n) => /cafe_idle/i.test(n));
  if (!usable) {
    return { file, clips: names.length, usable, does: ['학생 메뉴에 안 나옴 (Cafe_Idle이 없는 장면용 모델)'], notes: [],
      warnings: [], unused: [], unknown: names };
  }

  // ---- 펫이 하는 것 ----
  const idle = first(N.ANIM.idle);
  const walk = first(N.ANIM.walk);
  if (idle !== 'Cafe_Idle') warn(idle ? `Cafe_Idle을 못 찾아 평소 대기를 ${nameOf(idle)}로 대신함` : '평소 대기 동작이 없음');
  if (walk !== 'Cafe_Walk') warn(walk ? `Cafe_Walk를 못 찾아 걷기를 ${nameOf(walk)}(뛰는 동작)로 대신함` : '걷기 동작이 없음');
  const victories = N.VICTORIES.filter((pair) => pair.every(has));
  for (const pair of N.VICTORIES) {
    const got = pair.filter(has);
    if (got.length === 1) warn(`승리 포즈 짝 중 ${nameOf(got[0])}만 있음 (짝이 없어 안 씀)`);
  }
  does.push(`평소: 대기 ${nameOf(idle) ?? '없음'} · 걷기 ${nameOf(walk) ?? '없음'} · 반응 ${nameOf(N.REACTION) ?? '없음'}`
    + ` · 집어 들기 ${nameOf(first(N.ANIM.pickup)) ?? '없음'}`);
  does.push(`승리 포즈: ${victories.length ? victories.map((p) => p.map((n) => nameOf(n)).join(' → ')).join(', ') : '없음'}`);
  const nap = first(N.ANIM.nap);
  does.push(`낮잠: ${nap ? nameOf(nap) : '없음 (낮잠 안 함)'} · 종료: ${has('Vital_Retreat') ? nameOf('Vital_Retreat') : '밧줄 동작 없음 (집어 들기 자세로 올라감)'}`);

  // EX: 차림이 안 바뀌는 학생에게 EX가 여럿이면 무작위, 아니면 Exs
  const exVariants = N.exVariants(names, forms);
  const ex = exVariants.length > 1 ? exVariants : (has('Exs') ? [nameOf('Exs')] : []);
  does.push(`EX(더블클릭·전투): ${ex.length ? ex.join(' / ') : '없음'}`);
  // 번호만 다른 EX(Noa (Pajama) Exs_01·Exs_02). Exs_Idle·Exs_Spawn 같은 소환물 동작은 EX가 아님
  const exLike = names.filter((n) => /^exs(_?\d+)+$/i.test(n));
  if (!ex.length && exLike.length) warn(`EX처럼 보이는 동작(${exLike.join(', ')})이 있는데 펫이 못 찾음`);
  if (exVariants.length > 1) notes.push(`EX가 ${exVariants.length}개: ${exVariants.join(', ')} (무작위로 섞음)`);

  // 잠깐 무장
  if (has(N.ARMED_IDLE)) {
    const draw = first(N.DRAW_WEAPON);
    const steps = (n) => N.ARMED_FIDGET_PAIRS.find(([start]) => start === n) ?? [n];
    const fidgets = N.ARMED_FIDGETS.filter((n) => steps(n).every(has)).map((n) => steps(n).map((m) => nameOf(m)).join(' → '));
    does.push(`잠깐 무장: 대기 ${nameOf(N.ARMED_IDLE)} · 총 꺼내기 ${draw ? nameOf(draw) : '없음(총이 바로 생김)'}`
      + ` · 할 동작 ${fidgets.length ? fidgets.join(', ') : '없음(대기만)'}`);
  } else does.push(`잠깐 무장: 안 함 (${N.ARMED_IDLE} 없음)`);

  // 전투: 대기 + 사격 4단계가 다 있는 자세만
  const ready = N.STANCES.filter((st) => has(N.STANCE_IDLE[st]) && N.ATTACK_STEPS.every((step) => has(`${st}_${step}`)));
  const label = { Normal: '서서', Stand: '엄폐', Kneel: '무릎' };
  for (const st of N.STANCES) {
    const parts = N.stanceAll(st).slice(0, 5).filter(has);
    // 사격 동작이 하나도 없으면(보조 학생 Normal_Idle만) 원래 그 자세가 없는 것
    if (parts.length && !ready.includes(st) && N.ATTACK_STEPS.some((step) => has(`${st}_${step}`))) {
      const missing = N.stanceAll(st).slice(0, 5).filter((n) => !has(n));
      // 이름이 조금 다른 후보: 첫 단어와 끝 단어가 같은 것 (Tsurugi Normal01_Delay ↔ Normal_Attack_Delay)
      const ends = (k) => { const w = k.split('_'); return `${w[0]}|${w[w.length - 1]}`; };
      const like = names.filter((n) => missing.some((m) => ends(N.clipKey(n)) === ends(N.clipKey(m))));
      warn(`${label[st]}(${st}) 자세 동작 중 ${missing.join(', ')}이(가) 없어 이 자세를 안 씀`
        + (like.length ? ` — 비슷한 이름: ${like.join(', ')}` : ''));
    }
  }
  if (ready.length) {
    const stances = ready.map((st) => {
      const extra = [has(`${st}_Reload`) ? (has(N.RELOAD_VARIANT(`${st}_Reload`)) ? '재장전 2가지' : '재장전') : '재장전 없음', has(`${st}_Callsign`) ? '구호' : '구호 없음',
        has(`Move_End_${st}`) ? '뛰어와 자세' : '뛰어와 자세 없음'];
      return `${label[st]}(${extra.join('·')})`;
    });
    const move = has('Move_Ing') ? ['뛰기', has('Move_Jump') && '구르기', has(N.RUN_CALLSIGN) && '뛰며 구호'].filter(Boolean) : ['자리 안 옮김'];
    does.push(`전투: ${stances.join(', ')} / ${move.join('·')}`);
    if (ready.length > 1 && !has('Move_Ing')) warn('Move_Ing가 없어 전투 중 자세를 못 바꿈');
  } else does.push('전투: 안 함 (대기 + 사격 4단계가 다 있는 자세가 없음)');

  // ---- 차림 번호 ----
  // 02가 있으면 펫은 "EX를 쓰면 차림이 바뀌는 학생"으로 보고 전투 중 EX 뒤 02 동작을 쓴다
  const numbered = (f) => names.filter((n) => { let got = 1; const key = N.clipKey(n, (x) => { got = x; }); return got === f && !key.startsWith('exs'); });
  for (const f of [...forms].filter((x) => x > 1).sort()) {
    const list = numbered(f);
    const battleClips = ready.flatMap(N.stanceAll).filter(has);
    const battleInForm = battleClips.filter((n) => pick(n, f).form === f);
    notes.push(`차림 0${f}: 동작 ${list.length}개 (전투 자세 동작 ${battleInForm.length}/${battleClips.length}개) — ${list.join(', ')}`);
    if (battleInForm.length < Math.max(1, battleClips.length / 2)) {
      warn(`0${f} 번호가 붙은 동작이 몇 개뿐(${list.length <= 4 ? list.join(', ') : `${list.length}개`})이라 EX로 바뀌는 차림이 아니라 같은 동작의 변형일 수 있음 — 사람이 확인 `
        + '(지금 펫은 전투 중 EX 뒤 이 번호 동작으로 바꿈)');
    }
  }

  // ---- 이어 트는 동작: 같은 차림 번호끼리 이어지는지 ----
  // 평소(차림 1): 승리 포즈 짝, 총 꺼내기 → 무장 대기 / 전투(모든 차림): 사격 4단계, 뛰기 → 자세 잡기
  const chains = [];
  for (const pair of victories) chains.push({ names: pair, forms: [1] });
  const draw = first(N.DRAW_WEAPON);
  if (draw && has(N.ARMED_IDLE)) chains.push({ names: [draw, N.ARMED_IDLE], forms: [1] });
  for (const st of ready) {
    chains.push({ names: N.ATTACK_STEPS.map((step) => `${st}_${step}`), forms: [...forms] });
    if (has('Move_Ing') && has(`Move_End_${st}`)) chains.push({ names: ['Move_Ing', `Move_End_${st}`], forms: [...forms] });
  }
  for (const chain of chains) {
    for (const f of chain.forms) {
      const got = chain.names.map((n) => pick(n, f));
      if (new Set(got.map((c) => c.form)).size > 1) {
        warn(`이어 트는 동작의 차림 번호가 섞임${f > 1 ? ` (차림 0${f} 중)` : ''}: ${got.map((c) => c.name).join(' → ')}`);
      }
    }
  }
  // 02 차림 중에 01 것을 쓰는 전투 동작 (옷이 잠깐 바뀌어 보임). 구호는 펫이 차림이 안 맞으면 건너뜀
  for (const f of [...forms].filter((x) => x > 1)) {
    const fallback = ready.flatMap(N.stanceAll).filter((n) => has(n) && !/_Callsign$/.test(n) && pick(n, f).form !== f);
    if (fallback.length && numbered(f).length >= 5) {
      warn(`차림 0${f} 중에 0${f}가 없어 01 것을 쓰는 전투 동작: ${fallback.map((n) => pick(n, f).name).join(', ')}`);
    }
  }

  // ---- 펫이 못 알아보는 이름 ----
  const used = new Set([
    ...Object.values(N.ANIM).flat(), N.REACTION, N.ARMED_IDLE, ...N.ARMED_FIDGETS, ...N.ARMED_FIDGET_PAIRS.flat(), ...N.ARMED_REACTIONS,
    ...N.STANCES.flatMap(N.stanceAll), ...N.RELOAD_VARIANTS, ...N.BATTLE_ENTRY, ...N.DRAW_WEAPON, N.RUN_CALLSIGN, ...N.VICTORIES.flat(), ...N.OTHER_CLIPS,
  ].map((n) => N.clipKey(n)));
  const unknown = [];
  const unused = [];
  const numberedFront = [];
  const numberedEnd = [];
  for (const name of names) {
    const key = N.clipKey(name);
    if (used.has(key) || exVariants.includes(name)) continue;
    // 비슷한 이름: 앞뒤 번호를 떼거나(01_Cafe_Idle, Exs_01) 글자 1~2개만 다르면 펫이 쓰는 이름인데 못 찾는 것으로 본다
    // (EX는 위에서 따로 봄)
    const stripped = [key.replace(/^\d+_/, ''), key.replace(/_\d+$/, ''), key.replace(/\d+$/, '')]
      .find((k) => k !== key && k !== 'exs' && used.has(k) && !index.has(k));
    if (stripped) { (key.startsWith(stripped) ? numberedEnd : numberedFront).push(name); continue; }
    if (KNOWN_UNUSED.some((re) => re.test(key))) { unused.push(name); continue; }
    const typo = key.length >= 6 && [...used].find((u) => !index.has(u) && levenshtein(key, u) <= 2);
    if (typo) warn(`${name} → 펫이 쓰는 ${typo}의 오타로 보임 (펫이 못 찾음, CLIP_TYPOS에 추가 필요)`);
    else unknown.push(name);
  }
  // 앞뒤에 번호가 붙어 펫이 못 찾는 이름: 모델 하나에 수십 개일 수 있어 묶어서 (Hoshino (Battle) 01_Cafe_Idle …)
  const sample = (list) => (list.length > 4 ? `${list.slice(0, 4).join(', ')} 등 ${list.length}개` : list.join(', '));
  if (numberedFront.length) warn(`앞에 번호가 붙은 이름이라 펫이 못 찾음: ${sample(numberedFront)}`);
  if (numberedEnd.length) warn(`뒤에 번호가 붙은 이름이라 펫이 못 찾음: ${sample(numberedEnd)}`);

  if (companions.length) notes.push(`짝 파일: ${companions.join(', ')}`);
  return { file, clips: names.length, usable, does, notes, warnings, unused, unknown };
}

function printReport(r, brief) {
  const head = `${r.file} (동작 ${r.clips}개)`;
  if (brief) {
    if (!r.usable) { console.log(`- ${head} 장면용(학생 메뉴에 안 나옴)`); return; }
    console.log(`${r.warnings.length ? '!' : ' '} ${head}${r.warnings.length ? ` 경고 ${r.warnings.length}` : ''}`);
    for (const w of r.warnings) console.log(`    ! ${w}`);
    return;
  }
  console.log(`\n== ${head}`);
  console.log('  펫이 하는 것');
  for (const d of r.does) console.log(`    ${d}`);
  if (r.notes.length) {
    console.log('  특징');
    for (const n of r.notes) console.log(`    ${n}`);
  }
  console.log(r.warnings.length ? `  경고 ${r.warnings.length}개` : '  경고 없음');
  for (const w of r.warnings) console.log(`    ! ${w}`);
  if (r.unknown.length) console.log(`  처음 보는 이름 ${r.unknown.length}개 (펫은 안 씀): ${r.unknown.join(', ')}`);
  if (r.unused.length) console.log(`  안 쓰기로 한 동작 ${r.unused.length}개: ${r.unused.join(', ')}`);
}

async function main() {
  const N = await import('../src/renderer/clip-names.js');
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')).map((a) => a.split('=')[0]));
  const jsonOut = args.find((a) => a.startsWith('--json='))?.slice('--json='.length);
  const picked = args.filter((a) => !a.startsWith('--')).map((a) => path.basename(a));

  let models; // [{ file, names }]
  let all;
  if (flags.has('--survey')) {
    const survey = JSON.parse(fs.readFileSync(SURVEY, 'utf8')).models;
    all = survey.map((m) => m.file);
    models = survey.map((m) => ({ file: m.file, names: Object.keys(m.animations) }));
  } else {
    all = fs.readdirSync(MODELS).filter((f) => /\.glb$/i.test(f));
    const files = args.filter((a) => !a.startsWith('--'));
    models = (files.length ? files : all).map((f) => {
      const full = fs.existsSync(f) ? f : path.join(MODELS, f);
      return { file: path.basename(full), names: readClipNames(full) };
    });
  }
  if (picked.length && flags.has('--survey')) {
    models = models.filter((m) => picked.includes(m.file));
    const missing = picked.filter((p) => !models.some((m) => m.file === p));
    if (missing.length) console.log(`조사 데이터에 없는 이름: ${missing.join(', ')}`);
  }

  const brief = flags.has('--brief');
  const results = models.map((m) => checkModel(m.file, m.names, { companions: companionsOf(m.file, all) }, N));
  for (const r of results) printReport(r, brief);
  const bad = results.filter((r) => r.warnings.length);
  console.log(`\n모델 ${results.length}개 중 경고 있는 것 ${bad.length}개 (펫으로 못 쓰는 것 ${results.filter((r) => !r.usable).length}개)`);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2));
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { checkModel, readClipNames };
