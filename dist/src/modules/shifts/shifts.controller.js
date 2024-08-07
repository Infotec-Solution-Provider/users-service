"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validateDto_1 = __importDefault(require("inpulse-crm/utils/src/validateDto"));
const create_shift_dto_1 = require("./dto/create-shift.dto");
const update_shift_dto_1 = require("./dto/update-shift.dto");
const shifts_service_1 = __importDefault(require("./shifts.service"));
const instances_service_1 = __importDefault(require("../../instances.service"));
class ShiftsController {
    constructor() {
        this.router = (0, express_1.Router)();
        this.router.get("/:clientName/shifts", this.get);
        this.router.post("/:clientName/shifts", (0, validateDto_1.default)(create_shift_dto_1.CreateShiftDto), this.create);
        this.router.patch("/:clientName/shifts/:shiftId", (0, validateDto_1.default)(update_shift_dto_1.UpdateShiftDto), this.update);
        this.router.delete("/:clientName/shifts/:shiftId", this.delete);
    }
    async get(req, res) {
        const { clientName } = req.params;
        const queryParams = req.query;
        const { data, page } = await shifts_service_1.default.get(clientName, queryParams);
        return res.status(200).json({ message: "succesful listed shifts", data, page });
    }
    async create(req, res) {
        const { clientName } = req.params;
        const lastShiftId = await instances_service_1.default
            .executeQuery(clientName, "SELECT MAX(CODIGO) AS id FROM horarios", [])
            .then(data => data.result[0].id || 0);
        req.body.CODIGO = lastShiftId + 1;
        const createdShift = await shifts_service_1.default.create(clientName, req.body);
        return res.status(201).json({ message: "succesful created shift", data: createdShift });
    }
    async update(req, res) {
        const { clientName, shiftId } = req.params;
        const updatedShift = await shifts_service_1.default.update(clientName, +shiftId, req.body);
        return res.status(200).json({ message: "succesful updated shift", data: updatedShift });
    }
    async delete(req, res) {
        const { clientName, shiftId } = req.params;
        await shifts_service_1.default.delete(clientName, +shiftId);
        return res.status(200).json({ message: "succesful deleted shift" });
    }
}
exports.default = ShiftsController;
//# sourceMappingURL=shifts.controller.js.map