import { existsSync } from "node:fs";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { ZodError, z } from "zod";
import { cookieSecret } from "./auth.js";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { AppError } from "./errors.js";
import { apiRoutes } from "./routes/api.js";
import { mcpRoutes } from "./routes/mcp.js";
import { createServices } from "./services/index.js";

const db = await connectDb(config.mongoUrl, config.mongoDb);
const services = createServices(db);

const app = Fastify({ logger: true, trustProxy: true, bodyLimit: 5 * 1024 * 1024 });

await app.register(cookie, { secret: cookieSecret(config.password) });
await app.register(rateLimit, { global: false });

app.setErrorHandler((error, _req, reply) => {
  if (error instanceof ZodError) return reply.code(400).send({ error: z.prettifyError(error) });
  if (error instanceof AppError) return reply.code(error.statusCode).send({ error: error.message });
  if ((error as { code?: unknown }).code === 11000) return reply.code(409).send({ error: "Already exists" });
  const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
  if (statusCode >= 500) app.log.error(error);
  return reply.code(statusCode).send({ error: statusCode >= 500 ? "Internal error" : (error as Error).message });
});

app.get("/healthz", async () => ({ ok: true }));
await app.register(apiRoutes, { prefix: "/api", services, password: config.password });
await app.register(mcpRoutes, { prefix: "/mcp", services, token: config.mcpToken });

// Serve the built SPA when present (production); in dev Vite serves it.
if (existsSync(config.webDir)) {
  await app.register(fastifyStatic, { root: config.webDir });
  app.setNotFoundHandler((req, reply) =>
    req.method === "GET" && !req.url.startsWith("/api") ? reply.sendFile("index.html") : reply.code(404).send({ error: "Not found" }),
  );
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    await db.client.close();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: "0.0.0.0" });
