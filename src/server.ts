import "dotenv/config";
import app from "./app";

const LISTEN_PORT = Number(process.env["LISTEN_PORT"]) || 8001;
app.listen(LISTEN_PORT, () =>
  console.log(`App is running on port ${LISTEN_PORT}`)
);
