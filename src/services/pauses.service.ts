import { Pause } from "../types/pause.type";
import instancesService from "./instances.service";
import { FilterWithPaginationQueryParameters, toPaginated } from "inpulse-crm/utils";
import QueryBuilder from "../utils/query-builder";

type PauseSearchParams = FilterWithPaginationQueryParameters<Pause>;

class PausesService {

    private readonly qb: QueryBuilder<Pause>;

    constructor() {
        this.qb = new QueryBuilder<Pause>("motivos_pausa", "CODIGO");
        this.qb.addLikeColumns("DESCRICAO");
    }

    public async search(instance: string, searchParams: PauseSearchParams) {
        const { page, perPage, ...filters } = searchParams;

        const limit = Number(perPage) || 50;
        const offset = (Number(page) - 1) * limit;

        const { query, params } = this.qb.createSelect("*", filters, offset, limit);

        const result = await instancesService.executeQuery<Array<Pause>>(instance, query, params);

        return toPaginated(result, +page, +perPage);
    }

    public async create(instance: string, data: Pause) {
        data.CODIGO = await instancesService
            .executeQuery<Array<{ id: number }>>(instance, "SELECT MAX(CODIGO) AS id FROM motivos_pausa", [])
            .then(data => data[0]?.id || 0) + 1;

        const { query, params } = this.qb.createInsert(data);
        await instancesService.executeQuery(instance, query, params);
    }

    public async update(instance: string, id: number, data: Partial<Pause>) {
        const { query, params } = this.qb.createUpdate(id, data);
        await instancesService.executeQuery(instance, query, params);
    }

}

export default new PausesService();