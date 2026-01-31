import { defineEventHandler } from "h3";
import { errors } from "../../../utils/errors";

// GET /api/podcasts/subscriptions
export default defineEventHandler(async () => {
  // TODO: Implement list user's subscriptions
  throw errors.internal("Not implemented");
});
