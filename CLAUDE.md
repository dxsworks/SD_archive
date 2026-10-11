# Blue Archive Desktop Pet

블루 아카이브 학생 3D 모델(.glb)을 바탕화면에서 돌아다니게 하는 Electron + three.js 앱. 지금은 호시노(`models/Hoshino.glb`) 한 명을 띄운다.

- 사용법·조작: [README.md](README.md)
- **애니메이션 의미, 쓰는 것/안 쓰는 것, 다른 학생 붙이는 법: [docs/animations.md](docs/animations.md)** ← 작업 전에 먼저 읽기
- 모델 295개 지원 현황: [docs/models.md](docs/models.md), 원본 데이터 [docs/data/model-survey.json](docs/data/model-survey.json)

## 사용자와 작업하는 방식

- 한국어로 답한다.
- **한 번에 하나씩** 진행하고, 단계가 끝나면 보고한 뒤 다음으로 넘어갈지 묻는다.
- 동작은 정해진 순서로 잇기보다 **무작위로 섞는 쪽**을 선호한다(예외: 사격 `Start → Ing → End → Delay` 순서는 고정).
- "마저해줘"처럼 대상이 애매하면 추측해서 크게 작업하지 말고 먼저 확인한다.

## 실행 / 구조

```bash
npm start                      # 또는 start-pet.vbs 더블클릭 (콘솔 없이)
npx electron . --viewer        # 애니메이션 보기 창도 같이 열기
```

