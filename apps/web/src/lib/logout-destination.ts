import { appUrl } from "./app-url";
import { isValidHttpUrl } from "./url-parser";

/**
 * Where the browser goes after logout: the IdP's logoutUrl when the API sent
 * an http(s) one, otherwise the login page. logoutUrl is built from the IdP's
 * discovery document, and a javascript: or data: URL assigned to
 * window.location would run in this origin. The API already drops those
 * (#1855); this is the second check.
 */
export function logoutDestination(logoutUrl: unknown): string {
  if (typeof logoutUrl === "string" && isValidHttpUrl(logoutUrl)) return logoutUrl;
  return appUrl("/login");
}
