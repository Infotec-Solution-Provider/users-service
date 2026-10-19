import { describe, expect, it } from "vitest";
import { admin, CatalogError, create, definition, id, object, patch, snapshot } from "../src/services/crm-catalogs/contract";

const group = definition("user-groups"), shift = definition("shifts"), pause = definition("pause-reasons");
describe("CRM catalog contracts", () => {
  it.each([null, {}, { instance: "", userId: 1, role: "ADMIN" }, { instance: "a", userId: 0, role: "ADMIN" }])("rejects invalid sessions %#", session => expect(() => admin(session)).toThrow(CatalogError));
  it("requires admin independently of router", () => expect(() => admin({ instance: "a", userId: 1, role: "ATIVO" })).toThrow(expect.objectContaining({ status: 403 })));
  it.each(["-1", "0", "2147483647", "-2147483648"])("preserves historical identity %s", value => expect(id(value)).toBe(Number(value)));
  it.each(["1 OR 1", "01", "+1", " 1", "2147483648", "1.1", null])("rejects malformed identity %s", value => expect(() => id(value)).toThrow());
  it("requires explicit positive creation code and trims name", () => {
    expect(create({ CODIGO: 32, DESCRICAO: "  Açúcar  " }, group)).toEqual({ CODIGO: 32, DESCRICAO: "Açúcar" });
    for (const CODIGO of [undefined, 0, -1, "1", 1.5]) expect(() => create({ CODIGO, DESCRICAO: "a" }, group)).toThrow();
  });
  it.each(["", "   ", "a".repeat(36), "Euro €", "Emoji 😀", "Control\u0080", "Line\nBreak"])("rejects invalid new descriptions %s", DESCRICAO => expect(() => create({ CODIGO: 1, DESCRICAO }, group)).toThrow());
  it("preserves legacy null/empty/control description snapshots", () => {
    for (const DESCRICAO of [null, "", "\u0080"]) expect(snapshot({ DESCRICAO }, group)).toEqual({ DESCRICAO });
  });
  it("preserves physical defaults without introducing activation or weekdays", () => {
    expect(create({ CODIGO: 1, DESCRICAO: "Expediente" }, shift)).toEqual({ CODIGO: 1, DESCRICAO: "Expediente", HORARIO_1: null, HORARIO_2: null, HORARIO_3: null, ENTRADA_1: "00:00:00", ENTRADA_2: "00:00:00", ENTRADA_3: "00:00:00", SAIDA_1: "00:00:00", SAIDA_2: "00:00:00", SAIDA_3: "00:00:00" });
    expect(create({ CODIGO: 1, DESCRICAO: "Pausa" }, pause)).toEqual({ CODIGO: 1, DESCRICAO: "Pausa", TEMPO_MAX_SEG: 0, PRODUTIVIDADE: "SIM" });
    expect(() => create({ CODIGO: 1, DESCRICAO: "a", ATIVO: "SIM" }, group)).toThrow();
  });
  it("accepts midnight crossing and overlapping clocks without inventing policy", () => {
    expect(create({ CODIGO: 1, DESCRICAO: "Noite", HORARIO_1: "SIM", ENTRADA_1: "23:00:00", SAIDA_1: "06:00:00" }, shift)["SAIDA_1"]).toBe("06:00:00");
  });
  it("requires clock representation for new TIME while preserving legacy duration snapshots", () => {
    const expected = create({ CODIGO: 1, DESCRICAO: "Dia" }, shift); delete expected["CODIGO"]; expected["ENTRADA_1"] = "838:59:59"; expected["SAIDA_1"] = "-24:00:00";
    expect(patch({ changes: { DESCRICAO: "Novo" }, expected }, shift).expected).toEqual(expected);
    for (const ENTRADA_1 of ["24:00:00", "09:60:00", "9:00:00", "09:00", "-01:00:00"]) expect(() => create({ CODIGO: 1, DESCRICAO: "a", ENTRADA_1 }, shift)).toThrow();
  });
  it("distinguishes omission, null and zero and rejects an incomplete snapshot", () => {
    const expected = { DESCRICAO: "x", TEMPO_MAX_SEG: -1, PRODUTIVIDADE: null };
    expect(patch({ changes: { TEMPO_MAX_SEG: 0, PRODUTIVIDADE: null }, expected }, pause)).toEqual({ changes: { TEMPO_MAX_SEG: 0, PRODUTIVIDADE: null }, expected });
    expect(() => patch({ changes: { TEMPO_MAX_SEG: -1 }, expected }, pause)).toThrow();
    expect(() => patch({ changes: { DESCRICAO: "a" }, expected: { DESCRICAO: "x" } }, pause)).toThrow();
    expect(() => patch({ changes: {}, expected }, pause)).toThrow();
  });
  it("rejects arbitrary SQL fields, nested values and foreign catalog selection", () => {
    for (const data of [[], { "DESCRICAO=1 --": "x" }, { DESCRICAO: {} }]) expect(() => create(data, group)).toThrow();
    expect(() => definition("__proto__")).toThrow();
    expect(() => object(Object.create({}), [])).toThrow();
  });
});
