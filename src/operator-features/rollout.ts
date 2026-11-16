import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export type OperatorFeature = "operator" | "telephony" | "crm" | "whatsapp";
export interface FeaturePrincipal { instance: string; userId: number }
export interface FeaturePolicy { allowedOperatorIds: number[]; effectiveAt: string; features: Record<OperatorFeature, boolean>; revision: string }
export const operatorFeatureProfilePath = path.resolve(__dirname, "../../operator-feature-rollout.json");
export class OperatorFeatureError extends Error {
  readonly outcome = "NOT_COMMITTED";
  constructor(readonly code = "OPERATOR_FEATURE_PILOT_REQUIRED", readonly status = 403) { super(code === "OPERATOR_FEATURE_PILOT_REQUIRED" ? "Recurso disponível somente para o operador autorizado no piloto." : "Não foi possível conferir a liberação deste recurso."); }
}
const tenant = (value: unknown): string => {
  if (typeof value !== "string") throw new OperatorFeatureError("OPERATOR_FEATURE_POLICY_UNAVAILABLE", 503);
  return value.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").trim().toLowerCase();
};
export function readOperatorFeaturePolicy(file = operatorFeatureProfilePath): FeaturePolicy {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192 || (process.platform !== "win32" && (stat.mode & 0o022) !== 0)) throw Error();
    const raw = fs.readFileSync(file), value = JSON.parse(raw.toString()) as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "allowedOperatorIds,effectiveAt,features,instance,version" || value["version"] !== 1 || value["instance"] !== "odim" || !Array.isArray(value["allowedOperatorIds"]) || value["allowedOperatorIds"].length !== 1 || value["allowedOperatorIds"][0] !== 534) throw Error();
    const effectiveAt = value["effectiveAt"];
    if (typeof effectiveAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(effectiveAt) || !Number.isFinite(Date.parse(effectiveAt)) || new Date(effectiveAt).toISOString() !== effectiveAt) throw Error();
    const features = value["features"] as Record<string, unknown>;
    if (!features || typeof features !== "object" || Array.isArray(features) || Object.keys(features).sort().join(",") !== "crm,operator,telephony,whatsapp" || ["operator","telephony","crm","whatsapp"].some(key => typeof features[key] !== "boolean")) throw Error();
    return { allowedOperatorIds: [534], effectiveAt, features: features as Record<OperatorFeature, boolean>, revision: createHash("sha256").update(raw).digest("hex") };
  } catch { throw new OperatorFeatureError("OPERATOR_FEATURE_POLICY_UNAVAILABLE", 503); }
}
export function operatorFeatures(principal: FeaturePrincipal, readPolicy: () => FeaturePolicy = readOperatorFeaturePolicy) {
  const instance = tenant(principal.instance);
  if (instance !== "odim") return { managed: false as const, instance, operatorId: principal.userId, features: { operator: null, telephony: null, crm: null, whatsapp: null }, revision: null };
  if (!Number.isSafeInteger(principal.userId) || principal.userId < 1) throw new OperatorFeatureError("OPERATOR_FEATURE_POLICY_UNAVAILABLE", 503);
  const policy = readPolicy(), allowed = policy.allowedOperatorIds.includes(principal.userId);
  return { managed: true as const, instance, operatorId: principal.userId, features: { operator: allowed && policy.features.operator, telephony: allowed && policy.features.telephony, crm: allowed && policy.features.crm, whatsapp: allowed && policy.features.whatsapp }, revision: policy.revision };
}
export function assertOperatorFeature(principal: FeaturePrincipal, feature: OperatorFeature, readPolicy?: () => FeaturePolicy): void {
  const access = operatorFeatures(principal, readPolicy);
  if (access.managed && !access.features[feature]) throw new OperatorFeatureError();
}
/** Operational telephony includes reads. Existing general CRM reads stay available. */
export function requiredCustomerFeature(method: string, requestPath: string): OperatorFeature | null {
  const request = requestPath.toLowerCase();
  if (/^\/(?:customers\/telephony|telephony|customers\/schedules\/telephony)(?:\/|$)/.test(request)) return "telephony";
  if (["POST","PUT","PATCH","DELETE"].includes(method.toUpperCase()) && /^\/(?:customers|crm-customers)(?:\/|$)/.test(request)) return "crm";
  return null;
}
