import { Request, Response, Router } from "express";
import * as core from "express-serve-static-core";

import usersService from "../services/users.service";
import isAuthenticated from "../middlewares/is-authenticated.middleware";
import isAdmin from "../middlewares/is-admin.middleware";
import { NotFoundError } from "@rgranatodutra/http-errors";
import { RequestFilters, User } from "@in.pulse-crm/sdk";
import { GlobalSipConfig, SipConfig } from "../types/sip-config.type";

class UsersController {
	public readonly router: core.Router;

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

		return res.status(200).json({ message: "succesful updated user", data: updatedUser });
	}

	private async deactivate(req: Request, res: Response): Promise<Response> {
		const instance = req.session.instance;
		const userId = +req.params["userId"]!;

		const deactivatedUser = await usersService.update(instance, +userId, { ATIVO: "NAO" });

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
}

export default new UsersController();
