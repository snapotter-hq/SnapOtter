import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Issue #1190: every intermediate buffer a tool route writes has to name the
 * format it is written in.
 *
 * A bare `toBuffer()` leaves the choice to Sharp, which picks whatever
 * container the input arrived in. For a JPEG that inserts a lossy generation at
 * the encoder's own default in the middle of a pipeline the caller asked to run
 * at 95; for a GIF it is worse than lossy, because Sharp's GIF writer reuses the
 * palette it read the image with and a colour the tool just introduced cannot be
 * expressed in it at all.
 *
 * The behavioural guard in image-container-independence.test.ts proves the
 * symptom is gone for every tool it can drive. It cannot drive the ones that
 * take several files, shell out to a model, or answer with something other than
 * an image, and those hold more than half the call sites this issue touched:
 * nine in stitch alone. Reading the source is what covers them.
 *
 * It is also the part that stays true as the catalogue grows. #1180, #1187 and
 * #1190 were each found by scanning by hand and each scan missed sites the next
 * one found, because the pattern is easy to write and invisible in review.
 *
 * What it does not see: a pipeline assembled across statements, where `sharp()`
 * or `openAnimated()` lands in a variable and `toBuffer()` is called on it
 * later. Following that means tracking the variable, which is more machinery
 * than this is worth, so the scan reads one chain at a time. `gif-tools.ts` is
 * written that way and so are the eight `openAnimated` routes, which is a real
 * hole rather than a theoretical one: the behavioural guard is what covers
 * those, and between them the two files reach every site this issue touched.
 */

/**
 * The whole API source, not just the route directory.
 *
 * Scoping this to `routes/tools` was the first mistake: `lib/bg-effects.ts`
 * held five instances of the same bug, reached by three shipped tools, and a
 * scan of the routes alone reported all clear.
 */
const API_SRC = join(dirname(fileURLToPath(import.meta.url)), "../../../apps/api/src");

/** Calls that settle the container, so the chain is no longer Sharp's choice. */
const NAMES_A_FORMAT = new Set([
  "png",
  "jpeg",
  "jpg",
  "webp",
  "gif",
  "tiff",
  "avif",
  "heif",
  "jxl",
  "raw",
  "toFormat",
]);

/**
 * Chains that are fine as they stand, and why.
 *
 * Each is a case where the container is already settled before the chain
 * starts, or where the encode is the tool's answer rather than a step on the
 * way to it. Anything not listed here has to name its own format.
 *
 * Keyed by what the chain reads and the links it runs, not by file. Two files
 * here hold a real intermediate as well, so allowing `vignette.ts` outright
 * would also excuse the composite two lines below the overlay, which is one of
 * the sites this issue fixed; and `meme-generator.ts` has two chains reading
 * the same variable, only one of which is the tool's answer.
 */
const ALLOWED: Array<{ file: string; reads: string; via: string; why: string }> = [
  {
    file: "routes/tools/beautify.ts",
    reads: "mask",
    via: "resize",
    why: "an SVG rounding mask; Sharp falls back to PNG for SVG input",
  },
  {
    file: "routes/tools/border.ts",
    reads: "mask",
    via: "resize",
    why: "an SVG corner mask; Sharp falls back to PNG for SVG input",
  },
  {
    file: "routes/tools/duotone.ts",
    reads: "grayBuf",
    via: "linear",
    why: "the step that produced grayBuf already named PNG, so this inherits it (#1180)",
  },
  {
    file: "routes/tools/meme-generator.ts",
    reads: "imageBuffer",
    via: "composite",
    why: "the tool's answer, not a step on the way: its detected format sets the content type",
  },
  {
    file: "routes/tools/meme-generator.ts",
    reads: "imageBuffer",
    via: "",
    why: "the same answer on the branch that draws no caption, passed straight through",
  },
  {
    file: "routes/tools/vignette.ts",
    reads: "svg",
    via: "resize",
    why: "an SVG gradient overlay; Sharp falls back to PNG for SVG input",
  },
];

/**
 * Sites that are genuinely this bug and are not fixed here, each with the issue
 * that owns it.
 *
 * Kept apart from ALLOWED on purpose. An allowance says "this chain is fine";
 * these are not fine, they are deferred, and writing them down as allowances
 * would let the guard read as though the class were closed when it is not.
 */
