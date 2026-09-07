<?php
// Private implementation: direct requests never disclose configuration or data.
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
function ops_config(): array {
    if (isset($GLOBALS['ops_config'])) return $GLOBALS['ops_config'];
    $dev = in_array(PHP_SAPI, ['cli','cli-server'], true) ? getenv('DMWC_OPS_CONFIG_JSON') : false;
    if ($dev) $config = json_decode($dev, true, 32, JSON_THROW_ON_ERROR);
    else {
        $base = dirname(__DIR__, 2).'/others/';
        $db = require $base.'dmwc-history/config.php';
        $settings = require $base.'dmwc-admin/config.php';
        $config = $db + $settings;
    }
    if (!is_array($config) || strlen($config['secret'] ?? '') < 32) throw new RuntimeException('Operations unavailable');
    return $GLOBALS['ops_config'] = $config;
}
function ops_table(string $name): string {
    $prefix = ops_config()['table_prefix'] ?? 'atlas_';
    if (!preg_match('/^atlas_(?:test_[a-f0-9]{12}_)?$/D', $prefix) || !preg_match('/^[a-z_]+$/D',$name)) throw new RuntimeException('Invalid table');
    return '`'.$prefix.$name.'`';
}
function ops_db(): PDO {
    $c=ops_config();
    return new PDO('mysql:host='.$c['host'].';dbname='.$c['database'].';charset=utf8mb4', $c['user'], $c['password'],
        [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES=>false, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC, PDO::ATTR_TIMEOUT=>4]);
}
function ops_rows(PDO $db, string $sql, array $args=[]): array { $q=$db->prepare($sql);$q->execute($args);return $q->fetchAll(PDO::FETCH_ASSOC); }
function ops_scalar(PDO $db, string $sql, array $args=[]): mixed { $q=$db->prepare($sql);$q->execute($args);return $q->fetchColumn(); }
function ops_text(mixed $value, int $limit): string {
    if (!is_string($value) || !preg_match('//u',$value)) return '';
    $value=trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u','',$value));
    preg_match_all('/./us',$value,$chars);
    return implode('',array_slice($chars[0],0,$limit));
}
function ops_secure(): bool {
    // Forwarded protocol headers are deliberately not trusted on this shared host.
    return in_array(strtolower((string)($_SERVER['HTTPS'] ?? '')),['on','1'],true)
        || (int)($_SERVER['SERVER_PORT'] ?? 0)===443
        || (PHP_SAPI==='cli-server' && !empty(ops_config()['allow_local_http']) && in_array($_SERVER['REMOTE_ADDR'] ?? '',['127.0.0.1','::1'],true));
}
function ops_ip(array $server): string {
    $ip=(string)($server['REMOTE_ADDR'] ?? '');
    if (str_starts_with(strtolower($ip),'::ffff:') && filter_var(substr($ip,7),FILTER_VALIDATE_IP,FILTER_FLAG_IPV4)) $ip=substr($ip,7);
    $packed=@inet_pton($ip);
    return $packed===false ? '' : inet_ntop($packed);
}
function ops_agent(string $ua): array {
    $device=preg_match('/iPad|Tablet|Kindle|Silk|PlayBook/i',$ua) || (stripos($ua,'Android')!==false && stripos($ua,'Mobile')===false) ? 'tablet'
        : (preg_match('/Mobile|iPhone|iPod|Android|Windows Phone/i',$ua) ? 'mobile' : (preg_match('/Windows NT|Macintosh|X11|CrOS|Linux/i',$ua)?'desktop':'other'));
    $browser='其他 / 未识别';
    foreach (['微信'=>'MicroMessenger','QQ浏览器'=>'QQBrowser','UC浏览器'=>'UCBrowser','Samsung Internet'=>'SamsungBrowser','Edge'=>'Edg(?:e|A|iOS)?','Opera'=>'OPR|Opera','Firefox'=>'Firefox|FxiOS','Chrome'=>'Chrome|CriOS','Safari'=>'Version','Internet Explorer'=>'MSIE|Trident'] as $name=>$pattern) {
        if(preg_match('~(?:'.$pattern.')[/ :][\d.]+~i',$ua)){$browser=$name;break;}
    }
    $os=preg_match('/iPhone|iPad|iPod/i',$ua)?'iOS / iPadOS':(stripos($ua,'Android')!==false?'Android':(stripos($ua,'Windows')!==false?'Windows':(stripos($ua,'CrOS')!==false?'ChromeOS':(stripos($ua,'Macintosh')!==false?'macOS':(stripos($ua,'Linux')!==false?'Linux':'其他 / 未识别')))));
    return ['device'=>$device,'browser'=>$browser,'os'=>$os];
}
function ops_region(string $ip): array {
    $unknown=['country'=>'未知','province'=>'未知','city'=>'未知','geo_status'=>'unknown'];
    if (!$ip || !filter_var($ip,FILTER_VALIDATE_IP,FILTER_FLAG_NO_PRIV_RANGE|FILTER_FLAG_NO_RES_RANGE)) return $unknown;
    try {
        $dir=ops_config()['geo_path'] ?? '';
        $v4=(bool)filter_var($ip,FILTER_VALIDATE_IP,FILTER_FLAG_IPV4);
        $path=$dir.'/ip2region_'.($v4?'v4':'v6').'.xdb';
        if(!is_readable($path)||!is_readable($dir.'/Searcher.class.php')) return $unknown;
        require_once $dir.'/Searcher.class.php';
        $searcher=\ip2region\xdb\Searcher::newWithFileOnly($v4?\ip2region\xdb\IPv4::default():\ip2region\xdb\IPv6::default(),$path);
        try {$raw=$searcher->search($ip);} finally {$searcher->close();}
        $parts=explode('|',$raw);
        $clean=static fn($value)=>$value && $value!=='0' ? ops_text($value,80) : '未知';
        return ['country'=>$clean($parts[0]??''),'province'=>$clean($parts[1]??''),'city'=>$clean($parts[2]??''),'geo_status'=>$raw?'located':'unknown'];
    } catch(Throwable $error){return $unknown;}
}
function ops_visit_details(array $server, array $input): array {
    $ip=ops_ip($server);$ua=ops_text($server['HTTP_USER_AGENT']??'',512);
    $path=parse_url(is_string($input['path']??null)?$input['path']:'/',PHP_URL_PATH);
    $path=is_string($path)&&str_starts_with($path,'/')&&!str_starts_with($path,'//')?ops_text($path,180):'/';
    $refer=ops_text($input['referrer']??'',512);$host=parse_url($refer,PHP_URL_HOST);
    return ['ip'=>$ip,'ip_source'=>'remote_addr','user_agent'=>$ua,'entry_path'=>$path,'referrer_host'=>is_string($host)?ops_text(strtolower($host),253):'']+ops_agent($ua)+ops_region($ip);
}
function ops_insert_visit(PDO $db, string $requestId, string $day, array $details): void {
    $keys=['ip','ip_source','country','province','city','geo_status','device','browser','os','user_agent','entry_path','referrer_host'];
    $q=$db->prepare('INSERT INTO '.ops_table('visit_events').' (request_id, created_at, visit_day,'.implode(',',$keys).') VALUES (?,UTC_TIMESTAMP(),?,'.implode(',',array_fill(0,count($keys),'?')).')');
    $q->execute(array_merge([$requestId,$day],array_map(static fn($k)=>$details[$k],$keys)));
}
function ops_limit(PDO $db,string $scope,string $identity,int $max,int $seconds): bool {
    if(random_int(1,100)===1)$db->exec('DELETE FROM '.ops_table('ops_limits').' WHERE expires_at<UTC_TIMESTAMP() LIMIT 200');
    $window=(int)floor(time()/$seconds);$bucket=hash_hmac('sha256',$scope.'|'.$identity.'|'.$window,ops_config()['secret']);
    $q=$db->prepare('INSERT INTO '.ops_table('ops_limits').' (bucket,hits,expires_at) VALUES (?,1,?) ON DUPLICATE KEY UPDATE hits=hits+1');
    $q->execute([$bucket,gmdate('Y-m-d H:i:s',($window+1)*$seconds)]);
    return (int)ops_scalar($db,'SELECT hits FROM '.ops_table('ops_limits').' WHERE bucket=?',[$bucket])<=$max;
}
function ops_session(string $kind): void {
    $config=ops_config();
    ini_set('session.use_strict_mode','1');ini_set('session.use_only_cookies','1');ini_set('session.gc_maxlifetime','7200');
    if (!empty($config['session_path'])) session_save_path($config['session_path']);
    session_name($kind==='admin'?'dmwc_admin':'dmwc_feedback');
    session_set_cookie_params(['lifetime'=>0,'path'=>$kind==='admin'?'/admin/':'/api/feedback.php','secure'=>empty($config['allow_local_http']),'httponly'=>true,'samesite'=>'Strict']);
    if(!session_start())throw new RuntimeException('Session unavailable');
    if(empty($_SESSION['csrf']))$_SESSION['csrf']=bin2hex(random_bytes(32));
}
function ops_csrf(mixed $token): bool { return is_string($token)&&isset($_SESSION['csrf'])&&hash_equals($_SESSION['csrf'],$token); }
function ops_origin_ok(): bool {
    $origin=$_SERVER['HTTP_ORIGIN']??'';
    if(in_array($origin,['https://dmwc.cc','https://www.dmwc.cc'],true))return true;
    return PHP_SAPI==='cli-server' && !empty(ops_config()['allow_local_http']) && in_array(parse_url($origin,PHP_URL_HOST),['127.0.0.1','localhost'],true);
}
function ops_feedback_input(array $data): array {
    $phone=is_string($data['phone']??null)?preg_replace('/[\s()-]/','',$data['phone']):'';
    if(!preg_match('/^\+?[1-9][0-9]{6,14}$/D',$phone))throw new InvalidArgumentException('请填写有效的手机号。');
    $content=ops_text($data['content']??'',3001);
    preg_match_all('/./us',$content,$chars);
    if(count($chars[0])<5||count($chars[0])>3000)throw new InvalidArgumentException('反馈内容请填写5至3000字。');
    if(($data['consent']??false)!==true)throw new InvalidArgumentException('请确认手机号的使用说明。');
    $category=$data['category']??'';
    if(!in_array($category,['纠正错误','补充内容','功能问题','其他建议'],true))throw new InvalidArgumentException('请选择反馈类型。');
    $id=$data['request_id']??null;
    if(!is_string($id)||!preg_match('/^[a-f0-9]{32}$/D',$id))throw new InvalidArgumentException('提交标识无效，请刷新后重试。');
    if(!empty($data['website']))throw new InvalidArgumentException('本次提交未通过校验。');
    $year=filter_var($data['year']??null,FILTER_VALIDATE_INT);
    return ['request_id'=>$id,'phone'=>$phone,'content'=>$content,'category'=>$category,'context_label'=>ops_text($data['context']??'',180),'history_year'=>$year&&$year>=1368&&$year<=1644?$year:null];
}
function ops_save_feedback(PDO $db,array $value): array {
    $same=static function(array $row)use($value):bool{foreach(['phone','category','content','context_label','history_year'] as $key)if((string)$row[$key] !== (string)$value[$key])return false;return true;};
    $existing=ops_rows($db,'SELECT * FROM '.ops_table('feedback').' WHERE request_id=?',[$value['request_id']]);
    if($existing){
        if(!$same($existing[0]))throw new InvalidArgumentException('本次提交标识已使用，请作为新反馈提交。');
        return ['id'=>(int)$existing[0]['id'],'duplicate'=>true];
    }
    if(!ops_limit($db,'feedback-ip',ops_ip($_SERVER),5,3600)||!ops_limit($db,'feedback-phone',$value['phone'],8,86400))throw new OverflowException('提交较频繁，请稍后再试。');
    $q=$db->prepare('INSERT INTO '.ops_table('feedback').' (request_id,created_at,phone,category,content,context_label,history_year,status,admin_note) VALUES (?,UTC_TIMESTAMP(),?,?,?,?,?,\'new\',\'\')');
    try {$q->execute(array_map(static fn($key)=>$value[$key],['request_id','phone','category','content','context_label','history_year']));}
    catch(PDOException $error){
        if(($error->errorInfo[1]??0)!==1062)throw $error;
        $row=ops_rows($db,'SELECT * FROM '.ops_table('feedback').' WHERE request_id=?',[$value['request_id']])[0]??null;
        if(!$row||!$same($row))throw new InvalidArgumentException('请作为新反馈提交。');
        return ['id'=>(int)$row['id'],'duplicate'=>true];
    }
    return ['id'=>(int)$db->lastInsertId(),'duplicate'=>false];
}
