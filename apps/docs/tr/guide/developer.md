---
description: "Yerel geliştirme kurulumu, komutlar, kod kuralları ve SnapOtter'a yeni bir araç ekleme."
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: ca6f585e8551
---

# Geliştirici kılavuzu {#developer-guide}

Yerel bir geliştirme ortamı kurma ve SnapOtter'a kod katkısında bulunma.

## Ön koşullar {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (yerel Postgres + Redis, container derlemeleri ve AI özellikleri için gerekli)
- Git

Python 3.10+ yalnızca AI/ML yardımcı işlemi (arka plan kaldırma, ölçek büyütme, OCR) üzerinde çalışıyorsanız gereklidir.

## Kurulum {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

Bu, iki geliştirme sunucusunu başlatır:

| Servis  | URL                      | Notlar                              |
|----------|--------------------------|------------------------------------|
| Ön uç | http://localhost:1349     | Vite geliştirme sunucusu, /api proxy'ler      |
| Arka uç  | http://localhost:13490    | Fastify API (proxy üzerinden erişilir)   |

Tarayıcınızda http://localhost:1349 adresini açın. `admin` / `admin` ile oturum açın. İlk oturum açmada parolayı değiştirmeniz istenir.

## Proje yapısı {#project-structure}

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

## Komutlar {#commands}

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

## Kod kuralları {#code-conventions}

- Çift tırnak, noktalı virgül, 2 boşluk girinti (Biome tarafından zorlanır)
- Tüm workspace'lerde ES modülleri
- Semantic-release için [Conventional commits](https://www.conventionalcommits.org/)
- Tüm API girdi doğrulaması için Zod
- Biome, TypeScript ya da editör yapılandırma dosyalarında değişiklik yok. Linter'ı değil, kodu düzeltin.

## Veritabanı {#database}

Drizzle ORM (pg-core) aracılığıyla PostgreSQL 17. Yerel geliştirme, Postgres ve Redis'in çalışıyor olmasını gerektirir; bunları şununla başlatın:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Bu size 5432 portunda Postgres ve 6379 portunda Redis verir. Ardından migration'ları oluşturup uygulayın:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Şema `apps/api/src/db/schema.ts` dosyasında tanımlanır. Tablolar: users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles, roles, auditLog.

## Yeni bir araç ekleme {#adding-a-new-tool}

Her araç aynı deseni izler. İşte minimal bir örnek.

### 1. Arka uç route'u {#_1-backend-route}

`apps/api/src/routes/tools/my-tool.ts` dosyasını oluşturun:

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

Ardından `apps/api/src/routes/tools/index.ts` dosyasında kaydedin.

### 2. Ön uç ayarları bileşeni {#_2-frontend-settings-component}

`apps/web/src/components/tools/my-tool-settings.tsx` dosyasını oluşturun:

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

Ardından `apps/web/src/lib/tool-registry.tsx` konumundaki ön uç araç kayıt defterinde kaydedin:

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

Görüntüleme modları: `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`.

### 3. i18n girdisi {#_3-i18n-entry}

`packages/shared/src/i18n/en.ts` dosyasına ekleyin:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. Testler {#_4-tests}

E2e testlerin güvenilir biçimde hedefleyebilmesi için eylem düğmenize bir `data-testid` özniteliği ekleyin (yukarıda gösterildiği gibi).

## Docker derlemeleri {#docker-builds}

Tam üretim imajını yerelde derleyin:

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

Daha hızlı yeniden derlemeler için BuildKit önbellek bağlamalarını kullanın:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## Ortam değişkenleri {#environment-variables}

Tam liste için [Yapılandırma kılavuzu](/tr/guide/configuration) bölümüne bakın. Geliştirme için önemli olanlar:

| Değişken                    | Varsayılan   | Açıklama                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | Kimlik doğrulamayı etkinleştir/devre dışı bırak                  |
| `DEFAULT_USERNAME`          | `admin`   | Varsayılan yönetici kullanıcı adı                         |
| `DEFAULT_PASSWORD`          | `admin`   | Varsayılan yönetici parolası                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | Zorunlu parola değişimini atla (yalnızca CI/geliştirme)      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | Dakikada API oran sınırı (0 = devre dışı)       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | MB cinsinden en fazla yükleme boyutu (0 = sınırsız)      |
