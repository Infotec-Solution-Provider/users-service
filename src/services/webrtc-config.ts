import { BadRequestError } from "@rgranatodutra/http-errors";
import { SipConfig } from "../types/sip-config.type";

interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface WebrtcTenantConfig {
  websocketUrl: string;
  domain: string;
  iceServers: IceServer[];
}

export interface WebrtcSettings extends WebrtcTenantConfig {
  enabled: boolean;
}

export function emptyWebrtcSettings(): WebrtcSettings {
  return { enabled: false, websocketUrl: "", domain: "", iceServers: [] };
}

export function serializeIceServers(servers: IceServer[]): string {
  // instances-service uses legacy latin1 connections; keep JSON ASCII so credentials round-trip intact.
  return JSON.stringify(servers).replace(/[\u007f-\uffff]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateWebrtcSettings(config: unknown): WebrtcSettings {
  if (!record(config) || typeof config["enabled"] !== "boolean") {
    throw new BadRequestError("Informe se a telefonia web está habilitada.");
  }
  const enabled = config["enabled"];
  if (typeof config["websocketUrl"] !== "string" || typeof config["domain"] !== "string") {
    throw new BadRequestError("Informe o endereço WSS e o domínio SIP da instância.");
  }
  const websocketUrl = config["websocketUrl"].trim();
  const domain = config["domain"].trim();
  const iceServers = validateIceServers(config["iceServers"] ?? []);
  if (!enabled && !websocketUrl && !domain) return { enabled, websocketUrl, domain, iceServers };
  if (websocketUrl.length > 2048 || domain.length > 255) throw new BadRequestError("Endereço de telefonia muito longo.");
  let url: URL;
  try { url = new URL(websocketUrl); } catch {
    throw new BadRequestError("Endereço WSS inválido.");
  }
  if (url.protocol !== "wss:" || url.username || url.password || url.hash || url.search) {
    throw new BadRequestError("A telefonia web exige WSS sem credenciais na URL.");
  }
  if (!/^[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$/.test(domain)) {
    throw new BadRequestError("Domínio SIP inválido.");
  }
  return { enabled, websocketUrl: url.toString(), domain, iceServers };
}

function validateIceServers(servers: unknown): IceServer[] {
  if (!Array.isArray(servers) || servers.length > 10) throw new BadRequestError("Configuração ICE inválida.");
  const iceServers = servers.map((server: unknown): IceServer => {
    if (!record(server)) throw new BadRequestError("Servidor ICE inválido.");
    const urls = typeof server["urls"] === "string" ? [server["urls"]] : server["urls"];
    if (!Array.isArray(urls) || !urls.length || urls.length > 10 || !urls.every((value: unknown) =>
      typeof value === "string" && /^(stun|stuns|turn|turns):[^\s]+$/.test(value))) {
      throw new BadRequestError("Endereço ICE inválido.");
    }
    const result: IceServer = { urls };
    for (const field of ["username", "credential"] as const) {
      if (server[field] !== undefined) {
        if (typeof server[field] !== "string") throw new BadRequestError("Credencial ICE inválida.");
        result[field] = server[field];
      }
    }
    return result;
  });
  if (serializeIceServers(iceServers).length > 32_000) throw new BadRequestError("Configuração ICE muito longa.");
  return iceServers;
}

export function buildWebrtcConfig(config: WebrtcTenantConfig, sip: SipConfig | null) {
  const extension = sip?.RAMAL_SIP?.trim();
  const authorizationUser = sip?.LOGIN_SIP?.trim() || extension;
  const sipUser = sip?.USRID_SIP?.trim() || extension;
  if (!extension || !authorizationUser || !sipUser || !sip?.SENHA_SIP) {
    throw new BadRequestError("Configure ramal, login e senha SIP do seu operador.");
  }
  if (![extension, authorizationUser, sipUser].every(value => /^[a-zA-Z0-9_.+*-]+$/.test(value))) {
    throw new BadRequestError("Identificação do ramal SIP inválida.");
  }
  return { ...config, extension, uri: `sip:${sipUser}@${config.domain}`, authorizationUser, password: sip.SENHA_SIP };
}
