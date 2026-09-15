import { ObjectId } from "mongodb";
import {
  reachesTask,
  TaskCreateInput,
  type Task,
  type TaskMoveInput,
  type TaskStatus,
  type TaskUpdateInput,
} from "../../shared/schemas.js";
import type { Db, TaskDoc } from "../db.js";
import { AppError } from "../errors.js";
import { toObjectId } from "./ids.js";
import { reorderOperations } from "./ordering.js";
import type { ProjectService } from "./projectService.js";
import type { TagService } from "./tagService.js";

const toTask = (doc: TaskDoc): Task => ({
  id: doc._id.toHexString(),
  projectId: doc.projectId.toHexString(),
  title: doc.title,
  description: doc.description,
  status: doc.status,
  position: doc.position,
  blockedBy: doc.blockedBy.map((id) => id.toHexString()),
  tags: (doc.tags ?? []).map((id) => id.toHexString()),
  createdAt: doc.createdAt.toISOString(),
  updatedAt: doc.updatedAt.toISOString(),
});

const uniqueObjectIds = (ids: string[]) => [...new Set(ids)].map(toObjectId);

/** A task to create in a batch; `blockedByIndexes` references earlier items of the same batch. */
export type BatchTaskInput = TaskCreateInput & { blockedByIndexes?: number[] };

export class TaskService {
  constructor(
    private readonly db: Db,
    private readonly projects: ProjectService,
    private readonly tags: TagService,
  ) {}

  async list(projectId: string, status?: TaskStatus): Promise<Task[]> {
    const filter = { projectId: toObjectId(projectId), ...(status && { status }) };
    const docs = await this.db.tasks.find(filter).sort({ status: 1, position: 1 }).toArray();
    return docs.map(toTask);
  }

  async get(id: string): Promise<Task> {
    return toTask(await this.findDoc(id));
  }

  async create(projectId: string, input: TaskCreateInput): Promise<Task> {
    const [task] = await this.createMany(projectId, [input]);
    return task;
  }

  /**
   * Creates several tasks at once. Items can only be blocked by existing tasks or by earlier
   * items of the batch, which makes dependency cycles impossible at creation time.
   */
  async createMany(projectId: string, inputs: BatchTaskInput[]): Promise<Task[]> {
    await this.projects.get(projectId);
    const projectOid = toObjectId(projectId);
    const { existingIds, positions } = await this.columnsState(projectOid);
    const now = new Date();

    const ids = inputs.map(() => new ObjectId());
    const parsed = inputs.map((raw) => TaskCreateInput.parse(raw));
    await this.tags.assertInProject(projectOid, parsed.flatMap((input) => input.tags));

    const docs = inputs.map((raw, index): TaskDoc => {
      const input = parsed[index];
      for (const blockerId of input.blockedBy) {
        if (!existingIds.has(blockerId)) throw AppError.badRequest(`Blocker ${blockerId} is not a task of this project`);
      }
      const batchBlockers = (raw.blockedByIndexes ?? []).map((i) => {
        if (!Number.isInteger(i) || i < 0 || i >= index) {
          throw AppError.badRequest(`Task #${index}: blockedByIndexes may only reference earlier items (got ${i})`);
        }
        return ids[i];
      });
      return {
        _id: ids[index],
        projectId: projectOid,
        title: input.title,
        description: input.description,
        status: input.status,
        position: positions[input.status]++,
        blockedBy: [...uniqueObjectIds(input.blockedBy), ...batchBlockers],
        tags: uniqueObjectIds(input.tags),
        createdAt: now,
        updatedAt: now,
      };
    });

    if (docs.length) await this.db.tasks.insertMany(docs);
    return docs.map(toTask);
  }

  async update(id: string, input: TaskUpdateInput): Promise<Task> {
    const current = await this.findDoc(id);
    const $set: Partial<TaskDoc> = { updatedAt: new Date() };
    if (input.title !== undefined) $set.title = input.title;
    if (input.description !== undefined) $set.description = input.description;
    if (input.blockedBy !== undefined) {
      const blockerIds = [...new Set(input.blockedBy)];
      await this.assertValidBlockers(current, blockerIds);
      $set.blockedBy = blockerIds.map(toObjectId);
    }
    if (input.tags !== undefined) {
      await this.tags.assertInProject(current.projectId, input.tags);
      $set.tags = uniqueObjectIds(input.tags);
    }
    const doc = await this.db.tasks.findOneAndUpdate({ _id: current._id }, { $set }, { returnDocument: "after" });
    return toTask(doc!);
  }

  async move(id: string, { status, position }: TaskMoveInput): Promise<Task> {
    const task = await this.findDoc(id);
    const column = await this.db.tasks
      .find({ projectId: task.projectId, status, _id: { $ne: task._id } }, { projection: { _id: 1 } })
      .sort({ position: 1 })
      .toArray();
    await this.db.tasks.bulkWrite(
      reorderOperations<TaskDoc>(column.map((t) => t._id), task._id, position, { status, updatedAt: new Date() }),
    );
    return this.get(id);
  }

  async delete(id: string): Promise<void> {
    const task = await this.findDoc(id);
    await this.db.tasks.deleteOne({ _id: task._id });
    await this.db.tasks.updateMany({ projectId: task.projectId }, { $pull: { blockedBy: task._id } });
  }

  private async findDoc(id: string): Promise<TaskDoc> {
    const doc = await this.db.tasks.findOne({ _id: toObjectId(id) });
    if (!doc) throw AppError.notFound("Task", id);
    return doc;
  }

  /** Ids of the project's tasks and the next free position of each column. */
  private async columnsState(projectId: ObjectId) {
    const docs = await this.db.tasks.find({ projectId }, { projection: { _id: 1, status: 1, position: 1 } }).toArray();
    const positions: Record<TaskStatus, number> = { todo: 0, doing: 0, done: 0 };
    for (const { status, position } of docs) positions[status] = Math.max(positions[status], position + 1);
    return { existingIds: new Set(docs.map((d) => d._id.toHexString())), positions };
  }

  /** Blockers must belong to the same project and must not create a dependency cycle. */
  private async assertValidBlockers(task: TaskDoc, blockerIds: string[]): Promise<void> {
    const selfId = task._id.toHexString();
    const docs = await this.db.tasks.find({ projectId: task.projectId }, { projection: { _id: 1, blockedBy: 1 } }).toArray();
    const graph = new Map(docs.map((d) => [d._id.toHexString(), d.blockedBy.map((b) => b.toHexString())]));

    for (const blockerId of blockerIds) {
      if (blockerId === selfId) throw AppError.badRequest("A task cannot block itself");
      if (!graph.has(blockerId)) throw AppError.badRequest(`Blocker ${blockerId} is not a task of this project`);
    }

    // A cycle appears if the task is reachable from one of its future blockers.
    if (reachesTask(blockerIds, selfId, (id) => graph.get(id))) {
      throw AppError.badRequest("These blockers would create a dependency cycle");
    }
  }
}
