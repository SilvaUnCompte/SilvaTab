import { ObjectId } from "mongodb";
import { TAG_HUES, tagKey, type Tag, type TagCreateInput, type TagUpdateInput } from "../../shared/schemas.js";
import type { Db, TagDoc } from "../db.js";
import { AppError } from "../errors.js";
import { toObjectId } from "./ids.js";
import type { ProjectService } from "./projectService.js";

const toTag = (doc: TagDoc): Tag => ({
  id: doc._id.toHexString(),
  projectId: doc.projectId.toHexString(),
  label: doc.label,
  hue: doc.hue,
});

const randomTagHue = () => TAG_HUES[Math.floor(Math.random() * TAG_HUES.length)];

export class TagService {
  constructor(
    private readonly db: Db,
    private readonly projects: ProjectService,
  ) {}

  async list(projectId: string): Promise<Tag[]> {
    const docs = await this.db.tags.find({ projectId: toObjectId(projectId) }).sort({ key: 1 }).toArray();
    return docs.map(toTag);
  }

  async create(projectId: string, { label, hue }: TagCreateInput): Promise<Tag> {
    await this.projects.get(projectId);
    const projectOid = toObjectId(projectId);
    await this.assertLabelFree(projectOid, label);
    const doc: TagDoc = {
      _id: new ObjectId(),
      projectId: projectOid,
      label,
      key: tagKey(label),
      hue: hue ?? randomTagHue(),
      createdAt: new Date(),
    };
    await this.db.tags.insertOne(doc);
    return toTag(doc);
  }

  async update(id: string, { label, hue }: TagUpdateInput): Promise<Tag> {
    const current = await this.findDoc(id);
    const $set: Partial<TagDoc> = {};
    if (label !== undefined) {
      await this.assertLabelFree(current.projectId, label, current._id);
      Object.assign($set, { label, key: tagKey(label) });
    }
    if (hue !== undefined) $set.hue = hue;
    const doc = await this.db.tags.findOneAndUpdate({ _id: current._id }, { $set }, { returnDocument: "after" });
    return toTag(doc!);
  }

  async delete(id: string): Promise<void> {
    const tag = await this.findDoc(id);
    await this.db.tags.deleteOne({ _id: tag._id });
    await this.db.tasks.updateMany({ projectId: tag.projectId }, { $pull: { tags: tag._id } });
  }

  /** Returns the tag ids matching `labels`, creating the missing tags. */
  async resolveLabels(projectId: string, labels: string[]): Promise<Map<string, string>> {
    const idsByKey = new Map((await this.list(projectId)).map((t) => [tagKey(t.label), t.id]));
    for (const label of labels) {
      const key = tagKey(label);
      if (!idsByKey.has(key)) idsByKey.set(key, (await this.create(projectId, { label })).id);
    }
    return idsByKey;
  }

  async assertInProject(projectId: ObjectId, tagIds: string[]): Promise<void> {
    const unique = [...new Set(tagIds)];
    if (!unique.length) return;
    const count = await this.db.tags.countDocuments({ projectId, _id: { $in: unique.map(toObjectId) } });
    if (count !== unique.length) throw AppError.badRequest("Some tags do not belong to this project");
  }

  private async findDoc(id: string): Promise<TagDoc> {
    const doc = await this.db.tags.findOne({ _id: toObjectId(id) });
    if (!doc) throw AppError.notFound("Tag", id);
    return doc;
  }

  private async assertLabelFree(projectId: ObjectId, label: string, exceptId?: ObjectId): Promise<void> {
    const existing = await this.db.tags.findOne({ projectId, key: tagKey(label) });
    if (existing && !existing._id.equals(exceptId)) throw new AppError(409, `Tag "${label}" already exists`);
  }
}
