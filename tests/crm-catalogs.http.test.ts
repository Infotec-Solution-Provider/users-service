import "express-async-errors";
import express, { type NextFunction, type Request, type Response } from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/services/auth.service", () => ({ default: { recoverSessionData: vi.fn() } }));
import { createCrmCatalogsRouter } from "../src/controllers/crm-catalogs.controller";
import { CrmCatalogsService } from "../src/services/crm-catalogs/catalogs.service";

const execute = vi.fn(), service = new CrmCatalogsService(execute);
const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.get("Authorization");
  if (!token) { res.status(401).json({ message: "Authentication required" }); return; }
  req.session = { instance: token === "tenant-b" ? "tenant-b" : "tenant-a", userId: 8, role: token === "operator" ? "ATIVO" : "ADMIN" } as Request["session"];
  next();
};
const app = express(); app.use(express.json()); app.use("/api", createCrmCatalogsRouter(service, authenticate));
let server: ReturnType<typeof app.listen>, base: string;
beforeAll(async () => {
  server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, "info").mockImplementation(() => {}); });
async function request(path: string, method = "GET", token: string | null = "admin", body?: unknown) {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, cache: response.headers.get("cache-control"), body: response.status === 204 ? null : await response.json() };
}
describe("authenticated CRM catalog routes", () => {
  it.each(["user-groups", "shifts", "pause-reasons"])("requires authentication and admin for %s", async path => {
    expect((await request(`/crm/${path}`, "GET", null)).status).toBe(401);
    expect((await request(`/crm/${path}`, "GET", "operator")).status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });
  it("lists using session tenant and disables caching", async () => {
    execute.mockResolvedValueOnce([{ totalRows: 0 }]).mockResolvedValueOnce([]);
    const result = await request("/crm/user-groups", "GET", "tenant-b");
    expect(result).toMatchObject({ status: 200, cache: "no-store", body: { data: [], page: { current: 1, totalRows: 0 } } });
    expect(execute.mock.calls.every(call => call[0] === "tenant-b")).toBe(true);
    expect((await request("/crm/user-groups?instance=tenant-a")).status).toBe(400);
  });
  it("creates, edits and deletes using the intended envelopes", async () => {
    execute.mockResolvedValueOnce({ affectedRows: 1 }).mockResolvedValueOnce([{ CODIGO: 12, DESCRICAO: "A" }]);
    expect(await request("/crm/user-groups", "POST", "admin", { CODIGO: 12, DESCRICAO: "A" })).toMatchObject({ status: 201, body: { data: { CODIGO: 12, DESCRICAO: "A" } } });
    execute.mockResolvedValueOnce({ affectedRows: 1 }).mockResolvedValueOnce([{ CODIGO: 12, DESCRICAO: "B" }]);
    expect(await request("/crm/user-groups/12", "PATCH", "admin", { changes: { DESCRICAO: "B" }, expected: { DESCRICAO: "A" } })).toMatchObject({ status: 200, body: { data: { CODIGO: 12, DESCRICAO: "B" } } });
    execute.mockResolvedValueOnce({ affectedRows: 1 }); expect((await request("/crm/user-groups/12", "DELETE", "admin", { expected: { DESCRICAO: "B" } })).status).toBe(204);
  });
  it("projects no SQL from an ambiguous write failure", async () => {
    execute.mockRejectedValueOnce(new Error("INSERT secret data"));
    const result = await request("/crm/pause-reasons", "POST", "admin", { CODIGO: 3, DESCRICAO: "Pausa" });
    expect(result).toMatchObject({ status: 503, body: { code: "CRM_CATALOG_WRITE_UNKNOWN", outcome: "UNKNOWN" } }); expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("exposes dedicated membership and shift association routes", async () => {
    execute.mockResolvedValueOnce({ affectedRows: 1 }); expect(await request("/crm/user-groups/3/members", "POST", "admin", { CODIGO: 30, OPERADOR: 9 })).toMatchObject({ status: 201, body: { data: { CODIGO: 30, GRUPO: 3, OPERADOR: 9 } } });
    execute.mockResolvedValueOnce({ affectedRows: 1 }); expect((await request("/crm/user-groups/3/members/30", "DELETE", "admin", { expected: { OPERADOR: 9 } })).status).toBe(204);
    execute.mockResolvedValueOnce([{ CODIGO: 9, HORARIO: 0 }]).mockResolvedValueOnce({ affectedRows: 1 }).mockResolvedValueOnce([{ CODIGO: 9, HORARIO: null }]);
    expect(await request("/crm/users/9/shift", "PATCH", "admin", { HORARIO: null, expected: { HORARIO: 0 } })).toMatchObject({ status: 200, body: { data: { CODIGO: 9, HORARIO: null } } });
  });
});
