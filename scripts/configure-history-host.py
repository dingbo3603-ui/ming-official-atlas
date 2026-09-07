"""Set up private host configuration without storing secrets locally."""
import ftplib, getpass, io, json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
ftp_password=getpass.getpass('FTP password: ')
db_password=getpass.getpass('Database password: ')
ftp=ftplib.FTP('dmwc1566.gotoftp11.com',timeout=30,encoding='gb18030')
ftp.login('dmwc1566',ftp_password)
ftp_password=None
for directory in ['/others/dmwc-history','/wwwroot/api']:
    try: ftp.mkd(directory)
    except ftplib.error_perm: ftp.cwd(directory)
config={'host':'localhost','database':'dmwc1566','user':'dmwc1566','password':db_password}
# JSON is encoded as a PHP string literal, kept only in memory and outside wwwroot.
encoded=json.dumps(config,ensure_ascii=True).replace('\\','\\\\').replace("'","\\'")
content=("<?php return json_decode('"+encoded+"', true);").encode()
ftp.storbinary('STOR /others/dmwc-history/config.php',io.BytesIO(content))
db_password=None; config=None; content=None; encoded=None
with (root/'public/api/index.php').open('rb') as source:
    ftp.storbinary('STOR /wwwroot/api/index.php',source)
ftp.quit()
print(json.dumps({'private_config_uploaded':True,'api_uploaded':True}))
