---
description: Docker で SnapOtter を本番環境にデプロイする方法。ハードウェア要件、GPU セットアップ、Nginx・Traefik・Cloudflare 向けのリバースプロキシ設定。
i18n_source_hash: ecc1b528bc4b
i18n_provenance: human
i18n_output_hash: 2691efb3acc4
---

# デプロイ {#deployment}

SnapOtter は 3 コンテナの Docker Compose スタックとしてデプロイされます。SnapOtter アプリイメージ、PostgreSQL 17、Redis 8 です。アプリイメージは **linux/amd64**（AI アクセラレーション用の NVIDIA CUDA 付き）と **linux/arm64**（CPU）をサポートしているため、Intel/AMD サーバー、Apple Silicon Mac、Raspberry Pi 4/5 のような ARM デバイス上でネイティブに動作します。VA-API、Quick Sync、OpenCL を通じた Intel/AMD の iGPU アクセラレーションは、現時点では AI 推論ではサポートされていません。

GPU のセットアップ、Docker Compose の例、バージョンの固定については [Docker イメージ](./docker-tags) を参照してください。

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

その後、アプリは `http://localhost:1349` で利用できます。

> **Docker Hub のレート制限に引っかかりますか？** `snapotter/snapotter:latest` を `ghcr.io/snapotter-hq/snapotter:latest` に置き換えると、代わりに GitHub Container Registry からプルできます。両方のレジストリはリリースごとに同じイメージを受け取ります。

## クイックスタート（NVIDIA CUDA） {#quick-start-nvidia-cuda}

AI ツール（背景除去、アップスケール、顔補正、OCR）で NVIDIA CUDA アクセラレーションを使う場合は次のとおりです。

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

ログで CUDA の検出を確認します。

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## ハードウェア要件 {#hardware-requirements}

これらの数値は、NVIDIA RTX 4070 を搭載した最新の amd64 ワークステーションから Raspberry Pi まで、さまざまなシステムでツールカタログ全体を実行し、Docker のリソース制限をスイープして実際の下限を見つけたベンチマークから得られたものです。

### クイックリファレンス {#quick-reference}

| ティア | ユースケース | CPU | RAM | GPU | ストレージ |
|------|----------|-----|-----|-----|---------|
| 最小 | 画像、ファイル、軽量な PDF ツール。単一ユーザー。小さなバッチ | 2 コア | 2 GB | なし | 約 7 GB |
| 推奨 | 動画・PDF・CPU での AI を含む 5 つのモダリティすべて。バッチ処理。数人のユーザー | 4 コア | 4 GB | なし | 約 25 GB |
| フル | GPU AI を含むすべてを高速に。大きなバッチ。多くのユーザー | 6〜8 コア | 8 GB | NVIDIA VRAM 8 GB 以上（12 GB が快適） | 約 35 GB |

**アーキテクチャ: 64 ビットのみ**（`linux/amd64` または `linux/arm64`）。SnapOtter は Intel/AMD サーバー、Apple Silicon Mac、そして **Raspberry Pi 4 および 5**（4〜8 GB）を含む 64 ビット ARM ボード上でネイティブに動作します。32 ビット ARM（`armv7`/`armhf`）では動作せず（そのためのイメージはビルドされていません）、メモリ下限を下回る Pi Zero のような 512 MB クラスのボードでも動作しません（下記参照）。

### 最小（画像、ファイル、軽量な PDF ツール。AI なし） {#minimum-image-files-and-light-pdf-tools-no-ai}

| リソース | 要件 |
|---|---|
| CPU | 2 コア |
| RAM | 2 GB |
| ディスク | 約 5.5 GB（イメージ）+ データボリューム |
| GPU | 不要 |

AI 以外の 222 個のカタログツール、すなわち画像（リサイズ、切り抜き、変換、圧縮、調整、ウォーターマーク）、動画（トリム、ミュート、リマックス）、音声（変換、正規化、トリム）、PDF（結合、分割、圧縮、回転、保護）、ファイル変換、そして専用の変換プリセットは、控えめなハードウェア上で動作します。ほとんどの操作は大きなファイルでも 1 秒未満で完了します。2.7 MB の画像は約 0.05 秒でリサイズされ、約 2 秒で WebP に再エンコードされます。

