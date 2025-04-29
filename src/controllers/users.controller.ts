import { Request, Response, Router } from "express";
import * as core from "express-serve-static-core";
import validateDto from "inpulse-crm/utils/src/validateDto";
import { CreateUserDto } from "../dto/create-user.dto";
import { UpdateUserDto } from "../dto/update-user.dto";
import { User } from "../types/user.type";
import { FilterWithPaginationQueryParameters } from "inpulse-crm/utils";
import usersService from "../services/users.service";
import isAuthenticated from "../middlewares/is-authenticated.middleware";
import isAdmin from "../middlewares/is-admin.middleware";
import { NotFoundError, UnauthorizedError } from "@rgranatodutra/http-errors";

class UsersController {
    public readonly router: core.Router;

    constructor() {
        this.router = Router();

        this.router.get("/users", isAuthenticated, this.get);
        this.router.get("/users/:userId", isAuthenticated, this.getUserById);
        this.router.post("/users", validateDto(CreateUserDto), isAuthenticated, isAdmin, this.create);
        this.router.patch("/users/:userId", validateDto(UpdateUserDto), isAuthenticated, isAdmin, this.update);
        this.router.delete("/users/:userId", isAuthenticated, isAdmin, this.deactivate);
    }

    private async get(req: Request, res: Response): Promise<Response> {
        req.query["SETOR"] = String(req.session.sectorId);
        const instance = req.session.instance;
        const queryParams = req.query as FilterWithPaginationQueryParameters<User>;

        const { data, page } = await usersService.search(instance, queryParams);

        return res.status(200).json({ message: "succesful listed users", data, page });
    }

    private async getUserById(req: Request, res: Response): Promise<Response> {
        const instance = req.session.instance;
        const userId = Number(req.params["userId"]);

        if (userId && userId !== req.session.userId) {
            throw new UnauthorizedError("You can't access another user's data");
        }

        const data = await usersService.getById(instance, userId);

        if (!data) {
            throw new NotFoundError("User not found");
        }

        return res.status(200).json({ message: "succesful ", data });
    }

    private async create(req: Request, res: Response): Promise<Response> {
        const instance = req.session.instance;

        const createdUser = await usersService.create(instance, req.body);

        return res.status(201).json({ message: "succesfully created user", data: createdUser });
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

export default UsersController;