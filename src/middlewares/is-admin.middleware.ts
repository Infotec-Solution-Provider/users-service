import { UnauthorizedError } from "@rgranatodutra/http-errors";
import { NextFunction, Request, Response } from "express";


async function isAdmin(req: Request, _res: Response, next: NextFunction) {
    if (!req.session.role || req.session.role !== "ADMIN") {
        throw new UnauthorizedError("only admins can access this resource");
    }
    next();
}

export default isAdmin;