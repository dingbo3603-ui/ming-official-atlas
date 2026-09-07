CREATE TABLE IF NOT EXISTS atlas_visit_meta (
    id TINYINT UNSIGNED PRIMARY KEY,
    started_at DATETIME NOT NULL
) ENGINE=InnoDB;
INSERT IGNORE INTO atlas_visit_meta (id, started_at) VALUES (1, UTC_TIMESTAMP());
CREATE TABLE IF NOT EXISTS atlas_visit_days (
    visit_day DATE PRIMARY KEY,
    views BIGINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS atlas_visit_requests (
    request_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    created_at DATETIME NOT NULL,
    INDEX visits_created (created_at)
) ENGINE=InnoDB;
