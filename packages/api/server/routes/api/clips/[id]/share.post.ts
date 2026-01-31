import { defineEventHandler, getRouterParam } from "h3";
import { errors } from "../../../../utils/errors";

// POST /api/clips/:id/share
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw errors.badRequest("Clip ID is required");
  }

  // TODO: Implement generate share link for clip
  throw errors.internal("Not implemented");
});
