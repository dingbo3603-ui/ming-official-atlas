<?php
// Public read-only API. Connection secrets live outside the website root.
ini_set('display_errors', '0');
ini_set('zlib.output_compression', '0');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
function output_json($data, $status = 200) {
    $reasons=array(200=>'OK',400=>'Bad Request',404=>'Not Found',405=>'Method Not Allowed',503=>'Service Unavailable');
    header('HTTP/1.1 '.$status.' '.$reasons[$status],true,$status);
    $body = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($body === false) { http_response_code(503); echo '{"error":"encoding_failed"}'; exit; }
    $revision = isset($data['revision']) ? $data['revision'] : ($GLOBALS['responseRevision'] ?? null);
    if ($status === 200 && $revision) {
        $etag = '"'.hash('sha256',$body).'"';
        header('Cache-Control: public, max-age=300, must-revalidate');
        header('ETag: '.$etag);
        header('X-History-Revision: '.$revision);
        if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && $_SERVER['HTTP_IF_NONE_MATCH'] === $etag) {
            http_response_code(304); exit;
        }
    }
    if (extension_loaded('zlib') && strpos($_SERVER['HTTP_ACCEPT_ENCODING'] ?? '', 'gzip') !== false) {
        header('Vary: Accept-Encoding'); header('Content-Encoding: gzip');
        echo gzencode($body, 5);
    } else echo $body;
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'GET') output_json(array('error'=>'method_not_allowed'), 405);
$action = $_GET['action'] ?? 'health';
if (!is_string($action)) output_json(array('error'=>'invalid_action'),400);
$snapshotPath = __DIR__.'/snapshots/manifest.json';
if (is_file($snapshotPath) && !isset($_GET['live'])) {
    $manifest = json_decode(file_get_contents($snapshotPath), true);
    $revision = $manifest['revision'] ?? '';
    $requestedRevision = $_GET['v'] ?? '';
    if (is_string($requestedRevision) && preg_match('/^[a-f0-9]{16}$/D',$requestedRevision) && is_dir(__DIR__.'/snapshots/'.$requestedRevision)) $revision=$requestedRevision;
    $key = null;
    if ($action === 'bootstrap') $key='bootstrap.json';
    if ($action === 'year') {
        $y=filter_var($_GET['year'] ?? '',FILTER_VALIDATE_INT);
        if (!$y || $y<1368 || $y>1644) output_json(array('error'=>'invalid_year'),400);
        $key='years/'.$y.'.json';
    }
    if ($action === 'dataset') {
        $name=$_GET['name'] ?? '';
        if (!is_string($name) || !preg_match('/^[a-z0-9-]{1,80}$/D',$name)) output_json(array('error'=>'invalid_dataset'),400);
        $key='datasets/'.$name.'.json';
    }
    if ($action === 'person') {
        $id=$_GET['id'] ?? '';
        if (!is_string($id) || !preg_match('/^[a-z0-9-]{1,100}$/D',$id)) output_json(array('error'=>'invalid_person'),400);
        $key='people/'.substr(hash('fnv1a32',$id),-2).'.json';
    }
    if ($key && preg_match('/^[a-f0-9]{16}$/D',$revision)) {
        $file=__DIR__.'/snapshots/'.$revision.'/'.$key;
        if (is_file($file)) {
            $result=json_decode(file_get_contents($file),true);
            if (json_last_error() !== JSON_ERROR_NONE) output_json(array('error'=>'snapshot_incomplete'),503);
            if ($action === 'person') {
                if (!isset($result[$id])) output_json(array('error'=>'person_not_found'),404);
                $result=$result[$id];
            }
            $GLOBALS['responseRevision']=$revision;
            header('X-History-Cache: snapshot');
            output_json($result);
        }
    }
}
$configPath = dirname(dirname(dirname(__FILE__))) . '/others/dmwc-history/config.php';
$devConfig = PHP_SAPI === 'cli-server' ? getenv('DMWC_HISTORY_CONFIG_JSON') : false;
if (!$devConfig && !is_file($configPath)) output_json(array('error'=>'history_not_configured'), 503);
try {
    $config = $devConfig ? json_decode($devConfig, true) : require $configPath;
    if (!class_exists('PDO') || !in_array('mysql',PDO::getAvailableDrivers(),true)) output_json(array('error'=>'mysql_driver_unavailable'),503);
    $db = new PDO('mysql:host=' . $config['host'] . ';dbname=' . $config['database'] . ';charset=utf8mb4',
        $config['user'], $config['password'], array(PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES=>false));
    $action = isset($_GET['action']) ? $_GET['action'] : 'health';
    if ($action === 'health') {
        $db->query('SELECT 1');
        output_json(array('status'=>'ok', 'storage'=>'mysql', 'read_only_api'=>true));
    }
    function query_rows($db, $sql, $args = array()) {
        $q = $db->prepare($sql); $q->execute($args); return $q->fetchAll();
    }
    function decoded_rows($rows) {
        return array_map(function($row) { return json_decode($row['body'], true); }, $rows);
    }
    if ($action === 'dataset') {
        $name = isset($_GET['name']) ? $_GET['name'] : '';
        if (!is_string($name) || !preg_match('/^[a-z0-9-]{1,80}$/D', $name)) output_json(array('error'=>'invalid_dataset'),400);
        $rows=query_rows($db,'SELECT body FROM atlas_datasets WHERE id=?',array($name));
        if (!$rows) output_json(array('error'=>'dataset_not_found'),404);
        output_json(json_decode($rows[0]['body'], true));
    }
    if ($action === 'bootstrap') {
        $meta=query_rows($db,"SELECT body FROM atlas_datasets WHERE id='history-meta'");
        if (!$meta) output_json(array('error'=>'history_not_imported'),503);
        $result=json_decode($meta[0]['body'],true);
        $result['people']=decoded_rows(query_rows($db,'SELECT body FROM atlas_people ORDER BY name,id'));
        $result['sources']=decoded_rows(query_rows($db,'SELECT body FROM atlas_sources ORDER BY id'));
        $result['eras']=decoded_rows(query_rows($db,'SELECT body FROM atlas_eras ORDER BY start_year,id'));
        $result['office_count']=(int)$db->query('SELECT COUNT(*) FROM atlas_offices')->fetchColumn();
        $result['tenure_count']=(int)$db->query('SELECT COUNT(*) FROM atlas_tenures')->fetchColumn();
        $result['storage']='mysql';
        output_json($result);
    }
    if ($action === 'year') {
        $year=isset($_GET['year'])?filter_var($_GET['year'],FILTER_VALIDATE_INT):false;
        if ($year===false || $year<1368 || $year>1644) output_json(array('error'=>'invalid_year'),400);
        $rows=query_rows($db,'SELECT body FROM atlas_tenures WHERE (start_year IS NOT NULL AND end_year IS NOT NULL AND start_year<=? AND end_year>=?) OR attested_year=? OR (start_year=? AND end_year IS NULL) OR (end_year=? AND start_year IS NULL) ORDER BY institution,office_title,start_year,id',array($year,$year,$year,$year,$year));
        $records=decoded_rows($rows);
        foreach ($records as &$record) {
            if (isset($record['year_office_ids'][(string)$year])) {
                $record['office_ids']=array_values(array_unique(array_merge($record['office_ids'], $record['year_office_ids'][(string)$year])));
            }
        }
        unset($record);
        output_json(array('year'=>$year,'records'=>$records,'storage'=>'mysql'));
    }
    if ($action === 'person') {
        $id=isset($_GET['id'])?$_GET['id']:'';
        if (!is_string($id) || !preg_match('/^[a-z0-9-]{1,100}$/D',$id)) output_json(array('error'=>'invalid_person'),400);
        $rows=query_rows($db,'SELECT body FROM atlas_people WHERE id=?',array($id));
        if (!$rows) output_json(array('error'=>'person_not_found'),404);
        output_json(array('person'=>json_decode($rows[0]['body'],true),
            'records'=>decoded_rows(query_rows($db,'SELECT body FROM atlas_tenures WHERE person_id=? ORDER BY COALESCE(start_year,attested_year,end_year,9999),id',array($id)))));
    }
    output_json(array('error'=>'unknown_action'),404);
} catch (Throwable $error) {
    output_json(array('error'=>'history_database_unavailable'),503);
}
