"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateSipConfigDto = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const create_sip_config_dto_1 = require("./create-sip-config.dto");
class UpdateSipConfigDto extends (0, mapped_types_1.PartialType)(create_sip_config_dto_1.CreateSipConfigDto) {
}
exports.UpdateSipConfigDto = UpdateSipConfigDto;
//# sourceMappingURL=update-sip-config.dto.js.map