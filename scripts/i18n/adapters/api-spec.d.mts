/** Types for api-spec.mjs so TypeScript tests can import it. */
export function proseFields(spec: unknown): Array<[string, string]>;
export function setProseField(spec: unknown, id: string, value: string): void;
