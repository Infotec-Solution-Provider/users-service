const SUPPORTED_AUTH_COOKIE_PATHS = new Set([
	"/api/auth",
	"/_svc/users/api/auth",
]);

/** Keep the refresh cookie restricted to the externally published auth routes. */
export function resolveAuthCookiePath(configuredPath: string | undefined): string {
	const path = configuredPath || "/api/auth";
	if (!SUPPORTED_AUTH_COOKIE_PATHS.has(path)) {
		throw new Error("AUTH_COOKIE_PATH must be /api/auth or /_svc/users/api/auth");
	}
	return path;
}
