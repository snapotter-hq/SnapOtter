---
description: "SnapOtter 的本機開發環境設定、指令、程式碼慣例，以及如何新增工具。"
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: 64a00be99b89
---

# 開發者指南 {#developer-guide}

如何設定本機開發環境，並為 SnapOtter 貢獻程式碼。

## 先決條件 {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+（`corepack enable && corepack prepare pnpm@latest --activate`）
- [Docker](https://www.docker.com/)（本機 Postgres + Redis、容器建置與 AI 功能所必需）
- Git

只有在你要處理 AI/ML 附屬程序（去背、放大、OCR）時，才需要 Python 3.10+。

## 設定 {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

這會啟動兩個開發伺服器：

| 服務  | URL                      | 說明                              |
|----------|--------------------------|------------------------------------|
| 前端 | http://localhost:1349     | Vite 開發伺服器，代理 /api      |
| 後端  | http://localhost:13490    | Fastify API（透過代理存取）   |

在瀏覽器中開啟 http://localhost:1349。以 `admin` / `admin` 登入。你會在首次登入時被提示變更密碼。

## 專案結構 {#project-structure}

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

## 指令 {#commands}

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

## 程式碼慣例 {#code-conventions}

- 雙引號、分號、2 格縮排（由 Biome 強制）
- 所有工作區皆使用 ES 模組
- 供 semantic-release 使用的[慣例式提交](https://www.conventionalcommits.org/)
- 所有 API 輸入驗證皆使用 Zod
- 不修改 Biome、TypeScript 或編輯器設定檔。修正程式碼，而非 linter。

## 資料庫 {#database}

透過 Drizzle ORM（pg-core）使用 PostgreSQL 17。本機開發需要 Postgres 與 Redis 執行中 - 以下列指令啟動它們：

```bash
docker compose -f docker-compose.dev.yml up -d
```

這會在 5432 埠提供 Postgres，並在 6379 埠提供 Redis。接著產生並套用遷移：

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

結構定義於 `apps/api/src/db/schema.ts`。資料表：users、sessions、settings、jobs、apiKeys、pipelines、teams、userFiles、roles、auditLog。

## 新增工具 {#adding-a-new-tool}

每個工具都遵循相同的模式。以下是一個最小範例。

### 1. 後端路由 {#_1-backend-route}

建立 `apps/api/src/routes/tools/my-tool.ts`：

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

然後在 `apps/api/src/routes/tools/index.ts` 中註冊它。

### 2. 前端設定元件 {#_2-frontend-settings-component}

建立 `apps/web/src/components/tools/my-tool-settings.tsx`：

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

然後在位於 `apps/web/src/lib/tool-registry.tsx` 的前端工具登錄表中註冊它：

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

顯示模式：`"side-by-side"`、`"before-after"`、`"live-preview"`、`"no-comparison"`、`"interactive-crop"`、`"interactive-eraser"`、`"no-dropzone"`。

### 3. i18n 條目 {#_3-i18n-entry}

新增到 `packages/shared/src/i18n/en.ts`：

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. 測試 {#_4-tests}

為你的動作按鈕新增一個 `data-testid` 屬性（如上所示），這樣 e2e 測試就能可靠地鎖定它。

## Docker 建置 {#docker-builds}

在本機建置完整的生產映像檔：

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

使用 BuildKit 快取掛載以加快重新建置：

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## 環境變數 {#environment-variables}

完整清單請見[設定指南](/zh-TW/guide/configuration)。開發時的關鍵變數：

| 變數                    | 預設   | 描述                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | 啟用／停用驗證                  |
| `DEFAULT_USERNAME`          | `admin`   | 預設管理員使用者名稱                         |
| `DEFAULT_PASSWORD`          | `admin`   | 預設管理員密碼                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | 略過強制變更密碼（僅供 CI／開發）      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | 每分鐘的 API 速率限制（0 = 停用）       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | 最大上傳大小（MB）（0 = 無限制）      |
