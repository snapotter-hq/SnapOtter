---
description: "Lokal utvecklingskonfiguration, kommandon, kodkonventioner och hur du lägger till ett nytt verktyg i SnapOtter."
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: cc3f339d18f1
---

# Utvecklarguide {#developer-guide}

Så ställer du in en lokal utvecklingsmiljö och bidrar med kod till SnapOtter.

## Förutsättningar {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (krävs för lokal Postgres + Redis, containerbyggen och AI-funktioner)
- Git

Python 3.10+ behövs bara om du arbetar med AI/ML-sidovagnen (bakgrundsborttagning, uppskalning, OCR).

## Konfiguration {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

Detta startar två utvecklingsservrar:

| Tjänst  | URL                      | Anmärkningar                              |
|----------|--------------------------|------------------------------------|
| Frontend | http://localhost:1349     | Vite-utvecklingsserver, proxar /api      |
| Backend  | http://localhost:13490    | Fastify API (nås via proxy)   |

Öppna http://localhost:1349 i din webbläsare. Logga in med `admin` / `admin`. Du kommer att uppmanas att byta lösenord vid första inloggningen.

## Projektstruktur {#project-structure}

```
apps/
  api/              Fastify backend
  web/              Vite + React frontend
  docs/             VitePress documentation (this site)
packages/
  shared/           Constants, types, i18n strings
  image-engine/     Sharp-based image operations
  media-engine/     FFmpeg spawn + progress parsing
  doc-engine/       qpdf, LibreOffice, ghostscript wrappers
  ai/               Python sidecar bridge for ML models
tests/
  unit/             Vitest unit tests
  integration/      Vitest integration tests (full API)
  e2e/              Playwright end-to-end specs
  fixtures/         Small test images
```

## Kommandon {#commands}

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

## Kodkonventioner {#code-conventions}

- Dubbla citattecken, semikolon, 2 blanksteg indrag (enforced av Biome)
- ES-moduler i alla arbetsytor
- [Conventional commits](https://www.conventionalcommits.org/) för semantic-release
- Zod för all validering av API-indata
- Inga ändringar av Biome-, TypeScript- eller editorkonfigurationsfiler. Fixa koden, inte lintern.

## Databas {#database}

PostgreSQL 17 via Drizzle ORM (pg-core). Lokal utveckling kräver att Postgres och Redis körs - starta dem med:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Detta ger dig Postgres på port 5432 och Redis på port 6379. Generera sedan och tillämpa migrationer:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Schemat definieras i `apps/api/src/db/schema.ts`. Tabeller: users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles, roles, auditLog.

## Lägga till ett nytt verktyg {#adding-a-new-tool}

Varje verktyg följer samma mönster. Här är ett minimalt exempel.

### 1. Backend-rutt {#_1-backend-route}

Skapa `apps/api/src/routes/tools/my-tool.ts`:

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

Registrera det sedan i `apps/api/src/routes/tools/index.ts`.

### 2. Frontend-inställningskomponent {#_2-frontend-settings-component}

Skapa `apps/web/src/components/tools/my-tool-settings.tsx`:

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

Registrera det sedan i frontend-verktygsregistret på `apps/web/src/lib/tool-registry.tsx`:

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

Visningslägen: `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`.

### 3. i18n-post {#_3-i18n-entry}

Lägg till i `packages/shared/src/i18n/en.ts`:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. Tester {#_4-tests}

Lägg till ett `data-testid`-attribut till din åtgärdsknapp (som visas ovan) så att e2e-tester kan rikta in sig på den tillförlitligt.

## Docker-byggen {#docker-builds}

Bygg den fullständiga produktionsavbildningen lokalt:

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

Använd BuildKit-cache-monteringar för snabbare ombyggen:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## Miljövariabler {#environment-variables}

Se [Konfigurationsguiden](/sv/guide/configuration) för den fullständiga listan. Viktiga för utveckling:

| Variabel                    | Standard   | Beskrivning                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | Aktivera/inaktivera autentisering                  |
| `DEFAULT_USERNAME`          | `admin`   | Standardadministratörsanvändarnamn                         |
| `DEFAULT_PASSWORD`          | `admin`   | Standardadministratörslösenord                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | Hoppa över framtvingat lösenordsbyte (endast CI/dev)      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | API-hastighetsgräns per minut (0 = inaktiverat)       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | Maximal uppladdningsstorlek i MB (0 = obegränsat)      |
