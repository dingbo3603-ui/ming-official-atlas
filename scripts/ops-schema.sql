CREATE TABLE IF NOT EXISTS atlas_ops_meta (
  id TINYINT UNSIGNED PRIMARY KEY,
  started_at DATETIME NOT NULL
) ENGINE=InnoDB;
INSERT IGNORE INTO atlas_ops_meta (id, started_at) VALUES (1, UTC_TIMESTAMP());
CREATE TABLE IF NOT EXISTS atlas_visit_events (
  request_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  created_at DATETIME NOT NULL,
  visit_day DATE NOT NULL,
  ip VARCHAR(45) CHARACTER SET ascii NOT NULL,
  ip_source VARCHAR(24) CHARACTER SET ascii NOT NULL,
  country VARCHAR(80) NOT NULL,
  province VARCHAR(80) NOT NULL,
  city VARCHAR(80) NOT NULL,
  geo_status VARCHAR(24) CHARACTER SET ascii NOT NULL,
  device VARCHAR(16) CHARACTER SET ascii NOT NULL,
  browser VARCHAR(40) NOT NULL,
  os VARCHAR(40) NOT NULL,
  user_agent VARCHAR(512) NOT NULL,
  entry_path VARCHAR(180) NOT NULL,
  referrer_host VARCHAR(253) NOT NULL,
  INDEX event_day (visit_day, created_at),
  INDEX event_ip (ip, visit_day),
  INDEX event_province (province, visit_day),
  INDEX event_device (device, visit_day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS atlas_feedback (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  phone VARCHAR(24) CHARACTER SET ascii NOT NULL,
  category VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  context_label VARCHAR(180) NOT NULL,
  history_year SMALLINT UNSIGNED NULL,
  status VARCHAR(16) CHARACTER SET ascii NOT NULL DEFAULT 'new',
  admin_note TEXT NOT NULL,
  updated_at DATETIME NULL,
  INDEX feedback_status (status, id),
  INDEX feedback_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS atlas_ops_limits (
  bucket CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  hits INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  INDEX limits_expiry (expires_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS atlas_admin_users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  password_hash VARCHAR(255) CHARACTER SET ascii NOT NULL,
  auth_version INT UNSIGNED NOT NULL DEFAULT 1,
  must_change TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  last_login_at DATETIME NULL
) ENGINE=InnoDB;
