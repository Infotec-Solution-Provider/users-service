import "dotenv/config";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { UnauthenticatedError } from "@rgranatodutra/http-errors";
import { User } from "@in.pulse-crm/sdk";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import instancesService from "./instances.service";

const LEGACY_ACCESS_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const PREVIOUS_TOKEN_GRACE_SECONDS = 10;

interface SessionData extends JwtPayload {
	instance: string;
	userId: number;
	sectorId: number;
	role: string;
	name: string;
	sid?: string;
	typ?: "access";
}

interface RefreshSessionRow {
	session_id: string;
	user_id: number;
	current_token_hash: string;
	previous_token_hash: string | null;
	previous_valid_until: Date | string | null;
	expires_at: Date | string;
	revoked_at: Date | string | null;
}

interface MutationResult {
	affectedRows?: number;
}

export interface AuthenticationResult {
	token: string;
	user: User;
	refreshToken?: string;
}

function requireEnvironmentSecret(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`${name} must be configured`);
	return value;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatMysqlDate(value: Date): string {
	return value.toISOString().slice(0, 19).replace("T", " ");
}

function isDateAfterNow(value: Date | string | null): boolean {
	if (!value) return false;
	return new Date(value).getTime() > Date.now();
}

class AuthService {
	private readonly secretKey = requireEnvironmentSecret("JWT_SECRET_KEY");
	private readonly refreshEnabled = process.env["AUTH_REFRESH_ENABLED"]?.toLowerCase() === "true";
	private readonly refreshPepper = this.refreshEnabled
		? requireEnvironmentSecret("REFRESH_TOKEN_PEPPER")
		: "refresh-disabled";
	private readonly accessTokenTtl = process.env["ACCESS_TOKEN_TTL"] || (this.refreshEnabled ? "15m" : "7d");
	private readonly refreshIdleDays = parsePositiveInteger(process.env["REFRESH_TOKEN_IDLE_DAYS"], 30);
	private readonly ensuredRefreshTables = new Set<string>();

	public isRefreshEnabled(): boolean {
		return this.refreshEnabled;
	}

	public getRefreshCookieMaxAgeMs(): number {
		return this.refreshIdleDays * 24 * 60 * 60 * 1000;
	}

	public getRefreshCookieName(instance: string): string {
		const tenantHash = createHash("sha256").update(instance.trim().toLowerCase()).digest("hex").slice(0, 16);
		return `inpulse_rt_${tenantHash}`;
	}

	public async login(clientName: string, LOGIN: string, SENHA: string, userAgent?: string): Promise<AuthenticationResult> {
		const FIND_USER_QUERY = `SELECT * FROM operadores WHERE LOGIN = ? AND SENHA = ?`;
		const user = await instancesService
			.executeQuery<Array<User>>(clientName, FIND_USER_QUERY, [LOGIN, SENHA])
			.then((data) => data[0]);

		if (!user || user.ATIVO === "NAO") {
			throw new UnauthenticatedError("invalid login or password");
		}

		const sessionId = randomUUID();
		let refreshToken: string | undefined;
		if (this.refreshEnabled) {
			refreshToken = await this.createRefreshSession(clientName, user, sessionId, userAgent);
		}

		return {
			token: this.generateAccessToken(clientName, user, sessionId),
			user,
			...(refreshToken ? { refreshToken } : {}),
		};
	}

