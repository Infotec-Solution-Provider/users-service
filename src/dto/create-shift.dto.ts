import { IsIn, IsOptional, IsString } from "class-validator";
import { Shift } from "../types/shift.type";

export class CreateShiftDto implements Partial<Shift> {
    @IsString()
    DESCRICAO?: string;

    @IsIn(["SIM", "NAO"])
    @IsOptional()
    HORARIO_1?: "SIM" | "NAO";

    @IsIn(["SIM", "NAO"])
    @IsOptional()
    HORARIO_2?: "SIM" | "NAO";

    @IsIn(["SIM", "NAO"])
    @IsOptional()
    HORARIO_3?: "SIM" | "NAO";

    @IsString()
    @IsOptional()
    ENTRADA_1?: string;

    @IsString()
    @IsOptional()
    ENTRADA_2?: string;

    @IsString()
    @IsOptional()
    ENTRADA_3?: string;

    @IsString()
    @IsOptional()
    SAIDA_1?: string;

    @IsString()
    @IsOptional()
    SAIDA_2?: string;

    @IsString()
    @IsOptional()
    SAIDA_3?: string;
}