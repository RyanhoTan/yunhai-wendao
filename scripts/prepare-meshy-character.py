"""Pack the user-supplied Meshy GLB for the browser, preserving mesh/rig/clips.

Usage: python3 scripts/prepare-meshy-character.py /path/to/source.glb [--name jade-blossom]
Requires Pillow. Only the embedded texture encoding changes (PNG -> WebP).
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import struct
import re

from PIL import Image

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('--name', default='jade-blossom', help='Output asset stem (lowercase letters, digits, hyphens).')
args = parser.parse_args()
if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', args.name):
    parser.error('--name must contain only lowercase letters, digits, and separating hyphens')
source = args.source
raw = source.read_bytes()
magic, version, length = struct.unpack_from('<4sII', raw)
assert magic == b'glTF' and version == 2 and length == len(raw)
json_length, json_type = struct.unpack_from('<II', raw, 12)
assert json_type == 0x4E4F534A
document = json.loads(raw[20:20 + json_length])
binary_start = 20 + json_length
binary_length, binary_type = struct.unpack_from('<II', raw, binary_start)
assert binary_type == 0x004E4942
binary = raw[binary_start + 8:binary_start + 8 + binary_length]
image_views = {image['bufferView']: image for image in document['images']}
packed = bytearray()
textures = []
for index, view in enumerate(document['bufferViews']):
    offset = view.get('byteOffset', 0)
    data = binary[offset:offset + view['byteLength']]
    if index in image_views:
        image = Image.open(io.BytesIO(data))
        output = io.BytesIO()
        image.save(output, 'WEBP', quality=95, method=6)
        data = output.getvalue()
        image_views[index]['mimeType'] = 'image/webp'
        textures.append({'size': image.size, 'bytes': len(data)})
    packed.extend(b'\0' * (-len(packed) % 4))
    view['byteOffset'], view['byteLength'] = len(packed), len(data)
    packed.extend(data)
for texture in document['textures']:
    texture.setdefault('extensions', {})['EXT_texture_webp'] = {'source': texture.pop('source')}
for key in ['extensionsUsed', 'extensionsRequired']:
    document[key] = list(dict.fromkeys(document.get(key, []) + ['EXT_texture_webp']))
document['buffers'][0]['byteLength'] = len(packed)
encoded = json.dumps(document, separators=(',', ':'), ensure_ascii=False).encode()
encoded += b' ' * (-len(encoded) % 4)
packed.extend(b'\0' * (-len(packed) % 4))
result = (struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(packed))
          + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
          + struct.pack('<II', len(packed), 0x004E4942) + packed)
destination = root / f'public/assets/character/{args.name}.glb'
destination.write_bytes(result)
report = {
    'sourceFile': source.name, 'sourceSha256': hashlib.sha256(raw).hexdigest(),
    'sourceBytes': len(raw), 'runtimeBytes': len(result), 'textures': textures,
    'meshes': len(document['meshes']), 'skins': len(document['skins']),
    'joints': len(document['skins'][0]['joints']),
    'animations': [{'name': clip['name'], 'duration': max(document['accessors'][s['input']]['max'][0] for s in clip['samplers'])} for clip in document['animations']],
}
report_path = root / f'public/assets/character/{args.name}-source.json'
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
