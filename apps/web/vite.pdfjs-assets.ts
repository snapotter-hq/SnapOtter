import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

// pdf.js fetches predefined CMaps, the standard-14 font substitutes, the image
// decoders (wasm, plus the JS fallbacks it imports when wasm is refused) and
// an ICC profile at render time. They're copied rather than imported (a
// bundler would try to graph all of them) and served from the app's own
// origin, since self-hosted instances can be fully offline (#1084, #2082).
const PDFJS_DIR = path.resolve(import.meta.dirname, "node_modules/pdfjs-dist");
const ASSET_DIRS = ["cmaps", "standard_fonts", "wasm", "iccs"];
const URL_PREFIX = "pdfjs/";
// Browsers refuse import() of a module script that isn't served as JavaScript,
// and the wasm fallbacks are loaded that way.
const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".wasm": "application/wasm",
};

export function pdfjsAssets(): Plugin {
  return {
    name: "snapotter:pdfjs-assets",
    configureServer(server) {
      server.middlewares.use(`/${URL_PREFIX}`, (req, res) => {
        const [dir, file, ...rest] = (req.url ?? "").split("?")[0].split("/").filter(Boolean);
        // Never next(): Vite's HTML fallback would answer a miss with the SPA
        // shell and a 200, which pdf.js reads as a corrupt CMap.
        const miss = (reason: string) => {
          server.config.logger.warn(`[pdfjs-assets] ${reason}: ${req.url}`);
          res.statusCode = 404;
          res.end();
        };
        if (!ASSET_DIRS.includes(dir) || !file || rest.length > 0 || file !== path.basename(file)) {
          return miss("not a pdf.js asset");
        }
        try {
          const body = readFileSync(path.join(PDFJS_DIR, dir, file));
          res.setHeader(
            "Content-Type",
            CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
          );
          res.end(body);
        } catch (err) {
          miss((err as NodeJS.ErrnoException).code ?? "unreadable");
        }
      });
    },
    generateBundle() {
      for (const dir of ASSET_DIRS) {
        for (const file of readdirSync(path.join(PDFJS_DIR, dir))) {
          this.emitFile({
            type: "asset",
            fileName: `${URL_PREFIX}${dir}/${file}`,
            source: readFileSync(path.join(PDFJS_DIR, dir, file)),
          });
        }
      }
    },
  };
}