- `src/main.js` 투명 창, 트레이/우클릭 메뉴, 설정(`%APPDATA%/bluearchive-desktop-pet/settings.json`), 종료 시 후퇴
- `src/preload.js` IPC 브리지 `window.petBridge` (캔버스 id가 `pet`이라 `window.pet`은 쓰면 안 됨)
- `src/renderer/pet.js` 렌더링·애니메이션·행동 상태 머신(평소/전투 모드/낮잠/드래그/후퇴)·마우스 통과 판정
- `src/renderer/floor.js` 바탕화면 = 바닥: 가상 원근 카메라로 바닥 좌표 ↔ 화면 좌표
- `src/viewer/` 애니메이션 보기 창
- `src/fx/` 클릭 효과 창: 모니터 전체를 덮는 투명·클릭 통과 창에 [ba-click-fx](https://github.com/CialloKing/ba-click-fx)로 클릭 고리·끌기 트레일. 펫 창이 `petBridge.fx(down|move|up|cancel)` → 메인이 실제 커서 위치로 변환해 전달. 메뉴 "클릭 효과"로 끄기
- `tools/` 테스트·조사 도구 (아래)

## 테스트 방법 (중요)

- **실제 바탕화면에 합성 마우스/키 입력을 보내지 않는다.** 예전에 사용자의 다른 창을 클릭한 적이 있다. 화면 캡처(PowerShell, `SetProcessDPIAware` 후 `CopyFromScreen`)로 보는 것만 한다.
- 대신 화면 밖 Electron 창에서 시험한다. 먼저 프로젝트 폴더에서 정적 서버를 켠다: `python -m http.server 8765 --bind 127.0.0.1` (끝나면 `netstat -ano`로 PID 찾아 종료)
  - `npx electron tools/behavior-test.js <폴더>` 반응·무장·EX·낮잠이 대기로 돌아오는지
  - `npx electron tools/armed-test.js <폴더> [초]` 잠깐 무장 순서 기록 + 동작별 스냅샷
  - `npx electron tools/battle-test.js <폴더> [초]` 전투 모드 동작 순서 기록 + 동작별 스냅샷
  - `npx electron tools/sim-test.js <폴더>` 바탕화면 흉내 모드(`index.html?sim`)에서 걷기·드래그(창 안에만 입력)
  - `npx electron tools/retreat-test.js <폴더>` 종료(밧줄에 매달려 올라감). 캡처하는 동안 시간이 밀리니 정확한 시점 확인은 페이지 안 rAF로
  - `npx electron tools/edge-test.js` 동작·방향별로 모델이 펫 창 끝에서 몇 px 떨어지는지(0 = 잘림)
  - `npx electron tools/fx-test.js <폴더>` 클릭 효과 창만 띄워 클릭·끌기 재생 스냅샷 (정적 서버 불필요)
  - `npx electron tools/render-sheet.js <파일.png> "filter=^Cafe&cols=1&frames=6&weapons=gun&rot=90"` 동작 미리보기 시트
- 펫 페이지를 여는 테스트 도구는 `"--model=Hoshino (Swimsuit).glb"`처럼 `models/` 안의 다른 모델을 고를 수 있다(기본 `Hoshino.glb`, 페이지 주소의 `?model=`)
- 캡처 PNG는 2배 해상도(DPR 2)라 잘라낼 좌표도 2배로 계산한다.
- 브라우저 미리보기 창이 숨겨지면 rAF가 멈춰서 시간 기반 확인이 틀린다 → Electron 테스트 스크립트를 쓴다.
- 디버그 훅: `window.__pet` (`state`, `clip`, `battle`, `armed`, `floorPos`, 각 명령, `battleFor(초)`, `armFor(초)`, `timeScale` 느린 재생, `pose(동작, {face, height})` 상태 머신 멈추고 동작 반복). `battle`은 상태 getter라 전투 명령은 `battleFor`로 부른다
- 코드를 바꾼 뒤에는 실행 중인 앱을 재시작해 둔다: `taskkill //F //IM electron.exe` 후 `node_modules/electron/dist/electron.exe .` (백그라운드)

## 지켜야 할 것 (겪어서 알게 된 것)

- 동작은 번호 없는 이름(`Normal_Idle`)으로 부른다. `resolve()`가 대소문자·차림 번호(`Normal_Idle01/02`)를 맞춰 준다. 있는지 볼 때도 `clips[이름]` 대신 `has()`
- 동작 전환은 `play()`만 쓴다. 가중치 합이 1보다 작으면 바인드 자세가 섞여 모델이 크게 일그러진다.
- 동작을 새로 만들 때(예: 거꾸로 재생) 키프레임을 직접 뒤집으면 안 된다. glTF 곡선 보간은 키마다 접선이 들어 있어 모델이 깨진다 → 원래 보간(`track.createInterpolant()`)으로 일정 간격마다 값을 뽑아 담는다.
- 무기는 "그 동작이 무기 뼈대를 움직이면 보임" 규칙 하나(`clipAnimates`). 총은 카페 동작에서 애니메이션이 크기 0으로 숨긴다. 호시노 방패는 `Exs`에만 데이터가 있다.
- `Stand_Idle`은 쓰지 않는다(사용자 결정). 엄폐 자세 대기는 `Stand_Attack_Delay`.
- `Vital_Retreat`은 달리기가 아니라 헬기 밧줄에 매달린 동작(카메라 반대쪽을 봄 → π 돌려야 얼굴이 보임). 종료 때 밧줄을 그리고 창이 몸을 따라 위로 올라간다.
- 뛰는 모양의 동작(`Move_Callsign`, 첫 0.3초가 뛰는 `Move_End_*`)은 실제로 뛸 때만 튼다. 제자리에서 틀면 제자리 뛰기가 된다.
- 펫 창은 가로 2 : 세로 1(보통 560×280). EX 돌진은 높이의 약 1.95배 폭이 필요해서 이보다 좁히면 옆이 잘린다. 위쪽 여유는 35px 이상.
- 일반 브라우저에서 file:// fetch가 안 되므로 모델은 IPC(`readModel`)로 읽는다.

## 현재 상태와 다음 할 일

끝난 것: 바닥 원근 이동·그림자, 랜덤 행동/반응/낮잠/EX, 집어 들기(`Formation_Pickup`), 잠깐 무장(총 든 동작을 15~40초 몰아서), 전투 모드(총 꺼내기 또는 구호 → 무작위 총 동작 30~60초 + 승리 포즈), 종료 시 밧줄에 매달려 위로 사라짐, 애니메이션 보기 창, 모델 295개 조사 문서.

사용자와 정한 다음 순서 (하나씩, 끝날 때마다 보고):

1. ~~`Public01`을 전투 시작 동작으로~~ (한때 안 쓰기로 했다가 다시 결정: 맨손에서 잠깐 무장·자동 전투를 시작할 때 총 꺼내기로 씀. 없는 모델은 바로 무장/구호. 더블클릭은 `Exs`로 시작. 전투 중 클릭은 구호/재장전 무작위)
2. ~~랜덤 행동에서 총이 갑자기 나타나는 문제~~ (완료: "잠깐 무장" 상태로 총 든 동작을 몰아서 함. 무장 시작·끝에 총이 0.25초 만에 생기고 사라지는 건 받아들임)
3. ~~안 쓰는 동작 연결~~ (결정: `Vital_Panic`, `Vital_Dying_Ing`, `Exs_Cutin`, `Exs_Root` 모두 안 씀. 더블클릭 EX는 `Exs` 그대로)
4. ~~엄폐 자세에서 방패를 앞에 세우기~~ (결정: 안 함. `Stand_Idle`도 계속 안 씀)
5. **다른 학생 지원** (수영복 호시노 `models/Hoshino (Swimsuit).glb`로 시험 중): 체크리스트는 docs/animations.md 5장.
   - 완료: 테스트 도구 `--model=`, 몸 조각 숨김(모프 숨김 타깃), 외곽선(두께 18%), 이름 소문자 비교·차림 번호(`01`/`02`) 처리, EX 뒤 `02` 차림 유지, 동작별 몸 방향을 원래 호시노에 맞춤(`clip-facing.js`), 글자 오타 별칭(`CLIP_TYPOS`)
   - 무릎(`Kneel`) 자세 완료(시로코 `models/Shiroko.glb`로 시험, `Kneel_Idle`은 안 씀)
   - 낮잠: 모든 학생 `Vital_Death` 그대로 쓰기로 결정(총·소품이 떨어져도 둠). 누운 위치는 끝 자세 몸 가운데를 재서 학생마다 창 가운데로 맞춤(`NAP_BODY`)
   - 아리스(배틀) `models/Arisu (Battle).glb` 시험 중: 항상 장비 두른 모습으로 하기로 결정 → `(Carrier)`의 장비 대기·걷기를 `Cafe_Idle`/`Cafe_Walk`로 가져다 씀(`BORROWED_CLIPS`), 평소엔 평소 대기와 장비 모습이 다른 동작(`Cafe_Reaction`)을 피함(`clipsChangingParts`). `(Scenario)`는 안 씀. 남은 것: `Exs02_01/02`(두 번째 EX, 사격형)를 차림 번호로 잘못 읽어 EX 뒤 구호가 빠지고 두 번째 EX가 안 나옴, 낮잠 때 장비 조각이 창 오른쪽 아래 끝에 걸림

사용자가 실제 앱에서 확인함(2026-10-10): 마우스로 끌어 옮기기, 트레이 "종료", 다중 모니터 이동, `Move_Jump` 구르기.
