import { Request, Response, Router } from "express";
import * as core from "express-serve-static-core";
import AuthService from "../services/auth.service";
import validateDto from "inpulse-crm/utils/src/validateDto";
import { LoginDto } from "../dto/login.dto";

class AuthController {
    public readonly router: core.Router;

    constructor() {
        this.router = Router();

        this.router.post("/:instance/login", validateDto(LoginDto), this.login);
        this.router.get("/:instance/auth/", this.recoverSessionData);
        this.router.get("/:instance/auth/user", this.recoverSessionUser);
    }

    private async login(req: Request, res: Response): Promise<Response> {
        const { LOGIN, SENHA } = req.body;
        const instance = req.params["instance"]!

        const data = await AuthService.login(instance, LOGIN, SENHA);

        return res.status(200).json({ message: "successful authentication", data });
    }

    private async recoverSessionUser(req: Request, res: Response): Promise<Response> {
        const instance = req.params["instance"]!
        const token = (req.headers["authorization"] as string).replaceAll("Bearer ", "").trim();
        const data = await AuthService.recoverSessionUser(instance, token);

        return res.status(200).json({ message: "successful recovered session user", data });
    }

    private async recoverSessionData(req: Request, res: Response): Promise<Response> {
        const instance = req.params["instance"]!
        const token = (req.headers["authorization"] as string).replaceAll("Bearer ", "").trim();
        const data = await AuthService.recoverSessionData(instance, token);

        return res.status(200).json({ message: "successful recovered session data", data });
    }
}

export default AuthController;