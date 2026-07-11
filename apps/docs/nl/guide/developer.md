---
description: "Lokale ontwikkelomgeving opzetten, commando's, codeconventies en hoe je een nieuwe tool aan SnapOtter toevoegt."
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: 057d7364f4cc
---

# Ontwikkelaarsgids {#developer-guide}

Hoe je een lokale ontwikkelomgeving opzet en code bijdraagt aan SnapOtter.

## Vereisten {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (vereist voor lokale Postgres + Redis, containerbuilds en AI-functies)
- Git

Python 3.10+ is alleen nodig als je aan de AI/ML-sidecar werkt (achtergrond verwijderen, opschalen, OCR).

## Installatie {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

Dit start twee dev-servers:

| Service  | URL                      | Opmerkingen                        |
|----------|--------------------------|------------------------------------|
| Frontend | http://localhost:1349     | Vite-dev-server, proxyt /api       |
| Backend  | http://localhost:13490    | Fastify-API (bereikbaar via proxy) |

Open http://localhost:1349 in je browser. Meld je aan met `admin` / `admin`. Je wordt gevraagd het wachtwoord te wijzigen bij de eerste aanmelding.

## Projectstructuur {#project-structure}

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

## Commando's {#commands}

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

## Codeconventies {#code-conventions}

- Dubbele aanhalingstekens, puntkomma's, inspringen met 2 spaties (afgedwongen door Biome)
- ES-modules in alle workspaces
- [Conventional commits](https://www.conventionalcommits.org/) voor semantic-release
- Zod voor alle API-invoervalidatie
- Geen wijzigingen aan Biome-, TypeScript- of editor-configuratiebestanden. Fix de code, niet de linter.

## Database {#database}

PostgreSQL 17 via Drizzle ORM (pg-core). Lokale ontwikkeling vereist dat Postgres en Redis draaien - start ze met:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Dit geeft je Postgres op poort 5432 en Redis op poort 6379. Genereer en pas vervolgens migraties toe:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Het schema is gedefinieerd in `apps/api/src/db/schema.ts`. Tabellen: users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles, roles, auditLog.

## Een nieuwe tool toevoegen {#adding-a-new-tool}

Elke tool volgt hetzelfde patroon. Hier is een minimaal voorbeeld.

### 1. Backend-route {#_1-backend-route}

Maak `apps/api/src/routes/tools/my-tool.ts`:

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

Registreer het vervolgens in `apps/api/src/routes/tools/index.ts`.

### 2. Frontend-instellingencomponent {#_2-frontend-settings-component}

Maak `apps/web/src/components/tools/my-tool-settings.tsx`:

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

Registreer het vervolgens in het frontend-toolregister op `apps/web/src/lib/tool-registry.tsx`:

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

Weergavemodi: `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`.

### 3. i18n-vermelding {#_3-i18n-entry}

Voeg toe aan `packages/shared/src/i18n/en.ts`:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. Tests {#_4-tests}

Voeg een `data-testid`-attribuut toe aan je actieknop (zoals hierboven getoond) zodat e2e-tests het betrouwbaar kunnen aanspreken.

## Docker-builds {#docker-builds}

Bouw de volledige productie-image lokaal:

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

Gebruik BuildKit-cachemounts voor snellere rebuilds:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## Omgevingsvariabelen {#environment-variables}

Zie de [Configuratiegids](/nl/guide/configuration) voor de volledige lijst. De belangrijkste voor ontwikkeling:

| Variabele                   | Standaard | Beschrijving                                   |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | Authenticatie in-/uitschakelen                 |
| `DEFAULT_USERNAME`          | `admin`   | Standaard beheerdersgebruikersnaam             |
| `DEFAULT_PASSWORD`          | `admin`   | Standaard beheerderswachtwoord                 |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | Geforceerde wachtwoordwijziging overslaan (alleen CI/dev)  |
| `RATE_LIMIT_PER_MIN`       | `1000`    | API-ratelimiet per minuut (0 = uitgeschakeld)  |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | Maximale uploadgrootte in MB (0 = onbeperkt)   |
