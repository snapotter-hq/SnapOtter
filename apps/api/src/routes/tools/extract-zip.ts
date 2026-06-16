import { createWriteStream } from "node:fs";
import { basename, extname, join } from "node:path";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import { type Entry, fromBuffer, type ZipFile } from "yauzl";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

/** Promise wrapper for yauzl.fromBuffer with lazyEntries. */
function openZipBuffer(buffer: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (err, zipfile) => {
      if (err) return reject(err);
      if (!zipfile) return reject(new Error("Failed to open zip"));
      resolve(zipfile);
    });
  });
}

const MAX_ENTRIES = 1000;
const MAX_ENTRY_SIZE = 200 * 1024 * 1024; // 200 MiB
const MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 500 MiB
const MAX_RATIO = 100;
const PAYLOAD_ENTRY_CAP = 100;

const settingsSchema = z.object({});

/** Read all entries from a yauzl ZipFile (lazyEntries mode). */
function collectEntries(zipfile: ZipFile): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: Entry[] = [];
    zipfile.on("entry", (entry: Entry) => {
      entries.push(entry);
      zipfile.readEntry();
    });
    zipfile.on("end", () => resolve(entries));
    zipfile.on("error", (err: Error) => reject(err));
    zipfile.readEntry();
  });
}

/** Read an entry stream into a Buffer. */
function readEntryBuffer(zipfile: ZipFile, entry: Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) return reject(err);
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", (e: Error) => reject(e));
    });
  });
}

/** Deduplicate basenames: name-1.ext, name-2.ext until each output is unique. */
function deduplicateNames(names: string[]): string[] {
  const usedNames = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = basename(raw);
    const ext = extname(name);
    const base = name.slice(0, name.length - ext.length) || "file";
    let candidate = name;
    let n = 1;
    while (usedNames.has(candidate.toLowerCase())) {
      candidate = `${base}-${n}${ext}`;
      n++;
    }
    usedNames.add(candidate.toLowerCase());
    result.push(candidate);
  }
  return result;
}

export function registerExtractZip(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "extract-zip",
    settingsSchema,
    // Reject path-traversal / absolute-path entries pre-enqueue with a clean 400.
    // (yauzl also blocks them, but only as a generic worker 422; the processV2
    // guards below remain as defense-in-depth for the pipeline/batch path.)
    preValidate: async ({ inputs }) => {
      const buf = inputs[0]?.buffer;
      if (!buf) return;
      let entries: Entry[];
      try {
        entries = await collectEntries(await openZipBuffer(buf));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/relative path|absolute path/i.test(msg)) {
          throw new InputValidationError(
            "This archive contains an unsafe entry path (path traversal or absolute) and was rejected",
          );
        }
        throw new InputValidationError(
          "Could not read the archive; it may be corrupt or not a valid .zip",
        );
      }
      for (const e of entries) {
        const name = e.fileName;
        if (
          name.startsWith("/") ||
          name.startsWith("\\") ||
          name.split(/[/\\]/).some((s) => s === "..")
        ) {
          throw new InputValidationError(
            "This archive contains an unsafe entry path (path traversal or absolute) and was rejected",
          );
        }
      }
    },
    process: async () => {
      throw new Error("extract-zip is v2-only");
    },
    processV2: async (ctx) => {
      const input = ctx.inputs[0];
      const inputBase = input.filename.replace(/\.[^.]+$/, "") || "archive";
      const zipSize = input.buffer.length;

      ctx.report(5, "Reading archive");
      const zipfile = await openZipBuffer(input.buffer);

      const allEntries = await collectEntries(zipfile);

      // Filter out directories and symlinks
      const fileEntries: Entry[] = [];
      for (const entry of allEntries) {
        // Skip directory entries (name ends with /)
        if (entry.fileName.endsWith("/")) continue;
        // Skip symlinks: Unix external attrs mode check
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (mode === 0o120000) continue;
        fileEntries.push(entry);
      }

      if (fileEntries.length === 0) {
        throw new InputValidationError("No extractable files found in the archive");
      }

      // Guard: entry count
      if (fileEntries.length > MAX_ENTRIES) {
        throw new InputValidationError("Too many entries");
      }

      // Guard: per-entry size, total size, path safety
      let totalUncompressed = 0;
      for (const entry of fileEntries) {
        if (entry.uncompressedSize > MAX_ENTRY_SIZE) {
          throw new InputValidationError("Archive expands too large");
        }
        totalUncompressed += entry.uncompressedSize;
        if (totalUncompressed > MAX_TOTAL_SIZE) {
          throw new InputValidationError("Archive expands too large");
        }

        // Path safety: reject absolute paths and ".." segments
        const name = entry.fileName;
        if (name.startsWith("/") || name.startsWith("\\")) {
          throw new InputValidationError("Unsafe entry path");
        }
        const segments = name.split(/[/\\]/);
        if (segments.some((s) => s === "..")) {
          throw new InputValidationError("Unsafe entry path");
        }
      }

      // Guard: compression ratio
      if (zipSize > 0 && totalUncompressed / zipSize > MAX_RATIO) {
        throw new InputValidationError("Suspicious compression ratio");
      }

      ctx.report(20, "Extracting files");

      // Build the entries payload (capped at 100)
      const entriesPayload = fileEntries.slice(0, PAYLOAD_ENTRY_CAP).map((e) => ({
        name: basename(e.fileName),
        size: e.uncompressedSize,
      }));

      // Re-open for streaming extraction (yauzl consumed the entries)
      const zipfile2 = await openZipBuffer(input.buffer);
      const allEntries2 = await collectEntries(zipfile2);
      const fileEntries2 = allEntries2.filter((entry) => {
        if (entry.fileName.endsWith("/")) return false;
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (mode === 0o120000) return false;
        return true;
      });

      // Single file: output the bare file directly
      if (fileEntries2.length === 1) {
        const entry = fileEntries2[0];
        const buf = await readEntryBuffer(zipfile2, entry);
        ctx.report(90, "Done");
        return {
          buffer: buf,
          filename: basename(entry.fileName),
          contentType: "application/octet-stream",
          resultPayload: { entries: entriesPayload },
        };
      }

      // Multiple files: repackage flat
      const dedupedNames = deduplicateNames(fileEntries2.map((e) => e.fileName));
      const outPath = join(ctx.scratchDir, `${inputBase}_extracted.zip`);
      const archive = archiver("zip", { zlib: { level: 6 } });
      const output = createWriteStream(outPath);
      archive.pipe(output);

      for (let i = 0; i < fileEntries2.length; i++) {
        const buf = await readEntryBuffer(zipfile2, fileEntries2[i]);
        archive.append(buf, { name: dedupedNames[i] });
        const pct = Math.min(85, 30 + Math.round(((i + 1) / fileEntries2.length) * 55));
        ctx.report(pct, `Extracting file ${i + 1} of ${fileEntries2.length}`);
      }

      await new Promise<void>((resolve, reject) => {
        output.on("close", () => resolve());
        archive.on("error", (err: Error) => reject(err));
        void archive.finalize();
      });

      ctx.report(95, "Done");
      return {
        scratchPath: outPath,
        filename: `${inputBase}_extracted.zip`,
        contentType: "application/zip",
        resultPayload: { entries: entriesPayload },
      };
    },
  });
}
