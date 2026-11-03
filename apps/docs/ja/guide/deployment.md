---
description: "Docker を使って SnapOtter を本番環境にデプロイします。ハードウェア要件、GPU のセットアップ、Nginx、Traefik、Cloudflare のリバースプロキシ設定を説明します。"
i18n_source_hash: b8c4ed2cc086
i18n_provenance: machine
i18n_output_hash: 93218c50225c
i18n_hash_version: 2
---

# デプロイ {#deployment}

SnapOtter は、3 つのコンテナで構成される Docker Compose スタックとしてデプロイされます。構成は、SnapOtter のアプリイメージ、PostgreSQL 17、Redis 8 です。アプリイメージは **linux/amd64**（AI アクセラレーション用の NVIDIA CUDA 付き）と **linux/arm64**（CPU）をサポートしているため、Intel/AMD サーバー、Apple Silicon の Mac、Raspberry Pi 4/5 などの ARM デバイスでネイティブに動作します。VA-API、Quick Sync、OpenCL による Intel/AMD の iGPU アクセラレーションは、現在 AI 推論ではサポートされていません。

GPU のセットアップ、Docker Compose の例、バージョン固定については、[Docker イメージ](./docker-tags)を参照してください。

## クイックスタート（CPU） {#quick-start-cpu}

```yaml
# docker-compose.yml - Copy this file and run: docker compose up -d
services:
  SnapOtter:
    image: snapotter/snapotter:latest    # or ghcr.io/snapotter-hq/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"                # Web UI + API
    volumes:
      - SnapOtter-data:/data           # AI models, user files (PERSISTENT)
      - SnapOtter-workspace:/tmp/workspace  # Temp processing files (can be tmpfs)
    environment:
      # --- Authentication ---
      - AUTH_ENABLED=true          # Set to false to disable login entirely
      - DEFAULT_USERNAME=admin     # First-run admin username
      - DEFAULT_PASSWORD=admin     # First-run admin password (you'll be forced to change it)

      # --- Database + Queue ---
      # Requests are served by a role that can only read and write rows. The
      # owner connects only during boot, to migrate and to grant. Set
      # POSTGRES_APP_PASSWORD and POSTGRES_PASSWORD for any non-local deployment.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=loopback,linklocal,uniquelocal  # Which peers may set the client IP via X-Forwarded-For (default shown)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)

      # --- Engines (empty = the image's own binaries, see Configuration) ---
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"            # Needed for Python ML shared memory
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:       # Named volume - Docker manages permissions automatically
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose up -d
```

アプリは `http://localhost:1349` で利用できるようになります。

