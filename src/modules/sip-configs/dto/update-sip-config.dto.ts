import { PartialType } from "@nestjs/mapped-types";
import { CreateSipConfigDto } from "./create-sip-config.dto";
    
export class UpdateSipConfigDto extends PartialType(CreateSipConfigDto){ }