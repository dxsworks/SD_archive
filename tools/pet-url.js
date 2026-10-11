// 테스트 도구가 여는 펫 페이지 주소. --model=<파일.glb>로 models/ 안의 다른 모델을 고른다(기본 Hoshino.glb)
//   예: npx electron tools/sim-test.js out "--model=Hoshino (Swimsuit).glb"
// 정적 서버(python http.server)의 파일을 Electron이 캐시해서, 코드를 고친 직후 테스트가 예전 코드로 돌 때가 있다 → 캐시 끔
require('electron').app.commandLine.appendSwitch('disable-http-cache');
const model = process.argv.find((a) => a.startsWith('--model='))?.slice('--model='.length);

module.exports = function petUrl({ sim = false } = {}) {
  const q = new URLSearchParams();
  if (sim) q.set('sim', '');
  if (model) q.set('model', model);
  const s = q.toString().replace(/^sim=(&|$)/, 'sim$1');
  return `http://localhost:8765/src/renderer/index.html${s ? `?${s}` : ''}`;
};
