import { ObjectId } from "mongodb";
import { projectInitials, randomHue, type Project, type ProjectInput } from "../../shared/schemas.js";
import type { Db, ProjectDoc } from "../db.js";
import { AppError } from "../errors.js";
import { toObjectId } from "./ids.js";

const toProject = (doc: ProjectDoc): Project => ({
  id: doc._id.toHexString(),
  name: doc.name,
  initials: doc.initials,
  hue: doc.hue,
  createdAt: doc.createdAt.toISOString(),
});

export class ProjectService {
  constructor(private readonly db: Db) {}

  async list(): Promise<Project[]> {
    const docs = await this.db.projects.find().sort({ createdAt: 1 }).toArray();
    return docs.map(toProject);
  }

  async get(id: string): Promise<Project> {
    const doc = await this.db.projects.findOne({ _id: toObjectId(id) });
    if (!doc) throw AppError.notFound("Project", id);
    return toProject(doc);
  }

  async create({ name }: ProjectInput): Promise<Project> {
    const doc: ProjectDoc = {
      _id: new ObjectId(),
      name,
      initials: projectInitials(name),
      hue: randomHue(),
      createdAt: new Date(),
    };
    await this.db.projects.insertOne(doc);
    return toProject(doc);
  }

  async rename(id: string, { name }: ProjectInput): Promise<Project> {
    const doc = await this.db.projects.findOneAndUpdate(
      { _id: toObjectId(id) },
      { $set: { name, initials: projectInitials(name) } },
      { returnDocument: "after" },
    );
    if (!doc) throw AppError.notFound("Project", id);
    return toProject(doc);
  }

  async delete(id: string): Promise<void> {
    const _id = toObjectId(id);
    const { deletedCount } = await this.db.projects.deleteOne({ _id });
    if (!deletedCount) throw AppError.notFound("Project", id);
    await this.db.tasks.deleteMany({ projectId: _id });
    await this.db.tags.deleteMany({ projectId: _id });
  }
}
