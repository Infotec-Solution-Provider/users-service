export interface SipConfig {
    COD_CONFIG_SIP: number;
    COD_OPERADOR: number;
    RAMAL_SIP: string | null;
    IP_SERVIDOR_SIP: string | null;
    LOGIN_SIP: string | null;
    SENHA_SIP: string | null;
    USRID_SIP: string | null;
    CODECS_SIP: string | null;
    CFG_CONFIG_SIP: string | null;
}

export interface GlobalSipConfig {
    CODIGO: number;
    ASTERISK_SERVER: string | null;
    ASTERISK_PORTA: string | null;
    ASTERISK_PROXY: string | null;
    SIP_EMITE_BIP: string | null;
    SIP_VOLUME_AUTOMATICO: string | null;
    CALL_IN_DEVICE: string | null;
    CALL_OUT_DEVICE: string | null;
    RING_DEVICE: string | null;
    IP_TELNET: string | null;
    PORTA_TELNET: string | null;
    USUARIO_TELNET: string | null;
    SENHA_TELNET: string | null;
    PAUSARRAMAL: string | null;
    RAMALPAUSA: string | null;
    RAMALDESPAUSA: string | null;
    LIGACAO_IMEDIATA: string | null;
    SIP_ID: string | null;
    SIP_KEY: string | null;
    GRAVAR_LIGACAO: string | null;
}