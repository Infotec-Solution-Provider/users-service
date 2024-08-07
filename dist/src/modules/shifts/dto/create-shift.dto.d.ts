import { Shift } from "../types/Shift.type";
export declare class CreateShiftDto implements Partial<Shift> {
    DESCRICAO?: string;
    HORARIO_1?: "SIM" | "NAO";
    HORARIO_2?: "SIM" | "NAO";
    HORARIO_3?: "SIM" | "NAO";
    ENTRADA_1?: string;
    ENTRADA_2?: string;
    ENTRADA_3?: string;
    SAIDA_1?: string;
    SAIDA_2?: string;
    SAIDA_3?: string;
}
