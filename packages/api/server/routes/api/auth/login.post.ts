import { defineEventHandler } from "h3";
import { errors } from "../../../utils/errors";

// POST /api/auth/login
export default defineEventHandler(async () => {
  // TODO: Implement user login
  throw errors.internal("Not implemented");
});
