import { defineEventHandler } from "h3";
import { errors } from "../../../utils/errors";

// GET /api/digests
export default defineEventHandler(async () => {
  // TODO: Implement list user's digests
  throw errors.internal("Not implemented");
});
