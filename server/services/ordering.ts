import type { AnyBulkWriteOperation, Filter, ObjectId, UpdateFilter } from "mongodb";

/**
 * Inserts `movedId` among the ordered `siblingIds` at `position` (end by default) and returns the bulk
 * operations storing each index as `position`. `movedFields` are also set on the moved document.
 */
export function reorderOperations<T extends { _id: ObjectId; position?: number }>(
  siblingIds: ObjectId[],
  movedId: ObjectId,
  position: number | undefined,
  movedFields: Partial<T> = {},
): AnyBulkWriteOperation<T>[] {
  const ordered = [...siblingIds];
  ordered.splice(Math.min(position ?? ordered.length, ordered.length), 0, movedId);
  return ordered.map((_id, index) => ({
    updateOne: {
      filter: { _id } as Filter<T>,
      update: { $set: _id.equals(movedId) ? { ...movedFields, position: index } : { position: index } } as UpdateFilter<T>,
    },
  }));
}
