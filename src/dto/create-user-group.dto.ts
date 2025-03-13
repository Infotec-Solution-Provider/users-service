import { IsString, MaxLength, MinLength } from "class-validator";
import { UserGroup } from "../types/user-group.type";

export class CreateUserGroupDto implements Partial<UserGroup> {
    @IsString()
    @MinLength(3)
    @MaxLength(35)
    DESCRICAO?: string;
}