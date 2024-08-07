"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const instances_mannager_1 = require("inpulse-crm/connection/src/instances-mannager");
require("dotenv/config");
const instancesService = new instances_mannager_1.InstancesMannager(process.env.INSTANCES_SERVICE_URL || "http://localhost:8000");
exports.default = instancesService;
//# sourceMappingURL=instances.service.js.map