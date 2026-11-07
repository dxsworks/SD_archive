// 합동 승리 (2026-11-07 사용자): 조합 학생이 바탕화면에 다 떠 있고 가까이 모이면 높은 확률로 같이 승리 포즈.
// - 조합: joint-victory.json (tools/make-joint-data.js). 합동 동작: 개발용은 game-cache/joint-glb/<학생 파일 이름>(학생 파일 + 합동 동작),
//   배포는 합동 동작만 떼어 낸 것(tools/make-joint-pack.js)을 조합 학생을 다 받으면 그 조합 것만 받아(clips, student-store.js) 학생 파일에 붙여 읽음
//   (2026-11-07 사용자: 조합 다 받으면 그것만. 학생 파일 통째면 35명 310MB, 떼어 내면 압축 14.5MB)
// - 다 떠 있으면 가끔 한 학생이 다른 조합 학생 옆 자기 배치 자리로 걸어감(gather) → 모두 배치 자리 가까이면 JOINT_CHANCE로 발동
// - 발동: 모두 자기 배치 자리로 걸어가 기다림(line → jointwait), 그동안 host(조합 가운데에 가장 가까운 학생)가 합동 동작 모델을 읽음.
//   다 모이고 다 읽으면 host 창에 모두를 그리고(몸이 겹치는 장면이 창마다 따로면 앞뒤가 틀어짐, go) 나머지 창은 비움(away),
//   끝나면 host가 학생마다 끝난 자리·방향·대기 시각을 알려 주고 그 모습으로 이어서 나타남(back). 섞기는 pet.js "합동 승리"
// - 우클릭 메뉴 이름 위 얼굴 줄: 이 학생이 들어간 조합마다 떠 있는 학생 얼굴, 없는 학생은 흐린 얼굴 + (누르면 띄움), 다 있으면 ▶ = 지금 모이기 (src/menu)
// 펫 쪽은 pet.js "합동 승리" (host 읽는 동안 나머지는 hold). 상태는 펫이 1초마다·상태가 바뀔 때 알려 옴(pet:status: state, 바닥 x·z, 작업 영역)
const path = require('path');
const fs = require('fs');

const COMBOS = require('./joint-victory.json').combos;
const TICK = 2000;          // 판정 간격(ms)
const JOINT_CHANCE = 0.7;   // 가까이 모였을 때 발동 확률 (모일 때마다 한 번 굴림)
const GATHER_CHANCE = 0.06; // 다 떠 있는데 떨어져 있으면 판정마다 이 확률로 한 학생이 다른 학생 쪽으로 걸어감 (약 30초에 한 번)
const RETRY_AFTER = 45e3;   // 굴려서 안 됐으면 이만큼 뒤에 다시
const COOLDOWN = 180e3;     // 한 조합을 하고 나서 다음까지
// 가까이 모임: 학생끼리 가장 먼 거리가 그 조합 배치 자리끼리 가장 먼 거리 + NEAR 안 (바닥 단위). 어떤 순서로 붙어 있어도 됨
// (2026-11-07 사용자: 끌어다 붙여 놓아도 높은 확률로. 예전엔 각자 배치 자리 0.6 안이어야 해서 바로 옆에 붙이면 안 됐음).
// 순서가 배치와 다르면 합동 장면이 시작될 때 자리를 바꾸며 조금 순간이동함. 걸어서 모일 때(gather)는 배치 자리로 감
const NEAR = 0.6;
const LINE_MAX = 15e3;      // 줄서기가 이만큼 넘게 안 끝나면 그만둠
const LINING = new Set(['lineup', 'jointwait']);
const CALM = new Set(['idle', 'walk', 'armed']); // 이 상태일 때만 끼움 (무장은 그만두고, 전투·낮잠·들기·EX·동작 중엔 끝날 때까지 기다림)
const MOVER = new Set(['idle', 'walk']);         // 걸어서 모일 학생

const CLIPS_RETRY = 10 * 60e3; // 합동 동작을 못 받았으면 이만큼 뒤에 다시

// 개발용 합동 동작 모델 폴더 game-cache/joint-glb (프로젝트 폴더나 그 위, worktree에서도 찾게)
function findJointDir(from) {
  for (let d = from; ; d = path.dirname(d)) {
    const dir = path.join(d, 'game-cache', 'joint-glb');
    if (fs.existsSync(dir)) return dir;
    if (path.dirname(d) === d) return null;
  }
}

