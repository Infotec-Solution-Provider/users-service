import { IsIn, IsInt, IsString } from "class-validator";
import { Pause } from "../types/pause.type";

export class CreatePauseDto implements Partial<Pause> {
    @IsString()
    DESCRICAO: string;

    @IsIn(["SIM", "NAO"])
    PRODUTIVIDADE: "SIM" | "NAO";

    @IsInt()
    TEMPO_MAX_SEG: number;
}