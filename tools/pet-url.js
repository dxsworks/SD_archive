// 테스트 도구가 여는 펫 페이지 주소. --model=<파일.glb>로 models/ 안의 다른 모델을 고른다(기본 Hoshino.glb)
//   예: npx electron tools/sim-test.js out "--model=Hoshino (Swimsuit).glb"
const model = process.argv.find((a) => a.startsWith('--model='))?.slice('--model='.length);

module.exports = function petUrl({ sim = false } = {}) {
  const q = new URLSearchParams();
  if (sim) q.set('sim', '');
  if (model) q.set('model', model);
  const s = q.toString().replace(/^sim=(&|$)/, 'sim$1');
  return `http://localhost:8765/src/renderer/index.html${s ? `?${s}` : ''}`;
};
