import { Goal } from "../types/Goal.type";
export declare class CreateGoalDto implements Partial<Goal> {
    OPERADOR?: number;
    MES?: string;
    ANO?: number;
    VALOR_META?: number;
}
