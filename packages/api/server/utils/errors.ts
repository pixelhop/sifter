import { H3Error, createError } from "h3";

export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number = 500, code: string = "INTERNAL_ERROR") {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function createApiError(
  message: string,
  statusCode: number = 500,
  code: string = "INTERNAL_ERROR"
): H3Error {
  return createError({
    statusCode,
    statusMessage: message,
    data: { code },
  });
}

// Common error factories
export const errors = {
  notFound: (resource: string = "Resource") =>
    createApiError(`${resource} not found`, 404, "NOT_FOUND"),

  unauthorized: (message: string = "Unauthorized") =>
    createApiError(message, 401, "UNAUTHORIZED"),

  forbidden: (message: string = "Forbidden") =>
    createApiError(message, 403, "FORBIDDEN"),

  badRequest: (message: string = "Bad request") =>
    createApiError(message, 400, "BAD_REQUEST"),

  validation: (message: string = "Validation failed") =>
    createApiError(message, 422, "VALIDATION_ERROR"),

  internal: (message: string = "Internal server error") =>
    createApiError(message, 500, "INTERNAL_ERROR"),
};
