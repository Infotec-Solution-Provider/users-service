import { timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_SIP_PORT = 5060;
const DEFAULT_TOKEN_TTL_SECONDS = 12 * 60 * 60;
const TOKEN_AUDIENCE = "inpulse-telephony-gateway";

export interface PbxAddress {
  host: string;
  port: number;
}

interface Ipv4Network {
  address: number;
  prefix: number;
}

export interface GatewayEnvironment {
  websocketUrl: string;
  tokenSecret: string;
  apiKey: string;
  allowedNetworks: Ipv4Network[];
  tokenTtlSeconds: number;
  principals?: { instance: string; userId: number }[];
}

export const gatewayConfigPath = path.resolve(__dirname, "../../telephony-gateway.config.json");

/** Private server-owned configuration; never returned by a configuration endpoint. */
export function readGatewayFile(file = gatewayConfigPath): GatewayEnvironment | null {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384 || (process.platform !== "win32" && (stat.mode & 0o077) !== 0)) return null;
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    if (raw["version"] !== 1 || !Array.isArray(raw["principals"]) || !raw["principals"].length || raw["principals"].some(p => !p || typeof p.instance !== "string" || !Number.isSafeInteger(p.userId) || p.userId < 1)) return null;
    if (!Array.isArray(raw["allowedNetworks"]) || !raw["allowedNetworks"].every(n => typeof n === "string")) return null;
    const config = readGatewayEnvironment({
      TELEPHONY_GATEWAY_WSS_URL: String(raw["websocketUrl"] ?? ""),
      TELEPHONY_GATEWAY_TOKEN_SECRET: String(raw["tokenSecret"] ?? ""),
      TELEPHONY_GATEWAY_API_KEY: String(raw["apiKey"] ?? ""),
      TELEPHONY_GATEWAY_ALLOWED_NETWORKS: raw["allowedNetworks"].join(","),
      TELEPHONY_GATEWAY_TOKEN_TTL_SECONDS: String(raw["tokenTtlSeconds"] ?? ""),
    });
    return config ? { ...config, principals: raw["principals"] } : null;
  } catch { return null; }
}

export function isGatewayPrincipalAllowed(environment: GatewayEnvironment, principal: { instance: string; userId: number }): boolean {
  return !environment.principals || environment.principals.some(p => p.instance === principal.instance && p.userId === principal.userId);
}

export interface GatewayClaims {
  instance: string;
  userId: number;
  sipUser: string;
  host: string;
  port: number;
}

function ipv4ToNumber(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4 || !parts.every(part => /^(0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255)) return null;
  return parts.reduce((total, part) => total * 256 + Number(part), 0);
}

/** Accepts "a.b.c.d/nn" (or a single address). Prefixes shorter than /8 are refused as too broad. */
function parseNetwork(value: string): Ipv4Network | null {
  const [addressText, prefixText = "32", extra] = value.trim().split("/");
  const address = ipv4ToNumber(addressText ?? "");
  const prefix = Number(prefixText);
  if (address === null || extra !== undefined || !/^\d{1,2}$/.test(prefixText) || prefix < 8 || prefix > 32) return null;
  return { address, prefix };
}

function networkOf(address: number, prefix: number): number {
  return Math.floor(address / 2 ** (32 - prefix));
}

/** Parses "IPv4[:port]". Hostnames are rejected so the allowlist cannot be bypassed through DNS. */
export function parsePbxAddress(value: string): PbxAddress | null {
  const match = /^([0-9.]+)(?::([0-9]{1,5}))?$/.exec(value.trim());
  if (!match || ipv4ToNumber(match[1]!) === null) return null;
  const port = match[2] === undefined ? DEFAULT_SIP_PORT : Number(match[2]);
  if (port < 1 || port > 65535) return null;
  return { host: match[1]!, port };
}

export function formatPbxAddress({ host, port }: PbxAddress): string {
  return `${host}:${port}`;
}

/** SIP domain used by the browser: the PBX itself, so Asterisk sees its own address in From/To. */
export function pbxSipDomain({ host, port }: PbxAddress): string {
  return port === DEFAULT_SIP_PORT ? host : `${host}:${port}`;
}

export function isPbxAllowed(address: PbxAddress, networks: Ipv4Network[]): boolean {
  const value = ipv4ToNumber(address.host);
  if (value === null) return false;
  return networks.some(({ address, prefix }) => networkOf(value, prefix) === networkOf(address, prefix));
}

/** Returns null when any required variable is missing, which keeps gateway mode unavailable. */
export function readGatewayEnvironment(env: NodeJS.ProcessEnv = process.env): GatewayEnvironment | null {
  // A malformed explicit file must fail closed, not fall back to unrelated environment settings.
  if (env === process.env && fs.existsSync(gatewayConfigPath)) return readGatewayFile();
  const websocketUrl = env["TELEPHONY_GATEWAY_WSS_URL"]?.trim() ?? "";
  const tokenSecret = env["TELEPHONY_GATEWAY_TOKEN_SECRET"]?.trim() ?? "";
  const apiKey = env["TELEPHONY_GATEWAY_API_KEY"]?.trim() ?? "";
  const networks = (env["TELEPHONY_GATEWAY_ALLOWED_NETWORKS"] ?? "").split(",").filter(value => value.trim());
  const allowedNetworks = networks.map(parseNetwork);
  if (!websocketUrl || tokenSecret.length < 32 || apiKey.length < 32 || !allowedNetworks.length) return null;
  if (allowedNetworks.some(network => network === null)) return null;
  let url: URL;
  try { url = new URL(websocketUrl); } catch { return null; }
  // Plain ws:// only for a gateway on the same machine as the browser (local tests); never across a network.
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!(url.protocol === "wss:" || (url.protocol === "ws:" && loopback))) return null;
  if (url.search || url.hash || url.username || url.password) return null;
  const ttl = Number(env["TELEPHONY_GATEWAY_TOKEN_TTL_SECONDS"]);
  return {
    websocketUrl: url.toString(), tokenSecret, apiKey, allowedNetworks: allowedNetworks as Ipv4Network[],
    tokenTtlSeconds: Number.isInteger(ttl) && ttl >= 300 && ttl <= 86_400 ? ttl : DEFAULT_TOKEN_TTL_SECONDS,
  };
}

export function issueGatewayToken(environment: GatewayEnvironment, claims: GatewayClaims): string {
  const { instance, userId, sipUser, host, port } = claims;
  return jwt.sign({ instance, userId, sipUser, host, port }, environment.tokenSecret, {
    algorithm: "HS256", audience: TOKEN_AUDIENCE, expiresIn: environment.tokenTtlSeconds,
  });
}

export function verifyGatewayToken(environment: GatewayEnvironment, token: string): GatewayClaims | null {
  try {
    const payload = jwt.verify(token, environment.tokenSecret, { algorithms: ["HS256"], audience: TOKEN_AUDIENCE });
    if (typeof payload !== "object") return null;
    const { instance, userId, sipUser, host, port } = payload as Record<string, unknown>;
    if (typeof instance !== "string" || typeof userId !== "number" || typeof sipUser !== "string"
      || typeof host !== "string" || typeof port !== "number") return null;
    return { instance, userId, sipUser, host, port };
  } catch {
    return null;
  }
}

export function gatewayWebsocketUrl(environment: GatewayEnvironment, token: string): string {
  const url = new URL(environment.websocketUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export function isGatewayKeyValid(environment: GatewayEnvironment, presented: unknown): boolean {
  if (typeof presented !== "string") return false;
  const expected = Buffer.from(environment.apiKey);
  const received = Buffer.from(presented);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
