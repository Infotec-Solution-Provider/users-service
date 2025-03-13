import "dotenv/config";
import { InstanceSDK } from "@in.pulse-crm/sdk";
import axios from "axios";

const axiosInstance = axios.create({
    baseURL: process.env["INSTANCES_SERVICE_URL"]!,
    timeout: 30000
});

const instancesService = new InstanceSDK(axiosInstance);

export default instancesService;