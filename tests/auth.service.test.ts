import jwt from "jsonwebtoken";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import instancesService from "../src/services/instances.service";

process.env.JWT_SECRET_KEY = "test-jwt-secret-with-sufficient-entropy";
process.env.REFRESH_TOKEN_PEPPER = "test-refresh-pepper-with-sufficient-entropy";
process.env.AUTH_REFRESH_ENABLED = "true";
process.env.ACCESS_TOKEN_TTL = "15m";
process.env.REFRESH_TOKEN_IDLE_DAYS = "30";

interface StoredSession {
  session_id: string;
  user_id: number;
  current_token_hash: string;
  previous_token_hash: string | null;
  previous_valid_until: string | null;
  expires_at: string;
  revoked_at: string | null;
}

const baseUser = {
  CODIGO: 42,
  LOGIN: "operator",
  SENHA: "secret",
  SETOR: 7,
  NIVEL: "ADMIN",
  NOME: "Operator",
  ATIVO: "SIM",
};

let authService: typeof import("../src/services/auth.service").default;
let session: StoredSession | undefined;
let user = { ...baseUser };

beforeAll(async () => {
  authService = (await import("../src/services/auth.service")).default;
});

beforeEach(() => {
  session = undefined;
  user = { ...baseUser };
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.spyOn(instancesService, "executeQuery").mockImplementation(
    (async (_instance: string, query: string, parameters: unknown[]) => {
      if (query.includes("SELECT * FROM operadores WHERE LOGIN")) return [user];
      if (query.includes("SELECT * FROM operadores WHERE CODIGO")) return [user];
      if (query.includes("CREATE TABLE") || query.includes("DELETE FROM auth_refresh_sessions")) return {};
      if (query.includes("INSERT INTO auth_refresh_sessions")) {
        session = {
          session_id: String(parameters[0]),
          user_id: Number(parameters[1]),
          current_token_hash: String(parameters[2]),
          previous_token_hash: null,
          previous_valid_until: null,
          expires_at: String(parameters[3]),
          revoked_at: null,
        };
        return { affectedRows: 1 };
      }
      if (query.includes("SELECT session_id")) return session ? [session] : [];
      if (query.includes("SET previous_token_hash = current_token_hash")) {
        if (!session || session.revoked_at) return { affectedRows: 0 };
        const expectedHash = String(parameters[5]);
        const expectsPrevious = query.includes("AND previous_token_hash = ?");
        const expectedMatches = expectsPrevious
          ? session.previous_token_hash === expectedHash
          : session.current_token_hash === expectedHash;
        if (!expectedMatches) return { affectedRows: 0 };
        session.previous_token_hash = session.current_token_hash;
        session.current_token_hash = String(parameters[0]);
        session.previous_valid_until = String(parameters[1]);
        session.expires_at = String(parameters[2]);
        return { affectedRows: 1 };
      }
      if (query.includes("SET revoked_at = CURRENT_TIMESTAMP")) {
        if (session) session.revoked_at = new Date().toISOString();
        return { affectedRows: session ? 1 : 0 };
      }
      throw new Error(`Unexpected query in test: ${query}`);
    }) as typeof instancesService.executeQuery,
  );
});

describe("refresh authentication", () => {
  it("issues a short access token and rotates the refresh token with sliding expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const login = await authService.login("tenant-a", "operator", "secret", "browser-a");
    expect(login.refreshToken).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/i);
    expect(jwt.decode(login.token)).toMatchObject({
      instance: "tenant-a",
      userId: 42,
      sid: login.refreshToken!.split(".")[0],
      typ: "access",
    });

    const firstExpiry = new Date(session!.expires_at).getTime();
    vi.setSystemTime(new Date("2026-01-30T00:00:00Z"));
    const refreshed = await authService.refresh("tenant-a", login.refreshToken!, "browser-a");
    expect(refreshed.refreshToken).not.toBe(login.refreshToken);
    expect(session!.previous_token_hash).not.toBeNull();
    expect(new Date(session!.expires_at).getTime()).toBeGreaterThan(firstExpiry + 28 * 24 * 60 * 60 * 1000);
  });

  it("allows one immediate recovery with the previous token", async () => {
    const login = await authService.login("tenant-a", "operator", "secret");
    const firstRefresh = await authService.refresh("tenant-a", login.refreshToken!);
    const recovered = await authService.refresh("tenant-a", login.refreshToken!);
    expect(recovered.refreshToken).not.toBe(firstRefresh.refreshToken);
    expect(session!.revoked_at).toBeNull();
  });

  it("revokes a session when an old refresh token is replayed after the grace window", async () => {
    const login = await authService.login("tenant-a", "operator", "secret");
    await authService.refresh("tenant-a", login.refreshToken!);
    session!.previous_valid_until = new Date(Date.now() - 1_000).toISOString();

    await expect(authService.refresh("tenant-a", login.refreshToken!)).rejects.toThrow(
      "refresh token replay detected",
    );
    expect(session!.revoked_at).not.toBeNull();
  });

  it("keeps accepting a valid seven-day legacy token during rollout", async () => {
    const legacyToken = jwt.sign(
      { instance: "tenant-a", userId: 42, sectorId: 7, role: "ADMIN", name: "Operator" },
      process.env.JWT_SECRET_KEY!,
      { expiresIn: "7d" },
    );
    await expect(authService.recoverSessionData(legacyToken)).resolves.toMatchObject({ userId: 42 });
  });

  it("rejects inactive operators during login", async () => {
    user.ATIVO = "NAO";
    await expect(authService.login("tenant-a", "operator", "secret")).rejects.toThrow(
      "invalid login or password",
    );
  });
});
