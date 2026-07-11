---
description: "Configuración del entorno de desarrollo local, comandos, convenciones de código y cómo añadir una nueva herramienta a SnapOtter."
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: 572206416dc1
---

# Guía del desarrollador {#developer-guide}

Cómo configurar un entorno de desarrollo local y contribuir con código a SnapOtter.

## Requisitos previos {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (requerido para Postgres + Redis locales, construcciones de contenedores y funciones de IA)
- Git

Python 3.10+ solo es necesario si trabajas en el sidecar de IA/ML (eliminación de fondo, escalado, OCR).

## Configuración {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

Esto inicia dos servidores de desarrollo:

| Servicio  | URL                      | Notas                              |
|----------|--------------------------|------------------------------------|
| Frontend | http://localhost:1349     | Servidor de desarrollo Vite, hace proxy de /api      |
| Backend  | http://localhost:13490    | API de Fastify (accedida vía proxy)   |

Abre http://localhost:1349 en tu navegador. Inicia sesión con `admin` / `admin`. Se te pedirá que cambies la contraseña en el primer inicio de sesión.

## Estructura del proyecto {#project-structure}

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

## Comandos {#commands}

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

## Convenciones de código {#code-conventions}

- Comillas dobles, punto y coma, indentación de 2 espacios (aplicado por Biome)
- Módulos ES en todos los workspaces
- [Conventional commits](https://www.conventionalcommits.org/) para semantic-release
- Zod para toda la validación de entrada de la API
- Sin modificaciones a los archivos de configuración de Biome, TypeScript o del editor. Corrige el código, no el linter.

## Base de datos {#database}

PostgreSQL 17 mediante Drizzle ORM (pg-core). El desarrollo local requiere que Postgres y Redis estén en ejecución; inícialos con:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Esto te proporciona Postgres en el puerto 5432 y Redis en el puerto 6379. Luego genera y aplica las migraciones:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

El esquema se define en `apps/api/src/db/schema.ts`. Tablas: users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles, roles, auditLog.

## Añadir una nueva herramienta {#adding-a-new-tool}

Cada herramienta sigue el mismo patrón. Aquí tienes un ejemplo mínimo.

### 1. Ruta del backend {#_1-backend-route}

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

Luego regístrala en `apps/api/src/routes/tools/index.ts`.

### 2. Componente de ajustes del frontend {#_2-frontend-settings-component}

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

Luego regístralo en el registro de herramientas del frontend en `apps/web/src/lib/tool-registry.tsx`:

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

Modos de visualización: `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`.

### 3. Entrada de i18n {#_3-i18n-entry}

Añade a `packages/shared/src/i18n/en.ts`:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. Pruebas {#_4-tests}

Añade un atributo `data-testid` a tu botón de acción (como se muestra arriba) para que las pruebas e2e puedan localizarlo de forma fiable.

## Construcciones de Docker {#docker-builds}

Construye la imagen de producción completa localmente:

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

Usa las cache mounts de BuildKit para reconstrucciones más rápidas:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## Variables de entorno {#environment-variables}

Consulta la [Guía de configuración](/es/guide/configuration) para la lista completa. Las clave para el desarrollo:

| Variable                    | Por defecto   | Descripción                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | Habilitar/deshabilitar la autenticación                  |
| `DEFAULT_USERNAME`          | `admin`   | Nombre de usuario del administrador por defecto                         |
| `DEFAULT_PASSWORD`          | `admin`   | Contraseña del administrador por defecto                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | Omitir el cambio de contraseña forzado (solo CI/dev)      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | Límite de tasa de API por minuto (0 = deshabilitado)       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | Tamaño máximo de subida en MB (0 = ilimitado)      |
