import { beforeEach, describe, expect, it, vi } from "vitest";
import { CrmCatalogsService } from "../src/services/crm-catalogs/catalogs.service";
import { TenantQueryError } from "../src/services/crm-catalogs/tenant-query.client";
const session = { instance: "tenant-a", userId: 7, role: "ADMIN" };
const execute = vi.fn(), service = new CrmCatalogsService(execute);
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, "info").mockImplementation(() => {}); });
describe("CRM catalog SQL boundaries", () => {
  it("escapes literal search, whitelists sort and scopes every query to session tenant", async () => {
    execute.mockResolvedValueOnce([{ totalRows: "1" }]).mockResolvedValueOnce([{ CODIGO: 1, DESCRICAO: "A%_!" }]);
    const result = await service.list(session, "user-groups", { DESCRICAO: "A%_!", page: "2", perPage: "10", sortBy: "CODIGO", sortDirection: "desc" });
    expect(result.page).toEqual({ current: 2, totalRows: 1 });
    expect(execute.mock.calls[0]).toEqual(["tenant-a", expect.stringContaining("ESCAPE '!'"), ["%A!%!_!!%"]]);
    expect(execute.mock.calls[1]).toEqual(["tenant-a", expect.stringContaining("`CODIGO` DESC LIMIT ? OFFSET ?"), ["%A!%!_!!%", 10, 10]]);
  });
  it.each([{ instance: "other" }, { page: "0" }, { perPage: "101" }, { sortBy: "SENHA" }, { sortDirection: "desc;drop" }, { CODIGO: ["1"] }, { page: {} }])("rejects invalid lists before SQL %#", async query => {
    await expect(service.list(session, "user-groups", query)).rejects.toMatchObject({ status: 400 }); expect(execute).not.toHaveBeenCalled();
  });
  it("creates an explicit code in a single INSERT and does not query MAX or retry", async () => {
    execute.mockResolvedValueOnce({ affectedRows: 1 }).mockResolvedValueOnce([{ CODIGO: 52, DESCRICAO: "Grupo" }]);
    expect(await service.create(session, "user-groups", { CODIGO: 52, DESCRICAO: "Grupo" })).toEqual({ CODIGO: 52, DESCRICAO: "Grupo" });
    expect(execute.mock.calls[0]).toEqual(["tenant-a", "INSERT INTO `grupos_operador` (`CODIGO`,`DESCRICAO`) SELECT ?,? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `grupos_operador` WHERE DESCRICAO=?)", [52, "Grupo", "Grupo"]]);
    expect(execute.mock.calls.some(call => String(call[1]).includes("MAX("))).toBe(false);
  });
  it("reports a lost write as UNKNOWN without leaking or retrying SQL", async () => {
    execute.mockRejectedValue(new Error("SQL with secret"));
    await expect(service.create(session, "user-groups", { CODIGO: 1, DESCRICAO: "Grupo" })).rejects.toMatchObject({ status: 503, code: "CRM_CATALOG_WRITE_UNKNOWN", outcome: "UNKNOWN" }); expect(execute).toHaveBeenCalledTimes(1);
  });
  it("reports duplicate identity and preserves historical snapshots in binary CAS", async () => {
    execute.mockRejectedValueOnce(new TenantQueryError("TENANT_DUPLICATE_KEY"));
    await expect(service.create(session, "user-groups", { CODIGO: 1, DESCRICAO: "A" })).rejects.toMatchObject({ status: 409, code: "CRM_CATALOG_DUPLICATE" });
    execute.mockResolvedValueOnce({ affectedRows: 1 }).mockResolvedValueOnce([{ CODIGO: 0, DESCRICAO: "Novo" }]);
    await service.patch(session, "user-groups", "0", { changes: { DESCRICAO: "Novo" }, expected: { DESCRICAO: "\u0080" } });
    expect(execute.mock.calls[1]).toEqual(["tenant-a", expect.stringContaining("CAST(CONVERT(`DESCRICAO` USING utf8mb4) AS BINARY) <=> CAST(CONVERT(? USING utf8mb4) AS BINARY)"), ["Novo", 0, "\u0080"]]);
  });
  it("distinguishes stale, missing and no-op updates with affectedRows zero", async () => {
    const input = { changes: { DESCRICAO: "A" }, expected: { DESCRICAO: "A" } };
    execute.mockResolvedValueOnce({ affectedRows: 0 }).mockResolvedValueOnce([{ CODIGO: 1, DESCRICAO: "A" }]); expect(await service.patch(session, "user-groups", "1", input)).toEqual({ CODIGO: 1, DESCRICAO: "A" });
    execute.mockResolvedValueOnce({ affectedRows: 0 }).mockResolvedValueOnce([{ CODIGO: 1, DESCRICAO: "B" }]); await expect(service.patch(session, "user-groups", "1", input)).rejects.toMatchObject({ code: "CRM_CATALOG_CHANGED" });
    execute.mockResolvedValueOnce({ affectedRows: 0 }).mockResolvedValueOnce([]); await expect(service.patch(session, "user-groups", "1", input)).rejects.toMatchObject({ status: 404 });
  });
  it.each([["user-groups", { DESCRICAO: "A" }, "gruposxoperadores", "GRUPO"], ["pause-reasons", { DESCRICAO: null, TEMPO_MAX_SEG: 0, PRODUTIVIDADE: "SIM" }, "pausas_realizadas", "COD_PAUSA"]] as const)("protects %s references in the same DELETE statement", async (catalog, expected, table, field) => {
    execute.mockResolvedValueOnce({ affectedRows: 1 }); await service.delete(session, catalog, "1", { expected });
    expect(execute.mock.calls[0]?.[1]).toContain(`NOT EXISTS (SELECT 1 FROM \`${table}\` ref WHERE ref.\`${field}\`=?)`);
  });
  it("rejects deletion of an in-use snapshot and stale snapshot separately", async () => {
    execute.mockResolvedValueOnce({ affectedRows: 0 }).mockResolvedValueOnce([{ CODIGO: 1, DESCRICAO: "A" }]); await expect(service.delete(session, "user-groups", "1", { expected: { DESCRICAO: "A" } })).rejects.toMatchObject({ code: "CRM_CATALOG_REFERENCED" });
    execute.mockResolvedValueOnce({ affectedRows: 0 }).mockResolvedValueOnce([{ CODIGO: 1, DESCRICAO: "B" }]); await expect(service.delete(session, "user-groups", "1", { expected: { DESCRICAO: "A" } })).rejects.toMatchObject({ code: "CRM_CATALOG_CHANGED" });
  });
  it("guards membership existence/dedup in SQL and keeps nullable historical deletions", async () => {
    execute.mockResolvedValueOnce({ affectedRows: 1 }); expect(await service.addMember(session, "3", { CODIGO: 7, OPERADOR: 2 })).toEqual({ CODIGO: 7, GRUPO: 3, OPERADOR: 2 });
    expect(execute.mock.calls[0]?.[1]).toContain("NOT EXISTS (SELECT 1 FROM gruposxoperadores WHERE GRUPO=? AND OPERADOR=?)");
    execute.mockResolvedValueOnce({ affectedRows: 1 }); await service.removeMember(session, "3", "0", { expected: { OPERADOR: null } }); expect(execute.mock.calls[1]?.[2]).toEqual([0, 3, null]);
  });
  it("serializes concurrent web group membership writes and never retries failures", async () => {
    let finish!: () => void; const barrier = new Promise<void>(resolve => { finish = resolve; });
    execute.mockImplementationOnce(async () => { await barrier; return { affectedRows: 1 }; }).mockResolvedValueOnce({ affectedRows: 0 });
    const first = service.addMember(session, "3", { CODIGO: 7, OPERADOR: 2 }), second = service.addMember(session, "3", { CODIGO: 8, OPERADOR: 2 });
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1)); finish(); await first;
    await expect(second).rejects.toMatchObject({ code: "CRM_GROUP_MEMBER_UNAVAILABLE" }); expect(execute).toHaveBeenCalledTimes(2);
  });
  it("validates shift association and supports explicit null independently of legacy zero", async () => {
    execute.mockResolvedValueOnce([{ CODIGO: 4, HORARIO: 0 }]).mockResolvedValueOnce({ affectedRows: 1 }).mockResolvedValueOnce([{ CODIGO: 4, HORARIO: null }]);
    expect(await service.setShift(session, "4", { HORARIO: null, expected: { HORARIO: 0 } })).toEqual({ CODIGO: 4, HORARIO: null });
    expect(execute.mock.calls[1]).toEqual(["tenant-a", "UPDATE operadores SET HORARIO=? WHERE CODIGO=? AND HORARIO <=> ?", [null, 4, 0]]);
    await expect(service.setShift(session, "4", { HORARIO: 0, expected: { HORARIO: 0 } })).rejects.toMatchObject({ status: 400 });
  });
  it("requires existing positive shift and guards reference again in atomic UPDATE", async () => {
    execute.mockResolvedValueOnce([{ CODIGO: 4, HORARIO: null }]).mockResolvedValueOnce([{ CODIGO: 8, DESCRICAO: "Dia", HORARIO_1: null, HORARIO_2: null, HORARIO_3: null, ENTRADA_1: null, ENTRADA_2: null, ENTRADA_3: null, SAIDA_1: null, SAIDA_2: null, SAIDA_3: null }]).mockResolvedValueOnce({ affectedRows: 1 }).mockResolvedValueOnce([{ CODIGO: 4, HORARIO: 8 }]);
    await service.setShift(session, "4", { HORARIO: 8, expected: { HORARIO: null } }); expect(execute.mock.calls[2]?.[1]).toContain("EXISTS (SELECT 1 FROM horarios WHERE CODIGO=?)");
  });
});
