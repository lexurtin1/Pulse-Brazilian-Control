import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRootEnvLocal = path.resolve(here, "..", "..", ".env.local");

try {
  process.loadEnvFile(repoRootEnvLocal);
} catch {
  // .env.local is optional — CI and other environments provide these vars directly.
}
