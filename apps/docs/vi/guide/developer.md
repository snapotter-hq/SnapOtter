---
description: "Thiết lập môi trường phát triển cục bộ, lệnh, quy ước mã, và cách thêm một công cụ mới vào SnapOtter."
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: 76e4e13bc933
---

# Hướng dẫn dành cho nhà phát triển {#developer-guide}

Cách thiết lập một môi trường phát triển cục bộ và đóng góp mã cho SnapOtter.

## Điều kiện tiên quyết {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (bắt buộc cho Postgres + Redis cục bộ, dựng container, và các tính năng AI)
- Git

Python 3.10+ chỉ cần thiết nếu bạn đang làm việc trên sidecar AI/ML (xóa nền, phóng đại, OCR).

## Thiết lập {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

Điều này khởi động hai máy chủ dev:

| Dịch vụ  | URL                      | Ghi chú                              |
|----------|--------------------------|------------------------------------|
| Frontend | http://localhost:1349     | Máy chủ dev Vite, proxy /api      |
| Backend  | http://localhost:13490    | API Fastify (truy cập qua proxy)   |

Mở http://localhost:1349 trong trình duyệt của bạn. Đăng nhập bằng `admin` / `admin`. Bạn sẽ được nhắc đổi mật khẩu ở lần đăng nhập đầu tiên.

## Cấu trúc dự án {#project-structure}

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

## Lệnh {#commands}

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

## Quy ước mã {#code-conventions}

- Dấu nháy kép, dấu chấm phẩy, thụt lề 2 khoảng trắng (được ép buộc bởi Biome)
- ES module trong tất cả các workspace
- [Conventional commits](https://www.conventionalcommits.org/) cho semantic-release
- Zod cho tất cả việc xác thực đầu vào API
- Không sửa đổi các tệp cấu hình Biome, TypeScript, hoặc trình soạn thảo. Hãy sửa mã, không sửa linter.

## Cơ sở dữ liệu {#database}

PostgreSQL 17 qua Drizzle ORM (pg-core). Dev cục bộ yêu cầu Postgres và Redis đang chạy - hãy khởi động chúng bằng:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Điều này cung cấp cho bạn Postgres trên cổng 5432 và Redis trên cổng 6379. Sau đó tạo và áp dụng các di trú:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Lược đồ được định nghĩa trong `apps/api/src/db/schema.ts`. Các bảng: users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles, roles, auditLog.

## Thêm một công cụ mới {#adding-a-new-tool}

Mọi công cụ đều tuân theo cùng một mẫu. Đây là một ví dụ tối giản.

### 1. Route backend {#_1-backend-route}

Tạo `apps/api/src/routes/tools/my-tool.ts`:

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

Rồi đăng ký nó trong `apps/api/src/routes/tools/index.ts`.

### 2. Thành phần thiết lập frontend {#_2-frontend-settings-component}

Tạo `apps/web/src/components/tools/my-tool-settings.tsx`:

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

Rồi đăng ký nó trong tool registry của frontend tại `apps/web/src/lib/tool-registry.tsx`:

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

Các chế độ hiển thị: `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`.

### 3. Mục i18n {#_3-i18n-entry}

Thêm vào `packages/shared/src/i18n/en.ts`:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. Kiểm thử {#_4-tests}

Thêm một thuộc tính `data-testid` vào nút hành động của bạn (như đã trình bày ở trên) để các kiểm thử e2e có thể nhắm vào nó một cách đáng tin cậy.

## Dựng Docker {#docker-builds}

Dựng image sản xuất đầy đủ ở cục bộ:

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

Dùng các cache mount BuildKit để dựng lại nhanh hơn:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## Biến môi trường {#environment-variables}

Xem [Hướng dẫn cấu hình](/vi/guide/configuration) để biết danh sách đầy đủ. Những biến quan trọng cho việc phát triển:

| Biến                    | Mặc định   | Mô tả                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | Bật/tắt xác thực                  |
| `DEFAULT_USERNAME`          | `admin`   | Tên người dùng quản trị mặc định                         |
| `DEFAULT_PASSWORD`          | `admin`   | Mật khẩu quản trị mặc định                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | Bỏ qua việc buộc đổi mật khẩu (chỉ CI/dev)      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | Giới hạn tốc độ API mỗi phút (0 = tắt)       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | Kích thước tải lên tối đa tính bằng MB (0 = không giới hạn)      |
