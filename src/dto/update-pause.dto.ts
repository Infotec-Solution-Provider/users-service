import { PartialType } from "@nestjs/mapped-types";
import { CreatePauseDto } from "./create-pause.dto";
    
export class UpdatePauseDto extends PartialType(CreatePauseDto){ }