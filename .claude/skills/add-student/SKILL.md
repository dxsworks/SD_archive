---
name: add-student
description: 블루 아카이브 학생 모델(.glb)을 펫에 새로 붙일 때 쓴다. "○○ 추가해줘", "다른 학생 붙여줘", "Shun 받아서 넣어줘"처럼 학생을 늘리는 요청. 받기 허락 → 학생 검사 → 경고가 없으면 바로 추가, 있으면 원인을 찾아 고치고 다시 검사 → 사람에겐 판단할 것만.
---

# 학생 추가

사용자와 정한 것(2026-10-12): **검사에 경고가 없으면 묻지 않고 바로 추가한다.** 동작 시트 전체는 너무 많으니 보여 주지 않고, 검사가 고른 "사람이 볼 동작"만 보여 준다. CLAUDE.md의 테스트 규칙(실제 바탕화면에 입력 보내지 않기, 한 번에 하나씩 보고)은 그대로 지킨다.

## 1. 어떤 파일인지 찾기

- 모델 목록과 지원 수준: `docs/models.md`, 원본 `docs/data/model-survey.json` (출처 `lihaohong6/BlueArchiveModels`, 295개)
- 받기 전에 이름만으로 미리 보기: `node tools/check-model.js --survey --brief` 에서 그 학생 줄 (경고·특징·짝 파일)
- 이름이 애매하면(차림이 여러 개 등) 추측하지 말고 어느 파일인지 묻는다

## 2. 받기 허락 (받을 때마다)

- 크기 확인: `curl -sIL "https://github.com/lihaohong6/BlueArchiveModels/raw/main/<파일 이름, 공백은 %20>" | grep -i content-length`
- 사용자에게 **파일 이름·크기·받을 곳(`models/`)** 을 알리고 허락받은 뒤에만 받는다. 짝 파일(예: 아리스(배틀) ← `(Carrier)`)이 필요하면 같이 묻는다
- 받기: `curl -L -o "C:/bluearchive/models/<파일>" "<위 주소>"` (`models/*.glb`는 git 밖. 작업 폴더의 `models`는 이 폴더로 이어 둔 연결)

## 3. 검사

자기 브랜치·작업 폴더에서(`.claude/worktrees/<이름>`, `node_modules`·`models` 연결) 돌린다:

```bash
node tools/check-student.js "<파일>.glb"
```

학생 하나에 약 3분. 결과:
- `reports/<파일>.json` — **이것을 읽는다.** `ok`(경고 없음), `warnings`(종류 `kind`, 내용 `what`, 먼저 볼 곳 `fix`), `known`(사용자가 보고 그대로 두기로 한 종류라 세지 않은 것), `picks`(사람이 볼 동작과 이유), `notes`(특징)
- `reports/<파일>.picks.png` — 볼 동작만 모은 시트, `reports/<파일>.html` — 사람용 보고서

## 4. 경고가 없으면 (`ok: true`) → 바로 추가

- `models/`에 있으면 학생 메뉴에 저절로 나온다(`main.js` `petUsable`: 카페 대기가 있는 모델). 코드에서 할 일은 없다
- 사용자에게 짧게 알린다: 추가했다, `notes`의 특징 한두 줄, `known`이 있으면 한 줄
- `picks`가 있으면 `reports/<파일>.picks.png`를 보여 주고(SendUserFile) 연출 판단이 필요한 것만 묻는다 (예: 하늘에서 떨어지는 승리 포즈, 쓰러질 때 멀리 날아가는 소품, 빌려온 동작). `picks`가 없으면 시트도 안 보여 준다

## 5. 경고가 있으면 → 원인을 찾아 고치고 다시 검사

- `fix`가 가리키는 곳부터 본다. **숫자만 보고 고치지 않는다**: 예전에 각도 숫자를 기준으로 세 번 고쳤다가 사용자 눈과 안 맞았다. 그 순간을 그려서 직접 본다(`__pet.still(rec, t)`로 넘어간 뒤 t초 모습, `__pet.edges`, `docs/data/transition-marks.json`의 `examples`가 넘어가는 기록)
- 그림·조사용 Electron 스크립트는 scratchpad에 두고, 띄우기 전에 `node --check` (문법 오류면 사용자 화면에 오류 창이 뜬다)
- 고친 뒤 새 학생과 **기본 네 학생**(`node tools/check-student.js` 인자 없이)을 다시 검사해 다른 학생이 안 깨졌는지 본다
- 모든 학생에 맞는 방법으로 고친다(학생 이름으로 나누는 건 마지막 수단. 예: `BORROWED_CLIPS`, `ACCEPTED`)

## 6. 사람에게 묻는 것

- 처음 보는 종류의 "보기에 이상함": 고치는 방법이 여럿이면 비교 그림을 만들어 고르게 한다 (각도 때 A/B/C를 확인 창에서 비교한 것처럼)
- 연출 판단(`picks`)과 끝까지 못 고친 경고
- 사용자가 그대로 두기로 하면: `tools/check-student.js`의 `ACCEPTED`에 이유와 함께 넣고, 결정은 CLAUDE.md에 적는다

## 7. 마무리

- 자기 브랜치에 자기가 바꾼 파일만 stage(`git add -A` 금지, 다른 세션도 같이 씀). main에 합치는 건 사용자 허락 후
- CLAUDE.md "현재 상태와 다음 할 일"에 그 학생 결과를 한 줄
- 실행 중인 펫 앱이 있으면 그 PID만 죽이고 다시 켠다 (CLAUDE.md "코드를 바꾼 뒤")
