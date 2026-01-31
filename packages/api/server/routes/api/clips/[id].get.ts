import { defineEventHandler, getRouterParam } from "h3";
import { errors } from "../../../utils/errors";

// GET /api/clips/:id
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw errors.badRequest("Clip ID is required");
  }

  // TODO: Implement get clip by ID
  throw errors.internal("Not implemented");
});
