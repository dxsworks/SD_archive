// 원본 저장소가 바뀌었는지 보기 (2026-11-04 사용자: 원본 변경 따라가기)
// 원본 main의 .glb 목록을 받은 원본(pack-cache)과 git 해시로 비교해 새로 생긴 것·바뀐 것·없어진 것을 알려 준다. 아무것도 받지 않음
// 바뀐 게 있으면: 크기를 알리고 허락받아 make-pack.js로 받기 → 새 학생·바뀐 학생 검사(add-student) → 압축 다시 만들기
//
//   node tools/upstream-check.js [--cache=pack-cache] [--commit=<sha>]
//     --commit  비교할 원본 커밋 (기본: 지금 main)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = 'lihaohong6/BlueArchiveModels';
const ROOT = path.join(__dirname, '..');
const arg = (name, def) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def;
const CACHE = path.resolve(arg('cache', path.join(ROOT, 'pack-cache')));
const MB = (n) => `${(n / 1e6).toFixed(1)}MB`;

const blobSha = (file) => {
  const buf = fs.readFileSync(file);
  return crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
};

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'bluearchive-desktop-pet' } });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function main() {
  const head = arg('commit') ?? (await getJson(`https://api.github.com/repos/${REPO}/commits/main`)).sha;
  const info = await getJson(`https://api.github.com/repos/${REPO}/commits/${head}`);
  const tree = await getJson(`https://api.github.com/repos/${REPO}/git/trees/${head}?recursive=1`);
  if (tree.truncated) throw new Error('원본 파일 목록이 잘림');
  const remote = new Map(tree.tree.filter((t) => t.type === 'blob' && t.path.toLowerCase().endsWith('.glb'))
    .map((t) => [path.basename(t.path), t]));
  const local = new Map(fs.readdirSync(CACHE).filter((f) => f.toLowerCase().endsWith('.glb')).map((f) => [f, path.join(CACHE, f)]));
  const checked = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'checked-students.json'), 'utf8')).files);
  const tag = (f) => (checked.has(f) ? ' (검사한 학생)' : '');

  const added = [...remote.keys()].filter((f) => !local.has(f)).sort();
  const removed = [...local.keys()].filter((f) => !remote.has(f)).sort();
  const changed = [...remote.keys()].filter((f) => local.has(f) && blobSha(local.get(f)) !== remote.get(f).sha).sort();

  console.log(`원본 ${REPO} @ ${head.slice(0, 7)} (${info.commit.committer.date.slice(0, 10)}): .glb ${remote.size}개, 받은 원본 ${local.size}개`);
  const list = (title, files, size) => {
    console.log(`${title} ${files.length}개${size ? ` ${MB(files.reduce((n, f) => n + remote.get(f).size, 0))}` : ''}`);
    for (const f of files) console.log(`  ${f}${size ? ` ${MB(remote.get(f).size)}` : ''}${tag(f)}`);
  };
  list('새로 생김', added, true);
  list('바뀜', changed, true);
  list('원본에서 없어짐', removed, false);
  if (!added.length && !changed.length && !removed.length) console.log('받은 원본과 같음 → 할 것 없음');
  else console.log(`받으려면 (크기를 알리고 허락받기): node tools/make-pack.js --commit=${head} --cache=${CACHE}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
