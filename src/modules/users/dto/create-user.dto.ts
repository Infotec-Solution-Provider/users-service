import { IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString } from "class-validator";
import { User } from "../types/User.type";

export class CreateUserDto implements Partial<User> {
    @IsIn(["SIM", "NAO"])
    @IsOptional()
    ATIVO: 'SIM' | 'NAO' | null;

    @IsString()
    NOME: string;

    @IsString()
    LOGIN: string;

    @IsEmail()
    @IsOptional()
    EMAIl: string;

    @IsIn(["ATIVO", "RECEP", "AMBOS", "ADMIN"])
    NIVEL: 'ATIVO' | 'RECEP' | 'AMBOS' | 'ADMIN' | null;

    @IsInt()
    @IsOptional()
    HORARIO: number;

    @IsDateString()
    @IsOptional()
    DATACAD: Date | null;

    @IsInt()
    @IsOptional()
    SETOR: number;

    @IsString()
    @IsOptional()
    NOME_EXIBICAO: string | null;

    @IsString()
    @IsOptional()
    CODIGO_ERP: string;

    @IsString()
    @IsOptional()
    SETOR_NOME: string;

    @IsString()
    SENHA?: string | null;

    @IsDateString()
    @IsOptional()
    EXPIRA_EM: Date | null;

    @IsIn(["SIM", "NAO"])
    @IsOptional()
    ALTERA_SENHA: 'SIM' | 'NAO' | null;

    @IsIn(["SIM", "NAO"])
    @IsOptional()
    EDITA_CONTATOS: 'SIM' | 'NAO' | null;

    @IsIn(["SIM", "NAO"])
    @IsOptional()
    VISUALIZA_COMPRAS: 'SIM' | 'NAO' | null;

    @IsIn(["TOTAL", "NULOS"])
    @IsOptional()
    CADASTRO: 'TOTAL' | 'NULOS' | null;

    @IsString()
    @IsOptional()
    CODTELEFONIA: string;

    @IsIn(["SIM", "NAO"])
    @IsOptional()
    AGENDA_LIG: 'SIM' | 'NAO';

    @IsIn(["SIM", "NAO"])
    @IsOptional()
    LIGA_REPRESENTANTE: 'SIM' | 'NAO';
    BANCO: string;

    @IsIn(["SIM", "NAO"])
    @IsOptional()
    FILTRA_DDD: 'SIM' | 'NAO';

    @IsIn(["SIM", "NAO"])
    @IsOptional()
    FILTRA_ESTADO: 'SIM' | 'NAO';

    @IsString()
    @IsOptional()
    ASTERISK_RAMAL: string | null;

    @IsString()
    @IsOptional()
    ASTERISK_USERID: string | null;

    @IsString()
    @IsOptional()
    ASTERISK_LOGIN: string | null;

    @IsString()
    @IsOptional()
    ASTERISK_SENHA: string | null;

    @IsString()
    @IsOptional()
    CODEC: string | null;

    @IsString()
    @IsOptional()
    ASSINATURA_EMAIL: string | null;

    @IsInt()
    @IsOptional()
    LIGA_REPRESENTANTE_DIAS: number | null;

    @IsEmail()
    @IsString()
    EMAILOPERADOR: string | null;

    @IsString()
    @IsOptional()
    SENHAEMAILOPERADOR: string | null;

    @IsString()
    @IsOptional()
    EMAIL_EXIBICAO: string | null;

    @IsInt()
    @IsOptional()
    limite_diario_agendamento: number | null;

    @IsInt()
    @IsOptional()
    OMNI: number | null;

    @IsString()
    @IsOptional()
    CAMINHO_DATABASE: string | null;

    @IsString()
    @IsOptional()
    IDCAMPANHA_WEON: string | null;
}