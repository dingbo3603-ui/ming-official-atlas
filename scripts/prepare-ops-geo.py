"""Pin the official offline IP database; no visitor IP is sent to a geolocation API."""
import hashlib
import json
from pathlib import Path
import urllib.request

root = Path(__file__).resolve().parents[1]
out = root / 'work/ops-geo'
out.mkdir(parents=True, exist_ok=True)
base = 'https://raw.githubusercontent.com/lionsoul2014/ip2region/v3.17.0/'
paths = {'Searcher.class.php': 'binding/php/xdb/Searcher.class.php',
         'ip2region_v4.xdb': 'data/ip2region_v4.xdb',
         'ip2region_v6.xdb': 'data/ip2region_v6.xdb', 'LICENSE.md': 'LICENSE.md'}
manifest = {'version': 'v3.17.0', 'files': {}}
for name, path in paths.items():
    target = out / name
    if not target.exists():
        with urllib.request.urlopen(base + path, timeout=60) as response:
            content = response.read()
        target.write_bytes(content)
    content = target.read_bytes()
    manifest['files'][name] = {'url': base + path, 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}
    print(json.dumps({'downloaded': name, 'bytes': len(content)}), flush=True)
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