メモリの下限は現実的で、Docker のリソース制限スイープから得られたものです。**512 MB ではスタックを起動できません**（単一の画像リサイズさえ強制終了されます）。**1 GB** では単一ファイルの操作は扱えますが、複数ファイルのバッチはメモリ不足になります。**2 GB / 2 コア** は、バッチを快適に扱える最小構成です。

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**唯一の CPU 負荷が高い例外は動画の再エンコードです。** ストリームコピー操作（トリム、ミュート、コンテナのリマックス）は瞬時ですが、別のコーデックへのトランスコードは CPU バウンドです。1080p / 45 秒のクリップを VP9（WebM）に再エンコードすると、最新の高速 CPU で約 **40 秒**、Apple Silicon で約 45 秒、古いモバイル 4 コアで約 80 秒、古い 4 コアサーバーで約 **130 秒** かかります。ワークロードが動画中心なら、CPU のコア数とクロック速度を優先するか、コンテナの `cpus:` 制限を引き上げてください。出荷される compose はデフォルトでアプリを 4 コアに制限しています（GPU compose では 8 コア）。

### 推奨（CPU での AI ツール） {#recommended-ai-tools-on-cpu}

| リソース | 要件 |
|---|---|
| CPU | 4 コア |
| RAM | 4 GB |
| ディスク | 3 GB（イメージ）+ 24 GB（AI モデル）+ ワークスペース |
| GPU | 不要（CPU フォールバック） |

**RAM が 4 GB まで押し上げられるのは、AI バンドルをインストールすることが原因です。** AI を何もインストールしていない状態では、アプリのアイドル時のメモリは約 360 MB ですが、7 つのバンドルをすべてインストールすると約 2.6 GB の常駐メモリを保持します。これは Python の AI サイドカーが起動時にモデル（背景除去、アップスケール、OCR、文字起こし、顔検出、復元）を事前ロードするためです。AI 以外のインストールは軽量なままですが、AI のインストールには 4 GB 以上が必要です。

ほとんどの AI ツールは CPU でも十分に使えますが、いくつかは本当に GPU が欲しくなります。最新の 4 コア CPU で計測しました。

| AI ツール | CPU 時間 | CPU で使える？ |
|---|---|---|
| 顔検出（blur-faces、smart-crop、red-eye）、ノイズ除去 | 1 秒未満 | はい |
| OCR、文字起こし、字幕 | 1〜3 秒 | はい |
| カラー化、顔補正 | 約 10 秒 | はい |
| 背景の除去 / 置換 / ぼかし | 約 29 秒 | はい（待つことになります） |
| AI アップスケール（RealESRGAN） | 小さい画像で約 33 秒。大きな画像では数分 | 微妙。GPU を強く推奨 |
| 写真の復元（フルパイプライン） | 数分 | いいえ。GPU または高速なマルチコア CPU が必要 |

AI モデルのダウンロードサイズは次のとおりです。

| バンドル | ディスクサイズ |
|---|---|
| 背景除去 | 4〜5 GB |
| アップスケール + 顔補正 + ノイズ除去 | 5〜6 GB |
| 顔検出 | 200〜300 MB |
| オブジェクト消去 + カラー化 | 1〜2 GB |
| OCR | 5〜6 GB |
| 写真の復元 | 4〜5 GB |
| **すべてのバンドル** | **約 24 GB** |

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### フル（NVIDIA CUDA での AI ツール） {#full-ai-tools-on-nvidia-cuda}

| リソース | 要件 |
|---|---|
| CPU | 6〜8 コア（GPU AI を使っても、動画の前処理と同時実行は CPU 上で動きます） |
| RAM | 8 GB |
| GPU | NVIDIA、VRAM 8 GB 以上（12 GB を推奨） |
| ディスク | 合計約 35 GB |

NVIDIA GPU（CUDA）は重量級の AI モデルを劇的に高速化します。RTX 4070 と最新の CPU で計測しました。

