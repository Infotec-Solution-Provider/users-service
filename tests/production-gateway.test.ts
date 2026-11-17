import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isGatewayPrincipalAllowed, readGatewayFile, issueGatewayToken, verifyGatewayToken } from "../src/services/telephony-gateway";

describe("private production gateway configuration", () => {
  function config() { return { version: 1, websocketUrl: "wss://lux.infotecrs.inf.br/telephony-gw", tokenSecret: "a".repeat(64), apiKey: "b".repeat(64), allowedNetworks: ["131.161.3.106/32"], tokenTtlSeconds: 900, principals: [{ instance: "odim", userId: 534 }] }; }
  it("restricts the integration to the configured tenant and operator", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "odim-gateway-")), file = path.join(root, "gateway.json");
    try {
      fs.writeFileSync(file, JSON.stringify(config()), { mode: 0o600 });
      const value = readGatewayFile(file)!;
      expect(value).not.toBeNull();
      expect(isGatewayPrincipalAllowed(value, { instance: "odim", userId: 534 })).toBe(true);
      for (const principal of [{ instance: "odim", userId: 6 }, { instance: "odim", userId: 535 }, { instance: "suprimaxxi", userId: 534 }]) expect(isGatewayPrincipalAllowed(value, principal)).toBe(false);
      const claims = { instance: "odim", userId: 534, sipUser: "2710", host: "131.161.3.106", port: 5060 };
      expect(verifyGatewayToken(value, issueGatewayToken(value, claims))).toEqual(claims);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it("rejects malformed and symlink configuration without exposing secrets", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "odim-gateway-")), file = path.join(root, "gateway.json");
    try {
      for (const data of ["{broken", JSON.stringify({ ...config(), principals: [] }), JSON.stringify({ ...config(), allowedNetworks: ["0.0.0.0/0"] }), JSON.stringify({ ...config(), websocketUrl: "ws://public.example.test" })]) { fs.writeFileSync(file, data, { mode: 0o600 }); expect(readGatewayFile(file)).toBeNull(); }
      if (process.platform !== "win32") { fs.writeFileSync(file, JSON.stringify(config())); fs.chmodSync(file, 0o644); expect(readGatewayFile(file)).toBeNull(); fs.chmodSync(file, 0o600); const link = file + ".link"; fs.symlinkSync(file, link); expect(readGatewayFile(link)).toBeNull(); }
      expect(readGatewayFile(path.join(root, "absent.json"))).toBeNull();
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
