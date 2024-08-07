"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validateDto_1 = __importDefault(require("inpulse-crm/utils/src/validateDto"));
const create_goal_dto_1 = require("./dto/create-goal.dto");
const update_goal_dto_1 = require("./dto/update-goal.dto");
const goals_service_1 = __importDefault(require("./goals.service"));
class GoalsController {
    constructor() {
        this.router = (0, express_1.Router)();
        this.router.get("/:clientName/goals", this.get);
        this.router.post("/:clientName/goals", (0, validateDto_1.default)(create_goal_dto_1.CreateGoalDto), this.create);
        this.router.patch("/:clientName/goals/:goalId", (0, validateDto_1.default)(update_goal_dto_1.UpdateGoalDto), this.update);
        this.router.delete("/:clientName/goals/:goalId", this.delete);
    }
    async get(req, res) {
        const { clientName } = req.params;
        const queryParams = req.query;
        const { data, page } = await goals_service_1.default.get(clientName, queryParams);
        return res.status(200).json({ message: "succesful listed goals", data, page });
    }
    async create(req, res) {
        const { clientName } = req.params;
        const createdGoal = await goals_service_1.default.create(clientName, req.body);
        return res.status(201).json({ message: "succesful created goal", data: createdGoal });
    }
    async update(req, res) {
        const { clientName, goalId } = req.params;
        const updatedGoal = await goals_service_1.default.update(clientName, +goalId, req.body);
        return res.status(200).json({ message: "succesful updated goal", data: updatedGoal });
    }
    async delete(req, res) {
        const { clientName, goalId } = req.params;
        await goals_service_1.default.delete(clientName, goalId);
        return res.status(200).json({ message: "succesful deleted goal" });
    }
}
exports.default = GoalsController;
//# sourceMappingURL=goals.controller.js.map