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

        const result = await instancesService.executeQuery<Array<User>>(instance, query, params);


        return toPaginated(result, +page, +perPage);
    }

    public async getById(instance: string, id: number) {
        const query = "SELECT * FROM operadores WHERE CODIGO = ?";
        const params = [id];

        return instancesService.executeQuery<Array<User>>(instance, query, params).then(data => data[0]);
    }

    public async create(instance: string, data: User) {
        data.CODIGO = await instancesService
            .executeQuery<Array<{ id: number }>>(instance, "SELECT MAX(CODIGO) AS id FROM operadores", [])
            .then(data => data[0]?.id || 0) + 1;


        const newData = deleteUndefinedOrNull(data)
        const { query, params } = this.qb.createInsert(newData);
        await instancesService.executeQuery(instance, query, params);
        const result = await instancesService
            .executeQuery<Array<User>>(instance, "SELECT * FROM operadores WHERE CODIGO = ? limit 1", [data.CODIGO])
        return result[0]
    }

    public async update(instance: string, id: number, data: Partial<User>) {
        const newData = deleteUndefinedOrNull(data)
        delete newData.EXPIRA_EM
        const { query, params } = this.qb.createUpdate(id, newData);
        await instancesService.executeQuery(instance, query, params);
        const result = await instancesService
            .executeQuery<Array<User>>(instance, "SELECT * FROM operadores WHERE CODIGO = ? limit 1", [id])
        return result[0]

    }
}

function deleteUndefinedOrNull<T extends Record<string, any>>(obj: T): T {
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            if (obj[key] === undefined || obj[key] === null || obj[key] === "") {
                delete obj[key]
            }
        }
    }
    return obj;
}

export default new UsersService();