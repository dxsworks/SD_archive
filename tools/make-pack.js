// 학생 압축 만들기 (2026-10-29 사용자: 학생은 설치 파일과 따로 압축 하나로 배포, 펫으로 쓸 수 있는 학생은 검사 안 했어도 모두)
// 원본 저장소의 .glb를 한 커밋으로 고정해 받고 → 펫으로 쓸 수 있는 학생(src/model-files.js usable)과 그 짝 파일만 zip 하나로.
// 짝 파일: 이름이 "<쓸 수 있는 학생> (…)"인데 혼자서는 못 쓰는 것 (아리스(배틀)이 장비 동작을 빌려 오는 (Carrier) 등)
// 사용자는 압축을 받은 학생 폴더(메뉴 학생 → 학생 폴더 열기)에 풀면 됨. 하위 폴더에 풀려도 찾음
//
//   node tools/make-pack.js [--out=dist/students.zip] [--cache=pack-cache] [--commit=<sha>] [--local-only]
//     --cache       받은 원본을 두는 곳 (다시 돌리면 같은 파일은 안 받음, git 제외)
//     --commit      원본 커밋 (기본: 지금 main)
//     --local-only  받지 않고 캐시·models/에 이미 있는 파일만으로 (시험용)
// 받은 파일은 git 해시(blob sha1)로 원본과 같은지 확인한다. 압축 안에는 students-pack.json(원본 커밋, 파일별 크기·해시, 검사한 학생)과 안내문
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { modelFiles } = require('../src/model-files');

const REPO = 'lihaohong6/BlueArchiveModels';
const ROOT = path.join(__dirname, '..');
const arg = (name, def) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def;
const OUT = path.resolve(arg('out', path.join(ROOT, 'dist', 'students.zip')));
const CACHE = path.resolve(arg('cache', path.join(ROOT, 'pack-cache')));
const LOCAL_ONLY = process.argv.includes('--local-only');
const PARALLEL = 4;
const MB = (n) => `${(n / 1e6).toFixed(1)}MB`;

const blobSha = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const sameBlob = (file, sha) => {
  try {
    return blobSha(fs.readFileSync(file)) === sha;
  } catch {
    return false;
  }
};

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'bluearchive-desktop-pet' } });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function download(entry, commit, dest) {
  const url = `https://raw.githubusercontent.com/${REPO}/${commit}/${entry.path.split('/').map(encodeURIComponent).join('/')}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (blobSha(buf) !== entry.sha) throw new Error('받은 파일 해시가 원본과 다름');
      fs.writeFileSync(`${dest}.part`, buf);
      fs.renameSync(`${dest}.part`, dest);
      return;
    } catch (err) {
      if (attempt >= 3) throw new Error(`${entry.path}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

// 캐시에 원본과 같은 파일을 둔다: 캐시 → models/에 같은 게 있으면 복사 → 받기
async function fill(entries, commit) {
  fs.mkdirSync(CACHE, { recursive: true });
  const need = [];
  for (const e of entries) {
    const dest = path.join(CACHE, path.basename(e.path));
    if (sameBlob(dest, e.sha)) continue;
    const local = path.join(ROOT, 'models', path.basename(e.path));
    if (sameBlob(local, e.sha)) fs.copyFileSync(local, dest);
    else need.push(e);
  }
  const bytes = need.reduce((n, e) => n + e.size, 0);
  console.log(`원본 ${entries.length}개 중 받을 것 ${need.length}개 (${MB(bytes)})`);
  if (!need.length) return [];
  if (LOCAL_ONLY) {
    console.log('--local-only: 받지 않고 건너뜀');
    return need;
  }
  let done = 0;
  const queue = [...need];
  const failed = [];
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    for (let e; (e = queue.shift()); ) {
      try {
        await download(e, commit, path.join(CACHE, path.basename(e.path)));
        console.log(`[${++done}/${need.length}] ${e.path} ${MB(e.size)}`);
      } catch (err) {
        failed.push(e);
        console.log(`[실패] ${err.message}`);
      }
    }
  }));
  return failed;
}