| AI ツール | GPU による高速化 | 備考 |
|---|---|---|
| AI アップスケール（RealESRGAN 2×） | **約 47 倍** | 最大の勝利。約 33 秒（大きな画像では数分）に対して 1 秒未満 |
| 顔補正（CodeFormer） | **約 12 倍** | 約 11 秒に対して約 0.9 秒 |
| 文字起こし（Whisper） | 約 4.5 倍 | |
| 背景の除去 / 置換 / ぼかし | 約 4 倍 | CPU で約 29 秒に対して GPU で約 7 秒 |
| カラー化 | 約 1.8 倍 | |
| OCR、顔検出、赤目、ノイズ除去 | 約 1 倍 | すでに CPU で高速。GPU は役に立ちません |
| 写真の復元 | なし | GPU でも CPU バウンド（GPU 使用率 0%）。ここでは GPU より高速な CPU が重要です |

GPU の価値があるツールは **アップスケール、顔補正、文字起こし、背景除去** です。顔検出、OCR、赤目は CPU バウンドですでに高速なので、GPU を追加しても何も得られません。

ピーク時の VRAM 使用量は、顔補正を伴うアップスケール中に 7.5 GB に達します。6 GB の NVIDIA GPU はほとんどの AI ツールを個別に実行するには十分ですが、アップスケールでは失敗します。8〜12 GB の VRAM があればすべてを扱えます。

VA-API、Quick Sync、OpenCL を通じた Intel/AMD の iGPU アクセラレーションは、現時点では AI 推論ではサポートされていません。`/dev/dri` をコンテナにマッピングしても AI の GPU アクセラレーションは有効になりません。NVIDIA CUDA が利用できない限り、SnapOtter は AI ツールを CPU 上で実行します。

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

デフォルトで 4 コアに制限されたアプリコンテナに対する、並列の画像リサイズリクエストの結果です。

| 同時リクエスト数 | 平均応答時間 | エラー |
|---|---|---|
| 1 | 0.4 秒 | 0 |
| 5 | 1.2 秒 | 0 |
| 10 | 2.1 秒 | 0 |

ワーカープールが飽和しても、応答時間はエラーなしで準線形に劣化します。アプリコンテナの `cpus:` 制限を引き上げる（またはコア数の多いホストを使う）と、上限が引き上がります。重いジョブ（動画のトランスコード、CPU での AI）はその全実行時間の間ワーカーを保持するので、リクエスト数だけでなく、予想される同時実行の重いジョブ数に合わせて CPU をサイジングしてください。

### サポートされる画像フォーマット {#supported-image-formats}

SnapOtter は **55 種類以上の入力フォーマット** と **14 種類の出力フォーマット** をサポートしており、20 以上のカメラブランドの RAW ファイル、プロフェッショナルフォーマット（PSD、EPS、OpenEXR、HDR）、モダンなコーデック（JPEG XL、AVIF、HEIC、QOI）、科学・ゲーム用フォーマット（FITS、DDS）が含まれます。

サポートされるすべてのフォーマット、使用されるデコーダー、利用可能な品質コントロールの詳細については、[完全なフォーマット一覧](/ja/guide/supported-formats) を参照してください。

### 既知の制限 {#known-limitations}

- **コンテンツ認識リサイズ** は、caire バイナリの制限により大きな画像（5 MP 超）でクラッシュします。より小さな画像では問題なく動作します。
- **HEIF のデコード** には 13〜23 秒かかります。HEIC（Apple のバリアント）は 0.3〜0.9 秒とはるかに高速です。
- **OCR の日本語** は PaddlePaddle の MKLDNN のバグにより CPU で失敗します。GPU では動作します。
- **アップスケール** は、小さな画像を超えるものでは CPU でタイムアウトします。実用的な用途には GPU が必要です。
- **CodeFormer** の顔補正は GFPGAN よりも著しく遅いです（GPU で 53 秒に対し 2 秒）。ほとんどのユースケースでは GFPGAN を推奨します。

## ボリューム {#volumes}

