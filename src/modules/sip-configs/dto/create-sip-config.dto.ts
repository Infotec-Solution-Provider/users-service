import { IsNumber, IsOptional, IsString } from "class-validator";
import { SipConfig } from "../types/sip-config.type";

export class CreateSipConfigDto implements Partial<SipConfig> {
    @IsNumber()
    COD_OPERADOR?: number;

    @IsString()
    @IsOptional()
    USRID_SIP?: string;

    @IsString()
    @IsOptional()
    LOGIN_SIP?: string;

    @IsString()
    @IsOptional()
    SENHA_SIP?: string;

    @IsString()
    @IsOptional()
    RAMAL_SIP?: string;

    @IsString()
    @IsOptional()
    CODECS_SIP?: string;

    @IsString()
    @IsOptional()
    IP_SERVIDOR_SIP?: string;

    @IsString()
    @IsOptional()
    CFG_CONFIG_SIP?: string;
}