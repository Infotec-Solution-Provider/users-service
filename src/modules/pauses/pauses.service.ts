import BasicCrud from "inpulse-crm/utils/src/basicCrud.class";
import { Pause } from "./types/pause.type";
import instancesService from "../../instances.service";

const PausesService = new BasicCrud<Pause>({
    tableName: "motivos_pausa",
    primaryKey: "CODIGO",
    numberColumns: ["CODIGO", "TEMPO_MAX_SEG"],
    likeColumns: ["DESCRICAO"],
    dateColumns: [],
    service: instancesService
});

export default PausesService;