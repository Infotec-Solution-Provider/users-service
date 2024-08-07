"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const basicCrud_class_1 = __importDefault(require("inpulse-crm/utils/src/basicCrud.class"));
const instances_service_1 = __importDefault(require("../../instances.service"));
const UsersService = new basicCrud_class_1.default({
    tableName: "operadores",
    primaryKey: "CODIGO",
    numberColumns: [
        "CODIGO",
        "HORARIO",
        "LIGA_REPRESENTANTE_DIAS",
        "SETOR",
    ],
    likeColumns: [
        "EMAILOPERADOR",
        "EMAIL_EXIBICAO",
        "EMAIl",
        "LOGIN",
        "NOME",
        "NOME_EXIBICAO",
    ],
    dateColumns: [
        "DATACAD",
        "EXPIRA_EM",
        "ULTIMO_LOGIN_INI",
        "ULTIMO_LOGIN_FIM",
    ],
    service: instances_service_1.default,
});
exports.default = UsersService;
//# sourceMappingURL=users.service.js.map