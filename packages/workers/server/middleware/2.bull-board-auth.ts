import { createError, defineEventHandler, getRequestURL, setHeader } from "h3";
import { createBasicAuth } from "../utils/basic-auth";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  // will only execute for /admin/queues route
  if (getRequestURL(event).pathname.startsWith("/admin/queues")) {
    const basicAuth = createBasicAuth({
      username: config.bullBoardUsername,
      password: config.bullBoardPassword,
    });

    const isAuthenticated = basicAuth.check(event);
    if (isAuthenticated) {
      return;
    }

    const authRes = basicAuth.authorize();

    // send headers
    if (authRes.headers) {
      for (const header in authRes.headers) {
        setHeader(event, header, authRes.headers[header]);
      }
    }

    // check to render unauthenticated page
    if (!authRes.authorized) {
      throw createError({
        statusCode: 401,
        message: authRes.message || "Unauthorized",
      });
    }
  }
});
