import { Router, type Request, type Response, type NextFunction } from "express";
import isAuthenticated from "../middlewares/is-authenticated.middleware";
import service, { CrmCatalogsService } from "../services/crm-catalogs/catalogs.service";
import { CatalogError, catalogs } from "../services/crm-catalogs/contract";
import salesTypes from "../services/crm-catalogs/sales-types.service";
import { crmTenantAuthentication } from "../middlewares/crm-tenant-scope.middleware";

export function createCrmCatalogsRouter(catalogService: CrmCatalogsService = service, authenticator = isAuthenticated) {
  const router = Router();
  const authenticate = crmTenantAuthentication(authenticator);
  router.use("/crm", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  for (const name of Object.keys(catalogs)) {
    const path = `/crm/${name}`;
    router.get(path, authenticate, async (req, res) => res.json(await catalogService.list(req.session, name, req.query)));
    router.get(`${path}/:id`, authenticate, async (req, res) => res.json({ data: await catalogService.detail(req.session, name, req.params["id"], req.query) }));
    router.post(path, authenticate, async (req, res) => res.status(201).json({ data: await catalogService.create(req.session, name, req.body, req.query) }));
    router.patch(`${path}/:id`, authenticate, async (req, res) => res.json({ data: await catalogService.patch(req.session, name, req.params["id"], req.body, req.query) }));
    router.delete(`${path}/:id`, authenticate, async (req, res) => { await catalogService.delete(req.session, name, req.params["id"], req.body, req.query); res.status(204).end(); });
  }
  router.get("/crm/user-groups/:id/members", authenticate, async (req, res) => res.json({ data: await catalogService.members(req.session, req.params["id"], req.query) }));
  router.post("/crm/user-groups/:id/members", authenticate, async (req, res) => res.status(201).json({ data: await catalogService.addMember(req.session, req.params["id"], req.body, req.query) }));
  router.delete("/crm/user-groups/:groupId/members/:id", authenticate, async (req, res) => { await catalogService.removeMember(req.session, req.params["groupId"], req.params["id"], req.body, req.query); res.status(204).end(); });
  router.patch("/crm/users/:id/shift", authenticate, async (req, res) => res.json({ data: await catalogService.setShift(req.session, req.params["id"], req.body, req.query) }));
  router.get("/crm/sales-types", authenticate, async (req, res) => res.json(await salesTypes.list(req.session, req.query)));
  router.get("/crm/sales-types/:id", authenticate, async (req, res) => res.json({ data: await salesTypes.detail(req.session, req.params["id"], req.query) }));
  router.post("/crm/sales-types", authenticate, async (req, res) => res.status(201).json({ data: await salesTypes.create(req.session, req.body, req.query) }));
  router.patch("/crm/sales-types/:id", authenticate, async (req, res) => res.json({ data: await salesTypes.patch(req.session, req.params["id"], req.body, req.query) }));
  router.delete("/crm/sales-types/:id", authenticate, async (req, res) => { await salesTypes.delete(req.session, req.params["id"], req.body, req.query); res.status(204).end(); });
  router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (!(error instanceof CatalogError)) return next(error);
    return res.status(error.status).json({ message: error.message, code: error.code, ...(error.outcome ? { outcome: error.outcome } : {}) });
  });
  return router;
}
export default createCrmCatalogsRouter();
