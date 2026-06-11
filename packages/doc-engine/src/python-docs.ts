import { runDocsScript } from "@snapotter/ai";

/** Page count via the docs-profile Python dispatcher (pikepdf). */
export async function pdfPageCountPy(absPath: string): Promise<number> {
  const stdout = await runDocsScript("doc_pagecount", { path: absPath });
  const parsed = JSON.parse(stdout.trim()) as { pages?: number; error?: string };
  if (parsed.error || typeof parsed.pages !== "number") {
    throw new Error(`doc_pagecount failed: ${parsed.error ?? stdout.slice(0, 200)}`);
  }
  return parsed.pages;
}