// zip은 파이썬 zipfile로 쓴다: Node zlib는 같은 단계(9)에서도 원본의 57%, 파이썬은 53% (학생 전체면 70MB쯤 차이).
// 이름이 영어가 아니면(Shiroko＊Terror, 읽어주세요.txt) zipfile이 UTF-8 표시를 붙여 윈도우 압축 풀기에서도 안 깨짐
const ZIP_PY = `
import json, sys, zipfile
job = json.load(open(sys.argv[1], encoding='utf-8'))
with zipfile.ZipFile(job['out'], 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name, text in job['texts']:
        z.writestr(name, text.encode('utf-8'))
    for name, src in job['files']:
        z.write(src, name)
`;

function writeZip(out, texts, files) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const job = `${out}.job.json`;
  fs.writeFileSync(job, JSON.stringify({ out: `${out}.part`, texts, files }));
  try {
    execFileSync('python', ['-I', '-c', ZIP_PY, job], { stdio: 'inherit' });
  } finally {
    fs.rmSync(job, { force: true });
  }
  fs.renameSync(`${out}.part`, out);
  return fs.statSync(out).size;
}

const README = `샬레 당번 학생 모음

1. 샬레 당번 캐릭터를 우클릭 → 학생 → 학생 폴더 열기
2. 열린 폴더에 이 압축을 풉니다 (폴더째 풀어도 됩니다)
3. 다시 우클릭 → 학생에서 고릅니다

'검사 전'이 붙은 학생은 아직 움직임을 확인하지 않은 학생이라 어색하게 움직일 수 있습니다.
`;

async function main() {
  const commit = arg('commit') ?? (await getJson(`https://api.github.com/repos/${REPO}/commits/main`)).sha;
  const tree = await getJson(`https://api.github.com/repos/${REPO}/git/trees/${commit}?recursive=1`);
  if (tree.truncated) throw new Error('원본 파일 목록이 잘림');
  const entries = tree.tree.filter((t) => t.type === 'blob' && t.path.toLowerCase().endsWith('.glb'));
  console.log(`원본 ${REPO} @ ${commit.slice(0, 7)}: .glb ${entries.length}개 ${MB(entries.reduce((n, e) => n + e.size, 0))}`);

  const missing = await fill(entries, commit);
  const have = entries.filter((e) => !missing.includes(e));
  const files = modelFiles([CACHE]);
  const name = (e) => path.basename(e.path);
  const usable = have.filter((e) => files.usable(name(e)));
  const bases = usable.map((e) => name(e).replace(/\.glb$/i, ''));
  const companions = have.filter((e) => !usable.includes(e) && bases.some((b) => name(e).startsWith(`${b} (`)));
  const packed = [...usable, ...companions].sort((a, b) => name(a).localeCompare(name(b)));
  const skipped = have.filter((e) => !packed.includes(e));

  const checked = require('../src/checked-students.json').files;
  const manifest = {
    repo: REPO,
    commit,
    made: new Date().toISOString().slice(0, 10),
    checked: checked.filter((f) => packed.some((e) => name(e) === f)),
    files: packed.map((e) => ({ file: name(e), size: e.size, sha1: e.sha, pet: usable.includes(e) })),
  };
  const raw = packed.reduce((n, e) => n + e.size, 0);
  console.log(`압축에 넣을 것: 학생 ${usable.length}개 + 짝 파일 ${companions.length}개 (${MB(raw)}), 뺀 것 ${skipped.length}개 (카페 대기 없음)`);
  const size = writeZip(OUT, [
    ['읽어주세요.txt', `\ufeff${README.replace(/\n/g, '\r\n')}`],
    ['students-pack.json', JSON.stringify(manifest, null, 2)],
  ], packed.map((e) => [name(e), path.join(CACHE, name(e))]));
  console.log(`→ ${OUT} ${MB(size)} (원본의 ${Math.round((size / raw) * 100)}%)`);
  if (missing.length) console.log(`못 받은 파일 ${missing.length}개는 빠짐: ${missing.slice(0, 5).map(name).join(', ')}${missing.length > 5 ? ' …' : ''}`);
  if (skipped.length) console.log(`뺀 파일: ${skipped.map(name).join(', ')}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
