import { extname, posix } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

export const MERGE_TEXT_SEPARATORS = ["blank-line", "rule", "filename-heading"] as const;
export type MergeTextSeparator = (typeof MERGE_TEXT_SEPARATORS)[number];

const settingsSchema = z.object({
  separator: z.enum(MERGE_TEXT_SEPARATORS).default("blank-line"),
});

// No ".csv" entry: joining CSVs as text repeats each header row, so the result
// is not a valid table and must not be served as text/csv. merge-csvs does that.
const OUTPUT_TYPES: Record<string, { ext: string; contentType: string }> = {
  ".md": { ext: ".md", contentType: "text/markdown" },
  ".markdown": { ext: ".md", contentType: "text/markdown" },
  ".log": { ext: ".log", contentType: "text/plain" },
  ".txt": { ext: ".txt", contentType: "text/plain" },
};
const PLAIN_TEXT = OUTPUT_TYPES[".txt"];

const utf8 = new TextDecoder("utf-8", { fatal: true });

interface TextInput {
  filename: string;
  buffer: Buffer;
}

function decodeText(input: TextInput): string {
  // A NUL byte is valid UTF-8 but never appears in a text file; it is the
  // cheapest tell for an image or archive renamed to .txt.
  if (input.buffer.includes(0)) {
    throw new InputValidationError(`${input.filename} is not a text file`);
  }
  let text: string;
  try {
    text = utf8.decode(input.buffer);
  } catch {
    throw new InputValidationError(`${input.filename} is not valid UTF-8 text`);
  }
  // TextDecoder drops a leading BOM by default. trimEnd, not /\s+$/: that
  // regex goes quadratic on a long whitespace run followed by text.
  return text.trimEnd();
}

function outputType(inputs: TextInput[]) {
  const types = inputs.map((i) => OUTPUT_TYPES[extname(i.filename).toLowerCase()]);
  const first = types[0];
  return first && types.every((t) => t?.ext === first.ext) ? first : PLAIN_TEXT;
}

/** Concatenate text files in the order given, with `separator` between them. */
export function mergeTexts(inputs: TextInput[], separator: MergeTextSeparator) {
  if (inputs.length < 2) {
    throw new InputValidationError("Merging needs at least two text files");
  }
  const type = outputType(inputs);
  const bodies = inputs.map(decodeText);
  // Keep Windows files Windows: when every file uses CRLF, so do the
  // separators, otherwise the output mixes line endings.
  const withLines = bodies.filter((b) => b.includes("\n"));
  const nl = withLines.length > 0 && withLines.every((b) => !/(^|[^\r])\n/.test(b)) ? "\r\n" : "\n";
  const sections = bodies.map((body, i) => {
    if (separator !== "filename-heading") return body;
    // The factory keeps client paths out of filenames, but a raw API caller's
    // "notes/one.md" should still head its section as "one.md".
    const name = posix.basename(inputs[i].filename.replaceAll("\\", "/"));
    const heading = type.ext === ".md" ? `# ${name}` : `==> ${name} <==`;
    return `${heading}${nl}${nl}${body}`;
  });
  const joiner = separator === "rule" ? `${nl}${nl}---${nl}${nl}` : `${nl}${nl}`;
  return {
    text: `${sections.join(joiner)}${nl}`,
    filename: `merged${type.ext}`,
    contentType: type.contentType,
  };
}

export function registerMergeText(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "merge-text",
    maxInputs: 50,
    minInputs: 2,
    settingsSchema,
    process: async () => {
      throw new Error("merge-text is v2-only");
    },
    processV2: async (ctx) => {
      const { separator } = settingsSchema.parse(ctx.settings);
      const merged = mergeTexts(ctx.inputs, separator);
      return {
        buffer: Buffer.from(merged.text, "utf8"),
        filename: merged.filename,
        contentType: merged.contentType,
      };
    },
  });
}
