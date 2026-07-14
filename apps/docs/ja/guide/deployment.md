---
description: "SnapOtter を Docker で本番環境にデプロイします。ハードウェア要件、GPU のセットアップ、Nginx、Traefik、Cloudflare 向けのリバースプロキシ設定を扱います。"
i18n_output_hash: 2b65cb4be9d1
i18n_source_hash: e0d8d5f6fc87
i18n_provenance: human
---

# デプロイ {#deployment}

SnapOtter は 3 コンテナ構成の Docker Compose スタックとしてデプロイされます。SnapOtter アプリイメージ、PostgreSQL 17、Redis 8 です。アプリイメージは **linux/amd64**（AI アクセラレーション向けの NVIDIA CUDA 対応）と **linux/arm64**（CPU）をサポートしており、Intel/AMD サーバー、Apple Silicon Mac、Raspberry Pi 4/5 のような ARM デバイスでネイティブに動作します。VA-API、Quick Sync、OpenCL を介した Intel/AMD iGPU アクセラレーションは、現時点では AI 推論に対応していません。

GPU のセットアップ、Docker Compose の例、バージョン固定については [Docker Image](./docker-tags) を参照してください。


<!-- korean-ocr-contract:start -->
::: info 韓国語 OCR の互換性
高速 OCR は `auto`、`en`、`de`、`es`、`fr`、`zh`、`ja` に対応しますが、韓国語 (`ko`) には対応しません。韓国語には高精度 OCR パックと `balanced` または `best` が必要です。パックは公式 Linux amd64/arm64 コンテナで動作し、NVIDIA ホストでも OCR は CPU 上で実行されます。非対応システムでは明示的な互換性エラーを返し、暗黙に `fast` へ切り替えません。韓国語で `fast` または旧 `tesseract` エイリアスを指定すると、キュー投入前に `FEATURE_INCOMPATIBLE` と `fast-korean-unsupported` で拒否されます。
:::
<!-- korean-ocr-contract:end -->
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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=true         # Trust X-Forwarded-For headers (set false if not behind a proxy)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)
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
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
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

アプリは `http://localhost:1349` で利用可能になります。

> **Docker Hub のレート制限に引っかかりますか？** `snapotter/snapotter:latest` を `ghcr.io/snapotter-hq/snapotter:latest` に置き換えると、代わりに GitHub Container Registry からプルできます。どちらのレジストリもリリースごとに同じイメージを受け取ります。

## クイックスタート（NVIDIA CUDA） {#quick-start-nvidia-cuda}

サポートされている AI ツールでの NVIDIA CUDA アクセラレーションの場合 (背景の削除、アップスケーリング、顔の強調):

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
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

ログで CUDA の検出を確認します：

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## ハードウェア要件 {#hardware-requirements}

これらの数値は、NVIDIA RTX 4070 を搭載した最新の amd64 ワークステーションから Raspberry Pi に至るまで、さまざまなシステムでベンチマークを取ったものです。各システムでツールカタログ全体を実行し、Docker のリソース制限をスイープして実際の下限を見極めました。

### クイックリファレンス {#quick-reference}

| ティア | ユースケース | CPU | RAM | GPU | ストレージ |
|------|----------|-----|-----|-----|---------|
| 最小 | 画像、ファイル、軽量な PDF ツール。単一ユーザー。小さなバッチ | 2 コア | 2 GB | なし | 約 7 GB |
| 推奨 | ビデオ、PDF、CPU 上の AI を含む 5 つのモダリティすべて。バッチ。少数のユーザー | 4 コア | 4 GB | なし | 約 25 GB |
| フル | GPU AI を含めすべてを高速に。大きなバッチ。多数のユーザー | 6〜8 コア | 8 GB | NVIDIA 8 GB 以上の VRAM（12 GB あると余裕） | 約 35 GB |

**アーキテクチャ: 64 ビットのみ**（`linux/amd64` または `linux/arm64`）。SnapOtter は Intel/AMD サーバー、Apple Silicon Mac、そして **Raspberry Pi 4 および 5**（4〜8 GB）を含む 64 ビット ARM ボードでネイティブに動作します。32 ビット ARM（`armv7`/`armhf`）では動作**せず**、そのためのイメージはビルドされません。また、メモリの下限を下回る Pi Zero のような 512 MB クラスのボードでも動作しません（下記参照）。