	public async refresh(instance: string, rawRefreshToken: string, userAgent?: string): Promise<AuthenticationResult> {
		if (!this.refreshEnabled) throw new UnauthenticatedError("refresh sessions are disabled");

		const parsedToken = this.parseRefreshToken(rawRefreshToken);
		await this.ensureRefreshSessionsTable(instance);

		const session = await this.findRefreshSession(instance, parsedToken.sessionId);
		if (!session || session.revoked_at) throw new UnauthenticatedError("invalid refresh session");

		if (!isDateAfterNow(session.expires_at)) {
			await this.revokeSession(instance, session.session_id);
			throw new UnauthenticatedError("refresh session expired");
		}

		const presentedHash = this.hashRefreshToken(parsedToken.sessionId, parsedToken.secret);
		const isCurrent = this.safeHashEquals(presentedHash, session.current_token_hash);
		const isPrevious = !!session.previous_token_hash && this.safeHashEquals(presentedHash, session.previous_token_hash);

		if (!isCurrent && !isPrevious) throw new UnauthenticatedError("invalid refresh token");
		if (isPrevious && !isDateAfterNow(session.previous_valid_until)) {
			await this.revokeSession(instance, session.session_id);
			console.warn(`Refresh token replay detected for session ${session.session_id}`);
			throw new UnauthenticatedError("refresh token replay detected");
		}

		const user = await this.findActiveUser(instance, session.user_id);
		const nextSecret = randomBytes(32).toString("base64url");
		const nextHash = this.hashRefreshToken(session.session_id, nextSecret);
		const nextExpiry = this.newRefreshExpiry();
		const graceExpiry = new Date(Date.now() + PREVIOUS_TOKEN_GRACE_SECONDS * 1000);
		const expectedHash = isCurrent ? session.current_token_hash : session.previous_token_hash!;
		const expectedColumn = isCurrent ? "current_token_hash" : "previous_token_hash";

		const update = await instancesService.executeQuery<MutationResult>(
			instance,
			`UPDATE auth_refresh_sessions
			 SET previous_token_hash = current_token_hash,
			     current_token_hash = ?,
			     previous_valid_until = ?,
			     expires_at = ?,
			     last_used_at = CURRENT_TIMESTAMP,
			     user_agent_hash = ?
			 WHERE session_id = ? AND revoked_at IS NULL AND ${expectedColumn} = ?`,
			[
				nextHash,
				formatMysqlDate(graceExpiry),
				formatMysqlDate(nextExpiry),
				this.hashUserAgent(userAgent),
				session.session_id,
				expectedHash,
			],
		);

		if (update.affectedRows !== 1) throw new UnauthenticatedError("refresh token was already rotated");

		return {
			token: this.generateAccessToken(instance, user, session.session_id),
			user,
			refreshToken: `${session.session_id}.${nextSecret}`,
		};
	}

	public async logout(instance: string, rawRefreshToken: string | undefined): Promise<void> {
		if (!this.refreshEnabled || !rawRefreshToken) return;

		let parsedToken: { sessionId: string; secret: string };
		try {
			parsedToken = this.parseRefreshToken(rawRefreshToken);
		} catch {
			return;
		}

		await this.ensureRefreshSessionsTable(instance);
		const session = await this.findRefreshSession(instance, parsedToken.sessionId);
		if (!session) return;

		const presentedHash = this.hashRefreshToken(parsedToken.sessionId, parsedToken.secret);
		if (
			this.safeHashEquals(presentedHash, session.current_token_hash) ||
			(!!session.previous_token_hash && this.safeHashEquals(presentedHash, session.previous_token_hash))
		) {
			await this.revokeSession(instance, session.session_id);
		}
	}

	public async revokeUserSessions(instance: string, userId: number): Promise<void> {
		if (!this.refreshEnabled) return;
		await this.ensureRefreshSessionsTable(instance);
		await instancesService.executeQuery(
			instance,
			"UPDATE auth_refresh_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL",
			[userId],
		);
	}

	public async recoverSessionUser(token: string): Promise<User> {
		const decodedToken = this.verifyAccessToken(token);
		return this.findActiveUser(decodedToken.instance, decodedToken.userId);
	}

	public async recoverSessionData(token: string): Promise<SessionData> {
		return this.verifyAccessToken(token);
	}

	public async recoverSessionDataForPresenceCleanup(token: string): Promise<SessionData> {
		return this.verifyAccessToken(token, true);
	}

	private generateAccessToken(instance: string, user: User, sessionId: string): string {
		return jwt.sign(
			{
				instance,
				userId: user.CODIGO,
				sectorId: user.SETOR,
				role: user.NIVEL,
				name: user.NOME,
				sid: sessionId,
				typ: "access",
			},
			this.secretKey,
			{ expiresIn: this.accessTokenTtl as NonNullable<SignOptions["expiresIn"]> },
		);
	}

	private verifyAccessToken(token: string, ignoreExpiration = false): SessionData {
		const decodedToken = jwt.verify(token, this.secretKey, { ignoreExpiration });
		if (!decodedToken || typeof decodedToken === "string") throw new UnauthenticatedError("invalid token");

		const session = decodedToken as SessionData;
		if (
			typeof session.instance !== "string" ||
			typeof session.userId !== "number" ||
			typeof session.sectorId !== "number" ||
			typeof session.role !== "string" ||
			typeof session.name !== "string"
		) {
			throw new UnauthenticatedError("invalid token payload");
		}

		if (session.typ && session.typ !== "access") throw new UnauthenticatedError("invalid token type");
		if (session.typ === "access" && typeof session.sid !== "string") {
			throw new UnauthenticatedError("invalid access session");
		}
		if (!session.typ) {
			if (
				typeof session.iat !== "number" ||
				typeof session.exp !== "number" ||
				session.exp - session.iat > LEGACY_ACCESS_TOKEN_MAX_AGE_SECONDS
			) {
				throw new UnauthenticatedError("invalid legacy token");
			}
		}

		return session;
	}

