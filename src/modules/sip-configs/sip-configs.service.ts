import BasicCrud from "inpulse-crm/utils/src/basicCrud.class";
import { SipConfig } from "./types/sip-config.type";
import instancesService from "../../instances.service";

const SipConfigsService = new BasicCrud<SipConfig>({
    tableName: "operadores_config_sip",
    primaryKey: "COD_CONFIG_SIP",
    numberColumns: ["COD_OPERADOR"],
    likeColumns: ["CFG_CONFIG_SIP", "IP_SERVIDOR_SIP", "LOGIN_SIP", "RAMAL_SIP", "SENHA_SIP", "USRID_SIP"],
    dateColumns: [],
    service: instancesService
});

export default SipConfigsService;