---
description: "SnapOtter में स्थानीय विकास सेटअप, कमांड, कोड परंपराएँ, और एक नया टूल कैसे जोड़ें।"
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: c6b1b3537584
---

# डेवलपर गाइड {#developer-guide}

एक स्थानीय विकास वातावरण कैसे सेट करें और SnapOtter में कोड योगदान कैसे करें।

## पूर्वापेक्षाएँ {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (स्थानीय Postgres + Redis, कंटेनर बिल्ड, और AI फ़ीचर के लिए आवश्यक)
- Git

Python 3.10+ केवल तभी आवश्यक है जब आप AI/ML साइडकार (बैकग्राउंड हटाना, अपस्केलिंग, OCR) पर काम कर रहे हों।

## सेटअप {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

यह दो डेव सर्वर शुरू करता है:

| सेवा  | URL                      | नोट्स                              |
|----------|--------------------------|------------------------------------|
| फ़्रंटएंड | http://localhost:1349     | Vite डेव सर्वर, /api को प्रॉक्सी करता है      |
| बैकएंड  | http://localhost:13490    | Fastify API (प्रॉक्सी के माध्यम से एक्सेस)   |

अपने ब्राउज़र में http://localhost:1349 खोलें। `admin` / `admin` के साथ लॉगिन करें। पहले लॉगिन पर आपको पासवर्ड बदलने के लिए कहा जाएगा।

## प्रोजेक्ट संरचना {#project-structure}

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

## कमांड {#commands}

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

## कोड परंपराएँ {#code-conventions}

- डबल कोट्स, सेमीकोलन, 2-स्पेस इंडेंटेशन (Biome द्वारा लागू)
- सभी वर्कस्पेस में ES modules
- semantic-release के लिए [Conventional commits](https://www.conventionalcommits.org/)
- सभी API इनपुट सत्यापन के लिए Zod
- Biome, TypeScript, या एडिटर कॉन्फ़िग फ़ाइलों में कोई बदलाव नहीं। कोड ठीक करें, लिंटर नहीं।

## डेटाबेस {#database}

Drizzle ORM (pg-core) के माध्यम से PostgreSQL 17. स्थानीय डेव के लिए Postgres और Redis का चलना आवश्यक है - उन्हें इसके साथ शुरू करें:

```bash
docker compose -f docker-compose.dev.yml up -d
```

यह आपको पोर्ट 5432 पर Postgres और पोर्ट 6379 पर Redis देता है। फिर माइग्रेशन जनरेट और लागू करें:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

स्कीमा `apps/api/src/db/schema.ts` में परिभाषित है। टेबल: users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles, roles, auditLog।

## एक नया टूल जोड़ना {#adding-a-new-tool}

हर टूल एक ही पैटर्न का अनुसरण करता है। यहाँ एक न्यूनतम उदाहरण है।

### 1. बैकएंड रूट {#_1-backend-route}

`apps/api/src/routes/tools/my-tool.ts` बनाएँ:

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

फिर इसे `apps/api/src/routes/tools/index.ts` में रजिस्टर करें।

### 2. फ़्रंटएंड सेटिंग्स कंपोनेंट {#_2-frontend-settings-component}

`apps/web/src/components/tools/my-tool-settings.tsx` बनाएँ:

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

फिर इसे `apps/web/src/lib/tool-registry.tsx` पर फ़्रंटएंड टूल रजिस्ट्री में रजिस्टर करें:

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

डिस्प्ले मोड: `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`।

### 3. i18n प्रविष्टि {#_3-i18n-entry}

`packages/shared/src/i18n/en.ts` में जोड़ें:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. टेस्ट {#_4-tests}

अपने एक्शन बटन में एक `data-testid` एट्रिब्यूट जोड़ें (जैसा ऊपर दिखाया गया है) ताकि e2e टेस्ट इसे विश्वसनीय रूप से लक्षित कर सकें।

## Docker बिल्ड {#docker-builds}

पूर्ण प्रोडक्शन इमेज को स्थानीय रूप से बनाएँ:

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

तेज़ रीबिल्ड के लिए BuildKit कैश माउंट का उपयोग करें:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## एनवायरनमेंट वेरिएबल {#environment-variables}

पूर्ण सूची के लिए [Configuration guide](/hi/guide/configuration) देखें। विकास के लिए मुख्य वेरिएबल:

| वेरिएबल                    | डिफ़ॉल्ट   | विवरण                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | प्रमाणीकरण सक्षम/अक्षम करें                  |
| `DEFAULT_USERNAME`          | `admin`   | डिफ़ॉल्ट एडमिन उपयोगकर्ता नाम                         |
| `DEFAULT_PASSWORD`          | `admin`   | डिफ़ॉल्ट एडमिन पासवर्ड                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | अनिवार्य पासवर्ड बदलाव छोड़ें (केवल CI/डेव)      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | प्रति मिनट API दर सीमा (0 = अक्षम)       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | MB में अधिकतम अपलोड आकार (0 = असीमित)      |