上記のスタックは、データベースのオーナーとして接続します。SnapOtter 2.3.0 以降では、行の読み書きだけができるロールでリクエストを処理できます。[最小権限のロール](./database#least-privilege-roles)を参照してください。

> **Docker Hub のレート制限に当たりましたか。** `snapotter/snapotter:latest` を `ghcr.io/snapotter-hq/snapotter:latest` に置き換えると、代わりに GitHub Container Registry からプルできます。どちらのレジストリにも、リリースごとに同じイメージが公開されます。

## クイックスタート（NVIDIA CUDA） {#quick-start-nvidia-cuda}

対応する AI ツール（背景除去、アップスケール、顔の補正）で NVIDIA CUDA アクセラレーションを使うには、次のようにします。

```yaml
# docker-compose-gpu.yml - Requires: NVIDIA GPU + nvidia-container-toolkit
# Install toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      # Runtime role (rows only) and the boot-only owner connection. See the CPU
      # example above.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Engines (empty = the image's own binaries, see Configuration)
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"                # Required for PyTorch CUDA shared memory
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all           # Or set to 1 for a specific GPU
              capabilities: [gpu]
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose -f docker-compose-gpu.yml up -d
```

### GPU アクセラレーションの確認 {#verify-gpu-acceleration}

ログで CUDA の検出を確認します。

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

`--gpus all` と NVIDIA Container Toolkit を正しく設定しているのに AI ツールが CPU で動作する場合は、影響を受けるバンドル（たとえば背景除去）を **Settings → AI Features** から再インストールしてください。インストーラーは ONNX Runtime の GPU ビルドを復元します。共有の AI 環境では、別のバンドル（文字起こしなど）が持ち込んだ CPU 専用ビルドが、これを隠してしまうことがあるためです。古いイメージで UI からの再インストールでも GPU が復元されない場合は、[issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490) の手動の修復手順を参照してください。

## ハードウェア要件 {#hardware-requirements}

これらの数値は、NVIDIA RTX 4070 を搭載した最新の amd64 ワークステーションから Raspberry Pi まで、さまざまなシステムでのベンチマークに基づいています。各システムでツールのカタログ全体を実行し、Docker のリソース制限を変化させて、実際の下限を調べました。

これらのティアの下限に近い環境（Pi、古いノート PC、2 GB の VPS）で実行しますか。[低リソース環境のセットアップ](/ja/guide/low-resource)では、これらの数値を、調整済みの上限を含む具体的な手順にまとめています。

### クイックリファレンス {#quick-reference}

| ティア | 用途 | CPU | RAM | GPU | ストレージ |
|------|----------|-----|-----|-----|---------|
| 最小 | AI 以外のツール（画像、ファイル、軽量な PDF）と、組み込みの高速 OCR および顔検出。単一ユーザー、小規模なバッチ | 2 コア | 2 GB | なし | 約 7 GB |
| 推奨 | 動画、PDF、標準的な AI バンドルを含む 5 つのモダリティすべてを CPU で実行。バッチ処理、数人のユーザー | 4 コア | 4 GB（HQ インペインティングは 8 GB） | なし | 約 25 GB |
| フル | GPU AI を含むすべてを高速に実行。大規模なバッチ、多数のユーザー | 6 から 8 コア | 8 GB | NVIDIA 8 GB 以上の VRAM（12 GB なら余裕あり） | 約 35 GB |

**アーキテクチャ: 64 ビットのみ**（`linux/amd64` または `linux/arm64`）。SnapOtter は、Intel/AMD サーバー、Apple Silicon の Mac、**Raspberry Pi 4 および 5**（4 から 8 GB）を含む 64 ビット ARM ボードでネイティブに動作します。32 ビット ARM（`armv7`/`armhf`）では動作せず、そのためのイメージもビルドされていません。また、Pi Zero のような 512 MB クラスのボードも、メモリの下限を下回るため動作しません（下記参照）。

### 最小（画像、ファイル、軽量な PDF ツール。AI なし） {#minimum-image-files-and-light-pdf-tools-no-ai}

| リソース | 要件 |
|---|---|
| CPU | 2 コア |
| RAM | 2 GB |
| ディスク | 約 5.5 GB（イメージ）とデータボリューム |
| GPU | 不要 |

AI 以外のカタログツール 222 個はすべて、控えめなハードウェアで動作します。画像（リサイズ、切り抜き、変換、圧縮、調整、透かし）、動画（トリミング、ミュート、再マルチプレックス）、音声（変換、正規化、トリミング）、PDF（結合、分割、圧縮、回転、保護）、ファイル変換、専用の変換プリセットが含まれます。大きなファイルでも、ほとんどの操作は 1 秒未満で終わります。2.7 MB の画像のリサイズは約 0.05 秒、WebP への再エンコードは約 2 秒です。

メモリの下限は、Docker のリソース制限を変化させた実測値に基づいており、実際のものです。**512 MB ではスタックを起動できず**（画像のリサイズ 1 回でもキルされます）、**1 GB** では単一ファイルの操作は処理できますが、複数ファイルのバッチではメモリ不足になります。**2 GB / 2 コア**が、AI 以外のバッチを快適に処理できる最小構成です。組み込みの高速 OCR と `face-detection` バンドルも 2 GB に収まりますが、より大きな AI バンドル（Whisper、LaMa/DDColor、rembg、RealESRGAN、写真の復元、SD1.5 HQ インペインティング）には 4 から 8 GB の RAM が必要で、空きメモリがバンドルごとの下限を下回る場合は、事前に実行が拒否されます。

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**CPU への負荷が高い唯一の例外は、動画の再エンコードです。** ストリームコピーの操作（トリミング、ミュート、コンテナの再マルチプレックス）は一瞬で終わりますが、別のコーデックへのトランスコードは CPU に依存します。1080p / 45 秒のクリップを VP9（WebM）に再エンコードすると、高速な最新の CPU で約 **40 秒**、Apple Silicon で約 45 秒、古いモバイル向け 4 コアで約 80 秒、古い 4 コアのサーバーで約 **130 秒**かかります。動画を多用する場合は、CPU のコア数とクロック速度を優先するか、コンテナの `cpus:` の上限を引き上げてください。同梱の Compose では、アプリはデフォルトで 4 コアに制限されています（GPU 用の Compose では 8 コア）。

### 推奨（CPU で AI ツールを使用） {#recommended-ai-tools-on-cpu}

| リソース | 要件 |
|---|---|
| CPU | 4 コア |
| RAM | 4 GB |
| ディスク | 3 GB（イメージ）と約 20 GB（オプションの AI パックすべて）とワークスペース |
| GPU | 不要（CPU にフォールバック） |

**推奨が RAM 4 GB になるのは、大きな AI バンドルをインストールして実行するためです。** オプションのパックをインストールしていなければ、アプリはアイドル時に約 360 MB で動作します。従来の Python ツールは 1 つのサイドカーを共有し、高精度 OCR は、アクティブなイミュータブルの世代に固定された、専用の長時間稼働ディスパッチャーを使用します。アクティベーションの前に、インストーラーは候補に対してスモークテストを実行します。その後、新しいディスパッチャーにアトミックに切り替え、ガベージコレクションの前に以前のディスパッチャーをドレインします。公式の高精度 OCR の成果物はすべて、4 GiB の cgroup 内で最悪ケースのリリーススイートに合格する必要があります。ホストの推奨値を 4 GB としているのは、Node.js アプリケーション、Postgres、Redis、キュー、同時実行される処理に余裕を持たせるためです。

AI ツールの多くは CPU でも十分に使えますが、いくつかは GPU が本当に必要です。最新の 4 コア CPU での実測値は次のとおりです。

| AI ツール | CPU での時間 | CPU で使えるか |
|---|---|---|
| 顔検出（blur-faces、smart-crop、red-eye）、ノイズ除去 | 1 秒未満 | はい |
| OCR、文字起こし、字幕 | 1 から 3 秒 | はい |
| カラー化、顔の補正 | 約 10 秒 | はい |
| 背景の除去 / 置換 / ぼかし | 約 29 秒 | はい（待ち時間あり） |
| AI アップスケール（RealESRGAN） | 小さい画像で約 33 秒、大きい画像では数分 | 限定的。GPU を強く推奨 |
| 写真の復元（フルパイプライン） | 数分 | いいえ。GPU か高速なマルチコア CPU が必要 |

SnapOtter は、これらのモデルのダウンロードを意図的に Docker イメージへ組み込んでいません。AI バンドルは、管理者が関連するツールを有効にしたときにのみ取得され、永続的な `/data/ai` ボリュームに保存されて、同じモデルスタックに依存するすべてのツールで共有されます。これにより、最終的なコンテナイメージを小さく保ちながら、AI をすべてインストールした場合には、以下のより大きなストレージ容量に達します。

ツールによっては、複数の共有バンドルに依存するものがあります。たとえば証明写真には `background-removal` と `face-detection` の両方が必要で、`background-removal` がすでにインストールされていれば、証明写真を有効にしても不足している `face-detection` バンドルだけがダウンロードされます。すべての AI ツールで、同じように再利用されます。

オプションの AI パックのストレージ容量と CPU メモリの下限は次のとおりです（SnapOtter は、Python サイドカーに処理を渡す前に利用可能なメモリを確認し、バンドルの空きメモリの下限を下回る場合は直ちに実行を拒否します）。

| バンドル | ディスクサイズ | CPU メモリの下限 |
|---|---|---|
| 顔検出 | 200 から 300 MB | ホスト RAM 2 GB（空き約 0.5 GB） |
| 文字起こし | 約 600 MB | ホスト RAM 4 GB（空き約 2 GB） |
| オブジェクト消去とカラー化 | 1 から 2 GB | ホスト RAM 4 GB（空き約 2 GB） |
| 高精度 OCR（`balanced`/`best`） | ダウンロード約 208 から 234 MiB / インストール後約 409 から 488 MiB | 設定上の実効メモリ 4 GiB（`fast` は 2 GB で動作） |
| 背景除去 | 4 から 5 GB | ホスト RAM 4 GB（空き約 2.5 GB） |
| アップスケール、顔の補正、ノイズ除去 | 5 から 6 GB | ホスト RAM 4 GB（空き約 2.5 GB） |
| 写真の復元 | 4 から 5 GB | ホスト RAM 4 GB（空き約 3 GB） |
| 高品質インペインティング（`inpaint-hq`） | 5 から 7 GB | ホスト RAM 8 GB（空き約 6 GB） |
| **すべてのバンドル** | **インストール後 約 25 GB** | **4 GB（`inpaint-hq` を使う場合は 8 GB）** |

高速 OCR は Tesseract を通じてイメージに組み込まれており、約 25 MiB を追加しますが、オプションの OCR パックも、その 4 GiB のメモリ要件も必要ありません。高速 OCR は `auto`、`en`、`de`、`es`、`fr`、`zh`、`ja` をサポートしますが、韓国語（`ko`）とアラビア語（`ar`）はサポートしません。この 2 つは `balanced` または `best` を使うため、高精度パックが必要です。高精度パックは公式の Linux amd64 と arm64 のコンテナで利用でき、ONNX Runtime を CPU で実行します。NVIDIA のホストでも同じ CPU の OCR ランタイムを使うため、OCR は CUDA のバージョンや GPU のアーキテクチャに依存しません。高精度ランタイムには、少なくとも 4 GiB の実効メモリが必要です。これは、設定されているコンテナの cgroup の制限値で、設定がない場合はホストのメモリです。SnapOtter は、署名済みの互換性の最小要件を下回るシステムを、パックをダウンロードする前に拒否します。libc と Python の ABI を保証できないベアメタル/ビルド済みアーカイブでは、高精度パックのインストールも拒否されます。そうした未サポートのホストでは、韓国語とアラビア語の OCR は明示的な非互換エラーを返し、高速 OCR に黙ってフォールバックすることはありません。

同じ `DATA_DIR` を共有するレプリカは、同じ CPU アーキテクチャでなければなりません。複数レプリカのデプロイでは、ノードアフィニティで固定してください。amd64 と arm64 が混在するレプリカには、別々のデータボリュームと、独立した SnapOtter のデプロイが必要です。

高精度ランタイムは、アクティブな世代を 1 つだけ保持し、アクティベーション後にダウンロードキャッシュを消去します。このリリースでは、初回のインストールで一時的に、アーカイブとステージングのために約 620 から 720 MiB が必要です。アップグレードでは、古い世代がアクティブなままの間、ピーク時に約 1.2 GiB に達することがあります。インストーラーは、ダウンロードまたは展開の前に、署名済みのインデックスと現在の世代から正確な必要容量を計算し、データボリュームが小さすぎる場合は早期に失敗します。

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### フル（NVIDIA CUDA で AI ツールを使用） {#full-ai-tools-on-nvidia-cuda}

| リソース | 要件 |
|---|---|
| CPU | 6 から 8 コア（動画の準備と同時実行は、GPU AI を使う場合でも CPU で実行されます） |
| RAM | 8 GB |
| GPU | VRAM 8 GB 以上の NVIDIA（12 GB を推奨） |
| ディスク | 合計約 35 GB |

NVIDIA GPU（CUDA）を使うと、負荷の高い AI モデルが大幅に高速化されます。RTX 4070 と最新の CPU で比較した実測値は次のとおりです。

| AI ツール | GPU による高速化 | 備考 |
|---|---|---|
| AI アップスケール（RealESRGAN 2×） | **約 47×** | 最大の効果。1 秒未満に対して約 33 秒（大きい画像では数分） |
| 顔の補正（CodeFormer） | **約 12×** | 約 0.9 秒に対して約 11 秒 |
| 文字起こし（Whisper） | 約 4.5× | |
| 背景の除去 / 置換 / ぼかし | 約 4× | GPU で約 7 秒、CPU で約 29 秒 |
| カラー化 | 約 1.8× | |
| OCR、顔検出、赤目補正、ノイズ除去 | 約 1× | CPU でもすでに高速。GPU は役に立ちません |
| 写真の復元 | なし | GPU を使っても CPU に依存します（GPU の使用率は 0%）。ここでは GPU よりも高速な CPU のほうが重要です |

GPU を使う価値があるツールは、**アップスケール、顔の補正、文字起こし、背景除去**です。顔検出、OCR、赤目補正は CPU に依存し、すでに高速なため、GPU を使っても何も変わりません。

VRAM の使用量は、顔の補正付きのアップスケール中にピークの 7.5 GB に達します。6 GB の NVIDIA GPU では、ほとんどの AI ツールを個別になら実行できますが、アップスケールは失敗します。VRAM が 8 から 12 GB あれば、すべてを処理できます。

VA-API、Quick Sync、OpenCL による Intel/AMD の iGPU アクセラレーションは、現在 AI 推論ではサポートされていません。`/dev/dri` をコンテナにマッピングしても AI の GPU アクセラレーションは有効にならず、NVIDIA CUDA が利用できない限り、SnapOtter は AI ツールを CPU で実行します。

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

### 同時ユーザー数 {#concurrent-users}

デフォルトの 4 コアに制限されたアプリコンテナに対する、並列の画像リサイズリクエストの結果です。

| 同時リクエスト数 | 平均応答時間 | エラー |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

ワーカープールが飽和しても、応答時間は線形より緩やかにしか悪化せず、エラーも発生しません。アプリコンテナの `cpus:` の上限を引き上げる（またはコア数の多いホストを使う）と、上限が上がります。なお、重いジョブ（動画のトランスコード、CPU での AI）は実行時間の全体にわたってワーカーを占有するため、リクエスト数だけでなく、同時に実行されると想定する重いジョブの数に合わせて CPU を見積もってください。

### サポートされる画像フォーマット {#supported-image-formats}

SnapOtter は、**55 以上の入力フォーマット**と **14 の出力フォーマット**をサポートしています。20 以上のカメラブランドの RAW ファイル、プロ向けフォーマット（PSD、EPS、OpenEXR、HDR）、最新のコーデック（JPEG XL、AVIF、HEIC、QOI）、科学/ゲーム向けフォーマット（FITS、DDS）が含まれます。

サポートされるすべてのフォーマット、使用されるデコーダー、利用可能な品質設定の詳細は、[フォーマットの完全な一覧](/ja/guide/supported-formats)を参照してください。

### 既知の制限事項 {#known-limitations}

- **コンテンツアウェアリサイズ**は、caire バイナリの制限により、大きな画像（5 MP 超）でクラッシュします。小さい画像では問題なく動作します。
- **HEIF のデコード**には 13 から 23 秒かかります。HEIC（Apple の派生形式）は 0.3 から 0.9 秒と、はるかに高速です。
- **アップスケール**は、小さな画像を超えると CPU ではタイムアウトします。実用的に使うには GPU が必要です。
- **CodeFormer** による顔の補正は、GFPGAN よりも大幅に遅くなります（GPU で 53 秒に対して 2 秒）。ほとんどの用途では GFPGAN を推奨します。

## ボリューム {#volumes}

| マウント / ボリューム | 用途 | 必須か |
|---|---|---|
| `/data`（app） | AI モデル、Python の venv、ユーザーファイル | **はい**。ないとファイルが失われます |
| `/tmp/workspace`（app） | 一時的な処理ファイル（自動クリーンアップ） | 推奨 |
| `SnapOtter-pgdata`（postgres） | PostgreSQL のデータディレクトリ（ユーザー、設定、パイプライン、ジョブ） | **はい**。ないとデータが失われます |
| `SnapOtter-redisdata`（redis） | 永続的なジョブキューのための Redis の追記専用ファイル | 推奨 |

### バインドマウントと名前付きボリューム {#bind-mounts-vs-named-volumes}

**名前付きボリューム**（推奨）: Docker がパーミッションを自動的に管理します。
```yaml
volumes:
  - SnapOtter-data:/data
```

**バインドマウント**: パーミッションは自分で管理します。ホストのユーザーに合わせて `PUID`/`PGID` を設定します。
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### ストレージの権限 {#storage-permissions}

SnapOtter は実行時に 2 か所へ書き込みます。`/data`（ユーザーファイル、ログ、AI モデル、Python の venv）と `/tmp/workspace`（一時的な処理用のスクラッチ領域）です。どちらも、コンテナが実行されるユーザーが書き込める必要があります。どちらかが書き込めない場合、コンテナは**起動時に即座に失敗し**、ディレクトリ名、実行中の UID/GID、修正方法を示すメッセージを出力します。「healthy」で起動した後に、最初のアップロードでわかりにくいエラーで失敗することはありません。ログディレクトリ（`LOG_DIR`、イメージでは `/data/logs`）も、ファイルが S3 にある場合でもログはローカルに残るため、すべてのストレージモードで同じように確認されます。

パーミッションの扱いは、コンテナの起動方法によって異なります。

**デフォルト（root で起動し、`snapotter` に切り替える）**: エントリポイントは root で起動し、マウントされたボリュームの所有権を修正してから、`gosu` を通じて権限のない `snapotter` ユーザーに切り替えます。名前付きボリュームは設定なしで動作します。バインドマウントでは、書き込まれるファイルの所有者が自分になるように、`PUID`/`PGID` をホストのユーザー（上記）に設定してください。

**Kubernetes / OpenShift（`runAsUser` による非 root）**: 非 root ユーザーとして直接起動するため、コンテナ自身ではボリュームを chown できません。そのため、オーケストレーター側でボリュームを書き込み可能にする必要があります。`fsGroup` を設定します。

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

イメージの書き込み可能なディレクトリは、GID 0 のグループが所有し、グループに書き込み権限があります。そのため、**任意の UID** で、root の補助グループ（OpenShift のデフォルト）付きで実行される Pod は、`chown` なしで書き込めます。

**TrueNAS Scale（およびその他の「他の UID」構成）**: TrueNAS はアプリを非 root ユーザー（多くは `568:568`）として実行し、別のユーザーが所有するホストのデータセットをマウントします。そのため、エントリポイントも `fsGroup` も、単独ではそれらを書き込み可能にできません。次のいずれかを選んでください。

- **アプリを root で実行する**（推奨）: アプリのユーザーを未設定にするか `0` に設定し、デフォルトのエントリポイントにパーミッションの修正と `snapotter` への切り替えを任せます。
- **UID `999` で実行する**: イメージの所有権と一致するように、アプリのユーザー/グループを `999:999`（SnapOtter に組み込まれた `snapotter` ユーザー）に設定します。
- **ホストのデータセットを `chown` する**: TrueNAS のシェルから、コンテナが実行される UID にします。

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

起動時のエラーには、使うべき正確な UID が示されます。そのため最も手早い方法は、アプリを一度起動してメッセージを読み、それに従って `chown`（またはユーザーの調整）を行うことです。

## 環境変数 {#environment-variables}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `AUTH_ENABLED` | `true` | ログインの要否を有効/無効にします |
| `DEFAULT_USERNAME` | `admin` | 初期の管理者ユーザー名 |
| `DEFAULT_PASSWORD` | `admin` | 初期の管理者パスワード（初回ログイン時に変更が必須） |
| `MAX_UPLOAD_SIZE_MB` | `0`（無制限） | ファイルごとのアップロード上限（MB）。イメージでは `0` が設定済みで、ソースビルドでは 100 から始まります |
| `MAX_BATCH_SIZE` | `0`（無制限） | バッチリクエストあたりの最大ファイル数。イメージでは `0` が設定済みで、ソースビルドでは 100 から始まります |
| `RATE_LIMIT_PER_MIN` | `1000` | IP ごとの 1 分あたりの API リクエスト数（0 を設定すると無効） |
| `MAX_USERS` | `0`（無制限） | ユーザーアカウントの最大数 |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | `X-Forwarded-For` を通じてクライアント IP を設定できるピア。デフォルトではプライベートネットワークのみ |
| `PUID` | `999` | この UID で実行します（バインドマウントのパーミッション用） |
| `PGID` | `999` | この GID で実行します（バインドマウントのパーミッション用） |
| `LOG_LEVEL` | `info` | ログの詳細度: fatal、error、warn、info、debug、trace |
| `CONCURRENT_JOBS` | `0`（自動） | AI 処理ジョブの最大並列数 |
| `SESSION_DURATION_HOURS` | `168` | ログインセッションの有効期間（7 日間） |
| `CORS_ORIGIN` | （空） | 許可するオリジンのカンマ区切りリスト。空の場合は同一オリジン |

### アウトバウンドプロキシとプライベート CA {#outbound-proxy-and-private-ca}

公式のコンテナでは、Node の環境変数によるプロキシのサポートが有効になっています。SnapOtter が企業のプロキシ経由で OCR ランタイムのリポジトリやその他の HTTPS サービスに接続する必要がある場合は、`HTTPS_PROXY` を設定してください（必要に応じて `HTTP_PROXY` も）。`NO_PROXY` には、直接接続する必要があるホスト（Postgres、Redis、社内のオブジェクトストレージなど）をカンマ区切りのリストで設定します。

プロキシや社内サービスがプライベートな認証局で署名されている場合は、CA 証明書を読み取り専用でマウントし、`NODE_EXTRA_CA_CERTS` でそのパスを指定します。このファイルは、Node プロセスの起動時に存在している必要があります。

```yaml
services:
  app:
    environment:
      HTTPS_PROXY: http://proxy.example.internal:3128
      HTTP_PROXY: http://proxy.example.internal:3128
      NO_PROXY: postgres,redis,minio,localhost,127.0.0.1
      NODE_EXTRA_CA_CERTS: /etc/snapotter/custom-ca.pem
    volumes:
      - ./company-ca.pem:/etc/snapotter/custom-ca.pem:ro
```

プロキシの認証情報は、Compose ファイルの外（たとえば保護された `.env` ファイルやシークレット）に置いてください。TLS の検証は無効にしないでください。署名済みの OCR インデックスはリリースのメタデータを認証しますが、通常の TLS 検証は、転送経路とその他すべてのアウトバウンドリクエストを引き続き保護します。

## ヘルスチェック {#health-check}

コンテナには、組み込みのヘルスチェックが含まれています。

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## リバースプロキシ {#reverse-proxy}

`TRUST_PROXY` のデフォルトは `loopback,linklocal,uniquelocal` のため、SnapOtter は、プライベートネットワーク上のピアからの `X-Forwarded-For` だけを信頼します。同じホスト上、Docker ネットワーク上、または LAN 上のリバースプロキシは、最初から信頼されます。つまり、レート制限、ログインのブルートフォース対策、監査ログ、エンタープライズの IP 許可リストのすべてが、設定なしで実際のクライアント IP を認識します。

前段のプロキシが**パブリック**アドレス（たとえば別のネットワークにあるクラウドのロードバランサー）から SnapOtter に接続する場合にのみ、`TRUST_PROXY=true` を設定してください。直接公開されているインスタンスでこの値を設定すると、ヘッダーを書き換える呼び出し元はリクエストごとに新しいレート制限のバケットを得られるため、`request.ip` が攻撃者に制御されてしまいます。

クライアント IP を計測する前に、2 つ知っておくべきことがあります。macOS と Windows の Docker Desktop は、公開されたポートをユーザーランドのプロキシ経由で提供し、すべての送信元アドレスを VM のゲートウェイ `192.168.65.1` に書き換えます。そのため、`TRUST_PROXY` のどの値でも実際のクライアントは復元できません。インターネットに公開する用途では、Linux にデプロイしてください。また、どのプラットフォームでも、`localhost` 経由で公開ポートに到達すると、クライアントではなくブリッジのゲートウェイとして観測されます。そのため、localhost でのテストからは、実際のクライアントがどのように識別されるかはわかりません。`TRUST_PROXY` の値の完全な一覧と Docker Desktop に関する注意点は、[SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy) にあります。

以下のどのプロキシでも重要なことが 2 つあります。大きなリクエストボディ（アップロード）を許可することと、レスポンスをバッファリングしないことです。レスポンスをバッファリングするプロキシは、SSE の進行状況を壊し、さらに目立つ形では、プロキシがファイル全体を保持してから転送するため、大きなファイルのダウンロードが「開始されるが完了しない」状態になります。SnapOtter はダウンロード時に `X-Accel-Buffering: no` を送信するため、他の場所でバッファリングが有効なままでも nginx はストリーミングしますが、nginx 以外のプロキシでは、レスポンスのバッファリングを明示的に無効にする必要があります（以下の各設定に示します）。ダウンロードが途中で止まる場合は、まず前段にバッファリングするプロキシがないか確認してください。

HSTS についての注意: API は、すべてのレスポンスで `Strict-Transport-Security` を自身で送信します。そのため、レスポンスヘッダーをそのまま通すプロキシ（以下の設定はすべてそうです）では、プロキシ側で HSTS を設定する必要はありません。プロキシが上流のレスポンスヘッダーを削除または上書きするように設定されている場合にのみ、そのヘッダーを保持するか、エッジで再度追加する必要があります。

### Nginx {#nginx}

```nginx
server {
    # Plain HTTP shown for brevity. Terminate TLS in your own `listen 443 ssl`
    # server block; the Strict-Transport-Security header the API sends passes
    # through with every proxied response, so no add_header is needed there.
    listen 80;
    server_name images.example.com;

    # Match MAX_UPLOAD_SIZE_MB (0 = nginx default 1M, so set high for unlimited)
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:1349;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Stream responses instead of buffering: needed for SSE progress
        # (batch, AI, feature installs) and for large file downloads.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### サブパスでのデプロイ {#subpath}

`https://example.com/snapotter` で提供するには、SnapOtter コンテナの環境に `BASE_PATH=/snapotter` を設定して再起動します。公式の CPU 用と GPU 用の Compose ファイルでも、シェルまたは Compose の `.env` ファイルから `BASE_PATH` を指定できます。同じイメージがどのパスでも動作し、フロントエンドの再ビルドは不要です。

`BASE_PATH` には、英字、数字、`_`、または `-` を含む、スラッシュ区切りのセグメントを指定できます。`/apps/snapotter` のような入れ子のパスも使えます。末尾のスラッシュは省略できます。ルートでのデプロイでは、空のままにする（デフォルト）か、`/` を設定してください。

既存の Nginx の HTTPS サーバーブロックで、次のようにします。

```nginx
location = /snapotter {
    return 308 /snapotter/$is_args$args;
}
location /snapotter/ {
    proxy_pass http://localhost:1349;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 500M;
    proxy_buffering off;
    proxy_read_timeout 300s;
}
```

この例ではプレフィックスを保持します。転送前に `/snapotter` を取り除くプロキシにも対応しています。内部のヘルスチェックは、引き続き `/api/v1/health` を使えます。OIDC または SAML を使う場合は、`EXTERNAL_URL=https://example.com/snapotter` も設定し、IdP のコールバック URL を更新して、それぞれ `/snapotter/api/auth/oidc/callback` または `/snapotter/api/auth/saml/callback` を含めてください。

API スクリプトは変更なしで引き続き動作します。ツールの `downloadUrl` など API レスポンス内の URL は、`BASE_PATH` に関係なく `/api/` で始まります。これらは、ドメインのルートに対して解決するのではなく、インスタンスのベース URL（`https://example.com/snapotter` + `/api/v1/download/...`）に付加してください。

UI は、プレフィックス付きの URL（`https://example.com/snapotter`）で開いてください。プレフィックスなしでアクセスしたブラウザは自動的にそちらへ転送されます。プレフィックスなしでアプリに到達することが想定されているのは、API リクエストだけです。ログに `Requests arrive under /snapotter/ but BASE_PATH is empty` と表示される場合、プロキシは、`BASE_PATH` が宣言していないプレフィックスを転送しています。`BASE_PATH` にそれを設定するか、プロキシでプレフィックスを取り除いてください。

### Nginx Proxy Manager {#nginx-proxy-manager}

1. 新しい Proxy Host を追加します
2. Domain Name にドメインを設定します
3. Scheme を `http`、Forward Hostname を `SnapOtter`（またはコンテナの IP）、Forward Port を `1349` に設定します
4. WebSocket のサポートを有効にします
5. Advanced で `client_max_body_size 500M;` と `proxy_buffering off;` を追加します

API の `Strict-Transport-Security` ヘッダーは NPM をそのまま通過します。SSL タブの HSTS の切り替えは、その上に重ねて使うオプションです。

### Traefik {#traefik}

```yaml
# Add these labels to the SnapOtter service in docker-compose.yml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.snapotter.rule=Host(`images.example.com`)"
  - "traefik.http.routers.snapotter.entrypoints=websecure"
  - "traefik.http.routers.snapotter.tls.certresolver=letsencrypt"
  - "traefik.http.services.snapotter.loadbalancer.server.port=1349"
  # Increase upload limit (default 2MB is too low)
  - "traefik.http.middlewares.snapotter-body.buffering.maxRequestBodyBytes=524288000"
  - "traefik.http.routers.snapotter.middlewares=snapotter-body"
```

Traefik は上流のレスポンスヘッダーを変更せずに転送するため、API の `Strict-Transport-Security` ヘッダーは、`headers` ミドルウェアなしでブラウザに届きます。すでにレスポンスヘッダーを書き換えるミドルウェアを使っている場合は、そのヘッダーを変更しないようにしてください。

### Caddy {#caddy}

```txt
images.example.com {
    reverse_proxy localhost:1349 {
        flush_interval -1
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }
}
```

`flush_interval -1` はレスポンスのバッファリングを無効にします。これは、SSE の進行状況イベント（バッチ処理、AI ツール、機能のインストール）と、大きなファイルのダウンロードが停止せずにストリーミングされるために必要です。延長されたタイムアウトにより、Caddy が接続を早く閉じることなく、大きなファイルのアップロードを完了できます。Caddy は API の `Strict-Transport-Security` ヘッダーもそのまま通すため、HSTS のために `header` ディレクティブは必要ありません。

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

注: Cloudflare の無料プランには 100 MB のアップロード制限があります。それに合わせて `MAX_UPLOAD_SIZE_MB=100` を設定してください。

トンネルは、`Strict-Transport-Security` を含む API のレスポンスヘッダーを転送するため、ダッシュボードでの HSTS の設定は不要です（Cloudflare 自身のエッジの HSTS 設定は、その上に重ねて使うオプションです）。

## トラブルシューティング {#troubleshooting}

### 最初の起動に失敗した直後の「Postgres not reachable: EAI_AGAIN」 {#eai-again-after-failed-first-start}

最初の `docker compose up -d` が途中で失敗した場合（多くはポートがすでに使用中であるため）、単純な `up -d` の再試行では、アプリのコンテナが Compose ネットワークに接続されないまま起動することがあります。その場合、アプリは次のエラーでクラッシュループに陥ります。

```
Postgres not reachable: EAI_AGAIN
```

一方、`docker ps` では postgres は healthy と表示されます。このエラー自体は本物ですが、指している先は誤ったコンテナです。ネットワークがないと、`postgres` ホスト名の DNS をまったく解決できず、再起動ポリシーによって同じ失敗が延々と繰り返されます。

最初の起動を妨げていた原因（多くはポートの解放）を修正してから、アプリのコンテナを強制的に再作成して、ネットワークに再接続させてください。

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: 他のデバイスからは到達できるが、PC 自身からは到達できない {#windows-wsl2-loopback}

Docker を WSL2 内で実行している場合（Windows での一般的なセットアップ）、スタックはネットワーク上のほかのすべてのマシンから到達できるのに、WSL のミラーモードのネットワークを有効にしていても、Windows ホスト自身では `http://localhost:1349` がタイムアウトすることがあります。ポートは Windows の `netstat` に表示されませんが、コンテナには何も問題はありません。

アプリは、別のデバイスから、またはディストリビューション内部から、そのディストリビューション自身のアドレス（WSL のシェルで `hostname -I`）を使って開いてください。お使いの WSL のバージョンで localhost への転送がたまたま動作する場合でも、それに依存せず、おまけと考えてください。

## CI/CD {#ci-cd}

GitHub リポジトリには 3 つのワークフローがあります。

- **ci.yml**: すべてのプッシュとプルリクエストで自動的に実行されます。リント、型チェック、テスト、ビルド、Docker イメージの検証（プッシュはしません）を行います。
- **release.yml**: `workflow_dispatch` により手動でトリガーします。semantic-release を実行してバージョンタグと GitHub リリースを作成し、その後、マルチアーキテクチャ（amd64 と arm64）の Docker イメージをビルドして、Docker Hub（`snapotter/snapotter`）と GitHub Container Registry（`ghcr.io/snapotter-hq/snapotter`）にプッシュします。
- **deploy-docs.yml**: このドキュメントサイトをビルドし、`main` へのプッシュ時に Cloudflare Pages にデプロイします。

リリースを作成するには、GitHub の UI で **Actions > Release > Run workflow** に移動するか、次を実行します。

```bash
gh workflow run release.yml
```

semantic-release は、コミット履歴からバージョンを決定します。`latest` の Docker タグは、常に最新のリリースを指します。

## 分析 {#analytics}

SnapOtter には、バグの発見と機能の改善に役立てるため、匿名のプロダクト分析（ツールの使用パターン、エラーレポート）が含まれています。デフォルトで有効です。お客様のファイル、ファイル名、個人データがその対象になることはありません。分析を無効にしても、SnapOtter は通常どおり動作します。

### 分析を無効にする {#disabling-analytics}

ランタイムでのオプトアウトは、管理者がワンクリックで切り替えられます。Settings > System > Privacy を開き、Anonymous Product Analytics をオフにします。インスタンス全体で即座に停止し、再ビルドは不要です。

分析を絶対に送信しないイメージにするには、リポジトリをクローンして再ビルドし、ビルド時のハードオフを設定します。

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

または、既存の `docker-compose.yml` にビルド引数を追加します。

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
