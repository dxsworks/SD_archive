// 동작 이름 규칙과 펫이 쓰는 동작 목록. 펫(pet.js)과 학생 검사 도구(tools/check-model.js)가 같이 쓴다
// (Node에서도 읽을 수 있게 three.js 없이 쓰고, 같은 폴더 package.json에 "type": "module"을 둠)

// 동작 이름 목록. 학생마다 없는 동작이 있으니 앞에서부터 있는 것을 쓴다.
export const ANIM = {
  idle: ['Cafe_Idle', 'Normal_Idle'],
  walk: ['Cafe_Walk', 'Move_Ing'],
  pickup: ['Formation_Pickup', 'Victory_Start', 'Cafe_Reaction'], // 편성 화면에서 학생을 집어 들었을 때 동작
  nap: ['Vital_Death'],
  wake: ['Cafe_Reaction'], // 평소 모습과 다르면(아리스(배틀)) 승리 포즈로 대신
  ex: ['Exs'],
};
// 클릭 반응: 카페 반응 / 승리 포즈(Start → End 짝, 두 번째 짝 _Random이 있으면 그것도) 무작위
// (Start만 틀면 포즈를 잡자마자 대기로 돌아가 너무 빨리 끝난 느낌이었음. 학생마다 승리 포즈에 총을 드는 경우가 있어 그때는 총이 0.25초 만에 생김)
export const REACTION = 'Cafe_Reaction';
// 총을 든 동작들. 맨손 ↔ 총 든 동작을 넘나들 때마다 총이 0.25초 만에 생기고 사라지므로, 무장 중에 몰아서 쓴다
// 무장 대기는 서서 쏘기 대기. 편성 대기(Formation_Idle)는 쓰지 않는다 (사용자 결정 2026-10-11): 구호·재장전·총 꺼내기는 전투 자세(발을 앞뒤로 벌림)라
// 편성 대기(발을 나란히, 정면)와 오갈 때마다 발이 바닥에서 50~95° 비틀렸다
export const ARMED_IDLE = 'Normal_Idle';
// 승리 포즈는 넣지 않는다(무장은 총을 들고 있어 전투처럼 보여서, 전투 중간에 승리 포즈가 나오는 것처럼 보였음). 승리 포즈는 평소·전투 끝에
// 구호·재장전은 카페 동작이 있는 모델 265개 중 약 177개, Rearrange_*는 2~3개에만 있음
export const ARMED_FIDGETS = ['Normal_Callsign', 'Normal_Callsign_Random', 'Normal_Reload', 'Rearrange_Idle', 'Rearrange_Start'];
// 그중 이어 트는 짝 (둘 다 있을 때만): 시로코 Rearrange_Start(내려와 앉았다 일어남) → Rearrange_Ing(총 들고 서 있기) (사용자 결정 2026-10-12)
export const ARMED_FIDGET_PAIRS = [['Rearrange_Start', 'Rearrange_Ing']];
export const ARMED_REACTIONS = ['Normal_Callsign', 'Normal_Callsign_Random', 'Rearrange_Reaction'];
// 전투 자세: 서서 쏘기(Normal) / 방패 뒤에 숨어 쏘기(Stand) / 무릎 꿇고 쏘기(Kneel). 학생마다 있는 자세만 쓴다
// 공격 한 번은 시작 → 사격 → 끝 → 대기 순서로 이어야 자연스럽다
export const STANCES = ['Normal', 'Stand', 'Kneel'];
// 자세별 전투 대기 동작. Stand_Idle은 쓰지 않는다(방패 데이터가 없어 허공을 보고 돌아선 것처럼 보임) → 조준 대기로 대신
// Kneel_Idle도 몸이 쏘는 방향과 90°쯤 어긋나 왼쪽을 볼 때 등만 보인다 → 마찬가지로 조준 대기로 대신
export const STANCE_IDLE = { Normal: 'Normal_Idle', Stand: 'Stand_Attack_Delay', Kneel: 'Kneel_Attack_Delay' };
export const ATTACK_STEPS = ['Attack_Start', 'Attack_Ing', 'Attack_End', 'Attack_Delay'];
export const BATTLE_ENTRY = ['Normal_Callsign'];
// 총 꺼내기: 빈손으로 손짓하다가 끝에 총을 꺼내 드는 동작(Public01, 수영복 호시노는 Normal01_Public01). 약 190개 모델에 있음.
// 맨손에서 무장·전투로 넘어갈 때 틀면 총이 갑자기 나타나지 않는다. 총을 든 상태에서 틀면 총이 사라졌다 다시 나타나므로 맨손일 때만
export const DRAW_WEAPON = ['Public', 'Normal_Public'];
export const RUN_CALLSIGN = 'Move_Callsign'; // 뛰면서 하는 구호. 제자리에서 틀면 제자리 뛰기가 되므로 실제로 뛸 때만 쓴다
// 승리 포즈 짝. 두 번째 짝(_Random, 약 35개 모델)이 있으면 무작위로 섞는다 (아리스(배틀): Victory_Start는 하늘에서 떨어져 착지, _Random은 제자리)
export const VICTORIES = [['Victory_Start', 'Victory_End'], ['Victory_Start_Random', 'Victory_End_Random']];
// 위 목록 밖에서 pet.js가 이름을 직접 부르는 동작 (자세별 동작은 stanceAll)
export const OTHER_CLIPS = ['Move_Ing', 'Move_Jump', 'Vital_Retreat'];
// 자세 하나에서 쓰는 동작: 대기, 사격 4단계, 재장전, 구호, 뛰어와서 그 자세 잡기
// 재장전 변형(_Random, 서서 21개·무릎 10개 모델): 있으면 원래 재장전과 무작위로 섞는다 (사용자 결정 2026-10-12).
// 지금 차림 번호의 것만 쓴다 (수영복 호시노 Normal_Reload02_Random은 겉옷 벗은 02 차림에서만)
export const RELOAD_VARIANT = (name) => `${name}_Random`;
export const RELOAD_VARIANTS = STANCES.map((st) => RELOAD_VARIANT(`${st}_Reload`));
export const stanceAll = (st) => [STANCE_IDLE[st], ...ATTACK_STEPS.map((step) => `${st}_${step}`),
  `${st}_Reload`, `${st}_Callsign`, `Move_End_${st}`];

