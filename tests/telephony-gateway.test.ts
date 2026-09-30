import { describe, expect, it } from "vitest";
import {
  gatewayWebsocketUrl, isGatewayKeyValid, isPbxAllowed, issueGatewayToken, parsePbxAddress, pbxSipDomain,
  readGatewayEnvironment, verifyGatewayToken,
} from "../src/services/telephony-gateway";

const env = {
  TELEPHONY_GATEWAY_WSS_URL: "wss://gateway.example.test/telephony-gw",
  TELEPHONY_GATEWAY_TOKEN_SECRET: "t".repeat(40),
  TELEPHONY_GATEWAY_API_KEY: "k".repeat(40),
  TELEPHONY_GATEWAY_ALLOWED_NETWORKS: "172.22.0.0/16, 10.1.2.3",
};
const claims = { instance: "tenant-a", userId: 7, sipUser: "4003", host: "172.22.75.124", port: 5060 };

describe("telephony gateway", () => {
  it("parses only IPv4 PBX addresses and defaults the SIP port", () => {
    expect(parsePbxAddress("172.22.75.124")).toEqual({ host: "172.22.75.124", port: 5060 });
    expect(parsePbxAddress(" 172.22.75.124:5080 ")).toEqual({ host: "172.22.75.124", port: 5080 });
    for (const invalid of ["pbx.example.test", "172.22.75", "172.22.75.256", "172.22.075.1", "172.22.75.1:0", "172.22.75.1:70000", "[::1]:5060", ""]) {
      expect(parsePbxAddress(invalid)).toBeNull();
    }
    expect(pbxSipDomain({ host: "172.22.75.124", port: 5060 })).toBe("172.22.75.124");
    expect(pbxSipDomain({ host: "172.22.75.124", port: 5080 })).toBe("172.22.75.124:5080");
  });
  it("restricts PBX destinations to the configured networks", () => {
    const { allowedNetworks } = readGatewayEnvironment(env)!;
    expect(isPbxAllowed({ host: "172.22.75.124", port: 5060 }, allowedNetworks)).toBe(true);
    expect(isPbxAllowed({ host: "10.1.2.3", port: 5060 }, allowedNetworks)).toBe(true);
    expect(isPbxAllowed({ host: "10.1.2.4", port: 5060 }, allowedNetworks)).toBe(false);
    expect(isPbxAllowed({ host: "172.23.0.1", port: 5060 }, allowedNetworks)).toBe(false);
    expect(isPbxAllowed({ host: "8.8.8.8", port: 5060 }, allowedNetworks)).toBe(false);
  });
  it("stays unavailable unless every setting is present and safe", () => {
    expect(readGatewayEnvironment({})).toBeNull();
    expect(readGatewayEnvironment({ ...env, TELEPHONY_GATEWAY_TOKEN_SECRET: "short" })).toBeNull();
    expect(readGatewayEnvironment({ ...env, TELEPHONY_GATEWAY_API_KEY: "" })).toBeNull();
    expect(readGatewayEnvironment({ ...env, TELEPHONY_GATEWAY_WSS_URL: "ws://gateway.example.test/telephony-gw" })).toBeNull();
    expect(readGatewayEnvironment({ ...env, TELEPHONY_GATEWAY_WSS_URL: "wss://gateway.example.test/?token=x" })).toBeNull();
    expect(readGatewayEnvironment({ ...env, TELEPHONY_GATEWAY_ALLOWED_NETWORKS: "" })).toBeNull();
    expect(readGatewayEnvironment({ ...env, TELEPHONY_GATEWAY_ALLOWED_NETWORKS: "0.0.0.0/0" })).toBeNull();
    expect(readGatewayEnvironment({ ...env, TELEPHONY_GATEWAY_ALLOWED_NETWORKS: "172.22.0.0/16,invalid" })).toBeNull();
    expect(readGatewayEnvironment(env)?.tokenTtlSeconds).toBe(12 * 60 * 60);
  });
  it("issues signed tokens bound to tenant, operator, extension and PBX", () => {
    const environment = readGatewayEnvironment(env)!;
    const token = issueGatewayToken(environment, claims);
    expect(verifyGatewayToken(environment, token)).toEqual(claims);
    expect(verifyGatewayToken(readGatewayEnvironment({ ...env, TELEPHONY_GATEWAY_TOKEN_SECRET: "o".repeat(40) })!, token)).toBeNull();
    expect(verifyGatewayToken(environment, `${token}x`)).toBeNull();
    const url = new URL(gatewayWebsocketUrl(environment, token));
    expect(url.origin + url.pathname).toBe(env.TELEPHONY_GATEWAY_WSS_URL);
    expect(url.searchParams.get("token")).toBe(token);
  });
  it("rejects expired tokens", () => {
    const environment = { ...readGatewayEnvironment(env)!, tokenTtlSeconds: -1 };
    expect(verifyGatewayToken(environment, issueGatewayToken(environment, claims))).toBeNull();
  });
  it("compares the gateway key without accepting other values", () => {
    const environment = readGatewayEnvironment(env)!;
    expect(isGatewayKeyValid(environment, env.TELEPHONY_GATEWAY_API_KEY)).toBe(true);
    expect(isGatewayKeyValid(environment, "k".repeat(39))).toBe(false);
    expect(isGatewayKeyValid(environment, undefined)).toBe(false);
  });
});
