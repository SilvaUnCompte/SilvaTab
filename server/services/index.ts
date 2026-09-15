import type { Db } from "../db.js";
import { ProjectService } from "./projectService.js";
import { TagService } from "./tagService.js";
import { TaskService } from "./taskService.js";

export function createServices(db: Db) {
  const projects = new ProjectService(db);
  const tags = new TagService(db, projects);
  const tasks = new TaskService(db, projects, tags);
  return { projects, tags, tasks };
}

export type Services = ReturnType<typeof createServices>;
