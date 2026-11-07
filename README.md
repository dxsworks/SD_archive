# 샬레 당번 (Blue Archive Desktop Pet)

[BlueArchiveModels](https://github.com/lihaohong6/BlueArchiveModels)의 3D 모델(.glb)을 바탕화면 위에서 돌아다니게 하는 Electron 앱입니다.

## 실행

```bash
npm install
npm start
```

콘솔 창 없이 실행하려면 `start-pet.vbs`를 더블클릭하세요. 바탕화면 바로가기는 PowerShell에서 이렇게 만들 수 있습니다(아이콘 `assets/pet.ico`):

```powershell
$s = (New-Object -ComObject WScript.Shell).CreateShortcut("$([Environment]::GetFolderPath('Desktop'))\샬레 당번.lnk")
$s.TargetPath = "$env:WINDIR\System32\wscript.exe"; $s.Arguments = '"C:\bluearchive\start-pet.vbs"'
$s.WorkingDirectory = 'C:\bluearchive'; $s.IconLocation = 'C:\bluearchive\assets\pet.ico,0'; $s.Save()
```

## 배포용 설치 파일

```bash
npm run dist
```

`dist/BlueArchivePet-Setup-<버전>.exe`(약 86MB)와 `latest.yml`·`.blockmap`이 만들어집니다. 받는 사람은 설치 파일만 실행하면 되고(Node 불필요), 설치할 때 바탕화면·시작 메뉴에 "샬레 당번" 바로가기가 생깁니다. 서명이 없어서 처음 실행할 때 Windows SmartScreen 경고가 뜹니다("추가 정보 → 실행"). 설치 파일 이름은 영어로 둡니다(GitHub이 첨부 이름의 한글·공백을 바꾸면 `latest.yml`이 가리키는 이름과 달라져 자동 업데이트가 못 받음).

**자동 업데이트**(`src/updater.js`, `electron-updater`): 설치본은 켤 때와 6시간마다 GitHub Releases(`build.publish`, `dxsworks/SD_archive`)의 최신 릴리스를 보고, 새 버전이면 알아서 받아 둔 뒤 윈도우 알림을 띄우고 메뉴에 "업데이트하고 다시 시작"을 넣습니다. 그냥 종료해도 설치됩니다. 새 버전을 올릴 때는:

1. `package.json` `version`을 올리고 `npm run dist`
2. 릴리스(태그 `v<버전>`, Latest)에 `BlueArchivePet-Setup-<버전>.exe`, `latest.yml`, `BlueArchivePet-Setup-<버전>.exe.blockmap` 셋을 올림 (`latest.yml`이 없으면 앱이 새 버전을 못 찾음)

자동 업데이트는 이 기능이 든 버전(1.1.0 다음 버전)부터 됩니다. 1.1.0 이하를 쓰는 사람은 한 번은 직접 받아 설치해야 합니다. 시험할 때는 설치본(또는 `dist/win-unpacked`)을 환경 변수 `PET_UPDATE_URL=<latest.yml과 설치 파일이 있는 주소>`로 켜면 GitHub 대신 거기서 찾습니다.

설치 파일에 든 학생은 호시노(`models/Hoshino.glb`) 하나뿐이고, 다른 학생은 **앱 안에서 받습니다**(1.3.0부터, `src/student-store.js`). 학생 메뉴에 아직 없는 학생도 받을 크기(`↓ 2.7MB`)와 함께 나오고, 고르면 그 학생 파일만 받아 원본과 같은지(git 해시) 확인한 뒤 받은 학생 폴더(`%APPDATA%\bluearchive-desktop-pet\models`)에 풀어 두고 바로 그 학생으로 바뀝니다. 같이 있어야 하는 짝 파일(토키·사오리(드레스) 카페 옷, 아리스(배틀) 장비)도 같이 받습니다. 받는 중엔 메뉴에 `받는 중 N%`, 실패하면 `다시 받기`와 윈도우 알림. 학생 목록은 켤 때와 6시간마다 받고 마지막 것을 저장해 둬서 인터넷이 없어도 메뉴에 나옵니다.

학생 파일은 릴리스 [`students`](https://github.com/dxsworks/SD_archive/releases/tag/students)(Latest 아님: 자동 업데이트는 Latest 릴리스만 봄)에 학생마다 brotli로 압축한 `<이름>.glb.br`(원본의 약 46%, 모두 787MB)과 목록 `students-index.json`으로 올려 둡니다.

```bash
node tools/make-pack.js --commit=<원본 커밋> --cache=<받은 원본 폴더> --split=dist/students
gh release upload students -R dxsworks/SD_archive --clobber dist/students/*.glb.br   # 바뀐 파일만 올려도 됨
gh release upload students -R dxsworks/SD_archive --clobber dist/students/students-index.json   # 목록은 맨 마지막에
```

`--split`은 지난 목록과 해시가 같은 학생은 다시 압축하지 않습니다. 목록의 `checked`가 메뉴의 '검사 전' 표시에는 안 쓰이고(앱에 든 `src/checked-students.json`을 씀), 학생을 새로 붙이면 학생 파일을 올리고 앱도 새 버전으로 내야 '검사 전'이 빠집니다. 시험할 때는 `PET_STUDENTS_URL=<목록과 학생 파일이 있는 주소>`(예: `dist/students`를 `python -m http.server`로), 설정·받은 학생 폴더를 따로 쓰려면 `PET_USER_DATA=<폴더>`.

합동 승리 동작도 같은 릴리스에 둡니다. 조합 학생 파일을 다 받으면 앱이 그 조합의 합동 동작(학생당 0.2~0.5MB)만 받아 `%APPDATA%\bluearchive-desktop-pet\joint-clips`에 둡니다.

```bash
node tools/make-joint-pack.js   # game-cache/joint-glb → dist/joint
gh release upload students -R dxsworks/SD_archive --clobber dist/joint/*.joint.br
gh release upload students -R dxsworks/SD_archive --clobber dist/joint/joint-index.json   # 목록은 맨 마지막에
```

예전 방식인 학생 압축 하나(`node tools/make-pack.js` → `dist/students.zip`, 받은 학생 폴더에 풀기)도 그대로 만들 수 있고, 풀어 둔 학생은 받은 학생으로 칩니다.

앱을 삭제하면 `%APPDATA%\bluearchive-desktop-pet`(받은 학생·설정)도 같이 지워집니다(`nsis.deleteAppDataOnUninstall`, 새 버전을 덮어 설치할 때는 안 지움). 개발용 `npm start`도 같은 폴더를 쓰니 이 컴퓨터에서 설치본을 삭제하면 개발용 설정·받은 학생도 사라집니다.

- three.js `examples/jsm`은 electron-builder가 기본으로 빼므로 쓰는 파일(GLTFLoader 등)을 `build.files`에 직접 적어 두었습니다. 새 addon을 import하면 거기에도 추가
- 설치 파일은 늘 지금 사용자로만 설치합니다(`build/installer.nsh`, "모든 사용자/전용" 화면 없음). 이 파일은 영어(ASCII)로만 씁니다: 한글 주석을 넣었더니 설치 파일이 켜자마자 꺼졌음(`System.dll` 0xC0000005)
- `models`가 링크(junction)이면 빌드에 안 들어갑니다(워크트리에서 빌드할 때는 `models/Hoshino.glb`를 복사해 둠)
- 빌드 중 `Cannot create symbolic link` 오류가 나면 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign`의 `.7z`를 `winCodeSign-2.6.0` 폴더에 `darwin` 빼고 직접 풀면 됩니다(Windows 개발자 모드를 켜도 됨)

## 조작

| 동작 | 결과 |
|---|---|
| 캐릭터 클릭 | 반응 (`Cafe_Reaction` / 승리 포즈 `Victory_Start → Victory_End` 중 랜덤). 자고 있으면 깨어남. 전투 중이면 구호 / 재장전 |
| 캐릭터 더블클릭 | EX 스킬 (무기를 꺼내 방패 돌진) 후 전투 모드로 이어짐 |
| 캐릭터 드래그 | 집어 들기 (`Formation_Pickup`). 바닥 위 아무 곳에 내려놓을 수 있음 |
| 캐릭터 우클릭 / 트레이 아이콘 우클릭 | 메뉴 (동작, 학생 선택, 돌아다니기, 크기, 항상 위, 클릭 효과, 위치 초기화, 종료). 캐릭터 우클릭 메뉴는 블루 아카이브 느낌으로 그린 메뉴, 트레이는 윈도우 기본 메뉴 |
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
시간이 다 되면 승리 포즈(`Victory_Start → Victory_End`, 학생에 따라 `Victory_Start_Random → Victory_End_Random`도 무작위)로 마무리합니다.

- 사격: `Attack_Start`(나가기) → `Attack_Ing ×1~3 → Attack_Delay`, 재장전·구호·뛰기·서서 대기 전에는 `Attack_End`(돌아오기). 나가 있는 동안은 `Ing → Delay`만 반복
- 재장전: 3번 쏘면 재장전할 확률이 크게 오름
- 자세 바꾸기: 서서 쏘기(`Normal_*`) / 방패 자세(`Stand_*`) / 무릎 쏘기(`Kneel_*`) 중 그 학생에게 있는 것끼리 무작위로
- 뛰어서 자리 옮기기: `Move_Ing` (가끔 `Move_Jump` 구르기) → `Move_End_Normal/Stand/Kneel`
- 구호: `Normal_Callsign` / `Stand_Callsign` / `Kneel_Callsign` (없으면 건너뜀)
- 전투 대기: 서서 `Normal_Idle` / 엄폐 `Stand_Attack_Delay` / 무릎 `Kneel_Attack_Delay` (`Stand_Idle`·`Kneel_Idle`은 쓰지 않음)

전투 중 클릭하면 구호나 재장전으로 대답하고, 더블클릭하면 EX 스킬 후 전투로 돌아오며, 집어 들면 전투가 끝납니다.

## 다른 학생 추가

저장소에서 `.glb` 파일을 받아 `models/` 폴더에 넣고 앱을 다시 실행하면 트레이 메뉴 → **학생**에 나타납니다. 카페 대기 동작이 없는 장면용 모델(예: `Arisu (Battle) (Carrier)`·`(Scenario)`)은 메뉴에 나오지 않고 애니메이션 보기 창에서만 보입니다. `Arisu (Battle) (Carrier)`는 `Arisu (Battle)`이 장비 두른 대기·걷기를 빌려 쓰므로 같이 받아 둡니다.

```bash
curl -L -o "models/Shiroko.glb" "https://github.com/lihaohong6/BlueArchiveModels/raw/main/Shiroko.glb"
```

## 문서

- [docs/animations.md](docs/animations.md) — 애니메이션 의미, 펫이 언제 무엇을 쓰는지, 안 쓰는 동작, 다른 학생 붙이는 법
- [docs/models.md](docs/models.md) — 저장소 모델 295개의 지원 현황 표
- [CLAUDE.md](CLAUDE.md) — 작업 인수인계(현재 상태, 다음 할 일, 테스트 방법)

## 구조

- `src/main.js` — 투명 창, 트레이 메뉴, 설정 저장 (`%APPDATA%/bluearchive-desktop-pet/settings.json`)
- `src/menu/` — 캐릭터 우클릭 메뉴 창 (항목은 트레이 메뉴와 같은 `buildMenuTemplate`)
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
