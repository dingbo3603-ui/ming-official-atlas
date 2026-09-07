<?php
// Shared by the endpoint and isolated database checks.
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(404); exit;
}
function atlas_visit_totals(PDO $db, string $day): array {
    $query = $db->prepare('SELECT COALESCE(SUM(views),0) AS total, COALESCE(SUM(CASE WHEN visit_day=? THEN views ELSE 0 END),0) AS today FROM atlas_visit_days');
    $query->execute([$day]);
    $row = $query->fetch(PDO::FETCH_ASSOC);
    $started = $db->query('SELECT started_at FROM atlas_visit_meta WHERE id=1')->fetchColumn();
    if (!$started) throw new RuntimeException('Visit counter not initialized');
    $since = new DateTimeImmutable($started, new DateTimeZone('UTC'));
    return ['total'=>(int)$row['total'], 'today'=>(int)$row['today'],
            'since'=>$since->setTimezone(new DateTimeZone('Asia/Shanghai'))->format('Y-m-d')];
}
function atlas_record_visit(PDO $db, string $requestId, string $day, ?array $details=null): array {
    $db->beginTransaction();
    try {
        $query = $db->prepare('INSERT IGNORE INTO atlas_visit_requests (request_id, created_at) VALUES (?, UTC_TIMESTAMP())');
        $query->execute([$requestId]);
        $added = $query->rowCount() === 1;
        if ($added) {
            $query = $db->prepare('INSERT INTO atlas_visit_days (visit_day, views) VALUES (?, 1) ON DUPLICATE KEY UPDATE views=views+1');
            $query->execute([$day]);
            if ($details !== null) ops_insert_visit($db, $requestId, $day, $details);
        }
        $db->commit();
        return atlas_visit_totals($db, $day) + ['counted'=>$added];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}
