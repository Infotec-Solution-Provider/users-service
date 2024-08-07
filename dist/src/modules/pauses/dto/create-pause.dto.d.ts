import { Pause } from "../types/Pause.type";
export declare class CreatePauseDto implements Partial<Pause> {
    DESCRICAO: string;
    PRODUTIVIDADE: "SIM" | "NAO";
    TEMPO_MAX_SEG: number;
}
