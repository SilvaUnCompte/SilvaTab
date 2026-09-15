import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  ObjectIdString,
  ProjectInput,
  TagLabel,
  tagKey,
  TaskCreateInput,
  TaskMoveInput,
  TaskStatus,
  TaskUpdateInput,
  unresolvedBlockers,
  type Task,
} from "../../shared/schemas.js";
import type { Services } from "../services/index.js";

const INSTRUCTIONS = `Silva's Tab is a kanban board. Each project has three columns: "todo", "doing" (On doing) and "done".
- Call list_projects first to get project ids.
- A task has a title, a Markdown description (use it for specs), tags and "blockedBy": tasks that must be done first.
- Tags are given by label; unknown labels are created automatically. Call list_tags to reuse existing ones.
- When you start working on a task move it to "doing", and to "done" once finished.
- Prefer create_tasks with blockedByIndexes to create a whole plan with its dependencies in one call.`;

const READ_ONLY: ToolAnnotations = { readOnlyHint: true };
const projectId = ObjectIdString.describe("Project id (see list_projects)");
const taskId = ObjectIdString.describe("Task id");
const tagLabels = z.array(TagLabel).describe("Tag labels (case-insensitive); missing tags are created");

/** Everything needed to describe the tasks of a project to the model. */
interface ProjectContext {
  byId: Map<string, Task>;
  tagLabels: Map<string, string>;
}

/** Task shape returned to the model: blockers and tags are resolved so no extra lookup is needed. */
function describeTask(task: Task, { byId, tagLabels }: ProjectContext, withDescription = true) {
  const { projectId: _p, position: _pos, blockedBy, description, tags, ...rest } = task;
  return {
    ...rest,
    ...(withDescription && { description }),
    tags: tags.map((id) => tagLabels.get(id) ?? id),
    blockedBy: blockedBy.map((id) => {
      const blocker = byId.get(id);
      return { id, title: blocker?.title, status: blocker?.status };
    }),
    isBlocked: unresolvedBlockers(task, byId).length > 0,
  };
}

export function createMcpServer({ projects, tags, tasks }: Services): McpServer {
  const server = new McpServer({ name: "silvas-tab", version: "1.1.0" }, { instructions: INSTRUCTIONS });

  /** Registers a tool whose result is serialized as JSON and whose errors are reported to the model. */
  function tool<Shape extends z.ZodRawShape>(
    name: string,
    description: string,
    inputSchema: Shape,
    handler: (args: z.infer<z.ZodObject<Shape>>) => Promise<unknown>,
    annotations?: ToolAnnotations,
  ) {
    const callback = async (args: z.infer<z.ZodObject<Shape>>) => {
      try {
        const result = (await handler(args)) ?? { ok: true };
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text" as const, text: (error as Error).message }] };
      }
    };
    server.registerTool(name, { description, inputSchema, annotations }, callback as never);
  }

  async function loadContext(pid: string): Promise<ProjectContext & { all: Task[] }> {
    const [all, projectTags] = await Promise.all([tasks.list(pid), tags.list(pid)]);
    return {
      all,
      byId: new Map(all.map((t) => [t.id, t])),
      tagLabels: new Map(projectTags.map((t) => [t.id, t.label])),
    };
  }

  async function describeTaskById(pid: string, id: string) {
    const context = await loadContext(pid);
    return describeTask(context.byId.get(id)!, context);
  }

  /** Creates the missing tags among `labels`, then returns a label-to-id converter. */
  async function tagResolver(pid: string, labels: string[]) {
    const idsByKey = await tags.resolveLabels(pid, labels);
    return (list: string[] = []) => list.map((label) => idsByKey.get(tagKey(label))!);
  }

  tool("list_projects", "List all active (non-archived) projects.", {}, () => projects.list(), READ_ONLY);

  tool("create_project", "Create a new project.", ProjectInput.shape, (input) => projects.create(input));

  tool("list_tags", "List the tags of a project.", { projectId }, ({ projectId }) => tags.list(projectId), READ_ONLY);

  tool(
    "list_tasks",
    "List the tasks of a project grouped by column (todo, doing, done), ordered as displayed on the board.",
    {
      projectId,
      status: TaskStatus.optional().describe("Only return this column"),
      tag: TagLabel.optional().describe("Only return tasks with this tag label"),
      includeDescription: z.boolean().default(false).describe("Include full descriptions (can be long)"),
    },
    async ({ projectId, status, tag, includeDescription }) => {
      const context = await loadContext(projectId);
      const columns = Object.fromEntries(TaskStatus.options.map((s) => [s, [] as unknown[]]));
      for (const task of context.all) {
        if (status && task.status !== status) continue;
        const described = describeTask(task, context, includeDescription);
        if (tag && !described.tags.some((label) => tagKey(label) === tagKey(tag))) continue;
        columns[task.status].push(described);
      }
      return status ? { [status]: columns[status] } : columns;
    },
    READ_ONLY,
  );

  tool(
    "get_task",
    "Get a task with its full description, tags and blockers.",
    { taskId },
    async ({ taskId }) => {
      const task = await tasks.get(taskId);
      return { ...(await describeTaskById(task.projectId, task.id)), projectId: task.projectId };
    },
    READ_ONLY,
  );

  tool(
    "create_tasks",
    "Create one or several tasks in a project. Use blockedByIndexes to make a task depend on earlier tasks of the same call.",
    {
      projectId,
      tasks: z
        .array(
          TaskCreateInput.extend({
            tags: tagLabels.optional(),
            blockedByIndexes: z
              .array(z.number().int().min(0))
              .optional()
              .describe("0-based indexes of EARLIER items of this list that block this task"),
          }),
        )
        .min(1)
        .max(100),
    },
    async ({ projectId, tasks: inputs }) => {
      const toTagIds = await tagResolver(projectId, inputs.flatMap((input) => input.tags ?? []));
      const created = await tasks.createMany(
        projectId,
        inputs.map((input) => ({ ...input, tags: toTagIds(input.tags) })),
      );
      const context = await loadContext(projectId);
      return created.map((t) => describeTask(context.byId.get(t.id)!, context));
    },
  );

  tool(
    "update_task",
    "Update the title, description (specs), tags and/or blockers of a task. Omitted fields are left unchanged.",
    { taskId, ...TaskUpdateInput.shape, tags: tagLabels.optional().describe("Replaces the whole tag list") },
    async ({ taskId, tags: labels, ...input }) => {
      const { projectId } = await tasks.get(taskId);
      const toTagIds = await tagResolver(projectId, labels ?? []);
      const task = await tasks.update(taskId, { ...input, tags: labels && toTagIds(labels) });
      return describeTaskById(projectId, task.id);
    },
  );

  tool(
    "move_task",
    "Move a task to another column and/or position.",
    { taskId, ...TaskMoveInput.shape },
    async ({ taskId, ...input }) => {
      const task = await tasks.move(taskId, input);
      const described = await describeTaskById(task.projectId, task.id);
      return { ...described, position: task.position, warning: described.isBlocked ? "Task still has unfinished blockers" : undefined };
    },
  );

  tool("delete_task", "Delete a task permanently.", { taskId }, ({ taskId }) => tasks.delete(taskId), {
    destructiveHint: true,
  });

  return server;
}
