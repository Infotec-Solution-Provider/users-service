import {Shift} from "../types/shift.type"
import instancesService from "./instances.service";
import { FilterWithPaginationQueryParameters, toPaginated } from "inpulse-crm/utils";
import QueryBuilder from "../utils/query-builder";

type ShiftsSearchParams = FilterWithPaginationQueryParameters<Shift>;

class ShiftsService {

    private readonly qb: QueryBuilder<Shift>;

    constructor() {
        this.qb = new QueryBuilder<Shift>("horarios", "CODIGO");
        this.qb.addLikeColumns("DESCRICAO");
    }

    public async search(instance: string, searchParams: ShiftsSearchParams) {
        const { page, perPage, ...filters } = searchParams;

        const limit = Number(perPage) || 50;
        const offset = (Number(page) - 1) * limit;

        const { query, params } = this.qb.createSelect("*", filters, offset, limit);

        const result = await instancesService.executeQuery<Array<Shift>>(instance, query, params);

        return toPaginated(result, +page, +perPage);
    }

    public async create(instance: string, data: Shift) {
        data.CODIGO = await instancesService
            .executeQuery<Array<{ id: number }>>(instance, "SELECT MAX(CODIGO) AS id FROM horarios", [])
            .then(data => data[0]?.id || 0) + 1;

        const { query, params } = this.qb.createInsert(data);
        await instancesService.executeQuery(instance, query, params);
    }

    public async update(instance: string, id: number, data: Partial<Shift>) {
        const { query, params } = this.qb.createUpdate(id, data);
        await instancesService.executeQuery(instance, query, params);
    }
}

export default new ShiftsService();