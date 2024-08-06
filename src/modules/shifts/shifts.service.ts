import BasicCrud from "inpulse-crm/utils/src/basicCrud.class";
import { Shift } from "./types/shift.type";
import instancesService from "../../instances.service";

const ShiftsService = new BasicCrud<Shift>({
    tableName: "horarios",
    primaryKey: "CODIGO",
    numberColumns: ["CODIGO"],
    likeColumns: ["DESCRICAO"],
    dateColumns: [],
    service: instancesService
});

export default ShiftsService;