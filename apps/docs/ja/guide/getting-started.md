---
description: "1 つのコマンドで SnapOtter を Docker でインストールします。Docker Compose のセットアップ、ソースからのビルド、機能の全体像を含みます。"
i18n_source_hash: 4536d4558b8e
i18n_provenance: machine
i18n_output_hash: c84093005283
---

# はじめに {#getting-started}

::: tip インストール前に試す
[demo.snapotter.com](https://demo.snapotter.com) で完全な UI を試せます。サインアップもインストールも不要です。
:::

## クイックスタート {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

この単一コンテナは、必要なものすべてを内部で実行します。`DATABASE_URL` が未設定の場合、ループバックインターフェイス上で独自の PostgreSQL と Redis を起動し（組み込みモード）、すべてのデータを `SnapOtter-data` ボリュームに保持します。SnapOtter を試す、あるいはホームラボでセルフホストする最速の方法です。本番環境では、下記の [Docker Compose](#docker-compose) スタックを実行してください。こちらは PostgreSQL と Redis をそれぞれ専用のコンテナに保ちます。組み込みモードは root（デフォルト）として実行され、`DATABASE_URL` を設定するとすぐに自動的にオフになります。

初回ログイン時にパスワードの変更を求められます。

::: tip 匿名のプロダクトアナリティクス
SnapOtter にはデフォルトで匿名のプロダクトアナリティクスが含まれています。オフにするには、**Settings → System → Privacy** を開き、**Anonymous Product Analytics** をオフにしてください。インスタンス全体で即座に停止します。

環境変数 `SNAPOTTER_TELEMETRY=0`（`false` と `off` も使えます）を設定すると、リビルドせずにインスタンスのすべてのテレメトリを無効にできます。

エラー監視は [Sentry](https://sentry.io) によって提供されており、Sentry はオープンソースプログラムを通じて SnapOtter をスポンサーしています。

何が収集されるかの詳細については、[SnapOtter が収集するもの](/ja/guide/telemetry) を参照してください。
:::

::: tip NVIDIA CUDA アクセラレーション
NVIDIA CUDA で高速化された背景除去、アップスケーリング、OCR、顔の補正、復元のために `--gpus all` を追加します：

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) が必要です。CUDA が利用できない場合は自動的に CPU にフォールバックします。VA-API、Quick Sync、OpenCL を介した Intel/AMD iGPU アクセラレーションは、現時点では AI 推論に対応していません。ベンチマークについては [Docker Tags](/ja/guide/docker-tags) を参照してください。
:::

::: details GHCR でも利用可能
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

どちらのレジストリもリリースごとに同じイメージを公開します。
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

すべての環境変数については [設定](/ja/guide/configuration) を参照してください。

## ソースからビルド {#build-from-source}

**前提条件:** Node.js 22 以上、pnpm 9 以上、Docker（Postgres + Redis 用）、Python 3.10 以上（AI 機能用）、Git。

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- フロントエンド: [http://localhost:1349](http://localhost:1349)
- バックエンド: [http://localhost:13490](http://localhost:13490)

## できること {#what-you-can-do}

### ファイル処理（200+ ツール） {#file-processing-200-tools}

| モダリティ | 数 | ツールの例 |
|----------|-------|---------------|
| **画像** | 105 | リサイズ、切り抜き、圧縮、変換、背景除去、アップスケール、OCR、透かし、コラージュ、カラー化、GIF ツール、フォーマットプリセット |
| **ビデオ** | 57 | トリミング、切り抜き、圧縮、変換、結合、オーディオ抽出、自動字幕、ビデオから GIF、リサイズ、手ブレ補正、フォーマットプリセット |
| **オーディオ** | 27 | トリミング、結合、変換、正規化、ノイズ低減、文字起こし、ピッチシフト、フェード、着信音メーカー、フォーマットプリセット |
| **PDF / ドキュメント** | 42 | 結合、分割、圧縮、OCR、透かし、墨消し、Word から PDF、Excel から PDF、回転、保護、修復 |
| **ファイル** | 10 | CSV から JSON、JSON から XML、CSV の結合、CSV の分割、ZIP の作成、ZIP の展開、チャートメーカー、YAML/JSON |

### パイプライン {#pipelines}

ツールを連結して複数ステップのワークフローにし、1 枚の画像やバッチ全体に適用します：

1. サイドバーで **Pipelines** を開きます。
2. ステップを追加します（任意のツール、任意の設定）。
3. 単一ファイルで実行するか、バッチ全体を一度に実行します。
4. パイプラインを保存して後で再利用します。

パイプラインはデフォルトで 20 ステップを許可します。`MAX_PIPELINE_STEPS=0` を設定すると上限を無制限にできます。

### ファイルライブラリ {#file-library}

処理したすべてのファイルは **Files** ライブラリに保存できます。SnapOtter は完全なバージョン履歴を追跡するので、元のアップロードから最終出力まで、あらゆる処理ステップを辿れます。

保存は明示的です。ライブラリに保存した結果は削除するまで保持されますが、処理して未保存のまま残した結果は 72 時間後に自動的に消去されます（`FILE_MAX_AGE_HOURS` で設定可能）。

### REST API と API キー {#rest-api-api-keys}

すべてのツールは HTTP 経由でアクセスできます：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

**Settings → API Keys** で API キーを生成します。すべてのエンドポイントについては [REST API リファレンス](/ja/api/rest) を参照するか、[http://localhost:1349/api/docs](http://localhost:1349/api/docs) でインタラクティブなリファレンスにアクセスしてください。

### マルチユーザーとチーム {#multi-user-teams}

ロールベースのアクセス制御で複数のユーザーを有効にします：

- **管理者（Admin）**: フルアクセス。ユーザー、チーム、設定、すべてのファイル/パイプライン/API キーを管理します
- **ユーザー（User）**: ツールを使用し、自分のファイル/パイプライン/API キーを管理します

**Settings → Teams** でチームを作成してユーザーをグループ化します。

`AUTH_ENABLED=true`（ログインなしの単一ユーザー/自己利用の場合は `false`）を設定します。
