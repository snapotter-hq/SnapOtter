/** Types for api-spec.mjs so TypeScript tests can import it. */
export function proseFields(spec: unknown): Array<[string, string]>;
export function setProseField(spec: unknown, id: string, value: string): void;

export interface ApiSpecUnit {
  id: string;
  sourceText: string;
  kind: "text";
}

export interface ApiSpecEntry {
  text: string;
  sourceHash: string;
  provenance: "human" | "machine";
  outputHash: string;
  stale?: boolean;
}

export interface ApiSpecAdapter {
  name: "api";
  extract(): Promise<ApiSpecUnit[]>;
  write(locale: string, entries: Map<string, ApiSpecEntry>): Promise<void>;
  load(locale: string): Promise<Map<string, ApiSpecEntry>>;
}

export function makeApiSpecAdapter(opts?: { dir?: string }): ApiSpecAdapter;
export const adapter: ApiSpecAdapter;