// 학생마다 동작 이름이 조금씩 다르다: 대소문자(Vital_Dying_ing), 차림 번호(수영복 호시노 Normal_Idle01/02, Normal_Attack01_Start,
// 다른 학생 Normal01_Attack_End, Move01_Ing, Exs01 …). 글자 바로 뒤에 붙은 01·02를 차림 번호로 보고 떼어 낸 소문자 이름으로 묶어 두고,
// 코드에서는 번호 없는 이름(Normal_Idle)으로 부르면 지금 차림의 것을 고른다 (없으면 01, 그것도 없으면 아무거나)
const FORM_NUMBER = /([a-z])0(\d)/gi;
// 글자가 틀린 이름 → 맞는 이름 (모델 295개 조사에서 맞는 이름이 없이 이것만 있는 것들. 괄호는 그 모델)
export const CLIP_TYPOS = {
  normal_ilde: 'normal_idle',            // Kirino (Swimsuit)
  normal_callsigh: 'normal_callsign',    // Momoi (Maid)
  fomation_pickup: 'formation_pickup',   // Tomoe (Qipao)
  normal_callsign1: 'normal_callsign',   // Koyuki (구호가 1·2 두 개)
  normal_callsign2: 'normal_callsign',
};
// 묶는 이름: 차림 번호를 떼고, 소문자로, 띄어쓰기는 _로 (Hanae "Formation Pickup"), 오타는 맞는 이름으로
export function clipKey(name, onForm) {
  const key = name.replace(FORM_NUMBER, (_, ch, n) => { onForm?.(Number(n)); return ch; }).toLowerCase().replace(/ /g, '_');
  return CLIP_TYPOS[key] ?? key;
}
// 동작 이름들을 묶는다 → index: 묶은 이름 → [{ name, form }], forms: 이 모델에 있는 차림 번호들
export function indexClips(names) {
  const index = new Map();
  const forms = new Set([1]);
  for (const name of names) {
    let number = 1;
    const key = clipKey(name, (n) => { number = n; });
    index.set(key, [...(index.get(key) ?? []), { name, form: number }]);
    // EX에만 붙은 번호는 차림이 아니라 EX 종류다 (아리스(배틀) Exs01 = 날아올라 장비 펼치기, Exs02_01 = 레일건 사격)
    if (!key.startsWith('exs')) forms.add(number);
  }
  return { index, forms };
}

// EX를 쓰면 차림이 바뀌는 학생이 있다(수영복 호시노: 겉옷을 벗고 고래 튜브를 듦 = 02 동작들)
// → 전투 중에 EX를 쓰면 전투가 끝날 때까지 02 차림 동작을 쓴다 (02가 없는 학생은 그대로 01)
// 차림이 바뀌지 않는데 EX가 여러 개면(아리스(배틀) Exs01 / Exs02_01) 그중 무작위로.
// Exs02_02는 Exs02_01과 같은 데이터라 이름이 _01로 끝나거나 번호가 없는 것만 고른다 (Exs_Cutin·Exs_Root 등은 제외)
const EX_VARIANT = /^exs(0\d)?(_0?1)?$/i;
export const exVariants = (names, forms) => (forms.has(2) ? [] : names.filter((n) => EX_VARIANT.test(n)));
