import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeQuery } from "../src/services/crm-catalogs/tenant-query.client";
afterEach(() => vi.restoreAllMocks());
describe("single-attempt catalog transport", () => {
  it("uses a tenant-encoded endpoint without redirects or retries", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { result: { affectedRows: 1 } } });
    expect(await executeQuery("tenant / b", "UPDATE horarios SET DESCRICAO=?", ["Dia"])).toEqual({ affectedRows: 1 });
    expect(post).toHaveBeenCalledWith(expect.stringContaining("tenant%20%2F%20b/query-once"), { query: "UPDATE horarios SET DESCRICAO=?", parameters: ["Dia"] }, expect.objectContaining({ maxRedirects: 0, timeout: 20_000 }));
  });
  it("discards axios config, SQL, parameters and ambiguous response details", async () => {
    const post = vi.spyOn(axios, "post").mockRejectedValue({ isAxiosError: true, config: { data: "secret sql" }, response: { status: 503, data: { message: "private" } } });
    try { await executeQuery("a", "INSERT", []); throw new Error("Expected error"); } catch (error) { expect(error).toMatchObject({ code: "TENANT_QUERY_FAILED" }); expect(JSON.stringify(error)).not.toMatch(/secret|private/); }
    expect(post).toHaveBeenCalledTimes(1);
  });
  it("recognizes only the safe duplicate code and rejects malformed acknowledgements", async () => {
    const post = vi.spyOn(axios, "post").mockRejectedValueOnce({ isAxiosError: true, response: { status: 409, data: { code: "TENANT_DUPLICATE_KEY" } } }).mockResolvedValueOnce({ data: {} });
    await expect(executeQuery("a", "INSERT", [])).rejects.toMatchObject({ code: "TENANT_DUPLICATE_KEY" });
    await expect(executeQuery("a", "INSERT", [])).rejects.toMatchObject({ code: "TENANT_QUERY_FAILED" }); expect(post).toHaveBeenCalledTimes(2);
  });
});
