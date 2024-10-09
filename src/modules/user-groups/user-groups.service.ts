import BasicCrud from "inpulse-crm/utils/src/basicCrud.class";
import { UserGroup, UserGroupMember } from "./types/user-group.type";
import instancesService from "../../instances.service";
import { AddUserGroupDto } from "./dto/add-group-user.dto";
import {
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
} from "@rgranatodutra/http-errors";

const UserGroupsService = new BasicCrud<UserGroup>({
  tableName: "grupos_operador",
  primaryKey: "CODIGO",
  numberColumns: ["CODIGO"],
  likeColumns: ["DESCRICAO"],
  dateColumns: [],
  service: instancesService,
});

class UserGroupsMembersService {
  public static async get(clientName: string, userGroupId: number) {
    const getMembersQuery = "SELECT * FROM gruposxoperadores WHERE GRUPO = ?";
    const response = await instancesService.executeQuery<UserGroupMember[]>(
      clientName,
      getMembersQuery,
      [userGroupId]
    );
    console.log(response);

    return response.result;
  }

  private static async getOneById(clientName: string, id: number) {
    const getMemberQuery = "SELECT * FROM gruposxoperadores WHERE CODIGO = ?";
    const response = await instancesService.executeQuery<UserGroupMember[]>(
      clientName,
      getMemberQuery,
      [id]
    );

    const member = response.result[0];

    if (!member) {
      throw new NotFoundError("group member not found");
    }

    return member;
  }

  public static async create(
    clientName: string,
    userGroupId: number,
    data: AddUserGroupDto
  ) {
    const userAlreadyExists = await instancesService.executeQuery<
      UserGroupMember[]
    >(
      clientName,
      "SELECT * FROM gruposxoperadores WHERE GRUPO = ? AND OPERADOR = ?",
      [userGroupId, data.OPERADOR]
    );

    if (userAlreadyExists.result[0]) {
      throw new ConflictError("User already exists whitin this group");
    }

    const lastGroupUser = await instancesService
      .executeQuery<{ CODIGO: number }[]>(
        clientName,
        "SELECT CODIGO FROM gruposxoperadores ORDER BY CODIGO DESC LIMIT 1",
        []
      )
      .then((res) => res.result[0]);

    if (!lastGroupUser) {
      throw new Error("Unable to retrieve the last user group member.");
    }

    const addMemberQuery =
      "INSERT INTO gruposxoperadores (CODIGO, GRUPO, OPERADOR) VALUES (?, ?, ?)";
    const newMemberCodigo = lastGroupUser.CODIGO + 1;
    const addMemberParams = [newMemberCodigo, userGroupId, data.OPERADOR];

    await instancesService.executeQuery(
      clientName,
      addMemberQuery,
      addMemberParams
    );

    const getMemberQuery = "SELECT * FROM gruposxoperadores WHERE CODIGO = ?";
    const response = await instancesService.executeQuery<UserGroupMember[]>(
      clientName,
      getMemberQuery,
      [newMemberCodigo]
    );

    return response.result[0];
  }

  public static async delete(
    clientName: string,
    id: number,
    userGroupId: number
  ) {
    const member = await UserGroupsMembersService.getOneById(clientName, id);

    if (member.GRUPO !== userGroupId) {
      throw new BadRequestError("this user doesn't belong to this group");
    }

    const deleteMemberQuery =
      "DELETE FROM gruposxoperadores WHERE CODIGO = ? AND GRUPO = ?";
    const response = await instancesService.executeQuery<UserGroupMember[]>(
      clientName,
      deleteMemberQuery,
      [id, userGroupId]
    );

    return response.result;
  }
}

export { UserGroupsMembersService };
export default UserGroupsService;
