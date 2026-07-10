---
description: "本地开发环境搭建、命令、代码约定，以及如何为 SnapOtter 添加新工具。"
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: c9c7c992d6d7
---

# 开发者指南 {#developer-guide}

如何搭建本地开发环境并为 SnapOtter 贡献代码。

## 前置条件 {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+（`corepack enable && corepack prepare pnpm@latest --activate`）
- [Docker](https://www.docker.com/)（本地 Postgres + Redis、容器构建和 AI 功能所必需）
- Git

仅当你在开发 AI/ML sidecar（背景移除、放大、OCR）时才需要 Python 3.10+。

## 搭建环境 {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

这会启动两个开发服务器：

| 服务  | URL                      | 备注                              |
|----------|--------------------------|------------------------------------|
| 前端 | http://localhost:1349     | Vite 开发服务器，代理 /api      |
| 后端  | http://localhost:13490    | Fastify API（通过代理访问）   |

在浏览器中打开 http://localhost:1349。使用 `admin` / `admin` 登录。首次登录时会提示你修改密码。

## 项目结构 {#project-structure}

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

## 命令 {#commands}

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

## 代码约定 {#code-conventions}

- 双引号、分号、2 空格缩进（由 Biome 强制执行）
- 所有工作区均使用 ES 模块
- 用于 semantic-release 的 [Conventional commits](https://www.conventionalcommits.org/)
- 所有 API 输入验证均使用 Zod
- 不修改 Biome、TypeScript 或编辑器配置文件。请修改代码，而不是 linter。

## 数据库 {#database}

通过 Drizzle ORM（pg-core）使用 PostgreSQL 17。本地开发需要运行 Postgres 和 Redis——用以下命令启动它们：

```bash
docker compose -f docker-compose.dev.yml up -d
```

这会为你提供端口 5432 上的 Postgres 和端口 6379 上的 Redis。然后生成并应用迁移：

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

架构定义在 `apps/api/src/db/schema.ts`。表：users、sessions、settings、jobs、apiKeys、pipelines、teams、userFiles、roles、auditLog。

## 添加新工具 {#adding-a-new-tool}

每个工具都遵循相同的模式。下面是一个最小示例。

### 1. 后端路由 {#_1-backend-route}

创建 `apps/api/src/routes/tools/my-tool.ts`：

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

然后在 `apps/api/src/routes/tools/index.ts` 中注册它。

### 2. 前端设置组件 {#_2-frontend-settings-component}

创建 `apps/web/src/components/tools/my-tool-settings.tsx`：

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

然后在 `apps/web/src/lib/tool-registry.tsx` 的前端工具注册表中注册它：

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

显示模式：`"side-by-side"`、`"before-after"`、`"live-preview"`、`"no-comparison"`、`"interactive-crop"`、`"interactive-eraser"`、`"no-dropzone"`。

### 3. i18n 条目 {#_3-i18n-entry}

添加到 `packages/shared/src/i18n/en.ts`：

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. 测试 {#_4-tests}

为你的操作按钮添加一个 `data-testid` 属性（如上所示），以便 e2e 测试能可靠地定位它。

## Docker 构建 {#docker-builds}

在本地构建完整的生产镜像：

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

使用 BuildKit 缓存挂载以加快重新构建：

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## 环境变量 {#environment-variables}

完整列表请参见 [配置指南](/zh-CN/guide/configuration)。开发中的关键项：

| 变量                    | 默认值   | 描述                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | 启用/禁用身份验证                  |
| `DEFAULT_USERNAME`          | `admin`   | 默认管理员用户名                         |
| `DEFAULT_PASSWORD`          | `admin`   | 默认管理员密码                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | 跳过强制修改密码（仅限 CI/开发）      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | 每分钟 API 速率限制（0 = 禁用）       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | 最大上传大小（MB）（0 = 无限制）      |
