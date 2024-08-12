import "express-async-errors";
import express from "express";
import cors from "cors";
import { handleRequestError } from "@rgranatodutra/http-errors";
import getRouterEndpoints from "inpulse-crm/utils/src/getRouterEndpoints.util";
import UsersController from "./modules/users/users.controller";
import ShiftsController from "./modules/shifts/shifts.controller";
import UserGroupsController from "./modules/user-groups/user-groups.controller";
import PausesController from "./modules/pauses/pauses.controller";
import GoalsController from "./modules/goals/goals.controller";
import SipConfigsController from "./modules/sip-configs/sip-configs.controller";
import AuthController from "./modules/auth/auth.controller";

const app = express();

const controllers = {
	users: new UsersController(),
	shifts: new ShiftsController(),
	groups: new UserGroupsController(),
	pauses: new PausesController(),
	goals: new GoalsController(),
	sipConfigs: new SipConfigsController(),
	auth: new AuthController(),
};

const serviceEndpoint = "/api/users-service";

app.use(express.json());
app.use(cors());

app.use(serviceEndpoint, controllers.users.router);
app.use(serviceEndpoint, controllers.shifts.router);
app.use(serviceEndpoint, controllers.groups.router);
app.use(serviceEndpoint, controllers.pauses.router);
app.use(serviceEndpoint, controllers.goals.router);
app.use(serviceEndpoint, controllers.sipConfigs.router);
app.use(serviceEndpoint, controllers.auth.router);

app.use(handleRequestError);

Object.values(controllers).forEach((c) => {
	const e = getRouterEndpoints(c.router, serviceEndpoint);

	e.forEach((r) => console.log(`[ROUTE] ${r}`));
});

export default app;
