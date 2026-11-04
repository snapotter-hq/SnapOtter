---
description: "Docker を使って SnapOtter を本番環境にデプロイします。ハードウェア要件、GPU のセットアップ、Nginx、Traefik、Cloudflare のリバースプロキシ設定を扱います。"
i18n_source_hash: 3821f105f4ba
i18n_provenance: machine
i18n_output_hash: 39c989a7fb79
i18n_hash_version: 2
---

# デプロイ {#deployment}

SnapOtter は、SnapOtter アプリイメージ、PostgreSQL 17、Redis 8 の 3 コンテナ構成の Docker Compose スタックとしてデプロイします。アプリイメージは **linux/amd64** (AI アクセラレーション用の NVIDIA CUDA 対応) と **linux/arm64** (CPU) をサポートしているため、Intel/AMD サーバー、Apple Silicon の Mac、Raspberry Pi 4/5 などの ARM デバイスでネイティブに動作します。VA-API、Quick Sync、OpenCL を使った Intel/AMD の iGPU アクセラレーションは、現時点では AI 推論でサポートしていません。

GPU のセットアップ、Docker Compose の例、バージョン固定については [Docker イメージ](./docker-tags)を参照してください。

## クイックスタート (CPU) {#quick-start-cpu}

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

これでアプリは `http://localhost:1349` で利用できます。

