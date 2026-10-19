import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CrmCatalogsService } from "../src/services/crm-catalogs/catalogs.service";
import { SalesTypesService } from "../src/services/crm-catalogs/sales-types.service";
import { TenantQueryError, type ExecuteQuery } from "../src/services/crm-catalogs/tenant-query.client";

const mysqlSuite = process.env["CRM_USERS_MYSQL_PORT"] ? describe : describe.skip;
mysqlSuite("real MySQL legacy catalogs, two tenants and two connection charsets", () => {
  const require = createRequire(import.meta.url);
  const databases = [`crm_users_a_${randomBytes(5).toString("hex")}`, `crm_users_b_${randomBytes(5).toString("hex")}`];
  const connections = new Map<string, any>(); let control: any;
  const config = { host: "127.0.0.1", port: Number(process.env["CRM_USERS_MYSQL_PORT"]), user: "root", password: "", dateStrings: true };
  const execute: ExecuteQuery = async <T>(instance: string, sql: string, params: unknown[]): Promise<T> => {
    try { const [rows] = await connections.get(instance).query(sql, params); return rows; }
    catch (error: any) { if (error.code === "ER_DUP_ENTRY") throw new TenantQueryError("TENANT_DUPLICATE_KEY"); throw error; }
  };
  const service = new CrmCatalogsService(execute), sales = new SalesTypesService(execute), session = (instance: string) => ({ instance, userId: 1, role: "ADMIN" });
  beforeAll(async () => {
    const mysql = require(process.env["CRM_USERS_MYSQL_MODULE"] || "mysql2/promise");
    vi.spyOn(console, "info").mockImplementation(() => {});
    control = await mysql.createConnection(config);
    for (const database of databases) {
      await control.query(`CREATE DATABASE \`${database}\` CHARACTER SET latin1 COLLATE latin1_swedish_ci`);
      const connection = await mysql.createConnection({ ...config, database, charset: database === databases[0] ? "latin1_swedish_ci" : "utf8mb4_unicode_ci" });
      connections.set(database, connection);
      await connection.query("CREATE TABLE grupos_operador(CODIGO INT PRIMARY KEY,DESCRICAO VARCHAR(35) NULL) ENGINE=InnoDB");
      await connection.query("CREATE TABLE gruposxoperadores(CODIGO INT PRIMARY KEY,GRUPO INT NULL DEFAULT 0,OPERADOR INT NULL DEFAULT 0) ENGINE=InnoDB");
      await connection.query("CREATE TABLE horarios(CODIGO INT PRIMARY KEY,DESCRICAO VARCHAR(50) NULL DEFAULT '',HORARIO_1 ENUM('SIM','NAO') NULL,HORARIO_2 ENUM('SIM','NAO') NULL,HORARIO_3 ENUM('SIM','NAO') NULL,ENTRADA_1 TIME NULL DEFAULT '00:00:00',ENTRADA_2 TIME NULL DEFAULT '00:00:00',ENTRADA_3 TIME NULL DEFAULT '00:00:00',SAIDA_1 TIME NULL DEFAULT '00:00:00',SAIDA_2 TIME NULL DEFAULT '00:00:00',SAIDA_3 TIME NULL DEFAULT '00:00:00') ENGINE=InnoDB");
      await connection.query("CREATE TABLE motivos_pausa(CODIGO INT PRIMARY KEY,DESCRICAO VARCHAR(50) NULL,TEMPO_MAX_SEG INT NULL DEFAULT 0,PRODUTIVIDADE ENUM('SIM','NAO') NULL DEFAULT 'SIM') ENGINE=InnoDB");
      await connection.query("CREATE TABLE pausas_realizadas(CODIGO INT PRIMARY KEY,COD_PAUSA INT NULL) ENGINE=InnoDB");
      await connection.query("CREATE TABLE operadores(CODIGO INT PRIMARY KEY,NOME VARCHAR(255),ATIVO ENUM('SIM','NAO') DEFAULT 'SIM',HORARIO INT NULL DEFAULT 0) ENGINE=InnoDB");
      await connection.query("INSERT INTO operadores(CODIGO,NOME) VALUES (1,'Teste')");
      await connection.query("CREATE TABLE vendas(ID VARCHAR(4) NOT NULL,NOME VARCHAR(30) NOT NULL,PAGAMENTO DECIMAL(4,2) NOT NULL) ENGINE=InnoDB");
    }
  });
  afterAll(async () => {
    for (const connection of connections.values()) await connection.end();
    if (control) { for (const database of databases) await control.query(`DROP DATABASE IF EXISTS \`${database}\``); await control.end(); }
    vi.restoreAllMocks();
  });
  for (const database of databases) {
    const auth = session(database);
    it(`roundtrips accents and binary case-only CAS with ${database === databases[0] ? "latin1" : "utf8mb4"} connection`, async () => {
      const row = await service.create(auth, "user-groups", { CODIGO: 11, DESCRICAO: "Açúcar" }); expect(row["DESCRICAO"]).toBe("Açúcar");
      const edited = await service.patch(auth, "user-groups", "11", { changes: { DESCRICAO: "açúcar" }, expected: { DESCRICAO: "Açúcar" } }); expect(edited["DESCRICAO"]).toBe("açúcar");
      await expect(service.patch(auth, "user-groups", "11", { changes: { DESCRICAO: "Outro" }, expected: { DESCRICAO: "Açúcar" } })).rejects.toMatchObject({ code: "CRM_CATALOG_CHANGED" });
      await service.delete(auth, "user-groups", "11", { expected: { DESCRICAO: "açúcar" } });
    });
    it(`preserves explicit null/zero and historical TIME for ${database}`, async () => {
      const created = await service.create(auth, "shifts", { CODIGO: 12, DESCRICAO: "Noite", HORARIO_1: "SIM", ENTRADA_1: "23:00:00", SAIDA_1: "06:00:00" });
      const { CODIGO: _, ...expected } = created;
      await connections.get(database).query("UPDATE horarios SET ENTRADA_2='838:59:59',SAIDA_2='-24:00:00',HORARIO_2=NULL WHERE CODIGO=12");
      const legacy = await service.detail(auth, "shifts", "12"); const { CODIGO: __, ...original } = legacy;
      expect(original["ENTRADA_2"]).toBe("838:59:59"); const edited = await service.patch(auth, "shifts", "12", { changes: { DESCRICAO: "Madrugada" }, expected: original }); expect(edited["SAIDA_2"]).toBe("-24:00:00");
      expect(expected["ENTRADA_2"]).toBe("00:00:00");
      await service.setShift(auth, "1", { HORARIO: 12, expected: { HORARIO: 0 } });
      const { CODIGO: ___, ...beforeDelete } = edited;
      await expect(service.delete(auth, "shifts", "12", { expected: beforeDelete })).rejects.toMatchObject({ code: "CRM_CATALOG_REFERENCED" });
      await service.setShift(auth, "1", { HORARIO: null, expected: { HORARIO: 12 } }); await service.delete(auth, "shifts", "12", { expected: beforeDelete });
    });
    it(`protects membership and pause history with real SQL for ${database}`, async () => {
      await service.create(auth, "user-groups", { CODIGO: 20, DESCRICAO: "Grupo" });
      const results = await Promise.allSettled([service.addMember(auth, "20", { CODIGO: 21, OPERADOR: 1 }), service.addMember(auth, "20", { CODIGO: 22, OPERADOR: 1 })]);
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1); expect((await service.members(auth, "20"))).toHaveLength(1);
      await expect(service.delete(auth, "user-groups", "20", { expected: { DESCRICAO: "Grupo" } })).rejects.toMatchObject({ code: "CRM_CATALOG_REFERENCED" });
      await service.removeMember(auth, "20", "21", { expected: { OPERADOR: 1 } }); await service.delete(auth, "user-groups", "20", { expected: { DESCRICAO: "Grupo" } });
      const row = await service.create(auth, "pause-reasons", { CODIGO: 31, DESCRICAO: "Café", TEMPO_MAX_SEG: 0, PRODUTIVIDADE: null }); const { CODIGO: _, ...expected } = row;
      await connections.get(database).query("INSERT INTO pausas_realizadas(CODIGO,COD_PAUSA) VALUES (1,31)");
      await expect(service.delete(auth, "pause-reasons", "31", { expected })).rejects.toMatchObject({ code: "CRM_CATALOG_REFERENCED" });
      const result = await service.patch(auth, "pause-reasons", "31", { changes: { TEMPO_MAX_SEG: null }, expected }); expect(result["TEMPO_MAX_SEG"]).toBeNull();
    });
    it(`retains string IDs and neutral exact decimals for legacy sales in ${database}`, async () => {
      await sales.create(auth, { ID: "001", NOME: "Cartão", PAGAMENTO: "1.25" });
      expect(await sales.detail(auth, "001")).toEqual({ ID: "001", NOME: "Cartão", PAGAMENTO: "1.25" });
      await sales.patch(auth, "001", { changes: { NOME: "CARTÃO", PAGAMENTO: "0" }, expected: { ID: "001", NOME: "Cartão", PAGAMENTO: "1.25" } });
      await sales.delete(auth, "001", { expected: { ID: "001", NOME: "CARTÃO", PAGAMENTO: "0.00" } });
      await connections.get(database).query("INSERT INTO vendas VALUES ('DUP','A',1),('DUP','B',2)");
      await expect(sales.patch(auth, "DUP", { changes: { NOME: "Novo" }, expected: { ID: "DUP", NOME: "A", PAGAMENTO: "1.00" } })).rejects.toMatchObject({ code: "CRM_SALES_TYPE_CHANGED" });
      const [count] = await connections.get(database).query("SELECT COUNT(*) AS total FROM vendas WHERE ID='DUP'"); expect(Number(count[0].total)).toBe(2);
    });
  }
  it("isolates same catalog codes between two tenants", async () => {
    await service.create(session(databases[0]!), "user-groups", { CODIGO: 99, DESCRICAO: "Primeiro" }); await service.create(session(databases[1]!), "user-groups", { CODIGO: 99, DESCRICAO: "Segundo" });
    expect((await service.detail(session(databases[0]!), "user-groups", "99"))["DESCRICAO"]).toBe("Primeiro"); expect((await service.detail(session(databases[1]!), "user-groups", "99"))["DESCRICAO"]).toBe("Segundo");
  });
});
