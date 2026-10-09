import { Router } from "express";
import isAuthenticated from "../middlewares/is-authenticated.middleware";
import isAdmin from "../middlewares/is-admin.middleware";
import crmParameterSettingsService from "../services/crm-parameter-settings.service";

const router = Router();
router.get(
  "/crm/parameter-settings",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      data: await crmParameterSettingsService.get(req.session.instance),
    });
  },
);
router.patch(
  "/crm/parameter-settings",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      data: await crmParameterSettingsService.save(
        req.session.instance,
        req.body,
      ),
    });
  },
);
export default router;
