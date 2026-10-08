import { clearToken, formatHeaders } from "./api";
import { appUrl } from "./app-url";
import { logoutDestination } from "./logout-destination";

/**
 * Ends the session on the server, and only then forgets it locally. The
 * httpOnly session cookie can't be cleared from here, so a request that never
 * reached the server (or got a non-OK answer) leaves the session valid: the
 * caller must keep the user where they are and say so, not redirect (#1558).
 *
 * Resolves to where the browser should go next, or null when the server
 * didn't confirm the logout.
 */
export async function logout(): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(appUrl("/api/auth/logout"), {
      method: "POST",
      headers: formatHeaders(),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  // A 200 that isn't the API's { ok: true } is a proxy or portal page that
  // answered for the server, which never saw the request.
  const data = await res.json().catch(() => null);
  if (data?.ok !== true) return null;
  // The server session is gone by now, so storage refusing to clear (private
  // mode, blocked site data) must not trap the user on this page.
  try {
    clearToken();
    localStorage.removeItem("snapotter-username");
  } catch {}
  return logoutDestination(data.logoutUrl);
}
