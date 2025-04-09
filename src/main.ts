import "express-async-errors";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { handleRequestError } from "@rgranatodutra/http-errors";
import { Logger, logRoutes } from "@in.pulse-crm/utils";
import usersController from "./controllers/users.controller";
import authController from "./controllers/auth.controller";
dotenv.config();

const app = express();

const serviceEndpoint = "/api";

app.use(express.json());
app.use(cors());

app.use(serviceEndpoint, usersController.router);
app.use(serviceEndpoint, authController.router);

app.use((err: Error, req: Request, _res: Response, next: NextFunction) => {
  Logger.error(req.url, err);
  next(err);
});

app.use(handleRequestError);

logRoutes("/api", [usersController.router, authController.router]);

const LISTEN_PORT = Number(process.env["LISTEN_PORT"]) || 8001;

app.listen(LISTEN_PORT, () =>
  console.log(`App is running on port ${LISTEN_PORT}`)
);
