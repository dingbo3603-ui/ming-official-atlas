"""Local PHP API with a memory-only database secret, bound to loopback."""
import getpass
import json
import os
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
password = getpass.getpass('Database password: ')
environment = os.environ.copy()
environment['DMWC_HISTORY_CONFIG_JSON'] = json.dumps({'host': 'sql.s1256.vhostgo.com',
    'database': 'dmwc1566', 'user': 'dmwc1566', 'password': password})
password = None
subprocess.run([r'D:\phpenv\phpEnv\php\php-8.2\php.exe', '-S', '127.0.0.1:8088', '-t', str(root / 'public')],
    cwd=root, env=environment, check=True)
