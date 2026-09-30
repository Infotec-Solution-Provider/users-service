import { BadRequestError, InternalServerError, NotFoundError } from "@rgranatodutra/http-errors";
import instancesService from "./instances.service";
import { isPbxAllowed, parsePbxAddress, readGatewayEnvironment } from "./telephony-gateway";
import { emptyWebrtcSettings, serializeIceServers, validateWebrtcSettings, WebrtcSettings } from "./webrtc-config";

interface SettingsRow {
  enabled: number;
  connection_mode?: string;
  websocket_url: string;
  sip_domain: string;
  pbx_address?: string;
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

// Same statements as migrations/20260930_001_telephony_webrtc_gateway.sql. MySQL 5.5 has no
// ADD COLUMN IF NOT EXISTS, so each column is checked with SHOW COLUMNS before altering.
const ADDED_COLUMNS = [
  { name: "connection_mode", ddl: "ALTER TABLE telephony_webrtc_settings ADD COLUMN connection_mode VARCHAR(16) NOT NULL DEFAULT 'direct'" },
  { name: "pbx_address", ddl: "ALTER TABLE telephony_webrtc_settings ADD COLUMN pbx_address VARCHAR(255) NOT NULL DEFAULT ''" },
];

class WebrtcSettingsService {
  private readonly ensuredTables = new Set<string>();

  async get(instance: string): Promise<WebrtcSettings> {
    await this.ensureTable(instance);
    let rows: SettingsRow[];
    try {
      rows = await instancesService.executeQuery<SettingsRow[]>(instance,
        `SELECT enabled, connection_mode, websocket_url, sip_domain, pbx_address, ice_servers_json
         FROM telephony_webrtc_settings WHERE id = 1`, []);
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
    return validateWebrtcSettings({
      enabled: Number(row.enabled) === 1, mode: row.connection_mode || "direct", websocketUrl: row.websocket_url,
      domain: row.sip_domain, pbxAddress: row.pbx_address ?? "", iceServers,
    });
  }

  async getEnabled(instance: string): Promise<WebrtcSettings> {
    const settings = await this.get(instance);
    if (!settings.enabled) throw new NotFoundError("Telefonia web desabilitada ou não configurada para esta instância.");
    return settings;
  }

  async save(instance: string, operatorId: number, payload: unknown): Promise<WebrtcSettings> {
    const settings = validateWebrtcSettings(payload);
    if (settings.mode === "gateway") this.assertGatewayAllowed(settings);
    await this.ensureTable(instance);
    try {
      await instancesService.executeQuery(instance,
        `INSERT INTO telephony_webrtc_settings
           (id, enabled, connection_mode, websocket_url, sip_domain, pbx_address, ice_servers_json, updated_by)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), connection_mode = VALUES(connection_mode),
           websocket_url = VALUES(websocket_url), sip_domain = VALUES(sip_domain), pbx_address = VALUES(pbx_address),
           ice_servers_json = VALUES(ice_servers_json), updated_by = VALUES(updated_by)`,
        [settings.enabled ? 1 : 0, settings.mode, settings.websocketUrl, settings.domain, settings.pbxAddress,
          serializeIceServers(settings.iceServers), operatorId]);
    } catch {
      throw new InternalServerError("Não foi possível confirmar a gravação da telefonia web. Recarregue a configuração antes de tentar novamente e verifique a conexão com o banco.");
    }
    return settings;
  }

  private assertGatewayAllowed(settings: WebrtcSettings): void {
    const environment = readGatewayEnvironment();
    if (!environment) {
      if (settings.enabled) throw new BadRequestError("O gateway de telefonia não está configurado neste servidor. Use a conexão direta ou solicite a configuração do gateway.");
      return;
    }
    const address = parsePbxAddress(settings.pbxAddress);
    if (address && !isPbxAllowed(address, environment.allowedNetworks)) {
      throw new BadRequestError("O endereço da central está fora das redes liberadas para o gateway de telefonia.");
    }
  }

  private async ensureTable(instance: string): Promise<void> {
    if (this.ensuredTables.has(instance)) return;
    try {
      await instancesService.executeQuery(instance, CREATE_SETTINGS_TABLE, []);
      await this.ensureColumns(instance);
    } catch {
      throw new InternalServerError("Não foi possível preparar a tabela telephony_webrtc_settings no banco da instância. Verifique a conexão e a permissão para criar e alterar tabelas.");
    }
    this.ensuredTables.add(instance);
  }

  private async ensureColumns(instance: string): Promise<void> {
    const existing = await this.columns(instance);
    for (const column of ADDED_COLUMNS) {
      if (existing.has(column.name)) continue;
      try {
        await instancesService.executeQuery(instance, column.ddl, []);
      } catch (error) {
        // Another process may have added the column between SHOW COLUMNS and ALTER TABLE.
        if (!(await this.columns(instance)).has(column.name)) throw error;
      }
    }
  }

  private async columns(instance: string): Promise<Set<string>> {
    const rows = await instancesService.executeQuery<Array<{ Field: string }>>(instance,
      "SHOW COLUMNS FROM telephony_webrtc_settings", []);
    return new Set(rows.map(row => row.Field));
  }
}

export default new WebrtcSettingsService();
