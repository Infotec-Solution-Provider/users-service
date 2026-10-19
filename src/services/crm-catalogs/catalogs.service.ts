import { admin, CatalogError, create, definition, id, integer, invalid, object, patch, snapshot, type CatalogDefinition, type CatalogSession, type Row } from "./contract";
import { executeQuery, TenantQueryError, type ExecuteQuery } from "./tenant-query.client";

const columns = (spec: CatalogDefinition) => ["CODIGO", ...Object.keys(spec.fields)].map(key => `\`${key}\``).join(",");
const equal = (key: string) => `CAST(CONVERT(\`${key}\` USING utf8mb4) AS BINARY) <=> CAST(CONVERT(? USING utf8mb4) AS BINARY)`;
function acknowledged(result: { affectedRows?: unknown }): number {
  if (!result || !Number.isInteger(result.affectedRows) || Number(result.affectedRows) < 0 || Number(result.affectedRows) > 1) throw new Error("Invalid acknowledgement");
  return Number(result.affectedRows);
}
const changed = () => new CatalogError(409, "CRM_CATALOG_CHANGED", "O registro foi alterado. Recarregue os dados para continuar.");
const missing = () => new CatalogError(404, "CRM_CATALOG_NOT_FOUND", "Registro não encontrado.");

export class CrmCatalogsService {
  private readonly locks = new Map<string, Promise<void>>();
  constructor(private readonly execute: ExecuteQuery = executeQuery) {}
  private async safe<T>(work: () => Promise<T>, writing = false): Promise<T> {
    try { return await work(); }
    catch (error) {
      if (error instanceof CatalogError) throw error;
      if (error instanceof TenantQueryError && error.code === "TENANT_DUPLICATE_KEY") throw new CatalogError(409, "CRM_CATALOG_DUPLICATE", "O código já está em uso. Recarregue antes de continuar.");
      throw new CatalogError(503, writing ? "CRM_CATALOG_WRITE_UNKNOWN" : "CRM_CATALOG_QUERY_FAILED", writing ? "Não foi possível confirmar a gravação. Recarregue os dados antes de tentar novamente." : "Não foi possível consultar o cadastro.", ...(writing ? ["UNKNOWN" as const] : []));
    }
  }
  private observe(session: CatalogSession, operation: string, recordId: number, fields: string[]) {
    console.info(JSON.stringify({ event: "crm_catalog_write", instance: session.instance, actorId: session.userId, operation, recordId, fields }));
  }
  private async row(instance: string, spec: CatalogDefinition, code: number): Promise<Row | null> {
    const rows = await this.execute<Row[]>(instance, `SELECT ${columns(spec)} FROM \`${spec.table}\` WHERE CODIGO=? LIMIT 1`, [code]);
    if (!Array.isArray(rows)) throw new Error("Invalid rows");
    return rows[0] ? { CODIGO: integer(rows[0]["CODIGO"]), ...snapshot(Object.fromEntries(Object.keys(spec.fields).map(key => [key, rows[0]![key]])), spec) } : null;
  }
  async list(session: unknown, name: string, input: unknown) {
    admin(session); const spec = definition(name), query = object(input, ["page", "perPage", "CODIGO", "DESCRICAO", "sortBy", "sortDirection"]);
    if (Object.values(query).some(value => typeof value !== "string")) return invalid("Filtros inválidos.");
    const pageNumber = (key: string, fallback: number) => {
      const value = query[key]; if (value === undefined) return fallback;
      if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) return invalid("Paginação inválida.");
      return Number(value);
    };
    const page = pageNumber("page", 1), perPage = pageNumber("perPage", 20);
    if (perPage > 100 || !Number.isSafeInteger((page - 1) * perPage)) return invalid("Paginação inválida.");
    const sort = query["sortBy"] ?? "DESCRICAO", direction = query["sortDirection"] ?? "asc";
    if (!["CODIGO", ...Object.keys(spec.fields)].includes(String(sort)) || !["asc", "desc"].includes(String(direction))) return invalid("Ordenação inválida.");
    const where: string[] = [], params: unknown[] = [];
    if (query["CODIGO"] !== undefined) { where.push("CODIGO=?"); params.push(id(query["CODIGO"])); }
    if (query["DESCRICAO"] !== undefined) {
      const value = String(query["DESCRICAO"]); if ([...value].length > spec.fields["DESCRICAO"]!.max!) return invalid("Busca muito longa.");
      where.push("DESCRICAO LIKE ? ESCAPE '!'"); params.push(`%${value.replace(/[!%_]/g, char => `!${char}`)}%`);
    }
    const restriction = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    return this.safe(async () => {
      const count = await this.execute<{ totalRows: number | string }[]>(session.instance, `SELECT COUNT(*) AS totalRows FROM \`${spec.table}\`${restriction}`, params);
      const totalRows = Number(count[0]?.totalRows); if (!Number.isSafeInteger(totalRows) || totalRows < 0) throw new Error("Invalid count");
      const data = await this.execute<Row[]>(session.instance, `SELECT ${columns(spec)} FROM \`${spec.table}\`${restriction} ORDER BY \`${sort}\` IS NULL ASC,\`${sort}\` ${String(direction).toUpperCase()}${sort === "CODIGO" ? "" : ",CODIGO ASC"} LIMIT ? OFFSET ?`, [...params, perPage, (page - 1) * perPage]);
      if (!Array.isArray(data)) throw new Error("Invalid rows");
      return { data, page: { current: page, totalRows } };
    });
  }
  async detail(session: unknown, name: string, rawId: unknown, query: unknown = {}) {
    admin(session); const spec = definition(name), code = id(rawId); object(query, []);
    return this.safe(async () => { const row = await this.row(session.instance, spec, code); if (!row) throw missing(); return row; });
  }
  async create(session: unknown, name: string, input: unknown, query: unknown = {}) {
    admin(session); const spec = definition(name), data = create(input, spec); object(query, []);
    return this.safe(async () => {
      const fields = Object.keys(data), code = Number(data["CODIGO"]);
      const result = await this.execute<{ affectedRows: number }>(session.instance, `INSERT INTO \`${spec.table}\` (${fields.map(key => `\`${key}\``).join(",")}) VALUES (${fields.map(() => "?").join(",")})`, Object.values(data));
      if (acknowledged(result) !== 1) throw new Error("Invalid insert");
      this.observe(session, `${name}.create`, code, fields);
      const row = await this.row(session.instance, spec, code); if (!row) throw new Error("Created row unavailable"); return row;
    }, true);
  }
  async patch(session: unknown, name: string, rawId: unknown, input: unknown, query: unknown = {}) {
    admin(session); const spec = definition(name), code = id(rawId), { changes, expected } = patch(input, spec); object(query, []);
    return this.safe(async () => {
      const result = await this.execute<{ affectedRows: number }>(session.instance, `UPDATE \`${spec.table}\` SET ${Object.keys(changes).map(key => `\`${key}\`=?`).join(",")} WHERE CODIGO=? AND ${Object.keys(expected).map(equal).join(" AND ")}`, [...Object.values(changes), code, ...Object.values(expected)]);
      const affected = acknowledged(result), row = await this.row(session.instance, spec, code); if (!row) throw missing();
      if (!affected && !(Object.entries(changes).every(([key, value]) => expected[key] === value) && Object.entries(expected).every(([key, value]) => row[key] === value))) throw changed();
      this.observe(session, `${name}.update`, code, Object.keys(changes)); return row;
    }, true);
  }
  async delete(session: unknown, name: string, rawId: unknown, input: unknown, query: unknown = {}) {
    admin(session); const spec = definition(name), code = id(rawId), expected = snapshot(object(input, ["expected"])["expected"], spec); object(query, []);
    return this.safe(async () => {
      const result = await this.execute<{ affectedRows: number }>(session.instance, `DELETE FROM \`${spec.table}\` WHERE CODIGO=? AND ${Object.keys(expected).map(equal).join(" AND ")}${spec.references.map(reference => ` AND NOT EXISTS (SELECT 1 FROM \`${reference.table}\` ref WHERE ref.\`${reference.field}\`=?)`).join("")}`, [code, ...Object.values(expected), ...spec.references.map(() => code)]);
      if (!acknowledged(result)) {
        const row = await this.row(session.instance, spec, code); if (!row) throw missing();
        if (!Object.entries(expected).every(([key, value]) => row[key] === value)) throw changed();
        throw new CatalogError(409, "CRM_CATALOG_REFERENCED", "O registro está em uso e não pode ser excluído.");
      }
      this.observe(session, `${name}.delete`, code, []);
    }, true);
  }
  /** Serializes this process' membership writers. Legacy/other processes remain a documented limitation without a unique pair. */
  private async locked<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void; const current = new Promise<void>(resolve => { release = resolve; }); this.locks.set(key, current);
    await previous;
    try { return await work(); } finally { release(); if (this.locks.get(key) === current) this.locks.delete(key); }
  }
  async members(session: unknown, rawId: unknown, query: unknown = {}) {
    admin(session); const code = id(rawId); object(query, []);
    return this.safe(async () => {
      if (!await this.row(session.instance, definition("user-groups"), code)) throw missing();
      const rows = await this.execute<Row[]>(session.instance, "SELECT m.CODIGO,m.GRUPO,m.OPERADOR,o.NOME AS OPERADOR_NOME,o.ATIVO AS OPERADOR_ATIVO FROM gruposxoperadores m LEFT JOIN operadores o ON o.CODIGO=m.OPERADOR WHERE m.GRUPO=? ORDER BY m.CODIGO", [code]);
      if (!Array.isArray(rows)) throw new Error("Invalid members"); return rows;
    });
  }
  async addMember(session: unknown, rawId: unknown, input: unknown, query: unknown = {}) {
    admin(session); const group = id(rawId), data = object(input, ["CODIGO", "OPERADOR"]), code = integer(data["CODIGO"], true), operator = integer(data["OPERADOR"], true); object(query, []);
    return this.locked(`${session.instance}:${group}`, () => this.safe(async () => {
      const result = await this.execute<{ affectedRows: number }>(session.instance, "INSERT INTO gruposxoperadores (CODIGO,GRUPO,OPERADOR) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM grupos_operador WHERE CODIGO=?) AND EXISTS (SELECT 1 FROM operadores WHERE CODIGO=?) AND NOT EXISTS (SELECT 1 FROM gruposxoperadores WHERE GRUPO=? AND OPERADOR=?)", [code, group, operator, group, operator, group, operator]);
      if (!acknowledged(result)) throw new CatalogError(409, "CRM_GROUP_MEMBER_UNAVAILABLE", "Grupo ou usuário indisponível, ou usuário já associado. Recarregue os dados.");
      this.observe(session, "user-groups.member.add", code, ["GRUPO", "OPERADOR"]); return { CODIGO: code, GRUPO: group, OPERADOR: operator };
    }, true));
  }
  async removeMember(session: unknown, rawGroup: unknown, rawId: unknown, input: unknown, query: unknown = {}) {
    admin(session); const group = id(rawGroup), code = id(rawId), expected = object(object(input, ["expected"])["expected"], ["OPERADOR"]), operator = expected["OPERADOR"] === null ? null : integer(expected["OPERADOR"]); object(query, []);
    return this.safe(async () => {
      const result = await this.execute<{ affectedRows: number }>(session.instance, "DELETE FROM gruposxoperadores WHERE CODIGO=? AND GRUPO=? AND OPERADOR <=> ?", [code, group, operator]);
      if (!acknowledged(result)) throw changed(); this.observe(session, "user-groups.member.delete", code, []);
    }, true);
  }
  async setShift(session: unknown, rawId: unknown, input: unknown, query: unknown = {}) {
    admin(session); const code = id(rawId); if (code <= 0) return invalid("Usuário inválido.");
    const data = object(input, ["HORARIO", "expected"]), expected = object(data["expected"], ["HORARIO"]), before = expected["HORARIO"] === null ? null : integer(expected["HORARIO"]), target = data["HORARIO"] === null ? null : integer(data["HORARIO"], true); object(query, []);
    return this.safe(async () => {
      const rows = await this.execute<Row[]>(session.instance, "SELECT CODIGO,HORARIO FROM operadores WHERE CODIGO=? LIMIT 1", [code]); const current = rows[0]; if (!current) throw missing();
      if (current["HORARIO"] !== before) throw changed();
      if (target !== null && !await this.row(session.instance, definition("shifts"), target)) throw new CatalogError(409, "CRM_SHIFT_UNAVAILABLE", "Expediente não encontrado. Recarregue os dados.");
      if (target === before) return current;
      const result = await this.execute<{ affectedRows: number }>(session.instance, `UPDATE operadores SET HORARIO=? WHERE CODIGO=? AND HORARIO <=> ?${target === null ? "" : " AND EXISTS (SELECT 1 FROM horarios WHERE CODIGO=?)"}`, [target, code, before, ...(target === null ? [] : [target])]);
      if (!acknowledged(result)) throw changed();
      this.observe(session, "users.shift.update", code, ["HORARIO"]);
      const updated = await this.execute<Row[]>(session.instance, "SELECT CODIGO,HORARIO FROM operadores WHERE CODIGO=? LIMIT 1", [code]); if (!updated[0]) throw new Error("Updated user unavailable"); return updated[0];
    }, true);
  }
}
export default new CrmCatalogsService();
