import { IsInt } from "class-validator";

export class AddUserGroupDto {
	@IsInt()
	OPERADOR: number;
}
