# Blue Archive Desktop Pet

[BlueArchiveModels](https://github.com/lihaohong6/BlueArchiveModels)의 3D 모델(.glb)을 바탕화면 위에서 돌아다니게 하는 Electron 앱입니다.

## 실행

```bash
npm install
npm start
```

콘솔 창 없이 실행하려면 `start-pet.vbs`를 더블클릭하세요. 바탕화면 바로가기는 PowerShell에서 이렇게 만들 수 있습니다(아이콘 `assets/pet.ico`):

```powershell
$s = (New-Object -ComObject WScript.Shell).CreateShortcut("$([Environment]::GetFolderPath('Desktop'))\호시노 펫.lnk")
$s.TargetPath = "$env:WINDIR\System32\wscript.exe"; $s.Arguments = '"C:\bluearchive\start-pet.vbs"'
$s.WorkingDirectory = 'C:\bluearchive'; $s.IconLocation = 'C:\bluearchive\assets\pet.ico,0'; $s.Save()
```

## 조작

| 동작 | 결과 |
|---|---|
| 캐릭터 클릭 | 반응 (`Cafe_Reaction` / 승리 포즈 `Victory_Start` 중 랜덤). 자고 있으면 깨어남. 전투 중이면 구호 / 재장전 |
| 캐릭터 더블클릭 | EX 스킬 (무기를 꺼내 방패 돌진) 후 전투 모드로 이어짐 |
| 캐릭터 드래그 | 집어 들기 (`Formation_Pickup`). 바닥 위 아무 곳에 내려놓을 수 있음 |
| 캐릭터 우클릭 / 트레이 아이콘 우클릭 | 메뉴 (동작, 학생 선택, 돌아다니기, 크기, 항상 위, 위치 초기화, 종료) |
| 트레이 아이콘 클릭 | 반응 |
| 메뉴 → 종료 | 위에서 내려온 밧줄을 잡고(`Vital_Retreat`) 화면 위로 끌려 올라가 사라진 뒤 종료 (한 번 더 누르면 바로 종료) |
| 메뉴 → 애니메이션 보기 | 모델의 모든 동작을 목록에서 골라 재생 (회전·확대, 속도, 무기 표시, 공격 순서 재생) |

캐릭터가 없는 투명한 부분은 클릭이 아래 창으로 그대로 전달됩니다.

## 바탕화면 = 바닥

작업 영역 전체를 비스듬히 내려다본 바닥으로 취급합니다. 화면 위쪽일수록 멀어서 작게, 아래쪽일수록 가까워서 크게 보이고,
앞뒤·대각선으로 걸어 다니며 뒷모습과 옆모습도 보입니다. 발밑 그림자는 들어 올려도 바닥에 남습니다.

혼자 두면 걷기를 하거나, 가끔 잠깐 총을 든 동작들을 하다가 맨손으로 돌아오고, 한동안 건드리지 않으면 낮잠을 잡니다.

## 전투 모드

가끔(직전 전투 후 90초 이상 지났을 때), 메뉴 → 동작 → 전투 모드 / 공격, 또는 더블클릭 EX로 시작합니다.
총 꺼내기(`Public01`, 없거나 이미 총을 들고 있으면 구호 `Normal_Callsign`)로 시작해 30~60초 동안 전투 대기(1~3.5초)와 아래 동작을 무작위로 섞어 하고,
시간이 다 되면 `Victory_Start → Victory_End`로 마무리합니다.

- 사격: `Attack_Start → Attack_Ing ×1~3 → Attack_End → Attack_Delay`
- 재장전: 3번 쏘면 재장전할 확률이 크게 오름
- 자세 바꾸기: 서서 쏘기(`Normal_*`) / 방패 자세(`Stand_*`) / 무릎 쏘기(`Kneel_*`) 중 그 학생에게 있는 것끼리 무작위로
- 뛰어서 자리 옮기기: `Move_Ing` (가끔 `Move_Jump` 구르기) → `Move_End_Normal/Stand/Kneel`
- 구호: `Normal_Callsign` / `Stand_Callsign` / `Kneel_Callsign` (없으면 건너뜀)
- 전투 대기: 서서 `Normal_Idle` / 엄폐 `Stand_Attack_Delay` / 무릎 `Kneel_Attack_Delay` (`Stand_Idle`·`Kneel_Idle`은 쓰지 않음)

전투 중 클릭하면 구호나 재장전으로 대답하고, 더블클릭하면 EX 스킬 후 전투로 돌아오며, 집어 들면 전투가 끝납니다.

## 다른 학생 추가

저장소에서 `.glb` 파일을 받아 `models/` 폴더에 넣고 앱을 다시 실행하면 트레이 메뉴 → **학생**에 나타납니다.

```bash
curl -L -o "models/Shiroko.glb" "https://github.com/lihaohong6/BlueArchiveModels/raw/main/Shiroko.glb"
```

## 문서

- [docs/animations.md](docs/animations.md) — 애니메이션 의미, 펫이 언제 무엇을 쓰는지, 안 쓰는 동작, 다른 학생 붙이는 법
- [docs/models.md](docs/models.md) — 저장소 모델 295개의 지원 현황 표
- [CLAUDE.md](CLAUDE.md) — 작업 인수인계(현재 상태, 다음 할 일, 테스트 방법)

## 구조

- `src/main.js` — 투명 창, 트레이 메뉴, 설정 저장 (`%APPDATA%/bluearchive-desktop-pet/settings.json`)
- `src/preload.js` — 렌더러 ↔ 메인 IPC 브리지 (`window.petBridge`)
- `src/renderer/pet.js` — three.js 렌더링, 애니메이션, 행동 상태 머신, 드래그, 마우스 통과 판정
- `src/renderer/floor.js` — 바닥 좌표 ↔ 화면 좌표 변환 (가상 원근 카메라)
- `src/viewer/` — 애니메이션 보기 창 (`npx electron . --viewer`로 바로 열 수도 있음)

## 개발용 도구

정적 서버(`python -m http.server 8765`)를 프로젝트 폴더에서 켠 상태에서:

- `http://localhost:8765/src/renderer/index.html?sim` — 브라우저에서 바탕화면 흉내 모드로 확인
- `npx electron tools/sim-test.js <폴더>` — 걷기·드래그를 화면 밖 창에서 시험하고 스냅샷 저장
- `npx electron tools/behavior-test.js <폴더>` — 모든 동작이 끝나고 대기로 돌아오는지 시험
- `npx electron tools/battle-test.js <폴더> [초]` — 전투 모드를 돌려 동작 순서를 기록하고 스냅샷 저장
- `npx electron tools/retreat-test.js <폴더>` — 종료 후퇴 동작 시험
- `python tools/survey_models.py docs/data/model-survey.json` — 저장소의 모든 모델 동작 목록 조사 (파일 앞부분만 받음)
- `python tools/survey_report.py docs/data/model-survey.json docs/models.md` — 조사 결과로 지원 현황 표 생성
- `npx electron tools/render-sheet.js <파일.png> "filter=^Cafe&cols=1&frames=6"` — 애니메이션 미리보기 시트

## 참고

모델은 Nexon/Yostar의 게임 리소스입니다. 개인적으로만 사용하고 재배포하지 마세요.
