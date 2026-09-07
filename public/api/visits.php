<?php
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function visit_response(array $body, int $status=200): never {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
$method = $_SERVER['REQUEST_METHOD'] ?? '';
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST'); visit_response(['error'=>'method_not_allowed'], 405);
}
$requestId = null;
if ($method === 'POST') {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = in_array($origin, ['http://dmwc.cc', 'https://dmwc.cc', 'http://www.dmwc.cc', 'https://www.dmwc.cc'], true);
    if (PHP_SAPI === 'cli-server' && in_array(parse_url($origin, PHP_URL_HOST), ['localhost','127.0.0.1'], true)) $allowed=true;
    if (!$allowed) visit_response(['error'=>'origin_not_allowed'], 403);
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') visit_response(['error'=>'json_required'], 415);
    $input = file_get_contents('php://input', false, null, 0, 1537);
    if (strlen($input) > 1536) visit_response(['error'=>'request_too_large'], 413);
    $data = json_decode($input, true);
    $requestId = is_array($data) ? ($data['request_id'] ?? null) : null;
    if (!is_string($requestId) || !preg_match('/^[a-f0-9]{32}$/D', $requestId)) visit_response(['error'=>'invalid_request'], 400);
}
require __DIR__.'/visit-store.php';
require __DIR__.'/ops-core.php';
try {
    $configPath = dirname(__DIR__, 2).'/others/dmwc-history/config.php';
    $devConfig = PHP_SAPI === 'cli-server' ? getenv('DMWC_HISTORY_CONFIG_JSON') : false;
    if (!$devConfig && !is_file($configPath)) visit_response(['error'=>'counter_unavailable'], 503);
    $config = $devConfig ? json_decode($devConfig, true) : require $configPath;
    $db = new PDO('mysql:host='.$config['host'].';dbname='.$config['database'].';charset=utf8mb4',
        $config['user'], $config['password'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES=>false, PDO::ATTR_TIMEOUT=>4]);
    $day = (new DateTimeImmutable('now', new DateTimeZone('Asia/Shanghai')))->format('Y-m-d');
    // Known crawlers are excluded; this measures page opens, not unique people.
    $crawler = preg_match('/bot|spider|crawler|headless|preview/i', $_SERVER['HTTP_USER_AGENT'] ?? '');
    $result = $requestId && !$crawler ? atlas_record_visit($db, $requestId, $day, ops_visit_details($_SERVER, $data))
        : atlas_visit_totals($db, $day) + ['counted'=>false];
    visit_response($result);
} catch (Throwable $error) {
    visit_response(['error'=>'counter_unavailable'], 503);
}
