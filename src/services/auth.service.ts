import "dotenv/config";
import { UnauthenticatedError } from "@rgranatodutra/http-errors";
import instancesService from "./instances.service";
import { User } from "../types/user.type";
import jwt, { JwtPayload } from "jsonwebtoken";

class AuthService {
    private secretKey: string = process.env["JWT_SECRET_KEY"] || "inpulse2025";

    public async login(
        clientName: string,
        LOGIN: string,
        SENHA: string
    ): Promise<{
        token: string;
        user: User;
    }> {
        const FIND_USER_QUERY = `SELECT *
            FROM operadores
            WHERE LOGIN = ?
              AND SENHA = ?`;

        const user = await instancesService
            .executeQuery<Array<User>>(clientName, FIND_USER_QUERY, [LOGIN, SENHA])
            .then((data) => {
                return data[0];
            });

        if (!user) {
            throw new UnauthenticatedError("invalid login or password");
        }

        const token = jwt.sign(
            {
                instance: clientName,
                userId: user.CODIGO,
                sectorId: user.SETOR,
                role: user.NIVEL,
            },
            this.secretKey,
            { expiresIn: "7d" }
        );

        return { token, user };
    }

    public async recoverSessionUser(token: string) /* : Promise<User> */ {
        const decodedToken = jwt.verify(token, this.secretKey) as JwtPayload;

        const FIND_USER_QUERY = `SELECT *
                                 FROM operadores
                                 WHERE CODIGO = ?`;

        const findUser = await instancesService
            .executeQuery<Array<User>>(decodedToken["instance"], FIND_USER_QUERY, [decodedToken["userId"]])
            .then((data) => data[0]);

        if (!findUser || findUser.ATIVO === "NAO") {
            throw new UnauthenticatedError("user doesn't exist or isn't active");
        }

        return findUser;
    }

    public async recoverSessionData(
        token: string
    ): Promise<{ instance: string; userId: number; role: string; sectorId: number }> {
        const decodedToken = jwt.verify(token, this.secretKey);

        if (!decodedToken) {
            throw new UnauthenticatedError("invalid token");
        }

        return decodedToken as { instance: string; userId: number; role: string; sectorId: number } & JwtPayload;
    }
}

export default new AuthService();