| マウント / ボリューム | 目的 | 必須？ |
|---|---|---|
| `/data`（アプリ） | AI モデル、Python venv、ユーザーファイル | **はい** - これがないとファイルが失われます |
| `/tmp/workspace`（アプリ） | 一時的な処理ファイル（自動クリーンアップ） | 推奨 |
| `SnapOtter-pgdata`（postgres） | PostgreSQL データディレクトリ（ユーザー、設定、パイプライン、ジョブ） | **はい** - これがないとデータが失われます |
| `SnapOtter-redisdata`（redis） | 耐久性のあるジョブキューのための Redis の追記専用ファイル | 推奨 |

### バインドマウント対名前付きボリューム {#bind-mounts-vs-named-volumes}

**名前付きボリューム**（推奨）。Docker が権限を自動的に管理します。
```yaml
volumes:
  - SnapOtter-data:/data
```

**バインドマウント**。権限は自分で管理します。ホストのユーザーに合わせて `PUID`/`PGID` を設定してください。
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### ストレージの権限 {#storage-permissions}

SnapOtter は実行時に 2 か所に書き込みます。`/data`（ユーザーファイル、ログ、AI モデルおよび Python venv）と `/tmp/workspace`（一時的な処理用スクラッチ）です。どちらもコンテナが実行されるユーザーによって書き込み可能でなければなりません。どちらかが書き込み不可の場合、コンテナは「healthy」として起動してから最初のアップロードで謎めいたエラーで失敗するのではなく、**起動時に即座に失敗** し、対象のディレクトリ、実行中の UID/GID、修正方法を示すメッセージを表示します。

権限の扱われ方は、コンテナの起動方法によって異なります。

**デフォルト（root として起動し、`snapotter` にドロップ）**: エントリポイントは root として起動し、マウントされたボリュームの所有権を修正してから、`gosu` を介して非特権の `snapotter` ユーザーにドロップします。名前付きボリュームは設定なしで動作します。バインドマウントの場合は、書き込まれるファイルが自分の所有になるよう、`PUID`/`PGID` をホストのユーザーに設定してください（上記参照）。

**Kubernetes / OpenShift（`runAsUser` による非 root）**: 非 root ユーザーとして直接起動されると、コンテナは自身でボリュームを chown できないため、オーケストレーターがボリュームを書き込み可能にする必要があります。`fsGroup` を設定してください。

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

イメージの書き込み可能なディレクトリは GID 0 のグループ所有かつグループ書き込み可能なので、**任意の UID** に加えて root の補助グループ（OpenShift のデフォルト）で実行されるポッドは、`chown` なしで書き込めます。

**TrueNAS Scale（およびその他の「外部 UID」設定）**: TrueNAS はアプリを非 root ユーザー（多くの場合 `568:568`）として実行し、別のユーザーが所有するホストデータセットをマウントするため、エントリポイントも `fsGroup` もそれ単体では書き込み可能にしません。次のいずれかを選んでください。

