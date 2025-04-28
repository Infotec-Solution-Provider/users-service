import { Request, Response, Router } from "express";
import * as core from "express-serve-static-core";

import usersService from "../services/users.service";
import isAuthenticated from "../middlewares/is-authenticated.middleware";
import isAdmin from "../middlewares/is-admin.middleware";
import { NotFoundError, UnauthorizedError } from "@rgranatodutra/http-errors";
import { RequestFilters, User } from "@in.pulse-crm/sdk";

class UsersController {
	public readonly router: core.Router;

	constructor() {
		this.router = Router();

		this.router.get("/users", isAuthenticated, this.get);
		this.router.post("/users", isAuthenticated, isAdmin, this.create);
		this.router.patch("/users/:userId", isAuthenticated, isAdmin, this.update);
		this.router.get("/users/:userId", isAuthenticated, this.getUserById);
		this.router.delete("/users/:userId", isAuthenticated, isAdmin, this.deactivate);
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
}

export default new UsersController();
