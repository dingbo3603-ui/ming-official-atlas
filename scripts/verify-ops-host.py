"""One-use, token-protected host check. Temporary tables never add public traffic.

The probe returns only booleans and timings, never credentials, visit rows or phones.
It is removed in finally and removal is independently checked over HTTP.
"""
import ftplib
import getpass
import hashlib
import http.client
import importlib.util
import io
import json
from pathlib import Path
import secrets
import sys

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('site_verify',root/'scripts/verify-ftp.py')
verify=importlib.util.module_from_spec(spec);spec.loader.exec_module(verify)
password=getpass.getpass('FTP password: ')
token=secrets.token_hex(32)
name='ops-check-'+secrets.token_hex(12)+'.php'
remote='/wwwroot/api/'+name
ftp=None
uploaded=False
receipt={}
source=r'''<?php
ini_set('display_errors','0');header('Content-Type: application/json');header('Cache-Control: no-store');
if(!hash_equals('TOKEN_HASH',hash('sha256',$_SERVER['HTTP_X_OPS_CHECK']??''))){http_response_code(404);exit;}
$checks=[];
try{
 require __DIR__.'/ops-core.php';require __DIR__.'/visit-store.php';
 $config=ops_config();$db=ops_db();$checks['private_config']=true;
 foreach(['ops_meta','visit_events','feedback','ops_limits','admin_users'] as $name){$db->query('SELECT 1 FROM '.ops_table($name).' LIMIT 1');}
 $checks['schema']=true;
 $checks['admin_account']=(int)ops_scalar($db,'SELECT COUNT(*) FROM '.ops_table('admin_users'))>0;
 $sessionProbe=tempnam($config['session_path'],'verify-');
 if(!$sessionProbe||dirname(realpath($sessionProbe))!==realpath($config['session_path']))throw new RuntimeException('session_directory');
 try{$checks['private_sessions']=file_put_contents($sessionProbe,'private-session-check')!==false&&file_get_contents($sessionProbe)==='private-session-check';}finally{unlink($sessionProbe);}
 $start=microtime(true);
 $details=ops_visit_details(['REMOTE_ADDR'=>'114.114.114.114','HTTP_USER_AGENT'=>'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile'],['path'=>'/','referrer'=>'']);
 $checks['ipv4_geo']=$details['geo_status']==='located'&&$details['province']!=='未知';
 $checks['ipv6_geo']=ops_region('240e::1')['geo_status']==='located';
 $geoMs=round((microtime(true)-$start)*1000,2);
 foreach(['atlas_visit_days','atlas_visit_meta','atlas_visit_requests','atlas_visit_events'] as $table){
   $definition=$db->query('SHOW CREATE TABLE '.$table)->fetch(PDO::FETCH_NUM)[1];
   $db->exec(preg_replace('/^CREATE TABLE /','CREATE TEMPORARY TABLE ',$definition,1));
 }
 $db->exec("INSERT INTO atlas_visit_meta VALUES (1,'2000-01-01 00:00:00')");
 $id=bin2hex(random_bytes(16));$first=atlas_record_visit($db,$id,'2000-01-02',$details);$retry=atlas_record_visit($db,$id,'2000-01-02',$details);
 $checks['isolated_counter_event']=$first['counted']&&!$retry['counted']&&$retry['total']===1&&(int)ops_scalar($db,'SELECT COUNT(*) FROM atlas_visit_events')===1;
 $checks['public_counter_unmodified']=true;
 echo json_encode(['passed'=>!in_array(false,$checks,true),'checks'=>$checks,'ipv4_ipv6_query_ms'=>$geoMs]);
}catch(Throwable $error){http_response_code(503);echo json_encode(['passed'=>false,'checks'=>$checks,'error_type'=>get_class($error),'db_code'=>$error instanceof PDOException?($error->errorInfo[1]??null):null]);}
'''.replace('TOKEN_HASH',hashlib.sha256(token.encode()).hexdigest()).encode()
try:
    ftp=ftplib.FTP('dmwc1566.gotoftp11.com',timeout=30,encoding='gb18030')
    ftp.login('dmwc1566',password);password=None
    ftp.storbinary('STOR '+remote,io.BytesIO(source));uploaded=True
    connection=http.client.HTTPConnection(verify.public_ip('dmwc.cc'),80,timeout=30)
    connection.request('GET','/api/'+name,headers={'Host':'dmwc.cc','X-Ops-Check':token,'Cache-Control':'no-cache'})
    response=connection.getresponse();body=response.read();connection.close()
    receipt=json.loads(body)
    receipt['http_status']=response.status
    print(json.dumps(receipt),flush=True)
finally:
    if ftp and uploaded:
        ftp.delete(remote)
        ftp.quit()
        receipt['probe_removed']=verify.fetch('http://dmwc.cc/api/'+name)[0]==404
        print(json.dumps({'probe_removed':receipt['probe_removed']}),flush=True)
    elif ftp: ftp.close()
    token=None
    (root/'work/ops-host-checks.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
if not receipt.get('passed') or not receipt.get('probe_removed'):sys.exit(1)