上記のスタックはデータベースの所有者として接続します。SnapOtter 2.3.0 以降では、行の読み書きだけを行えるロールでリクエストを処理できます。[最小権限ロール](./database#least-privilege-roles)を参照してください。

> **Docker Hub のレート制限に当たりましたか？** `snapotter/snapotter:latest` を `ghcr.io/snapotter-hq/snapotter:latest` に置き換えると、代わりに GitHub Container Registry からプルできます。どちらのレジストリにも、リリースごとに同じイメージが公開されます。

## クイックスタート (NVIDIA CUDA) {#quick-start-nvidia-cuda}

対応する AI ツール (背景除去、アップスケール、顔補正) で NVIDIA CUDA アクセラレーションを使う場合:

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

ログで CUDA が検出されているか確認します。

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

`--gpus all` と NVIDIA Container Toolkit が正しくセットアップされているのに AI ツールが CPU で動く場合は、該当するバンドル (たとえば背景除去) を **Settings → AI Features** から再インストールしてください。インストーラーが ONNX Runtime の GPU ビルドを復元します。共有 AI 環境では、別のバンドル (文字起こしなど) が取り込んだ CPU 専用ビルドに、GPU ビルドが隠されてしまうことがあります。古いイメージで UI からの再インストールでは GPU が復元されない場合は、[issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490) にある手動の修復手順を参照してください。

## ハードウェア要件 {#hardware-requirements}

ここに示す数値は、NVIDIA RTX 4070 を搭載した最新の amd64 ワークステーションから Raspberry Pi までさまざまなシステムでベンチマークを取り、それぞれでツールカタログ全体を実行しつつ Docker のリソース制限を変えながら実際の下限を探ったものです。

これらの階層の下限付近 (Pi、古いノート PC、2 GB の VPS) で動かす場合は、[低リソース環境のセットアップ](/ja/guide/low-resource)で、これらの数値をチューニング済みの上限値を使った具体的な手順にまとめています。

### クイックリファレンス {#quick-reference}

| 階層 | 用途 | CPU | RAM | GPU | ストレージ |
|------|----------|-----|-----|-----|---------|
| 最小 | AI を使わないツール (画像、ファイル、軽量な PDF) と内蔵の Fast OCR および顔検出、単一ユーザー、小規模なバッチ | 2 コア | 2 GB | なし | 約 7 GB |
| 推奨 | 動画、PDF、標準の AI バンドルを CPU で使う 5 つのモダリティすべて、バッチ、数人のユーザー | 4 コア | 4 GB (HQ インペインティングは 8 GB) | なし | 約 25 GB |
| フル | GPU AI を含むすべてを高速に、大規模なバッチ、多数のユーザー | 6-8 コア | 8 GB | NVIDIA 8 GB 以上の VRAM (12 GB なら余裕あり) | 約 35 GB |

**アーキテクチャ: 64 ビットのみ** (`linux/amd64` または `linux/arm64`)。SnapOtter は、Intel/AMD サーバー、Apple Silicon の Mac、**Raspberry Pi 4 と 5** (4-8 GB) を含む 64 ビット ARM ボードでネイティブに動作します。32 ビット ARM (`armv7`/`armhf`) では動作しません。そのためのイメージはビルドされていません。また、Pi Zero のような 512 MB クラスのボードもメモリの下限を下回るため動作しません (後述)。

### 最小 (画像、ファイル、軽量な PDF ツール、AI なし) {#minimum-image-files-and-light-pdf-tools-no-ai}

| リソース | 要件 |
|---|---|
| CPU | 2 コア |
| RAM | 2 GB |
| ディスク | 約 5.5 GB (イメージ) + データボリューム |
| GPU | 不要 |

AI を使わないカタログの 222 ツールすべて、つまり画像 (リサイズ、切り抜き、変換、圧縮、調整、透かし)、動画 (トリム、ミュート、リミックス)、音声 (変換、ノーマライズ、トリム)、PDF (結合、分割、圧縮、回転、保護)、ファイル変換、専用の変換プリセットは、控えめなハードウェアでも動作します。ほとんどの操作は、大きなファイルでも 1 秒を大きく下回る時間で終わります。2.7 MB の画像のリサイズは約 0.05 秒、WebP への再エンコードは約 2 秒です。

メモリの下限は、Docker のリソース制限を変えて調べた実測に基づくものです。**512 MB ではスタックを起動できず** (画像のリサイズ 1 回でも強制終了されます)、**1 GB** では単一ファイルの操作は処理できますが、複数ファイルのバッチではメモリ不足になります。AI を使わないバッチを余裕をもって処理できる最小構成は **2 GB / 2 コア**です。内蔵の Fast OCR と `face-detection` バンドルも 2 GB に収まります。一方、より大きな AI バンドル (Whisper、LaMa/DDColor、rembg、RealESRGAN、写真修復、SD1.5 HQ インペインティング) は 4 から 8 GB の RAM を必要とし、空きメモリがバンドルごとの下限を下回る場合は、最初の段階で実行が拒否されます。

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**CPU 負荷が高い唯一の例外は動画の再エンコードです。** ストリームコピーの操作 (トリム、ミュート、コンテナのリミックス) は一瞬で終わりますが、別のコーデックへのトランスコードは CPU に律速されます。1080p / 45 秒のクリップを VP9 (WebM) に再エンコードすると、高速な最新の CPU でおよそ **約 40 秒**、Apple Silicon で約 45 秒、古いモバイル向け 4 コアで約 80 秒、古い 4 コアサーバーで **約 130 秒**かかります。動画中心のワークロードでは、CPU のコア数とクロック速度を優先するか、コンテナの `cpus:` 制限を引き上げてください。同梱の Compose はアプリをデフォルトで 4 コアに制限しています (GPU 用 Compose では 8 コア)。

### 推奨 (CPU での AI ツール) {#recommended-ai-tools-on-cpu}

| リソース | 要件 |
|---|---|
| CPU | 4 コア |
| RAM | 4 GB |
| ディスク | 3 GB (イメージ) + 約 20 GB (オプションの AI パックすべて) + ワークスペース |
| GPU | 不要 (CPU にフォールバック) |

**推奨が RAM 4 GB になる理由は、大きな AI バンドルのインストールと実行です。** オプションのパックを何もインストールしていない状態では、アプリのアイドル時のメモリ使用量は約 360 MB です。従来の Python ツールは 1 つのサイドカーを共有し、高精度 OCR は、有効な不変の世代に固定された専用の長寿命ディスパッチャーを使います。アクティベーションの前に、インストーラーは候補に対してスモークテストを実行します。その後、新しいディスパッチャーにアトミックに切り替え、ガベージコレクションの前に以前のディスパッチャーをドレインします。公式の高精度 OCR アーティファクトはすべて、4 GiB の cgroup 内で最悪ケースのリリーススイートに合格する必要があります。ホストに 4 GB を推奨しているのは、Node.js アプリケーション、Postgres、Redis、キュー、並行して動く処理の余裕を確保するためです。

ほとんどの AI ツールは CPU でも十分に使えますが、いくつかは GPU が欲しくなります。最新の 4 コア CPU での実測値です。

| AI ツール | CPU での時間 | CPU で実用的か |
|---|---|---|
| 顔検出 (blur-faces、smart-crop、red-eye)、ノイズ除去 | 1 秒未満 | はい |
| OCR、文字起こし、字幕 | 1-3 秒 | はい |
| カラー化、顔補正 | 約 10 秒 | はい |
| 背景の除去 / 置換 / ぼかし | 約 29 秒 | はい (待つことになります) |
| AI アップスケール (RealESRGAN) | 小さい画像で約 33 秒、大きい画像では数分 | 限定的。GPU を強く推奨します |
| 写真修復 (フルパイプライン) | 数分 | いいえ。GPU か高速なメニーコア CPU が必要です |

SnapOtter は、これらのモデルのダウンロードを意図的に Docker イメージに含めていません。AI バンドルは、管理者が関連するツールを有効にしたときにだけ取得され、永続的な `/data/ai` ボリュームに保存され、同じモデルスタックに依存するすべてのツールで共有されます。これにより最終的なコンテナイメージを小さく保ちながら、AI を完全にインストールした場合は下記のより大きなストレージ容量に達します。

複数の共有バンドルに依存するツールもあります。たとえばパスポート写真は `background-removal` と `face-detection` の両方を必要とします。`background-removal` がすでにインストールされている場合、パスポート写真を有効にしても、足りない `face-detection` バンドルだけがダウンロードされます。同じ再利用がすべての AI ツールに当てはまります。

オプションの AI パックのストレージ容量と CPU メモリの下限です (SnapOtter は Python サイドカーにディスパッチする前に空きメモリを確認し、バンドルの空きメモリ下限を下回る実行はただちに拒否します)。

| バンドル | ディスクサイズ | CPU メモリの下限 |
|---|---|---|
| 顔検出 | 200-300 MB | ホスト RAM 2 GB (空き約 0.5 GB) |
| 文字起こし | 約 600 MB | ホスト RAM 4 GB (空き約 2 GB) |
| オブジェクト消去 + カラー化 | 1-2 GB | ホスト RAM 4 GB (空き約 2 GB) |
| 高精度 OCR (`balanced`/`best`) | ダウンロード約 208-234 MiB / インストール後約 409-488 MiB | 設定された実効メモリ 4 GiB (`fast` は 2 GB で動作) |
| 背景除去 | 4-5 GB | ホスト RAM 4 GB (空き約 2.5 GB) |
| アップスケール + 顔補正 + ノイズ除去 | 5-6 GB | ホスト RAM 4 GB (空き約 2.5 GB) |
| 写真修復 | 4-5 GB | ホスト RAM 4 GB (空き約 3 GB) |
| 高品質インペインティング (`inpaint-hq`) | 5-7 GB | ホスト RAM 8 GB (空き約 6 GB) |
| **すべてのバンドル** | **インストール後約 25 GB** | **4 GB (`inpaint-hq` を使う場合は 8 GB)** |

Fast OCR は Tesseract を通じてイメージに組み込まれており、容量は約 25 MiB 増えるだけで、オプションの OCR パックも 4 GiB のメモリ要件も必要ありません。Fast は `auto`、`en`、`de`、`es`、`fr`、`zh`、`ja` に対応していますが、韓国語 (`ko`) とアラビア語 (`ar`) には対応していません。この 2 つは `balanced` または `best` を使うため、高精度パックが必要です。高精度パックは公式の Linux amd64 および arm64 コンテナで利用でき、ONNX Runtime を CPU 上で実行します。NVIDIA ホストでもその同じ CPU OCR ランタイムを使うため、OCR は CUDA のバージョンや GPU アーキテクチャに依存しません。高精度ランタイムには、少なくとも 4 GiB の実効メモリが必要です。これは設定されたコンテナの cgroup 制限で、設定がなければホストのメモリです。SnapOtter は、署名付きの互換性の最小要件を下回るシステムを、パックをダウンロードする前に拒否します。また、libc と Python ABI を保証できないベアメタル / ビルド済みアーカイブでは、高精度パックのインストールも拒否されます。そうしたサポート対象外のホストでは、韓国語とアラビア語の OCR は明示的な非互換エラーを返し、黙って Fast にフォールバックすることはありません。韓国語に対して Fast を明示的に要求した場合は、ジョブがキューに入る前に `fast-korean-unsupported` の理由とともに `FEATURE_INCOMPATIBLE` が返されます。

同じ `DATA_DIR` を共有するレプリカは、同じ CPU アーキテクチャでなければなりません。複数レプリカのデプロイでは、ノードアフィニティで固定してください。amd64 と arm64 が混在するレプリカには、別々のデータボリュームと独立した SnapOtter デプロイが必要です。

高精度ランタイムは有効な世代を 1 つだけ保持し、アクティベーション後にダウンロードキャッシュを削除します。このリリースでは、初回インストール時にアーカイブとステージングのために一時的に約 620-720 MiB が必要で、アップグレード時は古い世代が有効なままの間、ピークで約 1.2 GiB に達することがあります。インストーラーは、ダウンロードや展開の前に、署名付きインデックスと現在の世代から必要な容量を正確に計算し、データボリュームが小さすぎる場合は早い段階で失敗します。

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### フル (NVIDIA CUDA での AI ツール) {#full-ai-tools-on-nvidia-cuda}

| リソース | 要件 |
|---|---|
| CPU | 6-8 コア (動画の準備と並行処理は、GPU AI を使っていても CPU で実行されます) |
| RAM | 8 GB |
| GPU | 8 GB 以上の VRAM を持つ NVIDIA (12 GB を推奨) |
| ディスク | 合計約 35 GB |

NVIDIA GPU (CUDA) は、負荷の高い AI モデルを大幅に高速化します。RTX 4070 と最新の CPU を比較した実測値です。

| AI ツール | GPU による高速化 | 備考 |
|---|---|---|
| AI アップスケール (RealESRGAN 2×) | **約 47 倍** | 最大の効果です。約 33 秒 (大きい画像では数分) が 1 秒未満になります |
| 顔補正 (CodeFormer) | **約 12 倍** | 約 11 秒に対して約 0.9 秒 |
| 文字起こし (Whisper) | 約 4.5 倍 | |
| 背景の除去 / 置換 / ぼかし | 約 4 倍 | CPU の約 29 秒に対して GPU では約 7 秒 |
| カラー化 | 約 1.8 倍 | |
| OCR、顔検出、red-eye、ノイズ除去 | 約 1 倍 | CPU ですでに高速です。GPU は役に立ちません |
| 写真修復 | なし | GPU があっても CPU に律速されます (GPU 使用率 0%)。ここでは GPU よりも高速な CPU のほうが重要です |

GPU を使う価値があるツールは、**アップスケール、顔補正、文字起こし、背景除去**です。顔検出、OCR、red-eye は CPU に律速され、すでに高速なので、GPU を使っても何も変わりません。

VRAM の使用量は、顔補正付きのアップスケール中にピークの 7.5 GB に達します。6 GB の NVIDIA GPU は、ほとんどの AI ツールを個別に使うには十分ですが、アップスケールでは失敗します。8-12 GB の VRAM があればすべてに対応できます。

VA-API、Quick Sync、OpenCL を使った Intel/AMD の iGPU アクセラレーションは、現時点では AI 推論でサポートしていません。コンテナに `/dev/dri` をマッピングしても AI の GPU アクセラレーションは有効になりません。NVIDIA CUDA が利用できない限り、SnapOtter は AI ツールを CPU で実行します。

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

デフォルトの 4 コア上限のアプリコンテナに対する、並列の画像リサイズリクエストです。

| 同時リクエスト数 | 平均応答時間 | エラー |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

ワーカープールが飽和するにつれて、応答時間はエラーなしで線形より緩やかに増加します。アプリコンテナの `cpus:` 制限を引き上げる (またはコア数の多いホストを使う) と、上限が上がります。重いジョブ (動画のトランスコード、CPU での AI) は処理の間ずっとワーカーを占有するため、CPU はリクエスト数だけでなく、同時に実行される重いジョブの数に合わせて見積もってください。

### 対応する画像フォーマット {#supported-image-formats}

SnapOtter は **55 以上の入力フォーマット**と **14 の出力フォーマット**に対応しています。20 以上のカメラブランドの RAW ファイル、プロフェッショナル向けフォーマット (PSD、EPS、OpenEXR、HDR)、最新のコーデック (JPEG XL、AVIF、HEIC、QOI)、科学・ゲーム向けフォーマット (FITS、DDS) を含みます。

対応している各フォーマット、使用するデコーダー、利用できる品質設定の詳細は、[フォーマット一覧](/ja/guide/supported-formats)を参照してください。

### 既知の制限 {#known-limitations}

- **コンテンツに応じたリサイズ**は、caire バイナリの制限により、大きな画像 (5 MP 超) でクラッシュします。小さい画像では問題なく動作します。
- **HEIF のデコード**には 13-23 秒かかります。HEIC (Apple の派生形式) は 0.3-0.9 秒と、はるかに高速です。
- **アップスケール**は、小さな画像を超えると CPU ではタイムアウトします。実用には GPU が必要です。
- **CodeFormer** による顔補正は GFPGAN よりも大幅に遅くなります (GPU で 53 秒に対して 2 秒)。ほとんどの用途では GFPGAN を推奨します。

## ボリューム {#volumes}

| マウント / ボリューム | 用途 | 必須か |
|---|---|---|
| `/data` (app) | AI モデル、Python venv、ユーザーファイル | **はい**。ないとファイルが失われます |
| `/tmp/workspace` (app) | 一時的な処理用ファイル (自動でクリーンアップされます) | 推奨 |
| `SnapOtter-pgdata` (postgres) | PostgreSQL のデータディレクトリ (ユーザー、設定、パイプライン、ジョブ) | **はい**。ないとデータが失われます |
| `SnapOtter-redisdata` (redis) | 永続的なジョブキューのための Redis の append-only ファイル | 推奨 |

### バインドマウントと名前付きボリュームの違い {#bind-mounts-vs-named-volumes}

**名前付きボリューム** (推奨): Docker が権限を自動的に管理します。
```yaml
volumes:
  - SnapOtter-data:/data
```

**バインドマウント**: 権限は自分で管理します。`PUID`/`PGID` をホストのユーザーに合わせて設定してください。
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### ストレージの権限 {#storage-permissions}

SnapOtter は実行時に 2 か所へ書き込みます。`/data` (ユーザーファイル、ログ、AI モデルと Python venv) と、`/tmp/workspace` (一時的な処理用の作業領域) です。どちらも、コンテナを実行するユーザーが書き込める必要があります。どちらかが書き込めない場合、コンテナは**起動時にただちに失敗**し、ディレクトリ、実行中の UID/GID、修正方法を示すメッセージを出力します。「healthy」で起動したあと、最初のアップロードで原因のわかりにくいエラーになる、ということはありません。ログディレクトリ (`LOG_DIR`、イメージ内では `/data/logs`) も、ファイルが S3 にある場合でもログはローカルに残るため、すべてのストレージモードで同じように確認されます。

権限の扱いは、コンテナの起動方法によって異なります。

**デフォルト (root で起動し、`snapotter` に降格)**: エントリーポイントは root で起動し、マウントされたボリュームの所有権を修正してから、`gosu` を使って特権のない `snapotter` ユーザーに降格します。名前付きボリュームは設定なしで動作します。バインドマウントでは、`PUID`/`PGID` をホストのユーザーに設定して (上記)、書き込まれるファイルが自分の所有になるようにしてください。

**Kubernetes / OpenShift (`runAsUser` による非 root)**: root 以外のユーザーとして直接起動された場合、コンテナ自体はボリュームを chown できないため、オーケストレーター側でボリュームを書き込み可能にする必要があります。`fsGroup` を設定してください。

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

イメージの書き込み可能なディレクトリは GID 0 のグループ所有で、グループに書き込み権限があります。そのため、**任意の UID** と root の補助グループ (OpenShift のデフォルト) で実行される Pod は、`chown` なしで書き込めます。

**TrueNAS Scale (およびその他の「外部 UID」環境)**: TrueNAS は、アプリを root 以外のユーザー (多くは `568:568`) として実行し、別のユーザーが所有するホストのデータセットをマウントします。そのため、エントリーポイントも `fsGroup` も、それだけではデータセットを書き込み可能にできません。次のいずれかを選んでください。

- **アプリを root で実行する** (推奨): アプリのユーザーを未設定にするか `0` に設定し、デフォルトのエントリーポイントに権限の修正と `snapotter` への降格を任せます。
- **UID `999` で実行する**: アプリのユーザー/グループを `999:999` (SnapOtter 組み込みの `snapotter` ユーザー) に設定し、イメージの所有権と合わせます。
- **ホストのデータセットを `chown` する**: TrueNAS のシェルから、コンテナが実行される UID に変更します。

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

起動時のエラーには使うべき UID が正確に示されるため、最も手早い方法は、一度アプリを起動してメッセージを読み、それに従って `chown` する (またはユーザーを調整する) ことです。

## 環境変数 {#environment-variables}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `AUTH_ENABLED` | `true` | ログイン必須の有効 / 無効 |
| `DEFAULT_USERNAME` | `admin` | 初期管理者のユーザー名 |
| `DEFAULT_PASSWORD` | `admin` | 初期管理者のパスワード (初回ログイン時に変更を強制) |
| `MAX_UPLOAD_SIZE_MB` | `0` (無制限) | ファイルごとのアップロード上限 (MB)。イメージは `0` で出荷され、ソースビルドは 100 から始まります |
| `MAX_BATCH_SIZE` | `0` (無制限) | バッチリクエストあたりの最大ファイル数。イメージは `0` で出荷され、ソースビルドは 100 から始まります |
| `RATE_LIMIT_PER_MIN` | `1000` | IP ごとの 1 分あたりの API リクエスト数 (0 にすると無効) |
| `MAX_USERS` | `0` (無制限) | ユーザーアカウントの最大数 |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | `X-Forwarded-For` を通じてクライアント IP を設定できるピア。デフォルトではプライベートネットワークのみ |
| `PUID` | `999` | この UID で実行 (バインドマウントの権限用) |
| `PGID` | `999` | この GID で実行 (バインドマウントの権限用) |
| `LOG_LEVEL` | `info` | ログの詳細度: fatal、error、warn、info、debug、trace |
| `CONCURRENT_JOBS` | `0` (自動) | 並列 AI 処理ジョブの最大数 |
| `SESSION_DURATION_HOURS` | `168` | ログインセッションの有効期間 (7 日) |
| `CORS_ORIGIN` | (空) | 許可するオリジンのカンマ区切りリスト。空の場合は同一オリジン |

### アウトバウンドプロキシとプライベート CA {#outbound-proxy-and-private-ca}

公式コンテナでは、Node の環境プロキシサポートが有効になっています。SnapOtter が OCR ランタイムのリポジトリやその他の HTTPS サービスに社内プロキシ経由で接続する必要がある場合は、`HTTPS_PROXY` を設定してください (必要に応じて `HTTP_PROXY` も)。直接接続すべきホスト (Postgres、Redis、社内のオブジェクトストレージなど) は、`NO_PROXY` にカンマ区切りのリストで指定します。

プロキシや社内サービスがプライベート認証局で署名されている場合は、CA 証明書を読み取り専用でマウントし、`NODE_EXTRA_CA_CERTS` でそのパスを指定してください。このファイルは Node プロセスの起動時に存在している必要があります。

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

プロキシの認証情報は、Compose ファイルの外 (たとえば保護された `.env` ファイルやシークレット) に置いてください。TLS 検証は無効にしないでください。署名付きの OCR インデックスはリリースメタデータを認証しますが、通常の TLS 検証は引き続き通信経路と、その他すべてのアウトバウンドリクエストを保護します。

## ヘルスチェック {#health-check}

コンテナには組み込みのヘルスチェックが含まれています。

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## リバースプロキシ {#reverse-proxy}

`TRUST_PROXY` のデフォルトは `loopback,linklocal,uniquelocal` です。そのため SnapOtter は、プライベートネットワーク上のピアからの `X-Forwarded-For` だけを信頼します。同じホスト上、Docker ネットワーク上、または LAN 上のリバースプロキシは最初から信頼されるので、レート制限、ログインのブルートフォース対策、監査ログ、エンタープライズの IP 許可リストのいずれも、設定なしで実際のクライアント IP を認識します。

`TRUST_PROXY=true` を設定するのは、手前のプロキシが**パブリック**アドレスから SnapOtter に到達する場合 (たとえば別のネットワーク上にあるクラウドのロードバランサー) だけにしてください。直接公開されているインスタンスでこの値を設定すると、ヘッダーをローテーションする呼び出し元はリクエストごとに新しいレート制限バケットを得られるため、`request.ip` が攻撃者に制御されてしまいます。

クライアント IP を計測する前に、2 つ知っておくことがあります。macOS と Windows の Docker Desktop は、公開されたポートをユーザーランドのプロキシ経由で提供し、すべての送信元アドレスを VM のゲートウェイ `192.168.65.1` に書き換えます。そのため、`TRUST_PROXY` をどの値にしても、そこでは実際のクライアントを復元できません。インターネットに公開するものは Linux にデプロイしてください。そしてどのプラットフォームでも、公開されたポートに `localhost` 経由でアクセスすると、クライアントではなくブリッジのゲートウェイとして観測されます。したがって localhost でのテストからは、実際のクライアントがどう識別されるかはわかりません。`TRUST_PROXY` の値の一覧表と Docker Desktop に関する注意点は、[SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy) にあります。

以下のどのプロキシでも、2 点が重要です。大きなリクエストボディ (アップロード) を許可すること、そしてレスポンスをバッファリングしないことです。レスポンスをバッファリングするプロキシは SSE の進捗表示を壊し、さらに目立つ形では、プロキシがファイル全体を保持してから転送するため、大きなファイルのダウンロードが「始まるが終わらない」状態になります。SnapOtter はダウンロードで `X-Accel-Buffering: no` を送信するため、ほかの場所でバッファリングが有効なままでも nginx はストリーミングしますが、nginx 以外のプロキシでは、レスポンスのバッファリングを明示的に無効にする必要があります (以下の各設定に記載しています)。ダウンロードが途中で止まる場合は、手前にバッファリングを行うプロキシがないか、まず確認してください。

HSTS についての補足です。API は `Strict-Transport-Security` をすべてのレスポンスで自分で送信するため、レスポンスヘッダーをそのまま通すプロキシ (以下の設定はすべてそうです) では、プロキシ側に HSTS の設定は不要です。プロキシが上流のレスポンスヘッダーを削除または上書きするように設定されている場合にのみ、そのヘッダーを保持するか、エッジで再度追加する必要があります。

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

`https://example.com/snapotter` で提供するには、SnapOtter コンテナの環境に `BASE_PATH=/snapotter` を設定して再起動します。公式の CPU 用および GPU 用 Compose ファイルでも、シェルまたは Compose の `.env` ファイルから `BASE_PATH` を指定できます。同じイメージがどのパスでも動作し、フロントエンドの再ビルドは不要です。

`BASE_PATH` には、英字、数字、`_`、または `-` を含む、スラッシュ区切りのセグメントを指定できます。`/apps/snapotter` のようなネストしたパスも使えます。末尾のスラッシュは省略できます。ルートでのデプロイでは、空のまま (デフォルト) にするか、`/` を設定してください。

既存の Nginx の HTTPS server ブロックで、次のように設定します。

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

この例ではプレフィックスを保持します。転送前に `/snapotter` を取り除くプロキシにも対応しています。内部のヘルスチェックは引き続き `/api/v1/health` を使えます。OIDC または SAML を使う場合は、`EXTERNAL_URL=https://example.com/snapotter` も設定し、IdP のコールバック URL を、それぞれ `/snapotter/api/auth/oidc/callback` または `/snapotter/api/auth/saml/callback` を含むように更新してください。

API スクリプトはそのまま動作し続けます。ツールの `downloadUrl` など、API レスポンス内の URL は、`BASE_PATH` の値に関係なく `/api/` で始まります。これらはドメインのルートに対して解決するのではなく、インスタンスのベース URL (`https://example.com/snapotter` + `/api/v1/download/...`) に付け足してください。

UI はプレフィックス付きの URL (`https://example.com/snapotter`) で開いてください。プレフィックスなしでアクセスしたブラウザは自動的にそちらへ転送されます。プレフィックスなしでアプリに到達することが想定されているのは API リクエストだけです。ログに `Requests arrive under /snapotter/ but BASE_PATH is empty` と出る場合は、プロキシが `BASE_PATH` に宣言されていないプレフィックスを転送しています。`BASE_PATH` にそのプレフィックスを設定するか、プロキシ側でプレフィックスを取り除いてください。

### Nginx Proxy Manager {#nginx-proxy-manager}

1. 新しい Proxy Host を追加します
2. Domain Name にドメインを設定します
3. Scheme を `http`、Forward Hostname を `SnapOtter` (またはコンテナの IP)、Forward Port を `1349` に設定します
4. WebSocket サポートを有効にします
5. Advanced で、`client_max_body_size 500M;` と `proxy_buffering off;` を追加します

API の `Strict-Transport-Security` ヘッダーは NPM をそのまま通過します。SSL タブの HSTS トグルは、それに加えて任意で使えます。

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

Traefik は上流のレスポンスヘッダーをそのまま転送するため、API の `Strict-Transport-Security` ヘッダーは `headers` ミドルウェアなしでブラウザに届きます。すでにレスポンスヘッダーを書き換えるミドルウェアを使っている場合は、そのヘッダーが変更されないようにしてください。

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

`flush_interval -1` はレスポンスのバッファリングを無効にします。これは SSE の進捗イベント (バッチ処理、AI ツール、機能のインストール) と、大きなファイルのダウンロードが止まらずにストリーミングされるために必要です。タイムアウトを延長しているのは、Caddy が途中で接続を閉じることなく大きなファイルのアップロードを完了できるようにするためです。Caddy は API の `Strict-Transport-Security` ヘッダーもそのまま通すので、HSTS のために `header` ディレクティブは不要です。

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

注意: Cloudflare には、無料プランで 100 MB のアップロード上限があります。`MAX_UPLOAD_SIZE_MB=100` をそれに合わせて設定してください。

トンネルは、`Strict-Transport-Security` を含む API のレスポンスヘッダーを転送するため、ダッシュボードでの HSTS 設定は不要です (Cloudflare 自体のエッジ HSTS 設定は、それに加えて任意です)。

## トラブルシューティング {#troubleshooting}

### 最初の起動に失敗した直後の「Postgres not reachable: EAI_AGAIN」 {#eai-again-after-failed-first-start}

最初の `docker compose up -d` が途中で失敗した場合 (よくある原因はポートがすでに使用されていることです)、単純な `up -d` での再試行では、アプリコンテナが compose ネットワークに接続されないまま起動することがあります。その場合、アプリは次のエラーでクラッシュループに入ります。

```
Postgres not reachable: EAI_AGAIN
```

一方で `docker ps` では postgres が healthy と表示されます。このエラーは実際に起きていますが、指しているコンテナが違います。ネットワークがないため `postgres` ホスト名の DNS 解決がまったくできず、再起動ポリシーによって同じ失敗が延々と繰り返されます。

最初の起動を妨げていた原因 (たいていはポートの解放) を解決してから、アプリコンテナを強制的に再作成して、ネットワークに再接続させてください。

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: 他のデバイスからは到達できるのに、PC 自体からは到達できない {#windows-wsl2-loopback}

WSL2 内で Docker を実行している場合 (Windows で一般的な構成)、ネットワーク上のほかのすべてのマシンからはスタックに到達できるのに、WSL のミラーモードのネットワークを有効にしても、Windows ホスト自体では `http://localhost:1349` がタイムアウトすることがあります。ポートは Windows の `netstat` には表示されませんが、コンテナには何も問題はありません。

別のデバイスからアプリを開くか、ディストリビューション内部から、そのディストリビューション自身のアドレス (WSL シェルの `hostname -I`) を使って開いてください。お使いの WSL バージョンで localhost フォワーディングがたまたま動作する場合でも、それは当てにせず、おまけと考えてください。

## CI/CD {#ci-cd}

GitHub リポジトリには 3 つのワークフローがあります。

- **ci.yml** - すべての push と PR で自動的に実行されます。lint、型チェック、テスト、ビルドを行い、Docker イメージを (push せずに) 検証します。
- **release.yml** - `workflow_dispatch` から手動でトリガーします。semantic-release を実行してバージョンタグと GitHub リリースを作成し、マルチアーキテクチャ (amd64 + arm64) の Docker イメージをビルドして、Docker Hub (`snapotter/snapotter`) と GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`) に push します。
- **deploy-docs.yml** - このドキュメントサイトをビルドし、`main` への push 時に Cloudflare Pages にデプロイします。

リリースを作成するには、GitHub UI で **Actions > Release > Run workflow** に進むか、次を実行します。

```bash
gh workflow run release.yml
```

semantic-release は、コミット履歴からバージョンを決定します。`latest` Docker タグは常に最新のリリースを指します。

## アナリティクス {#analytics}

SnapOtter には、バグの発見と機能の改善に役立てるための匿名のプロダクトアナリティクス (ツールの利用パターン、エラーレポート) が含まれています。デフォルトで有効です。ファイル、ファイル名、個人データが含まれることはありません。アナリティクスを無効にしても、SnapOtter は通常どおり動作します。

### アナリティクスの無効化 {#disabling-analytics}

実行時のオプトアウトは、管理者がワンクリックで切り替えられます。Settings > System > Privacy を開き、Anonymous Product Analytics をオフにしてください。インスタンス全体で即座に停止し、再ビルドは不要です。

アナリティクスを絶対に送信しないイメージにするには、リポジトリをクローンして再ビルドし、ビルド時のハードオフを設定します。

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
