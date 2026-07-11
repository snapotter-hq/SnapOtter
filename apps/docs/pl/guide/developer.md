---
description: "Lokalna konfiguracja środowiska developerskiego, komendy, konwencje kodu oraz jak dodać nowe narzędzie do SnapOtter."
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: ed42eca006b5
---

# Przewodnik dla programistów {#developer-guide}

Jak skonfigurować lokalne środowisko developerskie i wnieść wkład w kod SnapOtter.

## Wymagania wstępne {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (wymagany dla lokalnego Postgresa + Redisa, budowania kontenerów i funkcji AI)
- Git

Python 3.10+ jest potrzebny tylko wtedy, gdy pracujesz nad sidecarem AI/ML (usuwanie tła, skalowanie w górę, OCR).

## Konfiguracja {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

Uruchamia to dwa serwery developerskie:

| Usługa  | URL                      | Uwagi                              |
|----------|--------------------------|------------------------------------|
| Frontend | http://localhost:1349     | Serwer dev Vite, przekazuje /api      |
| Backend  | http://localhost:13490    | API Fastify (dostępne przez proxy)   |

Otwórz http://localhost:1349 w przeglądarce. Zaloguj się przez `admin` / `admin`. Przy pierwszym logowaniu zostaniesz poproszony o zmianę hasła.

## Struktura projektu {#project-structure}

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

## Komendy {#commands}

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

## Konwencje kodu {#code-conventions}

- Cudzysłowy podwójne, średniki, wcięcie 2 spacje (wymuszane przez Biome)
- Moduły ES we wszystkich workspace'ach
- [Konwencjonalne commity](https://www.conventionalcommits.org/) dla semantic-release
- Zod dla walidacji wszystkich danych wejściowych API
- Żadnych modyfikacji plików konfiguracyjnych Biome, TypeScript ani edytora. Popraw kod, nie linter.

## Baza danych {#database}

PostgreSQL 17 przez Drizzle ORM (pg-core). Lokalny development wymaga działających Postgresa i Redisa - uruchom je za pomocą:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Daje Ci to Postgresa na porcie 5432 i Redisa na porcie 6379. Następnie wygeneruj i zastosuj migracje:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Schemat jest zdefiniowany w `apps/api/src/db/schema.ts`. Tabele: users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles, roles, auditLog.

## Dodawanie nowego narzędzia {#adding-a-new-tool}

Każde narzędzie stosuje ten sam wzorzec. Oto minimalny przykład.

### 1. Trasa backendu {#_1-backend-route}

Utwórz `apps/api/src/routes/tools/my-tool.ts`:

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

Następnie zarejestruj ją w `apps/api/src/routes/tools/index.ts`.

### 2. Komponent ustawień frontendu {#_2-frontend-settings-component}

Utwórz `apps/web/src/components/tools/my-tool-settings.tsx`:

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

Następnie zarejestruj go w rejestrze narzędzi frontendu w `apps/web/src/lib/tool-registry.tsx`:

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

Tryby wyświetlania: `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`.

### 3. Wpis i18n {#_3-i18n-entry}

Dodaj do `packages/shared/src/i18n/en.ts`:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. Testy {#_4-tests}

Dodaj atrybut `data-testid` do swojego przycisku akcji (jak pokazano powyżej), aby testy e2e mogły go niezawodnie namierzyć.

## Budowanie obrazów Docker {#docker-builds}

Zbuduj pełny obraz produkcyjny lokalnie:

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

Użyj montowań cache BuildKit dla szybszych przebudów:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## Zmienne środowiskowe {#environment-variables}

Pełną listę znajdziesz w [Przewodniku po konfiguracji](/pl/guide/configuration). Kluczowe dla developmentu:

| Zmienna                    | Domyślnie   | Opis                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | Włączenie/wyłączenie uwierzytelniania                  |
| `DEFAULT_USERNAME`          | `admin`   | Domyślna nazwa użytkownika administratora                         |
| `DEFAULT_PASSWORD`          | `admin`   | Domyślne hasło administratora                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | Pomiń wymuszoną zmianę hasła (tylko CI/dev)      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | Limit szybkości API na minutę (0 = wyłączony)       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | Maksymalny rozmiar przesyłania w MB (0 = bez ograniczeń)      |
