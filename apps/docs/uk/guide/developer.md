---
description: "Локальне налаштування розробки, команди, конвенції коду та як додати новий інструмент до SnapOtter."
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: 4a74c237b20d
---

# Посібник для розробників {#developer-guide}

Як налаштувати локальне середовище розробки та зробити внесок коду до SnapOtter.

## Передумови {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (потрібен для локальних Postgres + Redis, збірок контейнерів та функцій ШІ)
- Git

Python 3.10+ потрібен лише якщо ви працюєте над сайдкаром ШІ/ML (видалення фону, апскейлінг, OCR).

## Налаштування {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

Це запускає два сервери розробки:

| Сервіс  | URL                      | Примітки                              |
|----------|--------------------------|------------------------------------|
| Фронтенд | http://localhost:1349     | Сервер розробки Vite, проксіює /api      |
| Бекенд  | http://localhost:13490    | Fastify API (доступ через проксі)   |

Відкрийте http://localhost:1349 у вашому браузері. Увійдіть з `admin` / `admin`. Вам буде запропоновано змінити пароль під час першого входу.

## Структура проєкту {#project-structure}

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

## Команди {#commands}

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

## Конвенції коду {#code-conventions}

- Подвійні лапки, крапки з комою, відступ у 2 пробіли (забезпечується Biome)
- ES-модулі в усіх воркспейсах
- [Conventional commits](https://www.conventionalcommits.org/) для semantic-release
- Zod для всієї валідації вхідних даних API
- Жодних змін у файлах конфігурації Biome, TypeScript чи редактора. Виправляйте код, а не лінтер.

## База даних {#database}

PostgreSQL 17 через Drizzle ORM (pg-core). Локальна розробка потребує запущених Postgres та Redis - запустіть їх за допомогою:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Це дає вам Postgres на порту 5432 та Redis на порту 6379. Потім згенеруйте та застосуйте міграції:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Схему визначено у `apps/api/src/db/schema.ts`. Таблиці: users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles, roles, auditLog.

## Додавання нового інструмента {#adding-a-new-tool}

Кожен інструмент дотримується того самого патерну. Ось мінімальний приклад.

### 1. Бекенд-маршрут {#_1-backend-route}

Створіть `apps/api/src/routes/tools/my-tool.ts`:

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

Потім зареєструйте його у `apps/api/src/routes/tools/index.ts`.

### 2. Компонент фронтенд-налаштувань {#_2-frontend-settings-component}

Створіть `apps/web/src/components/tools/my-tool-settings.tsx`:

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

Потім зареєструйте його у реєстрі інструментів фронтенду за адресою `apps/web/src/lib/tool-registry.tsx`:

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

Режими відображення: `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`.

### 3. Запис i18n {#_3-i18n-entry}

Додайте до `packages/shared/src/i18n/en.ts`:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. Тести {#_4-tests}

Додайте атрибут `data-testid` до вашої кнопки дії (як показано вище), щоб e2e-тести могли надійно на неї націлюватися.

## Збірки Docker {#docker-builds}

Зберіть повний продакшн-образ локально:

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

Використовуйте кеш-монтування BuildKit для швидших перезбірок:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## Змінні середовища {#environment-variables}

Повний список дивіться у [Посібнику з конфігурації](/uk/guide/configuration). Ключові для розробки:

| Змінна                    | За замовчуванням   | Опис                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | Увімкнути/вимкнути автентифікацію                  |
| `DEFAULT_USERNAME`          | `admin`   | Ім'я адміністратора за замовчуванням                         |
| `DEFAULT_PASSWORD`          | `admin`   | Пароль адміністратора за замовчуванням                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | Пропустити примусову зміну пароля (лише CI/розробка)      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | Ліміт швидкості API за хвилину (0 = вимкнено)       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | Максимальний розмір завантаження в МБ (0 = необмежено)      |
