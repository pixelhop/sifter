import { defineEventHandler, H3Error } from "h3";
import { ZodError } from "zod";

export default defineEventHandler(async (event) => {
  // This middleware runs for all requests but only handles errors
  // The actual error handling is done via onError in nitro.config.ts
});

/**
 * Format an error for API response
 */
export function formatError(error: unknown): {
  statusCode: number;
  body: {
    error: {
      message: string;
      code: string;
      details?: unknown;
    };
  };
} {
  // H3 errors (including our ApiErrors)
  if (error instanceof H3Error) {
    return {
      statusCode: error.statusCode,
      body: {
        error: {
          message: error.statusMessage || "An error occurred",
          code: (error.data as { code?: string })?.code || "ERROR",
          details: error.data,
        },
      },
    };
  }

  // Zod validation errors
  if (error instanceof ZodError) {
    return {
      statusCode: 422,
      body: {
        error: {
          message: "Validation failed",
          code: "VALIDATION_ERROR",
          details: error.errors,
        },
      },
    };
  }

  // Generic errors
  if (error instanceof Error) {
    return {
      statusCode: 500,
      body: {
        error: {
          message:
            process.env.NODE_ENV === "production"
              ? "Internal server error"
              : error.message,
          code: "INTERNAL_ERROR",
        },
      },
    };
  }

  // Unknown errors
  return {
    statusCode: 500,
    body: {
      error: {
        message: "An unexpected error occurred",
        code: "UNKNOWN_ERROR",
      },
    },
  };
}
