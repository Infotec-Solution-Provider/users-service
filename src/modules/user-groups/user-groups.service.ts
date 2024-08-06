import BasicCrud from "inpulse-crm/utils/src/basicCrud.class";
import { UserGroup } from "./types/user-group.type";
import instancesService from "../../instances.service";

const UserGroupsService = new BasicCrud<UserGroup>({
    tableName: "grupos_operador",
    primaryKey: "CODIGO",
    numberColumns: ["CODIGO"],
    likeColumns: ["DESCRICAO"],
    dateColumns: [],
    service: instancesService
});

export default UserGroupsService;