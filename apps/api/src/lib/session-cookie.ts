import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config.js";
import { isSecureRequest } from "./secure-cookie.js";

/**
 * Sets the `snapotter-session` cookie that a browser session rides on, the way
 * a password login does. Every route that hands a session token back in a
 * response body sets it too, so the page can lose its stored copy of the token
 * (a full localStorage) and stay signed in (#2053).
 */
export function setSessionCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  token: string,
): void {
  const cookieReply = reply as FastifyReply & {
    setCookie?: (name: string, value: string, opts: Record<string, unknown>) => FastifyReply;
  };
  if (typeof cookieReply.setCookie !== "function") return;
  cookieReply.setCookie("snapotter-session", token, {
    path: `${env.BASE_PATH}/`,
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureRequest(request),
    maxAge: env.SESSION_DURATION_HOURS * 3600,
  });
}
