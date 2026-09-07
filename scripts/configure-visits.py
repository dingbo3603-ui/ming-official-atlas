"""Create the counter without seeds; validate using connection-local test tables."""
import getpass
import json
from pathlib import Path
import subprocess
import sys
import pymysql

root = Path(__file__).resolve().parents[1]
password = getpass.getpass('Database password: ')
config = dict(host='sql.s1256.vhostgo.com', database='dmwc1566', user='dmwc1566', password=password)
try:
    connection = pymysql.connect(**config, charset='utf8mb4', connect_timeout=15, read_timeout=20)
    with connection.cursor() as cursor:
        for statement in (root/'scripts/visits-schema.sql').read_text(encoding='utf-8').split(';'):
            if statement.strip(): cursor.execute(statement)
    connection.commit()
    connection.close()
    result = subprocess.run(['D:/phpenv/phpEnv/php/php-8.2/php.exe', str(root/'scripts/test-visits.php')],
        input=json.dumps(config), text=True, capture_output=True, timeout=60)
    config['password'] = password = None
    receipt = json.loads(result.stdout)
    if result.returncode or not receipt.get('passed'):
        print(json.dumps(receipt), flush=True)
        raise RuntimeError('Counter checks failed')
    (root/'work/visit-counter-checks.json').write_text(json.dumps(receipt), encoding='utf-8')
    print(json.dumps({'schema_ready':True, **receipt}), flush=True)
except Exception as error:
    print(json.dumps({'error_type':type(error).__name__}), flush=True)
    sys.exit(1)
