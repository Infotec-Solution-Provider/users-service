import { Request, Response, Router } from "express";
import * as core from "express-serve-static-core";
import validateDto from "inpulse-crm/utils/src/validateDto";
import { CreateUserGroupDto } from "./dto/create-user-group.dto";
import { UpdateUserGroupDto } from "./dto/update-user-group.dto";
import { UserGroup } from "./types/user-group.type";
import { FilterWithPaginationQueryParameters } from "inpulse-crm/utils";
import UserGroupsService, { UserGroupsMembersService } from "./user-groups.service";
import instancesService from "../../instances.service";
import { AddUserGroupDto } from "./dto/add-group-user.dto";

class UserGroupsController {
	public readonly router: core.Router;

	constructor() {
		this.router = Router();

		this.router.get("/:clientName/user-groups", this.get);
		this.router.post("/:clientName/user-groups", validateDto(CreateUserGroupDto), this.create);
		this.router.patch("/:clientName/user-groups/:userGroupId", validateDto(UpdateUserGroupDto), this.update);
		this.router.delete("/:clientName/user-groups/:userGroupId", this.delete);
		this.router.get("/:clientName/user-groups/:userGroupId/members", this.getMembers);
		this.router.post("/:clientName/user-groups/:userGroupId/members", validateDto(AddUserGroupDto), this.addMember);
		this.router.delete("/:clientName/user-groups/:userGroupId/members/:groupUserId", this.removeMember);
	}

	private async get(req: Request, res: Response): Promise<Response> {
		const { clientName } = req.params;
		const queryParams = req.query as FilterWithPaginationQueryParameters<UserGroup>;

		const { data, page } = await UserGroupsService.get(clientName, queryParams);

		return res.status(200).json({ message: "succesfully listed user groups", data, page });
	}

	private async create(req: Request, res: Response): Promise<Response> {
		const { clientName } = req.params;

		const lastuserGroupId = await instancesService
			.executeQuery<Array<{ id: number }>>(clientName, "SELECT MAX(CODIGO) AS id FROM grupos_operador", [])
			.then((data) => data.result[0].id || 0);

		req.body.CODIGO = lastuserGroupId + 1;

		const createdUserGroup = await UserGroupsService.create(clientName, req.body);

		return res.status(201).json({ message: "succesfully created user group", data: createdUserGroup });
	}

	private async update(req: Request, res: Response): Promise<Response> {
		const { clientName, userGroupId } = req.params;

		const updatedUserGroup = await UserGroupsService.update(clientName, +userGroupId, req.body);

		return res.status(200).json({ message: "succesfully updated user group", data: updatedUserGroup });
	}

	private async delete(req: Request, res: Response): Promise<Response> {
		const { clientName, userGroupId } = req.params;

		await UserGroupsService.delete(clientName, +userGroupId);

		return res.status(200).json({ message: "succesfully deleted user group" });
	}

	private async getMembers(req: Request, res: Response): Promise<Response> {
		const { clientName, userGroupId } = req.params;
		const groupUsers = await UserGroupsMembersService.get(clientName, +userGroupId);
		return res.status(200).json({ message: "successfully listed group users", data: groupUsers });
	}

	private async addMember(req: Request, res: Response): Promise<Response> {
		const { clientName, userGroupId } = req.params;
		const groupUser = await UserGroupsMembersService.create(clientName, +userGroupId, req.body);
		return res.status(201).json({ message: "successfully added group user", data: groupUser });
	}

	private async removeMember(req: Request, res: Response): Promise<Response> {
		const { clientName, groupUserId, userGroupId } = req.params;
		await UserGroupsMembersService.delete(clientName, +groupUserId, +userGroupId);
		return res.status(200).json({ message: "successfully removed group user" });
	}
}

export default UserGroupsController;
