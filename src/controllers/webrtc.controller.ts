import { Router } from "express";
import isAuthenticated from "../middlewares/is-authenticated.middleware";
import isAdmin from "../middlewares/is-admin.middleware";
import usersService from "../services/users.service";
import { buildWebrtcConfig } from "../services/webrtc-config";
import webrtcSettingsService from "../services/webrtc-settings.service";

const router = Router();

router.get("/telephony/webrtc-config", isAuthenticated, async (req, res) => {
  // Identity is exclusively from the authenticated session, never query/body/path.
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Pragma", "no-cache");
  const config = await webrtcSettingsService.getEnabled(req.session.instance);
  const sip = await usersService.getSipConfigByOperator(req.session.instance, req.session.userId);
  res.status(200).json({ data: buildWebrtcConfig(config, sip) });
});

router.get("/telephony/webrtc-settings", isAuthenticated, isAdmin, async (req, res) => {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Pragma", "no-cache");
  res.status(200).json({ data: await webrtcSettingsService.get(req.session.instance) });
});

router.put("/telephony/webrtc-settings", isAuthenticated, isAdmin, async (req, res) => {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Pragma", "no-cache");
  const data = await webrtcSettingsService.save(req.session.instance, req.session.userId, req.body);
  res.status(200).json({ data });
});

export default router;
