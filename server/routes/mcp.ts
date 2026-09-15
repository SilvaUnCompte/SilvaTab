import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FastifyInstance } from "fastify";
import { requestToken, safeEqual } from "../auth.js";
import { createMcpServer } from "../mcp/mcpServer.js";
import type { Services } from "../services/index.js";

/** Stateless Streamable HTTP endpoint: a fresh MCP server handles each request. */
export async function mcpRoutes(app: FastifyInstance, { services, token }: { services: Services; token: string }) {
  app.addHook("onRequest", async (req, reply) => {
    const candidate = requestToken(req);
    if (!candidate || !safeEqual(candidate, token)) return reply.code(401).send({ error: "Invalid MCP token" });
  });

  app.post("/", async (req, reply) => {
    const server = createMcpServer(services);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.raw.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    reply.hijack();
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });

  const methodNotAllowed = { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null };
  app.get("/", (_req, reply) => reply.code(405).send(methodNotAllowed));
  app.delete("/", (_req, reply) => reply.code(405).send(methodNotAllowed));
}
