import { TOOLS } from "@snapotter/shared";
import { BASE_PATH } from "@/lib/app-url";

const TOOL_IDS_BY_ROUTE = new Map<string, string>(TOOLS.map((t) => [t.route, t.id]));

/** The tool whose page lives at this pathname, or undefined off the tool routes. */
export function toolIdFromPathname(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const path = BASE_PATH && raw.startsWith(`${BASE_PATH}/`) ? raw.slice(BASE_PATH.length) : raw;
  const normalized =
    path.length > 1 && path.endsWith("/") ? path.slice(0, -1).toLowerCase() : path.toLowerCase();
  return TOOL_IDS_BY_ROUTE.get(normalized);
}
