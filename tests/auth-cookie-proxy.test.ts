import "express-async-errors";
import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleRequestError } from "@rgranatodutra/http-errors";

const { executeQuery } = vi.hoisted(() => ({ executeQuery: vi.fn() }));
vi.mock("../src/services/instances.service", () => ({ default: { executeQuery } }));

type StoredSession = {
	session_id: string;
	user_id: number;
	current_token_hash: string;
	previous_token_hash: string | null;
	previous_valid_until: string | null;
	expires_at: string;
	revoked_at: string | null;
};

beforeEach(() => {
	vi.resetModules();
	vi.stubEnv("JWT_SECRET_KEY", "local-http-test-jwt-secret");
	vi.stubEnv("REFRESH_TOKEN_PEPPER", "local-http-test-refresh-pepper");
	vi.stubEnv("AUTH_REFRESH_ENABLED", "true");
	vi.stubEnv("AUTH_COOKIE_SECURE", "true");
	vi.stubEnv("AUTH_COOKIE_PATH", "");
	let session: StoredSession | undefined;
	const user = { CODIGO: 42, LOGIN: "operator", SENHA: "local-password", SETOR: 7, NIVEL: "ADMIN", NOME: "Operator", ATIVO: "SIM" };
	executeQuery.mockImplementation(async (_instance: string, query: string, values: unknown[]) => {
		if (query.startsWith("SELECT * FROM operadores WHERE LOGIN")) {
			return values[0] === user.LOGIN && values[1] === user.SENHA ? [user] : [];
		}
		if (query.startsWith("SELECT * FROM operadores WHERE CODIGO")) return [user];
		if (query.includes("CREATE TABLE") || query.includes("DELETE FROM auth_refresh_sessions")) return {};
		if (query.includes("INSERT INTO auth_refresh_sessions")) {
			session = { session_id: String(values[0]), user_id: Number(values[1]), current_token_hash: String(values[2]), previous_token_hash: null, previous_valid_until: null, expires_at: String(values[3]), revoked_at: null };
			return { affectedRows: 1 };
		}
		if (query.includes("SELECT session_id")) return session && values[0] === session.session_id ? [session] : [];
		if (query.includes("SET previous_token_hash = current_token_hash")) {
			if (!session || session.revoked_at || session.current_token_hash !== values[5]) return { affectedRows: 0 };
			session.previous_token_hash = session.current_token_hash;
			session.current_token_hash = String(values[0]);
			session.previous_valid_until = String(values[1]);
			session.expires_at = String(values[2]);
			return { affectedRows: 1 };
		}
		if (query.includes("SET revoked_at = CURRENT_TIMESTAMP")) {
			if (session) session.revoked_at = new Date().toISOString();
			return { affectedRows: session ? 1 : 0 };
		}
		throw new Error("Unexpected test query");
	});
});

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

// Select only cookies that a browser would send for the externally visible path.
function cookieForPath(setCookie: string, requestPath: string): string | undefined {
	const path = /(?:^|;)\s*Path=([^;]+)/i.exec(setCookie)?.[1] ?? "/";
	return requestPath === path || requestPath.startsWith(`${path}/`) ? setCookie.split(";")[0] : undefined;
}

async function withAuthServer(prefix: string, run: (base: string) => Promise<void>) {
	const controller = (await import("../src/controllers/auth.controller")).default;
	const app = express();
	app.use(express.json());
	app.use(prefix, controller.router);
	app.use(handleRequestError);
	const server = app.listen(0, "127.0.0.1");
	await new Promise<void>(resolve => server.once("listening", resolve));
	try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
	finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

describe("HTTP login, reload refresh and logout cookie scope", () => {
	it.each([
		{ prefix: "/api", cookiePath: "/api/auth", configured: "" },
		{ prefix: "/_svc/users/api", cookiePath: "/_svc/users/api/auth", configured: "/_svc/users/api/auth" },
	])("renews after losing the in-memory token through $prefix", async ({ prefix, cookiePath, configured }) => {
		vi.stubEnv("AUTH_COOKIE_PATH", configured);
		await withAuthServer(prefix, async base => {
			const post = (path: string, cookie?: string, body: unknown = { instance: "tenant-a" }) => fetch(`${base}${prefix}/auth/${path}`, {
				method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body),
			});
			const login = await post("login", undefined, { instance: "tenant-a", LOGIN: "operator", SENHA: "local-password" });
			expect(login.status).toBe(200);
			const loginCookie = login.headers.get("set-cookie")!;
			expect(loginCookie).toContain(`Path=${cookiePath};`);
			expect(loginCookie).toContain("HttpOnly");
			expect(loginCookie).toContain("Secure");
			expect(loginCookie).toContain("SameSite=Lax");
			const refresh = await post("refresh", cookieForPath(loginCookie, `${prefix}/auth/refresh`));
			expect(refresh.status).toBe(200);
			const refreshed = await refresh.json() as { data: { token: string; user: { CODIGO: number } } };
			expect(refreshed.data.user.CODIGO).toBe(42);
			const session = await fetch(`${base}${prefix}/auth/session`, { headers: { Authorization: `Bearer ${refreshed.data.token}` } });
			expect(session.status).toBe(200);
			const nextCookie = refresh.headers.get("set-cookie")!;
			expect(nextCookie).toContain(`Path=${cookiePath};`);
			expect(nextCookie.split(";")[0]).not.toBe(loginCookie.split(";")[0]);
			const logout = await post("logout", cookieForPath(nextCookie, `${prefix}/auth/logout`));
			expect(logout.status).toBe(204);
			expect(logout.headers.get("set-cookie")).toContain(`Path=${cookiePath};`);
			expect(logout.headers.get("set-cookie")).toContain("Expires=Thu, 01 Jan 1970");
			expect((await post("refresh", cookieForPath(nextCookie, `${prefix}/auth/refresh`))).status).toBe(401);
		});
	});

	it("reproduces the proxy failure when the default direct cookie path is used", async () => {
		await withAuthServer("/_svc/users/api", async base => {
			const login = await fetch(`${base}/_svc/users/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instance: "tenant-a", LOGIN: "operator", SENHA: "local-password" }) });
			expect(login.status).toBe(200);
			const cookie = cookieForPath(login.headers.get("set-cookie")!, "/_svc/users/api/auth/refresh");
			expect(cookie).toBeUndefined();
			executeQuery.mockClear();
			const refresh = await fetch(`${base}/_svc/users/api/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instance: "tenant-a" }) });
			expect(refresh.status).toBe(401);
			expect(executeQuery).not.toHaveBeenCalled();
		});
	});
});
