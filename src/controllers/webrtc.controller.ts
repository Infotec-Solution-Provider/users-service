import { InternalServerError } from "@rgranatodutra/http-errors";
import { Response, Router } from "express";
import isAuthenticated from "../middlewares/is-authenticated.middleware";
import isAdmin from "../middlewares/is-admin.middleware";
import usersService from "../services/users.service";
import {
  gatewayWebsocketUrl, isGatewayKeyValid, isPbxAllowed, issueGatewayToken, parsePbxAddress, pbxSipDomain,
  readGatewayEnvironment, verifyGatewayToken,
} from "../services/telephony-gateway";
import { buildWebrtcConfig, resolveSipIdentity, WebrtcSettings, WebrtcTenantConfig } from "../services/webrtc-config";
import webrtcSettingsService from "../services/webrtc-settings.service";

const router = Router();

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Pragma", "no-cache");
}

function gatewayConnection(settings: WebrtcSettings, instance: string, userId: number, sipUser: string): WebrtcTenantConfig {
  const environment = readGatewayEnvironment();
  const address = parsePbxAddress(settings.pbxAddress);
  if (!environment || !address || !isPbxAllowed(address, environment.allowedNetworks)) {
    throw new InternalServerError("O gateway de telefonia não está disponível para esta instância. Contate o responsável pelo sistema.");
  }
  const token = issueGatewayToken(environment, { instance, userId, sipUser, ...address });
  return { websocketUrl: gatewayWebsocketUrl(environment, token), domain: pbxSipDomain(address), iceServers: settings.iceServers };
}

router.get("/telephony/webrtc-config", isAuthenticated, async (req, res) => {
  // Identity is exclusively from the authenticated session, never query/body/path.
  noStore(res);
  const { instance, userId } = req.session;
  const settings = await webrtcSettingsService.getEnabled(instance);
  const sip = await usersService.getSipConfigByOperator(instance, userId);
  const connection = settings.mode === "gateway"
    ? gatewayConnection(settings, instance, userId, resolveSipIdentity(sip).sipUser)
    : { websocketUrl: settings.websocketUrl, domain: settings.domain, iceServers: settings.iceServers };
  res.status(200).json({ data: buildWebrtcConfig(connection, sip) });
});

router.get("/telephony/webrtc-settings", isAuthenticated, isAdmin, async (req, res) => {
  noStore(res);
  const settings = await webrtcSettingsService.get(req.session.instance);
  res.status(200).json({ data: { ...settings, gatewayAvailable: readGatewayEnvironment() !== null } });
});

router.put("/telephony/webrtc-settings", isAuthenticated, isAdmin, async (req, res) => {
  noStore(res);
  const data = await webrtcSettingsService.save(req.session.instance, req.session.userId, req.body);
  res.status(200).json({ data: { ...data, gatewayAvailable: readGatewayEnvironment() !== null } });
});

/**
 * Called by the Kamailio gateway during the WebSocket handshake (see deploy/telephony-gateway).
 * Answers "sipUser:host:port" as plain text so the gateway binds the connection to one extension and one PBX.
 * The tenant settings are read again, so disabling the tenant or changing its PBX invalidates older tokens.
 */
router.get("/telephony/gateway/authorize", async (req, res) => {
  noStore(res);
  res.type("text/plain");
  const environment = readGatewayEnvironment();
  if (!environment || !isGatewayKeyValid(environment, req.header("x-telephony-gateway-key"))) {
    return res.status(403).send("denied");
  }
  const token = typeof req.query["token"] === "string" ? req.query["token"] : "";
  const claims = token ? verifyGatewayToken(environment, token) : null;
  if (!claims || !isPbxAllowed(claims, environment.allowedNetworks)) return res.status(403).send("denied");
  let settings: WebrtcSettings;
  try {
    settings = await webrtcSettingsService.get(claims.instance);
  } catch {
    return res.status(503).send("unavailable");
  }
  const current = parsePbxAddress(settings.pbxAddress);
  if (!settings.enabled || settings.mode !== "gateway" || current?.host !== claims.host || current.port !== claims.port) {
    return res.status(403).send("denied");
  }
  return res.status(200).send(`${claims.sipUser}:${claims.host}:${claims.port}`);
});

export default router;
