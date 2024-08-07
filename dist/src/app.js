"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("express-async-errors");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_errors_1 = require("@rgranatodutra/http-errors");
const getRouterEndpoints_util_1 = __importDefault(require("inpulse-crm/utils/src/getRouterEndpoints.util"));
const users_controller_1 = __importDefault(require("./modules/users/users.controller"));
const shifts_controller_1 = __importDefault(require("./modules/shifts/shifts.controller"));
const user_groups_controller_1 = __importDefault(require("./modules/user-groups/user-groups.controller"));
const pauses_controller_1 = __importDefault(require("./modules/pauses/pauses.controller"));
const goals_controller_1 = __importDefault(require("./modules/goals/goals.controller"));
const sip_configs_controller_1 = __importDefault(require("./modules/sip-configs/sip-configs.controller"));
const auth_controller_1 = __importDefault(require("./modules/auth/auth.controller"));
const app = (0, express_1.default)();
const controllers = {
    users: new users_controller_1.default(),
    shifts: new shifts_controller_1.default(),
    groups: new user_groups_controller_1.default(),
    pauses: new pauses_controller_1.default(),
    goals: new goals_controller_1.default(),
    sipConfigs: new sip_configs_controller_1.default(),
    auth: new auth_controller_1.default()
};
const serviceEndpoint = "/api/users-service";
app.use(express_1.default.json());
app.use((0, cors_1.default)());
app.use(serviceEndpoint, controllers.users.router);
app.use(serviceEndpoint, controllers.shifts.router);
app.use(serviceEndpoint, controllers.groups.router);
app.use(serviceEndpoint, controllers.pauses.router);
app.use(serviceEndpoint, controllers.goals.router);
app.use(serviceEndpoint, controllers.sipConfigs.router);
app.use(serviceEndpoint, controllers.auth.router);
app.use(http_errors_1.handleRequestError);
Object.values(controllers).forEach(c => {
    const e = (0, getRouterEndpoints_util_1.default)(c.router, serviceEndpoint);
    e.forEach(r => console.log(`[ROUTE] ${r}`));
});
exports.default = app;
//# sourceMappingURL=app.js.map