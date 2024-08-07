"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validateDto_1 = __importDefault(require("inpulse-crm/utils/src/validateDto"));
const create_user_group_dto_1 = require("./dto/create-user-group.dto");
const update_user_group_dto_1 = require("./dto/update-user-group.dto");
const user_groups_service_1 = __importDefault(require("./user-groups.service"));
const instances_service_1 = __importDefault(require("../../instances.service"));
class UserGroupsController {
    constructor() {
        this.router = (0, express_1.Router)();
        this.router.get("/:clientName/user-groups", this.get);
        this.router.post("/:clientName/user-groups", (0, validateDto_1.default)(create_user_group_dto_1.CreateUserGroupDto), this.create);
        this.router.patch("/:clientName/user-groups/:usergroupId", (0, validateDto_1.default)(update_user_group_dto_1.UpdateUserGroupDto), this.update);
        this.router.delete("/:clientName/user-groups/:usergroupId", this.delete);
    }
    async get(req, res) {
        const { clientName } = req.params;
        const queryParams = req.query;
        const { data, page } = await user_groups_service_1.default.get(clientName, queryParams);
        return res.status(200).json({ message: "succesful listed user groups", data, page });
    }
    async create(req, res) {
        const { clientName } = req.params;
        const lastUserGroupId = await instances_service_1.default
            .executeQuery(clientName, "SELECT MAX(CODIGO) AS id FROM grupos_operador", [])
            .then(data => data.result[0].id || 0);
        req.body.CODIGO = lastUserGroupId + 1;
        const createdUserGroup = await user_groups_service_1.default.create(clientName, req.body);
        return res.status(201).json({ message: "succesful created user group", data: createdUserGroup });
    }
    async update(req, res) {
        const { clientName, usergroupId } = req.params;
        const updatedUserGroup = await user_groups_service_1.default.update(clientName, +usergroupId, req.body);
        return res.status(200).json({ message: "succesful updated user group", data: updatedUserGroup });
    }
    async delete(req, res) {
        const { clientName, usergroupId } = req.params;
        await user_groups_service_1.default.delete(clientName, +usergroupId);
        return res.status(200).json({ message: "succesful deleted user group" });
    }
}
exports.default = UserGroupsController;
//# sourceMappingURL=user-groups.controller.js.map