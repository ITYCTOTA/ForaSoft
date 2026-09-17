import { fileURLToPath } from "node:url";
import path from "node:path";

import { startServer } from "./app.js";

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const server = startServer();
  const shutdown = () => {
    void server.shutdown();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
