"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdatePauseDto = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const create_pause_dto_1 = require("./create-pause.dto");
class UpdatePauseDto extends (0, mapped_types_1.PartialType)(create_pause_dto_1.CreatePauseDto) {
}
exports.UpdatePauseDto = UpdatePauseDto;
//# sourceMappingURL=update-pause.dto.js.map