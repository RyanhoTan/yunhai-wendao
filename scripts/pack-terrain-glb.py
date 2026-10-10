"""Compress embedded terrain textures without altering geometry or transforms.

Usage: python3 scripts/pack-terrain-glb.py source.glb candidate.glb
Requires Pillow. Non-color maps use lossless WebP; color uses quality 98.
"""
import argparse
import copy
import hashlib
import io
import json
from pathlib import Path
import struct
from PIL import Image, ImageChops, ImageStat


def unpack(raw):
    if struct.unpack_from('<4sII', raw) != (b'glTF', 2, len(raw)):
        raise ValueError('Invalid GLB container')
    length, kind = struct.unpack_from('<II', raw, 12)
    if kind != 0x4E4F534A:
        raise ValueError('Missing GLB JSON chunk')
    doc = json.loads(raw[20:20+length])
    binary_length, binary_kind = struct.unpack_from('<II', raw, 20+length)
    if binary_kind != 0x004E4942:
        raise ValueError('Missing GLB binary chunk')
    binary = raw[28+length:28+length+binary_length]
    if len(doc['buffers']) != 1 or 'uri' in doc['buffers'][0]:
        raise ValueError('Expected one embedded buffer')
    return doc, binary


def view_data(doc, binary, index):
    view = doc['bufferViews'][index]
    offset = view.get('byteOffset', 0)
    result = binary[offset:offset+view['byteLength']]
    if len(result) != view['byteLength']:
        raise ValueError('Truncated buffer view')
    return result


def pack(source, destination):
    raw = source.read_bytes()
    original, binary = unpack(raw)
    doc = copy.deepcopy(original)
    image_views = {}
    for i, image in enumerate(doc.get('images', [])):
        if 'uri' in image or image['bufferView'] in image_views:
            raise ValueError('Expected unique embedded image buffer views')
        image_views[image['bufferView']] = (i, image)
    noncolor = set()
    for material in doc.get('materials', []):
        for texture in (material.get('normalTexture'), material.get('occlusionTexture'),
                        material.get('pbrMetallicRoughness', {}).get('metallicRoughnessTexture')):
            if texture:
                noncolor.add(doc['textures'][texture['index']]['source'])
    packed = bytearray()
    textures = []
    for index, view in enumerate(doc['bufferViews']):
        data = view_data(original, binary, index)
        if index in image_views:
            image_index, image_record = image_views[index]
            decoded = Image.open(io.BytesIO(data)); decoded.load()
            output = io.BytesIO()
            lossless = image_index in noncolor
            decoded.save(output, 'WEBP', lossless=lossless, quality=98, method=6, exact=True)
            compressed = output.getvalue()
            check = Image.open(io.BytesIO(compressed)); check.load()
            if check.size != decoded.size:
                raise ValueError('Texture dimensions changed')
            diff = ImageChops.difference(decoded.convert('RGBA'), check.convert('RGBA'))
            if lossless and any(extrema != (0, 0) for extrema in diff.getextrema()):
                raise ValueError('Non-color map pixels changed')
            if diff.getextrema()[3] != (0, 0):
                raise ValueError('Texture alpha changed')
            use_webp = len(compressed) < len(data)
            textures.append({'image_index': image_index, 'dimensions': decoded.size,
                'original_bytes': len(data), 'packed_bytes': len(compressed) if use_webp else len(data),
                'encoding': ('lossless WebP' if lossless else 'WebP quality 98') if use_webp else 'original encoding preserved',
                'rmse_rgba': ImageStat.Stat(diff).rms if use_webp else [0, 0, 0, 0]})
            if use_webp:
                data = compressed
                image_record['mimeType'] = 'image/webp'
        packed.extend(b'\0' * (-len(packed) % 4))
        view['byteOffset'], view['byteLength'] = len(packed), len(data)
        packed.extend(data)
    for texture in doc.get('textures', []):
        if doc['images'][texture['source']]['mimeType'] == 'image/webp':
            texture.setdefault('extensions', {})['EXT_texture_webp'] = {'source': texture.pop('source')}
    for key in ('extensionsUsed', 'extensionsRequired'):
        doc[key] = list(dict.fromkeys(doc.get(key, []) + ['EXT_texture_webp']))
    doc['buffers'][0]['byteLength'] = len(packed)
    encoded = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode()
    encoded += b' ' * (-len(encoded) % 4)
    packed.extend(b'\0' * (-len(packed) % 4))
    result = (struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(packed))
        + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
        + struct.pack('<II', len(packed), 0x004E4942) + packed)
    check_doc, check_binary = unpack(result)
    preserved = 0
    for index in range(len(original['bufferViews'])):
        if index not in image_views:
            if view_data(original, binary, index) != view_data(check_doc, check_binary, index):
                raise ValueError('Geometry/accessor buffer bytes changed')
            preserved += 1
    for key in ('meshes', 'accessors', 'nodes', 'scenes', 'scene', 'materials', 'animations', 'skins'):
        if original.get(key) != check_doc.get(key):
            raise ValueError('Scene/geometry/material metadata changed: ' + key)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(result)
    report = {'source': source.name, 'source_sha256': hashlib.sha256(raw).hexdigest(),
        'source_bytes': len(raw), 'candidate': destination.name,
        'candidate_sha256': hashlib.sha256(result).hexdigest(), 'candidate_bytes': len(result),
        'preserved_nonimage_buffer_views': preserved, 'geometry_and_scene_metadata_identical': True,
        'textures': textures, 'runtime_activation': False,
        'limitations': ['Texture packaging only; original mesh topology and road/grade defects are not repaired.']}
    destination.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(report))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    pack(args.source, args.destination)
