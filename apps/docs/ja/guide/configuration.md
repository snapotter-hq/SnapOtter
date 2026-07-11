---
description: "すべての SnapOtter 環境変数とデフォルト値。認証、ストレージ、AI モデル、分析などを設定します。"
i18n_source_hash: 8e9e9ca2840c
i18n_provenance: human
i18n_output_hash: 4070dc47c212
---

# 設定 {#configuration}

すべての設定は環境変数を通じて行います。各変数には妥当なデフォルト値があるため、SnapOtter は何も設定しなくてもそのまま動作します。

## 環境変数 {#environment-variables}

### サーバー {#server}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `PORT` | `1349` | サーバーがリッスンするポート。 |
| `RATE_LIMIT_PER_MIN` | `1000` | IP ごとの 1 分あたりの最大リクエスト数。レート制限を無効にするには 0 に設定します。 |
| `CORS_ORIGIN` | (空) | CORS で許可するオリジンのカンマ区切りリスト。空の場合は同一オリジンのみ。 |
| `LOG_LEVEL` | `info` | ログの詳細度。`fatal`、`error`、`warn`、`info`、`debug`、`trace` のいずれか。 |
| `TRUST_PROXY` | `true` | リバースプロキシからの `X-Forwarded-For` ヘッダーを信頼します。プロキシの背後にない場合は `false` に設定します。 |

### 認証 {#authentication}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `AUTH_ENABLED` | `false` | ログインを必須にするには `true` に設定します。Docker イメージのデフォルトは `true` です。 |
| `DEFAULT_USERNAME` | `admin` | 初期 admin アカウントのユーザー名。初回起動時のみ使用されます。 |
| `DEFAULT_PASSWORD` | `admin` | 初期 admin アカウントのパスワード。初回ログイン後に変更してください。 |
| `MAX_USERS` | `0` (無制限) | 登録済みユーザーアカウントの最大数。無制限にするには 0 に設定します。 |
| `SESSION_DURATION_HOURS` | `168` | ログインセッションの有効期間（時間単位、デフォルトは 7 日）。 |
| `SKIP_MUST_CHANGE_PASSWORD` | - | 空でない任意の値を設定すると、初回ログイン時の強制パスワード変更プロンプトをバイパスします |

### ストレージ {#storage}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` または `s3`。S3/MinIO には s3_storage 機能を含むライセンスが必要です。 |
| `DATABASE_URL` | `postgres://snapotter:snapotter@postgres:5432/snapotter` | PostgreSQL 接続文字列。 |
| `REDIS_URL` | `redis://redis:6379` | Redis 接続文字列（BullMQ ジョブキューに使用）。 |
| `WORKSPACE_PATH` | `./tmp/workspace` | 処理中の一時ファイル用ディレクトリ。自動的にクリーンアップされます。 |
| `FILES_STORAGE_PATH` | `./data/files` | 永続的なユーザーファイル（アップロードした画像、保存した結果）用ディレクトリ。 |

### 組み込みモード {#embedded-mode}

`DATABASE_URL` も `REDIS_URL` も指定せずにイメージを実行すると、コンテナ内で独自の PostgreSQL 17 と Redis を起動し、ループバックにバインドして、すべてのデータを `/data` ボリューム上に置きます。これにより、クイックスタート、ホームラボ、1.x からのアップグレード向けに、ワンコマンドの `docker run` 体験が復活します。これは利便性のための手段であり、本番デプロイではありません。本番環境では、PostgreSQL と Redis を分離した 3 コンテナの Compose スタックを実行してください。組み込みモードはコンテナを root として実行する必要があり、任意 UID のランタイム（OpenShift、Kubernetes `runAsNonRoot`）とは互換性がありません。その場合は Compose を使用してください。

| 変数 | デフォルト | 説明 |
|---|---|---|
| `EMBEDDED` | `auto` | `DATABASE_URL` と `REDIS_URL` の両方が未設定の場合に自動で有効になります。無効にするには `0` に設定します（その場合、外部の `DATABASE_URL`/`REDIS_URL` が設定されていなければ、アプリはコンテナ内データベースを黙って起動する代わりに即座に失敗します）。 |
| `REDIS_MAXMEMORY` | `512mb` | 組み込み Redis のメモリ上限（組み込みモードのみ）。Raspberry Pi のようなメモリ制約のあるホストでは下げてください。 |

