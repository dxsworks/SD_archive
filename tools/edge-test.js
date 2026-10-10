// 동작별로 모델이 펫 창(캔버스) 위·좌·우 끝에서 몇 px 떨어져 있는지 잰다 (0 = 창 끝에 닿아 잘림)
// 사용: (정적 서버가 8765에서 실행 중일 때) npx electron tools/edge-test.js
//   __pet.pose(동작, { face, height })로 상태 머신을 멈추고 동작을 반복시키며 매 프레임 캔버스 픽셀을 읽는다.
//   동작 길이(D)는 호시노 기준. 여백이 작은 순으로 출력한다.
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D = { Cafe_Reaction: 2.7, Cafe_Idle: 2, Cafe_Walk: 1.33, Formation_Idle: 4.4, Formation_Pickup: 6, Exs: 7.63, Victory_End: 2, Victory_Start: 3.33, Normal_Idle: 2, Normal_Attack_Delay: 2, Normal_Attack_End: 0.5, Normal_Attack_Ing: 0.83, Normal_Attack_Start: 0.33, Normal_Callsign: 1.5, Normal_Reload: 2, Stand_Attack_Delay: 2, Stand_Attack_End: 0.5, Stand_Attack_Ing: 0.83, Stand_Attack_Start: 0.33, Stand_Callsign: 1.63, Stand_Reload: 2, Move_Callsign: 1.33, Move_End_Normal: 1.33, Move_End_Stand: 1.33, Move_Ing: 0.67, Move_Jump: 1, Rearrange_Idle: 6.4, Rearrange_Reaction: 3.8 };
const calm = ['Cafe_Reaction', 'Cafe_Idle', 'Formation_Idle', 'Victory_End', 'Victory_Start', 'Rearrange_Idle', 'Rearrange_Reaction'];
const cases = [];
for (const c of calm) for (const f of [-30, 0, 30]) cases.push([c, f, 0]);
for (const c of Object.keys(D).filter((n) => /^(Normal|Stand|Move_End|Exs)/.test(n))) for (const f of [-80, -40, 40, 80]) cases.push([c, f, 0]);
for (const c of ['Cafe_Walk', 'Move_Ing', 'Move_Callsign', 'Move_Jump']) for (const f of [0, 90, -90, 180]) cases.push([c, f, 0]);
for (const f of [0]) cases.push(['Formation_Pickup', f, 0.3]);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1440, height: 852, webPreferences: { offscreen: true, backgroundThrottling: false } });
  win.webContents.setFrameRate(60);
  await win.loadURL('http://localhost:8765/src/renderer/index.html?sim');
  const js = (c) => win.webContents.executeJavaScript(c);
  for (let i = 0; i < 50 && !(await js('Boolean(window.__pet?.state)')); i++) await sleep(200);
  await sleep(1000);
  await js(`(() => { const c = document.getElementById('pet'); const gl = c.getContext('webgl2') || c.getContext('webgl');
    window.__m = null; let buf = null;
    const f = () => { requestAnimationFrame(f); if (!window.__m) return;
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; if (!buf || buf.length !== w * h * 4) buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let top = h, left = w, right = w; // 여백(px, 버퍼 기준)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (buf[(y * w + x) * 4 + 3] > 16) {
        top = Math.min(top, h - 1 - y); left = Math.min(left, x); right = Math.min(right, w - 1 - x); } }
      const m = window.__m, dpr = w / c.clientWidth; m.top = Math.min(m.top, top / dpr); m.left = Math.min(m.left, left / dpr); m.right = Math.min(m.right, right / dpr); m.n++; m.size = [c.clientWidth, c.clientHeight];
    }; requestAnimationFrame(f); })(); 0`);
  const rows = [];
  for (const [clip, face, height] of cases) {
    await js(`__pet.pose('${clip}', { face: ${face} * Math.PI / 180, height: ${height} }); 0`);
    await sleep(500); // 돌기·페이드 끝날 때까지
    await js(`window.__m = { top: 1e9, left: 1e9, right: 1e9, n: 0 }; 0`);
    await sleep(D[clip] * 1000 + 150);
    const m = JSON.parse(await js('JSON.stringify(window.__m)')); await js('window.__m = null; 0');
    rows.push({ clip, face, height, ...m });
  }
  console.log('canvas', rows[0].size.join('x'));
  rows.sort((a, b) => Math.min(a.top, a.left, a.right) - Math.min(b.top, b.left, b.right));
  for (const r of rows) console.log(`${r.clip.padEnd(20)} face ${String(r.face).padStart(4)} lift ${r.height}  위 ${r.top.toFixed(0).padStart(4)}  왼 ${r.left.toFixed(0).padStart(4)}  오 ${r.right.toFixed(0).padStart(4)}  (${r.n}f)`);
  app.quit();
});
