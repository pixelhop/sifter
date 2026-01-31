import { defineEventHandler, getRouterParam } from "h3";
import { errors } from "../../../../utils/errors";

// GET /api/digests/:id
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw errors.badRequest("Digest ID is required");
  }

  // TODO: Implement get digest by ID
  throw errors.internal("Not implemented");
});
