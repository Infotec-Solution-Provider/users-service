import { InternalServerError, NotFoundError } from "@rgranatodutra/http-errors";
import instancesService from "./instances.service";
import { emptyWebrtcSettings, serializeIceServers, validateWebrtcSettings, WebrtcTenantConfig, WebrtcSettings } from "./webrtc-config";

interface SettingsRow {
  enabled: number;
  websocket_url: string;
  sip_domain: string;
  ice_servers_json: string;
}

class WebrtcSettingsService {
  async get(instance: string): Promise<WebrtcSettings> {
    let rows: SettingsRow[];
    try {
      rows = await instancesService.executeQuery<SettingsRow[]>(instance,
        "SELECT enabled, websocket_url, sip_domain, ice_servers_json FROM telephony_webrtc_settings WHERE id = 1", []);
    } catch {
      // Upstream query errors may include parameters or credentials; do not propagate them.
      throw new InternalServerError("Não foi possível carregar a telefonia web. Verifique a conexão e a migração telephony_webrtc_settings no banco da instância.");
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
    try {
      await instancesService.executeQuery(instance,
        `INSERT INTO telephony_webrtc_settings (id, enabled, websocket_url, sip_domain, ice_servers_json, updated_by)
         VALUES (1, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), websocket_url = VALUES(websocket_url),
           sip_domain = VALUES(sip_domain), ice_servers_json = VALUES(ice_servers_json), updated_by = VALUES(updated_by)`,
        [settings.enabled ? 1 : 0, settings.websocketUrl, settings.domain, serializeIceServers(settings.iceServers), operatorId]);
    } catch {
      throw new InternalServerError("Não foi possível confirmar a gravação da telefonia web. Recarregue a configuração antes de tentar novamente e verifique a conexão e a migração do banco.");
    }
    return settings;
  }
}

export default new WebrtcSettingsService();
