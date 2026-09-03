import { BadRequestError, UnauthenticatedError } from "@rgranatodutra/http-errors";
import { Request, Response, Router } from "express";
import AuthService from "../services/auth.service";
import loginRateLimit from "../middlewares/login-rate-limit.middleware";

class AuthController {
	public readonly router: Router;

	constructor() {
		this.router = Router();

		this.router.post("/auth/login", loginRateLimit, this.login.bind(this));
		this.router.post("/auth/refresh", this.refresh.bind(this));
		this.router.post("/auth/logout", this.logout.bind(this));
		this.router.get("/auth/session", this.recoverSessionData.bind(this));
	}

	private async login(req: Request, res: Response): Promise<Response> {
		const { LOGIN, SENHA, instance } = req.body;

		if (!instance || !LOGIN || !SENHA) throw new BadRequestError("invalid login payload");
		const { refreshToken, ...data } = await AuthService.login(instance, LOGIN, SENHA, req.headers["user-agent"]);
		if (refreshToken) this.setRefreshCookie(res, instance, refreshToken);

		return res.status(200).json({ message: "successful authentication", data: data });
	}

	private async refresh(req: Request, res: Response): Promise<Response> {
		if (!AuthService.isRefreshEnabled()) {
			return res.status(503).json({ message: "refresh sessions are disabled" });
		}
		const instance = req.body?.instance;
		if (!instance || typeof instance !== "string") throw new BadRequestError("instance not provided or invalid");
		const refreshToken = this.readCookie(req, AuthService.getRefreshCookieName(instance));
		if (!refreshToken) throw new UnauthenticatedError("refresh token not provided");

		const { refreshToken: nextRefreshToken, ...data } = await AuthService.refresh(
			instance,
			refreshToken,
			req.headers["user-agent"],
		);
		if (!nextRefreshToken) throw new UnauthenticatedError("refresh session unavailable");
		this.setRefreshCookie(res, instance, nextRefreshToken);
		return res.status(200).json({ message: "successful refreshed session", data });
	}

	private async logout(req: Request, res: Response): Promise<Response> {
		const instance = req.body?.instance;
		if (!instance || typeof instance !== "string") throw new BadRequestError("instance not provided or invalid");
		const cookieName = AuthService.getRefreshCookieName(instance);
		await AuthService.logout(instance, this.readCookie(req, cookieName));
		res.clearCookie(cookieName, this.cookieOptions());
		return res.status(204).send();
	}

	private async recoverSessionData(req: Request, res: Response): Promise<Response> {
		const authorization = req.headers["authorization"];
		if (!authorization) throw new UnauthenticatedError("token not provided");
		const token = authorization.replaceAll("Bearer ", "").trim();
		const data = await AuthService.recoverSessionData(token);

		return res.status(200).json({ message: "successful recovered session data", data });
	}

	private setRefreshCookie(res: Response, instance: string, token: string): void {
		res.cookie(AuthService.getRefreshCookieName(instance), token, {
			...this.cookieOptions(),
			maxAge: AuthService.getRefreshCookieMaxAgeMs(),
		});
	}

	private cookieOptions() {
		const configuredSecure = process.env["AUTH_COOKIE_SECURE"];
		return {
			httpOnly: true,
			secure: process.env["NODE_ENV"] === "production" || configuredSecure?.toLowerCase() === "true",
			sameSite: "lax" as const,
			path: "/api/auth",
		};
	}

	private readCookie(req: Request, name: string): string | undefined {
		for (const cookie of (req.headers.cookie || "").split(";")) {
			const separator = cookie.indexOf("=");
			if (separator < 0) continue;
			if (cookie.slice(0, separator).trim() === name) {
				try {
					return decodeURIComponent(cookie.slice(separator + 1).trim());
				} catch {
					return undefined;
				}
			}
		}
		return undefined;
	}
}

export default new AuthController();
