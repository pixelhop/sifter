import { defineEventHandler } from "h3";
import { errors } from "../../../utils/errors";

// POST /api/auth/register
export default defineEventHandler(async () => {
  // TODO: Implement user registration
  throw errors.internal("Not implemented");
});