// clips: 받는 합동 동작 { pathOf(학생 파일) → 받은 파일 | null, listed(학생 파일): 받을 수 있는지, download(학생 파일) → Promise, job(학생 파일) }
// studentPath(학생 파일): 받은 학생 파일 | null, canGetStudent(학생 파일): 받을 수 있는 학생인지, addStudent(학생 파일, 옆 펫): 띄우기(없으면 받고)
function jointVictory({ livePets, alive, sendToPet, addStudent, stack = () => {}, label, clips = null, studentPath = () => null, canGetStudent = () => false }) {
  const dir = process.env.PET_JOINT_DEV === '0' ? null : findJointDir(__dirname); // 시험: PET_JOINT_DEV=0이면 받은 합동 동작만
  const devFile = (model) => (dir && fs.existsSync(path.join(dir, model)) ? path.join(dir, model) : null);
  // 학생 하나의 합동 동작: 개발용 모델 { full } → 받은 합동 동작 + 학생 파일 { clips, model }
  const sourceOf = (model) => {
    const full = devFile(model);
    if (full) return { full };
    const c = clips?.pathOf(model), s = studentPath(model);
    return c && s ? { clips: c, model: s } : null;
  };
  const isReady = (c) => c.members.every((m) => sourceOf(m.model));
  // 메뉴에 낼 조합: 학생마다 합동 동작이 있거나 받을 수 있고, 학생 파일도 있거나 받을 수 있음
  const isKnown = (c) => c.members.every((m) => (devFile(m.model) || clips?.pathOf(m.model) || clips?.listed(m.model)) && (studentPath(m.model) || canGetStudent(m.model)));
  const failed = new Map(); // 학생 파일 → 합동 동작을 못 받은 시각
  // 조합 학생 파일을 다 받았는데 합동 동작이 없으면 그 조합 것만 받음 (다 받으면 다음 판정부터 발동할 수 있음)
  function fetchClips() {
    if (!clips) return;
    for (const c of COMBOS) {
      if (isReady(c) || !c.members.every((m) => studentPath(m.model))) continue;
      for (const { model } of c.members) {
        if (sourceOf(model) || !clips.listed(model) || clips.job(model) || Date.now() - (failed.get(model) ?? -Infinity) < CLIPS_RETRY) continue;
        clips.download(model).catch((err) => { failed.set(model, Date.now()); console.error('합동 동작 받기 실패:', model, err.message); });
      }
    }
  }
  const memory = new Map(); // 조합 id → { next: 다음에 굴릴 수 있는 시각, near: 지난 판정에 가까웠는지, force: 메뉴로 부름 }
  const mem = (c) => memory.get(c.id) ?? memory.set(c.id, { next: 0, near: false, force: false }).get(c.id);
  let active = null; // { combo, host, me, members: [pet], from: [{x,z}], phase: 'line' | 'show', loaded, since }

  // 조합 학생마다 떠 있는 펫 (같은 학생을 두 번 띄웠으면 앞의 것)
  function petsFor(c) {
    const used = new Set();
    return c.members.map((m) => {
      const p = livePets().find((q) => q.model === m.model && !used.has(q) && !q.leaving);
      if (p) used.add(p);
      return p ?? null;
    });
  }
  const sameArea = (ps) => ps.every((p) => p.status && p.status.area === ps[0].status.area);
  // 조합 가운데 짐작: 학생마다 (지금 자리 - 배치 자리)의 평균. 학생이 배치 자리에 서 있으면 합동 승리 때 그 자리 그대로 나옴
  const originOf = (c, ps, only = ps) => {
    const list = only.map((p) => [p, c.members[ps.indexOf(p)]]);
    return { x: list.reduce((s, [p, m]) => s + p.status.x - m.x, 0) / list.length, z: list.reduce((s, [p, m]) => s + p.status.z - m.z, 0) / list.length };
  };
  // 학생 p가 자기 배치 자리에서 떨어진 거리 (나머지 학생으로 짐작한 가운데 기준)
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const span = (pts) => Math.max(0, ...pts.flatMap((a, i) => pts.slice(i + 1).map((b) => dist(a, b))));
  const isNear = (c, ps) => span(ps.map((p) => p.status)) <= span(c.members) + NEAR;
  const offSlot = (c, ps, p) => {
    const o = originOf(c, ps, ps.filter((q) => q !== p));
    const m = c.members[ps.indexOf(p)];
    return Math.hypot(p.status.x - o.x - m.x, p.status.z - o.z - m.z);
  };

  function tick() {
    fetchClips();
    if (active) {
      if (active.phase === 'line' && Date.now() - active.since > LINE_MAX) abortFor(null);
      return;
    }
    const now = Date.now();
    const options = [];
    const ready = COMBOS.filter(isReady);
    for (const c of ready) {
      const ps = petsFor(c);
      const m = mem(c);
      if (!ps.every(Boolean) || !sameArea(ps)) { m.near = false; m.force = false; continue; }
      const near = isNear(c, ps);
      // 메뉴로 불렀으면 이미 가까워도 전투·낮잠 중인 학생을 멈춰 세움 (예전엔 끝날 때까지 최대 1분 기다렸음)
      const stir = m.force && !ps.every((p) => CALM.has(p.status.state));
      if ((!near || stir) && (m.force || (now >= m.next && Math.random() < GATHER_CHANCE))) gather(c, ps, m.force);
      if (!ps.every((p) => CALM.has(p.status.state))) continue; // 가까운지(near)는 모두 평소일 때만 새로 봄 → 낮잠에서 깨면 그때 굴림
      if (near && !m.near && (m.force || now >= m.next)) {
        if (m.force || Math.random() < JOINT_CHANCE) options.push({ c, ps });
        else m.next = now + RETRY_AFTER;
      }
      m.near = near;
    }
    // 메뉴로 부른 조합이 있으면 그것만 (밴드 4명을 부르는 사이 3명 조합이 먼저 됐었음)
    const forced = options.filter((o) => mem(o.c).force);
    const pool = forced.length ? forced : ready.some((c) => mem(c).force) ? [] : options;
    if (!pool.length) return;
    // 겹치는 조합(밴드 3명 ⊂ 4명)은 무작위로 하나
    const { c, ps } = pool[Math.floor(Math.random() * pool.length)];
    start(c, ps);
  }

  // 평소(대기·걷기)인 학생 중 가장 멀리 있는 학생이 자기 배치 자리(나머지 학생으로 짐작한 조합 가운데 + 자리)로 걸어감.
  // 메뉴 "지금 모이기"(force)면 모두가 함께 짐작한 가운데의 자기 자리로, 하던 동작(낮잠·무장·전투)도 그만두고
  function gather(c, ps, force) {
    const far = (p) => offSlot(c, ps, p);
    const calm = ps.filter((p) => MOVER.has(p.status.state));
    const movers = force ? ps : calm.length ? [calm.reduce((a, b) => (far(b) > far(a) ? b : a))] : [];
    for (const p of movers) {
      if (p.status.state === 'walk' && p.gathering && Date.now() < p.gathering) continue;
      const o = originOf(c, ps, force ? ps : ps.filter((q) => q !== p));
      const m = c.members[ps.indexOf(p)];
      p.gathering = Date.now() + 8000;
      sendToPet(p, 'pet:joint', { type: 'gather', x: o.x + m.x, z: o.z + m.z, force });
    }
  }

  function start(c, ps) {
    const m = mem(c);
    m.force = false;
    m.next = Date.now() + COOLDOWN;
    // host: 배치 가운데에 가장 가까운 학생 (모두가 host 창 안에 들게. 밴드 4명은 끝 학생 창이면 반대쪽 끝 학생이 창 밖)
    const cx = c.members.reduce((s, q) => s + q.x, 0) / c.members.length;
    const cz = c.members.reduce((s, q) => s + q.z, 0) / c.members.length;
    const off = (q) => Math.hypot(q.x - cx, q.z - cz);
    const me = c.members.reduce((best, q, i) => (off(q) < off(c.members[best]) ? i : best), 0);
    const host = ps[me];
    const at = originOf(c, ps);
    active = { combo: c, host, me, members: ps, from: ps.map((p) => ({ x: p.status.x, z: p.status.z })), phase: 'line', loaded: false, since: Date.now() };
    // host는 줄서는 동안 모델을 읽고, 모두 자기 배치 자리로 걸어가 기다림 (그사이 다른 동작을 시작하면 창을 못 비워 두 번 보였음)
    sendToPet(host, 'pet:joint', { type: 'host', combo: c, me });
    ps.forEach((p, i) => sendToPet(p, 'pet:joint', { type: 'line', x: at.x + c.members[i].x, z: at.z + c.members[i].z, deg: c.members[i].deg }));
  }

  // 줄서는 중 상태: 끌어 가거나 다른 일을 하면 그만둠, 다 모이고 host가 다 읽었으면 시작
  function onStatus(pet) {
    if (!active || active.phase !== 'line' || !active.members.includes(pet)) return;
    const s = pet.status;
    if (s.sent < active.since) return; // 줄서기를 받기 전에 보낸 것
    // 줄서기를 받기 직전에 보낸 상태가 조금 늦게 올 수 있어 처음 1초는 봐 줌
    if (!LINING.has(s.state)) { if (Date.now() - active.since > 1000) abortFor(null); return; }
    maybeGo();
  }
  function onLoaded(pet) {
    if (!active || pet !== active.host) return;
    active.loaded = true;
    maybeGo();
  }
  function maybeGo() {
    const a = active;
    if (!a || a.phase !== 'line' || !a.loaded) return;
    if (!a.members.every((p) => p.status && p.status.sent >= a.since && p.status.state === 'jointwait')) return;
    a.phase = 'show';
    a.from = a.members.map((p) => ({ x: p.status.x, z: p.status.z }));
    sendToPet(a.host, 'pet:joint', { type: 'go', members: a.members.map((p) => p.status) });
  }

  // host가 모두를 그리기 시작함 → 나머지 창은 비움
  function onReady(pet) {
    if (!active || pet !== active.host) return;
    for (const p of active.members) if (p !== pet) sendToPet(p, 'pet:joint', { type: 'away' });
  }

  // 끝남: ends = 학생마다 끝난 바닥 자리·방향·대기 시각 (조합 순서). null이면 host가 못 함(읽지 못함 등) → 줄선 학생도 풀어 줌
  function onDone(pet, ends) {
    if (!active || pet !== active.host) return;
    if (!ends) { abortFor(pet); return; }
    active.members.forEach((p, i) => { if (p !== pet && ends[i]) sendToPet(p, 'pet:joint', { type: 'back', ...ends[i] }); });
    // 창은 따로라 앞뒤가 창 순서로 정해짐 → 장면에서 뒤에 있던 학생(바닥 z가 작음)의 창부터 올려 앞 학생이 위에 오게
    // (예전엔 히나 뒤에 서 있던 아코가 자기 창으로 돌아오며 히나 앞으로 튀어나왔음)
    stack(active.members.map((p, i) => [p, ends[i]?.z ?? p.status?.z ?? 0]).sort((a, b) => a[1] - b[1]).map(([p]) => p));
    active = null;
  }

  // 학생이 빠지거나(돌려보내기·창 닫힘·학생 바꾸기) 종료: 하던 합동 승리를 그만두고 비운 창은 원래 자리로
  function abortFor(pet) {
    if (!active || (pet && !active.members.includes(pet))) return;
    const { host, members, from, phase } = active;
    active = null;
    if (phase === 'line') { // 아직 줄서는 중: 모두 그 자리에서 평소로
      for (const p of members) if (p !== pet && alive(p)) sendToPet(p, 'pet:joint', { type: 'abort' });
      return;
    }
    if (alive(host) && host !== pet) sendToPet(host, 'pet:joint', { type: 'abort' });
    members.forEach((p, i) => { if (p !== host && p !== pet && alive(p)) sendToPet(p, 'pet:joint', { type: 'back', ...from[i] }); });
  }

  // 우클릭 메뉴 이름 위 얼굴 줄 (2026-11-07 사용자: 글자 없이 아이콘으로, 초안 A): 이 학생이 들어간 조합마다 한 줄.
  // 학생마다 { model, here: 떠 있음, me: 우클릭한 학생, add: 없는 학생 띄우기(자리 없으면 null) }, go: 다 있으면 "지금 모이기"
  function rowsFor(pet, canAdd) {
    return COMBOS.filter((c) => c.members.some((m) => m.model === pet.model) && isKnown(c)).map((c) => {
      const ps = petsFor(c);
      return {
        members: c.members.map((m, i) => ({
          model: m.model,
          label: label(m.model),
          here: !!ps[i],
          me: ps[i] === pet,
          add: !ps[i] && canAdd() ? () => addStudent(m.model, pet) : null,
        })),
        go: ps.every(Boolean) ? () => { const mm = mem(c); mm.force = true; mm.near = false; } : null,
      };
    });
  }

  setInterval(tick, TICK);
  return { sourceOf, rowsFor, onStatus, onLoaded, onReady, onDone, abortFor, get active() { return active; } };
}

module.exports = { jointVictory };
