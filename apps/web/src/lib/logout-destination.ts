import { appUrl } from "./app-url";
import { isValidHttpUrl } from "./url-parser";

/**
 * Where the browser goes after logout: the IdP's logoutUrl when the API sent
 * an http(s) one, otherwise the login page (with a notice when the API
 * couldn't end the IdP session, #1800). logoutUrl is built from the IdP's
 * discovery document, and a javascript: or data: URL assigned to
 * window.location would run in this origin. The API already drops those
 * (#1855); this is the second check.
 */
export function logoutDestination(logoutUrl: unknown, idpLogout?: unknown): string {
  if (typeof logoutUrl === "string" && isValidHttpUrl(logoutUrl)) return logoutUrl;
  if (idpLogout === "failed") return appUrl("/login?notice=idp_logout_failed");
  return appUrl("/login");
}
