export interface Shift {
    CODIGO: number;
    HORARIO_1: "SIM" | "NAO" | null;
    HORARIO_2: "SIM" | "NAO" | null;
    HORARIO_3: "SIM" | "NAO" | null;
    ENTRADA_1: string;
    ENTRADA_2: string;
    ENTRADA_3: string;
    SAIDA_1: string;
    SAIDA_2: string;
    SAIDA_3: string;
    DESCRICAO: string;
}