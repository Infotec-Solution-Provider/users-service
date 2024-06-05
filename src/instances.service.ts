import { InstancesMannager } from "inpulse-crm/connection/src/instances-mannager";
import "dotenv/config";

const instancesService = new InstancesMannager(process.env.INSTANCES_SERVICE_URL || "http://localhost:8000");

export default instancesService;