1.x からのアップグレード: 古い `snapotter.db` をボリューム内の `/data/snapotter.db` に配置すると、組み込みモードが初回起動時にそれを組み込み PostgreSQL へインポートします。インポートは一度だけ実行され、以降の起動ではスキップされます。

テレメトリに関する注記: 組み込みモードは、他の設定と同様にイメージの分析デフォルトを継承します。公開イメージは分析を有効にした状態で出荷されます。無効にするには `--build-arg SNAPOTTER_ANALYTICS=off` でビルドするか、アプリ内の admin オプトアウトを使用してください。

### 処理制限 {#processing-limits}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `100` | アップロードあたりの最大ファイルサイズ（メガバイト単位）。無制限にするには 0 に設定します。 |
| `MAX_BATCH_SIZE` | `100` | 単一バッチリクエスト内の最大ファイル数。無制限にするには 0 に設定します。 |
| `CONCURRENT_JOBS` | `0` (自動) | 並列実行されるバッチジョブの数。利用可能な CPU コア数に基づいて自動検出するには 0 に設定します。 |
| `MAX_MEGAPIXELS` | `0` (無制限) | 許可される最大画像解像度（メガピクセル単位）。無制限にするには 0 に設定します。 |
| `MAX_WORKER_THREADS` | `0` (自動) | 画像処理の最大ワーカースレッド数。利用可能な CPU コア数に基づいて自動検出するには 0 に設定します。 |
| `PROCESSING_TIMEOUT_S` | `0` (制限なし) | リクエストあたりの最大処理時間（秒単位）。タイムアウトなしにするには 0 に設定します。 |
| `MAX_PIPELINE_STEPS` | `20` | パイプライン内の最大ステップ数。制限なしにするには 0 に設定します。 |
| `MAX_CANVAS_PIXELS` | `0` (制限なし) | 出力画像の最大キャンバスサイズ（ピクセル単位）。制限なしにするには 0 に設定します。 |
| `MAX_SVG_SIZE_MB` | `0` (無制限) | 最大 SVG ファイルサイズ（メガバイト単位）。無制限にするには 0 に設定します。 |
| `MAX_SPLIT_GRID` | `100` | 画像分割ツールの最大グリッド次元。 |
| `MAX_PDF_PAGES` | `0` (無制限) | PDF-to-image 変換での PDF の最大ページ数。無制限にするには 0 に設定します。 |

### クリーンアップ {#cleanup}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | 未保存の処理結果（生のアップロードとツール出力）を自動削除するまで保持する期間。Files ライブラリに明示的に保存したファイルは影響を受けず、削除するまで保持されます。 |
| `CLEANUP_INTERVAL_MINUTES` | `60` | クリーンアップジョブを実行する頻度。 |

### 外観 {#appearance}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `DEFAULT_THEME` | `light` | 新規セッションのデフォルトテーマ。`light` または `dark`。 |
| `DEFAULT_LOCALE` | `en` | デフォルトのインターフェース言語。 |
| `DEFAULT_TOOL_VIEW` | `sidebar` | デフォルトのツールレイアウト。`sidebar` または `fullscreen`。 |

### Docker 権限 {#docker-permissions}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `PUID` | `999` | コンテナプロセスをこの UID として実行します。バインドマウントの場合はホストユーザーに合わせて設定します（`id -u`）。 |
| `PGID` | `999` | コンテナプロセスをこの GID として実行します。バインドマウントの場合はホストグループに合わせて設定します（`id -g`）。 |

## Docker の例 {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
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
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## ボリューム {#volumes}

Docker Compose スタックは 4 つのボリュームを使用します:

- `/data` (app) - AI モデル、Python venv、ユーザーファイル。アップロードしたファイルとインストール済みの AI バンドルを再起動を越えて保持するには、これをマウントします。
- `/tmp/workspace` (app) - 処理中のファイルの一時ストレージ。エフェメラルでも構いませんが、マウントするとコンテナの書き込み可能レイヤーが埋まるのを防げます。
- `SnapOtter-pgdata` (postgres) - PostgreSQL データディレクトリ。すべてのリレーショナルデータ（ユーザー、設定、パイプライン、ジョブ、監査ログ）を保持します。`pg_dump` またはボリュームスナップショットでバックアップします。
- `SnapOtter-redisdata` (redis) - 永続的なジョブキュー用の Redis 追記専用ファイル。
