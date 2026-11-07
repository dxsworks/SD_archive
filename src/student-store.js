// 학생 받기 (2026-11-05 사용자: 학생은 앱 안에서 고를 때 받기, 압축해서). 학생 압축(zip) 하나를 따로 받던 것 대신
// 릴리스에 학생마다 brotli로 압축한 <이름>.glb.br과 목록 students-index.json을 올려 두고(tools/make-pack.js --split),
// 학생 메뉴에서 아직 없는 학생을 고르면 그 학생 파일(+ 같이 있어야 하는 파일 needs)만 받아 풀어서 받은 학생 폴더에 둔다.
// 받은 파일은 원본과 같은지 git 해시(blob sha1)로 확인한다. 목록은 마지막으로 받은 것을 저장해 두어 인터넷이 없어도 메뉴에 나온다
// 메인 프로세스와 시험 도구가 같이 쓰도록 Electron 없이 Node만 씀 (fetch는 넘겨받음: 앱은 Electron net.fetch로 시스템 프록시를 따름)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { promisify } = require('util');

const PROGRESS_EVERY = 250; // 받는 중 메뉴를 다시 그리는 간격 (ms)
const brotliDecompress = promisify(zlib.brotliDecompress);
const blobSha = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');

//   dir: 받은 학생 폴더, cacheFile: 마지막으로 받은 목록, baseUrl: 목록·학생 파일이 있는 주소(끝에 / 없이)
//   has(file): 이미 있는 학생인지 (받은 학생 폴더·설치 폴더), onChange(): 목록·받기 상태가 바뀌면 (메뉴 다시 그리기)
//   indexName: 목록 파일 이름 (합동 승리 동작은 joint-index.json, tools/make-joint-pack.js. 받은 파일은 dir/<학생 파일 이름>)
function studentStore({ dir, cacheFile, baseUrl, fetch, has, onChange = () => {}, indexName = 'students-index.json' }) {
  let index = readJson(cacheFile);
  let indexError = null; // 목록을 못 받았을 때 (저장해 둔 목록이 있으면 그걸 씀)
  const jobs = new Map(); // 학생 파일 → { got, total, error, promise }

  const entry = (file) => index?.files?.find((f) => f.file === file);

  async function refresh() {
    try {
      const res = await fetch(`${baseUrl}/${indexName}`);
      if (!res.ok) throw new Error(`목록 ${res.status}`);
      const next = await res.json();
      if (!Array.isArray(next.files)) throw new Error('목록 모양이 다름');
      index = next;
      indexError = null;
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(next));
    } catch (err) {
      indexError = err.message;
    }
    onChange();
  }

  // 받기: 같은 학생을 다시 고르면 받던 것을 그대로 기다린다. 실패한 뒤 다시 고르면 처음부터
  function download(file) {
    const running = jobs.get(file);
    if (running && !running.error) return running.promise;
    const main = entry(file);
    if (!main) return Promise.reject(new Error(`목록에 없는 학생: ${file}`));
    const parts = [main, ...(main.needs ?? []).map(entry).filter(Boolean)].filter((p) => !has(p.file));
    const job = { got: 0, total: parts.reduce((n, p) => n + p.packed, 0), error: null };
    jobs.set(file, job);
    onChange();
    let last = 0;
    const progress = (n) => {
      job.got += n;
      if (Date.now() - last > PROGRESS_EVERY) { last = Date.now(); onChange(); }
    };
    job.promise = (async () => {
      try {
        for (const p of parts) await fetchOne(p, progress);
        jobs.delete(file);
        onChange();
      } catch (err) {
        job.error = err.message;
        onChange();
        throw err;
      }
    })();
    return job.promise;
  }

  async function fetchOne(p, progress) {
    const res = await fetch(`${baseUrl}/${encodeURIComponent(p.asset)}`);
    if (!res.ok) throw new Error(`${p.file} ${res.status}`);
    const chunks = [];
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      progress(value.length);
    }
    const packed = Buffer.concat(chunks);
    const raw = await brotliDecompress(packed);
    if (raw.length !== p.size || blobSha(raw) !== p.sha1) throw new Error(`${p.file} 받은 파일이 원본과 다름`);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, p.file);
    fs.writeFileSync(`${dest}.part`, raw);
    fs.renameSync(`${dest}.part`, dest);
  }

  return {
    refresh,
    download,
    // 받을 수 있는 학생(펫으로 쓸 수 있는 것)과 받은 크기
    remotePets: () => (index?.files ?? []).filter((f) => f.pet).map((f) => ({ file: f.file, packed: f.packed })),
    sizeOf: (file) => {
      const main = entry(file);
      return main ? [main, ...(main.needs ?? []).map(entry).filter(Boolean)].reduce((n, p) => n + p.packed, 0) : 0;
    },
    job: (file) => jobs.get(file) ?? null,
    listed: (file) => !!entry(file), // 목록에 있어 받을 수 있는지
    get indexError() { return index ? null : indexError; }, // 저장해 둔 목록도 없을 때만
  };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

module.exports = { studentStore };