### 最小（画像、ファイル、軽量な PDF ツール。AI なし） {#minimum-image-files-and-light-pdf-tools-no-ai}

| リソース | 要件 |
|---|---|
| CPU | 2 コア |
| RAM | 2 GB |
| ディスク | 約 5.5 GB（イメージ）+ データボリューム |
| GPU | 不要 |

222 個ある非 AI のカタログツールすべて、つまり画像（リサイズ、切り抜き、変換、圧縮、調整、透かし）、ビデオ（トリミング、ミュート、リマックス）、オーディオ（変換、正規化、トリミング）、PDF（結合、分割、圧縮、回転、保護）、ファイル変換、専用の変換プリセットが、控えめなハードウェアで動作します。ほとんどの処理は、大きなファイルでも 1 秒を大きく下回って完了します。2.7 MB の画像は約 0.05 秒でリサイズされ、約 2 秒で WebP に再エンコードされます。

メモリの下限は現実的なもので、Docker のリソース制限スイープから得られています。**512 MB ではスタックを起動できません**（単一の画像リサイズすら kill されます）。**1 GB** では単一ファイルの処理は扱えますが、複数ファイルのバッチはメモリ不足になります。そして **2 GB / 2 コア** が、バッチを余裕をもって扱える最小構成です。

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**CPU 負荷が高い唯一の例外はビデオの再エンコードです。** ストリームコピー処理（トリミング、ミュート、コンテナのリマックス）は瞬時に終わりますが、別のコーデックへのトランスコードは CPU バウンドです。1080p / 45 秒のクリップを VP9（WebM）に再エンコードすると、高速な最新の CPU でおおよそ **約 40 秒**、Apple Silicon で約 45 秒、古めのモバイル 4 コアで約 80 秒、古い 4 コアのサーバーで **約 130 秒** かかります。ワークロードがビデオ中心であれば、CPU のコア数とクロック速度を優先するか、コンテナの `cpus:` 制限を引き上げてください。同梱の compose はデフォルトでアプリを 4 コアに制限しています（GPU compose では 8 コア）。

### 推奨（CPU 上の AI ツール） {#recommended-ai-tools-on-cpu}

| リソース | 要件 |
|---|---|
| CPU | 4 コア |
| RAM | 4 GB |
| Disk | 3 GB (イメージ) + 約 20 GB (すべてのオプションの AI パック) + ワークスペース |
| GPU | 不要（CPU フォールバック） |

**より大きな AI バンドルをインストールして実行すると、推奨値は 4 GB の RAM になります。** オプション パックがインストールされていない場合、アプリは約 360 MB でアイドル状態になります。 従来の Python ツールは sidecar を共有しますが、正確な OCR は、アクティブな不変世代に固定された専用の長寿命 dispatcher を使用します。 アクティブ化する前に、インストーラーは候補に対して smoke test を実行します。 次に、新しい dispatcher にアトミックに切り替え、garbage collection の前に以前の dispatcher を排出します。 すべての公式の正確な OCR アーティファクトは、4 GiB cgroup 内で最悪の release suite を通過する必要がありますが、4 GB のホスト推奨では、Node.js アプリケーション、Postgres、Redis、キュー、および同時作業のための余裕が残されています。

ほとんどの AI ツールは CPU でも十分に使えますが、いくつかは GPU を強く望みます。最新の 4 コア CPU で測定した結果：

| AI ツール | CPU 時間 | CPU で使えるか？ |
|---|---|---|
| 顔検出（顔のぼかし、スマートクロップ、赤目）、ノイズ除去 | 1 秒未満 | はい |
| OCR、文字起こし、字幕 | 1〜3 秒 | はい |
| カラー化、顔の補正 | 約 10 秒 | はい |
| 背景の除去 / 置換 / ぼかし | 約 29 秒 | はい（待ち時間あり） |
| AI アップスケール（RealESRGAN） | 小さい画像で約 33 秒。大きな画像では数分 | 微妙。GPU を強く推奨 |
| 写真復元（フルパイプライン） | 数分 | いいえ。GPU または高速な多コア CPU が必要 |

