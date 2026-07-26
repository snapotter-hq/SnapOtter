---
description: "すべての SnapOtter 環境変数とデフォルト値。認証、ストレージ、AI モデル、分析などを設定します。"
i18n_source_hash: 25970c776f7c
i18n_provenance: human
i18n_output_hash: 9823eeb45541
i18n_hash_version: 2
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
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | `X-Forwarded-For` でクライアント IP を設定できるピアを指定します。デフォルトはプライベートネットワークのピアだけを信じるため、Docker ネットワークや LAN 上のリバースプロキシは信頼され、公開クライアントが偽装したヘッダーは信頼されません。公開アドレスで自分が管理するプロキシを前段に置いている場合にのみ `true` に設定してください。 |

### 認証 {#authentication}

以下の 2 つのブール値は `true` と `false` のみを受け付けます。`1`、`yes`、`on` などそれ以外の値は検証に失敗し、サーバーはリッスンを開始する前に終了します。

| 変数 | デフォルト | 説明 |
|---|---|---|
| `AUTH_ENABLED` | `true` | ログインを必須にします。アカウントをまったく持たずに実行するには `false` に設定します。その場合はすべてのリクエストに admin 権限が与えられるため、信頼できるネットワークに限定してください。 |
| `DEFAULT_USERNAME` | `admin` | 初期 admin アカウントのユーザー名。初回起動時のみ使用されます。 |
| `DEFAULT_PASSWORD` | `admin` | 初期 admin アカウントのパスワード。初回ログイン後に変更してください。 |
| `MAX_USERS` | `0` (無制限) | 登録済みユーザーアカウントの最大数。無制限にするには 0 に設定します。 |
| `SESSION_DURATION_HOURS` | `168` | ログインセッションの有効期間（時間単位、デフォルトは 7 日）。 |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | 初回ログイン時の強制パスワード変更プロンプトをスキップするには `true` に設定します。 |

### ストレージ {#storage}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` または `s3`。S3 と MinIO には s3_storage 機能を含むライセンスに加えて、以下の `S3_*` 変数が必要です。 |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL 接続文字列。Compose スタックではこれを自身の `postgres` サービスに向けます。組み込みモードにするには、（`REDIS_URL` と併せて）未設定のままにします。 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 接続文字列（BullMQ ジョブキューに使用）。Compose ではこれを自身の `redis` サービスに向けます。 |
| `WORKSPACE_PATH` | `./tmp/workspace` | 処理中の一時ファイル用ディレクトリ。自動的にクリーンアップされます。イメージでは `/tmp/workspace` が設定されます。 |
| `FILES_STORAGE_PATH` | `./data/files` | 永続的なユーザーファイル（アップロードした画像、保存した結果）用ディレクトリ。イメージでは `/data/files` が設定されます。 |

### S3 オブジェクトストレージ {#s3-object-storage}

`STORAGE_MODE=s3` のときにのみ読み取られます。必須の 3 つのうちどれか 1 つでも欠けていると起動は失敗し、設定し忘れた変数名が表示されます。

| 変数 | デフォルト | 説明 |
|---|---|---|
| `S3_BUCKET` | (空) | アップロードと出力を保持するバケット。必須。 |
| `S3_ACCESS_KEY_ID` | (空) | アクセスキー。必須。コンテナ内では、代わりに `S3_ACCESS_KEY_ID_FILE` でマウントすることもできます。 |
| `S3_SECRET_ACCESS_KEY` | (空) | シークレットキー。必須。同じファイル方式が使えます: `S3_SECRET_ACCESS_KEY_FILE`。 |
| `S3_REGION` | `us-east-1` | バケットのリージョン。 |
| `S3_ENDPOINT` | (空) | MinIO、R2、Backblaze など S3 互換ストア向けのカスタムエンドポイント。空の場合は AWS を指します。 |
| `S3_FORCE_PATH_STYLE` | `false` | MinIO のように、仮想ホスト形式ではなく `endpoint/bucket/key` を必要とするものでは `true` に設定します。 |
| `S3_PREFIX` | (空) | キーのプレフィックス。1 つのバケットで複数のインスタンスを扱えるようになります。 |

### 保存データの暗号化 {#encryption-at-rest}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (空) | 64 文字の 16 進数（32 バイト）。データベースに保存された機密設定を暗号化します。64 文字の 16 進数でないものは起動時に拒否されます。 |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (空) | ローテーションで置き換える前のキー。形式は同じです。ローテーション中は両方を設定して既存の行を復号できるようにし、その後こちらを削除します。 |

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
| `MAX_UPLOAD_SIZE_MB` | `0` (無制限) | アップロードあたりの最大ファイルサイズ（メガバイト単位）。無制限にするには 0 に設定します。公開イメージは `0` で出荷されます。ソースからのビルドは 100 で始まります。 |
| `MAX_BATCH_SIZE` | `0` (無制限) | 単一バッチリクエスト内の最大ファイル数。無制限にするには 0 に設定します。公開イメージは `0` で出荷されます。ソースからのビルドは 100 で始まります。 |
| `CONCURRENT_JOBS` | `0` (自動) | 並列実行されるバッチジョブの数。利用可能な CPU コア数に基づいて自動検出するには 0 に設定します。 |
| `MAX_MEGAPIXELS` | `0` (無制限) | 許可される最大画像解像度（メガピクセル単位）。無制限にするには 0 に設定します。 |
| `MAX_WORKER_THREADS` | `0` (自動) | 画像処理の最大ワーカースレッド数。利用可能な CPU コア数に基づいて自動検出するには 0 に設定します。 |
| `PROCESSING_TIMEOUT_S` | `0` (制限なし) | リクエストあたりの最大処理時間（秒単位）。タイムアウトなしにするには 0 に設定します。 |
| `MAX_PIPELINE_STEPS` | `20` | パイプライン内の最大ステップ数。制限なしにするには 0 に設定します。 |
| `MAX_CANVAS_PIXELS` | `0` (制限なし) | 出力画像の最大キャンバスサイズ（ピクセル単位）。制限なしにするには 0 に設定します。 |
| `MAX_SVG_SIZE_MB` | `50` | サニタイズ前に受け付ける SVG の最大サイズ（メガバイト単位）。ここでの `0` は前後の行とは動作が異なります。上限を引き上げるのではなく、解析前のサイズ上限そのものを取り除くため、この項目は設定したままにしてください。 |
| `MAX_PDF_PAGES` | `0` (無制限) | PDF-to-image 変換での PDF の最大ページ数。無制限にするには 0 に設定します。 |

### クリーンアップ {#cleanup}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | 未保存の処理結果（生のアップロードとツール出力）を自動削除するまで保持する期間。Files ライブラリに明示的に保存したファイルは影響を受けず、削除するまで保持されます。 |
| `CLEANUP_INTERVAL_MINUTES` | `60` | クリーンアップジョブを実行する頻度。 |

### 外観 {#appearance}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `DEFAULT_THEME` | `light` | 新規セッションのデフォルトテーマ。`light`、`dark`、`system` のいずれか。 |
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
      POSTGRES_PASSWORD: snapotter     # 非ローカル展開の場合はこれを変更します
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
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
