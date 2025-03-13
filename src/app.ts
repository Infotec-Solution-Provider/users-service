import "express-async-errors";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { handleRequestError } from "@rgranatodutra/http-errors";
import getRouterEndpoints from "inpulse-crm/utils/src/getRouterEndpoints.util";
import UsersController from "./controllers/users.controller";
/* import ShiftsController from "./controllers/deactivated/shifts.controller";
import UserGroupsController from "./controllers/deactivated/user-groups.controller";
import PausesController from "./controllers/deactivated/pauses.controller";
import GoalsController from "./controllers/deactivated/goals.controller";
import SipConfigsController from "./controllers/deactivated/sip-configs.controller"; */
import AuthController from "./controllers/auth.controller";
import { Logger } from "@in.pulse-crm/utils";
dotenv.config();

const app = express();

const controllers = {
    users: new UsersController(),
    /*     shifts: new ShiftsController(),
        groups: new UserGroupsController(),
        pauses: new PausesController(),
        goals: new GoalsController(),
        sipConfigs: new SipConfigsController(), */
    auth: new AuthController()
}

const serviceEndpoint = "/api/users-service";

app.use(express.json());
app.use(cors());

app.use(serviceEndpoint, controllers.users.router);
/* app.use(serviceEndpoint, controllers.shifts.router);
app.use(serviceEndpoint, controllers.groups.router);
app.use(serviceEndpoint, controllers.pauses.router);
app.use(serviceEndpoint, controllers.goals.router);
app.use(serviceEndpoint, controllers.sipConfigs.router); */
app.use(serviceEndpoint, controllers.auth.router);

app.use((err: Error, req: Request, _res: Response, next: NextFunction) => {
    Logger.error(req.url, err);
    next(err);
});

app.use(handleRequestError);

Object.values(controllers).forEach(c => {
    const e = getRouterEndpoints(c.router, serviceEndpoint);

    e.forEach(r => console.log(`[ROUTE] ${r}`));
});

export default app;