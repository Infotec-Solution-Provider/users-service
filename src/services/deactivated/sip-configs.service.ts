import { SipConfig } from "../types/sip-config.type";
import instancesService from "./instances.service";
import { FilterWithPaginationQueryParameters, toPaginated } from "inpulse-crm/utils";
import QueryBuilder from "../utils/query-builder";

type SipConfigSearchParams = FilterWithPaginationQueryParameters<SipConfig>;

class SipConfigsService {

    private readonly qb: QueryBuilder<SipConfig>;

    constructor() {
        this.qb = new QueryBuilder<SipConfig>("operadores_config_sip", "COD_CONFIG_SIP");
        this.qb.addLikeColumns("CFG_CONFIG_SIP", "IP_SERVIDOR_SIP", "LOGIN_SIP", "RAMAL_SIP", "SENHA_SIP", "USRID_SIP");
    }

    public async search(instance: string, searchParams: SipConfigSearchParams) {
        const { page, perPage, ...filters } = searchParams;

        const limit = Number(perPage) || 50;
        const offset = (Number(page) - 1) * limit;

        const { query, params } = this.qb.createSelect("*", filters, offset, limit);

        const result = await instancesService.executeQuery<Array<SipConfig>>(instance, query, params);

        return toPaginated(result, +page, +perPage);
    }

    public async create(instance: string, data: SipConfig) {
        data.COD_CONFIG_SIP = await instancesService
            .executeQuery<Array<{ id: number }>>(instance, "SELECT MAX(COD_CONFIG_SIP) AS id FROM operadores_config_sip", [])
            .then(data => data[0]?.id || 0) + 1;

        const { query, params } = this.qb.createInsert(data);
        await instancesService.executeQuery(instance, query, params);
    }

    public async update(instance: string, id: number, data: Partial<SipConfig>) {
        const { query, params } = this.qb.createUpdate(id, data);
        await instancesService.executeQuery(instance, query, params);
    }
}

export default new SipConfigsService();