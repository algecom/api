import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";

import v1 from "./v1";

const app = new Elysia();

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") }));

app.get("/", () => "Hello from Algecom API!");

app.group("/v1", v1 as any);

app.listen({ port: process.env.APP_PORT });

console.log(`Server is running on => http://${app.server?.hostname}:${app.server?.port}`);
