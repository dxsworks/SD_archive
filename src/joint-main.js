// 합동 승리 (2026-11-07 사용자): 조합 학생이 바탕화면에 다 떠 있고 가까이 모이면 높은 확률로 같이 승리 포즈.
// - 조합: joint-victory.json (tools/make-joint-data.js), 합동 동작이 든 학생 모델은 joint-glb/<학생 파일 이름>
// - 다 떠 있으면 가끔 한 학생이 다른 조합 학생 옆 자기 배치 자리로 걸어감(gather) → 모두 배치 자리 가까이면 JOINT_CHANCE로 발동
// - 발동: 조합 학생 중 한 명(host) 창에 모두를 그리고(몸이 겹치는 장면이 창마다 따로면 앞뒤가 틀어짐) 나머지 창은 비움(away),
//   끝나면 host가 학생마다 끝난 자리를 알려 주고 그 자리로 돌아감(back)
// - 우클릭 메뉴 "합동 승리": 이 학생이 들어간 조합마다 떠 있는 학생 ✓, 없는 학생은 누르면 띄움 (main.js buildMenuTemplate)
// 펫 쪽은 pet.js "합동 승리" (host 읽는 동안 나머지는 hold). 상태는 펫이 1초마다·상태가 바뀔 때 알려 옴(pet:status: state, 바닥 x·z, 작업 영역)
const path = require('path');
const fs = require('fs');

const COMBOS = require('./joint-victory.json').combos;
const TICK = 2000;          // 판정 간격(ms)
const JOINT_CHANCE = 0.7;   // 가까이 모였을 때 발동 확률 (모일 때마다 한 번 굴림)
const GATHER_CHANCE = 0.06; // 다 떠 있는데 떨어져 있으면 판정마다 이 확률로 한 학생이 다른 학생 쪽으로 걸어감 (약 30초에 한 번)
const RETRY_AFTER = 45e3;   // 굴려서 안 됐으면 이만큼 뒤에 다시
const COOLDOWN = 180e3;     // 한 조합을 하고 나서 다음까지
const NEAR = 0.6; // 가까이 모임: 학생마다 배치 자리(나머지 학생으로 짐작한 조합 가운데 + 자리)에서 이 안 (바닥 단위)
const CALM = new Set(['idle', 'walk']);   // 이 상태일 때만 끼움 (전투·낮잠·들기·EX 중엔 안 함)

// 합동 동작 모델 폴더: 받은 것(userData/joint-glb) → 개발용 game-cache/joint-glb(프로젝트 폴더나 그 위, worktree에서도 찾게)
function findJointDir(userData, from) {
  const own = path.join(userData, 'joint-glb');
  if (fs.existsSync(own)) return own;
  for (let d = from; ; d = path.dirname(d)) {
    const dir = path.join(d, 'game-cache', 'joint-glb');
    if (fs.existsSync(dir)) return dir;
    if (path.dirname(d) === d) return null;
  }
}

function jointVictory({ livePets, alive, sendToPet, addPet, userData, label }) {
  const dir = findJointDir(userData, __dirname);
  const fileOf = (model) => (dir && fs.existsSync(path.join(dir, model)) ? path.join(dir, model) : null);
  const ready = COMBOS.filter((c) => c.members.every((m) => fileOf(m.model)));
  const memory = new Map(); // 조합 id → { next: 다음에 굴릴 수 있는 시각, near: 지난 판정에 가까웠는지, force: 메뉴로 부름 }
  const mem = (c) => memory.get(c.id) ?? memory.set(c.id, { next: 0, near: false, force: false }).get(c.id);
  let active = null; // { combo, host, members: [pet], from: [{x,z}] }

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
  const offSlot = (c, ps, p) => {
    const o = originOf(c, ps, ps.filter((q) => q !== p));
    const m = c.members[ps.indexOf(p)];
    return Math.hypot(p.status.x - o.x - m.x, p.status.z - o.z - m.z);
  };

  function tick() {
    if (active) return;
    const now = Date.now();
    const options = [];
    for (const c of ready) {
      const ps = petsFor(c);
      const m = mem(c);
      if (!ps.every(Boolean) || !sameArea(ps)) { m.near = false; m.force = false; continue; }
      const near = ps.every((p) => offSlot(c, ps, p) <= NEAR);
      if (!near && (m.force || (now >= m.next && Math.random() < GATHER_CHANCE))) gather(c, ps, m.force);
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
    const calm = ps.filter((p) => CALM.has(p.status.state));
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
    const host = ps[0];
    const at = originOf(c, ps);
    active = { combo: c, host, members: ps, from: ps.map((p) => ({ x: p.status.x, z: p.status.z })) };
    // host가 모델을 읽는 동안 나머지는 제자리 대기(hold): 그사이 다른 동작을 시작하면 창을 못 비워 두 번 보였음
    for (const p of ps) if (p !== host) sendToPet(p, 'pet:joint', { type: 'hold' });
    sendToPet(host, 'pet:joint', { type: 'host', combo: c, at });
  }

  // host가 모델을 다 읽고 틀기 시작함 → 나머지 창은 비움
  function onReady(pet) {
    if (!active || pet !== active.host) return;
    for (const p of active.members) if (p !== pet) sendToPet(p, 'pet:joint', { type: 'away' });
  }

  // 끝남: ends = 학생마다 끝난 바닥 자리 (조합 순서)
  function onDone(pet, ends) {
    if (!active || pet !== active.host) return;
    active.members.forEach((p, i) => { if (p !== pet && ends?.[i]) sendToPet(p, 'pet:joint', { type: 'back', ...ends[i] }); });
    active = null;
  }

  // 학생이 빠지거나(돌려보내기·창 닫힘·학생 바꾸기) 종료: 하던 합동 승리를 그만두고 비운 창은 원래 자리로
  function abortFor(pet) {
    if (!active || (pet && !active.members.includes(pet))) return;
    const { host, members, from } = active;
    active = null;
    if (alive(host) && host !== pet) sendToPet(host, 'pet:joint', { type: 'abort' });
    members.forEach((p, i) => { if (p !== host && p !== pet && alive(p)) sendToPet(p, 'pet:joint', { type: 'back', ...from[i] }); });
  }

  // 우클릭 메뉴 "합동 승리": 이 학생이 들어간 조합마다 (없으면 null)
  function menuFor(pet, canAdd) {
    const mine = ready.filter((c) => c.members.some((m) => m.model === pet.model));
    if (!mine.length) return null;
    const items = [];
    for (const c of mine) {
      const ps = petsFor(c);
      if (items.length) items.push({ type: 'separator' });
      if (mine.length > 1) items.push({ label: `${c.members.length}명이 함께`, enabled: false }); // 밴드처럼 조합이 여럿이면 어느 조합인지
      c.members.forEach((m, i) => {
        if (ps[i]) items.push({ label: `✓ ${label(m.model)}`, enabled: false });
        else items.push({ label: `${label(m.model)} 띄우기`, enabled: canAdd(), note: canAdd() ? undefined : '자리 없음', click: () => addPet(m.model, pet) });
      });
      if (ps.every(Boolean)) items.push({ label: '지금 모이기', click: () => { const mm = mem(c); mm.force = true; mm.near = false; } });
    }
    return { label: '합동 승리', submenu: items };
  }

  setInterval(tick, TICK);
  return { fileOf, menuFor, onReady, onDone, abortFor, get active() { return active; } };
}

module.exports = { jointVictory };
