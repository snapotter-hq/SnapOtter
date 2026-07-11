---
description: "Penyiapan pengembangan lokal, perintah, konvensi kode, dan cara menambahkan tool baru ke SnapOtter."
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: 3702cfaac3e7
---

# Panduan developer {#developer-guide}

Cara menyiapkan lingkungan pengembangan lokal dan berkontribusi kode ke SnapOtter.

## Prasyarat {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (diperlukan untuk Postgres + Redis lokal, build kontainer, dan fitur AI)
- Git

Python 3.10+ hanya diperlukan jika Anda mengerjakan sidecar AI/ML (penghapusan latar belakang, upscaling, OCR).

## Penyiapan {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

Ini memulai dua server dev:

| Layanan  | URL                      | Catatan                              |
|----------|--------------------------|------------------------------------|
| Frontend | http://localhost:1349     | Server dev Vite, mem-proxy /api      |
| Backend  | http://localhost:13490    | Fastify API (diakses melalui proxy)   |

Buka http://localhost:1349 di browser Anda. Login dengan `admin` / `admin`. Anda akan diminta untuk mengubah kata sandi saat login pertama.

## Struktur proyek {#project-structure}

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

## Perintah {#commands}

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

## Konvensi kode {#code-conventions}

- Tanda kutip ganda, titik koma, indentasi 2 spasi (ditegakkan oleh Biome)
- ES module di semua workspace
- [Conventional commits](https://www.conventionalcommits.org/) untuk semantic-release
- Zod untuk semua validasi input API
- Tidak ada modifikasi pada file konfigurasi Biome, TypeScript, atau editor. Perbaiki kodenya, bukan linter-nya.

## Database {#database}

PostgreSQL 17 melalui Drizzle ORM (pg-core). Dev lokal memerlukan Postgres dan Redis yang berjalan - mulai keduanya dengan:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Ini memberi Anda Postgres pada port 5432 dan Redis pada port 6379. Kemudian buat dan terapkan migrasi:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Skema didefinisikan di `apps/api/src/db/schema.ts`. Tabel: users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles, roles, auditLog.

## Menambahkan tool baru {#adding-a-new-tool}

Setiap tool mengikuti pola yang sama. Berikut contoh minimal.

### 1. Route backend {#_1-backend-route}

Buat `apps/api/src/routes/tools/my-tool.ts`:

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

Kemudian daftarkan di `apps/api/src/routes/tools/index.ts`.

### 2. Komponen pengaturan frontend {#_2-frontend-settings-component}

Buat `apps/web/src/components/tools/my-tool-settings.tsx`:

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

Kemudian daftarkan di registry tool frontend di `apps/web/src/lib/tool-registry.tsx`:

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

Mode tampilan: `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`.

### 3. Entri i18n {#_3-i18n-entry}

Tambahkan ke `packages/shared/src/i18n/en.ts`:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. Tes {#_4-tests}

Tambahkan atribut `data-testid` ke tombol aksi Anda (seperti ditunjukkan di atas) agar tes e2e dapat menargetkannya secara andal.

## Build Docker {#docker-builds}

Bangun image produksi lengkap secara lokal:

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

Gunakan cache mount BuildKit untuk build ulang yang lebih cepat:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## Variabel lingkungan {#environment-variables}

Lihat [Panduan Konfigurasi](/id/guide/configuration) untuk daftar lengkap. Yang penting untuk pengembangan:

| Variabel                    | Default   | Deskripsi                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | Aktifkan/nonaktifkan autentikasi                  |
| `DEFAULT_USERNAME`          | `admin`   | Nama pengguna admin default                         |
| `DEFAULT_PASSWORD`          | `admin`   | Kata sandi admin default                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | Lewati perubahan kata sandi paksa (hanya CI/dev)      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | Batas laju API per menit (0 = dinonaktifkan)       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | Ukuran unggah maksimum dalam MB (0 = tak terbatas)      |
