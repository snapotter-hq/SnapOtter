import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

// pdf.js fetches predefined CMaps and the standard-14 font substitutes at
// render time. They're many small files, so they're copied rather than
// imported (a bundler would try to graph all of them) and served from the
// app's own origin, since self-hosted instances can be fully offline (#1084).
const PDFJS_DIR = path.resolve(import.meta.dirname, "node_modules/pdfjs-dist");
const ASSET_DIRS = ["cmaps", "standard_fonts"];
const URL_PREFIX = "pdfjs/";

export function pdfjsAssets(): Plugin {
  return {
    name: "snapotter:pdfjs-assets",
    configureServer(server) {
      server.middlewares.use(`/${URL_PREFIX}`, (req, res, next) => {
        const [dir, file, ...rest] = (req.url ?? "").split("?")[0].split("/").filter(Boolean);
        if (!ASSET_DIRS.includes(dir) || !file || rest.length > 0 || file !== path.basename(file)) {
          return next();
        }
        try {
          const body = readFileSync(path.join(PDFJS_DIR, dir, file));
          res.setHeader("Content-Type", "application/octet-stream");
          res.end(body);
        } catch {
          next();
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
