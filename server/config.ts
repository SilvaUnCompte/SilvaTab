import { fileURLToPath } from "node:url";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  mongoUrl: process.env.MONGO_URL ?? "mongodb://localhost:27017",
  mongoDb: process.env.MONGO_DB ?? "silvas-tab",
  /** Instance password used by the web UI. */
  password: required("SILVA_PASSWORD"),
  /** Bearer token used by MCP clients. Kept separate so it can be rotated without touching the UI password. */
  mcpToken: required("MCP_TOKEN"),
  webDir: fileURLToPath(new URL("../web", import.meta.url)),
};
