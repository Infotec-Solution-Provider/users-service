import { Request, Response, Router } from "express";
import * as core from "express-serve-static-core";
import validateDto from "inpulse-crm/utils/src/validateDto";
import { CreateUserGroupDto } from "./dto/create-user-group.dto";
import { UpdateUserGroupDto } from "./dto/update-user-group.dto";
import { UserGroup } from "./types/user-group.type";
import { FilterWithPaginationQueryParameters } from "inpulse-crm/utils";
import UserGroupsService from "./user-groups.service";
import instancesService from "../../instances.service";

class UserGroupsController {
    public readonly router: core.Router;

    constructor() {
        this.router = Router();

        this.router.get("/:clientName/user-groups", this.get);
        this.router.post("/:clientName/user-groups", validateDto(CreateUserGroupDto), this.create);
        this.router.patch("/:clientName/user-groups/:usergroupId", validateDto(UpdateUserGroupDto), this.update);
        this.router.delete("/:clientName/user-groups/:usergroupId", this.delete);
    }

    private async get(req: Request, res: Response): Promise<Response> {
        const { clientName } = req.params;
        const queryParams = req.query as FilterWithPaginationQueryParameters<UserGroup>;

        const { data, page } = await UserGroupsService.get(clientName, queryParams);

        return res.status(200).json({ message: "succesful listed user groups", data, page });
    }

    private async create(req: Request, res: Response): Promise<Response> {
        const { clientName } = req.params;

        const lastUserGroupId = await instancesService
            .executeQuery<Array<{ id: number }>>(clientName, "SELECT MAX(CODIGO) AS id FROM grupos_operador", [])
            .then(data => data.result[0].id || 0);

        req.body.CODIGO = lastUserGroupId + 1;

        const createdUserGroup = await UserGroupsService.create(clientName, req.body);

        return res.status(201).json({ message: "succesful created user group", data: createdUserGroup });
    }

    private async update(req: Request, res: Response): Promise<Response> {
        const { clientName, usergroupId } = req.params;

        const updatedUserGroup = await UserGroupsService.update(clientName, +usergroupId, req.body);

        return res.status(200).json({ message: "succesful updated user group", data: updatedUserGroup });
    }

    private async delete(req: Request, res: Response): Promise<Response> {
        const { clientName, usergroupId } = req.params;

        await UserGroupsService.delete(clientName, +usergroupId);

        return res.status(200).json({ message: "succesful deleted user group" });
    }
}

export default UserGroupsController;