import sharp from "sharp";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

const FAVICON_SIZES = [
  { name: "favicon-16x16.png", size: 16, format: "png" as const },
  { name: "favicon-32x32.png", size: 32, format: "png" as const },
  { name: "favicon-48x48.png", size: 48, format: "png" as const },
  { name: "apple-touch-icon.png", size: 180, format: "png" as const },
  { name: "android-chrome-192x192.png", size: 192, format: "png" as const },
  { name: "android-chrome-512x512.png", size: 512, format: "png" as const },
];

export function registerFavicon(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/favicon",
    async (request, reply) => {
      let fileBuffer: Buffer | null = null;

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            fileBuffer = Buffer.concat(chunks);
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      try {
        const jobId = randomUUID();

        reply.raw.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="favicons-${jobId.slice(0, 8)}.zip"`,
          "Transfer-Encoding": "chunked",
        });

        const archive = archiver("zip", { zlib: { level: 5 } });
        archive.pipe(reply.raw);

        // Generate each size
        for (const icon of FAVICON_SIZES) {
          const buffer = await sharp(fileBuffer)
            .resize(icon.size, icon.size, { fit: "cover" })
            .png()
            .toBuffer();

          archive.append(buffer, { name: icon.name });
        }

        // Generate ICO (use 16x16 and 32x32 PNGs embedded)
        // Simple ICO format: just include the 32x32 PNG as an ICO
        const ico32 = await sharp(fileBuffer)
          .resize(32, 32, { fit: "cover" })
          .png()
          .toBuffer();
        archive.append(ico32, { name: "favicon.ico" });

        // Generate manifest.json (for PWA)
        const manifest = {
          name: "App",
          short_name: "App",
          icons: [
            { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
          ],
          theme_color: "#ffffff",
          background_color: "#ffffff",
          display: "standalone",
        };
        archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

        // Generate HTML snippet
        const htmlSnippet = `<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
`;
        archive.append(htmlSnippet, { name: "favicon-snippet.html" });

        await archive.finalize();
      } catch (err) {
        if (!reply.raw.headersSent) {
          return reply.status(422).send({
            error: "Favicon generation failed",
            details: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
    },
  );
}
