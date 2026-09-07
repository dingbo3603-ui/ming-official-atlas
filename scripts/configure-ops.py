"""Add the operations tables and private offline geo settings without touching history.

FTP/DB passwords are hidden TTY input and remain only in process memory. The initial
admin password is a separate random secret, saved in an ignored local handoff file.
"""
import ftplib
import getpass
import hashlib
import io
import json
from pathlib import Path
import secrets
import subprocess
import sys
import pymysql

root = Path(__file__).resolve().parents[1]
php = 'D:/phpenv/phpEnv/php/php-8.2/php.exe'
db_password = getpass.getpass('Database password: ')
ftp_password = getpass.getpass('FTP password: ')
ftp = None
try:
    checks = json.loads((root / 'work/ops-checks.json').read_text(encoding='utf-8'))
    assert checks['passed'] and checks['count'] >= 40
    manifest = json.loads((root / 'work/ops-geo/manifest.json').read_text(encoding='utf-8'))
    for name, info in manifest['files'].items():
        assert hashlib.sha256((root / 'work/ops-geo' / name).read_bytes()).hexdigest() == info['sha256']
    connection = pymysql.connect(host='sql.s1256.vhostgo.com',database='dmwc1566',user='dmwc1566',password=db_password,
                                 charset='utf8mb4',connect_timeout=15,read_timeout=20)
    db_password = None
    created_admin = False
    with connection.cursor() as cursor:
        for statement in (root / 'scripts/ops-schema.sql').read_text(encoding='utf-8').split(';'):
            if statement.strip(): cursor.execute(statement)
        cursor.execute('SELECT COUNT(*) FROM atlas_admin_users')
        if cursor.fetchone()[0] == 0:
            initial = secrets.token_urlsafe(24)
            hashed = subprocess.run([php,'-r','echo password_hash(stream_get_contents(STDIN), PASSWORD_DEFAULT);'],
                                    input=initial,text=True,capture_output=True,timeout=10)
            assert hashed.returncode == 0 and hashed.stdout.startswith('$2')
            cursor.execute('INSERT INTO atlas_admin_users (username,password_hash,created_at) VALUES (%s,%s,UTC_TIMESTAMP())', ('admin',hashed.stdout))
            handoff = root / 'work/后台登录信息.txt'
            handoff.write_text('大明职官图后台\n地址：https://dmwc.cc/admin/\n账号：admin\n初始密码：'+initial+'\n\n首次登录必须修改密码。请先确保域名已启用有效 HTTPS 证书；不要忽略浏览器证书警告。\n',encoding='utf-8')
            initial = None
            created_admin = True
    connection.commit()
    connection.close()
    print(json.dumps({'schema_ready':True,'admin_created':created_admin,'history_tables_modified':False}),flush=True)
    ftp = ftplib.FTP('dmwc1566.gotoftp11.com',timeout=60,encoding='gb18030')
    ftp.login('dmwc1566',ftp_password)
    ftp_password = None
    for directory in ['/others/dmwc-admin','/others/dmwc-admin/geo','/others/dmwc-admin/sessions']:
        try: ftp.mkd(directory)
        except ftplib.error_perm: ftp.cwd(directory)
    # Session files stay outside the public root; relax only this private directory if supported.
    try: ftp.sendcmd('SITE CHMOD 700 /others/dmwc-admin/sessions')
    except ftplib.error_perm: pass
    verified=[]
    for name, info in manifest['files'].items():
        remote='/others/dmwc-admin/geo/'+name
        digest=hashlib.sha256()
        exists=False
        try:
            ftp.retrbinary('RETR '+remote,digest.update)
            exists=digest.hexdigest()==info['sha256']
        except ftplib.error_perm as error:
            if not str(error).startswith('550'): raise
        if not exists:
            temporary=remote+'.upload-'+secrets.token_hex(6)
            with (root / 'work/ops-geo' / name).open('rb') as source: ftp.storbinary('STOR '+temporary,source,blocksize=262144)
            digest=hashlib.sha256()
            ftp.retrbinary('RETR '+temporary,digest.update,blocksize=262144)
            assert digest.hexdigest()==info['sha256']
            try: ftp.rename(temporary,remote)
            except ftplib.error_perm:
                # Retain a private rollback point for a pre-existing database version.
                ftp.rename(remote,remote+'.previous-'+secrets.token_hex(6))
                ftp.rename(temporary,remote)
        verified.append(name)
        print(json.dumps({'private_geo_verified':name,'bytes':info['bytes']}),flush=True)
    remote_config='/others/dmwc-admin/config.php'
    try:
        ftp.size(remote_config)
        created_config=False
    except ftplib.error_perm as error:
        if not str(error).startswith('550'): raise
        secret=secrets.token_hex(32)
        config=("<?php return ['secret'=>'"+secret+"','geo_path'=>__DIR__.'/geo','session_path'=>__DIR__.'/sessions'];").encode()
        temp=remote_config+'.upload-'+secrets.token_hex(6)
        ftp.storbinary('STOR '+temp,io.BytesIO(config))
        digest=hashlib.sha256()
        ftp.retrbinary('RETR '+temp,digest.update)
        assert digest.digest()==hashlib.sha256(config).digest()
        ftp.rename(temp,remote_config)
        secret=config=None
        created_config=True
    ftp.quit();ftp=None
    receipt={'schema_ready':True,'admin_created':created_admin,'private_config_created':created_config,
             'geo_version':manifest['version'],'private_geo_verified':verified,'public_history_modified':False}
    (root / 'work/ops-deployment-setup.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
    print(json.dumps(receipt),flush=True)
except Exception as error:
    print(json.dumps({'failed':True,'error_type':type(error).__name__}),flush=True)
    sys.exit(1)
finally:
    if ftp: ftp.close()
