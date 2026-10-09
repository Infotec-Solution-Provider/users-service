import "express-async-errors";
import express from "express";
import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRequestError } from "@rgranatodutra/http-errors";

const mocks = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  recoverSessionData: vi.fn(),
}));
vi.mock("../src/services/instances.service", () => ({
  default: { executeQuery: mocks.executeQuery },
}));
vi.mock("../src/services/auth.service", () => ({
  default: { recoverSessionData: mocks.recoverSessionData },
}));
import service from "../src/services/crm-parameter-settings.service";
import router from "../src/controllers/crm-parameter-settings.controller";

const columns = [
  {
    name: "CODIGO",
    defaultValue: null,
    nullable: "NO",
    dataType: "int",
    columnType: "int",
  },
  {
    name: "VALIDA_CPF_CNPJ",
    defaultValue: null,
    nullable: "YES",
    dataType: "enum",
    columnType: "enum('SIM','NAO')",
  },
  {
    name: "VALIDA_AGENDAMENTOS",
    defaultValue: "S",
    nullable: "NO",
    dataType: "char",
    columnType: "char(1)",
  },
  {
    name: "LIMITE_AGENDAMENTO_DIA",
    defaultValue: null,
    nullable: "YES",
    dataType: "int",
    columnType: "int",
  },
];
const row = {
  CODIGO: 5,
  VALIDA_CPF_CNPJ: "SIM",
  VALIDA_AGENDAMENTOS: "N",
  LIMITE_AGENDAMENTO_DIA: 15,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.executeQuery.mockImplementation(
    async (_instance: string, sql: string) => {
      if (sql.includes("information_schema")) return columns;
      if (sql.startsWith("SELECT")) return [row];
      return { affectedRows: 1 };
    },
  );
  mocks.recoverSessionData.mockResolvedValue({
    instance: "tenant-a",
    userId: 7,
    role: "ADMIN",
  });
});

async function request(method: string, token?: string, body?: unknown) {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  app.use(handleRequestError);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/crm/parameter-settings?instance=tenant-b`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: token } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    return {
      status: response.status,
      cache: response.headers.get("cache-control"),
      body: await response.json(),
    };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("CRM parameter settings", () => {
  it("reads only supported columns and SQL-confirmed defaults", async () => {
    const result = await service.get("tenant-a");
    expect(result.catalog).toHaveLength(3);
    expect(
      result.catalog.find((entry) => entry.key === "VALIDA_AGENDAMENTOS")
        ?.defaultValue,
    ).toBe("S");
    expect(result.values["LIMITE_AGENDAMENTO_DIA"]).toBe("15");
    const select = mocks.executeQuery.mock.calls[1][1];
    expect(select).not.toContain("SENHA");
    expect(select).not.toContain("SELECT *");
  });
  it("uses DEFAULT, bindings and previous-value predicates in one atomic UPDATE", async () => {
    await service.save("tenant-a", {
      instance: "tenant-b",
      changes: [
        { key: "VALIDA_AGENDAMENTOS", value: null, previousValue: "N" },
        { key: "LIMITE_AGENDAMENTO_DIA", value: "20", previousValue: "15" },
      ],
    });
    const update = mocks.executeQuery.mock.calls.find((call) =>
      call[1].startsWith("UPDATE"),
    )!;
    expect(update[0]).toBe("tenant-a");
    expect(update[1]).toContain("`VALIDA_AGENDAMENTOS` = DEFAULT");
    expect(update[1]).toContain(
      "WHERE CODIGO = ? AND `VALIDA_AGENDAMENTOS` <=> ?",
    );
    expect(update[2]).toEqual(["20", 5, "N", "15"]);
  });
  it.each([
    { key: "VALIDA_CPF_CNPJ", value: "S", previousValue: "SIM" },
    { key: "SENHA_TELNET", value: "x", previousValue: null },
    { key: "AGENDA_SABADO", value: "SIM", previousValue: null },
    { key: "LIMITE_AGENDAMENTO_DIA", value: "-1", previousValue: "15" },
    { key: "LIMITE_AGENDAMENTO_DIA", value: "1.5", previousValue: "15" },
  ])(
    "rejects unsupported fields and invalid encodings before any write: $key",
    async (change) => {
      await expect(
        service.save("tenant-a", { changes: [change] }),
      ).rejects.toThrow();
      expect(
        mocks.executeQuery.mock.calls.some((call) =>
          call[1].startsWith("UPDATE"),
        ),
      ).toBe(false);
    },
  );
  it("rejects a stale editor before writing", async () => {
    await expect(
      service.save("tenant-a", {
        changes: [
          { key: "VALIDA_CPF_CNPJ", value: "NAO", previousValue: "NAO" },
        ],
      }),
    ).rejects.toThrow(/outra pessoa/);
  });
  it("reports a concurrent change detected by SQL", async () => {
    mocks.executeQuery.mockImplementation(async (_instance, sql) =>
      sql.includes("information_schema")
        ? columns
        : sql.startsWith("SELECT")
          ? [row]
          : { affectedRows: 0 },
    );
    await expect(
      service.save("tenant-a", {
        changes: [
          { key: "VALIDA_CPF_CNPJ", value: "NAO", previousValue: "SIM" },
        ],
      }),
    ).rejects.toThrow(/Recarregue/);
  });
  it("does not create a partial legacy row when the table is empty", async () => {
    mocks.executeQuery.mockImplementation(async (_instance, sql) =>
      sql.includes("information_schema") ? columns : [],
    );
    await expect(service.get("tenant-a")).rejects.toThrow(/CRM legado/);
    expect(
      mocks.executeQuery.mock.calls.some((call) =>
        call[1].startsWith("INSERT"),
      ),
    ).toBe(false);
  });
  it.each(["GET", "PATCH"])(
    "requires authentication and admin access for %s",
    async (method) => {
      expect((await request(method)).status).toBe(401);
      mocks.recoverSessionData.mockResolvedValue({
        instance: "tenant-a",
        userId: 7,
        role: "USER",
      });
      expect((await request(method, "operator")).status).toBe(403);
      expect(mocks.executeQuery).not.toHaveBeenCalled();
    },
  );
  it("uses only the authenticated tenant and disables caching", async () => {
    const result = await request("GET", "admin");
    expect(result.status).toBe(200);
    expect(result.cache).toBe("no-store");
    expect(
      mocks.executeQuery.mock.calls.every((call) => call[0] === "tenant-a"),
    ).toBe(true);
  });
});
