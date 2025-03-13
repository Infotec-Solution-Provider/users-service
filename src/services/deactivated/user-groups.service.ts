import BasicCrud from "inpulse-crm/utils/src/basicCrud.class";
import { UserGroup, UserGroupMember } from "../../types/user-group.type";
import instancesService from "../instances.service";
import { AddUserGroupDto } from "../../dto/add-group-user.dto";

const UserGroupsService = new BasicCrud<UserGroup>({
    tableName: "grupos_operador",
    primaryKey: "CODIGO",
    numberColumns: ["CODIGO"],
    likeColumns: ["DESCRICAO"],
    dateColumns: [],
    service: instancesService
});

const UserGroupsMembersService = {
    get: async (clientName: string, userGroupId: number) => {
        const getMembersQuery = "SELECT * FROM gruposxoperadores WHERE GRUPO = ?";
        const response = await instancesService.executeQuery<UserGroupMember[]>(clientName, getMembersQuery, [userGroupId]);

        return response.result;
    },
    add: async (clientName: string, userGroupId: number, data: AddUserGroupDto) => {
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

        const addMemberQuery = "INSERT INTO gruposxoperadores (CODIGO, GRUPO, OPERADOR) VALUES (?, ?, ?)";
        const newMemberCodigo = lastGroupUser.CODIGO + 1;
        const addMemberParams = [newMemberCodigo, userGroupId, data.OPERADOR];

        await instancesService.executeQuery(clientName, addMemberQuery, addMemberParams);

        const getMemberQuery = "SELECT * FROM gruposxoperadores WHERE CODIGO = ?";
        const response = await instancesService.executeQuery<UserGroupMember[]>(clientName, getMemberQuery, [
            newMemberCodigo,
        ]);

        return response.result[0];
    },
};

export { UserGroupsMembersService };

export default UserGroupsService;