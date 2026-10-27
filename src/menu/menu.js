// 우클릭 메뉴 창. 메인이 항목(menu:open)을 보내면 그리고, 필요한 창 크기를 알린 뒤(menu:ready) 메인이 커서 옆에 띄운다.
// 항목 모양: { id, label, type: 'normal'|'checkbox'|'radio'|'separator', checked, enabled, danger, submenu }
const bridge = window.menuBridge;
const root = document.getElementById('root');

let seq = 0;
let openRow = null; // 하위 메뉴가 펼쳐진 줄

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function rowFor(item, inSub) {
  if (item.type === 'separator') return el('div', 'sep');
  const row = el('div', 'item');
  if (item.enabled === false) row.classList.add('disabled');
  if (item.danger) row.classList.add('danger');
  if (item.type === 'radio') {
    row.append(el('span', 'mark'));
    if (item.checked) row.classList.add('checked');
  }
  row.append(el('span', 'label', item.label));
  if (item.type === 'checkbox') row.append(el('span', item.checked ? 'switch on' : 'switch'));
  if (item.submenu) {
    // 하나만 고르는 하위 메뉴면 지금 고른 것을 옆에 보여 줌 (크기: 보통)
    const picked = item.submenu.find((s) => s.type === 'radio' && s.checked);
    if (picked) row.append(el('span', 'hint', picked.label));
    row.append(el('span', 'arrow', '▶'));
  }
  if (!inSub) row.addEventListener('mouseenter', () => openSub(item.submenu ? row : null));
  row.addEventListener('click', () => {
    if (item.enabled === false) return;
    if (item.submenu) openSub(openRow === row ? null : row);
    else bridge.click(item.id);
  });
  return row;
}

function openSub(row) {
  if (openRow === row) return;
  if (openRow) {
    openRow.classList.remove('open');
    openRow.subEl.classList.add('hidden');
  }
  openRow = row;
  if (row) {
    row.classList.add('open');
    row.subEl.classList.remove('hidden');
  }
}

function render({ items, title, roomRight }) {
  openRow = null;
  root.className = '';
  root.replaceChildren();

  const main = el('div', 'panel main');
  const head = el('div', 'head');
  head.append(el('span', 'bar'), el('span', 'title', title), el('span', 'tag', 'SCHALE'));
  const list = el('div', 'list');
  const rows = items.map((item) => {
    const row = rowFor(item, false);
    list.append(row);
    return [item, row];
  });
  main.append(head, list);
  const subcol = el('div', 'subcol');
  root.append(main, subcol);

  // 하위 메뉴는 그 줄 높이에 맞춰 옆 칸에 미리 만들어 두고 숨김. 창 높이는 가장 아래로 내려가는 판에 맞춘다
  const top0 = subcol.getBoundingClientRect().top;
  let bottom = main.offsetHeight;
  for (const [item, row] of rows) {
    if (!item.submenu) continue;
    const sub = el('div', 'panel sub');
    const subList = el('div', 'list');
    for (const s of item.submenu) subList.append(rowFor(s, true));
    sub.append(subList);
    subcol.append(sub);
    const top = Math.max(0, row.getBoundingClientRect().top - top0 - 4);
    sub.style.top = `${top}px`;
    bottom = Math.max(bottom, top + sub.offsetHeight);
    sub.classList.add('hidden');
    row.subEl = sub;
  }

  const pad = 10;
  const w = Math.ceil(root.scrollWidth);
  const h = Math.ceil(bottom + pad * 2);
  // 커서 오른쪽에 다 안 들어가면 하위 메뉴가 왼쪽으로 펼쳐지게 뒤집고, 메인은 창을 커서 왼쪽에 둔다
  const flip = w > roomRight;
  if (flip) root.classList.add('flip');
  bridge.ready(seq, w, h, flip);
}

bridge.onOpen((data) => {
  seq = data.seq;
  render(data);
});

window.addEventListener('blur', () => bridge.close());
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') bridge.close(); });
window.addEventListener('contextmenu', (e) => e.preventDefault());
// 판 바깥(투명한 곳)을 누르면 닫기
window.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.panel')) bridge.close();
});
