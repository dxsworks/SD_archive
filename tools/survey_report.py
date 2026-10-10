"""model-survey.json(survey_models.py 결과)으로 모델별 지원 현황 표(docs/models.md)를 만든다.

사용:
    python tools/survey_report.py docs/data/model-survey.json docs/models.md
"""
import collections
import json
import re
import sys

ATTACK_STEPS = ['Attack_Start', 'Attack_Ing', 'Attack_End', 'Attack_Delay']
# 펫 코드(src/renderer/pet.js)의 STANCE_IDLE과 같게 유지
STANCE_IDLE = {'Normal': 'Normal_Idle', 'Stand': 'Stand_Attack_Delay', 'Kneel': 'Kneel_Idle'}
CAFE = ['Cafe_Idle', 'Cafe_Walk', 'Cafe_Reaction']
FORM_PREFIX = re.compile(r'^(0\d_|Normal0\d_|Kneel0\d_|Move0\d_|Tank_|Riding|SM\d+_|ST_|B_ST_)')


def stance_ready(anims, st):
    return STANCE_IDLE[st] in anims and all(f'{st}_{s}' in anims for s in ATTACK_STEPS)


def row(m):
    a = m['animations']
    stances = [st for st in ('Normal', 'Kneel', 'Stand') if stance_ready(a, st)]
    if not all(c in a for c in CAFE):
        level = '불가 (카페 동작 없음)'
    elif stances and 'Formation_Pickup' in a:
        level = '전체'
    elif stances:
        level = '대부분 (집어 들기 대체)'
    elif any('Attack' in n for n in a):
        level = '카페 + 전투 이름 대응 필요'
    else:
        level = '카페만 (전투 없음)'
    form = sorted({FORM_PREFIX.match(n).group(1) for n in a if FORM_PREFIX.match(n)})
    lower_dupes = [n for n in a if n != n.strip() or re.search(r'[a-z]ing$', n) and n.endswith('_ing')]
    notes = []
    if form:
        notes.append('폼/특수 접두사 ' + ' '.join(form))
    numbered = [n for n in a if re.search(r'\d+$', n) and not n.startswith(('Exs_Cutin', 'Public0', 'TSS_Interaction', 'Recorded'))]
    if numbered:
        notes.append('번호 붙은 변형(' + ', '.join(numbered[:3]) + (' 등' if len(numbered) > 3 else '') + ')')
    if lower_dupes:
        notes.append('소문자 변형(' + ', '.join(lower_dupes[:2]) + ')')
    sparse = [w['mesh'] for w in m['weapons'] if len(a) > 8 and len(w['animatedIn']) < len(a) * 0.5]
    if sparse:
        notes.append('일부 동작에만 움직이는 무기: ' + ', '.join(sparse))
    yes = lambda k: 'O' if k in a else '-'  # noqa: E731
    return (
        f"| {m['file'][:-4]} | {level} | {'/'.join(s[0] for s in stances) or '-'} | {yes('Formation_Pickup')} | "
        f"{yes('Public01')} | {yes('Vital_Death')} | {yes('Vital_Retreat')} | {yes('Exs')} | {yes('Move_Jump')} | "
        f"{len(a)} | {'; '.join(notes)} |"
    )


def main():
    src, out = sys.argv[1], sys.argv[2]
    data = json.load(open(src, encoding='utf8'))
    models = data['models']
    levels = collections.Counter(row(m).split(' | ')[1] for m in models)
    lines = [
        '# 모델별 지원 현황',
        '',
        f"`{data['repo']}`의 모델 {len(models)}개를 조사한 결과입니다. "
        '`python tools/survey_models.py docs/data/model-survey.json` → '
        '`python tools/survey_report.py docs/data/model-survey.json docs/models.md`로 다시 만들 수 있습니다.',
        '',
        '- **지원 수준**: 전체 = 카페 동작 + 전투 자세 + 집어 들기 / 대부분 = 집어 들기만 대체 동작 / '
        '카페 + 전투 이름 대응 필요 = 전투 동작은 있지만 이름이 달라(`Normal_Attack01_*` 등) 별칭 처리가 필요 / '
        '카페만 = 전투 모드 없음(보조 학생 등) / 불가 = 카페 동작이 없어 펫으로 쓰기 어려움',
        '- **자세**: N = 서서(Normal), K = 무릎(Kneel, 아직 펫 코드 미지원), S = 방패/엄폐(Stand)',
        '',
        '| 지원 수준 | 모델 수 |',
        '|---|---|',
        *[f'| {k} | {v} |' for k, v in levels.most_common()],
        '',
        '| 모델 | 지원 수준 | 자세 | 집어들기 | Public01 | 쓰러짐 | 후퇴 | EX | 구르기 | 동작 수 | 참고 |',
        '|---|---|---|---|---|---|---|---|---|---|---|',
        *[row(m) for m in models],
        '',
    ]
    open(out, 'w', encoding='utf8').write('\n'.join(lines))
    print('saved', out, dict(levels))


if __name__ == '__main__':
    main()
