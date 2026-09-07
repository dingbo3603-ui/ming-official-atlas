"""Database maintenance; secrets are accepted only through hidden input."""
import getpass
import json
import sys
import traceback
from pathlib import Path
import pymysql

ROOT = Path(__file__).resolve().parents[1]
password = getpass.getpass('Database password: ')
try:
    connection = pymysql.connect(host='sql.s1256.vhostgo.com', port=3306,
        user='dmwc1566', password=password, database='dmwc1566', charset='utf8mb4',
        connect_timeout=20, read_timeout=40, write_timeout=40)
    password = None
    with connection.cursor() as cursor:
        cursor.execute('SELECT VERSION()')
        version = cursor.fetchone()[0]
        cursor.execute('SHOW TABLES')
        tables = [row[0] for row in cursor.fetchall()]
    print(json.dumps({'connected':True,'version':version,'tables':tables}),flush=True)
    if '--import' in sys.argv:
        from history_import import import_history
        import_history(connection, ROOT)
    connection.close()
except Exception as error:
    # Stack locations only: never write connection arguments or local variable values.
    print(json.dumps({'frames': [{'file': Path(frame.filename).name, 'line': frame.lineno, 'function': frame.name} for frame in traceback.extract_tb(error.__traceback__)]}),flush=True)
    print(json.dumps({'error_type':type(error).__name__,'code':error.args[0] if error.args and isinstance(error.args[0],int) else None}),flush=True)
    sys.exit(1)
