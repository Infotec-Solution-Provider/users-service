import type { RequestHandler } from "express";
import isAuthenticated from "./is-authenticated.middleware";
/** A context hint can only reject a request; the verified session always selects the tenant. */
export function crmTenantAuthentication(authenticate: RequestHandler = isAuthenticated): RequestHandler {
  return async (req, res, next) => {
    try {
      await authenticate(req, res, error => {
        if (error) { res.status(401).json({ code: "CRM_UNAUTHENTICATED", message: "Sessão inválida." }); return; }
        const hint = req.headers["x-crm-instance"];
        if (hint !== undefined && (typeof hint !== "string" || hint !== req.session?.instance)) {
          res.status(409).json({ code: "CRM_TENANT_CHANGED", message: "A empresa da sessão mudou. Reabra o cadastro antes de continuar." }); return;
        }
        next();
      });
    } catch { res.status(401).json({ code: "CRM_UNAUTHENTICATED", message: "Sessão inválida." }); }
  };
}
