import { defineEventHandler, getQuery } from "h3";
import { errors } from "../../../utils/errors";

// GET /api/podcasts/search?q=query
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const searchTerm = query.q as string;

  if (!searchTerm) {
    throw errors.badRequest("Search query is required");
  }

  // TODO: Implement iTunes search integration
  throw errors.internal("Not implemented");
});
