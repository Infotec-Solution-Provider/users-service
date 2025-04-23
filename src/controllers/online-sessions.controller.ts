import { Router } from "express";
import * as core from "express-serve-static-core";
import onlineSessionsService from "../services/online-sessions.service";
import { BadRequestError, UnauthenticatedError } from "@rgranatodutra/http-errors";

class OnlineSessionsController {
	public readonly router: core.Router;

	constructor() {
		this.router = Router();
		this.router.get("/online-sessions", this.getSessions);
		this.router.post("/online-sessions", this.initSession);
		this.router.delete("/online-sessions", this.finishSession);
	}

	private async getSessions(req: core.Request, res: core.Response) {
		const instance = req.query["instance"];

		if (!instance || typeof instance !== "string") {
			throw new BadRequestError("Instance not provided or invalid");
		}

		const sessions = onlineSessionsService.getSessionsByInstance(instance);

		res.status(200).json({
			message: "Online sessions retrieved successfully",
			data: sessions.filter((s) => s.isOnline()),
		});
	}

	private async initSession(req: core.Request, res: core.Response) {
		const token = req.headers.authorization?.replace("Bearer ", "");

		if (!token) {
			throw new UnauthenticatedError("Token not provided");
		}

		await onlineSessionsService.addTokenToSession(token);

		res.status(200).json({ message: "Token added successfully" });
	}

	private async finishSession(req: core.Request, res: core.Response) {
		const token = req.headers.authorization?.replace("Bearer ", "");

		if (!token) {
			throw new UnauthenticatedError("Token not provided");
		}

		await onlineSessionsService.removeTokenFromSession(token);

		res.status(200).json({ message: "Token removed successfully" });
	}
}

export default new OnlineSessionsController();
