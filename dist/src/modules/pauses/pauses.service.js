"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const basicCrud_class_1 = __importDefault(require("inpulse-crm/utils/src/basicCrud.class"));
const instances_service_1 = __importDefault(require("../../instances.service"));
const PausesService = new basicCrud_class_1.default({
    tableName: "motivos_pausa",
    primaryKey: "CODIGO",
    numberColumns: ["CODIGO", "TEMPO_MAX_SEG"],
    likeColumns: ["DESCRICAO"],
    dateColumns: [],
    service: instances_service_1.default
});
exports.default = PausesService;
//# sourceMappingURL=pauses.service.js.map