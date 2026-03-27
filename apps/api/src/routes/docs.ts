import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import scalarPlugin from "@scalar/fastify-api-reference";
import type { FastifyInstance } from "fastify";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function docsRoutes(app: FastifyInstance): Promise<void> {
  const specPath = resolve(__dirname, "../openapi.yaml");
  const specContent = readFileSync(specPath, "utf-8");

  app.get("/api/v1/openapi.yaml", async (_request, reply) => {
    reply.type("text/yaml").send(specContent);
  });

  await app.register(scalarPlugin, {
    routePrefix: "/api/docs",
    configuration: {
      spec: {
        content: specContent,
      },
      theme: "default",
      customCss: `
        :root {
          --scalar-color-1: #09090b;
          --scalar-color-2: #3f3f46;
          --scalar-color-3: #71717a;
          --scalar-color-accent: #2563eb;
          --scalar-background-1: #ffffff;
          --scalar-background-2: #f4f4f5;
          --scalar-background-3: #e4e4e7;
          --scalar-border-color: #e4e4e7;
          --scalar-font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
      `,
      hideDownloadButton: false,
      hideTestRequestButton: true,
      hiddenClients: true,
    },
  });
}
