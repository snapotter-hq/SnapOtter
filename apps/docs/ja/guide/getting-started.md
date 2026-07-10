---
description: 1 つのコマンドで Docker を使って SnapOtter をインストールします。Docker Compose のセットアップ、ソースからのビルド、および全機能の概要を含みます。
i18n_source_hash: d2366a2e051c
i18n_provenance: human
i18n_output_hash: ac1ea8a8ceba
---

# はじめに {#getting-started}

::: tip インストール前に試す
[demo.snapotter.com](https://demo.snapotter.com) で完全な UI を試せます。サインアップやインストールは不要です。
:::

## クイックスタート {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

この単一コンテナは必要なものをすべて実行します。`DATABASE_URL` を設定していない場合、独自の PostgreSQL と Redis をループバックインターフェイス上で起動し（組み込みモード）、すべてのデータを `SnapOtter-data` ボリューム内に保持します。これは SnapOtter を試したり、ホームラボでセルフホストしたりする最速の方法です。本番環境では、下記の [Docker Compose](#docker-compose) スタックを実行してください。これは PostgreSQL と Redis をそれぞれのコンテナに保ちます。組み込みモードは root として実行され（デフォルト）、`DATABASE_URL` を設定するとすぐに自動的にオフになります。

初回ログイン時にパスワードの変更を求められます。

::: tip 匿名の製品分析
SnapOtter にはデフォルトで匿名の製品分析が含まれています。オフにするには、**設定 → システム → プライバシー** を開き、**匿名の製品分析** をオフにしてください。インスタンス全体で即座に停止します。

収集される内容の詳細については、[SnapOtter が収集するもの](/ja/guide/telemetry) を参照してください。
:::

::: tip NVIDIA CUDA アクセラレーション
NVIDIA CUDA アクセラレーションによる背景除去、アップスケール、OCR、顔の補正、復元のために `--gpus all` を追加してください:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) が必要です。CUDA が利用できない場合は自動的に CPU にフォールバックします。VA-API、Quick Sync、または OpenCL を通じた Intel/AMD の iGPU アクセラレーションは、現時点では AI 推論には対応していません。ベンチマークについては [Docker タグ](/ja/guide/docker-tags) を参照してください。
:::

::: details GHCR でも利用可能
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

両方のレジストリはリリースごとに同じイメージを公開します。
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

## ソースからのビルド {#build-from-source}

**前提条件:** Node.js 22+、pnpm 9+、Docker（Postgres + Redis 用）、Python 3.10+（AI 機能用）、Git。

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

### ファイル処理（241 ツール） {#file-processing-241-tools}

| モダリティ | 数 | ツールの例 |
|----------|-------|---------------|
| **画像** | 105 | リサイズ、切り抜き、圧縮、変換、背景除去、アップスケール、OCR、透かし、コラージュ、色付け、GIF ツール、フォーマットプリセット |
| **動画** | 57 | トリミング、切り抜き、圧縮、変換、結合、音声抽出、自動字幕、動画から GIF、リサイズ、手ブレ補正、フォーマットプリセット |
| **音声** | 27 | トリミング、結合、変換、正規化、ノイズ低減、文字起こし、ピッチシフト、フェード、着信音メーカー、フォーマットプリセット |
| **PDF / ドキュメント** | 42 | 結合、分割、圧縮、OCR、透かし、墨消し、Word から PDF、Excel から PDF、回転、保護、修復 |
| **ファイル** | 10 | CSV から JSON、JSON から XML、CSV の結合、CSV の分割、ZIP の作成、ZIP の展開、チャートメーカー、YAML/JSON |

### パイプライン {#pipelines}

ツールをつなげて複数ステップのワークフローを作り、それを 1 枚の画像またはバッチ全体に適用できます:

1. サイドバーの **パイプライン** を開きます。
2. ステップ（任意のツール、任意の設定）を追加します。
3. 単一のファイル、またはバッチ全体に対して一度に実行します。
4. 後で再利用するためにパイプラインを保存します。

パイプラインはデフォルトで 20 ステップまで許可されます。上限を無制限にするには `MAX_PIPELINE_STEPS=0` を設定してください。

### ファイルライブラリ {#file-library}

処理したすべてのファイルは **ファイル** ライブラリに保存できます。SnapOtter は完全なバージョン履歴を追跡するため、元のアップロードから最終出力まで、すべての処理ステップをたどることができます。

保存は明示的に行われます。ライブラリに保存した結果は削除するまで保持されますが、処理して未保存のまま残した結果は 72 時間後に自動的にクリアされます（`FILE_MAX_AGE_HOURS` で設定可能）。

### REST API と API キー {#rest-api-api-keys}

すべてのツールは HTTP 経由でアクセスできます:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

**設定 → API キー** で API キーを生成します。すべてのエンドポイントについては [REST API リファレンス](/ja/api/rest) を参照するか、インタラクティブなリファレンスについては [http://localhost:1349/api/docs](http://localhost:1349/api/docs) を参照してください。

### マルチユーザーとチーム {#multi-user-teams}

ロールベースのアクセス制御で複数のユーザーを有効にします:

- **管理者**: 完全なアクセス。ユーザー、チーム、設定、すべてのファイル/パイプライン/API キーを管理
- **ユーザー**: ツールの使用、自分のファイル/パイプライン/API キーの管理

**設定 → チーム** でチームを作成し、ユーザーをグループ化します。

`AUTH_ENABLED=true`（またはログインなしのシングルユーザー/自己利用の場合は `false`）を設定してください。
