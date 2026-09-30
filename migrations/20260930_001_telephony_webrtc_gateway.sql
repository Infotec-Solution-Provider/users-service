-- users-service adds these columns automatically on the first WebRTC settings access per tenant
-- (checked with SHOW COLUMNS; see src/services/webrtc-settings.service.ts, which holds the same DDL).
-- Run manually only when the tenant database user cannot alter tables, after 20260922_001.
-- connection_mode: 'direct' (browser -> WebRTC-capable PBX) or 'gateway' (browser -> in.pulse gateway -> SIP PBX).
-- pbx_address: IPv4:port of the PBX as reached by the gateway; used only in gateway mode.
ALTER TABLE telephony_webrtc_settings ADD COLUMN connection_mode VARCHAR(16) NOT NULL DEFAULT 'direct';
ALTER TABLE telephony_webrtc_settings ADD COLUMN pbx_address VARCHAR(255) NOT NULL DEFAULT '';
