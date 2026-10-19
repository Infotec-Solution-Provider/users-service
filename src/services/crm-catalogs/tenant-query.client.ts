import axios from "axios";
export class TenantQueryError extends Error { constructor(public readonly code: string) { super(code); } }
export type ExecuteQuery = <T>(instance: string, sql: string, params: unknown[]) => Promise<T>;
/** One attempt only. A transport error can follow a successful write. */
export const executeQuery: ExecuteQuery = async <T>(instance: string, query: string, parameters: unknown[]) => {
  try {
    const result = await axios.post<{ result: T }>(`${(process.env["INSTANCES_API_URL"] || "http://localhost:8000").replace(/\/$/, "")}/api/instances/${encodeURIComponent(instance)}/query-once`, { query, parameters }, { timeout: 20_000, maxRedirects: 0, maxContentLength: 1_048_576, maxBodyLength: 65_536 });
    if (!result.data || !Object.hasOwn(result.data, "result")) throw new TenantQueryError("TENANT_QUERY_FAILED");
    return result.data.result;
  } catch (error) {
    if (error instanceof TenantQueryError) throw error;
    if (axios.isAxiosError(error) && error.response?.status === 409 && error.response.data?.code === "TENANT_DUPLICATE_KEY") throw new TenantQueryError("TENANT_DUPLICATE_KEY");
    throw new TenantQueryError("TENANT_QUERY_FAILED");
  }
};
