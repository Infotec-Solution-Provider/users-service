import { admin, CatalogError, invalid, object, type CatalogSession } from "./contract";
import { executeQuery, TenantQueryError, type ExecuteQuery } from "./tenant-query.client";

export interface SalesType { ID: string; NOME: string; PAGAMENTO: string }
const equal = (column: string) => `CAST(CONVERT(\`${column}\` USING utf8mb4) AS BINARY) <=> CAST(CONVERT(? USING utf8mb4) AS BINARY)`;
function text(value: unknown, max: number, historical = false): string {
  if (typeof value !== "string" || [...value].length > max || (!historical && (!value.trim() || /[^\u0020-\u007e\u00a0-\u00ff]/.test(value)))) return invalid("Texto inválido.");
  return historical ? value : value.trim();
}
function amount(value: unknown): string {
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d?)(?:\.\d{1,2})?$/.test(value)) return invalid("Pagamento deve ser um decimal entre -99.99 e 99.99.");
  const normalized = Number(value).toFixed(2); return normalized === "-0.00" ? "0.00" : normalized;
}
function snapshot(input: unknown, historical = false): SalesType {
  const value = object(input, ["ID", "NOME", "PAGAMENTO"]);
  return { ID: text(value["ID"], 4, historical), NOME: text(value["NOME"], 30, historical), PAGAMENTO: amount(value["PAGAMENTO"]) };
}
const changed = () => new CatalogError(409, "CRM_SALES_TYPE_CHANGED", "O cadastro foi alterado ou não possui identidade única. Recarregue os dados.");
/** vendas is a legacy catalog. PAGAMENTO has no inferred monetary, commission or percentage unit. */
export class SalesTypesService {
  private tail = Promise.resolve();
  constructor(private readonly execute: ExecuteQuery = executeQuery) {}
  private async safe<T>(work: () => Promise<T>, writing = false): Promise<T> {
    try { return await work(); }
    catch (error) {
      if (error instanceof CatalogError) throw error;
      if (error instanceof TenantQueryError && error.code === "TENANT_DUPLICATE_KEY") throw changed();
      throw new CatalogError(503, writing ? "CRM_CATALOG_WRITE_UNKNOWN" : "CRM_CATALOG_QUERY_FAILED", writing ? "Não foi possível confirmar a gravação. Recarregue antes de tentar novamente." : "Não foi possível consultar os cadastros de vendas.", ...(writing ? ["UNKNOWN" as const] : []));
    }
  }
  private async locked<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.tail; let release!: () => void; this.tail = new Promise<void>(resolve => { release = resolve; }); await previous;
    try { return await work(); } finally { release(); }
  }
  private observe(session: CatalogSession, operation: string, recordId: string, fields: string[]) {
    console.info(JSON.stringify({ event: "crm_catalog_write", instance: session.instance, actorId: session.userId, operation, recordId, fields }));
  }
  private async rows(instance: string, code: string): Promise<SalesType[]> {
    const rows = await this.execute<SalesType[]>(instance, "SELECT ID,NOME,PAGAMENTO FROM vendas WHERE ID=? ORDER BY NOME,PAGAMENTO LIMIT 2", [code]);
    if (!Array.isArray(rows)) throw new Error("Invalid rows"); return rows.map(row => snapshot({ ...row, PAGAMENTO: String(row.PAGAMENTO) }, true));
  }
  async list(session: unknown, input: unknown) {
    admin(session); const query = object(input, ["page", "perPage", "ID", "NOME"]);
    if (Object.values(query).some(value => typeof value !== "string")) return invalid("Filtros inválidos.");
    const page = query["page"] === undefined ? 1 : Number(query["page"]), perPage = query["perPage"] === undefined ? 20 : Number(query["perPage"]);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100 || !Number.isSafeInteger((page - 1) * perPage) || ["page", "perPage"].some(key => query[key] !== undefined && !/^[1-9]\d*$/.test(String(query[key])))) return invalid("Paginação inválida.");
    const where: string[] = [], params: unknown[] = [];
    if (query["ID"] !== undefined) { where.push("ID=?"); params.push(text(query["ID"], 4, true)); }
    if (query["NOME"] !== undefined) { const name = text(query["NOME"], 30, true); where.push("NOME LIKE ? ESCAPE '!'"); params.push(`%${name.replace(/[!%_]/g, char => `!${char}`)}%`); }
    const filter = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    return this.safe(async () => {
      const count = await this.execute<{ totalRows: number | string }[]>(session.instance, `SELECT COUNT(*) AS totalRows FROM vendas${filter}`, params), totalRows = Number(count[0]?.totalRows);
      if (!Number.isSafeInteger(totalRows) || totalRows < 0) throw new Error("Invalid count");
      const data = await this.execute<SalesType[]>(session.instance, `SELECT v.ID,v.NOME,v.PAGAMENTO,(SELECT COUNT(*) FROM vendas d WHERE d.ID=v.ID) AS ID_COUNT FROM vendas v${filter} ORDER BY v.ID,v.NOME,v.PAGAMENTO LIMIT ? OFFSET ?`, [...params, perPage, (page - 1) * perPage]);
      if (!Array.isArray(data)) throw new Error("Invalid rows"); return { data, page: { current: page, totalRows } };
    });
  }
  async detail(session: unknown, rawId: unknown, query: unknown = {}) {
    admin(session); const code = text(rawId, 4, true); object(query, []);
    return this.safe(async () => { const rows = await this.rows(session.instance, code); if (!rows.length) throw new CatalogError(404, "CRM_SALES_TYPE_NOT_FOUND", "Cadastro de venda não encontrado."); if (rows.length > 1) throw changed(); return rows[0]!; });
  }
  async create(session: unknown, input: unknown, query: unknown = {}) {
    admin(session); const row = snapshot(input); object(query, []);
    return this.locked(() => this.safe(async () => {
      const result = await this.execute<{ affectedRows: number }>(session.instance, "INSERT INTO vendas (ID,NOME,PAGAMENTO) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM vendas WHERE ID=?)", [row.ID, row.NOME, row.PAGAMENTO, row.ID]);
      if (result?.affectedRows !== 1) throw changed();
      this.observe(session, "sales-types.create", row.ID, ["ID", "NOME", "PAGAMENTO"]); return row;
    }, true));
  }
  async patch(session: unknown, rawId: unknown, input: unknown, query: unknown = {}) {
    admin(session); const code = text(rawId, 4, true), body = object(input, ["changes", "expected"]), expected = snapshot(body["expected"], true), changes = object(body["changes"], ["NOME", "PAGAMENTO"]); object(query, []);
    if (code !== expected.ID || !Object.keys(changes).length) return invalid();
    const data = { ...(Object.hasOwn(changes, "NOME") ? { NOME: text(changes["NOME"], 30) } : {}), ...(Object.hasOwn(changes, "PAGAMENTO") ? { PAGAMENTO: amount(changes["PAGAMENTO"]) } : {}) };
    return this.locked(() => this.safe(async () => {
      const current = await this.rows(session.instance, code); if (current.length !== 1 || JSON.stringify(current[0]) !== JSON.stringify(expected)) throw changed();
      const result = await this.execute<{ affectedRows: number }>(session.instance, `UPDATE vendas SET ${Object.keys(data).map(key => `\`${key}\`=?`).join(",")} WHERE ${equal("ID")} AND ${equal("NOME")} AND PAGAMENTO=? LIMIT 1`, [...Object.values(data), expected.ID, expected.NOME, expected.PAGAMENTO]);
      if (!result || !Number.isInteger(result.affectedRows) || result.affectedRows < 0 || result.affectedRows > 1) throw new Error("Invalid acknowledgement");
      if (!result.affectedRows && !Object.entries(data).every(([key, value]) => expected[key as keyof SalesType] === value)) throw changed();
      this.observe(session, "sales-types.update", code, Object.keys(data));
      const rows = await this.rows(session.instance, code); if (rows.length !== 1) throw new Error("Updated row unavailable");
      if (!result.affectedRows && JSON.stringify(rows[0]) !== JSON.stringify(expected)) throw changed();
      return rows[0]!;
    }, true));
  }
  async delete(session: unknown, rawId: unknown, input: unknown, query: unknown = {}) {
    admin(session); const code = text(rawId, 4, true), expected = snapshot(object(input, ["expected"])["expected"], true); object(query, []);
    if (code !== expected.ID) return invalid();
    return this.locked(() => this.safe(async () => {
      const rows = await this.rows(session.instance, code); if (rows.length !== 1 || JSON.stringify(rows[0]) !== JSON.stringify(expected)) throw changed();
      const result = await this.execute<{ affectedRows: number }>(session.instance, `DELETE FROM vendas WHERE ${equal("ID")} AND ${equal("NOME")} AND PAGAMENTO=? LIMIT 1`, [expected.ID, expected.NOME, expected.PAGAMENTO]);
      if (result?.affectedRows !== 1) throw changed(); this.observe(session, "sales-types.delete", code, []);
    }, true));
  }
}
export default new SalesTypesService();
