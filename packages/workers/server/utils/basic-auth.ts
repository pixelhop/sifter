import { getHeader, type H3Event } from "h3";

export const createBasicAuth = (opts: {
  username: string;
  password: string;
}) => ({
  check(event: H3Event) {
    const [type, token] = (getHeader(event, "Authorization") ?? "").split(" ");
    if (type === "Basic") {
      const [user, pass] = Buffer.from(token, "base64").toString().split(":");
      event.context.auth = { session: { user } };
      return user === opts.username && pass === opts.password;
    }
    return false;
  },
  authorize() {
    return {
      authorized: false,
      message: "Login Required",
      headers: { "WWW-Authenticate": 'Basic realm="Login Required"' },
    };
  },
});
