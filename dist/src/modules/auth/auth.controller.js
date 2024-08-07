"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_service_1 = __importDefault(require("./auth.service"));
const validateDto_1 = __importDefault(require("inpulse-crm/utils/src/validateDto"));
const login_dto_1 = require("./dto/login.dto");
class AuthController {
    constructor() {
        this.router = (0, express_1.Router)();
        this.router.post("/:clientName/auth", (0, validateDto_1.default)(login_dto_1.LoginDto), this.login);
        this.router.get("/:clientName/auth", this.recoverSession);
    }
    async login(req, res) {
        const { LOGIN, SENHA } = req.body;
        const { clientName } = req.params;
        const { token, user } = await auth_service_1.default.login(clientName, LOGIN, SENHA);
        return res.status(200).json({ message: "successful authentication", token, user });
    }
    async recoverSession(req, res) {
        const { clientName } = req.params;
        const token = req.headers["authorization"].split(" ")[1];
        const user = await auth_service_1.default.recoverSession(clientName, token);
        return res.status(200).json({ message: "succesful recovered session", user });
    }
}
exports.default = AuthController;
//# sourceMappingURL=auth.controller.js.map