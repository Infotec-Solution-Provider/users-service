import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ executeQuery: vi.fn() }));
vi.mock("../src/services/instances.service", () => ({ default: mocks }));
type Service = typeof import("../src/services/webrtc-settings.service").default;
let service: Service;
const settings = { enabled: true, websocketUrl: "wss://pbx.example.test/ws", domain: "pbx.example.test", iceServers: [{ urls: ["turn:relay.test:3478"], username: "user", credential: "test-only" }] };
const sqlCalls = (prefix: string) => mocks.executeQuery.mock.calls.filter(([, sql]) => (sql as string).startsWith(prefix));
const normalizeSql = (sql: string) => sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").replace(/;\s*$/, "").trim();
beforeEach(async () => {
  // The table cache lives in the singleton; a fresh module keeps each test independent.
  vi.resetModules();
  service = (await import("../src/services/webrtc-settings.service")).default;
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
describe("tenant database WebRTC settings", () => {
  it("creates the table once per tenant and defaults to disabled without environment fallback", async () => {
    vi.stubEnv("TELEPHONY_WEBRTC_CONFIG", JSON.stringify({ a: settings }));
    mocks.executeQuery.mockResolvedValue([]);
    await expect(service.getEnabled("a")).rejects.toThrow("desabilitada");
    await expect(service.get("a")).resolves.toMatchObject({ enabled: false });
    await service.get("b");
    expect(sqlCalls("CREATE").map(([instance]) => instance)).toEqual(["a", "b"]);
    expect(sqlCalls("SELECT")).toHaveLength(3);
    expect(mocks.executeQuery.mock.calls[0]).toEqual(["a", expect.stringMatching(/^CREATE TABLE IF NOT EXISTS telephony_webrtc_settings /), []]);
  });
  it("issues the same DDL as the manual migration, without utf8mb4 for MySQL 5.5.0 tenants", async () => {
    mocks.executeQuery.mockResolvedValue([]);
    await service.get("a");
    const ddl = sqlCalls("CREATE")[0]![1] as string;
    const migration = readFileSync(new URL("../migrations/20260922_001_telephony_webrtc_settings.sql", import.meta.url), "utf8");
    expect(normalizeSql(ddl)).toBe(normalizeSql(migration));
    expect(ddl).not.toMatch(/utf8mb4|CHARSET/i);
  });
  it("persists a normalized singleton with bound parameters in the requested tenant only", async () => {
    const databases = new Map<string, unknown[]>();
    mocks.executeQuery.mockImplementation(async (instance: string, sql: string, args: unknown[]) => {
      if (sql.startsWith("INSERT")) {
        expect(sql).not.toContain("test-only"); expect(args[4]).toBe(7);
        databases.set(instance, [{ enabled: args[0], websocket_url: args[1], sip_domain: args[2], ice_servers_json: args[3] }]);
        return { affectedRows: 1 };
      }
      return databases.get(instance) || [];
    });
    await expect(service.save("a", 7, { ...settings, websocketUrl: ` ${settings.websocketUrl} `, instance: "b" })).resolves.toEqual(settings);
    await expect(service.get("a")).resolves.toEqual(settings);
    await expect(service.get("b")).resolves.toMatchObject({ enabled: false, websocketUrl: "" });
    await service.save("a", 7, { ...settings, enabled: false });
    await expect(service.getEnabled("a")).rejects.toThrow("desabilitada");
  });
  it("rejects invalid settings before issuing SQL", async () => {
    await expect(service.save("a", 7, { ...settings, websocketUrl: "http://bad.test" })).rejects.toThrow();
    expect(mocks.executeQuery).not.toHaveBeenCalled();
  });
  it("preserves Unicode TURN credentials across the legacy latin1 query connection", async () => {
    const unicode = { ...settings, iceServers: [{ urls: ["turn:relay.test:3478"], username: "usuário", credential: "teste-🔑" }] };
    mocks.executeQuery.mockResolvedValue({ affectedRows: 1 });
    await service.save("a", 7, unicode);
    const serialized = sqlCalls("INSERT")[0]![2][3] as string;
    expect(serialized).toMatch(/^[\x00-\x7f]*$/);
    mocks.executeQuery.mockResolvedValue([{ enabled: 1, websocket_url: settings.websocketUrl, sip_domain: settings.domain, ice_servers_json: serialized }]);
    await expect(service.get("a")).resolves.toEqual(unicode);
  });
  it("reports table creation failures without secrets and retries creation on the next access", async () => {
    mocks.executeQuery.mockRejectedValue(new Error("SQL failed credential=test-secret"));
    const error = await service.save("a", 7, settings).catch((reason: Error) => reason);
    expect(error.message).toContain("preparar a tabela telephony_webrtc_settings");
    expect(error.message).not.toContain("test-secret");
    expect(sqlCalls("INSERT")).toHaveLength(0);
    mocks.executeQuery.mockResolvedValue([]);
    await expect(service.get("a")).resolves.toMatchObject({ enabled: false });
    expect(sqlCalls("CREATE")).toHaveLength(2);
  });
  it("does not propagate database secrets or retry ambiguous writes", async () => {
    mocks.executeQuery.mockImplementation(async (_instance: string, sql: string) => {
      if (sql.startsWith("CREATE")) return {};
      throw new Error("SQL failed credential=test-secret");
    });
    await expect(service.save("a", 7, settings)).rejects.toThrow("Recarregue");
    expect(sqlCalls("INSERT")).toHaveLength(1);
    const error = await service.get("a").catch((reason: Error) => reason);
    expect(error.message).toContain("Não foi possível carregar a telefonia web");
    expect(error.message).not.toContain("test-secret");
  });
  it("rejects corrupt JSON without exposing its contents", async () => {
    mocks.executeQuery.mockResolvedValue([{ enabled: 1, websocket_url: settings.websocketUrl, sip_domain: settings.domain, ice_servers_json: "secret-invalid-json" }]);
    await expect(service.get("a")).rejects.toThrow("A configuração ICE salva é inválida.");
  });
});
