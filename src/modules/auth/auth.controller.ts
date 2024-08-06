import { Request, Response, Router } from "express";
import * as core from "express-serve-static-core";
import AuthService from "./auth.service";
import validateDto from "inpulse-crm/utils/src/validateDto";
import { LoginDto } from "./dto/login.dto";

class AuthController {
    public readonly router: core.Router;

    constructor() {
        this.router = Router();

        this.router.post("/:clientName/auth", validateDto(LoginDto), this.login);
        this.router.get("/:clientName/auth", this.recoverSession);
    }

    private async login(req: Request, res: Response): Promise<Response> {
        const { LOGIN, SENHA } = req.body;
        const { clientName } = req.params;

        const { token, user } = await AuthService.login(clientName, LOGIN, SENHA);

        return res.status(200).json({ message: "successful authentication", token, user });
    }

    private async recoverSession(req: Request, res: Response): Promise<Response> {
        const { clientName } = req.params;
        const token = (req.headers["authorization"] as string).split(" ")[1];

        const user = await AuthService.recoverSession(clientName, token);

        return res.status(200).json({ message: "succesful recovered session", user });
    }
}

export default AuthController;