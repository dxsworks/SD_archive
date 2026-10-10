"""BlueArchiveModels 저장소의 모든 .glb에서 애니메이션·무기 정보를 모아 JSON으로 저장한다.

GLB 앞부분의 JSON 청크만 HTTP Range로 받기 때문에 전체(1GB 이상)를 내려받지 않는다.
표준 라이브러리만 사용.

사용:
    python tools/survey_models.py docs/data/model-survey.json
"""
import json
import struct
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

REPO = 'lihaohong6/BlueArchiveModels'
BRANCH = 'main'
RAW = f'https://raw.githubusercontent.com/{REPO}/{BRANCH}/'
API = f'https://api.github.com/repos/{REPO}/contents/?ref={BRANCH}'
WEAPON_WORDS = ('weapon', 'shield', 'gun', 'rifle', 'bag', 'drone')


def get(url, rng=None):
    req = urllib.request.Request(url, headers={'User-Agent': 'ba-desktop-pet-survey'})
    if rng:
        req.add_header('Range', f'bytes={rng[0]}-{rng[1]}')
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def gltf_json(name):
    url = RAW + urllib.parse.quote(name)
    head = get(url, (0, 19))
    magic, _ver, _total, json_len, chunk_type = struct.unpack('<4sIIII', head[:20])
    assert magic == b'glTF' and chunk_type == 0x4E4F534A, name
    return json.loads(get(url, (20, 20 + json_len - 1)))


def survey(name):
    try:
        j = gltf_json(name)
    except Exception as e:  # noqa: BLE001 - 조사용 스크립트라 실패한 파일은 기록만
        return {'file': name, 'error': str(e)}
    nodes = j.get('nodes', [])
    accessors = j.get('accessors', [])

    anims = {}
    targets = {}
    for a in j.get('animations', []):
        dur = 0.0
        for s in a['samplers']:
            mx = accessors[s['input']].get('max')
            if mx:
                dur = max(dur, mx[0])
        anims[a['name']] = round(dur, 2)
        targets[a['name']] = {c['target'].get('node') for c in a['channels']}

    # 메시 노드 → 스킨 → 뼈대. 이름에 무기 관련 단어가 있으면 무기로 본다.
    weapons = []
    for n in nodes:
        if 'mesh' not in n or 'skin' not in n:
            continue
        mesh_name = j['meshes'][n['mesh']].get('name') or n.get('name', '')
        if not any(w in mesh_name.lower() for w in WEAPON_WORDS):
            continue
        joints = set(j['skins'][n['skin']]['joints'])
        animated = sorted(clip for clip, t in targets.items() if t & joints)
        weapons.append({
            'mesh': mesh_name,
            'joints': len(joints),
            'rootJoint': nodes[j['skins'][n['skin']]['joints'][0]].get('name'),
            'animatedIn': animated,
        })

    return {
        'file': name,
        'animations': anims,
        'weapons': weapons,
        'meshes': [m.get('name') for m in j.get('meshes', [])],
    }


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'model-survey.json'
    listing = json.loads(get(API))
    names = sorted(f['name'] for f in listing if f['name'].lower().endswith('.glb'))
    print(f'{len(names)} models', file=sys.stderr)
    with ThreadPoolExecutor(12) as ex:
        results = list(ex.map(survey, names))
    errors = [r for r in results if 'error' in r]
    print(f'errors: {len(errors)}', file=sys.stderr)
    for r in errors:
        print('  ', r['file'], r['error'], file=sys.stderr)
    with open(out, 'w', encoding='utf8') as f:
        json.dump({'repo': REPO, 'branch': BRANCH, 'models': results}, f, ensure_ascii=False, indent=1)
    print(f'saved {out}', file=sys.stderr)


if __name__ == '__main__':
    main()
