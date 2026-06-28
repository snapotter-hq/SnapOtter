import type { Tool } from "@snapotter/shared";
import { normalizeSearchQuery } from "@snapotter/shared";
import type { IFuseOptions } from "fuse.js";
import Fuse from "fuse.js";
import { useMemo } from "react";

const FUSE_OPTIONS: IFuseOptions<Tool> = {
  keys: [
    { name: "name", weight: 0.35 },
    { name: "keywords", weight: 0.3 },
    { name: "description", weight: 0.25 },
    { name: "modality", weight: 0.15 },
    { name: "id", weight: 0.15 },
    { name: "category", weight: 0.1 },
  ],
  threshold: 0.45,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

/**
 * Wraps a tool list with Fuse.js fuzzy search.
 * Returns all tools when query is empty; ranked fuzzy results otherwise.
 * Queries are normalized (synonyms, compact forms like "jpg2png", filler
 * stripping) before searching, falling back to the raw query when
 * normalization yields an empty string.
 */
export function useFuseSearch(tools: Tool[], query: string): Tool[] {
  const fuse = useMemo(() => new Fuse(tools, FUSE_OPTIONS), [tools]);

  return useMemo(() => {
    if (!query) return tools;
    const normalized = normalizeSearchQuery(query);
    return fuse.search(normalized || query).map((r) => r.item);
  }, [fuse, query, tools]);
}