SnapOtter は意図的に、これらのモデルのダウンロードを Docker イメージに焼き込んでいません。AI バンドルは、管理者が関連ツールを有効にしたときにのみプルされ、永続的な `/data/ai` ボリュームに保存され、同じモデルスタックに依存するすべてのツールで共有されます。これにより最終的なコンテナイメージを小さく保ちつつ、フルの AI インストールでは下記のより大きなストレージ数値に達することができます。

一部のツールは複数の共有バンドルに依存します。たとえば Passport Photo は `background-removal` と `face-detection` の両方を必要とします。`background-removal` がすでにインストールされていれば、Passport Photo を有効にしても不足している `face-detection` バンドルだけがダウンロードされます。この再利用はすべての AI ツールに同様に当てはまります。

オプションの AI パックのストレージの見積もり:

| バンドル | ディスクサイズ |
|---|---|
| 背景除去 | 4〜5 GB |
| アップスケール + 顔の補正 + ノイズ除去 | 5〜6 GB |
| 顔検出 | 200〜300 MB |
| オブジェクト消去 + カラー化 | 1〜2 GB |
| 正確な OCR (`balanced`/`best`) | ~208-234 MiB ダウンロード / ~409-488 MiB インストール済み |
| 写真復元 | 4〜5 GB |
| 転写 | ~600MB |
| **すべてのバンドル** | **~20 GB がインストールされています** |

高速 OCR は、Tesseract を通じてイメージに組み込まれ、約 25 MiB を追加します。また、オプションの OCR パックやその 4 つの GiB メモリ要件は必要ありません。 正確なパックは、公式の Linux amd64 および arm64 コンテナーで入手でき、ONNX Runtime を CPU 上で実行します。 NVIDIA ホストは同じ CPU OCR ランタイムを使用するため、OCR は CUDA バージョンまたは GPU アーキテクチャに依存しません。 正確なランタイムには、少なくとも 4 GiB の有効メモリ (構成されたコンテナーの cgroup 制限、それ以外の場合はホスト メモリ) が必要です。 SnapOtter は、パックをダウンロードする前に、署名された互換性の最小値を下回るシステムを拒否します。 正確なパックのインストールは、libc および Python ABI が保証できない bare-metal/事前構築済みアーカイブでも拒否されます。

同じ `DATA_DIR` を共有するレプリカは、同じ CPU アーキテクチャを使用する必要があります。複数レプリカのデプロイは、ノードアフィニティを使用して互換性のあるノードに固定してください。amd64 と arm64 が混在するレプリカには、個別のデータボリュームと独立した SnapOtter デプロイが必要です。

正確なランタイムにより、1 つのアクティブな世代が維持され、アクティブ化後にそのダウンロード キャッシュが消去されます。 このリリースでは、最初のインストールには一時的にアーカイブとステージングに約 620 ～ 720 MiB が必要で、古い世代がアクティブなままアップグレードすると、ピークは 1.2 GiB 近くになる可能性があります。 インストーラーは、ダウンロードまたは抽出する前に署名付きインデックスと現在の世代から正確な要件を計算し、データ量が小さすぎる場合は早期に失敗します。

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### フル（NVIDIA CUDA 上の AI ツール） {#full-ai-tools-on-nvidia-cuda}

| リソース | 要件 |
|---|---|
| CPU | 6〜8 コア（ビデオの準備と並行処理は GPU AI 使用時でも CPU で実行される） |
| RAM | 8 GB |
| GPU | 8 GB 以上の VRAM を持つ NVIDIA（12 GB 推奨） |
| ディスク | 合計で約 35 GB |

NVIDIA GPU（CUDA）は重い AI モデルを劇的に高速化します。RTX 4070 と最新の CPU を比較して測定：

| AI ツール | GPU による高速化 | 備考 |
|---|---|---|
| AI アップスケール（RealESRGAN 2×） | **約 47×** | 最大の効果。約 33 秒（大きな画像では数分）に対して 1 秒未満 |
| 顔の補正（CodeFormer） | **約 12×** | 約 11 秒に対して約 0.9 秒 |
| 文字起こし（Whisper） | 約 4.5× | |
| 背景の除去 / 置換 / ぼかし | 約 4× | CPU の約 29 秒に対して GPU で約 7 秒 |
| カラー化 | 約 1.8× | |
| OCR、顔検出、赤目、ノイズ除去 | 約 1× | CPU ですでに高速。GPU は役立たない |
| 写真復元 | なし | GPU 上でも CPU バウンド（GPU 使用率 0%）。ここでは GPU より高速な CPU が重要 |

