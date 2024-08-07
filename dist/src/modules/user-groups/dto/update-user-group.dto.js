"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateUserGroupDto = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const create_user_group_dto_1 = require("./create-user-group.dto");
class UpdateUserGroupDto extends (0, mapped_types_1.PartialType)(create_user_group_dto_1.CreateUserGroupDto) {
}
exports.UpdateUserGroupDto = UpdateUserGroupDto;
//# sourceMappingURL=update-user-group.dto.js.map