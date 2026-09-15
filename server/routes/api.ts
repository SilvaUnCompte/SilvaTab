import type { FastifyInstance } from "fastify";
import {
  LoginInput,
  ProjectInput,
  TagCreateInput,
  TagUpdateInput,
  TaskCreateInput,
  TaskMoveInput,
  TaskStatus,
  TaskUpdateInput,
} from "../../shared/schemas.js";
import { closeSession, hasValidSession, openSession, safeEqual } from "../auth.js";
import type { Services } from "../services/index.js";

type IdParams = { Params: { id: string } };

export async function apiRoutes(app: FastifyInstance, { services, password }: { services: Services; password: string }) {
  const { projects, tags, tasks } = services;

  // ---------- Session ----------

  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { password: candidate } = LoginInput.parse(req.body);
    if (!safeEqual(candidate, password)) return reply.code(401).send({ error: "Wrong password" });
    openSession(reply);
    return { authenticated: true };
  });

  app.post("/logout", async (_req, reply) => {
    closeSession(reply);
    return { authenticated: false };
  });

  app.get("/session", async (req) => ({ authenticated: hasValidSession(req) }));

  // ---------- Protected routes ----------

  app.register(async (secured) => {
    secured.addHook("onRequest", async (req, reply) => {
      if (!hasValidSession(req)) return reply.code(401).send({ error: "Unauthorized" });
    });

    secured.get("/projects", () => projects.list());
    secured.post("/projects", (req) => projects.create(ProjectInput.parse(req.body)));
    secured.patch<IdParams>("/projects/:id", (req) => projects.rename(req.params.id, ProjectInput.parse(req.body)));
    secured.delete<IdParams>("/projects/:id", async (req, reply) => {
      await projects.delete(req.params.id);
      return reply.code(204).send();
    });

    secured.get<IdParams>("/projects/:id/tags", (req) => tags.list(req.params.id));
    secured.post<IdParams>("/projects/:id/tags", (req) => tags.create(req.params.id, TagCreateInput.parse(req.body)));
    secured.patch<IdParams>("/tags/:id", (req) => tags.update(req.params.id, TagUpdateInput.parse(req.body)));
    secured.delete<IdParams>("/tags/:id", async (req, reply) => {
      await tags.delete(req.params.id);
      return reply.code(204).send();
    });

    secured.get<IdParams & { Querystring: { status?: string } }>("/projects/:id/tasks", (req) =>
      tasks.list(req.params.id, TaskStatus.optional().parse(req.query.status)),
    );
    secured.post<IdParams>("/projects/:id/tasks", (req) =>
      tasks.create(req.params.id, TaskCreateInput.parse(req.body)),
    );
    secured.patch<IdParams>("/tasks/:id", (req) => tasks.update(req.params.id, TaskUpdateInput.parse(req.body)));
    secured.post<IdParams>("/tasks/:id/move", (req) => tasks.move(req.params.id, TaskMoveInput.parse(req.body)));
    secured.delete<IdParams>("/tasks/:id", async (req, reply) => {
      await tasks.delete(req.params.id);
      return reply.code(204).send();
    });
  });
}
