import { SipConfig } from "../types/sip-config.type";
export declare class CreateSipConfigDto implements Partial<SipConfig> {
    COD_OPERADOR?: number;
    USRID_SIP?: string;
    LOGIN_SIP?: string;
    SENHA_SIP?: string;
    RAMAL_SIP?: string;
    CODECS_SIP?: string;
    IP_SERVIDOR_SIP?: string;
    CFG_CONFIG_SIP?: string;
}
