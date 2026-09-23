import "express-async-errors";
import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ recoverSessionData: vi.fn(), getSipConfigByOperator: vi.fn(), get: vi.fn(), getEnabled: vi.fn(), save: vi.fn() }));
vi.mock("../src/services/auth.service", () => ({ default: { recoverSessionData: mocks.recoverSessionData } }));
vi.mock("../src/services/users.service", () => ({ default: { getSipConfigByOperator: mocks.getSipConfigByOperator } }));
vi.mock("../src/services/webrtc-settings.service", () => ({ default: { get: mocks.get, getEnabled: mocks.getEnabled, save: mocks.save } }));
import router from "../src/controllers/webrtc.controller";

afterEach(() => { vi.resetAllMocks(); });
async function request(path: string, token?: string, method = "GET", body?: unknown) {
  const app = express(); app.use(express.json()); app.use("/api", router);
  app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.status || 401).json({ error: "denied" }); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, {
      method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
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
