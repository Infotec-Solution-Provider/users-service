import "dotenv/config";
import { InstanceSDK } from "@in.pulse-crm/sdk";
import axios from "axios";

const axiosInstance = axios.create({
    baseURL: process.env["INSTANCES_SERVICE_URL"] || "http://localhost:7000/api/instances",
    timeout: 30000
});

console.log(process.env["INSTANCES_SERVICE_URL"]!)
const instancesService = new InstanceSDK(axiosInstance);

export default instancesService;