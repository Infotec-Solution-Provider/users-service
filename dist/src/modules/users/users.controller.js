"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validateDto_1 = __importDefault(require("inpulse-crm/utils/src/validateDto"));
const create_user_dto_1 = require("./dto/create-user.dto");
const update_user_dto_1 = require("./dto/update-user.dto");
const users_service_1 = __importDefault(require("./users.service"));
const instances_service_1 = __importDefault(require("../../instances.service"));
class UsersController {
    constructor() {
        this.router = (0, express_1.Router)();
        this.router.get("/:clientName/users", this.get);
        this.router.post("/:clientName/users", (0, validateDto_1.default)(create_user_dto_1.CreateUserDto), this.create);
        this.router.patch("/:clientName/users/:userId", (0, validateDto_1.default)(update_user_dto_1.UpdateUserDto), this.update);
        this.router.delete("/:clientName/users/:userId", this.deactivate);
    }
    async get(req, res) {
        const { clientName } = req.params;
        const queryParams = req.query;
        const { data, page } = await users_service_1.default.get(clientName, queryParams);
        return res.status(200).json({ message: "succesful listed users", data, page });
    }
    async create(req, res) {
        const { clientName } = req.params;
        const lastUserId = await instances_service_1.default
            .executeQuery(clientName, "SELECT MAX(CODIGO) AS id FROM operadores", [])
            .then(data => data.result[0].id || 0);
        req.body.CODIGO = lastUserId + 1;
        const createdUser = await users_service_1.default.create(clientName, req.body);
        return res.status(201).json({ message: "succesful created user", data: createdUser });
    }
    async update(req, res) {
        const { clientName, userId } = req.params;
        const updatedUser = await users_service_1.default.update(clientName, +userId, req.body);
        return res.status(200).json({ message: "succesful updated user", data: updatedUser });
    }
    async deactivate(req, res) {
        const { clientName, userId } = req.params;
        const deactivatedUser = await users_service_1.default.update(clientName, +userId, { ATIVO: "NAO" });
        return res.status(200).json({ message: "succesful deactivated user", data: deactivatedUser });
    }
}
exports.default = UsersController;
//# sourceMappingURL=users.controller.js.map