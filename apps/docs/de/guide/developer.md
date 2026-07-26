---
description: "Lokales Entwicklungs-Setup, Befehle, Code-Konventionen und wie man ein neues Tool zu SnapOtter hinzufügt."
i18n_source_hash: 56acc1bf9a9b
i18n_provenance: machine
i18n_output_hash: 1aff0a0fd957
i18n_hash_version: 2
---

# Entwicklerleitfaden {#developer-guide}

Wie man eine lokale Entwicklungsumgebung einrichtet und Code zu SnapOtter beiträgt.

## Voraussetzungen {#prerequisites}

- [Node.js](https://nodejs.org/) 22.22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (erforderlich für lokales Postgres + Redis, Container-Builds und AI-Features)
- Git

Python 3.11+ wird nur benötigt, wenn du am AI/ML-Sidecar arbeitest (Hintergrundentfernung, Hochskalierung, OCR).

## Setup {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

Dies startet zwei Dev-Server:

| Dienst  | URL                      | Hinweise                              |
|----------|--------------------------|------------------------------------|
| Frontend | http://localhost:1351     | Vite-Dev-Server, proxyt /api      |
| Backend  | http://localhost:13490    | Fastify-API (über Proxy erreichbar)   |

Öffne http://localhost:1351 in deinem Browser. Melde dich mit `admin` / `admin` an. Bei der ersten Anmeldung wirst du aufgefordert, das Passwort zu ändern.

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

## Befehle {#commands}

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

## Code-Konventionen {#code-conventions}

- Doppelte Anführungszeichen, Semikolons, Einrückung mit 2 Leerzeichen (durch Biome erzwungen)
- ES-Module in allen Workspaces
- [Conventional Commits](https://www.conventionalcommits.org/) für semantic-release
- Zod für alle API-Eingabevalidierungen
- Keine Änderungen an Biome-, TypeScript- oder Editor-Konfigurationsdateien. Behebe den Code, nicht den Linter.

## Datenbank {#database}

PostgreSQL 17 über Drizzle ORM (pg-core). Die lokale Entwicklung erfordert ein laufendes Postgres und Redis - starte sie mit:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Dies stellt dir Postgres auf Port 5432 und Redis auf Port 6379 bereit. Generiere und wende dann die Migrationen an:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Das Schema ist in `apps/api/src/db/schema.ts` definiert. Tabellen: users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles, roles, auditLog.

## Ein neues Tool hinzufügen {#adding-a-new-tool}

Jedes Tool folgt demselben Muster. Hier ein minimales Beispiel.

### 1. Backend-Route {#_1-backend-route}

Erstelle `apps/api/src/routes/tools/my-tool.ts`:

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

Registriere es dann in `apps/api/src/routes/tools/index.ts`.

### 2. Frontend-Einstellungskomponente {#_2-frontend-settings-component}

Erstelle `apps/web/src/components/tools/my-tool-settings.tsx`:

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

Registriere es dann in der Frontend-Tool-Registry unter `apps/web/src/lib/tool-registry.tsx`:

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

Anzeigemodi: `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`.

### 3. i18n-Eintrag {#_3-i18n-entry}

Füge zu `packages/shared/src/i18n/en.ts` hinzu:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. Tests {#_4-tests}

Füge deinem Aktions-Button ein `data-testid`-Attribut hinzu (wie oben gezeigt), damit e2e-Tests ihn zuverlässig ansteuern können.

## Docker-Builds {#docker-builds}

Baue das vollständige Produktions-Image lokal:

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

Verwende BuildKit-Cache-Mounts für schnellere Rebuilds:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## Release-Versionsdomänen {#release-version-domains}

SnapOtter verfügt absichtlich über drei Versionsdomänen. Kopieren Sie während einer Veröffentlichung nicht eine Domäne in eine andere:

- Die Anwendungsfreigabeversion deckt das Root-Manifest, alle privaten Arbeitsbereichspakete und `APP_VERSION` ab. Semantic-release stellt diesen Wert bereit und `pnpm version:sync <version>` aktualisiert jeden Arbeitsbereich vor einer Anwendungsfreigabe.
- OpenAPI `info.version` ist der stabile öffentliche API-Großvertrag. Alle lokalisierten Spezifikationen bleiben für kompatible Anwendungsversionen auf `<major>.0.0` und ändern sich nur, wenn der API-Vertrag auf eine neue Hauptversion umgestellt wird.
- `docker/feature-manifest.json` behält `imageVersion: 2.0.0` als unveränderliche Legacy-Feature-Bundle-Speicherepoche bei. Bei diesen v2-Archivpfaden handelt es sich nicht um Anwendungspaketversionen. Accurate OCR verwendet das Laufzeitformat v3 und zeichnet die Herkunft der Anwendungsversion separat auf.

`tests/unit/infra/release-version-policy.test.ts` erzwingt diese Grenzen. Eine neue Versionsdomäne oder Migration muss diesen Vertrag und das relevante Artefaktmigrationsdesign zusammen aktualisieren.
Die unabhängigen API- und Legacy-Bundle-Werte befinden sich in `config/release-version-policy.json`; Die Synchronisierung der Anwendungsversion darf diese Richtliniendatei niemals implizit neu schreiben.

## Umgebungsvariablen {#environment-variables}

Die vollständige Liste findest du im [Konfigurationsleitfaden](/de/guide/configuration). Wichtige für die Entwicklung:

| Variable                    | Standard   | Beschreibung                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | Authentifizierung aktivieren/deaktivieren                  |
| `DEFAULT_USERNAME`          | `admin`   | Standard-Admin-Benutzername                         |
| `DEFAULT_PASSWORD`          | `admin`   | Standard-Admin-Passwort                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | Erzwungene Passwortänderung überspringen (nur CI/Dev)      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | API-Ratenlimit pro Minute (0 = deaktiviert)       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | Maximale Upload-Größe in MB (0 = unbegrenzt)      |
