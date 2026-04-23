# Developer guide

How to set up a local development environment and contribute code to ashim.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (for container builds and AI features)
- Git

Python 3.10+ is only needed if you are working on the AI/ML sidecar (background removal, upscaling, OCR).

## Setup

```bash
git clone https://github.com/ashim-hq/ashim.git
cd ashim
pnpm install
pnpm dev
```

This starts two dev servers:

| Service  | URL                      | Notes                              |
|----------|--------------------------|------------------------------------|
| Frontend | http://localhost:1349     | Vite dev server, proxies /api      |
| Backend  | http://localhost:13490    | Fastify API (accessed via proxy)   |

Open http://localhost:1349 in your browser. Login with `admin` / `admin`. You will be prompted to change the password on first login.

## Project structure

```
apps/
  api/              Fastify backend
  web/              Vite + React frontend
  docs/             VitePress documentation (this site)
packages/
  shared/           Constants, types, i18n strings
  image-engine/     Sharp-based image operations
  ai/               Python sidecar bridge for ML models
tests/
  unit/             Vitest unit tests
  integration/      Vitest integration tests (full API)
  e2e/              Playwright end-to-end specs
  fixtures/         Small test images
```

## Commands

```bash
pnpm dev                # start frontend + backend
pnpm build              # build all workspaces
pnpm typecheck          # TypeScript check across monorepo
pnpm lint               # Biome lint + format check
pnpm lint:fix           # auto-fix lint + format
pnpm test               # unit + integration tests
pnpm test:unit          # unit tests only
pnpm test:integration   # integration tests only
pnpm test:e2e           # Playwright e2e tests
pnpm test:coverage      # tests with coverage report
```

## Code conventions

- Double quotes, semicolons, 2-space indentation (enforced by Biome)
- ES modules in all workspaces
- [Conventional commits](https://www.conventionalcommits.org/) for semantic-release
- Zod for all API input validation
- No modifications to Biome, TypeScript, or editor config files. Fix the code, not the linter.

## Database

SQLite via Drizzle ORM. The database file lives at `./data/ashim.db` by default.

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Schema is defined in `apps/api/src/db/schema.ts`. Tables: users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles.

## Adding a new tool

Every tool follows the same pattern. Here is a minimal example.

### 1. Backend route

Create `apps/api/src/routes/tools/my-tool.ts`:

```ts
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  intensity: z.number().min(0).max(100).default(50),
});

export function registerMyTool(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "my-tool",
    settingsSchema,
    async process(inputBuffer, settings, filename) {
      // Use sharp or other libraries to process the image
      const sharp = (await import("sharp")).default;
      const result = await sharp(inputBuffer)
        // ... your processing logic
        .toBuffer();

      return {
        buffer: result,
        filename: filename.replace(/\.[^.]+$/, ".png"),
        contentType: "image/png",
      };
    },
  });
}
```

Then register it in `apps/api/src/routes/tools/index.ts`.

### 2. Frontend settings component

Create `apps/web/src/components/tools/my-tool-settings.tsx`:

```tsx
import { useState } from "react";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

export function MyToolSettings() {
  const { files } = useFileStore();
  const { processFiles, processing, error, downloadUrl } =
    useToolProcessor("my-tool");

  const [intensity, setIntensity] = useState(50);

  const handleProcess = () => {
    processFiles(files, { intensity });
  };

  return (
    <div className="space-y-4">
      {/* your controls here */}
      <button
        type="button"
        onClick={handleProcess}
        disabled={files.length === 0 || processing}
        data-testid="my-tool-submit"
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
      >
        Process
      </button>
    </div>
  );
}
```

Then register it in the frontend tool registry at `apps/web/src/lib/tool-registry.tsx`:

```tsx
// Add the lazy import
const MyToolSettings = lazy(() =>
  import("@/components/tools/my-tool-settings").then((m) => ({
    default: m.MyToolSettings,
  })),
);

// Add to the toolRegistry Map
["my-tool", { displayMode: "before-after", Settings: MyToolSettings }],
```

Display modes: `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`.

### 3. i18n entry

Add to `packages/shared/src/i18n/en.ts`:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. Tests

Add a `data-testid` attribute to your action button (as shown above) so e2e tests can target it reliably.

## Docker builds

Build the full production image locally:

```bash
docker build -f docker/Dockerfile -t ashim:latest .
```

Use BuildKit cache mounts for faster rebuilds:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t ashim:latest .
```

## Environment variables

See the [Configuration guide](/guide/configuration) for the full list. Key ones for development:

| Variable                    | Default   | Description                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | Enable/disable authentication                  |
| `DEFAULT_USERNAME`          | `admin`   | Default admin username                         |
| `DEFAULT_PASSWORD`          | `admin`   | Default admin password                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | Skip forced password change (CI/dev only)      |
| `RATE_LIMIT_PER_MIN`       | `0`       | API rate limit per minute (0 = disabled)       |
| `MAX_UPLOAD_SIZE_MB`       | `0`       | Maximum upload size in MB (0 = unlimited)      |