GPU の価値があるツールは **アップスケール、顔の補正、文字起こし、背景除去** です。顔検出、OCR、赤目は CPU バウンドですでに高速なので、GPU は何も加えません。

ピーク時の VRAM 使用量は、顔の補正を伴うアップスケール中に 7.5 GB に達します。6 GB の NVIDIA GPU はほとんどの AI ツールを個別には動かせますが、アップスケールでは失敗します。8〜12 GB の VRAM ならすべてを扱えます。

VA-API、Quick Sync、OpenCL を介した Intel/AMD iGPU アクセラレーションは、現時点では AI 推論に対応していません。`/dev/dri` をコンテナにマッピングしても AI の GPU アクセラレーションは有効になりません。NVIDIA CUDA が利用できない限り、SnapOtter は AI ツールを CPU で実行します。

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

### 同時ユーザー {#concurrent-users}

デフォルトの 4 コア上限のアプリコンテナに対する並列の画像リサイズリクエスト：

| 同時リクエスト数 | 平均応答時間 | エラー |
|---|---|---|
| 1 | 0.4 秒 | 0 |
| 5 | 1.2 秒 | 0 |
| 10 | 2.1 秒 | 0 |

ワーカープールが飽和するにつれて、応答時間はエラーなしで準線形に劣化します。アプリコンテナの `cpus:` 制限を引き上げる（あるいはコア数の多いホストを使う）と上限が上がります。重いジョブ（ビデオのトランスコード、CPU の AI）は処理が続く間ずっとワーカーを占有するため、CPU はリクエスト数だけでなく、想定される同時実行の重いジョブ数に合わせてサイジングしてください。

### サポートされる画像フォーマット {#supported-image-formats}

SnapOtter は **55 以上の入力フォーマット** と **14 の出力フォーマット** をサポートしています。20 以上のカメラブランドの RAW ファイル、プロ向けフォーマット（PSD、EPS、OpenEXR、HDR）、最新コーデック（JPEG XL、AVIF、HEIC、QOI）、科学・ゲーム向けフォーマット（FITS、DDS）を含みます。

サポートされるすべてのフォーマット、使用されるデコーダー、利用可能な品質コントロールの詳細については、[完全なフォーマット一覧](/ja/guide/supported-formats) を参照してください。

### 既知の制限事項 {#known-limitations}

- **コンテンツ認識リサイズ** は、caire バイナリの制限により大きな画像（5 MP 超）でクラッシュします。より小さい画像では問題なく動作します。
- **HEIF のデコード** には 13〜23 秒かかります。HEIC（Apple の派生形式）は 0.3〜0.9 秒とはるかに高速です。
- **アップスケール** は、小さい画像を超えるものについては CPU でタイムアウトします。実用には GPU が必要です。
- **CodeFormer** の顔の補正は GFPGAN よりかなり遅いです（GPU で 53 秒に対して 2 秒）。ほとんどのユースケースには GFPGAN を推奨します。

## ボリューム {#volumes}

| マウント / ボリューム | 用途 | 必須か？ |
|---|---|---|
| `/data`（アプリ） | AI モデル、Python venv、ユーザーファイル | **はい** - なければファイルが失われる |
| `/tmp/workspace`（アプリ） | 一時的な処理ファイル（自動でクリーンアップ） | 推奨 |
| `SnapOtter-pgdata`（postgres） | PostgreSQL のデータディレクトリ（ユーザー、設定、パイプライン、ジョブ） | **はい** - なければデータが失われる |
| `SnapOtter-redisdata`（redis） | 耐久性のあるジョブキュー用の Redis の追記専用ファイル | 推奨 |

### バインドマウント vs 名前付きボリューム {#bind-mounts-vs-named-volumes}

**名前付きボリューム**（推奨）: Docker が権限を自動的に管理します。
```yaml
volumes:
  - SnapOtter-data:/data
```

**バインドマウント**: 権限は自分で管理します。ホストのユーザーに合わせて `PUID`/`PGID` を設定してください。
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### ストレージの権限 {#storage-permissions}

