import { ObjectId } from "mongodb";
import { ObjectIdString } from "../../shared/schemas.js";
import { AppError } from "../errors.js";

export function toObjectId(id: string): ObjectId {
  if (!ObjectIdString.safeParse(id).success) throw AppError.badRequest(`Invalid id "${id}"`);
  return new ObjectId(id);
}