	private async createRefreshSession(
		instance: string,
		user: User,
		sessionId: string,
		userAgent?: string,
	): Promise<string> {
		await this.ensureRefreshSessionsTable(instance);
		const secret = randomBytes(32).toString("base64url");
		await instancesService.executeQuery(
			instance,
			`INSERT INTO auth_refresh_sessions
			 (session_id, user_id, current_token_hash, expires_at, user_agent_hash)
			 VALUES (?, ?, ?, ?, ?)`,
			[
				sessionId,
				user.CODIGO,
				this.hashRefreshToken(sessionId, secret),
				formatMysqlDate(this.newRefreshExpiry()),
				this.hashUserAgent(userAgent),
			],
		);
		return `${sessionId}.${secret}`;
	}

	private async ensureRefreshSessionsTable(instance: string): Promise<void> {
		if (this.ensuredRefreshTables.has(instance)) return;
		await instancesService.executeQuery(
			instance,
			`CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
			 session_id CHAR(36) NOT NULL,
			 user_id INT NOT NULL,
			 current_token_hash CHAR(64) NOT NULL,
			 previous_token_hash CHAR(64) NULL,
			 previous_valid_until DATETIME NULL,
			 expires_at DATETIME NOT NULL,
			 revoked_at DATETIME NULL,
			 user_agent_hash CHAR(64) NULL,
			 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			 last_used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			 PRIMARY KEY (session_id),
			 KEY idx_auth_refresh_user (user_id),
			 KEY idx_auth_refresh_expiry (expires_at)
			) ENGINE=InnoDB`,
			[],
		);
		this.ensuredRefreshTables.add(instance);
		await instancesService.executeQuery(
			instance,
			`DELETE FROM auth_refresh_sessions
			 WHERE expires_at < NOW()
			    OR (revoked_at IS NOT NULL AND revoked_at < DATE_SUB(NOW(), INTERVAL 30 DAY))`,
			[],
		);
	}

	private async findRefreshSession(instance: string, sessionId: string): Promise<RefreshSessionRow | undefined> {
		return instancesService
			.executeQuery<RefreshSessionRow[]>(
				instance,
				`SELECT session_id, user_id, current_token_hash, previous_token_hash,
				        previous_valid_until, expires_at, revoked_at
				 FROM auth_refresh_sessions WHERE session_id = ? LIMIT 1`,
				[sessionId],
			)
			.then((rows) => rows[0]);
	}

	private async findActiveUser(instance: string, userId: number): Promise<User> {
		const user = await instancesService
			.executeQuery<User[]>(instance, "SELECT * FROM operadores WHERE CODIGO = ?", [userId])
			.then((rows) => rows[0]);
		if (!user || user.ATIVO === "NAO") {
			await this.revokeUserSessions(instance, userId);
			throw new UnauthenticatedError("user doesn't exist or isn't active");
		}
		return user;
	}

	private async revokeSession(instance: string, sessionId: string): Promise<void> {
		await instancesService.executeQuery(
			instance,
			"UPDATE auth_refresh_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE session_id = ? AND revoked_at IS NULL",
			[sessionId],
		);
	}

	private parseRefreshToken(token: string): { sessionId: string; secret: string } {
		const separator = token.indexOf(".");
		const sessionId = token.slice(0, separator);
		const secret = token.slice(separator + 1);
		if (separator <= 0 || !/^[0-9a-f-]{36}$/i.test(sessionId) || secret.length < 32) {
			throw new UnauthenticatedError("invalid refresh token");
		}
		return { sessionId, secret };
	}

	private hashRefreshToken(sessionId: string, secret: string): string {
		return createHmac("sha256", this.refreshPepper).update(`${sessionId}.${secret}`).digest("hex");
	}

	private hashUserAgent(userAgent?: string): string | null {
		return userAgent ? createHash("sha256").update(userAgent).digest("hex") : null;
	}

	private safeHashEquals(left: string, right: string): boolean {
		const leftBuffer = Buffer.from(left);
		const rightBuffer = Buffer.from(right);
		return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
	}

	private newRefreshExpiry(): Date {
		return new Date(Date.now() + this.getRefreshCookieMaxAgeMs());
	}
}

export default new AuthService();
