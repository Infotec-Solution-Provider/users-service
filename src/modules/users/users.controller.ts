import { Request, Response, Router } from "express";
import * as core from "express-serve-static-core";
import validateDto from "inpulse-crm/utils/src/validateDto";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { User } from "./types/user.type";
import { FilterWithPaginationQueryParameters } from "inpulse-crm/utils";
import UsersService from "./users.service";

class UsersController {
    public readonly router: core.Router;

    constructor() {
        this.router = Router();

        this.router.get("/:clientName/users", this.get);
        this.router.post("/:clientName/users", validateDto(CreateUserDto), this.create);
        this.router.patch("/:clientName/users/:UserId", validateDto(UpdateUserDto), this.update);
        this.router.delete("/:clientName/users/:UserId", this.delete);
    }

    private async get(req: Request, res: Response): Promise<Response> {
        const { clientName } = req.params;
        const queryParams = req.query as FilterWithPaginationQueryParameters<User>;

        const { data, page } = await UsersService.get(clientName, queryParams);

        return res.status(200).json({ message: "succesful listed users", data, page });
    }

    private async create(req: Request, res: Response): Promise<Response> {
        const { clientName } = req.params;

        const createdUser = await UsersService.create(clientName, req.body);

        return res.status(201).json({ message: "succesful created user", data: createdUser });
    }

    private async update(req: Request, res: Response): Promise<Response> {
        const { clientName, user } = req.params;

        const updatedUser = await UsersService.update(clientName, +user, req.body);

        return res.status(200).json({ message: "succesful updated user", data: updatedUser });
    }

    private async delete(req: Request, res: Response): Promise<Response> {
        const { clientName, user } = req.params;

        await UsersService.delete(clientName, +user);

        return res.status(200).json({ message: "succesful deleted user" });
    }
}

export default UsersController;