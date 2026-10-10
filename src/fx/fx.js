// 클릭 효과 창: 화면 전체를 덮는 투명 창에 블루 아카이브 스타일 클릭 고리·트레일을 그린다.
// 입력은 직접 받지 않고(클릭은 항상 아래로 통과), 메인 프로세스가 보내는 포인터 신호만 따른다.
import { BAClickFX } from 'ba-click-fx';

const query = new URLSearchParams(location.search);
if (query.has('test')) document.body.classList.add('test');

const fx = new BAClickFX({
  inputSource: 'manual',
  scale: Number(query.get('scale')) || 1, // 앱에서는 메인이 펫 크기에 맞춰 fx:config로 다시 정함
  // 투명 창 위에 그릴 때 권장 설정 (CSS 블렌딩은 OS 창 경계를 넘지 못함)
  outputCompositing: 'browser-overlay',
  hostCompositingSurface: 'transparent-window',
  hostCompositing: 'source-over',
});

const POINTER = { pointerId: 1, pointerType: 'mouse' };

// type: down | move | up | cancel, (x, y)는 이 창 안의 CSS 픽셀
function handle(type, x, y) {
  if (type === 'down') {
    // 이전 누름의 up을 못 받았으면 새 누름이 거부되므로 정리하고 다시 시도
    if (!fx.pointerDown({ x, y, ...POINTER })) {
      fx.pointerCancel(POINTER.pointerId);
      fx.pointerDown({ x, y, ...POINTER });
    }
  } else if (type === 'move') {
    fx.pointerMove({ x, y, ...POINTER });
  } else if (type === 'up') {
    fx.pointerUp(POINTER.pointerId);
  } else if (type === 'cancel') {
    fx.pointerCancel(POINTER.pointerId);
  }
}

window.fxBridge?.onConfig((cfg) => fx.updateConfig(cfg));
window.fxBridge?.onPointer(handle);
window.__fx = { fx, handle }; // 디버그·시험용
