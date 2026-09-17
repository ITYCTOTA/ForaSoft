import { fileURLToPath } from "node:url";
import path from "node:path";

import { startServer } from "./app.js";

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) startServer();
