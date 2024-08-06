import BasicCrud from "inpulse-crm/utils/src/basicCrud.class";
import { Goal } from "./types/goal.type";
import instancesService from "../../instances.service";

const GoalsService = new BasicCrud<Goal>({
    tableName: "operadores_meta",
    primaryKey: "CODIGO",
    numberColumns: ["ANO", "CODIGO", "OPERADOR", "VALOR_META"],
    likeColumns: [],
    dateColumns: [],
    service: instancesService,
});

export default GoalsService;