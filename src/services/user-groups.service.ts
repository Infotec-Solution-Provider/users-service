import { UserGroup } from "../types/user-group.type";
import instancesService from "./instances.service";
import { FilterWithPaginationQueryParameters, toPaginated } from "inpulse-crm/utils";
import QueryBuilder from "../utils/query-builder";

type UserGroupParams = FilterWithPaginationQueryParameters<UserGroup>;

class UserGroupsService {

    private readonly qb: QueryBuilder<UserGroup>;

    constructor() {
        this.qb = new QueryBuilder<UserGroup>("grupos_operador", "CODIGO");
        this.qb.addLikeColumns("DESCRICAO");
    }

    public async search(instance: string, searchParams: UserGroupParams) {
        const { page, perPage, ...filters } = searchParams;

        const limit = Number(perPage) || 50;
        const offset = (Number(page) - 1) * limit;

        const { query, params } = this.qb.createSelect("*", filters, offset, limit);

        const result = await instancesService.executeQuery<Array<UserGroup>>(instance, query, params);

        return toPaginated(result, +page, +perPage);
    }

    public async create(instance: string, data: UserGroup) {
        data.CODIGO = await instancesService
            .executeQuery<Array<{ id: number }>>(instance, "SELECT MAX(CODIGO) AS id FROM grupos_operador", [])
            .then(data => data[0]?.id || 0) + 1;

        const { query, params } = this.qb.createInsert(data);
        await instancesService.executeQuery(instance, query, params);
    }

    public async update(instance: string, id: number, data: Partial<UserGroup>) {
        const { query, params } = this.qb.createUpdate(id, data);
        await instancesService.executeQuery(instance, query, params);
    }
}

export default new UserGroupsService();