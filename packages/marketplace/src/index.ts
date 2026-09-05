import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { startMarketplaceServer } from "./server.js";

export * from "./server.js";

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  startMarketplaceServer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
