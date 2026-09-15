import { MongoClient, type ObjectId } from "mongodb";
import type { TaskStatus } from "../shared/schemas.js";

export interface ProjectDoc {
  _id: ObjectId;
  name: string;
  initials: string;
  hue: number;
  createdAt: Date;
}

export interface TaskDoc {
  _id: ObjectId;
  projectId: ObjectId;
  title: string;
  description: string;
  status: TaskStatus;
  position: number;
  blockedBy: ObjectId[];
  /** Missing on tasks created before tags existed. */
  tags?: ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TagDoc {
  _id: ObjectId;
  projectId: ObjectId;
  label: string;
  /** Lower-cased label, unique per project. */
  key: string;
  hue: number;
  createdAt: Date;
}

export async function connectDb(url: string, dbName: string) {
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db(dbName);
  const projects = db.collection<ProjectDoc>("projects");
  const tasks = db.collection<TaskDoc>("tasks");
  const tags = db.collection<TagDoc>("tags");
  await tasks.createIndex({ projectId: 1, status: 1, position: 1 });
  await tags.createIndex({ projectId: 1, key: 1 }, { unique: true });
  return { client, projects, tasks, tags };
}

export type Db = Awaited<ReturnType<typeof connectDb>>;
