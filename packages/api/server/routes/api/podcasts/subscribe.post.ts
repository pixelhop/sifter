import { defineEventHandler } from "h3";
import { errors } from "../../../utils/errors";

// POST /api/podcasts/subscribe
export default defineEventHandler(async () => {
  // TODO: Implement podcast subscription
  throw errors.internal("Not implemented");
});
