import { IsIn, IsInt, IsNumber } from "class-validator";
import { Goal } from "../types/goal.type";

export class CreateGoalDto implements Partial<Goal> {
    @IsInt()
    OPERADOR?: number;

    @IsIn(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"])
    MES?: string;

    @IsInt()
    ANO?: number;

    @IsNumber()
    VALOR_META?: number;
}