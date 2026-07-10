---
description: "ローカル開発環境のセットアップ、コマンド、コード規約、そして SnapOtter に新しいツールを追加する方法。"
i18n_source_hash: cb03724d2829
i18n_provenance: human
i18n_output_hash: 8034bc92f69d
---

# 開発者ガイド {#developer-guide}

ローカル開発環境をセットアップし、SnapOtter にコードを貢献する方法。

## 前提条件 {#prerequisites}

- [Node.js](https://nodejs.org/) 22 以上
- [pnpm](https://pnpm.io/) 9 以上（`corepack enable && corepack prepare pnpm@latest --activate`）
- [Docker](https://www.docker.com/)（ローカルの Postgres + Redis、コンテナビルド、AI 機能に必要）
- Git

Python 3.10 以上は、AI/ML サイドカー（背景除去、アップスケール、OCR）に取り組む場合にのみ必要です。

## セットアップ {#setup}

```bash
git clone https://github.com/snapotter-hq/snapotter.git
cd snapotter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

これにより 2 つの開発サーバーが起動します。

| サービス | URL | 備考 |
|----------|--------------------------|------------------------------------|
| フロントエンド | http://localhost:1349 | Vite 開発サーバー、/api をプロキシ |
| バックエンド | http://localhost:13490 | Fastify API（プロキシ経由でアクセス） |

ブラウザで http://localhost:1349 を開きます。`admin` / `admin` でログインします。初回ログイン時にパスワードの変更を求められます。

## プロジェクト構成 {#project-structure}

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

## コマンド {#commands}

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

## コード規約 {#code-conventions}

- ダブルクォート、セミコロン、2 スペースインデント（Biome で強制）
- すべてのワークスペースで ES モジュール
- semantic-release 用の [Conventional Commits](https://www.conventionalcommits.org/)
- すべての API 入力検証に Zod
- Biome、TypeScript、エディタの設定ファイルは変更しないこと。リンターではなくコードを修正してください。

## データベース {#database}

Drizzle ORM（pg-core）経由の PostgreSQL 17。ローカル開発では Postgres と Redis の起動が必要です。次で起動します。

```bash
docker compose -f docker-compose.dev.yml up -d
```

これにより、Postgres がポート 5432 で、Redis がポート 6379 で利用できます。続いてマイグレーションを生成して適用します。

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

スキーマは `apps/api/src/db/schema.ts` で定義されています。テーブル: users、sessions、settings、jobs、apiKeys、pipelines、teams、userFiles、roles、auditLog。

## 新しいツールの追加 {#adding-a-new-tool}

すべてのツールは同じパターンに従います。以下は最小限の例です。

### 1. バックエンドルート {#_1-backend-route}

`apps/api/src/routes/tools/my-tool.ts` を作成します。

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

その後、`apps/api/src/routes/tools/index.ts` で登録します。

### 2. フロントエンド設定コンポーネント {#_2-frontend-settings-component}

`apps/web/src/components/tools/my-tool-settings.tsx` を作成します。

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

その後、`apps/web/src/lib/tool-registry.tsx` のフロントエンドツールレジストリで登録します。

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

表示モード: `"side-by-side"`、`"before-after"`、`"live-preview"`、`"no-comparison"`、`"interactive-crop"`、`"interactive-eraser"`、`"no-dropzone"`。

### 3. i18n エントリ {#_3-i18n-entry}

`packages/shared/src/i18n/en.ts` に追加します。

```ts
"my-tool": {
  name: "My Tool",
  description: "Short description of what this tool does",
},
```

### 4. テスト {#_4-tests}

e2e テストが確実に対象にできるよう、アクションボタンに `data-testid` 属性を追加します（上記のとおり）。

## Docker ビルド {#docker-builds}

完全な本番イメージをローカルでビルドします。

```bash
docker build -f docker/Dockerfile -t snapotter:latest .
```

より高速な再ビルドのために BuildKit のキャッシュマウントを使います。

```bash
DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t snapotter:latest .
```

## 環境変数 {#environment-variables}

完全な一覧については [設定ガイド](/ja/guide/configuration) を参照してください。開発で重要なものは次のとおりです。

| 変数 | デフォルト | 説明 |
|-----------------------------|-----------|------------------------------------------------|
| `AUTH_ENABLED` | `true` | 認証の有効化/無効化 |
| `DEFAULT_USERNAME` | `admin` | デフォルトの管理者ユーザー名 |
| `DEFAULT_PASSWORD` | `admin` | デフォルトの管理者パスワード |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | パスワードの強制変更をスキップ（CI/開発のみ） |
| `RATE_LIMIT_PER_MIN` | `1000` | 1 分あたりの API レート制限（0 = 無効） |
| `MAX_UPLOAD_SIZE_MB` | `100` | 最大アップロードサイズ（MB）（0 = 無制限） |
