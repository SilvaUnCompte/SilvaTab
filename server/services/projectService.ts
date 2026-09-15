import { ObjectId } from "mongodb";
import {
  projectInitials,
  randomHue,
  type Project,
  type ProjectInput,
  type ProjectMoveInput,
  type ProjectUpdateInput,
} from "../../shared/schemas.js";
import type { Db, ProjectDoc } from "../db.js";
import { AppError } from "../errors.js";
import { toObjectId } from "./ids.js";
import { reorderOperations } from "./ordering.js";

const toProject = (doc: ProjectDoc): Project => ({
  id: doc._id.toHexString(),
  name: doc.name,
  initials: doc.initials,
  hue: doc.hue,
  archived: doc.archived ?? false,
  createdAt: doc.createdAt.toISOString(),
});

const DISPLAY_ORDER = { position: 1, createdAt: 1 } as const;

const archivedFilter = (archived: boolean) => ({ archived: archived ? true : { $ne: true } });

export class ProjectService {
  constructor(private readonly db: Db) {}

  async list(archived = false): Promise<Project[]> {
    const docs = await this.db.projects.find(archivedFilter(archived)).sort(DISPLAY_ORDER).toArray();
    return docs.map(toProject);
  }

  async get(id: string): Promise<Project> {
    const doc = await this.db.projects.findOne({ _id: toObjectId(id) });
    if (!doc) throw AppError.notFound("Project", id);
    return toProject(doc);
  }

  async create({ name }: ProjectInput): Promise<Project> {
    const last = await this.db.projects.findOne({}, { sort: { position: -1 }, projection: { position: 1 } });
    const doc: ProjectDoc = {
      _id: new ObjectId(),
      name,
      initials: projectInitials(name),
      hue: randomHue(),
      position: (last?.position ?? -1) + 1,
      createdAt: new Date(),
    };
    await this.db.projects.insertOne(doc);
    return toProject(doc);
  }

  async update(id: string, { name, archived }: ProjectUpdateInput): Promise<Project> {
    const $set: Partial<ProjectDoc> = {};
    if (name !== undefined) Object.assign($set, { name, initials: projectInitials(name) });
    if (archived !== undefined) $set.archived = archived;
    const doc = await this.db.projects.findOneAndUpdate({ _id: toObjectId(id) }, { $set }, { returnDocument: "after" });
    if (!doc) throw AppError.notFound("Project", id);
    return toProject(doc);
  }

  /** Moves an active project to `position` in the sidebar order. */
  async move(id: string, { position }: ProjectMoveInput): Promise<Project> {
    const _id = toObjectId(id);
    await this.get(id);
    const siblings = await this.db.projects
      .find({ ...archivedFilter(false), _id: { $ne: _id } }, { projection: { _id: 1 } })
      .sort(DISPLAY_ORDER)
      .toArray();
    await this.db.projects.bulkWrite(reorderOperations<ProjectDoc>(siblings.map((p) => p._id), _id, position));
    return this.get(id);
  }

  async delete(id: string): Promise<void> {
    const _id = toObjectId(id);
    const { deletedCount } = await this.db.projects.deleteOne({ _id });
    if (!deletedCount) throw AppError.notFound("Project", id);
    await this.db.tasks.deleteMany({ projectId: _id });
    await this.db.tags.deleteMany({ projectId: _id });
  }
}
