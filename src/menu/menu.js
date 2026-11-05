// 우클릭 메뉴 창. 메인이 항목(menu:open)을 보내면 그리고, 필요한 창 크기를 알린 뒤(menu:ready) 메인이 커서 옆에 띄운다.
// 항목 모양: { id, label, note(이름 옆 흐린 글자), type: 'normal'|'checkbox'|'radio'|'separator', checked, enabled, danger, submenu }
// 하위 메뉴는 여러 단계(학생 → 학원 → 학생): 단계마다 옆 칸(subcol)이 하나씩
const bridge = window.menuBridge;
const root = document.getElementById('root');

let seq = 0;
let openRows = []; // 단계마다 하위 메뉴가 펼쳐진 줄
let cols = []; // 하위 메뉴 칸 (단계 1부터, cols[0]은 1단계)
let winH = 0;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// 하위 메뉴 안(더 아래 단계까지)에서 고른 하나
function pickedIn(submenu) {
  for (const s of submenu) {
    if (s.type === 'radio' && s.checked) return s;
    const deep = s.submenu && pickedIn(s.submenu);
    if (deep) return deep;
  }
  return null;
}

function rowFor(item, level) {
  if (item.type === 'separator') return el('div', 'sep');
  const row = el('div', 'item');
  if (item.enabled === false) row.classList.add('disabled');
  if (item.danger) row.classList.add('danger');
  if (item.type === 'radio') {
    row.append(el('span', 'mark'));
    if (item.checked) row.classList.add('checked');
  }
  row.append(el('span', 'label', item.label));
  if (item.note) row.append(el('span', 'hint', item.note)); // 학생 '검사 전'
  if (item.type === 'checkbox') row.append(el('span', item.checked ? 'switch on' : 'switch'));
  if (item.submenu) {
    // 하나만 고르는 하위 메뉴면 지금 고른 것을 옆에 보여 줌 (크기: 보통). 더 아래 단계에 있으면 이 줄을 표시만 (학원)
    const picked = pickedIn(item.submenu);
    if (picked && level === 0) row.append(el('span', 'hint', picked.label));
    else if (picked) row.classList.add('has-pick');
    row.append(el('span', 'arrow', '▶'));
  }
  // 맨 위 단계는 마우스를 올리면 펼침, 하위 메뉴 안에서는 하위 메뉴가 있는 줄에 올릴 때만 (다른 줄로 가도 펼친 칸을 닫지 않음)
  row.addEventListener('mouseenter', () => {
    if (level === 0 || item.submenu) openSub(level, item.submenu ? row : null);
  });
  row.addEventListener('click', () => {
    if (item.enabled === false) return;
    if (item.submenu) openSub(level, openRows[level] === row ? null : row);
    else bridge.click(item.id);
  });
  return row;
}

// 그 단계에서 펼칠 줄을 바꾼다 (더 아래 단계는 닫음)
function openSub(level, row) {
  if (openRows[level] === row) return;
  for (let l = openRows.length - 1; l >= level; l--) {
    const r = openRows[l];
    if (!r) continue;
    r.classList.remove('open');
    r.subEl.classList.add('hidden');
  }
  openRows.length = level;
  openRows[level] = row;
  if (row) {
    row.classList.add('open');
    row.subEl.classList.remove('hidden');
    placeSub(row);
  }
}

// 하위 메뉴 판을 그 줄 높이에 맞춤 (윗 판이 스크롤됐을 수 있어 펼칠 때 다시 잼). 창 아래로 넘치면 올림 (창 위 끝까지, 메인 판보다 위도)
function placeSub(row) {
  const sub = row.subEl;
  const colTop = sub.parentElement.getBoundingClientRect().top;
  const top = row.getBoundingClientRect().top - colTop - 4;
  const maxTop = winH - 10 - colTop - sub.offsetHeight;
  sub.style.top = `${Math.max(10 - colTop, Math.min(top, maxTop))}px`;
}

function colAt(level) {
  while (cols.length < level) {
    const col = el('div', 'subcol');
    root.append(col);
    cols.push(col);
  }
  return cols[level - 1];
}

// 하위 메뉴 판을 미리 만들어 두고 숨김 (재귀). 줄의 처음 위치로 창 높이를 정함. 가장 큰 판 높이는 subMax에
let subMax = 0;
function buildSubs(rows, level) {
  let bottom = 0;
  for (const [item, row] of rows) {
    if (!item.submenu) continue;
    const col = colAt(level + 1);
    if (item.submenu.some((s) => s.note)) col.classList.add('wide'); // 그리기 전에 넓혀야 판 높이·창 너비를 맞게 잼
    const sub = el('div', 'panel sub');
    const subList = el('div', 'list');
    const subRows = item.submenu.map((s) => {
      const r = rowFor(s, level + 1);
      subList.append(r);
      return [s, r];
    });
    sub.append(subList);
    col.append(sub);
    const top = Math.max(0, row.getBoundingClientRect().top - col.getBoundingClientRect().top - 4);
    sub.style.top = `${top}px`;
    subMax = Math.max(subMax, sub.offsetHeight);
    bottom = Math.max(bottom, top + sub.offsetHeight, buildSubs(subRows, level + 1));
    sub.classList.add('hidden');
    row.subEl = sub;
  }
  return bottom;
}

function render({ items, title, roomRight }) {
  openRows = [];
  cols = [];
  subMax = 0;
  root.className = '';
  root.style.paddingTop = '';
  root.replaceChildren();

  const main = el('div', 'panel main');
  const head = el('div', 'head');
  head.append(el('span', 'bar'), el('span', 'title', title), el('span', 'tag', 'SCHALE'));
  const list = el('div', 'list');
  const rows = items.map((item) => {
    const row = rowFor(item, 0);
    list.append(row);
    return [item, row];
  });
  main.append(head, list);
  root.append(main);

  // 창 높이는 가장 아래로 내려가는 판에 맞춘다
  const bottom = Math.max(main.offsetHeight, buildSubs(rows, 0));

  const pad = 10;
  const w = Math.ceil(root.scrollWidth);
  const h = Math.ceil(bottom + pad * 2);
  winH = h;
  // 커서 오른쪽에 다 안 들어가면 하위 메뉴가 왼쪽으로 펼쳐지게 뒤집고, 메인은 창을 커서 왼쪽에 둔다
  const flip = w > roomRight;
  if (flip) root.classList.add('flip');
  bridge.ready(seq, w, h, flip, main.offsetHeight, Math.ceil(Math.max(main.offsetHeight, subMax) + pad * 2));
}
bridge.onOpen((data) => {
  seq = data.seq;
  render(data);
});
// 메인이 창을 옮기고 크기를 바꾼 뒤: 그 크기로 한 번 그려진 다음에 보이게 (예전 크기의 화면이 잠깐 보이지 않게)
// 창이 화면 아래 끝까지만이라 처음 높이보다 작을 수 있고, 하위 메뉴 판을 올릴 자리로 위로 늘었으면 그만큼 메인 판을 내림
bridge.onPlaced((placed, offset, height) => {
  if (placed !== seq) return;
  root.style.paddingTop = `${10 + offset}px`;
  winH = height;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (placed === seq) bridge.painted(seq);
  }));
});

window.addEventListener('blur', () => bridge.close());
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') bridge.close(); });
window.addEventListener('contextmenu', (e) => e.preventDefault());
// 판 바깥(투명한 곳)을 누르면 닫기
window.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.panel')) bridge.close();
});