SnapOtter は実行時に 2 か所へ書き込みます。`/data`（ユーザーファイル、ログ、AI モデル、Python venv）と `/tmp/workspace`（一時的な処理用スクラッチ）です。どちらもコンテナが実行されるユーザーが書き込める必要があります。いずれかが書き込めない場合、コンテナは起動時に **即座に fail** し、ディレクトリ名、実行中の UID/GID、修正方法を示すメッセージを出します。「healthy」と表示して起動しておきながら、最初のアップロードで意味不明なエラーとともに失敗する、ということはありません。

権限がどう扱われるかは、コンテナの起動方法によって変わります。

**デフォルト（root として起動し、`snapotter` に降格）**: エントリーポイントは root として起動し、マウントされたボリュームの所有権を修正してから、`gosu` を介して非特権の `snapotter` ユーザーに降格します。名前付きボリュームは設定不要で機能します。バインドマウントの場合は、書き込まれるファイルの所有者が自分になるよう、`PUID`/`PGID` をホストのユーザーに設定してください（上記参照）。

**Kubernetes / OpenShift（`runAsUser` による非 root）**: 非 root ユーザーとして直接起動された場合、コンテナは自らボリュームを chown できないため、オーケストレーターが書き込み可能にする必要があります。`fsGroup` を設定してください：

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

イメージの書き込み可能ディレクトリは GID 0 のグループ所有かつグループ書き込み可能なので、**任意の UID** と root の補助グループ（OpenShift のデフォルト）で動作する Pod は `chown` なしで書き込めます。

**TrueNAS Scale（およびその他の「外来 UID」構成）**: TrueNAS はアプリを非 root ユーザー（多くの場合 `568:568`）として実行し、別のユーザーが所有するホストデータセットをマウントするため、エントリーポイントも `fsGroup` もそれ単独では書き込み可能にできません。次のいずれかを選んでください：

- **アプリを root として実行する**（推奨）: アプリのユーザーを未設定のままにするか `0` に設定し、デフォルトのエントリーポイントに権限を修正させて `snapotter` に降格させます。
- **UID `999` として実行する**: アプリのユーザー/グループを `999:999`（SnapOtter の組み込み `snapotter` ユーザー）に設定し、イメージの所有権に一致させます。
- ホストデータセットを、コンテナが実行される UID に **`chown`** する。TrueNAS のシェルから：

  ```bash
  # 起動エラーの UID を使う（またはコンテナ内で `id` を実行）
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

起動エラーは使うべき正確な UID を示すので、最も手っ取り早いのは一度アプリを起動し、メッセージを読んでから、それに応じて `chown` する（またはユーザーを調整する）ことです。

## 環境変数 {#environment-variables}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `AUTH_ENABLED` | `true` | ログイン要求の有効化/無効化 |
| `DEFAULT_USERNAME` | `admin` | 初期管理者のユーザー名 |
| `DEFAULT_PASSWORD` | `admin` | 初期管理者のパスワード（初回ログイン時に変更を強制） |
| `MAX_UPLOAD_SIZE_MB` | `100` | ファイルごとのアップロード上限 |
| `MAX_BATCH_SIZE` | `100` | バッチリクエストあたりの最大ファイル数 |
| `RATE_LIMIT_PER_MIN` | `1000` | IP ごと・1 分あたりの API リクエスト数（0 で無効化） |
| `MAX_USERS` | `0`（無制限） | 最大ユーザーアカウント数 |
| `TRUST_PROXY` | `true` | リバースプロキシからの X-Forwarded-For ヘッダーを信頼する |
| `PUID` | `999` | この UID で実行する（バインドマウントの権限用） |
| `PGID` | `999` | この GID で実行する（バインドマウントの権限用） |
| `LOG_LEVEL` | `info` | ログの詳細度: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0`（自動） | 並列 AI 処理ジョブの最大数 |
| `SESSION_DURATION_HOURS` | `168` | ログインセッションの有効期間（7 日） |
| `CORS_ORIGIN` | （空） | カンマ区切りの許可オリジン、または同一オリジンの場合は空 |

### 送信プロキシとプライベート CA {#outbound-proxy-and-private-ca}

