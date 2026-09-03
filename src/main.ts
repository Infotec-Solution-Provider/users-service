import "express-async-errors";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { handleRequestError } from "@rgranatodutra/http-errors";
import { Logger, logRoutes } from "@in.pulse-crm/utils";
import usersController from "./controllers/users.controller";
import authController from "./controllers/auth.controller";
import onlineSessionsController from "./controllers/online-sessions.controller";
dotenv.config();

const app = express();

app.use(express.json());
const allowedOrigins = new Set(
  (process.env["AUTH_ALLOWED_ORIGINS"] || "http://localhost:3000,https://inpulse.infotecrs.inf.br")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("origin not allowed"));
  },
}));

app.use("/api", usersController.router);
app.use("/api", authController.router);
app.use("/api", onlineSessionsController.router);

app.use((err: Error, req: Request, _res: Response, next: NextFunction) => {
  Logger.error(req.url, err);
  next(err);
});

app.use(handleRequestError);

logRoutes("/api", [
  usersController.router,
  authController.router,
  onlineSessionsController.router,
]);

const LISTEN_PORT = Number(process.env["LISTEN_PORT"]) || 8001;

app.listen(LISTEN_PORT, () =>
  console.log(`App is running on port ${LISTEN_PORT}`)
);
