<?php
ini_set('display_errors','0');
header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');header('X-Frame-Options: DENY');header('Referrer-Policy: same-origin');
header("Content-Security-Policy: default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
require dirname(__DIR__).'/api/ops-core.php';
function e(mixed $value): string {return htmlspecialchars((string)$value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
function admin_url(array $query=[]): string {return '/admin/index.php'.($query?'?'.http_build_query($query):'');}
function admin_redirect(array $query=[]): never {header('Location: '.admin_url($query),true,303);exit;}
function admin_date(mixed $input,string $fallback): string {
    if(!is_string($input))return $fallback;
    $date=DateTimeImmutable::createFromFormat('!Y-m-d',$input);
    return $date&&$date->format('Y-m-d')===$input?$input:$fallback;
}
function admin_time(mixed $value): string {return $value?(new DateTimeImmutable($value,new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Asia/Shanghai'))->format('Y-m-d H:i:s'):'—';}
function admin_number(mixed $value): string {return number_format((int)$value);}
function admin_csrf(): void {echo '<input type="hidden" name="csrf" value="'.e($_SESSION['csrf']).'">';}
function admin_pager(int $page,int $total,array $query): void {
    $pages=max(1,(int)ceil($total/50));echo '<nav class="pager" aria-label="分页"><span>第 '.min($page,$pages).' / '.$pages.' 页 · '.admin_number($total).' 条</span>';
    if($page>1)echo '<a href="'.e(admin_url(array_merge($query,['page'=>$page-1]))).'">上一页</a>';
    if($page<$pages)echo '<a href="'.e(admin_url(array_merge($query,['page'=>$page+1]))).'">下一页</a>';
    echo '</nav>';
}
$error='';$message='';$user=null;$fatal=false;
$view=is_string($_GET['view']??null)?$_GET['view']:'overview';
if(!in_array($view,['overview','visits','feedback','password'],true))$view='overview';
$devices=['desktop'=>'电脑','mobile'=>'手机','tablet'=>'平板','other'=>'其他 / 未识别'];
$statuses=['new'=>'待处理','reviewing'=>'处理中','resolved'=>'已处理','archived'=>'已归档'];
try {
    if(!ops_secure()){
        http_response_code(426);
        echo '<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>安全访问后台</title><link rel="stylesheet" href="/admin/style.css"><main class="login"><span class="seal">明</span><h1>请使用安全连接</h1><p>后台包含访问 IP 与反馈手机号，请通过 HTTPS 登录。</p><a class="primary" href="https://dmwc.cc/admin/">进入安全连接</a></main></html>';exit;
    }
    ops_session('admin');$db=ops_db();
    $auth=$_SESSION['auth']??null;
    if(is_array($auth)&&time()-($auth['last_seen']??0)<=1800&&time()-($auth['login_at']??0)<=28800){
        $candidate=ops_rows($db,'SELECT id,username,auth_version,must_change FROM '.ops_table('admin_users').' WHERE id=?',[$auth['id']??0])[0]??null;
        if($candidate&&(int)$candidate['auth_version']===(int)($auth['version']??0)){$user=$candidate;$_SESSION['auth']['last_seen']=time();}
    }
    if(!$user)unset($_SESSION['auth']);
    if(($_SERVER['REQUEST_METHOD']??'')==='POST'){
        if(!ops_origin_ok()||!ops_csrf($_POST['csrf']??null)){http_response_code(403);throw new InvalidArgumentException('页面已过期或请求来源不符，请刷新后重试。');}
        $action=is_string($_POST['action']??null)?$_POST['action']:'';
        if($action==='login'){
            $username=ops_text($_POST['username']??'',40);$password=$_POST['password']??null;
            if(!ops_limit($db,'login-ip',ops_ip($_SERVER),10,900)||!ops_limit($db,'login-name',strtolower($username),25,900)){http_response_code(429);throw new InvalidArgumentException('尝试次数较多，请15分钟后再试。');}
            $account=ops_rows($db,'SELECT * FROM '.ops_table('admin_users').' WHERE username=?',[$username])[0]??null;
            $hash=$account['password_hash']??'$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi.';
            $valid=is_string($password)&&strlen($password)<=72&&!str_contains($password,chr(0))&&password_verify($password,$hash);
            if(!$account||!$valid){http_response_code(401);throw new InvalidArgumentException('账号或密码不正确。');}
            session_regenerate_id(true);$_SESSION['csrf']=bin2hex(random_bytes(32));
            $_SESSION['auth']=['id'=>(int)$account['id'],'version'=>(int)$account['auth_version'],'login_at'=>time(),'last_seen'=>time()];
            $q=$db->prepare('UPDATE '.ops_table('admin_users').' SET last_login_at=UTC_TIMESTAMP() WHERE id=?');$q->execute([$account['id']]);
            admin_redirect(['view'=>$account['must_change']?'password':'overview']);
        }
        if(!$user){http_response_code(401);throw new InvalidArgumentException('请先登录。');}
        if($action==='logout'){
            $_SESSION=[];session_destroy();setcookie(session_name(),'', ['expires'=>time()-3600,'path'=>'/admin/','secure'=>empty(ops_config()['allow_local_http']),'httponly'=>true,'samesite'=>'Strict']);admin_redirect();
        }
        if($action==='password'){
            if(!ops_limit($db,'change-password',(string)$user['id'],8,900))throw new InvalidArgumentException('尝试次数较多，请稍后重试。');
            $old=$_POST['current_password']??null;$new=$_POST['new_password']??null;$repeat=$_POST['repeat_password']??null;
            if(!is_string($old)||!is_string($new)||!is_string($repeat)||strlen($old)>72||str_contains($old,chr(0))||strlen($new)<12||strlen($new)>72||str_contains($new,chr(0))||$new!==$repeat||$new===$old)throw new InvalidArgumentException('新密码需12至72字节，两次输入一致，且与当前密码不同。');
            $hash=ops_scalar($db,'SELECT password_hash FROM '.ops_table('admin_users').' WHERE id=?',[$user['id']]);
            if(!password_verify($old,$hash))throw new InvalidArgumentException('当前密码不正确。');
            $q=$db->prepare('UPDATE '.ops_table('admin_users').' SET password_hash=?,auth_version=auth_version+1,must_change=0 WHERE id=?');$q->execute([password_hash($new,PASSWORD_DEFAULT),$user['id']]);
            session_regenerate_id(true);$_SESSION['csrf']=bin2hex(random_bytes(32));$_SESSION['auth']['version']++;$_SESSION['flash']='密码已更新，其他登录会话已失效。';admin_redirect();
        }
        if($user['must_change'])admin_redirect(['view'=>'password']);
        if($action==='feedback-update'){
            $id=filter_var($_POST['id']??null,FILTER_VALIDATE_INT);$status=$_POST['status']??null;$note=ops_text($_POST['admin_note']??'',3001);
            if(!$id||!is_string($status)||!isset($statuses[$status])||preg_match_all('/./us',$note)>3000)throw new InvalidArgumentException('反馈更新参数无效，备注最多3000字。');
            $q=$db->prepare('UPDATE '.ops_table('feedback').' SET status=?,admin_note=?,updated_at=UTC_TIMESTAMP() WHERE id=?');$q->execute([$status,$note,$id]);
            $_SESSION['flash']='处理状态已保存。';admin_redirect(['view'=>'feedback','id'=>$id]);
        }
        throw new InvalidArgumentException('不支持的操作。');
    }
}catch(InvalidArgumentException $failure){$error=$failure->getMessage();}
catch(Throwable $failure){http_response_code(503);$error='后台暂时无法连接，请稍后重试。';$fatal=true;}
if($user&&$user['must_change'])$view='password';
if(isset($_SESSION['flash'])){$message=$_SESSION['flash'];unset($_SESSION['flash']);}
if(!$user&&isset($_GET['view'])&&!$fatal)http_response_code(401);
$today=(new DateTimeImmutable('now',new DateTimeZone('Asia/Shanghai')))->format('Y-m-d');
$from=admin_date($_GET['from']??null,date('Y-m-d',strtotime($today.' -6 days')));$to=admin_date($_GET['to']??null,$today);
if($from>$to)[$from,$to]=[$to,$from];
if((strtotime($to)-strtotime($from))/86400>365)$from=date('Y-m-d',strtotime($to.' -365 days'));
$province=ops_text($_GET['province']??'',80);$device=is_string($_GET['device']??null)&&isset($devices[$_GET['device']])?$_GET['device']:'';
$browser=ops_text($_GET['browser']??'',40);$ip=ops_ip(['REMOTE_ADDR'=>$_GET['ip']??'']);
$page=max(1,min(100000,(int)($_GET['page']??1)));$query=['view'=>$view,'from'=>$from,'to'=>$to,'province'=>$province,'device'=>$device,'browser'=>$browser,'ip'=>$ip];
?>
<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>大明职官图 · 后台</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/admin/style.css?v=1"></head><body>
<?php if(!$user): ?>
<main class="login"><span class="seal">明</span><p class="eyebrow">大明职官图 · 站点管理</p><h1>后台登录</h1><p>查看访问统计与读者反馈。</p>
<?php if($error): ?><p class="notice error" role="alert"><?=e($error)?></p><?php endif; ?>
<?php if(!$fatal): ?><form method="post" action="/admin/index.php"><?php admin_csrf();?><input type="hidden" name="action" value="login"><label>账号<input name="username" autocomplete="username" required maxlength="40"></label><label>密码<input type="password" name="password" autocomplete="current-password" required maxlength="72"></label><button class="primary">登录后台</button></form><?php endif; ?><a class="subtle" href="/">返回网站</a></main>
<?php else: ?>
<header class="topbar"><a class="brand" href="/admin/"><span class="seal">明</span><span><strong>大明职官图</strong><small>站点后台</small></span></a><div><span><?=e($user['username'])?></span><a href="/" target="_blank" rel="noreferrer">前台</a><form method="post"><?php admin_csrf();?><input type="hidden" name="action" value="logout"><button>退出</button></form></div></header>
<div class="workspace"><nav class="sidebar" aria-label="后台导航"><?php foreach(['overview'=>'访问概览','visits'=>'访问明细','feedback'=>'用户反馈','password'=>'账号密码'] as $key=>$label):?><a <?=$view===$key?'aria-current="page"':''?> href="<?=e(admin_url(['view'=>$key]))?>"><span><?=e($label)?></span><b>›</b></a><?php endforeach;?></nav><main class="content">
<?php if($error):?><p class="notice error" role="alert"><?=e($error)?></p><?php endif;?><?php if($message):?><p class="notice" role="status"><?=e($message)?></p><?php endif;?>
<?php if($view==='password'): ?>
<div class="page-heading"><p class="eyebrow">账号设置</p><h1><?=$user['must_change']?'设置你的后台密码':'修改登录密码'?></h1><p><?=$user['must_change']?'首次登录请先更换初始密码，再查看站点数据。':'修改后，其他设备的登录会话将失效。'?></p></div>
<form method="post" class="panel password-form"><?php admin_csrf();?><input type="hidden" name="action" value="password"><label>当前密码<input type="password" name="current_password" autocomplete="current-password" required maxlength="72"></label><label>新密码<input type="password" name="new_password" autocomplete="new-password" minlength="12" maxlength="72" required><small>12至72字节，建议使用独立的英文、数字与符号长密码。</small></label><label>再次输入新密码<input type="password" name="repeat_password" autocomplete="new-password" minlength="12" maxlength="72" required></label><button class="primary">保存新密码</button></form>
<?php elseif(in_array($view,['overview','visits'],true)): ?>
<div class="page-heading"><p class="eyebrow">访问分析</p><h1><?=$view==='overview'?'访问概览':'访问明细'?></h1><p>按北京时间统计。IP 归属地和设备为识别结果，不代表访客的真实身份或精确位置。</p></div>
<form method="get" class="filters panel"><input type="hidden" name="view" value="<?=e($view)?>"><label>开始日期<input type="date" name="from" value="<?=e($from)?>" required></label><label>结束日期<input type="date" name="to" value="<?=e($to)?>" required></label><label>设备<select name="device"><option value="">全部设备</option><?php foreach($devices as $key=>$label):?><option value="<?=e($key)?>" <?=$device===$key?'selected':''?>><?=e($label)?></option><?php endforeach;?></select></label><label>省份<input name="province" value="<?=e($province)?>" placeholder="例如：广东省" maxlength="80"></label><?php if($view==='visits'):?><label>浏览器<input name="browser" value="<?=e($browser)?>" placeholder="例如：Chrome" maxlength="40"></label><label>来源 IP<input name="ip" value="<?=e($ip)?>" placeholder="完整 IPv4 / IPv6" maxlength="45"></label><?php endif;?><button class="primary">查询</button><a class="button" href="<?=e(admin_url(['view'=>$view]))?>">重置</a></form>
<div class="quick-ranges"><?php foreach([0=>'今天',6=>'近7天',29=>'近30天'] as $days=>$label):?><a href="<?=e(admin_url(['view'=>$view,'from'=>date('Y-m-d',strtotime($today.' -'.$days.' days')),'to'=>$today]))?>"><?=e($label)?></a><?php endforeach;?><span>单次查询最多366天</span></div>
<?php
try {
    $where='visit_day BETWEEN ? AND ?';$args=[$from,$to];
    foreach(['province'=>$province,'device'=>$device,'browser'=>$browser,'ip'=>$ip] as $key=>$value)if($value!==''){$where.=' AND '.$key.'=?';$args[]=$value;}
    $events=ops_table('visit_events');
    $stats=ops_rows($db,'SELECT COUNT(*) AS pv,COUNT(DISTINCT NULLIF(ip,\'\')) AS ips,COALESCE(SUM(device=\'mobile\'),0) AS mobile FROM '.$events.' WHERE '.$where,$args)[0];
    $meta=ops_scalar($db,'SELECT started_at FROM '.ops_table('ops_meta').' WHERE id=1');
    $pending=ops_scalar($db,'SELECT COUNT(*) FROM '.ops_table('feedback').' WHERE status IN (\'new\',\'reviewing\')');
    $pv=(int)$stats['pv'];$daily=ops_rows($db,'SELECT visit_day,COUNT(*) AS n,COUNT(DISTINCT NULLIF(ip,\'\')) AS ips FROM '.$events.' WHERE '.$where.' GROUP BY visit_day ORDER BY visit_day',$args);
?>
<div class="stat-grid"><article><span>访问次数 · PV</span><strong><?=admin_number($pv)?></strong><small>网页打开次数</small></article><article><span>独立来源 IP</span><strong><?=admin_number($stats['ips'])?></strong><small>同一IP在查询范围内去重</small></article><article><span>手机访问占比</span><strong><?=$pv?round((int)$stats['mobile']/$pv*100,1):0?><small>%</small></strong><small>手机 <?=admin_number($stats['mobile'])?> 次</small></article><a href="/admin/index.php?view=feedback&status=pending"><span>待办反馈</span><strong><?=admin_number($pending)?></strong><small>待处理及处理中</small></a></div>
<p class="scope-note">明细从 <?=e(admin_time($meta))?> 开始记录，之前的访问仍保留在前台累计总量中，不补造历史 IP。筛选结果不等于独立访客人数。</p>
<?php if($view==='overview'):
    $groups=[];foreach(['province','device','browser'] as $field)$groups[$field]=ops_rows($db,'SELECT '.$field.' AS label,COUNT(*) AS n FROM '.$events.' WHERE '.$where.' GROUP BY '.$field.' ORDER BY n DESC LIMIT 50',$args);
    $days=[];$byDay=array_column($daily,null,'visit_day');$cursor=new DateTimeImmutable($from);$end=new DateTimeImmutable($to);while($cursor<=$end){$key=$cursor->format('Y-m-d');$days[]=['day'=>$key,'n'=>(int)($byDay[$key]['n']??0),'ips'=>(int)($byDay[$key]['ips']??0)];$cursor=$cursor->modify('+1 day');}
    $max=max(1,...array_column($days,'n'));$points=[];foreach($days as $i=>$day)$points[]=(24+($i/max(1,count($days)-1))*952).','.round(165-$day['n']/$max*140,2);
?>
<section class="panel trend"><div class="section-heading"><h2>每日访问</h2><span><?=e($from)?> — <?=e($to)?></span></div><svg viewBox="0 0 1000 195" role="img" aria-label="查询期间每日访问趋势"><line x1="24" y1="165" x2="976" y2="165"/><line x1="24" y1="95" x2="976" y2="95"/><polyline points="<?=e(implode(' ',$points))?>"/><?php foreach($days as $i=>$day):?><circle cx="<?=24+($i/max(1,count($days)-1))*952?>" cy="<?=round(165-$day['n']/$max*140,2)?>" r="3"><title><?=e($day['day'])?>：<?=$day['n']?>次访问，<?=$day['ips']?>个IP</title></circle><?php endforeach;?></svg><div class="trend-labels"><span><?=e($from)?></span><span>最高 <?=$max===1&&!$pv?0:$max?> 次 / 日</span><span><?=e($to)?></span></div><details><summary>查看逐日数据</summary><div class="table-wrap"><table><thead><tr><th>日期</th><th>访问次数</th><th>独立IP</th></tr></thead><tbody><?php foreach(array_reverse($days) as $day):?><tr><td><a href="<?=e(admin_url(['view'=>'visits','from'=>$day['day'],'to'=>$day['day']]))?>"><?=e($day['day'])?></a></td><td><?=admin_number($day['n'])?></td><td><?=admin_number($day['ips'])?></td></tr><?php endforeach;?></tbody></table></div></details></section>
<div class="breakdown-grid"><?php foreach(['province'=>'IP归属省份','device'=>'访问设备','browser'=>'浏览器'] as $field=>$title):?><section class="panel"><div class="section-heading"><h2><?=e($title)?></h2></div><?php if(!$groups[$field]):?><p class="empty">这个时间段暂无访问记录。</p><?php endif;?><div class="distribution"><?php foreach($groups[$field] as $group):$label=$field==='device'?($devices[$group['label']]??$group['label']):$group['label'];?><a href="<?=e(admin_url(array_merge($query,['view'=>'visits',$field=>$group['label']])))?>"><span><?=e($label)?><b><?=admin_number($group['n'])?></b></span><progress max="<?=max(1,$pv)?>" value="<?=(int)$group['n']?>"></progress></a><?php endforeach;?></div></section><?php endforeach;?></div>
<?php else:
    $total=$pv;$page=min($page,max(1,(int)ceil($total/50)));$rows=ops_rows($db,'SELECT * FROM '.$events.' WHERE '.$where.' ORDER BY created_at DESC,request_id DESC LIMIT 50 OFFSET '.(($page-1)*50),$args);
?>
<section class="panel"><div class="section-heading"><h2>逐次访问</h2><span><?=admin_number($total)?> 条记录</span></div><div class="table-wrap"><table class="visit-table"><thead><tr><th>时间</th><th>来源 IP</th><th>IP归属地</th><th>设备 / 浏览器</th><th>入口与来源</th></tr></thead><tbody><?php foreach($rows as $row):?><tr><td><?=e(admin_time($row['created_at']))?></td><td><code><?=e($row['ip']?:'未识别')?></code><small>服务器连接 IP</small></td><td><?=e($row['province'])?><small><?=e($row['country'].' · '.$row['city'])?></small></td><td><?=e($devices[$row['device']]??$row['device'])?> · <?=e($row['browser'])?><small><?=e($row['os'])?></small><details><summary>终端信息</summary><p class="ua"><?=e($row['user_agent'])?></p></details></td><td><?=e($row['entry_path'])?><small><?=e($row['referrer_host']?:'直接访问 / 未提供来源')?></small></td></tr><?php endforeach;?></tbody></table></div><?php if(!$rows):?><p class="empty">未找到符合条件的访问记录。</p><?php endif;admin_pager($page,$total,$query);?></section>
<?php endif; }catch(Throwable $failure){?><p class="notice error">统计暂未读取成功，请稍后重试。</p><?php }?>
<?php elseif($view==='feedback'): ?>
<div class="page-heading"><p class="eyebrow">读者来信</p><h1>用户反馈</h1><p>手机号仅在后台查看，用于就这条反馈联系提交者。</p></div>
<?php try {
    $id=filter_var($_GET['id']??null,FILTER_VALIDATE_INT);
    if($id){$item=ops_rows($db,'SELECT * FROM '.ops_table('feedback').' WHERE id=?',[$id])[0]??null;
?><a class="back" href="/admin/index.php?view=feedback">← 返回反馈列表</a><?php if(!$item):?><p class="empty">未找到这条反馈。</p><?php else:?>
<div class="feedback-detail"><article class="panel"><div class="section-heading"><h2><?=e($item['category'])?> <small>#<?=(int)$item['id']?></small></h2><span class="tag"><?=e($statuses[$item['status']]??$item['status'])?></span></div><dl><div><dt>提交时间</dt><dd><?=e(admin_time($item['created_at']))?></dd></div><div><dt>联系电话</dt><dd><a href="tel:<?=e($item['phone'])?>"><?=e($item['phone'])?></a></dd></div><div><dt>页面位置</dt><dd><?=e($item['context_label']?:'未提供')?><?=$item['history_year']?' · '.(int)$item['history_year'].'年':''?></dd></div></dl><h3>反馈内容</h3><p class="feedback-content"><?=e($item['content'])?></p></article>
<form method="post" class="panel"><?php admin_csrf();?><input type="hidden" name="action" value="feedback-update"><input type="hidden" name="id" value="<?=(int)$item['id']?>"><h2>处理记录</h2><label>状态<select name="status"><?php foreach($statuses as $key=>$label):?><option value="<?=e($key)?>" <?=$item['status']===$key?'selected':''?>><?=e($label)?></option><?php endforeach;?></select></label><label>内部备注<textarea name="admin_note" rows="8" maxlength="3000" placeholder="记录核实结果、修改进展或后续安排"><?=e($item['admin_note'])?></textarea></label><small>备注只在后台显示，不会自动发送短信。</small><button class="primary">保存处理记录</button><?php if($item['updated_at']):?><small>最后更新：<?=e(admin_time($item['updated_at']))?></small><?php endif;?></form></div>
<?php endif; }else{
    $status=is_string($_GET['status']??null)&&(isset($statuses[$_GET['status']])||$_GET['status']==='pending')?$_GET['status']:'';$search=ops_text($_GET['q']??'',80);
    $where='1=1';$args=[];if($status==='pending'){$where.=" AND status IN ('new','reviewing')";}elseif($status){$where.=' AND status=?';$args[]=$status;}if($search){$where.=' AND (phone LIKE ? OR content LIKE ?)';$args[]='%'.$search.'%';$args[]='%'.$search.'%';}
    $total=(int)ops_scalar($db,'SELECT COUNT(*) FROM '.ops_table('feedback').' WHERE '.$where,$args);$page=min($page,max(1,(int)ceil($total/50)));
    $rows=ops_rows($db,'SELECT id,created_at,phone,category,content,context_label,history_year,status FROM '.ops_table('feedback').' WHERE '.$where.' ORDER BY id DESC LIMIT 50 OFFSET '.(($page-1)*50),$args);
?><form class="filters panel" method="get"><input type="hidden" name="view" value="feedback"><label>处理状态<select name="status"><option value="">全部状态</option><option value="pending" <?=$status==='pending'?'selected':''?>>全部待办</option><?php foreach($statuses as $key=>$label):?><option value="<?=e($key)?>" <?=$status===$key?'selected':''?>><?=e($label)?></option><?php endforeach;?></select></label><label class="grow">查找反馈<input type="search" name="q" value="<?=e($search)?>" placeholder="手机号或反馈内容" maxlength="80"></label><button class="primary">查询</button></form>
<div class="feedback-list"><?php foreach($rows as $row):?><a class="panel feedback-item" href="<?=e(admin_url(['view'=>'feedback','id'=>$row['id']]))?>"><div><span class="tag"><?=e($statuses[$row['status']]??$row['status'])?></span><span><?=e($row['category'])?> · #<?=(int)$row['id']?></span><time><?=e(admin_time($row['created_at']))?></time></div><p><?=e(ops_text($row['content'],180))?></p><footer><span><?=e(substr($row['phone'],0,3).'****'.substr($row['phone'],-4))?> · <?=e($row['context_label']?:'站点反馈')?></span><strong>查看与处理 ›</strong></footer></a><?php endforeach;?></div><?php if(!$rows):?><p class="panel empty">暂无符合条件的反馈。</p><?php endif;admin_pager($page,$total,['view'=>'feedback','status'=>$status,'q'=>$search]);}
}catch(Throwable $failure){?><p class="notice error">反馈暂未读取成功，请稍后重试。</p><?php }?>
<?php endif;?><footer class="admin-footer">大明职官图 · 数据仅供站点管理使用</footer></main></div>
<?php endif;?></body></html>
