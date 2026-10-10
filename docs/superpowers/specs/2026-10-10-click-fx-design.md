# 클릭 효과 설계 (2026-10-10)

펫을 클릭하거나 끌 때 블루 아카이브 스타일의 클릭 고리·트레일 효과를 보여준다.
효과는 [ba-click-fx](https://github.com/CialloKing/ba-click-fx)(MIT, npm `ba-click-fx@1.3.9`)를 그대로 쓴다.

이 작업 다음 순서: ② 커서 쳐다보기 → ③ 부위별 터치 반응 (Mate-Engine·Ark-Pets 아이디어, 각각 따로 설계).

## 결정한 것

- **효과 전용 투명 창**을 따로 띄운다(펫 창 안에 그리지 않음). 펫 창은 작고(보통 210×280) 캐릭터를 따라 움직이므로, 안에 그리면 고리가 잘리고 EX 돌진 때 효과가 끌려간다.
- **클릭 + 끌 때 트레일** 둘 다 보여준다.
- 펫을 왼쪽 버튼으로 눌렀을 때만. 바탕화면 아무 데나 클릭할 때의 효과(전역 마우스 훅)는 범위 밖.

## 구성

| 파일 | 역할 |
|---|---|
| `src/fx/index.html`, `src/fx/fx.js` (새) | 효과 창 화면. `BAClickFX`를 `inputSource: 'manual'`, `outputCompositing: 'browser-overlay'`, `hostCompositingSurface: 'transparent-window'`, `hostCompositing: 'source-over'`로 만들고, 받은 신호를 `pointerDown/Move/Up/Cancel`로 넘긴다. 색은 기본 게임 파랑. 모듈은 importmap으로 `node_modules/ba-click-fx/dist/ba-click-fx.js`를 가리킨다 |
| `src/fx/preload.js` (새) | 효과 창 전용 브리지: 메인에서 오는 포인터 신호 수신 |
| `src/main.js` | 효과 창 생성·관리, 신호 중계, 모니터 전환 시 이동, 메뉴 "클릭 효과" 체크박스(`settings.clickFx`, 기본 `true`) |
| `src/preload.js` | `petBridge.fx(type)` 추가 (`type`: `down` `move` `up` `cancel`) |
| `src/renderer/pet.js` | 기존 포인터 처리기에서 `bridge.fx(type)`만 보냄. 위치는 메인이 `screen.getCursorScreenPoint()`로 정함 (배율이 다른 모니터에서도 정확) |
| `package.json` | `ba-click-fx` 의존성 `1.3.9` 고정 |
| `tools/fx-test.js` (새) | 효과 창 시험 도구 (아래) |

### 효과 창

- 펫이 있는 모니터의 `display.bounds` 전체 크기, `transparent`, `frame: false`, `focusable: false`, `skipTaskbar`, 항상 위, `setIgnoreMouseEvents(true)`(항상 통과, forward 불필요), `showInactive()`.
- 앱 시작 시 한 번 만들고 종료 때 같이 닫는다. 설정에서 효과를 끄면 신호를 보내지 않고 효과 창에 `cancel`을 보내 남은 트레일을 정리한다.
- 펫 창이 다른 모니터로 가면(`pet:move` 처리 중 `screen.getDisplayMatching`의 결과가 바뀌면) 효과 창을 그 모니터 `bounds`로 옮긴다.

### 신호 흐름

1. `pet.js`의 `pointerdown`(펫 위 `hovering`이고 왼쪽 버튼이고 후퇴/종료 상태가 아닐 때, 즉 기존에 `drag`를 시작하는 경우) → `bridge.fx('down')`
2. `pointermove`에서 `drag`가 있는 동안 → `bridge.fx('move', ...)`
3. `pointerup` → `up`, `pointercancel` → `cancel` (기존 `endDrag` 경로에서, `drag`가 있었을 때만)
4. 메인: `settings.clickFx`가 꺼져 있으면 무시. 아니면 `screen.getCursorScreenPoint()`(DIP)에서 효과 창 `bounds.x/y`를 빼서 창 안 좌표로 바꿔 효과 창에 전달.
5. 효과 창: 받은 좌표로 `fx.pointerDown({ x, y })` 등 호출. 라이브러리가 좌표를 캔버스 안으로 잘라 준다.

더블클릭은 `down/up`이 두 번 오므로 고리도 두 번 나온다. 우클릭은 보내지 않는다.

## 알려진 한계

- 끄는 도중 다른 모니터로 넘어가면 트레일이 경계에서 끊길 수 있다(효과 창은 모니터 하나만 덮음).

## 테스트 (실제 바탕화면에는 입력을 보내지 않음)

- `npx electron tools/fx-test.js <폴더>`: 화면 밖 창에 `src/fx/index.html?test`(어두운 배경)를 띄우고, 효과 창과 같은 IPC 경로로 `down → move 여러 번 → up`을 재생한다. 0.1/0.3/0.6/1.5초 등 시점별로 `capturePage` 스냅샷 PNG를 저장한다. 고리와 트레일이 보이는지, 끝난 뒤 배경만 남는지 본다.
- `npx electron tools/sim-test.js <폴더>`: 바탕화면 흉내 모드에서 클릭·드래그가 전과 같이 동작하는지(효과 신호 추가로 깨지지 않는지). 이 모드에는 효과 창이 없으므로 `bridge.fx`는 아무 일도 하지 않는 스텁이어야 한다.
- 코드 변경 후 실행 중인 앱을 재시작해 둔다. 실제 마우스로 하는 확인은 사용자에게 부탁한다.