const KNOWN_UNFIXED: Array<{ file: string; reads: string; via: string; issue: string }> = [];

interface Chain {
  file: string;
  line: number;
  /** The expression `sharp()` was handed. Half of an allowance's key. */
  reads: string;
  /** The links between `sharp()` and `toBuffer()`. The other half. */
  via: string;
  text: string;
}

/**
 * Every `sharp(...)....toBuffer()` chain in one file that names no format.
 *
 * Walks the method chain with a paren counter rather than matching a pattern,
 * so a chain whose argument holds another whole chain (a composite reading a
 * mask, say) reports the inner and the outer separately instead of confusing
 * one for the other.
 */
function unnamedChains(file: string, source: string): Chain[] {
  const found: Chain[] = [];

  for (let i = 0; i < source.length; i++) {
    if (!source.startsWith("sharp(", i)) continue;
    // Skip `xsharp(` and `.sharp(`: only a bare constructor call starts a chain.
    if (i > 0 && /[\w.$]/.test(source[i - 1])) continue;

    const open = i + "sharp".length;
    const cursorAfterCall = skipCall(source, open);
    if (cursorAfterCall === -1) continue;
    // The first argument, up to a comma at depth 0: `sharp(mask)` reads "mask",
    // `sharp(buf, { animated: true })` reads "buf".
    const reads = firstArgument(source.slice(open + 1, cursorAfterCall - 1));
    let cursor = cursorAfterCall;

    const methods: string[] = [];
    let closed = false;

    while (cursor < source.length) {
      // Whitespace and comments between links are free; anything else ends the
      // chain. Comments have to count: several of the sites this issue fixed
      // carry an explanation between `sharp(...)` and the first link, and
      // treating that as the end of the chain would quietly stop scanning the
      // very lines the comment is about.
      cursor = skipTrivia(source, cursor);
      if (source[cursor] !== ".") break;

      const nameMatch = /^\.([A-Za-z_$][\w$]*)\s*\(/.exec(source.slice(cursor));
      if (!nameMatch) break;

      const name = nameMatch[1];
      const next = skipCall(source, cursor + nameMatch[0].length - 1);
      if (next === -1) break;

      if (name === "toBuffer") {
        closed = true;
        cursor = next;
        break;
      }
      methods.push(name);
      cursor = next;
    }

    if (!closed) continue;
    if (methods.some((name) => NAMES_A_FORMAT.has(name))) continue;

    found.push({
      file,
      reads,
      via: methods.join("."),
      line: source.slice(0, i).split("\n").length,
      text: source.slice(i, cursor).replace(/\s+/g, " ").slice(0, 100),
    });
  }

  return found;
}

/**
 * The source with every comment blanked out, newlines kept.
 *
 * Line numbers stay usable, and prose that happens to name a Sharp call stops
 * reading as one. This file's own gif-tools doc comment says `.gif()` in a
 * sentence and was reported as a call site until this went in.
 */
function withoutComments(source: string): string {
  let out = "";
  for (let i = 0; i < source.length; ) {
    if (source.startsWith("//", i) || source.startsWith("/*", i)) {
      const end = skipTrivia(source, i);
      for (let j = i; j < end; j++) out += source[j] === "\n" ? "\n" : " ";
      i = end;
    } else if (source[i] === '"' || source[i] === "'" || source[i] === "`") {
      const end = skipString(source, i);
      if (end === -1) {
        out += source.slice(i);
        break;
      }
      out += source.slice(i, end + 1);
      i = end + 1;
    } else {
      out += source[i];
      i++;
    }
  }
  return out;
}

/** Index of the next character that is neither whitespace nor a comment. */
function skipTrivia(source: string, from: number): number {
  let i = from;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i++;
    } else if (source.startsWith("//", i)) {
      const end = source.indexOf("\n", i);
      if (end === -1) return source.length;
      i = end + 1;
    } else if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) return source.length;
      i = end + 2;
    } else {
      break;
    }
  }
  return i;
}

/** The first argument of an argument list, trimmed, or "" when there is none. */
function firstArgument(args: string): string {
  let depth = 0;
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === '"' || ch === "'" || ch === "`") {
      const end = skipString(args, i);
      if (end === -1) break;
      i = end;
    } else if (ch === "," && depth === 0) {
      return args.slice(0, i).trim();
    }
  }
  return args.trim();
}

