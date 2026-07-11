---
description: "Configurazione dell'ambiente di sviluppo locale, comandi, convenzioni di codice e come aggiungere un nuovo strumento a SnapOtter."
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: ea717bcba5fa
---

# Guida per sviluppatori {#developer-guide}

Come configurare un ambiente di sviluppo locale e contribuire con codice a SnapOtter.

## Prerequisiti {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (richiesto per Postgres + Redis locali, build dei container e funzionalità AI)
- Git

Python 3.10+ è necessario solo se stai lavorando sul sidecar AI/ML (rimozione dello sfondo, upscaling, OCR).

## Configurazione {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

Questo avvia due dev server:

| Servizio  | URL                      | Note                              |
|----------|--------------------------|------------------------------------|
| Frontend | http://localhost:1349     | Dev server Vite, fa da proxy a /api      |
| Backend  | http://localhost:13490    | API Fastify (accessibile via proxy)   |

Apri http://localhost:1349 nel tuo browser. Accedi con `admin` / `admin`. Ti verrà chiesto di cambiare la password al primo login.

## Struttura del progetto {#project-structure}

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

## Comandi {#commands}

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

## Convenzioni di codice {#code-conventions}

- Virgolette doppie, punto e virgola, indentazione di 2 spazi (imposte da Biome)
- Moduli ES in tutti i workspace
- [Conventional commit](https://www.conventionalcommits.org/) per semantic-release
- Zod per tutta la validazione degli input API
- Nessuna modifica ai file di configurazione di Biome, TypeScript o dell'editor. Correggi il codice, non il linter.

## Database {#database}

PostgreSQL 17 via Drizzle ORM (pg-core). Lo sviluppo locale richiede Postgres e Redis in esecuzione: avviali con:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Questo ti fornisce Postgres sulla porta 5432 e Redis sulla porta 6379. Poi genera e applica le migrazioni:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Lo schema è definito in `apps/api/src/db/schema.ts`. Tabelle: users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles, roles, auditLog.

## Aggiungere un nuovo strumento {#adding-a-new-tool}

Ogni strumento segue lo stesso pattern. Ecco un esempio minimo.

### 1. Route del backend {#_1-backend-route}

Crea `apps/api/src/routes/tools/my-tool.ts`:

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

Poi registralo in `apps/api/src/routes/tools/index.ts`.

### 2. Componente delle impostazioni del frontend {#_2-frontend-settings-component}

Crea `apps/web/src/components/tools/my-tool-settings.tsx`:

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

Poi registralo nel registro degli strumenti del frontend in `apps/web/src/lib/tool-registry.tsx`:

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

Modalità di visualizzazione: `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`.

### 3. Voce i18n {#_3-i18n-entry}

Aggiungi a `packages/shared/src/i18n/en.ts`:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. Test {#_4-tests}

Aggiungi un attributo `data-testid` al tuo pulsante di azione (come mostrato sopra) così i test e2e possono individuarlo in modo affidabile.

## Build Docker {#docker-builds}

Compila l'immagine di produzione completa localmente:

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

Usa le cache mount di BuildKit per rebuild più veloci:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## Variabili d'ambiente {#environment-variables}

Vedi la [Guida alla configurazione](/it/guide/configuration) per l'elenco completo. Quelle principali per lo sviluppo:

| Variabile                    | Predefinito   | Descrizione                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | Abilita/disabilita l'autenticazione                  |
| `DEFAULT_USERNAME`          | `admin`   | Nome utente amministratore predefinito                         |
| `DEFAULT_PASSWORD`          | `admin`   | Password amministratore predefinita                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | Salta il cambio forzato della password (solo CI/dev)      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | Limite di rate delle API al minuto (0 = disabilitato)       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | Dimensione massima di caricamento in MB (0 = illimitata)      |
