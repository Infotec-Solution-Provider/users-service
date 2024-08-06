import { Request, Response, Router } from "express";
import * as core from "express-serve-static-core";
import validateDto from "inpulse-crm/utils/src/validateDto";
import { CreateSipConfigDto } from "./dto/create-sip-config.dto";
import { UpdateSipConfigDto } from "./dto/update-sip-config.dto";
import { SipConfig } from "./types/sip-config.type";
import { FilterWithPaginationQueryParameters } from "inpulse-crm/utils";
import SipConfigsService from "./sip-configs.service";

class SipConfigsController {
    public readonly router: core.Router;

    constructor() {
        this.router = Router();

        this.router.get("/:clientName/sip-configs", this.get);
        this.router.post("/:clientName/sip-configs", validateDto(CreateSipConfigDto), this.create);
        this.router.patch("/:clientName/sip-configs/:sipConfigId", validateDto(UpdateSipConfigDto), this.update);
        this.router.delete("/:clientName/sip-configs/:sipConfigId", this.delete);
    }

    private async get(req: Request, res: Response): Promise<Response> {
        const { clientName } = req.params;
        const queryParams = req.query as FilterWithPaginationQueryParameters<SipConfig>;

        const { data, page } = await SipConfigsService.get(clientName, queryParams);

        return res.status(200).json({ message: "succesful listed sip configs", data, page });
    }

    private async create(req: Request, res: Response): Promise<Response> {
        const { clientName } = req.params;

        const createdSipConfig = await SipConfigsService.create(clientName, req.body);

        return res.status(201).json({ message: "succesful created sip config", data: createdSipConfig });
    }

    private async update(req: Request, res: Response): Promise<Response> {
        const { clientName, sipConfigId } = req.params;

        const updatedSipConfig = await SipConfigsService.update(clientName, +sipConfigId, req.body);

        return res.status(200).json({ message: "succesful updated sip config", data: updatedSipConfig });
    }

    private async delete(req: Request, res: Response): Promise<Response> {
        const { clientName, sipConfigId } = req.params;

        await SipConfigsService.delete(clientName, sipConfigId);

        return res.status(200).json({ message: "succesful deleted sip config" });
    }
}

export default SipConfigsController;