/** Index just past the call whose opening paren is at `open`. */
function skipCall(source: string, open: number): number {
  if (source[open] !== "(") return -1;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i + 1;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      if (i === -1) return -1;
    }
  }
  return -1;
}

/** Index of the closing quote of the string opening at `start`. */
function skipString(source: string, start: number): number {
  const quote = source[start];
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === "\\") {
      i++;
      continue;
    }
    if (source[i] === quote) return i;
  }
  return -1;
}

/** Every .ts file under a directory, depth first. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

describe("the API names the format of every intermediate it writes (#1190)", () => {
  const files = sourceFiles(API_SRC);

  const chains = files.flatMap((full) =>
    unnamedChains(relative(API_SRC, full), readFileSync(full, "utf8")),
  );

  it("finds the sources to scan", () => {
    // A path that stops resolving would otherwise turn this whole file green.
    expect(files.length).toBeGreaterThan(200);
  });

  const matches = (entry: { file: string; reads: string; via: string }, chain: Chain) =>
    entry.file === chain.file && entry.reads === chain.reads && entry.via === chain.via;

  it("leaves no intermediate for Sharp to guess the container of", () => {
    const offenders = chains
      .filter(
        (chain) =>
          !ALLOWED.some((entry) => matches(entry, chain)) &&
          !KNOWN_UNFIXED.some((entry) => matches(entry, chain)),
      )
      .map((chain) => `${chain.file}:${chain.line}  ${chain.text}`);

    // Add `.png()` before `.toBuffer()`, or add an ALLOWED entry naming what
    // the chain reads and why its container is already settled.
    expect(offenders).toEqual([]);
  });

  it("does not keep an entry that nothing needs any more", () => {
    const stale = [...ALLOWED, ...KNOWN_UNFIXED]
      .filter((entry) => !chains.some((chain) => matches(entry, chain)))
      .map((entry) => `${entry.file} reading ${entry.reads} via ${entry.via || "(nothing)"}`);

    expect(stale).toEqual([]);
  });

  it("asks every GIF encode for a fresh palette", () => {
    // Naming a format is not the same as naming a safe one. Writing GIF without
    // `reuse: false` is this bug with the container spelled out, so the scan
    // above would wave it through: `.toFormat("gif", { quality: 95 })` on an
    // extended GIF still returns 0,0,0 for a #008000 border.
    const GIF_WRITE = /\.gif\s*\(|\.toFormat\s*\(\s*["']gif["']/g;
    const offenders: string[] = [];

    for (const full of files) {
      const source = withoutComments(readFileSync(full, "utf8"));
      for (const match of source.matchAll(GIF_WRITE)) {
        const tail = source.slice(match.index, match.index + 400);
        if (/reuse\s*:/.test(tail)) continue;
        // `encoderOptions` carries the rule already, resolved per format.
        if (/encoderOptions/.test(tail)) continue;
        offenders.push(relative(API_SRC, full));
      }
    }

    const byFile: Record<string, number> = {};
    for (const file of offenders.sort()) byFile[file] = (byFile[file] ?? 0) + 1;

    // Counted per file rather than pinned to a line, so moving one of these
    // around does not fail the suite while adding one still does.
    //
    // Every remaining GIF write reads something with no palette to reuse: an
    // SVG, a PDF page, a WebP, or a PNG handed back by the Python sidecar. The
    // six in gif-tools are the modes that reorder existing frames, and they
    // must keep the default: assembleAnimatedGif splices frames together
    // keeping the first one's colour table, so a fresh palette per frame would
    // leave every later frame indexed against the wrong one.
    //
    // These are listed because "no palette upstream" is a fact about the
    // caller, which the text of the line cannot show.
    expect(byFile).toEqual({
      "lib/animated-image.ts": 1,
      "routes/tools/ai-canvas-expand.ts": 1,
      "routes/tools/erase-object.ts": 1,
      "routes/tools/gif-tools.ts": 6,
      "routes/tools/gif-webp.ts": 1,
      "routes/tools/pdf-to-image.ts": 1,
      "routes/tools/svg-to-raster.ts": 1,
    });
  });
});
