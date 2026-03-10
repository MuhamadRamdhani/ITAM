import "dotenv/config";
import { buildApp } from "./src/app.js";

const app = await buildApp();

await app.listen({ port: 3001, host: "::" });