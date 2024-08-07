"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_errors_1 = require("@rgranatodutra/http-errors");
const instances_service_1 = __importDefault(require("../../instances.service"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const node_crypto_1 = require("node:crypto");
class AuthService {
    static async login(clientName, LOGIN, SENHA) {
        const FIND_USER_QUERY = `SELECT * FROM operadores WHERE LOGIN = ? AND SENHA = ?`;
        const user = await instances_service_1.default
            .executeQuery(clientName, FIND_USER_QUERY, [LOGIN, SENHA])
            .then(data => data.result[0]);
        if (!user) {
            throw new http_errors_1.UnauthenticatedError("invalid login or password");
        }
        const token = jsonwebtoken_1.default.sign({
            userId: user.CODIGO,
        }, this.secretKey, { subject: clientName, expiresIn: "7d" });
        return { token, user };
    }
    static async recoverSession(clientName, token) {
        const decodedToken = jsonwebtoken_1.default.verify(token, this.secretKey, { subject: clientName });
        const FIND_USER_QUERY = `SELECT * FROM operadores WHERE CODIGO = ?`;
        const findUser = await instances_service_1.default
            .executeQuery(clientName, FIND_USER_QUERY, [decodedToken["userId"]])
            .then(data => data.result[0]);
        if (!findUser || findUser.ATIVO === "NAO") {
            throw new http_errors_1.UnauthenticatedError("user doesn't exist or isn't active");
        }
        return findUser;
    }
}
AuthService.secretKey = (0, node_crypto_1.randomUUID)();
exports.default = AuthService;
//# sourceMappingURL=auth.service.js.map