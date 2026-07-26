---
description: "การตั้งค่าสภาพแวดล้อมการพัฒนาในเครื่อง คำสั่ง แนวทางการเขียนโค้ด และวิธีเพิ่มเครื่องมือใหม่ใน SnapOtter"
i18n_source_hash: 56acc1bf9a9b
i18n_provenance: machine
i18n_output_hash: a42eaf432db1
i18n_hash_version: 2
---

# คู่มือนักพัฒนา {#developer-guide}

วิธีการตั้งค่าสภาพแวดล้อมการพัฒนาในเครื่องและมีส่วนร่วมโค้ดกับ SnapOtter

## สิ่งที่ต้องมีก่อน {#prerequisites}

- [Node.js](https://nodejs.org/) 22.22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (จำเป็นสำหรับ Postgres + Redis ในเครื่อง, การ build คอนเทนเนอร์ และฟีเจอร์ AI)
- Git

ต้องมี Python 3.11+ เฉพาะเมื่อคุณกำลังทำงานกับ AI/ML sidecar (การลบพื้นหลัง, การขยายภาพ, OCR) เท่านั้น

## การตั้งค่า {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

สิ่งนี้เริ่มต้น dev server สองตัว:

| บริการ  | URL                      | หมายเหตุ                              |
|----------|--------------------------|------------------------------------|
| Frontend | http://localhost:1351     | Vite dev server, proxy /api      |
| Backend  | http://localhost:13490    | Fastify API (เข้าถึงผ่าน proxy)   |

เปิด http://localhost:1351 ในเบราว์เซอร์ของคุณ เข้าสู่ระบบด้วย `admin` / `admin` คุณจะได้รับแจ้งให้เปลี่ยนรหัสผ่านตอนเข้าสู่ระบบครั้งแรก

## โครงสร้างโปรเจกต์ {#project-structure}

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

## คำสั่ง {#commands}

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

## แนวทางการเขียนโค้ด {#code-conventions}

- Double quotes, semicolons, การเยื้อง 2 ช่องว่าง (บังคับใช้โดย Biome)
- ES modules ในทุก workspace
- [Conventional commits](https://www.conventionalcommits.org/) สำหรับ semantic-release
- Zod สำหรับการตรวจสอบอินพุต API ทั้งหมด
- ไม่แก้ไขไฟล์การตั้งค่าของ Biome, TypeScript หรือ editor แก้ไขโค้ด ไม่ใช่ linter

## ฐานข้อมูล {#database}

PostgreSQL 17 ผ่าน Drizzle ORM (pg-core) การพัฒนาในเครื่องต้องมี Postgres และ Redis ทำงานอยู่ - เริ่มต้นด้วย:

```bash
docker compose -f docker-compose.dev.yml up -d
```

สิ่งนี้ให้ Postgres บนพอร์ต 5432 และ Redis บนพอร์ต 6379 จากนั้นสร้างและนำการย้ายข้อมูลมาใช้:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

สคีมาถูกกำหนดไว้ใน `apps/api/src/db/schema.ts` ตาราง: users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles, roles, auditLog

## การเพิ่มเครื่องมือใหม่ {#adding-a-new-tool}

ทุกเครื่องมือทำตามรูปแบบเดียวกัน นี่คือตัวอย่างขั้นต่ำ

### 1. Backend route {#_1-backend-route}

สร้าง `apps/api/src/routes/tools/my-tool.ts`:

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

จากนั้นลงทะเบียนใน `apps/api/src/routes/tools/index.ts`

### 2. คอมโพเนนต์การตั้งค่า Frontend {#_2-frontend-settings-component}

สร้าง `apps/web/src/components/tools/my-tool-settings.tsx`:

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

จากนั้นลงทะเบียนใน frontend tool registry ที่ `apps/web/src/lib/tool-registry.tsx`:

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

โหมดการแสดงผล: `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`

### 3. รายการ i18n {#_3-i18n-entry}

เพิ่มลงใน `packages/shared/src/i18n/en.ts`:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. เทสต์ {#_4-tests}

เพิ่มแอตทริบิวต์ `data-testid` ให้กับปุ่มการกระทำของคุณ (ดังที่แสดงด้านบน) เพื่อให้เทสต์ e2e สามารถกำหนดเป้าหมายได้อย่างน่าเชื่อถือ

## การ build Docker {#docker-builds}

Build อิมเมจโปรดักชันเต็มรูปแบบในเครื่อง:

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

ใช้ BuildKit cache mount เพื่อการ rebuild ที่เร็วขึ้น:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## โดเมนเวอร์ชันวางจำหน่าย {#release-version-domains}

SnapOtter มีเจตนาให้มีโดเมนสามเวอร์ชัน อย่าคัดลอกโดเมนหนึ่งไปยังอีกโดเมนหนึ่งในระหว่างการเผยแพร่:

- เวอร์ชันเผยแพร่ของแอปพลิเคชันครอบคลุม Root Manifest แพ็คเกจพื้นที่ทำงานส่วนตัวทั้งหมด และ `APP_VERSION` Semantic-release ระบุค่านี้ และ `pnpm version:sync <version>` จะอัปเดตทุกพื้นที่ทำงานก่อนที่จะเผยแพร่แอปพลิเคชัน
- OpenAPI `info.version` เป็นสัญญาหลัก API สาธารณะที่มีความเสถียร ข้อมูลจำเพาะที่แปลเป็นภาษาท้องถิ่นทั้งหมดจะยังคงอยู่ใน `<major>.0.0` สำหรับการเปิดตัวแอปพลิเคชันที่เข้ากันได้ และเปลี่ยนแปลงเฉพาะเมื่อสัญญา API ย้ายไปเป็นเวอร์ชันหลักใหม่
- `docker/feature-manifest.json` คง `imageVersion: 2.0.0` ไว้เป็นยุคพื้นที่จัดเก็บข้อมูลบันเดิลฟีเจอร์ดั้งเดิมที่ไม่เปลี่ยนรูปแบบ เส้นทางการเก็บถาวร v2 เหล่านั้นไม่ใช่เวอร์ชันแพ็คเกจแอปพลิเคชัน OCR ที่แม่นยำใช้รูปแบบรันไทม์ v3 และบันทึกที่มาของการเปิดตัวแอปพลิเคชันแยกกัน

`tests/unit/infra/release-version-policy.test.ts` บังคับใช้ขอบเขตเหล่านี้ โดเมนเวอร์ชันใหม่หรือการโยกย้ายจะต้องอัปเดตสัญญานั้นและการออกแบบการโยกย้ายส่วนที่เกี่ยวข้องร่วมกัน
ค่า API อิสระและชุดดั้งเดิมอยู่ใน `config/release-version-policy.json` การซิงโครไนซ์เวอร์ชันแอปพลิเคชันจะต้องไม่เขียนไฟล์นโยบายนั้นซ้ำโดยปริยาย

## ตัวแปรสภาพแวดล้อม {#environment-variables}

ดู [คู่มือการกำหนดค่า](/th/guide/configuration) สำหรับรายการทั้งหมด ตัวแปรสำคัญสำหรับการพัฒนา:

| ตัวแปร                    | ค่าเริ่มต้น   | คำอธิบาย                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | เปิด/ปิดการยืนยันตัวตน                  |
| `DEFAULT_USERNAME`          | `admin`   | ชื่อผู้ใช้ admin เริ่มต้น                         |
| `DEFAULT_PASSWORD`          | `admin`   | รหัสผ่าน admin เริ่มต้น                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | ข้ามการบังคับเปลี่ยนรหัสผ่าน (CI/dev เท่านั้น)      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | ขีดจำกัดอัตรา API ต่อนาที (0 = ปิด)       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | ขนาดอัปโหลดสูงสุดเป็น MB (0 = ไม่จำกัด)      |
