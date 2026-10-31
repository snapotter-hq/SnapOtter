/** Types for docs-md.mjs so TypeScript tests can import it. */
export interface DocsUnit {
  id: string;
  sourceText: string;
  kind: "markdown";
}

export interface DocsLocaleEntry {
  text: string;
  sourceHash: string;
  provenance: "human" | "machine";
  outputHash: string;
  stale: boolean;
}

export interface DocsWriteEntry {
  text: string;
  sourceHash: string;
  provenance: string;
  stale?: boolean;
}

export interface DocsAdapter {
  name: "docs";
  extract(): Promise<DocsUnit[]>;
  persistSourceAnchors(): Promise<void>;
  load(locale: string): Promise<Map<string, DocsLocaleEntry>>;
  write(locale: string, entries: Iterable<[string, DocsWriteEntry]>): Promise<void>;
  writeFallback(locale: string, id: string): Promise<void>;
}

export function quoteFrontmatterScalars(text: string): string;
export function createDocsAdapter(opts?: { root?: string }): DocsAdapter;
export const adapter: DocsAdapter;
