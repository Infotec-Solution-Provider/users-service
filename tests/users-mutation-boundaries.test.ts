import { beforeEach, describe, expect, it, vi } from "vitest";
const execute = vi.hoisted(() => vi.fn());
vi.mock("../src/services/instances.service", () => ({ default: { executeQuery: execute } }));
import service from "../src/services/users.service";
beforeEach(() => vi.resetAllMocks());
describe("legacy users mutation boundary", () => {
  it.each(["HORARIO", "horario", "HoRaRiO", "operadores.HORARIO", "`HORARIO`", "CODIGO", "codigo", "NOME=?,HORARIO"])("rejects guarded or SQL field %s before any query", async key => {
    await expect(service.update("a", 1, { [key]: 1 } as any)).rejects.toThrow("Campos inválidos"); expect(execute).not.toHaveBeenCalled();
  });
  it("requires the dedicated association after creating a user", async () => {
    await expect(service.create("a", { NOME: "A", HORARIO: 1 } as any)).rejects.toThrow("Cadastre o usuário"); expect(execute).not.toHaveBeenCalled();
  });
  it("preserves the existing ordinary update contract", async () => {
    execute.mockResolvedValueOnce({ affectedRows: 1 }); await service.update("a", 1, { NOME: "Nome" }); expect(execute.mock.calls[0]).toEqual(["a", "UPDATE operadores SET NOME = ? WHERE CODIGO = ?", ["Nome", 1]]);
  });
});
