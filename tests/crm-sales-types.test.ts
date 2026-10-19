import { beforeEach, describe, expect, it, vi } from "vitest";
import { SalesTypesService } from "../src/services/crm-catalogs/sales-types.service";
const session = { instance: "tenant-a", userId: 1, role: "ADMIN" }, execute = vi.fn(), service = new SalesTypesService(execute);
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, "info").mockImplementation(() => {}); });
describe("legacy sales catalog", () => {
  it("keeps ID as text and normalizes neutral decimals exactly", async () => {
    execute.mockResolvedValueOnce({ affectedRows: 1 }); expect(await service.create(session, { ID: "001", NOME: "Cartão", PAGAMENTO: "-99.99" })).toEqual({ ID: "001", NOME: "Cartão", PAGAMENTO: "-99.99" });
    expect(execute.mock.calls[0]).toEqual(["tenant-a", expect.stringContaining("WHERE NOT EXISTS (SELECT 1 FROM vendas WHERE ID=?)"), ["001", "Cartão", "-99.99", "001"]]);
  });
  it.each([undefined, 1.25, "100.00", "-100.00", "1.001", "1,20", "1e1", "NaN", "", "+1", "01.00"])("rejects unsupported decimal %s", async PAGAMENTO => {
    await expect(service.create(session, { ID: "1", NOME: "Nome", PAGAMENTO })).rejects.toMatchObject({ status: 400 }); expect(execute).not.toHaveBeenCalled();
  });
  it.each([{ ID: 1, NOME: "A", PAGAMENTO: "1" }, { ID: "12345", NOME: "A", PAGAMENTO: "1" }, { ID: "1", NOME: "a".repeat(31), PAGAMENTO: "1" }, { ID: "1", NOME: "€", PAGAMENTO: "1" }, { ID: "1", NOME: "A", PAGAMENTO: "1", OPERADOR: 1 }])("rejects invented fields or invalid text %#", async data => {
    await expect(service.create(session, data)).rejects.toMatchObject({ status: 400 });
  });
  it("lists duplicates with ID_COUNT and escaped literal filters", async () => {
    execute.mockResolvedValueOnce([{ totalRows: 2 }]).mockResolvedValueOnce([{ ID: "A", NOME: "A", PAGAMENTO: "1.00", ID_COUNT: 2 }, { ID: "A", NOME: "B", PAGAMENTO: "2.00", ID_COUNT: 2 }]);
    const result = await service.list(session, { NOME: "A%", ID: "A" }); expect(result.data).toHaveLength(2); expect(execute.mock.calls[1]?.[1]).toContain("AS ID_COUNT"); expect(execute.mock.calls[1]?.[2]).toEqual(["A", "%A!%%", 20, 0]);
  });
  it.each([{ page: "0" }, { perPage: "101" }, { page: "1e2" }, { ID: ["A"] }, { instance: "other" }])("rejects invalid lists before SQL %#", async query => {
    await expect(service.list(session, query)).rejects.toMatchObject({ status: 400 }); expect(execute).not.toHaveBeenCalled();
  });
  it("blocks duplicate IDs instead of updating arbitrary duplicate rows", async () => {
    execute.mockResolvedValueOnce([{ ID: "A", NOME: "A", PAGAMENTO: "1.00" }, { ID: "A", NOME: "B", PAGAMENTO: "1.00" }]);
    await expect(service.patch(session, "A", { changes: { NOME: "Novo" }, expected: { ID: "A", NOME: "A", PAGAMENTO: "1.00" } })).rejects.toMatchObject({ code: "CRM_SALES_TYPE_CHANGED" }); expect(execute).toHaveBeenCalledTimes(1);
  });
  it("bounds writes to one matching complete snapshot and uses UTF8 binary text comparison", async () => {
    execute.mockResolvedValueOnce([{ ID: "001", NOME: "Cartão", PAGAMENTO: "1.00" }]).mockResolvedValueOnce({ affectedRows: 1 }).mockResolvedValueOnce([{ ID: "001", NOME: "CARTÃO", PAGAMENTO: "0.00" }]);
    await service.patch(session, "001", { changes: { NOME: "CARTÃO", PAGAMENTO: "0" }, expected: { ID: "001", NOME: "Cartão", PAGAMENTO: "1" } });
    expect(execute.mock.calls[1]?.[1]).toContain("CAST(CONVERT(`NOME` USING utf8mb4) AS BINARY)"); expect(execute.mock.calls[1]?.[1]).toMatch(/PAGAMENTO=\? LIMIT 1$/); expect(execute.mock.calls[1]?.[2]).toEqual(["CARTÃO", "0.00", "001", "Cartão", "1.00"]);
  });
  it("detects an external stale write even for a requested no-op", async () => {
    execute.mockResolvedValueOnce([{ ID: "A", NOME: "A", PAGAMENTO: "1.00" }]).mockResolvedValueOnce({ affectedRows: 0 }).mockResolvedValueOnce([{ ID: "A", NOME: "B", PAGAMENTO: "1.00" }]);
    await expect(service.patch(session, "A", { changes: { NOME: "A" }, expected: { ID: "A", NOME: "A", PAGAMENTO: "1.00" } })).rejects.toMatchObject({ code: "CRM_SALES_TYPE_CHANGED" });
  });
  it("does not allow rewriting ID or editing by an incomplete snapshot", async () => {
    await expect(service.patch(session, "A", { changes: { ID: "B" }, expected: { ID: "A", NOME: "A", PAGAMENTO: "1" } })).rejects.toMatchObject({ status: 400 });
    await expect(service.delete(session, "A", { expected: { ID: "A", PAGAMENTO: "1" } })).rejects.toMatchObject({ status: 400 }); expect(execute).not.toHaveBeenCalled();
  });
  it("guards deletion by all physical fields and limits affected rows", async () => {
    execute.mockResolvedValueOnce([{ ID: "001", NOME: "Cartão", PAGAMENTO: "0.00" }]).mockResolvedValueOnce({ affectedRows: 1 });
    await service.delete(session, "001", { expected: { ID: "001", NOME: "Cartão", PAGAMENTO: "0.00" } }); expect(execute.mock.calls[1]?.[1]).toMatch(/^DELETE FROM vendas WHERE .*LIMIT 1$/); expect(execute.mock.calls[1]?.[2]).toEqual(["001", "Cartão", "0.00"]);
  });
  it("returns UNKNOWN and never retries after a lost write response", async () => {
    execute.mockRejectedValueOnce(new Error("private SQL")); await expect(service.create(session, { ID: "A", NOME: "A", PAGAMENTO: "0" })).rejects.toMatchObject({ status: 503, outcome: "UNKNOWN" }); expect(execute).toHaveBeenCalledTimes(1);
  });
});
