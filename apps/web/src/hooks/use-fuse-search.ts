import type { Tool } from "@snapotter/shared";
import {
  filterRelevantTools,
  normalizeSearchQuery,
  withConverterFallback,
} from "@snapotter/shared";
import type { IFuseOptions } from "fuse.js";
import Fuse from "fuse.js";
import { useMemo } from "react";

// Exported so tests exercise the real ranking config instead of a copy that
// can drift out of sync with production (which would give false green).
export const FUSE_OPTIONS: IFuseOptions<Tool> = {
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
 * The ranking behind useFuseSearch, exported so tests run the shipped pipeline.
 * Hits that don't contain every query word are dropped so a query with no real
 * match reaches the empty state, and an "x to y" query no preset handles leads
 * with the modality's converter (#4818).
 */
export function searchToolList(fuse: Fuse<Tool>, tools: Tool[], query: string): Tool[] {
  const normalized = normalizeSearchQuery(query);
  const hits = fuse.search(normalized || query).map((r) => r.item);
  return withConverterFallback(query, filterRelevantTools(query, hits), tools);
}

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
    return searchToolList(fuse, tools, query);
  }, [fuse, query, tools]);
}
