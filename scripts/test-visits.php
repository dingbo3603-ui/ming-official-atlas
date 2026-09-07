<?php
// The connection-local TEMPORARY tables shadow the real counters; no test hits
// are ever added to the public figures. Password arrives on stdin, not argv.
require dirname(__DIR__).'/public/api/visit-store.php';
function check_visit($condition) { if (!$condition) throw new RuntimeException('Counter check failed at line '.debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 1)[0]['line']); }
try {
    $config = json_decode(stream_get_contents(STDIN), true);
    $db = new PDO('mysql:host='.$config['host'].';dbname='.$config['database'].';charset=utf8mb4',
        $config['user'], $config['password'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES=>false]);
    foreach (['atlas_visit_days', 'atlas_visit_meta', 'atlas_visit_requests'] as $table) {
        $definition = $db->query('SHOW CREATE TABLE '.$table)->fetch(PDO::FETCH_NUM)[1];
        $db->exec(preg_replace('/^CREATE TABLE /', 'CREATE TEMPORARY TABLE ', $definition, 1));
    }
    $db->exec("INSERT INTO atlas_visit_meta VALUES (1, '2000-01-01 00:00:00')");
    check_visit(atlas_visit_totals($db, '2000-01-02')['total'] === 0);
    $first = atlas_record_visit($db, str_repeat('a', 32), '2000-01-02');
    check_visit($first['counted'] && $first['total'] === 1 && $first['today'] === 1);
    $again = atlas_record_visit($db, str_repeat('a', 32), '2000-01-02');
    check_visit(!$again['counted'] && $again['total'] === 1 && $again['today'] === 1);
    $next = atlas_record_visit($db, str_repeat('b', 32), '2000-01-03');
    check_visit($next['counted'] && $next['total'] === 2 && $next['today'] === 1);
    check_visit(atlas_visit_totals($db, '2000-01-04')['today'] === 0);
    $retry = atlas_record_visit($db, str_repeat('a', 32), '2000-01-03');
    check_visit(!$retry['counted'] && $retry['total'] === 2);
    // A failed daily increment must also undo its request token.
    $db->exec('ALTER TABLE atlas_visit_days MODIFY views TINYINT UNSIGNED NOT NULL');
    $db->exec("UPDATE atlas_visit_days SET views=255 WHERE visit_day='2000-01-03'");
    $failed = false;
    try { atlas_record_visit($db, str_repeat('c', 32), '2000-01-03'); } catch (Throwable $error) { $failed=true; }
    check_visit($failed && !$db->inTransaction());
    check_visit((int)$db->query("SELECT COUNT(*) FROM atlas_visit_requests WHERE request_id='".str_repeat('c', 32)."'")->fetchColumn() === 0);
    echo json_encode(['isolated_mysql_checks'=>7, 'passed'=>true, 'public_counter_modified'=>false]);
} catch (Throwable $error) {
    echo json_encode(['passed'=>false, 'error_type'=>get_class($error), 'file'=>basename($error->getFile()),
        'line'=>$error->getLine(), 'db_code'=>$error instanceof PDOException?($error->errorInfo[1]??null):null,
        'check'=>get_class($error)==='RuntimeException'?$error->getMessage():null]); exit(1);
}
