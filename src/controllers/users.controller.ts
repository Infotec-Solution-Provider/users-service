import { Request, Response, Router } from "express";

import usersService from "../services/users.service";
import isAuthenticated from "../middlewares/is-authenticated.middleware";
import isAdmin from "../middlewares/is-admin.middleware";
import { NotFoundError, UnauthorizedError } from "@rgranatodutra/http-errors";
import { RequestFilters, User } from "@in.pulse-crm/sdk";
import { GlobalSipConfig, SipConfig } from "../types/sip-config.type";
import { UserNotificationPreferences } from "../types/notification-preferences.type";
import {
	PushNotificationPayload,
	PushSubscriptionPayload,
} from "../types/push-notification.type";
import authService from "../services/auth.service";

class UsersController {
	public readonly router: Router;

	constructor() {
		this.router = Router();

		this.router.get("/users", isAuthenticated, this.get);
		this.router.post("/users", isAuthenticated, isAdmin, this.create);
		this.router.patch("/users/:userId", isAuthenticated, isAdmin, this.update);
		this.router.get("/users/:userId", isAuthenticated, this.getUserById);
		this.router.delete("/users/:userId", isAuthenticated, isAdmin, this.deactivate);
		this.router.get("/sip-configs", isAuthenticated, isAdmin, this.getSipConfigs);
		this.router.get("/sip-global-config", isAuthenticated, isAdmin, this.getGlobalSipConfig);
		this.router.get("/users/:userId/sip-config", isAuthenticated, isAdmin, this.getUserSipConfig);
		this.router.put("/sip-global-config", isAuthenticated, isAdmin, this.upsertGlobalSipConfig);
		this.router.put("/users/:userId/sip-config", isAuthenticated, isAdmin, this.upsertUserSipConfig);
		this.router.get(
			"/users/:userId/notification-preferences",
			isAuthenticated,
			this.getUserNotificationPreferences.bind(this),
		);
		this.router.put(
			"/users/:userId/notification-preferences",
			isAuthenticated,
			this.upsertUserNotificationPreferences.bind(this),
		);
		this.router.get("/users/push/vapid-public-key", isAuthenticated, this.getPushVapidPublicKey.bind(this));
		this.router.post(
			"/users/:userId/push-subscriptions",
			isAuthenticated,
			this.upsertPushSubscription.bind(this),
		);
		this.router.delete(
			"/users/:userId/push-subscriptions",
			isAuthenticated,
			this.removePushSubscription.bind(this),
		);
		this.router.post("/_internal/push-notifications", this.sendInternalPushNotification.bind(this));
	}

	private assertCanManageUser(req: Request, userId: number): void {
		const sessionUserId = Number(req.session.userId);
		const isAdminRole = req.session.role === "ADMIN";

		if (!isAdminRole && sessionUserId !== userId) {
			throw new UnauthorizedError("you can only manage your own notification preferences");
		}
	}

	private assertInternalPushRequest(req: Request): void {
		const expectedSecret = process.env["PUSH_NOTIFICATIONS_SECRET"];
		const providedSecret = req.headers["x-inpulse-push-secret"];

		if (!expectedSecret || providedSecret !== expectedSecret) {
			throw new UnauthorizedError("invalid push notification service credentials");
		}
	}

	private async get(req: Request, res: Response): Promise<Response> {
		const filters = req.query as RequestFilters<User>;

		const { data, page } = await usersService.getUsers(req.session.instance, filters);

		return res.status(200).json({ message: "succesfully listed users", data, page });
	}

	private async getUserById(req: Request, res: Response): Promise<Response> {
		const instance = req.session.instance;
		const userId = Number(req.params["userId"]);

		const data = await usersService.getById(instance, userId);

		if (!data) {
			throw new NotFoundError("User not found");
		}

		return res.status(200).json({ message: "succesful ", data });
	}

	private async create(req: Request, res: Response): Promise<Response> {
		const instance = req.session.instance;

		const createdUser = await usersService.create(instance, req.body);

		return res.status(201).json({ message: "succesful created user", data: createdUser });
	}

	private async update(req: Request, res: Response): Promise<Response> {
		const instance = req.session.instance;
		const userId = +req.params["userId"]!;

		const updatedUser = await usersService.update(instance, userId, req.body);
		if (req.body?.SENHA !== undefined || req.body?.ATIVO === "NAO") {
			await authService.revokeUserSessions(instance, userId);
		}

		return res.status(200).json({ message: "succesful updated user", data: updatedUser });
	}