公式コンテナにより、Node の環境プロキシ サポートが有効になります。 SnapOtter が企業プロキシ経由で OCR ランタイム リポジトリまたは他の HTTPS サービスに到達する必要がある場合は、`HTTPS_PROXY` (必要に応じて `HTTP_PROXY`) を設定します。 `NO_PROXY` を、Postgres、Redis、内部オブジェクト ストレージなど、直接アクセスする必要があるホストのカンマ区切りのリストに設定します。

プロキシまたは内部サービスがプライベート認証局によって署名されている場合は、CA 証明書を読み取り専用でマウントし、`NODE_EXTRA_CA_CERTS` をそれを指します。このファイルは、ノード プロセスの開始時に存在する必要があります。

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

プロキシ資格情報は、Compose ファイルの外に保管してください (たとえば、保護された `.env` ファイルまたはシークレット内)。 TLS 検証を無効にしないでください。署名された OCR インデックスはリリース メタデータを認証しますが、通常の TLS 検証は引き続きトランスポートとその他すべての送信リクエストを保護します。

## ヘルスチェック {#health-check}

コンテナには組み込みのヘルスチェックが含まれています：

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## リバースプロキシ {#reverse-proxy}

SnapOtter はデフォルトで `TRUST_PROXY=true` を設定するため、レート制限とロギングは `X-Forwarded-For` ヘッダーの実際のクライアント IP を使用します。

### Nginx {#nginx}

```nginx
server {
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

        # SSE support (batch progress, feature install progress)
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Nginx Proxy Manager {#nginx-proxy-manager}

1. 新しい Proxy Host を追加します
2. Domain Name をあなたのドメインに設定します
3. Scheme を `http`、Forward Hostname を `SnapOtter`（またはコンテナの IP）、Forward Port を `1349` に設定します
4. WebSocket サポートを有効にします
5. Advanced の下に次を追加します: `client_max_body_size 500M;` と `proxy_buffering off;`

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

`flush_interval -1` はレスポンスのバッファリングを無効にします。これは SSE の進捗イベント（バッチ処理、AI ツール、機能のインストール）に必要です。延長されたタイムアウトにより、Caddy が接続を早期に閉じることなく大きなファイルのアップロードを完了できます。

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

注意: Cloudflare は無料プランで 100 MB のアップロード上限があります。それに合わせて `MAX_UPLOAD_SIZE_MB=100` を設定してください。

## CI/CD {#ci-cd}

GitHub リポジトリには 3 つのワークフローがあります：

- **ci.yml** - すべてのプッシュと PR で自動的に実行されます。lint、型チェック、テスト、ビルドを行い、Docker イメージを検証します（プッシュはしません）。
- **release.yml** - `workflow_dispatch` 経由で手動でトリガーされます。semantic-release を実行してバージョンタグと GitHub リリースを作成し、その後マルチアーキテクチャの Docker イメージ（amd64 + arm64）をビルドして Docker Hub（`snapotter/snapotter`）と GitHub Container Registry（`ghcr.io/snapotter-hq/snapotter`）にプッシュします。
- **deploy-docs.yml** - このドキュメントサイトをビルドし、`main` へのプッシュ時に Cloudflare Pages にデプロイします。

リリースを作成するには、GitHub UI で **Actions > Release > Run workflow** に移動するか、次を実行します：

```bash
gh workflow run release.yml
```

semantic-release はコミット履歴からバージョンを判定します。`latest` の Docker タグは常に最新のリリースを指します。

## アナリティクス {#analytics}

SnapOtter には、バグの発見と機能の改善に役立てるため、匿名のプロダクトアナリティクス（ツールの使用パターン、エラーレポート）が含まれています。デフォルトで有効です。あなたのファイル、ファイル名、個人データがこれに含まれることは決してありません。SnapOtter はアナリティクスを無効にしても通常どおり動作します。

### アナリティクスの無効化 {#disabling-analytics}

実行時のオプトアウトはワンクリックの管理者トグルです。Settings > System > Privacy を開き、Anonymous Product Analytics をオフにしてください。インスタンス全体で即座に停止し、リビルドは不要です。

アナリティクスを一切送信できないイメージにするには、リポジトリをクローンしてリビルドし、ビルド時のハードオフを設定します：

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

または、既存の `docker-compose.yml` にビルド引数を追加します：

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
