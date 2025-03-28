import { UnauthenticatedError } from "@rgranatodutra/http-errors";
import { NextFunction, Request, Response } from "express";
import authService from "../services/auth.service";

async function isAuthenticated(req: Request, _res: Response, next: NextFunction) {
    const token = req.headers["authorization"] || req.query["token"]?.toString();

    if (!token || typeof token !== "string") {
        throw new UnauthenticatedError("token not provided");
    }

    const session = await authService.recoverSessionData(token.replaceAll("Bearer ", "").trim());

    req["session"] = session;
    next();
}

export default isAuthenticated;