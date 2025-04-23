import { UserGroupMember } from "../types/user-group.type";
import instancesService from "./instances.service";
import { FilterWithPaginationQueryParameters, toPaginated } from "inpulse-crm/utils";
import QueryBuilder from "../utils/query-builder";

type UserGroupMemberParams = FilterWithPaginationQueryParameters<UserGroupMember>;

class UserGroupMembersService {

    private readonly qb: QueryBuilder<UserGroupMember>;

    constructor() {
        this.qb = new QueryBuilder<UserGroupMember>("gruposxoperadores", "CODIGO");
        this.qb.addLikeColumns("OPERADOR", "GRUPO");
    }

    public async search(instance: string, searchParams: UserGroupMemberParams) {
        const { page, perPage, ...filters } = searchParams;

        const limit = Number(perPage) || 50;
        const offset = (Number(page) - 1) * limit;

        const { query, params } = this.qb.createSelect("*", filters, offset, limit);

        const result = await instancesService.executeQuery<Array<UserGroupMember>>(instance, query, params);

        return toPaginated(result, +page, +perPage);
    }

    public async create(instance: string, data: UserGroupMember) {
        data.CODIGO = await instancesService
            .executeQuery<Array<{ id: number }>>(instance, "SELECT MAX(CODIGO) AS id FROM gruposxoperadores", [])
            .then(data => data[0]?.id || 0) + 1;

        const { query, params } = this.qb.createInsert(data);
        await instancesService.executeQuery(instance, query, params);
    }

    public async update(instance: string, id: number, data: Partial<UserGroupMember>) {
        const { query, params } = this.qb.createUpdate(id, data);
        await instancesService.executeQuery(instance, query, params);
    }
}

export default new UserGroupMembersService();