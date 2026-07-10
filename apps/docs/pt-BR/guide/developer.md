---
description: "Configuração de ambiente de desenvolvimento local, comandos, convenções de código e como adicionar uma nova ferramenta ao SnapOtter."
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: 3003ce78a10f
---

# Guia do desenvolvedor {#developer-guide}

Como configurar um ambiente de desenvolvimento local e contribuir com código para o SnapOtter.

## Pré-requisitos {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (necessário para Postgres + Redis locais, builds de contêiner e recursos de IA)
- Git

Python 3.10+ só é necessário se você estiver trabalhando no sidecar de IA/ML (remoção de fundo, upscaling, OCR).

## Configuração {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

Isso inicia dois servidores de desenvolvimento:

| Serviço  | URL                      | Observações                        |
|----------|--------------------------|------------------------------------|
| Frontend | http://localhost:1349     | Servidor de dev Vite, faz proxy de /api |
| Backend  | http://localhost:13490    | API Fastify (acessada via proxy)   |

Abra http://localhost:1349 no seu navegador. Faça login com `admin` / `admin`. Você será solicitado a alterar a senha no primeiro login.

## Estrutura do projeto {#project-structure}

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

## Comandos {#commands}

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

## Convenções de código {#code-conventions}

- Aspas duplas, ponto e vírgula, indentação de 2 espaços (imposto pelo Biome)
- Módulos ES em todos os workspaces
- [Conventional commits](https://www.conventionalcommits.org/) para semantic-release
- Zod para toda validação de entrada da API
- Sem modificações nos arquivos de configuração do Biome, do TypeScript ou do editor. Corrija o código, não o linter.

## Banco de dados {#database}

PostgreSQL 17 via Drizzle ORM (pg-core). O desenvolvimento local requer Postgres e Redis em execução - inicie-os com:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Isso lhe dá o Postgres na porta 5432 e o Redis na porta 6379. Depois gere e aplique as migrações:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

O esquema é definido em `apps/api/src/db/schema.ts`. Tabelas: users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles, roles, auditLog.

## Adicionando uma nova ferramenta {#adding-a-new-tool}

Toda ferramenta segue o mesmo padrão. Aqui está um exemplo mínimo.

### 1. Rota do backend {#_1-backend-route}

Crie `apps/api/src/routes/tools/my-tool.ts`:

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

Então registre-a em `apps/api/src/routes/tools/index.ts`.

### 2. Componente de configurações do frontend {#_2-frontend-settings-component}

Crie `apps/web/src/components/tools/my-tool-settings.tsx`:

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

Então registre-o no registro de ferramentas do frontend em `apps/web/src/lib/tool-registry.tsx`:

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

Modos de exibição: `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`.

### 3. Entrada de i18n {#_3-i18n-entry}

Adicione a `packages/shared/src/i18n/en.ts`:

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. Testes {#_4-tests}

Adicione um atributo `data-testid` ao seu botão de ação (como mostrado acima) para que os testes e2e possam localizá-lo de forma confiável.

## Builds do Docker {#docker-builds}

Construa a imagem de produção completa localmente:

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

Use cache mounts do BuildKit para rebuilds mais rápidos:

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## Variáveis de ambiente {#environment-variables}

Veja o [Guia de configuração](/pt-BR/guide/configuration) para a lista completa. As principais para desenvolvimento:

| Variável                    | Padrão    | Descrição                                      |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | Habilitar/desabilitar autenticação             |
| `DEFAULT_USERNAME`          | `admin`   | Nome de usuário admin padrão                   |
| `DEFAULT_PASSWORD`          | `admin`   | Senha admin padrão                             |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | Pular mudança de senha forçada (apenas CI/dev) |
| `RATE_LIMIT_PER_MIN`       | `1000`    | Limite de taxa da API por minuto (0 = desabilitado) |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | Tamanho máximo de upload em MB (0 = ilimitado) |
