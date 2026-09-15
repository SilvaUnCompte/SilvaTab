import type {
  Project,
  ProjectInput,
  ProjectUpdateInput,
  Tag,
  TagCreateInput,
  TagUpdateInput,
  Task,
  TaskCreateInput,
  TaskMoveInput,
  TaskUpdateInput,
} from "../../shared/schemas";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error ?? response.statusText);
  return data as T;
}

type Session = { authenticated: boolean };

export const api = {
  session: () => request<Session>("GET", "/session"),
  login: (password: string) => request<Session>("POST", "/login", { password }),
  logout: () => request<Session>("POST", "/logout"),

  listProjects: (archived = false) => request<Project[]>("GET", `/projects${archived ? "?archived=true" : ""}`),
  createProject: (input: ProjectInput) => request<Project>("POST", "/projects", input),
  updateProject: (id: string, input: ProjectUpdateInput) => request<Project>("PATCH", `/projects/${id}`, input),
  deleteProject: (id: string) => request<void>("DELETE", `/projects/${id}`),

  listTags: (projectId: string) => request<Tag[]>("GET", `/projects/${projectId}/tags`),
  createTag: (projectId: string, input: TagCreateInput) => request<Tag>("POST", `/projects/${projectId}/tags`, input),
  updateTag: (id: string, input: TagUpdateInput) => request<Tag>("PATCH", `/tags/${id}`, input),
  deleteTag: (id: string) => request<void>("DELETE", `/tags/${id}`),

  listTasks: (projectId: string) => request<Task[]>("GET", `/projects/${projectId}/tasks`),
  createTask: (projectId: string, input: TaskCreateInput) => request<Task>("POST", `/projects/${projectId}/tasks`, input),
  updateTask: (id: string, input: TaskUpdateInput) => request<Task>("PATCH", `/tasks/${id}`, input),
  moveTask: (id: string, input: TaskMoveInput) => request<Task>("POST", `/tasks/${id}/move`, input),
  deleteTask: (id: string) => request<void>("DELETE", `/tasks/${id}`),
};
