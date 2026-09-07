<?php
ini_set('display_errors','0');
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
require __DIR__.'/ops-core.php';
function feedback_response(array $data,int $status=200): never {http_response_code($status);echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);exit;}
try {
    $method=$_SERVER['REQUEST_METHOD']??'';
    if(!in_array($method,['GET','POST'],true)){header('Allow: GET, POST');feedback_response(['error'=>'请求方式不支持。'],405);}
    if(!ops_secure())feedback_response(['error'=>'为保护手机号，请使用安全连接后提交。','secure_url'=>'https://dmwc.cc/?feedback=1'],426);
    if($method==='POST'&&!ops_origin_ok())feedback_response(['error'=>'请从本站页面提交。'],403);
    ops_session('feedback');
    if($method==='GET'){
        $_SESSION['issued_at']=time();$token=$_SESSION['csrf'];session_write_close();
        feedback_response(['csrf'=>$token]);
    }
    if(strtolower(trim(explode(';',$_SERVER['CONTENT_TYPE']??'')[0]))!=='application/json')feedback_response(['error'=>'请求格式不支持。'],415);
    $raw=file_get_contents('php://input',false,null,0,18001);
    if(strlen($raw)>18000)feedback_response(['error'=>'内容过长。'],413);
    $data=json_decode($raw,true);
    if(!is_array($data)||!ops_csrf($data['csrf']??null)||time()-($_SESSION['issued_at']??0)>3600)feedback_response(['error'=>'表单已过期，请重新打开后提交。','expired'=>true],403);
    session_write_close();
    $value=ops_feedback_input($data);$db=ops_db();
    $result=ops_save_feedback($db,$value);
    feedback_response(['ok'=>true,'id'=>$result['id']]);
} catch(InvalidArgumentException $error){feedback_response(['error'=>$error->getMessage()],422);}
catch(OverflowException $error){header('Retry-After: 3600');feedback_response(['error'=>$error->getMessage()],429);}
catch(Throwable $error){feedback_response(['error'=>'反馈暂时无法保存，请稍后重试。'],503);}
