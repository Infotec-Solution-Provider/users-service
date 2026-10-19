import { describe, expect, it } from "vitest";
import { resolveAuthCookiePath } from "../src/utils/auth-cookie-path";

describe("refresh cookie path configuration", () => {
	it("preserves the existing direct API default", () => {
		expect(resolveAuthCookiePath(undefined)).toBe("/api/auth");
		expect(resolveAuthCookiePath("")).toBe("/api/auth");
	});

	it.each(["/api/auth", "/_svc/users/api/auth"])("supports the published auth path %s", (path) => {
		expect(resolveAuthCookiePath(path)).toBe(path);
	});

	it.each([
		"/", "/api", "/_svc/users", "https://example.test/api/auth", "/api/auth; Secure",
		"/api/auth\r\nSet-Cookie: other=value", "/api/auth/", " /api/auth", "/_svc/whatsapp/api/auth",
	])("rejects broad, malformed or unrelated paths: %s", (path) => {
		expect(() => resolveAuthCookiePath(path)).toThrow("AUTH_COOKIE_PATH");
	});
});
