-- Execute in each tenant database resolved by instances-service, before deploying users-service.
-- Additive migration: no changes to the legacy parametros/operadores_config_sip tables.
-- Singleton id=1 is enforced by the application. No credentials are seeded here.
CREATE TABLE IF NOT EXISTS telephony_webrtc_settings (
  id TINYINT UNSIGNED NOT NULL,
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 0,
  websocket_url VARCHAR(2048) NOT NULL DEFAULT '',
  sip_domain VARCHAR(255) NOT NULL DEFAULT '',
  ice_servers_json TEXT NOT NULL,
  updated_by INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
