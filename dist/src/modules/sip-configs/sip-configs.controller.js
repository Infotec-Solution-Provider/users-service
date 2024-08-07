"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validateDto_1 = __importDefault(require("inpulse-crm/utils/src/validateDto"));
const create_sip_config_dto_1 = require("./dto/create-sip-config.dto");
const update_sip_config_dto_1 = require("./dto/update-sip-config.dto");
const sip_configs_service_1 = __importDefault(require("./sip-configs.service"));
class SipConfigsController {
    constructor() {
        this.router = (0, express_1.Router)();
        this.router.get("/:clientName/sip-configs", this.get);
        this.router.post("/:clientName/sip-configs", (0, validateDto_1.default)(create_sip_config_dto_1.CreateSipConfigDto), this.create);
        this.router.patch("/:clientName/sip-configs/:sipConfigId", (0, validateDto_1.default)(update_sip_config_dto_1.UpdateSipConfigDto), this.update);
        this.router.delete("/:clientName/sip-configs/:sipConfigId", this.delete);
    }
    async get(req, res) {
        const { clientName } = req.params;
        const queryParams = req.query;
        const { data, page } = await sip_configs_service_1.default.get(clientName, queryParams);
        return res.status(200).json({ message: "succesful listed sip configs", data, page });
    }
    async create(req, res) {
        const { clientName } = req.params;
        const createdSipConfig = await sip_configs_service_1.default.create(clientName, req.body);
        return res.status(201).json({ message: "succesful created sip config", data: createdSipConfig });
    }
    async update(req, res) {
        const { clientName, sipConfigId } = req.params;
        const updatedSipConfig = await sip_configs_service_1.default.update(clientName, +sipConfigId, req.body);
        return res.status(200).json({ message: "succesful updated sip config", data: updatedSipConfig });
    }
    async delete(req, res) {
        const { clientName, sipConfigId } = req.params;
        await sip_configs_service_1.default.delete(clientName, sipConfigId);
        return res.status(200).json({ message: "succesful deleted sip config" });
    }
}
exports.default = SipConfigsController;
//# sourceMappingURL=sip-configs.controller.js.map