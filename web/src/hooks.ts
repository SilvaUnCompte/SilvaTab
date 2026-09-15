import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { TASK_STATUSES, type ProjectUpdateInput, type Task, type TagUpdateInput, type TaskMoveInput, type TaskStatus } from "../../shared/schemas";
import { api } from "./api";

export const keys = {
  session: ["session"] as const,
  projects: ["projects"] as const,
  archivedProjects: ["projects", "archived"] as const,
  tasks: (projectId: string) => ["tasks", projectId] as const,
  tags: (projectId: string) => ["tags", projectId] as const,
};

/** How often the board refreshes, so that changes made through MCP show up. */
const BOARD_REFRESH_MS = 4000;

/** Mutation that refreshes the given queries once settled. */
function useInvalidatingMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, invalidate: QueryKey[]) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => Promise.all(invalidate.map((queryKey) => client.invalidateQueries({ queryKey }))),
  });
}

// ---------- Session ----------

export const useSession = () => useQuery({ queryKey: keys.session, queryFn: api.session });

export const useLogin = () => useInvalidatingMutation(api.login, [keys.session]);

export const useLogout = () => useInvalidatingMutation(() => api.logout(), [keys.session]);

// ---------- Projects ----------

export const useProjects = () => useQuery({ queryKey: keys.projects, queryFn: () => api.listProjects() });

export const useArchivedProjects = () => useQuery({ queryKey: keys.archivedProjects, queryFn: () => api.listProjects(true) });

export const useCreateProject = () => useInvalidatingMutation(api.createProject, [keys.projects]);

/** Invalidating `keys.projects` also refreshes the archived list (same key prefix). */
export const useUpdateProject = () =>
  useInvalidatingMutation(({ id, ...input }: ProjectUpdateInput & { id: string }) => api.updateProject(id, input), [keys.projects]);

export const useDeleteProject = () => useInvalidatingMutation(api.deleteProject, [keys.projects]);

// ---------- Tags ----------

export const useTags = (projectId: string, paused = false) =>
  useQuery({
    queryKey: keys.tags(projectId),
    queryFn: () => api.listTags(projectId),
    refetchInterval: paused ? false : BOARD_REFRESH_MS,
  });

export const useCreateTag = (projectId: string) =>
  useInvalidatingMutation((label: string) => api.createTag(projectId, { label }), [keys.tags(projectId)]);

export const useUpdateTag = (projectId: string) =>
  useInvalidatingMutation(({ id, ...input }: TagUpdateInput & { id: string }) => api.updateTag(id, input), [keys.tags(projectId)]);

export const useDeleteTag = (projectId: string) =>
  useInvalidatingMutation(api.deleteTag, [keys.tags(projectId), keys.tasks(projectId)]);

// ---------- Tasks ----------

export const useTasks = (projectId: string, paused = false) =>
  useQuery({
    queryKey: keys.tasks(projectId),
    queryFn: () => api.listTasks(projectId),
    refetchInterval: paused ? false : BOARD_REFRESH_MS,
  });

export type TaskDraft = { title: string; description: string; blockedBy: string[]; tags: string[]; status: TaskStatus };

export const useSaveTask = (projectId: string) =>
  useInvalidatingMutation(
    ({ id, ...input }: TaskDraft & { id?: string }) =>
      id ? saveExistingTask(id, input) : api.createTask(projectId, input),
    [keys.tasks(projectId)],
  );

/** Updates the fields, then moves the task only if its column changed. */
async function saveExistingTask(id: string, { status, ...fields }: TaskDraft) {
  const task = await api.updateTask(id, fields);
  return task.status === status ? task : api.moveTask(id, { status });
}

export const useDeleteTask = (projectId: string) => useInvalidatingMutation(api.deleteTask, [keys.tasks(projectId)]);

/** Moves a task with an optimistic update so the card does not jump back while the request runs. */
export function useMoveTask(projectId: string) {
  const client = useQueryClient();
  const queryKey = keys.tasks(projectId);
  return useMutation({
    mutationFn: ({ id, ...input }: TaskMoveInput & { id: string }) => api.moveTask(id, input),
    onMutate: async ({ id, status, position }) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<Task[]>(queryKey);
      if (previous) client.setQueryData(queryKey, applyMove(previous, id, status, position ?? Infinity));
      return { previous };
    },
    onError: (_error, _args, context) => client.setQueryData(queryKey, context?.previous),
    onSettled: () => client.invalidateQueries({ queryKey }),
  });
}

// ---------- Pure helpers ----------

export function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const columns = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as Task[]])) as Record<TaskStatus, Task[]>;
  for (const task of tasks) columns[task.status].push(task);
  for (const column of Object.values(columns)) column.sort((a, b) => a.position - b.position);
  return columns;
}

export type TaskFilter = { query: string; tagId: string };

export function matchesFilter(task: Task, { query, tagId }: TaskFilter): boolean {
  const needle = query.trim().toLowerCase();
  if (tagId && !task.tags.includes(tagId)) return false;
  return !needle || `${task.title}\n${task.description}`.toLowerCase().includes(needle);
}

/** Converts a drop index in a filtered column (`visible`) into a position in the full `column`. */
export function positionInColumn(column: Task[], visible: Task[], movedId: string, index: number): number {
  const others = column.filter((t) => t.id !== movedId);
  const visibleOthers = visible.filter((t) => t.id !== movedId);
  if (index < visibleOthers.length) return others.indexOf(visibleOthers[index]);
  const last = visibleOthers.at(-1);
  return last ? others.indexOf(last) + 1 : others.length;
}

function applyMove(tasks: Task[], id: string, status: TaskStatus, position: number): Task[] {
  const moving = tasks.find((t) => t.id === id);
  if (!moving) return tasks;
  const target = groupByStatus(tasks.filter((t) => t.id !== id))[status];
  target.splice(Math.min(position, target.length), 0, { ...moving, status });
  const reordered = new Map(target.map((t, index) => [t.id, { ...t, position: index }]));
  return tasks.map((t) => reordered.get(t.id) ?? t);
}

/** State mirrored in the URL hash, so a refresh keeps the selected project. */
export function useHashState(): [string | null, (value: string | null) => void] {
  const read = () => decodeURIComponent(window.location.hash.slice(1)) || null;
  const [value, setValue] = useState(read);
  useEffect(() => {
    const onChange = () => setValue(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const update = useCallback((next: string | null) => {
    history.replaceState(null, "", next ? `#${encodeURIComponent(next)}` : window.location.pathname);
    setValue(next);
  }, []);
  return [value, update];
}
