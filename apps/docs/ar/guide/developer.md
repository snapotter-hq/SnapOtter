---
description: "إعداد بيئة التطوير المحلية، والأوامر، وأعراف الكود، وكيفية إضافة أداة جديدة إلى SnapOtter."
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: 297ae392c8cf
---

# دليل المطوّر {#developer-guide}

كيفية إعداد بيئة تطوير محلية والمساهمة بالكود في SnapOtter.

## المتطلبات المسبقة {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (مطلوب لـ Postgres + Redis المحليين، وبناء الحاويات، وميزات الذكاء الاصطناعي)
- Git

يلزم Python 3.10+ فقط إذا كنت تعمل على الوحدة الجانبية للذكاء الاصطناعي/تعلّم الآلة (إزالة الخلفية، والتكبير، وOCR).

## الإعداد {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

يبدأ هذا خادمي تطوير:

| الخدمة  | العنوان                      | ملاحظات                              |
|----------|--------------------------|------------------------------------|
| الواجهة الأمامية | http://localhost:1349     | خادم تطوير Vite، يعمل كوكيل لـ /api      |
| الواجهة الخلفية  | http://localhost:13490    | واجهة Fastify API (يُوصَل إليها عبر الوكيل)   |

افتح http://localhost:1349 في متصفحك. سجّل الدخول بـ `admin` / `admin`. سيُطلَب منك تغيير كلمة المرور عند أول تسجيل دخول.

## بنية المشروع {#project-structure}

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

## الأوامر {#commands}

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

## أعراف الكود {#code-conventions}

- علامات اقتباس مزدوجة، وفواصل منقوطة، وإزاحة بمسافتين (يفرضها Biome)
- وحدات ES في جميع مساحات العمل
- [الالتزامات الاصطلاحية (conventional commits)](https://www.conventionalcommits.org/) لـ semantic-release
- Zod للتحقق من كل مدخلات API
- لا تعديلات على ملفات إعدادات Biome أو TypeScript أو المحرر. أصلح الكود، وليس المدقق اللغوي.

## قاعدة البيانات {#database}

PostgreSQL 17 عبر Drizzle ORM (pg-core). يتطلب التطوير المحلي تشغيل Postgres وRedis، ابدأهما بـ:

```bash
docker compose -f docker-compose.dev.yml up -d
```

يمنحك هذا Postgres على المنفذ 5432 وRedis على المنفذ 6379. ثم ولّد عمليات الترحيل وطبّقها:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

المخطط معرَّف في `apps/api/src/db/schema.ts`. الجداول: users، وsessions، وsettings، وjobs، وapiKeys، وpipelines، وteams، وuserFiles، وroles، وauditLog.

## إضافة أداة جديدة {#adding-a-new-tool}

تتبع كل أداة النمط نفسه. إليك مثال مبسّط.

### 1. مسار الواجهة الخلفية {#_1-backend-route}

أنشئ `apps/api/src/routes/tools/my-tool.ts`:

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

ثم سجّله في `apps/api/src/routes/tools/index.ts`.

### 2. مكوّن إعدادات الواجهة الأمامية {#_2-frontend-settings-component}

أنشئ `apps/web/src/components/tools/my-tool-settings.tsx`:

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

ثم سجّله في سجل أدوات الواجهة الأمامية في `apps/web/src/lib/tool-registry.tsx`:

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

أوضاع العرض: `"side-by-side"`، و`"before-after"`، و`"live-preview"`، و`"no-comparison"`، و`"interactive-crop"`، و`"interactive-eraser"`، و`"no-dropzone"`.

### 3. مدخل i18n {#_3-i18n-entry}

أضف إلى `packages/shared/src/i18n/en.ts`:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. الاختبارات {#_4-tests}

أضف سمة `data-testid` إلى زر الإجراء الخاص بك (كما هو موضّح أعلاه) بحيث تتمكن اختبارات e2e من استهدافه بشكل موثوق.

## بناء Docker {#docker-builds}

ابنِ صورة الإنتاج الكاملة محليًا:

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

استخدم عمليات تركيب ذاكرة التخزين المؤقت في BuildKit للحصول على عمليات إعادة بناء أسرع:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## متغيرات البيئة {#environment-variables}

انظر [دليل الإعداد](/ar/guide/configuration) للاطلاع على القائمة الكاملة. المتغيرات الرئيسية للتطوير:

| المتغير                    | الافتراضي   | الوصف                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | تمكين/تعطيل المصادقة                  |
| `DEFAULT_USERNAME`          | `admin`   | اسم المستخدم المسؤول الافتراضي                         |
| `DEFAULT_PASSWORD`          | `admin`   | كلمة مرور المسؤول الافتراضية                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | تخطّي التغيير القسري لكلمة المرور (لـ CI/التطوير فقط)      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | حد معدل API في الدقيقة (0 = معطّل)       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | الحد الأقصى لحجم الرفع بالميغابايت (0 = غير محدود)      |
