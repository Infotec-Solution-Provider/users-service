import { UnauthenticatedError } from "@rgranatodutra/http-errors";
import instancesService from "../../instances.service";
import { User } from "../users/types/User.type";
import jwt, { JwtPayload } from 'jsonwebtoken';
import { randomUUID } from "node:crypto";

class AuthService {
    private static secretKey: string = randomUUID();

    public static async login(clientName: string, LOGIN: string, SENHA: string): Promise<{ token: string, user: User }> {
        const FIND_USER_QUERY = `SELECT * FROM operadores WHERE LOGIN = ? AND SENHA = ?`;

        const user = await instancesService
            .executeQuery<Array<User>>(clientName, FIND_USER_QUERY, [LOGIN, SENHA])
            .then(data => data.result[0]);

        if (!user) {
            throw new UnauthenticatedError("invalid login or password");
        }

        const token = jwt.sign({
            userId: user.CODIGO,
        }, this.secretKey, { subject: clientName, expiresIn: "7d" });

        return { token, user };
    }

    public static async recoverSession(clientName: string, token: string): Promise<User> {
        const decodedToken = jwt.verify(token, this.secretKey, { subject: clientName }) as JwtPayload;

        const FIND_USER_QUERY = `SELECT * FROM operadores WHERE CODIGO = ?`

        const findUser = await instancesService
            .executeQuery<Array<User>>(clientName, FIND_USER_QUERY, [decodedToken["userId"]])
            .then(data => data.result[0]);

        if (!findUser || findUser.ATIVO === "NAO") {
            throw new UnauthenticatedError("user doesn't exist or isn't active");
        }

        return findUser;
    }
}

export default AuthService;