#!/usr/bin/env node
/**
 * Generates the maskable PWA icons in apps/web/public/ from logo-512.png.
 *
 * Maskable icons get cropped to a circle/squircle by Android launchers, so the
 * artwork is scaled into the ~80% safe zone and centered on the app's warm
 * cream background (--color-background, #FAFAF7). Regenerate after any logo
 * change. Run from the repo root:
 *
 *   node scripts/generate-pwa-icons.mjs
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// sharp is not hoisted to the root; borrow image-engine's copy.
const require = createRequire(join(__dirname, "../packages/image-engine/package.json"));
const sharp = require("sharp");
const PUBLIC = join(__dirname, "../apps/web/public");
const BACKGROUND = "#FAFAF7";
// Content occupies 72% of the canvas: inside the 80% safe zone with margin.
const CONTENT_RATIO = 0.72;

async function generate(size, out) {
  const content = Math.round(size * CONTENT_RATIO);
  const logo = await sharp(join(PUBLIC, "logo-512.png"))
    .resize(content, content, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(join(PUBLIC, out));

  console.log(`wrote apps/web/public/${out}`);
}

await generate(512, "logo-maskable-512.png");
await generate(192, "logo-maskable-192.png");
