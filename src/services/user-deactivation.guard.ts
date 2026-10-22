import { CatalogError } from "./crm-catalogs/contract";
import type { ExecuteQuery } from "./crm-catalogs/tenant-query.client";

export const noPendingCrmAgenda = "NOT EXISTS (SELECT 1 FROM campanhas_clientes WHERE OPERADOR=? AND CONCLUIDO='NAO')";

export function requestsDeactivation(changes: object): boolean {
  return Object.entries(changes).some(([key, value]) => key.toUpperCase() === "ATIVO" && typeof value === "string" && value.trim().toUpperCase() === "NAO");
}

export async function assertNoPendingCrmAgenda(execute: ExecuteQuery, instance: string, userId: number): Promise<void> {
  const rows = await execute<Array<{ pending: number }>>(instance, "SELECT 1 AS pending FROM campanhas_clientes WHERE OPERADOR=? AND CONCLUIDO='NAO' LIMIT 1", [userId]);
  if (!Array.isArray(rows)) throw new Error("Invalid agenda response");
  if (rows.length) throw new CatalogError(409, "CRM_USER_PENDING_AGENDA", "Antes de desativar o operador, transfira os clientes com agenda CRM pendente para outro operador.");
}
