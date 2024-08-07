"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const basicCrud_class_1 = __importDefault(require("inpulse-crm/utils/src/basicCrud.class"));
const instances_service_1 = __importDefault(require("../../instances.service"));
const SipConfigsService = new basicCrud_class_1.default({
    tableName: "operadores_config_sip",
    primaryKey: "COD_CONFIG_SIP",
    numberColumns: ["COD_OPERADOR"],
    likeColumns: ["CFG_CONFIG_SIP", "IP_SERVIDOR_SIP", "LOGIN_SIP", "RAMAL_SIP", "SENHA_SIP", "USRID_SIP"],
    dateColumns: [],
    service: instances_service_1.default
});
exports.default = SipConfigsService;
//# sourceMappingURL=sip-configs.service.js.map