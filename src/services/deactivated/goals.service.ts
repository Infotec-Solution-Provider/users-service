import { Goal } from "../types/goal.type";
import { FilterWithPaginationQueryParameters, toPaginated } from "inpulse-crm/utils";
import QueryBuilder from "../utils/query-builder";
import instancesService from "./instances.service";

type GoalsSearchParams = FilterWithPaginationQueryParameters<Goal>;

class GoalsService {

    private readonly qb: QueryBuilder<Goal>;

    constructor() {
        this.qb = new QueryBuilder<Goal>("operadores_meta", "CODIGO");
    }

    public async search(instance: string, searchParams: GoalsSearchParams) {
        const { page, perPage, ...filters } = searchParams;

        const limit = Number(perPage) || 50;
        const offset = (Number(page) - 1) * limit;

        const { query, params } = this.qb.createSelect("*", filters, offset, limit);

        const result = await instancesService.executeQuery<Array<Goal>>(instance, query, params);

        return toPaginated(result, +page, +perPage);
    }

    public async create(instance: string, data: Goal) {
        data.CODIGO = await instancesService
            .executeQuery<Array<{ id: number }>>(instance, "SELECT MAX(CODIGO) AS id FROM operadores_meta", [])
            .then(data => data[0]?.id || 0) + 1;

        const { query, params } = this.qb.createInsert(data);
        await instancesService.executeQuery(instance, query, params);
    }

    public async update(instance: string, id: number, data: Partial<Goal>) {
        const { query, params } = this.qb.createUpdate(id, data);
        await instancesService.executeQuery(instance, query, params);
    }
}
export default new GoalsService();