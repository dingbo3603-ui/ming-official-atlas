"""Bounded public-file upload console; FTP password stays in process memory."""
import ftplib,getpass,json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
password=getpass.getpass('FTP password: ')
print('{"ready":true}',flush=True)
for line in sys.stdin:
    cmd=json.loads(line)
    if cmd['action']=='quit': break
    ftp=ftplib.FTP('dmwc1566.gotoftp11.com',timeout=30,encoding='gb18030')
    ftp.login('dmwc1566',password)
    try:
        for name in cmd['files']:
            source=(root/'public'/name).resolve()
            assert source.is_relative_to((root/'public').resolve())
            target='/wwwroot/'+name
            if cmd['action']=='upload':
                with source.open('rb') as handle: ftp.storbinary('STOR '+target,handle)
            elif cmd['action']=='remove': ftp.delete(target)
            else: raise ValueError('Unsupported operation')
        print(json.dumps({'status':'ok','action':cmd['action'],'files':cmd['files']}),flush=True)
    except Exception as error:
        print(json.dumps({'status':'failed','error_type':type(error).__name__}),flush=True)
    finally:
        ftp.quit()
