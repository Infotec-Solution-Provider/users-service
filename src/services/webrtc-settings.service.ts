import { InternalServerError, NotFoundError } from "@rgranatodutra/http-errors";
import instancesService from "./instances.service";
import { emptyWebrtcSettings, serializeIceServers, validateWebrtcSettings, WebrtcTenantConfig, WebrtcSettings } from "./webrtc-config";

interface SettingsRow {
  enabled: number;
  websocket_url: string;
  sip_domain: string;
  ice_servers_json: string;
}

// Same DDL as migrations/20260922_001_telephony_webrtc_settings.sql. No charset: some tenants run
// MySQL 5.5.0 (no utf8mb4) and every stored value is ASCII (validated URL/domain, escaped ICE JSON).
const CREATE_SETTINGS_TABLE = `CREATE TABLE IF NOT EXISTS telephony_webrtc_settings (
  id TINYINT UNSIGNED NOT NULL,
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 0,
  websocket_url VARCHAR(2048) NOT NULL DEFAULT '',
  sip_domain VARCHAR(255) NOT NULL DEFAULT '',
  ice_servers_json TEXT NOT NULL,
  updated_by INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB`;

class WebrtcSettingsService {
  private readonly ensuredTables = new Set<string>();

  async get(instance: string): Promise<WebrtcSettings> {
    await this.ensureTable(instance);
    let rows: SettingsRow[];
    try {
      rows = await instancesService.executeQuery<SettingsRow[]>(instance,
        "SELECT enabled, websocket_url, sip_domain, ice_servers_json FROM telephony_webrtc_settings WHERE id = 1", []);
    } catch {
      // Upstream query errors may include parameters or credentials; do not propagate them.
      throw new InternalServerError("Não foi possível carregar a telefonia web. Verifique a conexão com o banco da instância.");
    }
    const row = rows[0];
    if (!row) return emptyWebrtcSettings();
    let iceServers: unknown;
    try { iceServers = JSON.parse(row.ice_servers_json); } catch {
      throw new InternalServerError("A configuração ICE salva é inválida. Revise a telefonia web na configuração SIP.");
    }
    return validateWebrtcSettings({ enabled: Number(row.enabled) === 1, websocketUrl: row.websocket_url, domain: row.sip_domain, iceServers });
  }

  async getEnabled(instance: string): Promise<WebrtcTenantConfig> {
    const settings = await this.get(instance);
    if (!settings.enabled) throw new NotFoundError("Telefonia web desabilitada ou não configurada para esta instância.");
    const { websocketUrl, domain, iceServers } = settings;
    return { websocketUrl, domain, iceServers };
  }

  async save(instance: string, operatorId: number, payload: unknown): Promise<WebrtcSettings> {
    const settings = validateWebrtcSettings(payload);
    await this.ensureTable(instance);
    try {
      await instancesService.executeQuery(instance,
        `INSERT INTO telephony_webrtc_settings (id, enabled, websocket_url, sip_domain, ice_servers_json, updated_by)
         VALUES (1, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), websocket_url = VALUES(websocket_url),
           sip_domain = VALUES(sip_domain), ice_servers_json = VALUES(ice_servers_json), updated_by = VALUES(updated_by)`,
        [settings.enabled ? 1 : 0, settings.websocketUrl, settings.domain, serializeIceServers(settings.iceServers), operatorId]);
    } catch {
      throw new InternalServerError("Não foi possível confirmar a gravação da telefonia web. Recarregue a configuração antes de tentar novamente e verifique a conexão com o banco.");
    }
    return settings;
  }

  private async ensureTable(instance: string): Promise<void> {
    if (this.ensuredTables.has(instance)) return;
    try {
      await instancesService.executeQuery(instance, CREATE_SETTINGS_TABLE, []);
    } catch {
      throw new InternalServerError("Não foi possível preparar a tabela telephony_webrtc_settings no banco da instância. Verifique a conexão e a permissão para criar tabelas.");
    }
    this.ensuredTables.add(instance);
  }
}

export default new WebrtcSettingsService();
