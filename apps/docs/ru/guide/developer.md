---
description: "Настройка локальной среды разработки, команды, соглашения по коду и как добавить новый инструмент в SnapOtter."
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: 314cb96c5935
---

# Руководство разработчика {#developer-guide}

Как настроить локальную среду разработки и вносить код в SnapOtter.

## Предварительные требования {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (требуется для локальных Postgres + Redis, сборок контейнеров и AI-функций)
- Git

Python 3.10+ нужен только если вы работаете над AI/ML-сайдкаром (удаление фона, апскейл, OCR).

## Настройка {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

Это запускает два dev-сервера:

| Сервис  | URL                      | Примечания                              |
|----------|--------------------------|------------------------------------|
| Фронтенд | http://localhost:1349     | Dev-сервер Vite, проксирует /api      |
| Бэкенд  | http://localhost:13490    | Fastify API (доступ через прокси)   |

Откройте http://localhost:1349 в браузере. Войдите под `admin` / `admin`. При первом входе вам будет предложено сменить пароль.

## Структура проекта {#project-structure}

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

## Команды {#commands}

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

## Соглашения по коду {#code-conventions}

- Двойные кавычки, точки с запятой, отступ в 2 пробела (обеспечивается Biome)
- ES-модули во всех воркспейсах
- [Conventional commits](https://www.conventionalcommits.org/) для semantic-release
- Zod для всей валидации входных данных API
- Никаких изменений в конфигурационных файлах Biome, TypeScript или редактора. Исправляйте код, а не линтер.

## База данных {#database}

PostgreSQL 17 через Drizzle ORM (pg-core). Локальная разработка требует запущенных Postgres и Redis — запустите их командой:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Это даёт вам Postgres на порту 5432 и Redis на порту 6379. Затем сгенерируйте и примените миграции:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Схема определена в `apps/api/src/db/schema.ts`. Таблицы: users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles, roles, auditLog.

## Добавление нового инструмента {#adding-a-new-tool}

Каждый инструмент следует одному и тому же шаблону. Вот минимальный пример.

### 1. Бэкенд-маршрут {#_1-backend-route}

Создайте `apps/api/src/routes/tools/my-tool.ts`:

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

Затем зарегистрируйте его в `apps/api/src/routes/tools/index.ts`.

### 2. Компонент настроек фронтенда {#_2-frontend-settings-component}

Создайте `apps/web/src/components/tools/my-tool-settings.tsx`:

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

Затем зарегистрируйте его в реестре инструментов фронтенда в `apps/web/src/lib/tool-registry.tsx`:

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

Режимы отображения: `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`.

### 3. Запись i18n {#_3-i18n-entry}

Добавьте в `packages/shared/src/i18n/en.ts`:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. Тесты {#_4-tests}

Добавьте атрибут `data-testid` к кнопке действия (как показано выше), чтобы e2e-тесты могли надёжно нацеливаться на неё.

## Сборки Docker {#docker-builds}

Соберите полный продакшен-образ локально:

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

Используйте кэш-монтирования BuildKit для более быстрых пересборок:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## Переменные окружения {#environment-variables}

Полный список смотрите в [руководстве по конфигурации](/ru/guide/configuration). Ключевые для разработки:

| Переменная                    | По умолчанию   | Описание                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | Включить/отключить аутентификацию                  |
| `DEFAULT_USERNAME`          | `admin`   | Имя пользователя администратора по умолчанию                         |
| `DEFAULT_PASSWORD`          | `admin`   | Пароль администратора по умолчанию                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | Пропустить принудительную смену пароля (только CI/dev)      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | Лимит частоты запросов к API в минуту (0 = отключено)       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | Максимальный размер загрузки в МБ (0 = без ограничений)      |
