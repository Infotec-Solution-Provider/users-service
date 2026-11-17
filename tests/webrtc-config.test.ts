import { describe, expect, it } from "vitest";
import { buildWebrtcConfig, emptyWebrtcSettings, resolveSipIdentity, validateWebrtcSettings } from "../src/services/webrtc-config";
import type { SipConfig } from "../src/types/sip-config.type";

const tenant = { enabled: true, websocketUrl: "wss://pbx.example.test/ws", domain: "pbx.example.test", iceServers: [] };
const sip: SipConfig = { COD_CONFIG_SIP: 1, COD_OPERADOR: 7, RAMAL_SIP: "101", LOGIN_SIP: "auth101", SENHA_SIP: " test-only ", USRID_SIP: null, IP_SERVIDOR_SIP: null, CODECS_SIP: null, CFG_CONFIG_SIP: null };
describe("WebRTC configuration", () => {
  it("projects only required operator credentials and preserves the password", () => {
    const { websocketUrl, domain, iceServers } = validateWebrtcSettings(tenant);
    expect(buildWebrtcConfig({ websocketUrl, domain, iceServers }, sip)).toEqual({ websocketUrl, domain, iceServers, uri: "sip:101@pbx.example.test", extension: "101", authorizationUser: "auth101", password: " test-only " });
  });
  it("treats settings without a mode as direct connections", () => {
    expect(validateWebrtcSettings(tenant)).toMatchObject({ mode: "direct", pbxAddress: "" });
    expect(() => validateWebrtcSettings({ ...tenant, mode: "proxy" })).toThrow("Modo de conexão");
  });
  it("requires only the PBX address in gateway mode and normalizes it", () => {
    const gateway = { enabled: true, mode: "gateway", websocketUrl: "", domain: "", pbxAddress: " 172.22.75.124 ", iceServers: [] };
    expect(validateWebrtcSettings(gateway)).toMatchObject({ mode: "gateway", pbxAddress: "172.22.75.124:5060", websocketUrl: "" });
    expect(() => validateWebrtcSettings({ ...gateway, pbxAddress: "" })).toThrow("endereço SIP da central");
    expect(() => validateWebrtcSettings({ ...gateway, pbxAddress: "pbx.example.test" })).toThrow("Endereço da central inválido");
    expect(validateWebrtcSettings({ ...gateway, enabled: false, pbxAddress: "" })).toMatchObject({ enabled: false, pbxAddress: "" });
    expect(() => validateWebrtcSettings({ ...gateway, websocketUrl: "ws://leftover.test" })).toThrow();
  });
  it("allows an unconfigured tenant only when disabled", () => {
    expect(validateWebrtcSettings(emptyWebrtcSettings())).toEqual(emptyWebrtcSettings());
    expect(() => validateWebrtcSettings({ ...emptyWebrtcSettings(), enabled: true })).toThrow();
    expect(() => validateWebrtcSettings({ ...tenant, enabled: "false" })).toThrow();
  });
  it.each(["ws://pbx.example.test/ws", "https://pbx.example.test/ws", "wss://user:secret@pbx.example.test/ws", "wss://pbx.example.test/ws?secret=test"])("rejects unsafe transport %s", websocketUrl => {
    expect(() => validateWebrtcSettings({ ...tenant, websocketUrl })).toThrow();
  });
  it("validates ICE configuration without reflecting secrets in errors", () => {
    const config = validateWebrtcSettings({ ...tenant, iceServers: [{ urls: "turn:relay.example.test:3478", username: "user", credential: "test" }] });
    expect(config.iceServers[0]?.urls).toEqual(["turn:relay.example.test:3478"]);
    expect(() => validateWebrtcSettings({ ...tenant, iceServers: [{ urls: "https://SECRET" }] })).toThrow("Endereço ICE inválido.");
    expect(() => validateWebrtcSettings({ ...tenant, iceServers: [{ urls: "turn:relay.test", credential: "x".repeat(33000) }] })).toThrow();
  });
  it("resolves the SIP identity used in the URI and in the gateway token", () => {
    expect(resolveSipIdentity({ ...sip, USRID_SIP: "usr101" })).toEqual({ extension: "101", authorizationUser: "auth101", sipUser: "usr101", password: " test-only " });
    expect(resolveSipIdentity({ ...sip, LOGIN_SIP: null })).toMatchObject({ authorizationUser: "101", sipUser: "101" });
  });
  it("requires configured operator credentials", () => {
    expect(() => buildWebrtcConfig(tenant, null)).toThrow();
    expect(() => buildWebrtcConfig(tenant, { ...sip, SENHA_SIP: null })).toThrow();
    expect(() => buildWebrtcConfig(tenant, { ...sip, USRID_SIP: "101@other.test" })).toThrow();
  });
});
