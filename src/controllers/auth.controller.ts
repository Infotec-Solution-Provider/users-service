import { Request, Response, Router } from "express";
import * as core from "express-serve-static-core";
import AuthService from "../services/auth.service";
import validateDto from "inpulse-crm/utils/src/validateDto";
import { LoginDto } from "../dto/login.dto";

class AuthController {
    public readonly router: core.Router;

    constructor() {
        this.router = Router();

        this.router.post("/auth/login", validateDto(LoginDto), this.login);
        this.router.get("/auth/session", this.recoverSessionData);
    }

    private async login(req: Request, res: Response): Promise<Response> {
        const { LOGIN, SENHA, instance } = req.body;

        const data = await AuthService.login(instance, LOGIN, SENHA);

        return res.status(200).json({ message: "successful authentication", data: data });
    }

    private async recoverSessionData(req: Request, res: Response): Promise<Response> {
        const token = (req.headers["authorization"] as string).replaceAll("Bearer ", "").trim();
        const data = await AuthService.recoverSessionData(token);

        return res.status(200).json({ message: "successful recovered session data", data });
    }
}

export default new AuthController();