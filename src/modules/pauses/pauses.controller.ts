import { Request, Response, Router } from "express";
import * as core from "express-serve-static-core";
import validateDto from "inpulse-crm/utils/src/validateDto";
import { CreatePauseDto } from "./dto/create-pause.dto";
import { UpdatePauseDto } from "./dto/update-pause.dto";
import { Pause } from "./types/pause.type";
import { FilterWithPaginationQueryParameters } from "inpulse-crm/utils";
import PausesService from "./pauses.service";
import instancesService from "../../instances.service";

class PausesController {
    public readonly router: core.Router;

    constructor() {
        this.router = Router();

        this.router.get("/:clientName/pauses", this.get);
        this.router.post("/:clientName/pauses", validateDto(CreatePauseDto), this.create);
        this.router.patch("/:clientName/pauses/:pauseId", validateDto(UpdatePauseDto), this.update);
        this.router.delete("/:clientName/pauses/:pauseId", this.delete);
    }

    private async get(req: Request, res: Response): Promise<Response> {
        const { clientName } = req.params;
        const queryParams = req.query as FilterWithPaginationQueryParameters<Pause>;

        const { data, page } = await PausesService.get(clientName, queryParams);

        return res.status(200).json({ message: "succesful listed pauses", data, page });
    }

    private async create(req: Request, res: Response): Promise<Response> {
        const { clientName } = req.params;

        const lastPauseId = await instancesService
            .executeQuery<Array<{ id: number }>>(clientName, "SELECT MAX(CODIGO) AS id FROM motivos_pausa", [])
            .then(data => data.result[0].id || 0);

        req.body.CODIGO = lastPauseId + 1;

        const createdPause = await PausesService.create(clientName, req.body);

        return res.status(201).json({ message: "succesful created pause", data: createdPause });
    }

    private async update(req: Request, res: Response): Promise<Response> {
        const { clientName, pauseId } = req.params;

        const updatedPause = await PausesService.update(clientName, +pauseId, req.body);

        return res.status(200).json({ message: "succesful updated pause", data: updatedPause });
    }

    private async delete(req: Request, res: Response): Promise<Response> {
        const { clientName, pauseId } = req.params;

        await PausesService.delete(clientName, pauseId);

        return res.status(200).json({ message: "succesful deleted pause" });
    }
}

export default PausesController;