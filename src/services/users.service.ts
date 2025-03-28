import { User } from "../types/user.type";
import instancesService from "./instances.service";
import { FilterWithPaginationQueryParameters, toPaginated } from "inpulse-crm/utils";
import QueryBuilder from "../utils/query-builder";

type UserSearchParams = FilterWithPaginationQueryParameters<User>;

class UsersService {

    private readonly qb: QueryBuilder<User>;

    constructor() {
        this.qb = new QueryBuilder<User>("operadores", "CODIGO");
        this.qb.addDateColumns("DATACAD", "ULTIMO_LOGIN_INI", "ULTIMO_LOGIN_FIM", "EXPIRA_EM");
        this.qb.addLikeColumns("NOME", "LOGIN", "EMAIL", "NIVEL", "ATIVO", "EMAILOPERADOR", "EMAIL_EXIBICAO");
    }

    public async search(instance: string, searchParams: UserSearchParams) {
        const { page, perPage, ...filters } = searchParams;

        const limit = Number(perPage) || 50;
        const offset = (Number(page) - 1) * limit;

        const { query, params } = this.qb.createSelect("*", filters, offset, limit);

        console.log(query, params);
        const result = await instancesService.executeQuery<Array<User>>(instance, query, params);


        return toPaginated(result, +page, +perPage);
    }

    public async create(instance: string, data: User) {
        data.CODIGO = await instancesService
            .executeQuery<Array<{ id: number }>>(instance, "SELECT MAX(CODIGO) AS id FROM operadores", [])
            .then(data => data[0]?.id || 0) + 1;

        const { query, params } = this.qb.createInsert(data);
        await instancesService.executeQuery(instance, query, params);
    }

    public async update(instance: string, id: number, data: Partial<User>) {
        const { query, params } = this.qb.createUpdate(id, data);
        await instancesService.executeQuery(instance, query, params);
    }
}

export default new UsersService();