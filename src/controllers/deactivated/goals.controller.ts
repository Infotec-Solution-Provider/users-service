import { Request, Response, Router } from "express";
import * as core from "express-serve-static-core";
import validateDto from "inpulse-crm/utils/src/validateDto";
import { CreateGoalDto } from "../../dto/create-goal.dto";
import { UpdateGoalDto } from "../../dto/update-goal.dto";
import { Goal } from "../../types/goal.type";
import { FilterWithPaginationQueryParameters } from "inpulse-crm/utils";
import GoalsService from "../../services/deactivated/goals.service";

class GoalsController {
    public readonly router: core.Router;

    constructor() {
        this.router = Router();

        this.router.get("/:clientName/goals", this.get);
        this.router.post("/:clientName/goals", validateDto(CreateGoalDto), this.create);
        this.router.patch("/:clientName/goals/:goalId", validateDto(UpdateGoalDto), this.update);
        this.router.delete("/:clientName/goals/:goalId", this.delete);
    }

    private async get(req: Request, res: Response): Promise<Response> {
        const { clientName } = req.params;
        const queryParams = req.query as FilterWithPaginationQueryParameters<Goal>;

        const { data, page } = await GoalsService.get(clientName, queryParams);

        return res.status(200).json({ message: "succesful listed goals", data, page });
    }

    private async create(req: Request, res: Response): Promise<Response> {
        const { clientName } = req.params;

        const createdGoal = await GoalsService.create(clientName, req.body);

        return res.status(201).json({ message: "succesful created goal", data: createdGoal });
    }

    private async update(req: Request, res: Response): Promise<Response> {
        const { clientName, goalId } = req.params;

        const updatedGoal = await GoalsService.update(clientName, +goalId, req.body);

        return res.status(200).json({ message: "succesful updated goal", data: updatedGoal });
    }

    private async delete(req: Request, res: Response): Promise<Response> {
        const { clientName, goalId } = req.params;

        await GoalsService.delete(clientName, goalId);

        return res.status(200).json({ message: "succesful deleted goal" });
    }
}

export default GoalsController;