"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validateDto_1 = __importDefault(require("inpulse-crm/utils/src/validateDto"));
const create_pause_dto_1 = require("./dto/create-pause.dto");
const update_pause_dto_1 = require("./dto/update-pause.dto");
const pauses_service_1 = __importDefault(require("./pauses.service"));
const instances_service_1 = __importDefault(require("../../instances.service"));
class PausesController {
    constructor() {
        this.router = (0, express_1.Router)();
        this.router.get("/:clientName/pauses", this.get);
        this.router.post("/:clientName/pauses", (0, validateDto_1.default)(create_pause_dto_1.CreatePauseDto), this.create);
        this.router.patch("/:clientName/pauses/:pauseId", (0, validateDto_1.default)(update_pause_dto_1.UpdatePauseDto), this.update);
        this.router.delete("/:clientName/pauses/:pauseId", this.delete);
    }
    async get(req, res) {
        const { clientName } = req.params;
        const queryParams = req.query;
        const { data, page } = await pauses_service_1.default.get(clientName, queryParams);
        return res.status(200).json({ message: "succesful listed pauses", data, page });
    }
    async create(req, res) {
        const { clientName } = req.params;
        const lastPauseId = await instances_service_1.default
            .executeQuery(clientName, "SELECT MAX(CODIGO) AS id FROM motivos_pausa", [])
            .then(data => data.result[0].id || 0);
        req.body.CODIGO = lastPauseId + 1;
        const createdPause = await pauses_service_1.default.create(clientName, req.body);
        return res.status(201).json({ message: "succesful created pause", data: createdPause });
    }
    async update(req, res) {
        const { clientName, pauseId } = req.params;
        const updatedPause = await pauses_service_1.default.update(clientName, +pauseId, req.body);
        return res.status(200).json({ message: "succesful updated pause", data: updatedPause });
    }
    async delete(req, res) {
        const { clientName, pauseId } = req.params;
        await pauses_service_1.default.delete(clientName, pauseId);
        return res.status(200).json({ message: "succesful deleted pause" });
    }
}
exports.default = PausesController;
//# sourceMappingURL=pauses.controller.js.map