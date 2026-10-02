import type { Unzipped } from "fflate";
import { MalformedResultError, reportMalformedResult } from "@/lib/progress-frames";

interface ReportTags {
  /** HTTP status of a sync answer; a durable download has none to report. */
  status?: number;
  toolId?: string;
}

/**
 * Unpacks a batch's result ZIP. Bytes that won't unpack (a truncated or
 * corrupt archive, a blob the browser can't read back) are the server's or the
 * transfer's fault, the batch twin of a 2xx body that isn't a result (#1740):
 * logged, reported under a constant message without the cause, and answered
 * with null so the caller fails the run once (#1805). The fflate chunk failing
 * to load is ours, not the answer's, so that throw goes to the caller.
 */
export async function unpackBatchZip(zipBlob: Blob, tags: ReportTags): Promise<Unzipped | null> {
  const { unzipSync } = await import("fflate");
  try {
    return unzipSync(new Uint8Array(await zipBlob.arrayBuffer()));
  } catch (err) {
    console.error("Batch result ZIP could not be unpacked", err);
    reportMalformedResult(new MalformedResultError("batchZipUnreadable"), tags);
    return null;
  }
}

/**
 * Decodes a batch answer's X-File-Results header: input index to the result's
 * name inside the ZIP. A missing header is no results. One that doesn't decode
 * to an object is logged and reported (#1805), then read as no results, so
 * every file still settles, as "File not found in batch results".
 */
export function parseFileResultsHeader(
  header: string | null,
  tags: ReportTags,
): Record<string, string> {
  if (header == null) return {};
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(header));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // Not kept: a SyntaxError quotes the header.
  }
  // Only its length: the header holds file names, and a console line rides
  // along as a breadcrumb on the report below, where the scrubber can't
  // reliably mask a percent-encoded name.
  console.error("Ignoring unreadable X-File-Results", { length: header.length });
  reportMalformedResult(new MalformedResultError("fileResultsUnreadable"), tags);
  return {};
}
