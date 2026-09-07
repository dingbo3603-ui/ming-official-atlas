"""Interactive FTP transport. Password is read with hidden input, never logged."""
from __future__ import annotations

import ftplib
import getpass
import hashlib
import io
import json
import posixpath
import ssl
import sys
from datetime import datetime, timezone
from pathlib import Path

HOST = 'dmwc1566.gotoftp11.com'
USER = 'dmwc1566'
ROOT = Path(__file__).resolve().parents[1]


def report(value):
    print(json.dumps(value, ensure_ascii=True), flush=True)


def path(value):
    if not isinstance(value, str) or not value.startswith('/') or any(c in value for c in '\r\n'):
        raise ValueError('An absolute remote path is required')
    return posixpath.normpath(value)


def main():
    report({'status': 'awaiting_password_on_stdin', 'host': HOST})
    password = getpass.getpass('FTP password: ')
    if not password:
        raise ValueError('Password missing')
    ftp = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=30, encoding='gb18030')
    ftp.connect(HOST, 21)
    tls = True
    try:
        ftp.auth()
    except ftplib.error_perm as error:
        if not str(error).startswith(('500', '502', '504')) and str(error) != '534 Local policy on server does not allow TLS secure connections.':
            raise
        ftp.close()
        ftp = ftplib.FTP(timeout=30, encoding='gb18030')
        ftp.connect(HOST, 21)
        tls = False
    ftp.login(USER, password)
    password = None
    if tls:
        ftp.prot_p()
    ftp.set_pasv(True)
    report({'status': 'connected', 'tls': tls, 'pwd': ftp.pwd(), 'welcome': ftp.getwelcome()})
    for line in sys.stdin:
        try:
            command = json.loads(line)
            action = command['action']
            if action == 'quit':
                try:
                    ftp.quit()
                except (EOFError, OSError, ftplib.Error):
                    ftp.close()
                report({'status': 'closed'})
                return
            if action == 'list':
                target = path(command['path'])
                listing = []
                ftp.retrlines('LIST ' + target, listing.append)
                report({'path': target, 'listing': listing})
            elif action == 'read':
                target = path(command['path'])
                content = io.BytesIO()
                ftp.retrbinary('RETR ' + target, content.write)
                data = content.getvalue()
                report({'path': target, 'bytes': len(data), 'text': data[:12000].decode('utf-8', errors='replace')})
            elif action == 'deploy':
                target = path(command['path'])
                ftp.cwd(target)
                if ftp.pwd().rstrip('/') != target.rstrip('/'):
                    raise ValueError('Remote root does not match')
                build = ROOT / 'dist-nas'
                files = sorted(p for p in build.rglob('*') if p.is_file())
                assert (build / 'index.html').is_file()
                manifest = {p.relative_to(build).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
                retained = {}
                prior_release = None
                if command.get('incremental'):
                    prior = json.loads((ROOT / 'work/ftp-deployment-receipt.json').read_text(encoding='utf-8'))
                    if prior['host'] != HOST or prior['remote_root'] != target:
                        raise ValueError('Previous verified deployment target does not match')
                    retained = {name: digest for name, digest in manifest.items() if prior['files'].get(name) == digest}
                    prior_release = prior['release']
                    files = [p for p in files if p.relative_to(build).as_posix() not in retained]
                release = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
                backup = ROOT / 'work' / ('ftp-backup-' + release)
                backup.mkdir(parents=True, exist_ok=False)
                unchanged = set()
                # Back up every overwritten path locally before changing any file.
                for source in files:
                    relative = source.relative_to(build).as_posix()
                    remote = posixpath.join(target, relative)
                    saved = io.BytesIO()
                    try:
                        ftp.retrbinary('RETR ' + remote, saved.write)
                    except ftplib.error_perm as error:
                        if not str(error).startswith('550'):
                            raise
                    else:
                        if saved.getvalue() == source.read_bytes():
                            unchanged.add(relative)
                        destination = backup / relative
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        destination.write_bytes(saved.getvalue())
                    manifest[relative] = hashlib.sha256(source.read_bytes()).hexdigest()
                report({'status': 'backup_ready', 'release': release, 'files': len(files)})
                # Index is replaced last; hashed bundles are uploaded first.
                files.sort(key=lambda p: p.name == 'index.html')
                created = set()
                for source in files:
                    relative = source.relative_to(build).as_posix()
                    if relative in unchanged:
                        continue
                    remote = posixpath.join(target, relative)
                    parts = relative.split('/')[:-1]
                    for i in range(1, len(parts) + 1):
                        directory = posixpath.join(target, *parts[:i])
                        if directory not in created:
                            try:
                                ftp.mkd(directory)
                            except ftplib.error_perm:
                                ftp.cwd(directory)
                                ftp.cwd(target)
                            created.add(directory)
                    temporary = remote + '.upload-' + release
                    with source.open('rb') as handle:
                        ftp.storbinary('STOR ' + temporary, handle)
                    check = hashlib.sha256()
                    ftp.retrbinary('RETR ' + temporary, check.update)
                    if check.hexdigest() != manifest[relative]:
                        raise ValueError('Uploaded file checksum mismatch: ' + relative)
                    try:
                        ftp.rename(temporary, remote)
                    except ftplib.error_perm:
                        # IIS FTP may reject replacement of an existing filename.
                        # Only move a path that was successfully backed up above.
                        if not (backup / relative).is_file():
                            raise
                        previous = remote + '.previous-' + release
                        ftp.rename(remote, previous)
                        try:
                            ftp.rename(temporary, remote)
                        except Exception:
                            ftp.rename(previous, remote)
                            raise
                        ftp.delete(previous)
                    report({'status': 'uploaded', 'file': relative})
                verified = 0
                for relative, expected in manifest.items():
                    if relative in retained:
                        continue
                    check = hashlib.sha256()
                    ftp.retrbinary('RETR ' + posixpath.join(target, relative), check.update)
                    if check.hexdigest() != expected:
                        raise ValueError('Remote readback mismatch: ' + relative)
                    verified += 1
                receipt = {'release': release, 'host': HOST, 'remote_root': target,
                           'verified_files': verified, 'files': manifest, 'http_verified': False,
                           'retained_verified_files': len(retained), 'retained_from_release': prior_release}
                (ROOT / 'work' / 'ftp-deployment-receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
                report({'status': 'ftp_verified', 'release': release, 'verified_files': verified})
            else:
                raise ValueError('Unknown command')
        except Exception as error:
            report({'status': 'command_failed', 'error_type': type(error).__name__, 'error': str(error)})


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        report({'status': 'connection_failed', 'error_type': type(error).__name__, 'error': str(error)})
        sys.exit(1)
