import BasicCrud from "inpulse-crm/utils/src/basicCrud.class";
import { User } from "./types/user.type";
import instancesService from "../../instances.service";

const UsersService = new BasicCrud<User>({
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
    service: instancesService,
});

export default UsersService;