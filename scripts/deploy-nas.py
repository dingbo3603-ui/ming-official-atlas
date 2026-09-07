"""Deploy only this static atlas with the user's existing key-auth NAS transport."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REMOTE_ROOT = '/volume1/docker/ming-official-atlas'
NAME = 'ming-official-atlas'
PORT = 8092
URL = f'http://192.168.31.35:{PORT}'


def transport():
    helper = ROOT.parent.parent / 'qoder/amazon-tools/_deploy_legacy_order_resources.py'
    spec = importlib.util.spec_from_file_location('atlas_nas_transport', helper)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def remote(module, script):
    return module.run(['ssh', *module.SSH_OPTIONS, module.NAS_TARGET, 'python3 -'],
                      label='Atlas NAS operation', input_bytes=script.encode('utf-8'), timeout=180)


PREFLIGHT = r'''
import json, subprocess, socket
from pathlib import Path
root = Path('/volume1/docker/ming-official-atlas')
assert root.parent.resolve() == Path('/volume1/docker')
def run(args):
    return subprocess.run(args, capture_output=True, text=True)
item = run(['docker','inspect','--format','{{index .Config.Labels "com.dblxyan.app"}}','ming-official-atlas'])
if item.returncode == 0 and item.stdout.strip() != 'ming-official-atlas':
    raise RuntimeError('Existing container is not managed by this deployment')
s = socket.socket(); listening = s.connect_ex(('127.0.0.1',8092)) == 0; s.close()
if listening and item.returncode != 0:
    raise RuntimeError('Port 8092 is already in use')
image = run(['docker','image','inspect','--format','{{.Id}}','nginx:alpine'])
if image.returncode != 0:
    raise RuntimeError('Expected nginx:alpine image is unavailable')
print(json.dumps({'project_exists':root.exists(),'managed_container':item.returncode==0,'port':8092,'nginx_image':image.stdout.strip()}))
'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    module = transport()
    remote(module, PREFLIGHT)
    if not args.apply:
        return
    build = ROOT / 'dist-nas'
    if not (build / 'index.html').is_file():
        raise RuntimeError('Run npm run build:nas first')
    release = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    output = ROOT / 'work'
    output.mkdir(exist_ok=True)
    archive = output / f'atlas-nas-{release}.tar.gz'
    files = sorted(p for p in build.rglob('*') if p.is_file())
    files += [ROOT / 'nas/nginx.conf', ROOT / 'nas/compose.yaml', ROOT / 'nas/README.md']
    hashes = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    manifest = output / 'atlas-release-manifest.json'
    manifest.write_text(json.dumps({'release':release,'files':hashes}, ensure_ascii=False, indent=2),encoding='utf-8')
    with tarfile.open(archive,'w:gz') as tar:
        for path in files:
            tar.add(path, arcname=path.relative_to(ROOT).as_posix(), recursive=False)
        tar.add(manifest, arcname='release-manifest.json', recursive=False)
    remote(module, "from pathlib import Path\np=Path('/volume1/docker/ming-official-atlas'); assert p.parent.resolve()==Path('/volume1/docker'); p.mkdir(exist_ok=True); (p/'releases').mkdir(exist_ok=True)\n")
    remote_archive = f'{REMOTE_ROOT}/atlas-{release}.tar.gz'
    module.run(['scp',*module.SCP_OPTIONS,str(archive),f'{module.NAS_TARGET}:{remote_archive}'],label='Upload atlas release',timeout=180)
    script = r'''
from pathlib import Path
import hashlib, json, subprocess, tarfile, time, urllib.request
ROOT=Path('/volume1/docker/ming-official-atlas')
RELEASE=__RELEASE__
archive=ROOT/('atlas-'+RELEASE+'.tar.gz')
target=ROOT/'releases'/RELEASE
assert target.parent.resolve() == (ROOT/'releases').resolve()
target.mkdir(exist_ok=False)
with tarfile.open(archive,'r:gz') as tar:
    for member in tar.getmembers():
        dest=(target/member.name).resolve()
        if not member.isfile() or target.resolve() not in dest.parents:
            raise RuntimeError('Invalid archive member')
    tar.extractall(target)
# NAS SSH umask can create 0700 directories; only this public release needs nginx read access.
target.chmod(0o755)
for public_path in target.rglob('*'):
    assert target.resolve() in public_path.resolve().parents
    public_path.chmod(0o755 if public_path.is_dir() else 0o644)
manifest=json.loads((target/'release-manifest.json').read_text())
for name,digest in manifest['files'].items():
    if hashlib.sha256((target/name).read_bytes()).hexdigest()!=digest:
        raise RuntimeError('Release hash mismatch: '+name)
def run(args,check=True):
    result=subprocess.run(args,capture_output=True,text=True)
    if check and result.returncode: raise RuntimeError(result.stderr[-2000:])
    return result
name='ming-official-atlas'
backup=name+'-backup-'+RELEASE
existing=run(['docker','inspect','--format','{{index .Config.Labels "com.dblxyan.app"}}',name],False)
had_old=existing.returncode==0
if had_old:
    if existing.stdout.strip()!=name: raise RuntimeError('Unmanaged container collision')
    run(['docker','stop',name]);run(['docker','rename',name,backup])
started=False
try:
    run(['docker','run','-d','--name',name,'--label','com.dblxyan.app='+name,'--label','com.dblxyan.release='+RELEASE,
      '--restart','unless-stopped','-p','8092:80','-v',str(target/'dist-nas')+':/usr/share/nginx/html:ro',
      '-v',str(target/'nas/nginx.conf')+':/etc/nginx/conf.d/default.conf:ro',
      '--health-cmd','wget -q -O - http://127.0.0.1/health || exit 1','--health-interval','15s','--health-timeout','3s','--health-retries','3','nginx:alpine'])
    started=True
    for attempt in range(20):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8092/health',timeout=3) as response:
                assert response.read().strip()==b'ok'
            break
        except Exception:
            if attempt==19: raise
            time.sleep(1)
    for rel,digest in manifest['files'].items():
        if not rel.startswith('dist-nas/'):continue
        namepart=rel[len('dist-nas/'):]
        try:
            with urllib.request.urlopen('http://127.0.0.1:8092/'+namepart,timeout=15) as response:
                if hashlib.sha256(response.read()).hexdigest()!=digest:raise RuntimeError('HTTP hash mismatch: '+namepart)
        except Exception as error:
            print('FAILED_RESOURCE',namepart,flush=True)
            print(run(['docker','logs','--tail','8',name],False).stderr,flush=True)
            raise RuntimeError('HTTP readback failed for '+namepart+': '+str(error)) from error
    (ROOT/'current-release.txt').write_text(str(target)+'\n')
    print(json.dumps({'release':RELEASE,'status':'verified','files':len(manifest['files']),'backup_container':backup if had_old else None}))
except Exception:
    if started:run(['docker','rm','-f',name],False)
    else:
        # A failed docker start may still leave our newly created container.
        label=run(['docker','inspect','--format','{{index .Config.Labels "com.dblxyan.release"}}',name],False)
        if label.returncode==0 and label.stdout.strip()==RELEASE:run(['docker','rm','-f',name],False)
    if had_old:run(['docker','rename',backup,name]);run(['docker','start',name])
    raise
'''.replace('__RELEASE__',repr(release))
    remote(module,script)
    # Independent readback from the user's Windows host, not just from the NAS.
    for relative,digest in hashes.items():
        if not relative.startswith('dist-nas/'):
            continue
        path=relative[len('dist-nas/'):]
        with urllib.request.urlopen(URL+'/'+path,timeout=30) as response:
            assert hashlib.sha256(response.read()).hexdigest()==digest, path
    receipt={'release':release,'url':URL,'verified_files':len(hashes),'independent_http_readback':True}
    (output/'nas-deployment-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
    print(json.dumps(receipt))


if __name__=='__main__':
    main()