- **アプリを root として実行する**（推奨）: アプリのユーザーを未設定のままにするか `0` に設定し、デフォルトのエントリポイントに権限を修正させて `snapotter` にドロップさせます。
- **UID `999` として実行する**: イメージの所有権に合わせるため、アプリのユーザー/グループを `999:999`（SnapOtter に組み込まれた `snapotter` ユーザー）に設定します。
- ホストデータセットをコンテナが実行される UID に **`chown`** します。TrueNAS シェルから次のように実行します。

  ```bash
  # 起動時のエラーで示された UID を使う（またはコンテナ内で `id` を実行）
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

起動時のエラーは使うべき正確な UID を示すので、最も手っ取り早い方法は、一度アプリを起動してメッセージを読み、それに応じて `chown` する（またはユーザーを調整する）ことです。

## 環境変数 {#environment-variables}

| 変数 | デフォルト | 説明 |
|---|---|---|
| `AUTH_ENABLED` | `true` | ログイン要求の有効化/無効化 |
| `DEFAULT_USERNAME` | `admin` | 初期管理者のユーザー名 |
| `DEFAULT_PASSWORD` | `admin` | 初期管理者のパスワード（初回ログイン時に変更を強制） |
| `MAX_UPLOAD_SIZE_MB` | `100` | ファイルごとのアップロード上限 |
| `MAX_BATCH_SIZE` | `100` | バッチリクエストごとの最大ファイル数 |
| `RATE_LIMIT_PER_MIN` | `1000` | IP ごと 1 分あたりの API リクエスト数（無効化するには 0） |
| `MAX_USERS` | `0`（無制限） | 最大ユーザーアカウント数 |
| `TRUST_PROXY` | `true` | リバースプロキシからの X-Forwarded-For ヘッダーを信頼する |
| `PUID` | `999` | この UID で実行（バインドマウントの権限用） |
| `PGID` | `999` | この GID で実行（バインドマウントの権限用） |
| `LOG_LEVEL` | `info` | ログの詳細度: fatal、error、warn、info、debug、trace |
| `CONCURRENT_JOBS` | `0`（自動） | 最大並列 AI 処理ジョブ数 |
| `SESSION_DURATION_HOURS` | `168` | ログインセッションの有効期間（7 日） |
| `CORS_ORIGIN` | （空） | カンマ区切りの許可オリジン、または同一オリジンの場合は空 |

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

SnapOtter はデフォルトで `TRUST_PROXY=true` を設定するため、レート制限とロギングは `X-Forwarded-For` ヘッダーから得られる実際のクライアント IP を使用します。

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
2. Domain Name を自分のドメインに設定します
3. Scheme を `http` に、Forward Hostname を `SnapOtter`（またはコンテナの IP）に、Forward Port を `1349` に設定します
4. WebSocket サポートを有効にします
5. Advanced で次を追加します: `client_max_body_size 500M;` と `proxy_buffering off;`

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

`flush_interval -1` はレスポンスのバッファリングを無効にします。これは SSE の進捗イベント（バッチ処理、AI ツール、機能のインストール）に必要です。延長されたタイムアウトにより、Caddy が接続を早期に閉じることなく、大きなファイルのアップロードを完了できます。

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

注: Cloudflare は無料プランで 100 MB のアップロード制限があります。`MAX_UPLOAD_SIZE_MB=100` をこれに合わせて設定してください。

## CI/CD {#ci-cd}

GitHub リポジトリには 3 つのワークフローがあります。

- **ci.yml** - すべてのプッシュと PR で自動的に実行されます。リント、型チェック、テスト、ビルドを行い、Docker イメージを検証します（プッシュはしません）。
- **release.yml** - `workflow_dispatch` を介して手動でトリガーされます。semantic-release を実行してバージョンタグと GitHub リリースを作成し、マルチアーキテクチャ Docker イメージ（amd64 + arm64）をビルドして、Docker Hub（`snapotter/snapotter`）と GitHub Container Registry（`ghcr.io/snapotter-hq/snapotter`）にプッシュします。
- **deploy-docs.yml** - このドキュメントサイトをビルドし、`main` へのプッシュ時に Cloudflare Pages にデプロイします。

リリースを作成するには、GitHub の UI で **Actions > Release > Run workflow** に移動するか、次を実行します。

```bash
gh workflow run release.yml
```

semantic-release はコミット履歴からバージョンを決定します。`latest` Docker タグは常に最新のリリースを指します。

## アナリティクス {#analytics}

SnapOtter には、バグの発見と機能改善に役立てるための匿名の製品アナリティクス（ツールの使用パターン、エラーレポート）が含まれています。デフォルトで有効です。あなたのファイル、ファイル名、個人データがこれに含まれることは決してありません。SnapOtter はアナリティクスを無効にしても通常どおり動作します。

### アナリティクスの無効化 {#disabling-analytics}

実行時のオプトアウトは、ワンクリックの管理者トグルです。Settings > System > Privacy を開き、Anonymous Product Analytics をオフにします。インスタンス全体に対して即座に停止し、再ビルドは不要です。

決してアナリティクスを送信できないイメージにするには、リポジトリをクローンして再ビルドし、ビルド時のハードオフを設定します。

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