	private async deactivate(req: Request, res: Response): Promise<Response> {
		const instance = req.session.instance;
		const userId = +req.params["userId"]!;

		const deactivatedUser = await usersService.update(instance, +userId, { ATIVO: "NAO" });
		await authService.revokeUserSessions(instance, userId);

		return res.status(200).json({ message: "succesful deactivated user", data: deactivatedUser });
	}

	private async getSipConfigs(req: Request, res: Response): Promise<Response> {
		const filters = req.query as RequestFilters<SipConfig>;
		const { data, page } = await usersService.getSipConfigs(req.session.instance, filters);

		return res.status(200).json({ message: "succesfully listed sip configs", data, page });
	}

	private async getUserSipConfig(req: Request, res: Response): Promise<Response> {
		const instance = req.session.instance;
		const userId = Number(req.params["userId"]);
		const data = await usersService.getSipConfigByOperator(instance, userId);

		return res.status(200).json({ message: "succesfully loaded user sip config", data });
	}

	private async getGlobalSipConfig(req: Request, res: Response): Promise<Response> {
		const data = await usersService.getGlobalSipConfig(req.session.instance);

		return res.status(200).json({ message: "succesfully loaded global sip config", data });
	}

	private async upsertUserSipConfig(req: Request, res: Response): Promise<Response> {
		const instance = req.session.instance;
		const userId = Number(req.params["userId"]);
		const data = await usersService.upsertSipConfigByOperator(instance, userId, req.body as Partial<SipConfig>);

		return res.status(200).json({ message: "succesfully updated user sip config", data });
	}

	private async upsertGlobalSipConfig(req: Request, res: Response): Promise<Response> {
		const data = await usersService.upsertGlobalSipConfig(
			req.session.instance,
			req.body as Partial<GlobalSipConfig>
		);

		return res.status(200).json({ message: "succesfully updated global sip config", data });
	}

	private async getUserNotificationPreferences(req: Request, res: Response): Promise<Response> {
		const instance = req.session.instance;
		const userId = Number(req.params["userId"]);
		this.assertCanManageUser(req, userId);

		const data = await usersService.getNotificationPreferences(instance, userId);

		return res.status(200).json({ message: "succesfully loaded notification preferences", data });
	}

	private async upsertUserNotificationPreferences(req: Request, res: Response): Promise<Response> {
		const instance = req.session.instance;
		const userId = Number(req.params["userId"]);
		this.assertCanManageUser(req, userId);

		const data = await usersService.upsertNotificationPreferences(
			instance,
			userId,
			req.body as Partial<UserNotificationPreferences>,
		);

		return res.status(200).json({ message: "succesfully updated notification preferences", data });
	}

	private async getPushVapidPublicKey(_req: Request, res: Response): Promise<Response> {
		const publicKey = usersService.getPushVapidPublicKey();
		return res.status(200).json({ data: { publicKey } });
	}

	private async upsertPushSubscription(req: Request, res: Response): Promise<Response> {
		const userId = Number(req.params["userId"]);
		this.assertCanManageUser(req, userId);
		await usersService.upsertPushSubscription(
			req.session.instance,
			userId,
			req.body as PushSubscriptionPayload,
		);
		return res.status(204).send();
	}

	private async removePushSubscription(req: Request, res: Response): Promise<Response> {
		const userId = Number(req.params["userId"]);
		this.assertCanManageUser(req, userId);
		const endpoint = String(req.body?.endpoint || "").trim();
		if (endpoint) {
			await usersService.removePushSubscription(req.session.instance, userId, endpoint);
		}
		return res.status(204).send();
	}

	private async sendInternalPushNotification(req: Request, res: Response): Promise<Response> {
		this.assertInternalPushRequest(req);
		const userId = Number(req.body?.userId);
		if (!Number.isInteger(userId)) {
			throw new Error("invalid push notification user id");
		}

		const sent = await usersService.sendPushNotification(
			String(req.body?.instance || ""),
			userId,
			req.body?.payload as PushNotificationPayload,
		);
		return res.status(200).json({ data: { sent } });
	}
}

export default new UsersController();
