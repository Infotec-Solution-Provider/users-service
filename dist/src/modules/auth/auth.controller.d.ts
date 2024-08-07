import * as core from "express-serve-static-core";
declare class AuthController {
    readonly router: core.Router;
    constructor();
    private login;
    private recoverSession;
}
export default AuthController;
