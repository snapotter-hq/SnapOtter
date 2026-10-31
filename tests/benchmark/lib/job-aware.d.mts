/** Types for job-aware.mjs so TypeScript tests can import it. */
export interface BenchmarkResolveOptions {
  baseUrl: string;
  token?: string;
  admissionStatus: number;
  admissionMime: string | number | string[] | undefined;
  admissionBody: Buffer | string;
  admissionLatencyS?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  expectedMime: string | undefined;
  expectedZipEntries: number | undefined;
  oracle: unknown;
}

export interface BenchmarkResolution {
  admissionStatus: number;
  completionStatus: "completed";
  completionLatencyS: number;
  outputMime: string;
  [key: string]: unknown;
}

export function resolveBenchmarkResponse(
  options: BenchmarkResolveOptions,
): Promise<BenchmarkResolution>;
