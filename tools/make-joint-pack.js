// 합동 승리 동작 묶음 (배포용, 2026-11-07 사용자: 조합 학생을 다 받으면 그 조합 것만 앱이 받음)
//   node tools/make-joint-pack.js [--src=game-cache/joint-glb] [--base=pack-cache] [--out=dist/joint]
// game-cache/joint-glb의 합동 동작 모델은 원래 학생 파일 통째 + 합동 동작(Victory_*_Interaction*)이라 학생마다 5~14MB(35명 310MB).
// 학생 파일은 사용자가 이미 받아 둔 것과 같으니 합동 동작만 떼어 뼈 노드 + 동작만 든 작은 glb로 만들고(학생당 1~2MB)
// brotli로 압축해 <첨부 이름>.joint.br + joint-index.json. 앱(src/student-store.js, joint-main.js)은 받은 학생 파일에 이 동작을 붙여 씀.
// 학생 파일 묶음(dist/students, make-pack.js --split)과 같은 릴리스(students)에 올리지만 폴더는 따로 (거기는 모르는 .glb.br를 지움)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const arg = (name, def) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def;
const SRC = path.resolve(ROOT, arg('src', findUp('game-cache/joint-glb')));
const BASE = path.resolve(ROOT, arg('base', findUp('pack-cache')));
const OUT = path.resolve(ROOT, arg('out', 'dist/joint'));
const JOINT_CLIP = /Interaction/;
const MB = (n) => `${(n / 1e6).toFixed(2)}MB`;
const blobSha = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
// 릴리스 첨부 이름: 영어 소문자·숫자·-만 (make-pack.js와 같은 규칙, 끝만 .joint.br)
const assetName = (file) => `${file.replace(/\.glb$/i, '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.joint.br`;

// 워크트리에서도 메인 폴더의 game-cache·pack-cache를 찾음
function findUp(rel) {
  for (let d = ROOT; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, rel))) return path.join(d, rel);
    if (path.dirname(d) === d) return rel;
  }
}

function readGlb(file) {
  const b = fs.readFileSync(file);
  const jl = b.readUInt32LE(12);
  return { json: JSON.parse(b.subarray(20, 20 + jl)), bin: b.subarray(20 + jl + 8), bytes: b };
}

function writeGlb(json, bin) {
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 32)]);
  const bb = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bb.length, 8);
  const h1 = Buffer.alloc(8); h1.writeUInt32LE(js.length, 0); h1.writeUInt32LE(0x4e4f534a, 4);
  const h2 = Buffer.alloc(8); h2.writeUInt32LE(bb.length, 0); h2.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, h1, js, h2, bb]);
}

// 뼈 노드(메시·스킨 뺌) + 합동 동작만. 노드 순서·이름은 그대로라 three.js가 같은 트랙 이름(노드 이름.속성)으로 읽음
function stripClips({ json, bin }) {
  const views = [], accs = [], chunks = [], seen = new Map();
  let off = 0;
  const take = (i) => {
    if (seen.has(i)) return seen.get(i);
    const a = json.accessors[i], v = json.bufferViews[a.bufferView];
    const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const data = bin.subarray(start, (v.byteOffset ?? 0) + v.byteLength);
    const pad = (4 - (off % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
    chunks.push(data);
    views.push({ buffer: 0, byteOffset: off, byteLength: data.length });
    off += data.length;
    const na = { ...a, bufferView: views.length - 1 };
    delete na.byteOffset;
    accs.push(na);
    seen.set(i, accs.length - 1);
    return accs.length - 1;
  };
  const animations = json.animations.filter((a) => JOINT_CLIP.test(a.name)).map((a) => ({
    name: a.name,
    channels: a.channels,
    samplers: a.samplers.map((s) => ({ ...s, input: take(s.input), output: take(s.output) })),
  }));
  if (animations.some((a) => a.channels.some((c) => c.target.path === 'weights'))) throw new Error('모프 값 트랙이 있음 (메시를 빼면 못 읽음)');
  const nodes = json.nodes.map((n) => { const m = { ...n }; delete m.mesh; delete m.skin; delete m.camera; return m; });
  const out = { asset: json.asset, scene: json.scene ?? 0, scenes: json.scenes, nodes, animations, accessors: accs, bufferViews: views, buffers: [{ byteLength: off }] };
  return { glb: writeGlb(out, Buffer.concat(chunks)), clips: animations.map((a) => a.name) };
}

function main() {
  if (!fs.existsSync(SRC)) throw new Error(`합동 동작 모델 폴더가 없음: ${SRC}`);
  fs.mkdirSync(OUT, { recursive: true });
  const files = [];
  for (const file of fs.readdirSync(SRC).filter((n) => n.endsWith('.glb')).sort()) {
    const joint = readGlb(path.join(SRC, file));
    const baseFile = path.join(BASE, file);
    if (!fs.existsSync(baseFile)) throw new Error(`원래 학생 파일이 없음: ${baseFile}`);
    const base = readGlb(baseFile);
    // 원래 학생 파일과 노드가 같아야 받은 학생 파일에 붙일 수 있음
    if (base.json.nodes.length !== joint.json.nodes.length || base.json.nodes.some((n, i) => n.name !== joint.json.nodes[i].name)) {
      throw new Error(`${file}: 원래 학생 파일과 노드가 다름`);
    }
    const { glb, clips } = stripClips(joint);
    if (!clips.length) throw new Error(`${file}: 합동 동작이 없음`);
    const packed = zlib.brotliCompressSync(glb, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: glb.length } });
    const asset = assetName(file);
    fs.writeFileSync(path.join(OUT, asset), packed);
    files.push({ file, asset, size: glb.length, sha1: blobSha(glb), packed: packed.length, clips, base: blobSha(base.bytes) });
    console.log(`${file} ${MB(joint.bytes.length)} → ${MB(glb.length)} → ${MB(packed.length)} (${clips.join(', ')})`);
  }
  const names = new Set(files.map((f) => f.asset));
  for (const name of fs.readdirSync(OUT)) if (name.endsWith('.joint.br') && !names.has(name)) fs.rmSync(path.join(OUT, name));
  fs.writeFileSync(path.join(OUT, 'joint-index.json'), JSON.stringify({ made: new Date().toISOString(), files }, null, 2));
  console.log(`${files.length}개, 모두 ${MB(files.reduce((n, f) => n + f.packed, 0))} → ${path.relative(ROOT, OUT)}`);
}

main();
