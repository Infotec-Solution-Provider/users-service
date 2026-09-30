import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ executeQuery: vi.fn() }));
vi.mock("../src/services/instances.service", () => ({ default: mocks }));
type Service = typeof import("../src/services/webrtc-settings.service").default;
let service: Service;
const settings = { enabled: true, mode: "direct", websocketUrl: "wss://pbx.example.test/ws", domain: "pbx.example.test", pbxAddress: "", iceServers: [{ urls: ["turn:relay.test:3478"], username: "user", credential: "test-only" }] };
const gatewayEnv = {
  TELEPHONY_GATEWAY_WSS_URL: "wss://gateway.example.test/telephony-gw",
  TELEPHONY_GATEWAY_TOKEN_SECRET: "t".repeat(40),
  TELEPHONY_GATEWAY_API_KEY: "k".repeat(40),
  TELEPHONY_GATEWAY_ALLOWED_NETWORKS: "172.22.0.0/16",
};
const sqlCalls = (prefix: string) => mocks.executeQuery.mock.calls.filter(([, sql]) => (sql as string).trim().startsWith(prefix));
const normalizeSql = (sql: string) => sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
const statements = (sql: string) => normalizeSql(sql).split(";").map(statement => statement.trim()).filter(Boolean);
const allColumns = [{ Field: "id" }, { Field: "connection_mode" }, { Field: "pbx_address" }];
/** Simulates one tenant database; SHOW COLUMNS reports every column unless told otherwise. */
function database(columns: Array<{ Field: string }> = allColumns) {
  const rows = new Map<string, unknown[]>();
  mocks.executeQuery.mockImplementation(async (instance: string, sql: string, args: unknown[]) => {
    if (sql.startsWith("SHOW COLUMNS")) return columns;
    if (sql.trim().startsWith("INSERT")) {
      rows.set(instance, [{ enabled: args[0], connection_mode: args[1], websocket_url: args[2], sip_domain: args[3], pbx_address: args[4], ice_servers_json: args[5] }]);
      return { affectedRows: 1 };
    }
    if (sql.trim().startsWith("SELECT")) return rows.get(instance) || [];
    return {};
  });
  return rows;
}
beforeEach(async () => {
  // The table cache lives in the singleton; a fresh module keeps each test independent.
  vi.resetModules();
  service = (await import("../src/services/webrtc-settings.service")).default;
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
describe("tenant database WebRTC settings", () => {
  it("creates the table once per tenant and defaults to disabled without environment fallback", async () => {
    vi.stubEnv("TELEPHONY_WEBRTC_CONFIG", JSON.stringify({ a: settings }));
    database();
    await expect(service.getEnabled("a")).rejects.toThrow("desabilitada");
    await expect(service.get("a")).resolves.toMatchObject({ enabled: false, mode: "direct" });
    await service.get("b");
    expect(sqlCalls("CREATE").map(([instance]) => instance)).toEqual(["a", "b"]);
    expect(sqlCalls("SELECT")).toHaveLength(3);
    expect(sqlCalls("ALTER")).toHaveLength(0);
    expect(mocks.executeQuery.mock.calls[0]).toEqual(["a", expect.stringMatching(/^CREATE TABLE IF NOT EXISTS telephony_webrtc_settings /), []]);
  });
  it("adds only the missing gateway columns to tables created by the previous version", async () => {
    database([{ Field: "id" }, { Field: "pbx_address" }]);
    await service.get("a");
    expect(sqlCalls("ALTER").map(([, sql]) => sql)).toEqual([expect.stringContaining("ADD COLUMN connection_mode")]);
  });
  it("tolerates a concurrent process adding the same column", async () => {
    let showCount = 0;
    mocks.executeQuery.mockImplementation(async (_instance: string, sql: string) => {
      if (sql.startsWith("SHOW COLUMNS")) return ++showCount === 1 ? [{ Field: "id" }] : allColumns;
      if (sql.startsWith("ALTER")) throw new Error("Duplicate column name");
      return [];
    });
    await expect(service.get("a")).resolves.toMatchObject({ enabled: false });
  });
  it("issues the same DDL as the manual migrations, without utf8mb4 for MySQL 5.5.0 tenants", async () => {
    database([{ Field: "id" }]);
    await service.get("a");
    const read = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
    const ddl = sqlCalls("CREATE")[0]![1] as string;
    expect(normalizeSql(ddl)).toBe(statements(read("20260922_001_telephony_webrtc_settings.sql"))[0]);
    expect(sqlCalls("ALTER").map(([, sql]) => normalizeSql(sql as string))).toEqual(statements(read("20260930_001_telephony_webrtc_gateway.sql")));
    expect(ddl).not.toMatch(/utf8mb4|CHARSET/i);
  });
  it("persists a normalized singleton with bound parameters in the requested tenant only", async () => {
    const rows = database();
    await expect(service.save("a", 7, { ...settings, websocketUrl: ` ${settings.websocketUrl} `, instance: "b" })).resolves.toEqual(settings);
    const insert = sqlCalls("INSERT")[0]!;
    expect(insert[1]).not.toContain("test-only"); expect(insert[2][6]).toBe(7);
    await expect(service.get("a")).resolves.toEqual(settings);
    await expect(service.get("b")).resolves.toMatchObject({ enabled: false, websocketUrl: "" });
    await service.save("a", 7, { ...settings, enabled: false });
    await expect(service.getEnabled("a")).rejects.toThrow("desabilitada");
    expect(rows.has("b")).toBe(false);
  });
  it("stores gateway mode with the normalized PBX address when the gateway is configured", async () => {
    for (const [key, value] of Object.entries(gatewayEnv)) vi.stubEnv(key, value);
    database();
    const gateway = { enabled: true, mode: "gateway", websocketUrl: "", domain: "", pbxAddress: "172.22.75.124", iceServers: [] };
    await expect(service.save("a", 7, gateway)).resolves.toMatchObject({ mode: "gateway", pbxAddress: "172.22.75.124:5060" });
    await expect(service.getEnabled("a")).resolves.toMatchObject({ mode: "gateway", pbxAddress: "172.22.75.124:5060" });
  });
  it("refuses gateway mode outside the allowed networks or without gateway configuration", async () => {
    database();
    const gateway = { enabled: true, mode: "gateway", websocketUrl: "", domain: "", pbxAddress: "172.22.75.124", iceServers: [] };
    await expect(service.save("a", 7, gateway)).rejects.toThrow("gateway de telefonia não está configurado");
    await expect(service.save("a", 7, { ...gateway, enabled: false })).resolves.toMatchObject({ enabled: false });
    for (const [key, value] of Object.entries(gatewayEnv)) vi.stubEnv(key, value);
    await expect(service.save("a", 7, { ...gateway, pbxAddress: "8.8.8.8" })).rejects.toThrow("fora das redes liberadas");
    expect(sqlCalls("INSERT")).toHaveLength(1);
  });
  it("rejects invalid settings before issuing SQL", async () => {
    await expect(service.save("a", 7, { ...settings, websocketUrl: "http://bad.test" })).rejects.toThrow();
    expect(mocks.executeQuery).not.toHaveBeenCalled();
  });
  it("preserves Unicode TURN credentials across the legacy latin1 query connection", async () => {
    const unicode = { ...settings, iceServers: [{ urls: ["turn:relay.test:3478"], username: "usuário", credential: "teste-🔑" }] };
    database();
    await service.save("a", 7, unicode);
    const serialized = sqlCalls("INSERT")[0]![2][5] as string;
    expect(serialized).toMatch(/^[\x00-\x7f]*$/);
    await expect(service.get("a")).resolves.toEqual(unicode);
  });
  it("reports table creation failures without secrets and retries creation on the next access", async () => {
    mocks.executeQuery.mockRejectedValue(new Error("SQL failed credential=test-secret"));
    const error = await service.save("a", 7, settings).catch((reason: Error) => reason);
    expect(error.message).toContain("preparar a tabela telephony_webrtc_settings");
    expect(error.message).not.toContain("test-secret");
    expect(sqlCalls("INSERT")).toHaveLength(0);
    database();
    await expect(service.get("a")).resolves.toMatchObject({ enabled: false });
    expect(sqlCalls("CREATE")).toHaveLength(2);
  });
  it("does not propagate database secrets or retry ambiguous writes", async () => {
    mocks.executeQuery.mockImplementation(async (_instance: string, sql: string) => {
      if (sql.startsWith("CREATE")) return {};
      if (sql.startsWith("SHOW COLUMNS")) return allColumns;
      throw new Error("SQL failed credential=test-secret");
    });
    await expect(service.save("a", 7, settings)).rejects.toThrow("Recarregue");
    expect(sqlCalls("INSERT")).toHaveLength(1);
    const error = await service.get("a").catch((reason: Error) => reason);
    expect(error.message).toContain("Não foi possível carregar a telefonia web");
    expect(error.message).not.toContain("test-secret");
  });
  it("rejects corrupt JSON without exposing its contents", async () => {
    mocks.executeQuery.mockImplementation(async (_instance: string, sql: string) => {
      if (sql.startsWith("SHOW COLUMNS")) return allColumns;
      if (sql.trim().startsWith("SELECT")) return [{ enabled: 1, websocket_url: settings.websocketUrl, sip_domain: settings.domain, ice_servers_json: "secret-invalid-json" }];
      return {};
    });
    await expect(service.get("a")).rejects.toThrow("A configuração ICE salva é inválida.");
  });
});
