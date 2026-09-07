<?php
// Every mutable table is a connection-local TEMPORARY table. Public visits are never seeded.
require dirname(__DIR__).'/public/api/ops-core.php';
require dirname(__DIR__).'/public/api/visit-store.php';
$checks=[];
function verify_ops(bool $condition,string $name):void {if(!$condition)throw new RuntimeException($name);$GLOBALS['checks'][]=$name;}
try {
    $GLOBALS['ops_config']=json_decode(stream_get_contents(STDIN),true,32,JSON_THROW_ON_ERROR);
    $db=ops_db();
    foreach(['atlas_visit_days','atlas_visit_meta','atlas_visit_requests'] as $table){
        $definition=$db->query('SHOW CREATE TABLE '.$table)->fetch(PDO::FETCH_NUM)[1];
        $db->exec(preg_replace('/^CREATE TABLE /','CREATE TEMPORARY TABLE ',$definition,1));
    }
    foreach(explode(';',file_get_contents(__DIR__.'/ops-schema.sql')) as $statement){
        if(trim($statement))$db->exec(str_replace('CREATE TABLE IF NOT EXISTS','CREATE TEMPORARY TABLE',$statement));
    }
    $db->exec("INSERT INTO atlas_visit_meta VALUES (1,'2000-01-01 00:00:00')");
    verify_ops(ops_ip(['REMOTE_ADDR'=>'::ffff:8.8.8.8','HTTP_X_FORWARDED_FOR'=>'1.1.1.1'])==='8.8.8.8','server_ip_ignores_forwarded_headers');
    verify_ops(ops_ip(['REMOTE_ADDR'=>'not an ip'])==='','invalid_ip_not_guessed');
    foreach([
        ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36','desktop','Chrome'],
        ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1','mobile','Safari'],
        ['Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile Safari/537.36 MicroMessenger/8.0','mobile','微信'],
        ['Mozilla/5.0 (Linux; Android 13; Tablet) Chrome/130.0 Safari/537.36','tablet','Chrome']
    ] as [$ua,$device,$browser]){ $agent=ops_agent($ua);verify_ops($agent['device']===$device&&$agent['browser']===$browser,'agent_'.$device.'_'.$browser); }
    $details=ops_visit_details(['REMOTE_ADDR'=>'114.114.114.114','HTTP_USER_AGENT'=>'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0'],['path'=>'/?private=discard','referrer'=>'https://example.com/path?discard=1']);
    verify_ops($details['entry_path']==='/'&&$details['referrer_host']==='example.com','metadata_drops_queries_and_referrer_path');
    verify_ops($details['geo_status']==='located'&&$details['province']!=='未知','offline_ipv4_region_resolves');
    verify_ops(ops_region('240e::1')['geo_status']==='located','offline_ipv6_region_resolves');
    verify_ops(ops_region('127.0.0.1')['geo_status']==='unknown','private_ip_not_guessed');
    $first=atlas_record_visit($db,str_repeat('a',32),'2000-01-02',$details);
    $retry=atlas_record_visit($db,str_repeat('a',32),'2000-01-02',$details);
    verify_ops($first['counted']&&!$retry['counted']&&$retry['total']===1&&(int)ops_scalar($db,'SELECT COUNT(*) FROM atlas_visit_events')===1,'visit_retry_counts_once_in_both_tables');
    ops_insert_visit($db,str_repeat('b',32),'2000-01-02',$details);
    $failed=false;try{atlas_record_visit($db,str_repeat('b',32),'2000-01-02',$details);}catch(PDOException $error){$failed=true;}
    verify_ops($failed&&!$db->inTransaction()&&atlas_visit_totals($db,'2000-01-02')['total']===1&&(int)ops_scalar($db,'SELECT COUNT(*) FROM atlas_visit_requests WHERE request_id=?',[str_repeat('b',32)])===0,'failed_event_rolls_back_count_and_token');
    $_SERVER['REMOTE_ADDR']='127.0.0.1';
    $data=['request_id'=>str_repeat('c',32),'phone'=>'13800000000','content'=>'测试反馈 <script>alert(1)</script>','category'=>'纠正错误','context'=>'兵部 <测试>','year'=>1566,'consent'=>true];
    $value=ops_feedback_input($data);$saved=ops_save_feedback($db,$value);$again=ops_save_feedback($db,$value);
    $row=ops_rows($db,'SELECT * FROM atlas_feedback WHERE id=?',[$saved['id']])[0];
    verify_ops(!$saved['duplicate']&&$again['duplicate']&&$row['content']===$data['content']&&$row['category']===$data['category']&&$row['phone']===$data['phone']&&(int)$row['history_year']===1566,'feedback_exact_fields_and_retry');
    $conflict=false;try{ops_save_feedback($db,array_merge($value,['context_label'=>'吏部']));}catch(InvalidArgumentException $error){$conflict=true;}
    verify_ops($conflict,'request_id_cannot_reuse_changed_context');
    foreach(['phone'=>'123','content'=>'短','consent'=>false,'website'=>'spam'] as $field=>$bad){$rejected=false;try{ops_feedback_input(array_merge($data,[$field=>$bad]));}catch(InvalidArgumentException $error){$rejected=true;}verify_ops($rejected,'invalid_feedback_'.$field);}
    verify_ops(ops_limit($db,'test','identity',1,3600)&&!ops_limit($db,'test','identity',1,3600),'server_rate_limit');
    echo json_encode(['passed'=>true,'checks'=>$checks,'public_counter_modified'=>false],JSON_UNESCAPED_UNICODE);
}catch(Throwable $error){echo json_encode(['passed'=>false,'checks'=>$checks,'error_type'=>get_class($error),'line'=>$error->getLine(),'check'=>$error instanceof RuntimeException&&!($error instanceof PDOException)?$error->getMessage():null,'db_code'=>$error instanceof PDOException?($error->errorInfo[1]??null):null]);exit(1);}
