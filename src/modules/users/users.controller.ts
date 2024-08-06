import { Request, Response, Router } from "express";
import * as core from "express-serve-static-core";
import validateDto from "inpulse-crm/utils/src/validateDto";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { User } from "./types/user.type";
import { FilterWithPaginationQueryParameters } from "inpulse-crm/utils";
import UsersService from "./users.service";
import instancesService from "../../instances.service";

class UsersController {
    public readonly router: core.Router;

    constructor() {
        this.router = Router();

        this.router.get("/:clientName/users", this.get);
        this.router.post("/:clientName/users", validateDto(CreateUserDto), this.create);
        this.router.patch("/:clientName/users/:userId", validateDto(UpdateUserDto), this.update);
        this.router.delete("/:clientName/users/:userId", this.deactivate);
    }

    private async get(req: Request, res: Response): Promise<Response> {
        const { clientName } = req.params;
        const queryParams = req.query as FilterWithPaginationQueryParameters<User>;

        const { data, page } = await UsersService.get(clientName, queryParams);

        return res.status(200).json({ message: "succesful listed users", data, page });
    }

    private async create(req: Request, res: Response): Promise<Response> {
        const { clientName } = req.params;

        const lastUserId = await instancesService
            .executeQuery<Array<{ id: number }>>(clientName, "SELECT MAX(CODIGO) AS id FROM operadores", [])
            .then(data => data.result[0].id || 0);

        req.body.CODIGO = lastUserId + 1;

        const createdUser = await UsersService.create(clientName, req.body);

        return res.status(201).json({ message: "succesful created user", data: createdUser });
    }

    private async update(req: Request, res: Response): Promise<Response> {
        const { clientName, userId } = req.params;

        const updatedUser = await UsersService.update(clientName, +userId, req.body);

        return res.status(200).json({ message: "succesful updated user", data: updatedUser });
    }

    private async deactivate(req: Request, res: Response): Promise<Response> {
        const { clientName, userId } = req.params;

        const deactivatedUser = await UsersService.update(clientName, +userId, { ATIVO: "NAO" });

        return res.status(200).json({ message: "succesful deactivated user", data: deactivatedUser });
    }
}

export default UsersController;