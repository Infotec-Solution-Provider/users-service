"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const basicCrud_class_1 = __importDefault(require("inpulse-crm/utils/src/basicCrud.class"));
const instances_service_1 = __importDefault(require("../../instances.service"));
const GoalsService = new basicCrud_class_1.default({
    tableName: "operadores_meta",
    primaryKey: "CODIGO",
    numberColumns: ["ANO", "CODIGO", "OPERADOR", "VALOR_META"],
    likeColumns: [],
    dateColumns: [],
    service: instances_service_1.default,
});
exports.default = GoalsService;
//# sourceMappingURL=goals.service.js.map