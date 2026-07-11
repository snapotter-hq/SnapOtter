---
description: "SnapOtter의 로컬 개발 환경 설정, 명령어, 코드 규칙, 새 도구를 추가하는 방법."
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: aa17bf7b9d5d
---

# 개발자 가이드 {#developer-guide}

로컬 개발 환경을 설정하고 SnapOtter에 코드를 기여하는 방법입니다.

## 사전 요구사항 {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (로컬 Postgres + Redis, 컨테이너 빌드, AI 기능에 필요)
- Git

Python 3.10+는 AI/ML 사이드카(배경 제거, 업스케일링, OCR)를 작업하는 경우에만 필요합니다.

## 설정 {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

이것은 두 개의 개발 서버를 시작합니다:

| 서비스  | URL                      | 비고                              |
|----------|--------------------------|------------------------------------|
| 프론트엔드 | http://localhost:1349     | Vite 개발 서버, /api 프록시      |
| 백엔드  | http://localhost:13490    | Fastify API (프록시를 통해 접근)   |

브라우저에서 http://localhost:1349를 여세요. `admin` / `admin`으로 로그인하세요. 첫 로그인 시 비밀번호를 변경하라는 안내가 표시됩니다.

## 프로젝트 구조 {#project-structure}

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

## 명령어 {#commands}

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

## 코드 규칙 {#code-conventions}

- 큰따옴표, 세미콜론, 2칸 들여쓰기 (Biome로 강제)
- 모든 워크스페이스에서 ES 모듈
- semantic-release를 위한 [Conventional commits](https://www.conventionalcommits.org/)
- 모든 API 입력 검증에 Zod 사용
- Biome, TypeScript, 에디터 설정 파일 수정 금지. 린터가 아니라 코드를 고치세요.

## 데이터베이스 {#database}

Drizzle ORM(pg-core)을 통한 PostgreSQL 17. 로컬 개발에는 Postgres와 Redis 실행이 필요합니다. 다음으로 시작하세요:

```bash
docker compose -f docker-compose.dev.yml up -d
```

이것은 5432 포트의 Postgres와 6379 포트의 Redis를 제공합니다. 그런 다음 마이그레이션을 생성하고 적용하세요:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

스키마는 `apps/api/src/db/schema.ts`에 정의되어 있습니다. 테이블: users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles, roles, auditLog.

## 새 도구 추가하기 {#adding-a-new-tool}

모든 도구는 동일한 패턴을 따릅니다. 다음은 최소 예시입니다.

### 1. 백엔드 라우트 {#_1-backend-route}

`apps/api/src/routes/tools/my-tool.ts`를 생성하세요:

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

그런 다음 `apps/api/src/routes/tools/index.ts`에 등록하세요.

### 2. 프론트엔드 설정 컴포넌트 {#_2-frontend-settings-component}

`apps/web/src/components/tools/my-tool-settings.tsx`를 생성하세요:

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

그런 다음 `apps/web/src/lib/tool-registry.tsx`의 프론트엔드 도구 레지스트리에 등록하세요:

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

표시 모드: `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`.

### 3. i18n 항목 {#_3-i18n-entry}

`packages/shared/src/i18n/en.ts`에 추가하세요:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. 테스트 {#_4-tests}

e2e 테스트가 안정적으로 대상을 지정할 수 있도록 액션 버튼에 `data-testid` 속성을 추가하세요(위에서 보인 대로).

## Docker 빌드 {#docker-builds}

전체 프로덕션 이미지를 로컬에서 빌드하세요:

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

더 빠른 재빌드를 위해 BuildKit 캐시 마운트를 사용하세요:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## 환경 변수 {#environment-variables}

전체 목록은 [구성 가이드](/ko/guide/configuration)를 참고하세요. 개발에 중요한 것들:

| 변수                    | 기본값   | 설명                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | 인증 활성화/비활성화                  |
| `DEFAULT_USERNAME`          | `admin`   | 기본 관리자 사용자명                         |
| `DEFAULT_PASSWORD`          | `admin`   | 기본 관리자 비밀번호                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | 강제 비밀번호 변경 건너뛰기 (CI/개발 전용)      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | 분당 API 속도 제한 (0 = 비활성화)       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | MB 단위 최대 업로드 크기 (0 = 무제한)      |
