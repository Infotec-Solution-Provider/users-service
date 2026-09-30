import "express-async-errors";
import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ recoverSessionData: vi.fn(), getSipConfigByOperator: vi.fn(), get: vi.fn(), getEnabled: vi.fn(), save: vi.fn() }));
vi.mock("../src/services/auth.service", () => ({ default: { recoverSessionData: mocks.recoverSessionData } }));
vi.mock("../src/services/users.service", () => ({ default: { getSipConfigByOperator: mocks.getSipConfigByOperator } }));
vi.mock("../src/services/webrtc-settings.service", () => ({ default: { get: mocks.get, getEnabled: mocks.getEnabled, save: mocks.save } }));
import router from "../src/controllers/webrtc.controller";

afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
const gatewayEnv = {
  TELEPHONY_GATEWAY_WSS_URL: "wss://gateway.example.test/telephony-gw",
  TELEPHONY_GATEWAY_TOKEN_SECRET: "t".repeat(40),
  TELEPHONY_GATEWAY_API_KEY: "k".repeat(40),
  TELEPHONY_GATEWAY_ALLOWED_NETWORKS: "172.22.0.0/16",
};
const gatewaySettings = { enabled: true, mode: "gateway", websocketUrl: "", domain: "", pbxAddress: "172.22.75.124:5060", iceServers: [] };
const operatorSip = { RAMAL_SIP: "4003", LOGIN_SIP: "4003", SENHA_SIP: "test-only", USRID_SIP: null };
function stubGateway() { for (const [key, value] of Object.entries(gatewayEnv)) vi.stubEnv(key, value); }
async function gatewayToken() {
  stubGateway();
  mocks.recoverSessionData.mockResolvedValue({ instance: "tenant-a", userId: 7, role: "USER" });
  mocks.getEnabled.mockResolvedValue(gatewaySettings);
  mocks.getSipConfigByOperator.mockResolvedValue(operatorSip);
  const response = await request("/api/telephony/webrtc-config", "test-token");
  return new URL(response.body.data.websocketUrl).searchParams.get("token")!;
}
async function request(path: string, token?: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  const app = express(); app.use(express.json()); app.use("/api", router);
  app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.status || 401).json({ error: "denied" }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, {
      method, headers: { "Content-Type": "application/json", ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = response.headers.get("content-type")?.includes("json");
    return { status: response.status, cache: response.headers.get("cache-control"), body: json ? await response.json() : await response.text() };
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
describe("own WebRTC credentials endpoint", () => {
  it("requires authentication before reading credentials", async () => {
    expect((await request("/api/telephony/webrtc-config")).status).toBe(401);
    expect(mocks.getEnabled).not.toHaveBeenCalled();
    expect(mocks.getSipConfigByOperator).not.toHaveBeenCalled();
  });
  it("ignores supplied tenant/user IDs and disables caching for an ordinary operator", async () => {
    mocks.getEnabled.mockResolvedValue({ websocketUrl: "wss://pbx.example.test/ws", domain: "pbx.example.test", iceServers: [] });
    mocks.recoverSessionData.mockResolvedValue({ instance: "tenant-a", userId: 7, role: "USER" });
    mocks.getSipConfigByOperator.mockResolvedValue({ RAMAL_SIP: "101", LOGIN_SIP: "101", SENHA_SIP: "test-only", USRID_SIP: null, SENHA_TELNET: "never-return" });
    const response = await request("/api/telephony/webrtc-config?instance=tenant-b&userId=999", "test-token");
    expect(response.status).toBe(200); expect(response.cache).toContain("no-store");
    expect(mocks.getEnabled).toHaveBeenCalledExactlyOnceWith("tenant-a");
    expect(mocks.getSipConfigByOperator).toHaveBeenCalledExactlyOnceWith("tenant-a", 7);
    expect(response.body.data.authorizationUser).toBe("101");
    expect(JSON.stringify(response.body)).not.toContain("never-return");
  });
  it("does not read an operator when WebRTC is disabled", async () => {
    mocks.getEnabled.mockRejectedValue(new Error("disabled"));
    mocks.recoverSessionData.mockResolvedValue({ instance: "tenant-a", userId: 7, role: "USER" });
    await request("/api/telephony/webrtc-config", "test-token");
    expect(mocks.getSipConfigByOperator).not.toHaveBeenCalled();
  });
});
describe("administrative WebRTC settings", () => {
  it.each(["GET", "PUT"])("rejects unauthenticated %s", async method => {
    expect((await request("/api/telephony/webrtc-settings", undefined, method, method === "PUT" ? {} : undefined)).status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each(["GET", "PUT"])("rejects non-admin %s", async method => {
    mocks.recoverSessionData.mockResolvedValue({ instance: "tenant-a", userId: 7, role: "USER" });
    expect((await request("/api/telephony/webrtc-settings", "test", method, method === "PUT" ? {} : undefined)).status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("reads only the authenticated admin's tenant without caching", async () => {
    mocks.recoverSessionData.mockResolvedValue({ instance: "tenant-a", userId: 7, role: "ADMIN" });
    mocks.get.mockResolvedValue({ enabled: false });
    const result = await request("/api/telephony/webrtc-settings?instance=tenant-b", "test");
    expect(result.status).toBe(200); expect(result.cache).toContain("no-store");
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith("tenant-a");
  });
  it("uses session identity for saving even when the body supplies other IDs", async () => {
    mocks.recoverSessionData.mockResolvedValue({ instance: "tenant-a", userId: 7, role: "ADMIN" });
    const payload = { instance: "tenant-b", userId: 999, enabled: false };
    mocks.save.mockResolvedValue({ enabled: false });
    const result = await request("/api/telephony/webrtc-settings", "test", "PUT", payload);
    expect(result.status).toBe(200); expect(result.cache).toContain("no-store");
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith("tenant-a", 7, payload);
  });
});
describe("gateway mode", () => {
  it("hands the browser the gateway URL with a signed token and the PBX as SIP domain", async () => {
    stubGateway();
    mocks.recoverSessionData.mockResolvedValue({ instance: "tenant-a", userId: 7, role: "USER" });
    mocks.getEnabled.mockResolvedValue(gatewaySettings);
    mocks.getSipConfigByOperator.mockResolvedValue(operatorSip);
    const { status, body } = await request("/api/telephony/webrtc-config", "test-token");
    expect(status).toBe(200);
    const url = new URL(body.data.websocketUrl);
    expect(url.origin + url.pathname).toBe(gatewayEnv.TELEPHONY_GATEWAY_WSS_URL);
    expect(url.searchParams.get("token")).toBeTruthy();
    expect(body.data).toMatchObject({ domain: "172.22.75.124", uri: "sip:4003@172.22.75.124", authorizationUser: "4003" });
    expect(JSON.stringify(body)).not.toContain(gatewayEnv.TELEPHONY_GATEWAY_TOKEN_SECRET);
  });
  it("fails closed when the gateway is not configured on the server", async () => {
    mocks.recoverSessionData.mockResolvedValue({ instance: "tenant-a", userId: 7, role: "USER" });
    mocks.getEnabled.mockResolvedValue(gatewaySettings);
    mocks.getSipConfigByOperator.mockResolvedValue(operatorSip);
    expect((await request("/api/telephony/webrtc-config", "test-token")).status).toBe(500);
  });
  it("reports gateway availability to administrators", async () => {
    mocks.recoverSessionData.mockResolvedValue({ instance: "tenant-a", userId: 7, role: "ADMIN" });
    mocks.get.mockResolvedValue(gatewaySettings);
    expect((await request("/api/telephony/webrtc-settings", "test")).body.data.gatewayAvailable).toBe(false);
    stubGateway();
    expect((await request("/api/telephony/webrtc-settings", "test")).body.data.gatewayAvailable).toBe(true);
  });
});
describe("gateway authorization endpoint", () => {
  const authorize = (token: string, key = gatewayEnv.TELEPHONY_GATEWAY_API_KEY) =>
    request(`/api/telephony/gateway/authorize?token=${encodeURIComponent(token)}`, undefined, "GET", undefined, { "X-Telephony-Gateway-Key": key });
  it("binds a valid token to its extension and PBX", async () => {
    const token = await gatewayToken();
    mocks.get.mockResolvedValue(gatewaySettings);
    const response = await authorize(token);
    expect(response).toMatchObject({ status: 200, body: "4003:172.22.75.124:5060" });
    expect(response.cache).toContain("no-store");
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith("tenant-a");
  });
  it("requires the gateway key before looking at the token", async () => {
    const token = await gatewayToken();
    expect((await authorize(token, "k".repeat(39) + "x")).status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("rejects forged tokens", async () => {
    await gatewayToken();
    expect((await authorize("not-a-token")).status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each([
    ["disabled", { ...gatewaySettings, enabled: false }],
    ["switched to direct", { ...gatewaySettings, mode: "direct" }],
    ["moved to another PBX", { ...gatewaySettings, pbxAddress: "172.22.75.125:5060" }],
  ])("rejects tokens after the tenant was %s", async (_label, settings) => {
    const token = await gatewayToken();
    mocks.get.mockResolvedValue(settings);
    expect((await authorize(token)).status).toBe(403);
  });
  it("answers unavailable when the tenant database cannot be read", async () => {
    const token = await gatewayToken();
    mocks.get.mockRejectedValue(new Error("db down"));
    expect((await authorize(token)).status).toBe(503);
  });
});
