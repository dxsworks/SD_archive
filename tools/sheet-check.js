// 동작 시트 (화면 밖, 정적 서버 불필요): 펫이 그 학생에게 쓰는 동작(__pet.usedClips)마다 한 줄에 5장(__pet.sheet)
// 사용: npx electron tools/sheet-check.js "모델.glb" [출력.png] [--picks]   (기본 reports/<모델>.sheet.png)
//   --picks: 사람이 볼 동작만(__pet.picks, 연출 판단·이 학생만의 특징) 이유와 함께 → 기본 reports/<모델>.picks.png, 고른 목록은 같은 이름 .json
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { ROOT, serve, openPet } = require('./pet-page');

const picksOnly = process.argv.includes('--picks');
const [model = 'Hoshino.glb', out = path.join(ROOT, 'reports', `${model}.${picksOnly ? 'picks' : 'sheet'}.png`)] = process.argv.slice(2).filter((a) => !a.startsWith('--') && !a.endsWith('sheet-check.js'));

app.whenReady().then(async () => {
  const port = await serve();
  const win = new BrowserWindow({ show: false, width: 862, height: 538, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const js = await openPet(win, port, model);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  let clips, opts = {};
  if (picksOnly) {
    const picks = await js('__pet.picks()');
    fs.writeFileSync(out.replace(/\.png$/, '.json'), `${JSON.stringify(picks, null, 1)}\n`);
    clips = picks.map((p) => p.clip);
    opts = { label: 260, notes: Object.fromEntries(picks.map((p) => [p.clip, p.why])) };
  } else {
    clips = await js('__pet.usedClips()');
  }
  if (clips.length) {
    const png = await js(`__pet.sheet(${JSON.stringify(clips)}, ${JSON.stringify(opts)})`);
    fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
  } else if (fs.existsSync(out)) {
    fs.unlinkSync(out); // 볼 동작이 없으면 예전 시트를 남기지 않음
  }
  console.log(`${clips.length}개 동작${clips.length ? ` → ${out}` : ''}`);
  app.quit();
}).catch((e) => { console.error(e); app.exit(1); });
