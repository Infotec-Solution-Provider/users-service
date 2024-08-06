import { Request, Response, Router } from "express";
import * as core from "express-serve-static-core";
import validateDto from "inpulse-crm/utils/src/validateDto";
import { CreateShiftDto } from "./dto/create-shift.dto";
import { UpdateShiftDto } from "./dto/update-shift.dto";
import { Shift } from "./types/shift.type";
import { FilterWithPaginationQueryParameters } from "inpulse-crm/utils";
import ShiftsService from "./shifts.service";
import instancesService from "../../instances.service";

class ShiftsController {
    public readonly router: core.Router;

    constructor() {
        this.router = Router();

        this.router.get("/:clientName/shifts", this.get);
        this.router.post("/:clientName/shifts", validateDto(CreateShiftDto), this.create);
        this.router.patch("/:clientName/shifts/:shiftId", validateDto(UpdateShiftDto), this.update);
        this.router.delete("/:clientName/shifts/:shiftId", this.delete);
    }

    private async get(req: Request, res: Response): Promise<Response> {
        const { clientName } = req.params;
        const queryParams = req.query as FilterWithPaginationQueryParameters<Shift>;

        const { data, page } = await ShiftsService.get(clientName, queryParams);

        return res.status(200).json({ message: "succesful listed shifts", data, page });
    }

    private async create(req: Request, res: Response): Promise<Response> {
        const { clientName } = req.params;

        const lastShiftId = await instancesService
            .executeQuery<Array<{ id: number }>>(clientName, "SELECT MAX(CODIGO) AS id FROM horarios", [])
            .then(data => data.result[0].id || 0);

        req.body.CODIGO = lastShiftId + 1;

        const createdShift = await ShiftsService.create(clientName, req.body);

        return res.status(201).json({ message: "succesful created shift", data: createdShift });
    }

    private async update(req: Request, res: Response): Promise<Response> {
        const { clientName, shiftId } = req.params;

        const updatedShift = await ShiftsService.update(clientName, +shiftId, req.body);

        return res.status(200).json({ message: "succesful updated shift", data: updatedShift });
    }

    private async delete(req: Request, res: Response): Promise<Response> {
        const { clientName, shiftId } = req.params;

        await ShiftsService.delete(clientName, +shiftId);

        return res.status(200).json({ message: "succesful deleted shift" });
    }
}

export default ShiftsController;