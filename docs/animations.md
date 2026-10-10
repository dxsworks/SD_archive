# 애니메이션 정리

블루 아카이브 3D 모델(`.glb`, 출처: [lihaohong6/BlueArchiveModels](https://github.com/lihaohong6/BlueArchiveModels))의 애니메이션이 어떤 의미인지,
데스크톱 펫이 언제 무엇을 쓰고 무엇을 안 쓰는지 정리한 문서입니다. 다른 학생을 붙일 때 이 문서와 [models.md](models.md)를 함께 보세요.

- 모델별 지원 현황 표: [models.md](models.md)
- 원본 조사 데이터(모델 295개의 동작 이름·길이·무기 정보): [data/model-survey.json](data/model-survey.json)
- 다시 조사하기: `python tools/survey_models.py docs/data/model-survey.json` → `python tools/survey_report.py docs/data/model-survey.json docs/models.md`
- 동작을 눈으로 확인하기: 앱 메뉴 → **애니메이션 보기**, 또는 `npx electron . --viewer`

---

## 1. 이름 규칙과 분류

이름은 `분류_동작` 형식입니다. 모델 295개 중 몇 개에 들어 있는지(일반 학생 모델은 약 265개)를 함께 적었습니다.

| 분류 | 동작 (보유 모델 수) | 의미 |
|---|---|---|
| 카페 | `Cafe_Idle`(265) `Cafe_Walk`(265) `Cafe_Reaction`(263) | 카페 대기·걷기·터치 반응. **총이 크기 0으로 숨겨져 있음** |
| 편성 | `Formation_Idle`(261) `Formation_Pickup`(231) | 편성 화면 대기(총 듦), 편성에서 집어 들었을 때 매달린 자세 |
| 승리 | `Victory_Start`(178) `Victory_End`(178) | 전투 승리 포즈와 그 뒤 대기 |
| 기타 | `Public01`(163) | **총을 꺼내는 동작**: 처음엔 총이 숨겨져 있다가 끝날 때(호시노 2.22초) 나타남 |
| 전투 · 서서 | `Normal_Idle` `Normal_Attack_Start/Ing/End/Delay` `Normal_Reload` `Normal_Callsign` (약 178) | 서서 쏘는 자세 |
| 전투 · 무릎 | `Kneel_Idle` `Kneel_Attack_*` `Kneel_Reload` `Move_End_Kneel` (약 126), `Kneel_Callsign`(15) | 무릎 꿇고 쏘는 자세 |
| 전투 · 엄폐 | `Stand_Idle` `Stand_Attack_*` `Stand_Reload` `Move_End_Stand` (약 34), `Stand_Callsign`(20) | 엄폐물(호시노는 방패) 뒤에서 쏘는 자세 |
| 이동 | `Move_Ing`(179) `Move_End_Normal`(177) `Move_Jump`(87) `Move_Callsign`(24) | 전투 중 달리기, 멈추며 자세 잡기, 구르기, 이동 구호 |
| EX 스킬 | `Exs`(216) `Exs_Cutin`(167) `Exs_Cutin_01~06` `Exs_Root`/`Exs_RootMotion` | EX 스킬, 컷신, 실제로 앞으로 이동하는 버전 |
| 피격 | `Vital_Death`(187) `Vital_Panic`(186) `Vital_Retreat`(183) `Vital_Dying_Ing`(123) / `Vital_Dying_ing`(52) | 쓰러짐, 겁먹음(웅크림), 후퇴(헬기 밧줄에 매달림), 부상 대기 |
| 보조 학생 | `Tactical_Start`(85) | 보조(스페셜) 학생의 전투 시작 동작 |
| 랜덤 변형 | `*_Random` (`Normal_Callsign_Random` 54, `Formation_Idle_Random` 36, `Victory_*_Random` 35, `Tactical_Start_Random` 24 …) | 같은 상황의 다른 버전 |
| 재배치 | `Rearrange_*` (**3개 모델뿐**: 호시노 `Idle/Reaction`, 히후미 `Idle/Reaction/Start`, 시로코 `Reaction/Start/Ing`) | 총을 든 동작 |

### 이름이 제각각인 경우 (별칭 처리가 필요)

- **대소문자·오타**: `Vital_Dying_ing`(52개 모델), `Fomation_Pickup`, `Formation Pickup`, `Normal_Ilde`, `Normal_Callsigh`, `Stand_Attack_STart`, `Move_ing`, `vital_Retreat`
- **번호 붙은 변형**: `Normal_Idle01/02`, `Normal_Attack01_Delay`, `Normal_Reload01`, `Vital_Death01/02`, `Exs01/Exs02` 등 (예: 수영복 호시노, 토키)
- **폼 체인지 접두사**: `01_`/`02_`, `Normal01_`/`Normal02_`, `Kneel01_`, `Move01_` (예: `Hoshino (Battle)`)
- **탈것·소환물·기타**: `Tank_*`, `Riding_*`, `SM0xxxxx_*`, `ST_*`, `NonWeapon_*`(밴드 악기), `DiceRace_*`, `TSS_Interaction01`

→ 다른 학생 지원 시 **이름을 소문자로 비교하고 흔한 오타를 별칭으로 묶는** 처리가 필요합니다. 아직 코드에는 없습니다.

---

## 2. 알아낸 사실 (모델 데이터 특성)

1. **방향**: 카페·전투 동작 모두 앞(총구)은 +Z(카메라 쪽)입니다. 다만 서서 쏘기는 얼굴이 −30~−40°, 엄폐 대기(`Stand_Idle`)는 −116°로 돌아 있어서, 펫에서는 전투 중 모델을 ±60°(±20° 무작위) 돌려 3/4 각도로 보여줍니다(`FACE_BATTLE`, `BATTLE_SPREAD`).
2. **`Vital_Retreat`은 밧줄을 가슴 앞으로 끌어안고 한쪽 다리를 굽혀 매달린 반복 동작**입니다(게임에서 헬기 밧줄로 후퇴). 달리는 동작이 아닙니다. 카메라 반대쪽(−Z)을 보도록 만들어져 있어 얼굴을 보이려면 π만큼 돌립니다.
3. **`Exs_Root`/`Exs_RootMotion`은 `Exs`와 같은 동작 + 실제 이동**(호시노는 앞으로 1.5)입니다. 펫 바닥 좌표로 옮겨 쓰면 진짜 돌진이 됩니다.
4. **총은 모든 동작에 움직임 데이터가 있고, 카페 동작에서는 크기를 0으로 줄여 숨깁니다.** 그래서 펫은 "그 동작이 무기 뼈대를 움직이면 보이고 아니면 숨긴다"는 규칙 하나만 씁니다(`clipAnimates`).
5. **호시노 방패는 `Exs`와 `Exs_Cutin`에만 움직임이 있습니다.** 다른 동작에서 보이면 몸 한가운데 기본 위치(원점에 선 판자)에 박혀 보입니다. 같은 유형: `Kisaki (Swimsuit)`의 `CH0356_Weapon_Reload`, `Mari (Sportswear)`의 `Mari_Original_Weapon001`, `Shiroko`의 가방(44개 중 33개 동작).
6. **EX 스킬 중 방패는 왼손(`Bip001_L_Hand`)에 붙어 움직입니다**(상대 위치 오차 0.0015). 엄폐 자세에 방패를 세우려면 위치를 직접 정해야 합니다.
7. **가중치 합이 1보다 작아지면 바인드 자세가 섞여 모델이 크게 일그러집니다.** 동작 전환은 항상 "이전 → 새 동작" 두 개만 합이 1이 되게 교차 페이드해야 합니다(`play()` 참고).
8. **`Cafe_Reaction`은 하품**처럼 보입니다(호시노). 학생마다 다릅니다.

---

## 3. 데스크톱 펫이 쓰는 동작 (현재, 호시노 기준)

코드 위치: `src/renderer/pet.js`의 `ANIM`, `REACTIONS`, `ARMED_*`, `STANCES`, `STANCE_IDLE`, `ATTACK_STEPS`, `BATTLE_ENTRY`, `VICTORY`.

### 평소

| 상황 | 동작 |
|---|---|
| 대기 (3~8초마다 다음 행동 고름) | `Cafe_Idle` |
| 걷기 (바닥 위 아무 방향) | `Cafe_Walk` |
| 랜덤 행동 | **잠깐 무장** (아래) |
| 클릭 반응 | `Cafe_Reaction` |
| 낮잠 (2분 이상 방치하면 확률↑) | `Vital_Death`로 쓰러져 20~45초 → 클릭하거나 시간이 되면 `Cafe_Reaction`으로 기상 |
| 집어 들기 (드래그 중 반복) | `Formation_Pickup` |
| 더블클릭 | `Exs` (방패 돌진) |
| 종료 | 바로 `Vital_Retreat`(밧줄 잡는 자세, π−60° ±15°) → 위에서 밧줄이 0.35초 동안 손으로 내려옴 → 0.5초부터 점점 빨라지며 똑바로 끌려 올라가 화면 위로 나가면 종료(약 2초, 최대 3초). 밧줄은 두 손 뼈 사이에서 창 위 끝까지, 위쪽은 투명하게 |

평소 행동 확률(돌아다니기 켬, 2분 이내 / 2분 이상): 걷기 40/40, 잠깐 무장 20/20, 그냥 대기 12/12, 전투 모드 8/8(쿨다운 90초), 낮잠 3/25 (가중치).

### 잠깐 무장 (15~40초)

총을 든 동작을 평소 동작 사이사이에 섞으면 총이 자주 0.25초 만에 생기고 사라지므로, 한동안 몰아서 씁니다.

| 단계 | 동작 |
|---|---|
| 시작 | 바로 무장 대기로 (총이 0.25초 만에 생김) |
| 무장 대기 (3~8초마다 다음 행동 고름) | `Formation_Idle` |
| 랜덤 행동 | `Rearrange_Idle`, `Victory_End` 중 하나 (가중치 60), 그냥 대기 30, 전투 모드 10 (쿨다운 90초) |
| 클릭 반응 | `Rearrange_Reaction`, `Victory_Start` 중 하나 |
| 끝 | 평소 대기 (총이 0.25초 만에 사라짐) |

- 메뉴에서 걷기·낮잠을 고르면 무장을 끝내고 바로 합니다. 전투 중에 집어 들거나 메뉴로 랜덤 행동을 고르면 총을 든 채 무장 상태가 됩니다.

### 전투 모드 (30~60초)

| 단계 | 동작 |
|---|---|
| 시작 | `Normal_Callsign` |
| 전투 대기 (1.2~3.5초) | 서서: `Normal_Idle` / 엄폐: `Stand_Attack_Delay` (**`Stand_Idle`은 안 씀**) |
| 사격 | `{자세}_Attack_Start → Attack_Ing ×1~3 → Attack_End → Attack_Delay` |
| 재장전 | `{자세}_Reload` (3번 쏘면 확률이 크게 오름) |
| 자세 바꾸기 | 근처로 뛰어가(`Move_Ing`) 도착하며 다른 자세 `Move_End_{자세}` (돌아다니기를 끄면 안 함) |
| 자리 옮기기 | `Move_Ing` (30% 확률로 처음 1.3초를 `Move_Callsign` 뛰면서 구호, 아니면 30% 확률로 중간에 `Move_Jump`) → `Move_End_{자세}` (40% 확률로 다른 자세) |
| 구호 | `{자세}_Callsign` (전투 중 클릭해도 이걸로 대답) |
| 끝 | `Victory_Start → Victory_End` → 평소 대기 |

다음 동작은 매번 가중치로 무작위로 고릅니다(정해진 순서로 잇지 않음). 사격 한 번 안의 4단계 순서만 고정입니다.

### 바라보는 방향

- 평소(대기, 무장, 랜덤 행동, 클릭 반응, 기상): 정면 ±30° 안(`FACE_SPREAD`). 이미 그 안을 보고 있으면 그대로 두어서, 걷다 멈춘 방향을 유지하고 동작마다 몸을 돌리지 않습니다(`calmFace`).
- 전투: 적이 있는 쪽(전투마다 좌/우)으로 60° ±20°(`aimFace`). 한 자리에서는 같은 방향, 뛰어서 자리를 옮기면 새로 정합니다.
- EX(더블클릭): 전투 중이면 전투 방향, 아니면 좌/우 무작위로 60° ±20°.
- 고정값: 걷기·뛰기는 진행 방향, 종료 밧줄은 π−60° ±15°(정면 π는 손과 밧줄이 얼굴을 가리고, π+쪽은 뒷머리만 보임), 낮잠은 `FACE_NAP`, 집어 들기는 정면.

### 무기 표시

- 총: 동작이 정합니다(카페 동작은 숨김, 편성·승리·피격·전투는 보임). 맨손 ↔ 총 든 동작을 넘나들면 총이 0.25초 만에 생기고 사라집니다. 그래서 총 든 동작은 무장·전투 중에 몰아서 씁니다.
- 호시노 방패: `Exs`/`Exs_Cutin`에서만 보입니다.

---

## 4. 안 쓰는 동작 (호시노 36개 중)

| 동작 | 이유 / 계획 |
|---|---|
| `Stand_Idle` | **쓰지 않기로 결정.** 방패가 없어 허공을 향해 돌아선 것처럼 보임 → `Stand_Attack_Delay`로 대신 |
| `Vital_Panic` | **쓰지 않기로 결정.** (검토했던 후보: 높이서 떨어뜨렸을 때, 클릭 연타) |
| `Vital_Dying_Ing` | **쓰지 않기로 결정.** (검토했던 후보: 많이 흔들리거나 떨어진 뒤 어지러움) |
| `Exs_Cutin` | **쓰지 않기로 결정.** 처음 약 1.4초간 캐릭터가 화면 밖(뒤쪽 z −0.66)에서 들어오는 연출 |
| `Exs_Root` | **쓰지 않기로 결정.** 실제로 1.5 앞으로 돌진하는 버전이지만 295개 중 20개 모델에만 있음(`Exs_Root`/`Exs_RootMotion`/`Exs_Rootmotion`) → 더블클릭 EX는 `Exs` |
| `Normal_Idle`(평소) | 전투 대기로만 사용 |

`Public01`(총 꺼내기)도 **쓰지 않기로 결정**했습니다. 전투 시작·무장 시작에 붙여 봤지만, 카페 동작이 있는 모델 265개 중 158개에만 있어서 뺐습니다. (끝부분을 거꾸로 틀어 총 집어넣기로 쓰는 것도 시험했음: 총을 위로 던져 없애는 모습)

---

## 5. 다른 학생을 붙일 때 체크리스트

1. [models.md](models.md)에서 지원 수준 확인. **"전체"(168개)는 지금 코드로 대부분 동작**, "카페만"(77개, 보조 학생 등)은 전투 모드·낮잠·후퇴가 꺼짐(코드가 동작 유무를 확인해 건너뜀), "불가"(32개)는 카페 동작이 없음.
2. 자세 확인: `Kneel`(무릎) 자세 모델이 많음(125개). **펫 코드는 아직 `Normal`/`Stand`만 지원** → `STANCES`와 `STANCE_IDLE`에 `Kneel: 'Kneel_Idle'` 추가 필요(`Kneel_Callsign`이 없는 모델이 대부분이라 구호 대체도 필요).
3. 이름 변형 확인(위 1장의 "이름이 제각각인 경우"). `Vital_Dying_ing`, 번호 붙은 변형이 있으면 별칭 처리 필요.
4. 무기 확인: [data/model-survey.json](data/model-survey.json)의 `weapons[].animatedIn`이 동작 수보다 훨씬 적은 무기는 호시노 방패처럼 기본 위치에 박혀 보일 수 있음(지금 규칙으로 자동으로 숨겨짐).
5. 창 크기 확인: `tools/edge-test.js`로 동작별 창 끝 여백을 잰다(호시노는 EX가 가장 넓어 2:1 창이 필요했음).
6. 전투 방향(`FACE_BATTLE`), 낮잠 자세(`FACE_NAP`, `NAP_OFFSET`)는 호시노에 맞춘 값. 다른 학생은 애니메이션 보기 창과 `tools/render-sheet.js`로 확인 후 조정.
7. `tools/behavior-test.js`, `tools/battle-test.js`, `tools/sim-test.js`, `tools/retreat-test.js`로 확인 (모델은 현재 `index.html?sim` 스텁이 `models/Hoshino.glb`를 읽으므로 테스트할 모델로 바꿔야 함).
