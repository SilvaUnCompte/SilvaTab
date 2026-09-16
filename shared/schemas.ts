import { z } from "zod";

/**
 * Single source of truth for validation, shared by the REST API, the MCP server and the web client.
 */

export const TASK_STATUSES = ["todo", "doing", "done"] as const;
export const TaskStatus = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "TODO",
  doing: "On doing",
  done: "Done",
};

export const ObjectIdString = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

const idList = z.array(ObjectIdString);

const Position = z.number().int().min(0);

// ---------- Colors ----------

/** Pastel hues offered by the color pickers (tags and projects), one every 15°. */
export const PALETTE_HUES = Array.from({ length: 24 }, (_, i) => i * 15);

const Hue = z.number().int().min(0).max(359).describe("Color hue (0-359)");

// ---------- Projects ----------

export const ProjectInput = z.object({
  name: z.string().trim().min(1).max(80).describe("Project name"),
  hue: Hue.optional(),
});
export type ProjectInput = z.infer<typeof ProjectInput>;

export const ProjectUpdateInput = ProjectInput.partial().extend({
  archived: z.boolean().optional().describe("Archived projects are hidden from the sidebar and from MCP"),
});
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateInput>;

export const ProjectMoveInput = z.object({ position: Position.describe("0-based index in the project list") });
export type ProjectMoveInput = z.infer<typeof ProjectMoveInput>;

export interface Project {
  id: string;
  name: string;
  initials: string;
  hue: number;
  archived: boolean;
  createdAt: string;
}

// ---------- Tags ----------

export const TagLabel = z.string().trim().min(1).max(40).describe("Tag label");

export const TagCreateInput = z.object({ label: TagLabel, hue: Hue.optional() });
export type TagCreateInput = z.infer<typeof TagCreateInput>;

export const TagUpdateInput = z.object({ label: TagLabel.optional(), hue: Hue.optional() });
export type TagUpdateInput = z.infer<typeof TagUpdateInput>;

export interface Tag {
  id: string;
  projectId: string;
  label: string;
  hue: number;
}

/** Case-insensitive identity of a tag label, used for uniqueness and search. */
export const tagKey = (label: string) => label.trim().toLowerCase();

// ---------- Tasks ----------

const taskFields = {
  title: z.string().trim().min(1).max(200).describe("Short task title"),
  description: z.string().max(50_000).describe("Task details / specs, Markdown supported"),
  blockedBy: idList.describe("Ids of tasks (same project) that must be done before this one"),
  tags: idList.describe("Ids of tags of the same project"),
};

export const TaskCreateInput = z.object({
  title: taskFields.title,
  description: taskFields.description.default(""),
  status: TaskStatus.default("todo").describe("Initial column"),
  blockedBy: taskFields.blockedBy.default([]),
  tags: taskFields.tags.default([]),
});
export type TaskCreateInput = z.input<typeof TaskCreateInput>;

export const TaskUpdateInput = z.object({
  title: taskFields.title.optional(),
  description: taskFields.description.optional(),
  blockedBy: taskFields.blockedBy.optional().describe("Replaces the whole blocker list"),
  tags: taskFields.tags.optional().describe("Replaces the whole tag list"),
});
export type TaskUpdateInput = z.infer<typeof TaskUpdateInput>;

export const TaskMoveInput = z.object({
  status: TaskStatus.describe("Target column"),
  position: Position.optional().describe("0-based index in the target column, defaults to the end"),
});
export type TaskMoveInput = z.infer<typeof TaskMoveInput>;

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  position: number;
  blockedBy: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export const LoginInput = z.object({ password: z.string().min(1) });

// ---------- Helpers ----------

export const randomHue = () => PALETTE_HUES[Math.floor(Math.random() * PALETTE_HUES.length)];


/**
 * Two-letter project badge, by priority: first letters of the first two words ("Cold Planner" → CP),
 * the first two capitals ("SilvaTab" → ST), or the first two letters ("resume" → RE).
 */
export function projectInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const capitals = name.match(/\p{Lu}/gu) ?? [];
  const raw =
    words.length > 1 ? words[0][0] + words[1][0] : capitals.length > 1 ? capitals[0] + capitals[1] : (words[0] ?? "").slice(0, 2);
  return raw.toUpperCase();
}


/** True when `target` can be reached from `start` ids by following blocker edges. */
export function reachesTask(start: string[], target: string, blockersOf: (id: string) => string[] | undefined): boolean {
  const stack = [...start];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === target) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(blockersOf(current) ?? []));
  }
  return false;
}

/** Blockers of `task` that are not done yet (unknown ids are ignored). */
export function unresolvedBlockers(task: Pick<Task, "blockedBy">, tasksById: Map<string, Task>): Task[] {
  return task.blockedBy
    .map((id) => tasksById.get(id))
    .filter((t): t is Task => t !== undefined && t.status !== "done");
}
