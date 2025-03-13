import { Request, Response, Router } from "express";
import * as core from "express-serve-static-core";
import validateDto from "inpulse-crm/utils/src/validateDto";
import { CreateUserDto } from "../dto/create-user.dto";
import { UpdateUserDto } from "../dto/update-user.dto";
import { User } from "../types/user.type";
import { FilterWithPaginationQueryParameters } from "inpulse-crm/utils";
import usersService from "../services/users.service";

class UsersController {
    public readonly router: core.Router;

    constructor() {
        this.router = Router();

        this.router.get("/:instance/users", this.get);
        this.router.post("/:instance/users", validateDto(CreateUserDto), this.create);
        this.router.patch("/:instance/users/:userId", validateDto(UpdateUserDto), this.update);
        this.router.delete("/:instance/users/:userId", this.deactivate);
    }

    private async get(req: Request, res: Response): Promise<Response> {
        const instance = req.params["instance"]!
        const queryParams = req.query as FilterWithPaginationQueryParameters<User>;

        const { data, page } = await usersService.search(instance, queryParams);

        return res.status(200).json({ message: "succesful listed users", data, page });
    }

    private async create(req: Request, res: Response): Promise<Response> {
        const instance = req.params["instance"]!

        const createdUser = await usersService.create(instance, req.body);

        return res.status(201).json({ message: "succesful created user", data: createdUser });
    }

    private async update(req: Request, res: Response): Promise<Response> {
        const instance = req.params["instance"]!
        const userId = +req.params["userId"]!;

        const updatedUser = await usersService.update(instance, userId, req.body);

        return res.status(200).json({ message: "succesful updated user", data: updatedUser });
    }

    private async deactivate(req: Request, res: Response): Promise<Response> {
        const instance = req.params["instance"]!
        const userId = +req.params["userId"]!;

        const deactivatedUser = await usersService.update(instance, +userId, { ATIVO: "NAO" });

        return res.status(200).json({ message: "succesful deactivated user", data: deactivatedUser });
    }
}

export default UsersController;