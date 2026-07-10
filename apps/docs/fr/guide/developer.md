---
description: "Configuration de l'environnement de développement local, commandes, conventions de code et comment ajouter un nouvel outil à SnapOtter."
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: c1deca322def
---

# Guide du développeur {#developer-guide}

Comment configurer un environnement de développement local et contribuer au code de SnapOtter.

## Prérequis {#prerequisites}

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- [Docker](https://www.docker.com/) (requis pour Postgres + Redis en local, les builds de conteneur et les fonctionnalités d'IA)
- Git

Python 3.10+ n'est nécessaire que si vous travaillez sur le sidecar IA/ML (suppression d'arrière-plan, agrandissement, OCR).

## Configuration {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

Cela démarre deux serveurs de développement :

| Service  | URL                      | Notes                              |
|----------|--------------------------|------------------------------------|
| Frontend | http://localhost:1349     | Serveur de développement Vite, proxifie /api      |
| Backend  | http://localhost:13490    | API Fastify (accédée via le proxy)   |

Ouvrez http://localhost:1349 dans votre navigateur. Connectez-vous avec `admin` / `admin`. Il vous sera demandé de changer le mot de passe à la première connexion.

## Structure du projet {#project-structure}

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

## Commandes {#commands}

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

## Conventions de code {#code-conventions}

- Guillemets doubles, points-virgules, indentation de 2 espaces (imposés par Biome)
- Modules ES dans tous les workspaces
- [Commits conventionnels](https://www.conventionalcommits.org/) pour semantic-release
- Zod pour toute validation d'entrée de l'API
- Aucune modification des fichiers de configuration de Biome, TypeScript ou de l'éditeur. Corrigez le code, pas le linter.

## Base de données {#database}

PostgreSQL 17 via Drizzle ORM (pg-core). Le développement local nécessite que Postgres et Redis soient en cours d'exécution - démarrez-les avec :

```bash
docker compose -f docker-compose.dev.yml up -d
```

Cela vous donne Postgres sur le port 5432 et Redis sur le port 6379. Générez ensuite et appliquez les migrations :

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

Le schéma est défini dans `apps/api/src/db/schema.ts`. Tables : users, sessions, settings, jobs, apiKeys, pipelines, teams, userFiles, roles, auditLog.

## Ajouter un nouvel outil {#adding-a-new-tool}

Chaque outil suit le même schéma. Voici un exemple minimal.

### 1. Route backend {#_1-backend-route}

Créez `apps/api/src/routes/tools/my-tool.ts` :

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

Puis enregistrez-la dans `apps/api/src/routes/tools/index.ts`.

### 2. Composant de paramètres frontend {#_2-frontend-settings-component}

Créez `apps/web/src/components/tools/my-tool-settings.tsx` :

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

Puis enregistrez-le dans le registre d'outils frontend à `apps/web/src/lib/tool-registry.tsx` :

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

Modes d'affichage : `"side-by-side"`, `"before-after"`, `"live-preview"`, `"no-comparison"`, `"interactive-crop"`, `"interactive-eraser"`, `"no-dropzone"`.

### 3. Entrée i18n {#_3-i18n-entry}

Ajoutez à `packages/shared/src/i18n/en.ts` :

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. Tests {#_4-tests}

Ajoutez un attribut `data-testid` à votre bouton d'action (comme montré ci-dessus) afin que les tests e2e puissent le cibler de manière fiable.

## Builds Docker {#docker-builds}

Construisez l'image de production complète en local :

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

Utilisez les cache mounts de BuildKit pour des reconstructions plus rapides :

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## Variables d'environnement {#environment-variables}

Consultez le [Guide de configuration](/fr/guide/configuration) pour la liste complète. Les principales pour le développement :

| Variable                    | Par défaut   | Description                                    |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED`              | `true`    | Activer/désactiver l'authentification                  |
| `DEFAULT_USERNAME`          | `admin`   | Nom d'utilisateur admin par défaut                         |
| `DEFAULT_PASSWORD`          | `admin`   | Mot de passe admin par défaut                         |
| `SKIP_MUST_CHANGE_PASSWORD` | `false`   | Ignorer le changement forcé de mot de passe (CI/dev uniquement)      |
| `RATE_LIMIT_PER_MIN`       | `1000`    | Limite de débit de l'API par minute (0 = désactivée)       |
| `MAX_UPLOAD_SIZE_MB`       | `100`     | Taille d'envoi maximale en Mo (0 = illimité)      |
