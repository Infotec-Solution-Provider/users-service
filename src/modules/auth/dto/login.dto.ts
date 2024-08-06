import { IsString } from "class-validator";

export class LoginDto {
    @IsString()
    LOGIN: string;

    @IsString()
    SENHA: string;
}