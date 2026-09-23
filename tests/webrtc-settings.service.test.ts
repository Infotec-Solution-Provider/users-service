import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ executeQuery: vi.fn() }));
vi.mock("../src/services/instances.service", () => ({ default: mocks }));
import service from "../src/services/webrtc-settings.service";
const settings = { enabled: true, websocketUrl: "wss://pbx.example.test/ws", domain: "pbx.example.test", iceServers: [{ urls: ["turn:relay.test:3478"], username: "user", credential: "test-only" }] };
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
describe("tenant database WebRTC settings", () => {
  it("defaults to disabled without falling back to environment configuration or creating tables", async () => {
    vi.stubEnv("TELEPHONY_WEBRTC_CONFIG", JSON.stringify({ a: settings }));
    mocks.executeQuery.mockResolvedValue([]);
    await expect(service.getEnabled("a")).rejects.toThrow("desabilitada");
    expect(mocks.executeQuery).toHaveBeenCalledExactlyOnceWith("a", expect.stringMatching(/^SELECT /), []);
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
    const serialized = mocks.executeQuery.mock.calls[0]![2][3] as string;
    expect(serialized).toMatch(/^[\x00-\x7f]*$/);
    mocks.executeQuery.mockResolvedValue([{ enabled: 1, websocket_url: settings.websocketUrl, sip_domain: settings.domain, ice_servers_json: serialized }]);
    await expect(service.get("a")).resolves.toEqual(unicode);
  });
  it("does not propagate database secrets or retry ambiguous writes", async () => {
    mocks.executeQuery.mockRejectedValue(new Error("SQL failed credential=test-secret"));
    await expect(service.save("a", 7, settings)).rejects.toThrow("Recarregue");
    expect(mocks.executeQuery).toHaveBeenCalledTimes(1);
    await expect(service.get("a")).rejects.toThrow("migração telephony_webrtc_settings");
  });
  it("rejects corrupt JSON without exposing its contents", async () => {
    mocks.executeQuery.mockResolvedValue([{ enabled: 1, websocket_url: settings.websocketUrl, sip_domain: settings.domain, ice_servers_json: "secret-invalid-json" }]);
    await expect(service.get("a")).rejects.toThrow("A configuração ICE salva é inválida.");
  });
});
