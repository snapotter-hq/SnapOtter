---
description: "使用 Docker 將 SnapOtter 部署到正式環境。包含硬體需求、GPU 設定，以及 Nginx、Traefik 與 Cloudflare 的反向代理設定。"
i18n_source_hash: 3821f105f4ba
i18n_provenance: machine
i18n_output_hash: 2551fd2fd653
i18n_hash_version: 2
---

# 部署 {#deployment}

SnapOtter 以 3 個容器的 Docker Compose 堆疊方式部署：SnapOtter 應用程式映像檔、PostgreSQL 17 與 Redis 8。應用程式映像檔支援 **linux/amd64**（搭配 NVIDIA CUDA 進行 AI 加速）與 **linux/arm64**（CPU），因此可在 Intel/AMD 伺服器、Apple Silicon Mac，以及 Raspberry Pi 4/5 等 ARM 裝置上原生執行。目前不支援透過 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 內建 GPU 進行 AI 推論加速。

GPU 設定、Docker Compose 範例與版本固定，請參閱 [Docker 映像檔](./docker-tags)。

## 快速開始（CPU）{#quick-start-cpu}

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

啟動後即可在 `http://localhost:1349` 使用應用程式。

上述堆疊以資料庫擁有者的身分連線。自 SnapOtter 2.3.0 起，您可以改用僅能讀寫資料列的角色來處理請求，請參閱[最小權限角色](./database#least-privilege-roles)。

> **遇到 Docker Hub 速率限制？** 請將 `snapotter/snapotter:latest` 換成 `ghcr.io/snapotter-hq/snapotter:latest`，改從 GitHub Container Registry 拉取。每次發行時，兩個登錄庫都會收到相同的映像檔。

## 快速開始（NVIDIA CUDA）{#quick-start-nvidia-cuda}

若要在支援的 AI 工具（背景移除、放大、臉部強化）上使用 NVIDIA CUDA 加速：

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

### 驗證 GPU 加速 {#verify-gpu-acceleration}

在日誌中檢查 CUDA 偵測結果：

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

如果 `--gpus all` 與 NVIDIA Container Toolkit 都已正確設定，AI 工具卻仍在 CPU 上執行，請從 **設定 → AI 功能** 重新安裝受影響的套件（例如背景移除）。安裝程式會還原 ONNX Runtime 的 GPU 版本；在共用的 AI 環境中，其他套件（例如轉錄）引入的純 CPU 版本可能會遮蔽它。如果在較舊的映像檔上從 UI 重新安裝無法還原 GPU，請參閱 [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490) 中的手動修復方式。

## 硬體需求 {#hardware-requirements}

這些數字來自對各種系統的基準測試，範圍從搭載 NVIDIA RTX 4070 的新型 amd64 工作站，到 Raspberry Pi。我們在每台機器上執行完整的工具目錄，並調整 Docker 資源限制以找出真正的下限。

如果您在這些等級的低階端執行（Pi、舊筆電、2 GB 的 VPS）？[低資源設定](/zh-TW/guide/low-resource)會將這些數字轉為具體的逐步說明，並提供調校後的上限值。

### 快速參考 {#quick-reference}

| 等級 | 使用情境 | CPU | RAM | GPU | 儲存空間 |
|------|----------|-----|-----|-----|---------|
| 最低 | 非 AI 工具（圖片、檔案、輕量 PDF），加上內建的快速 OCR 與臉部偵測；單一使用者；小型批次 | 2 核心 | 2 GB | 無 | 約 7 GB |
| 建議 | 全部五種類型，包括影片、PDF 與 CPU 上的標準 AI 套件；批次處理；少數使用者 | 4 核心 | 4 GB（HQ 修補為 8 GB） | 無 | 約 25 GB |
| 完整 | 全速執行所有項目，包括 GPU AI；大型批次；多位使用者 | 6-8 核心 | 8 GB | NVIDIA 8 GB 以上 VRAM（12 GB 較充裕） | 約 35 GB |

**架構：僅支援 64 位元**（`linux/amd64` 或 `linux/arm64`）。SnapOtter 可在 Intel/AMD 伺服器、Apple Silicon Mac，以及包含 **Raspberry Pi 4 與 5**（4-8 GB）在內的 64 位元 ARM 開發板上原生執行。它**不**支援 32 位元 ARM（`armv7`/`armhf`），因為沒有為其建置映像檔，也不支援 Pi Zero 等 512 MB 等級的開發板，這些開發板低於記憶體下限（見下文）。

### 最低（圖片、檔案與輕量 PDF 工具；不含 AI）{#minimum-image-files-and-light-pdf-tools-no-ai}

| 資源 | 需求 |
|---|---|
| CPU | 2 核心 |
| RAM | 2 GB |
| 磁碟 | 約 5.5 GB（映像檔）加上資料磁碟區 |
| GPU | 不需要 |

目錄中全部 222 個非 AI 工具，包括圖片（縮放、裁切、轉換、壓縮、調整、浮水印）、影片（剪輯、靜音、重新封裝）、音訊（轉換、正規化、剪輯）、PDF（合併、分割、壓縮、旋轉、保護）、檔案轉換，以及專用的轉換預設，都能在普通硬體上執行。多數操作即使面對大型檔案也能在一秒內完成：2.7 MB 的圖片縮放約需 0.05 秒，重新編碼為 WebP 約需 2 秒。

記憶體下限是真實存在的，來自 Docker 資源限制的掃描測試：**512 MB 無法啟動堆疊**（連單張圖片縮放都會被終止），**1 GB** 可處理單一檔案的操作，但多檔案批次會耗盡記憶體，而 **2 GB / 2 核心**是能從容處理非 AI 批次的最小配置。內建的快速 OCR 與 `face-detection` 套件也能放進 2 GB，而較大的 AI 套件（Whisper、LaMa/DDColor、rembg、RealESRGAN、照片修復，以及 SD1.5 HQ 修補）需要 4 至 8 GB 的 RAM，當可用記憶體低於各套件的下限時，會被直接拒絕執行。

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**唯一吃重 CPU 的例外是影片重新編碼。** 串流複製操作（剪輯、靜音、容器重新封裝）是瞬間完成的，但轉碼為不同的編解碼器則受限於 CPU。將 1080p、45 秒的片段重新編碼為 VP9（WebM），在快速的新型 CPU 上約需 **40 秒**，在 Apple Silicon 上約 45 秒，在較舊的 4 核心行動處理器上約 80 秒，在較舊的 4 核心伺服器上約需 **130 秒**。如果您的工作負載以影片為主，請優先考慮 CPU 核心數與時脈，或提高容器的 `cpus:` 限制，隨附的 compose 預設將應用程式限制在 4 核心（GPU 版 compose 為 8 核心）。

### 建議（CPU 上的 AI 工具）{#recommended-ai-tools-on-cpu}

| 資源 | 需求 |
|---|---|
| CPU | 4 核心 |
| RAM | 4 GB |
| 磁碟 | 3 GB（映像檔）加上約 20 GB（所有選用 AI 套件）加上工作區 |
| GPU | 不需要（回退至 CPU） |

**安裝並執行較大的 AI 套件，是將建議值提高到 4 GB RAM 的原因。** 未安裝任何選用套件時，應用程式閒置時約使用 360 MB。舊版 Python 工具共用一個 sidecar，而精準 OCR 則使用專屬的長時間執行分派器，並固定在目前啟用的不可變世代上。啟用之前，安裝程式會對候選版本執行冒煙測試，接著以原子方式切換到新的分派器，並在垃圾回收之前先排空舊的分派器。每個正式的精準 OCR 成品，都必須在 4 GiB 的 cgroup 內通過其最壞情況的發行測試，而主機建議的 4 GB 則為 Node.js 應用程式、Postgres、Redis、佇列與並行工作保留了餘裕。

多數 AI 工具在 CPU 上完全可用，少數則確實需要 GPU。以下為在新型 4 核心 CPU 上的實測結果：

| AI 工具 | CPU 耗時 | 在 CPU 上可用嗎？ |
|---|---|---|
| 臉部偵測（blur-faces、smart-crop、red-eye）、noise-removal | 1 秒內 | 可以 |
| OCR、轉錄、字幕 | 1-3 秒 | 可以 |
| 上色、臉部強化 | 約 10 秒 | 可以 |
| 背景移除 / 取代 / 模糊 | 約 29 秒 | 可以（需要等待） |
| AI 放大（RealESRGAN） | 小圖約 33 秒；大圖需數分鐘 | 勉強可用，強烈建議使用 GPU |
| 照片修復（完整流程） | 數分鐘 | 不建議，需要 GPU 或快速的多核心 CPU |

SnapOtter 刻意不把這些模型下載內容內建於 Docker 映像檔中。AI 套件只會在管理員啟用相關工具時才拉取，儲存在持久的 `/data/ai` 磁碟區中，並由所有依賴相同模型堆疊的工具共用。這樣能讓最終的容器映像檔保持小巧，同時仍可讓完整的 AI 安裝達到下列較大的儲存空間數字。

有些工具依賴不只一個共用套件。例如，證件照需要 `background-removal` 與 `face-detection` 兩者；如果已安裝 `background-removal`，啟用證件照時只會下載缺少的 `face-detection` 套件。所有 AI 工具都適用相同的重複利用方式。

選用 AI 套件的儲存空間與 CPU 記憶體下限（SnapOtter 在分派到 Python sidecar 之前會檢查可用記憶體，並在低於套件的可用記憶體下限時立即拒絕執行）：

| 套件 | 磁碟大小 | CPU 記憶體下限 |
|---|---|---|
| 臉部偵測 | 200-300 MB | 2 GB 主機 RAM（約 0.5 GB 可用） |
| 轉錄 | 約 600 MB | 4 GB 主機 RAM（約 2 GB 可用） |
| 物件橡皮擦 + 上色 | 1-2 GB | 4 GB 主機 RAM（約 2 GB 可用） |
| 精準 OCR（`balanced`/`best`） | 約 208-234 MiB 下載 / 約 409-488 MiB 安裝後 | 4 GiB 設定的有效記憶體（`fast` 可在 2 GB 上執行） |
| 背景移除 | 4-5 GB | 4 GB 主機 RAM（約 2.5 GB 可用） |
| 放大 + 臉部強化 + 雜訊移除 | 5-6 GB | 4 GB 主機 RAM（約 2.5 GB 可用） |
| 照片修復 | 4-5 GB | 4 GB 主機 RAM（約 3 GB 可用） |
| 高品質修補（`inpaint-hq`） | 5-7 GB | 8 GB 主機 RAM（約 6 GB 可用） |
| **所有套件** | **安裝後約 25 GB** | **4 GB（搭配 `inpaint-hq` 為 8 GB）** |

快速 OCR 透過 Tesseract 內建於映像檔中，約增加 25 MiB，且不需要選用的 OCR 套件或其 4 GiB 記憶體需求。快速模式支援 `auto`、`en`、`de`、`es`、`fr`、`zh` 與 `ja`，但不支援韓文（`ko`）或阿拉伯文（`ar`）。這兩者使用 `balanced` 或 `best`，因此需要精準套件。精準套件適用於正式的 Linux amd64 與 arm64 容器，並在 CPU 上執行 ONNX Runtime。NVIDIA 主機同樣使用該 CPU OCR 執行環境，因此 OCR 不依賴 CUDA 版本或 GPU 架構。精準執行環境需要至少 4 GiB 的有效記憶體：即設定的容器 cgroup 限制，若無則採用主機記憶體。SnapOtter 會在下載套件之前，拒絕低於該簽署相容性下限的系統。在無法保證 libc 與 Python ABI 的裸機 / 預先建置封存檔上，同樣會拒絕安裝精準套件。在這些不支援的主機上，韓文與阿拉伯文 OCR 會回傳明確的不相容錯誤，絕不會靜默回退到快速模式。明確要求以快速模式處理韓文時，會在工作排入佇列之前回傳 `FEATURE_INCOMPATIBLE`，並附帶 `fast-korean-unsupported` 原因。

共用同一個 `DATA_DIR` 的複本必須使用相同的 CPU 架構；多複本部署請以節點親和性固定。混合 amd64/arm64 的複本需要各自獨立的資料磁碟區，以及獨立的 SnapOtter 部署。

精準執行環境只保留一個啟用中的世代，並在啟用後清除其下載快取。就此版本而言，首次安裝暫時需要約 620-720 MiB 來存放封存檔與暫存區，而升級時在舊世代仍處於啟用狀態期間，峰值可能接近 1.2 GiB。安裝程式會在下載或解壓縮之前，依據簽署的索引與目前的世代計算出確切需求，若資料磁碟區太小便會提早失敗。

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### 完整（NVIDIA CUDA 上的 AI 工具）{#full-ai-tools-on-nvidia-cuda}

| 資源 | 需求 |
|---|---|
| CPU | 6-8 核心（即使使用 GPU AI，影片前處理與並行也在 CPU 上執行） |
| RAM | 8 GB |
| GPU | NVIDIA，8 GB 以上 VRAM（建議 12 GB） |
| 磁碟 | 總共約 35 GB |

NVIDIA GPU（CUDA）能大幅加速繁重的 AI 模型。以下為 RTX 4070 與新型 CPU 的實測比較：

| AI 工具 | GPU 加速倍率 | 備註 |
|---|---|---|
| AI 放大（RealESRGAN 2×） | **約 47 倍** | 效益最大，不到一秒，相對於約 33 秒（大圖需數分鐘） |
| 臉部強化（CodeFormer） | **約 12 倍** | 約 0.9 秒，相對於約 11 秒 |
| 轉錄（Whisper） | 約 4.5 倍 | |
| 背景移除 / 取代 / 模糊 | 約 4 倍 | GPU 約 7 秒，CPU 約 29 秒 |
| 上色 | 約 1.8 倍 | |
| OCR、臉部偵測、red-eye、noise-removal | 約 1 倍 | 在 CPU 上本來就很快，GPU 沒有幫助 |
| 照片修復 | 無 | 即使有 GPU 也受限於 CPU（GPU 使用率 0%）；此處快速的 CPU 比 GPU 更重要 |

值得使用 GPU 的工具是**放大、臉部強化、轉錄與背景移除**。臉部偵測、OCR 與 red-eye 受限於 CPU 且本來就很快，因此 GPU 並無助益。

在放大並搭配臉部強化時，VRAM 用量峰值可達 7.5 GB。6 GB 的 NVIDIA GPU 單獨使用時，對多數 AI 工具都可運作，但在放大時會失敗。8-12 GB 的 VRAM 則能處理所有項目。

目前不支援透過 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 內建 GPU 進行 AI 推論加速。將 `/dev/dri` 對應到容器中並不會啟用 AI 的 GPU 加速；除非有 NVIDIA CUDA，否則 SnapOtter 會在 CPU 上執行 AI 工具。

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

### 並行使用者 {#concurrent-users}

針對預設限制為 4 核心的應用程式容器，同時發送圖片縮放請求的結果：

| 並行請求數 | 平均回應時間 | 錯誤 |
|---|---|---|
| 1 | 0.4 秒 | 0 |
| 5 | 1.2 秒 | 0 |
| 10 | 2.1 秒 | 0 |

隨著工作執行緒池趨於飽和，回應時間以次線性方式增加，且沒有錯誤。提高應用程式容器的 `cpus:` 限制（或使用核心數更多的主機）可以提升上限。請注意，繁重的工作（影片轉碼、CPU 上的 AI）會在整個執行期間佔用一個工作執行緒，因此請依預期同時執行的繁重工作數量來規劃 CPU，而不只是請求數量。

### 支援的圖片格式 {#supported-image-formats}

SnapOtter 支援 **55 種以上的輸入格式**與 **14 種輸出格式**，包括來自 20 多個相機品牌的 RAW 檔案、專業格式（PSD、EPS、OpenEXR、HDR）、現代編解碼器（JPEG XL、AVIF、HEIC、QOI），以及科學 / 遊戲格式（FITS、DDS）。

每種支援格式的詳細資訊、所用解碼器與可用的品質控制，請參閱[完整格式清單](/zh-TW/guide/supported-formats)。

### 已知限制 {#known-limitations}

- **內容感知縮放**在大型圖片（超過 5 MP）上會當機，這是 caire 執行檔的限制。較小的圖片則運作正常。
- **HEIF 解碼**需要 13-23 秒。HEIC（Apple 的變體）則快得多，只需 0.3-0.9 秒。
- **放大**在 CPU 上對於稍大於小圖的圖片就會逾時，實際使用需要 GPU。
- **CodeFormer** 臉部強化明顯比 GFPGAN 慢（GPU 上為 53 秒對 2 秒）。多數情況下建議使用 GFPGAN。

## 磁碟區 {#volumes}

| 掛載 / 磁碟區 | 用途 | 是否必要？ |
|---|---|---|
| `/data`（app） | AI 模型、Python venv、使用者檔案 | **是** - 沒有它會遺失檔案 |
| `/tmp/workspace`（app） | 暫存處理檔案（自動清理） | 建議 |
| `SnapOtter-pgdata`（postgres） | PostgreSQL 資料目錄（使用者、設定、管線、工作） | **是** - 沒有它會遺失資料 |
| `SnapOtter-redisdata`（redis） | 供持久工作佇列使用的 Redis append-only 檔案 | 建議 |

### 綁定掛載與具名磁碟區 {#bind-mounts-vs-named-volumes}

**具名磁碟區**（建議）：由 Docker 自動管理權限：
```yaml
volumes:
  - SnapOtter-data:/data
```

**綁定掛載**：由您自行管理權限。請將 `PUID`/`PGID` 設定為與您的主機使用者相符：
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### 儲存空間權限 {#storage-permissions}

SnapOtter 在執行期間會寫入兩個位置：`/data`（使用者檔案、日誌、AI 模型與 Python venv）以及 `/tmp/workspace`（暫存處理空間）。兩者都必須可由容器執行時所用的使用者寫入。若任一者不可寫入，容器會在啟動時**立即失敗**，並顯示一則訊息，指出目錄、執行中的 UID/GID 以及修正方式，而不是顯示「正常」啟動，卻在第一次上傳時以難以理解的錯誤失敗。日誌目錄（`LOG_DIR`，映像檔中為 `/data/logs`）在每種儲存模式下都以相同方式檢查，因為即使檔案存放在 S3，日誌仍留在本機。

權限的處理方式取決於容器的啟動方式：

**預設（以 root 啟動，再降權為 `snapotter`）**：進入點以 root 啟動，修正已掛載磁碟區的擁有者，然後透過 `gosu` 降權為無特權的 `snapotter` 使用者。具名磁碟區無需任何設定即可運作。對於綁定掛載，請將 `PUID`/`PGID` 設為您的主機使用者（如上所示），讓它寫入的檔案歸您所有。

**Kubernetes / OpenShift（透過 `runAsUser` 以非 root 執行）**：直接以非 root 使用者啟動時，容器無法自行對磁碟區執行 chown，因此必須由協調器讓它們可寫入。請設定 `fsGroup`：

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

映像檔的可寫入目錄由 GID 0 的群組擁有且群組可寫入，因此以**任意 UID** 搭配 root 補充群組（OpenShift 的預設）執行的 pod，無需 `chown` 即可寫入。

**TrueNAS Scale（以及其他「外來 UID」的設定）**：TrueNAS 以非 root 使用者（通常為 `568:568`）執行應用程式，並掛載由不同使用者擁有的主機資料集，因此不論是進入點或 `fsGroup`，單靠自己都無法讓它們可寫入。請擇一處理：

- **以 root 執行應用程式**（建議）：不設定應用程式的使用者，或將其設為 `0`，讓預設的進入點修正權限並降權為 `snapotter`。
- **以 UID `999` 執行**：將應用程式的使用者 / 群組設為 `999:999`（SnapOtter 內建的 `snapotter` 使用者），使其與映像檔的擁有者一致。
- 從 TrueNAS shell 對主機資料集執行 **`chown`**，將擁有者改為容器所用的 UID：

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

啟動錯誤會指出要使用的確切 UID，因此最快的做法是先啟動一次應用程式、讀取訊息，再據此執行 `chown`（或調整使用者）。

## 環境變數 {#environment-variables}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `AUTH_ENABLED` | `true` | 啟用 / 停用登入要求 |
| `DEFAULT_USERNAME` | `admin` | 初始管理員使用者名稱 |
| `DEFAULT_PASSWORD` | `admin` | 初始管理員密碼（首次登入時強制變更） |
| `MAX_UPLOAD_SIZE_MB` | `0`（無限制） | 每個檔案的上傳限制（MB）。映像檔預設為 `0`；從原始碼建置則從 100 開始 |
| `MAX_BATCH_SIZE` | `0`（無限制） | 每個批次請求的檔案數上限。映像檔預設為 `0`；從原始碼建置則從 100 開始 |
| `RATE_LIMIT_PER_MIN` | `1000` | 每個 IP 每分鐘的 API 請求數（設為 0 即停用） |
| `MAX_USERS` | `0`（無限制） | 使用者帳號數上限 |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | 允許哪些對等端透過 `X-Forwarded-For` 設定用戶端 IP。預設僅限私人網路 |
| `PUID` | `999` | 以此 UID 執行（用於綁定掛載權限） |
| `PGID` | `999` | 以此 GID 執行（用於綁定掛載權限） |
| `LOG_LEVEL` | `info` | 日誌詳細程度：fatal、error、warn、info、debug、trace |
| `CONCURRENT_JOBS` | `0`（自動） | AI 並行處理工作數上限 |
| `SESSION_DURATION_HOURS` | `168` | 登入工作階段的有效期限（7 天） |
| `CORS_ORIGIN` | （空白） | 以逗號分隔的允許來源，留空則僅限同源 |

### 對外代理與私有 CA {#outbound-proxy-and-private-ca}

正式容器會啟用 Node 的環境代理支援。如果 SnapOtter 必須透過公司代理伺服器連線到 OCR 執行環境儲存庫或其他 HTTPS 服務，請設定 `HTTPS_PROXY`（必要時也設定 `HTTP_PROXY`）。請將 `NO_PROXY` 設為以逗號分隔的主機清單，這些主機必須直接連線，例如 Postgres、Redis 與內部物件儲存空間。

如果代理伺服器或內部服務由私有憑證授權單位簽署，請以唯讀方式掛載該 CA 憑證，並將 `NODE_EXTRA_CA_CERTS` 指向它。該檔案在 Node 程序啟動時必須已存在：

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

請將代理伺服器的憑證資訊放在 Compose 檔案之外（例如放在受保護的 `.env` 檔案或 secret 中）。請勿停用 TLS 驗證：簽署的 OCR 索引會驗證發行中繼資料，而一般的 TLS 驗證仍會保護傳輸過程以及其他所有對外請求。

## 健康檢查 {#health-check}

容器包含內建的健康檢查：

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## 反向代理 {#reverse-proxy}

`TRUST_PROXY` 預設為 `loopback,linklocal,uniquelocal`，因此 SnapOtter 只會相信來自私人網路對等端的 `X-Forwarded-For`。位於同一主機、Docker 網路或區域網路上的反向代理預設即受信任，這表示速率限制、登入暴力破解限制器、稽核日誌與企業版 IP 允許清單都能看到真實的用戶端 IP，無需任何設定。

僅當前端代理是從**公開**位址連到 SnapOtter 時才設定 `TRUST_PROXY=true`，例如位於不同網路上的雲端負載平衡器。在直接對外公開的執行個體上，該值會讓 `request.ip` 受攻擊者控制，因為輪替該標頭的呼叫端，每次請求都會取得新的速率限制桶。

在著手量測用戶端 IP 之前，有兩件事需要知道。macOS 與 Windows 上的 Docker Desktop 透過使用者空間代理提供已發布的連接埠，這會把每個來源位址改寫為 VM 閘道 `192.168.65.1`，因此在那裡任何 `TRUST_PROXY` 的值都無法還原真實的用戶端；面向網際網路的部署請使用 Linux。此外，在任何平台上，透過 `localhost` 連到已發布的連接埠時，觀察到的都是橋接閘道而非您的用戶端，因此本機測試無法說明真實用戶端如何被歸屬。`TRUST_PROXY` 各個值的完整表格與 Docker Desktop 的注意事項，請見 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy)。

以下每種代理都有兩件事很重要：允許大型請求本文（上傳），以及不要緩衝回應。緩衝回應的代理會破壞 SSE 進度，更明顯的是，會讓大型檔案下載「開始了卻永遠無法完成」，因為代理會先把整個檔案留住才往後傳遞。SnapOtter 在下載時會傳送 `X-Accel-Buffering: no`，因此即使其他地方開啟了緩衝，nginx 仍會以串流方式處理，但 nginx 以外的代理需要明確停用回應緩衝（各設定範例中均有示範）。如果下載在中途停滯，首先要檢查的就是前端是否有緩衝代理。

關於 HSTS 的說明：API 本身會在每個回應上傳送 `Strict-Transport-Security`，因此會直接傳遞回應標頭的代理（下方所有設定皆是如此）不需要自行設定 HSTS。只有當您的代理被設定為移除或覆寫上游回應標頭時，才需要保留該標頭，或在邊緣重新加入。

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

### 部署於子路徑下 {#subpath}

若要在 `https://example.com/snapotter` 提供服務，請在 SnapOtter 容器環境中設定 `BASE_PATH=/snapotter` 並重新啟動。正式的 CPU 與 GPU Compose 檔案也接受來自您 shell 或 Compose `.env` 檔案的 `BASE_PATH`。同一個映像檔可在任何路徑運作，無需重新建置前端。

`BASE_PATH` 接受以斜線分隔、由字母、數字、`_` 或 `-` 組成的區段，包括 `/apps/snapotter` 這類巢狀路徑。結尾斜線為選用。若為根路徑部署，請留空（預設），或設為 `/`。

在您現有的 Nginx HTTPS server 區塊中，使用：

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

此範例會保留前綴。在轉送之前先移除 `/snapotter` 的代理也同樣受支援。內部健康檢查可繼續使用 `/api/v1/health`。若使用 OIDC 或 SAML，請同時設定 `EXTERNAL_URL=https://example.com/snapotter`，並更新身分提供者的回呼 URL，分別加入 `/snapotter/api/auth/oidc/callback` 或 `/snapotter/api/auth/saml/callback`。

API 指令碼無需修改即可繼續運作：API 回應中的 URL，例如工具的 `downloadUrl`，無論 `BASE_PATH` 為何，都以 `/api/` 開頭。請將它們附加到您執行個體的基底 URL（`https://example.com/snapotter` + `/api/v1/download/...`），而不要依網域根路徑來解析。

請透過帶有前綴的 URL（`https://example.com/snapotter`）開啟 UI。未帶前綴到達的瀏覽器會被自動導向該處；只有 API 請求預期會不帶前綴地到達應用程式。如果日誌顯示 `Requests arrive under /snapotter/ but BASE_PATH is empty`，表示您的代理轉送了 `BASE_PATH` 未宣告的前綴：請將 `BASE_PATH` 設為該前綴，或在代理端移除前綴。

### Nginx Proxy Manager {#nginx-proxy-manager}

1. 新增一個 Proxy Host
2. 將 Domain Name 設為您的網域
3. 將 Scheme 設為 `http`，Forward Hostname 設為 `SnapOtter`（或您的容器 IP），Forward Port 設為 `1349`
4. 啟用 WebSocket 支援
5. 在 Advanced 下加入：`client_max_body_size 500M;` 與 `proxy_buffering off;`

API 的 `Strict-Transport-Security` 標頭會原樣通過 NPM；SSL 分頁上的 HSTS 開關則是額外的選用項目。

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

Traefik 會原封不動地轉送上游回應標頭，因此 API 的 `Strict-Transport-Security` 標頭無需 `headers` 中介軟體即可到達瀏覽器。如果您已經在執行會改寫回應標頭的中介軟體，請確認它不會動到該標頭。

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

`flush_interval -1` 會停用回應緩衝，這是 SSE 進度事件（批次處理、AI 工具、功能安裝）所必需的，也能讓大型檔案下載以串流方式傳送而不致停滯。延長的逾時設定可讓大型檔案上傳順利完成，不會被 Caddy 提早關閉連線。Caddy 也會原封不動地傳遞 API 的 `Strict-Transport-Security` 標頭，因此 HSTS 不需要 `header` 指令。

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

注意：Cloudflare 免費方案有 100 MB 的上傳限制。請將 `MAX_UPLOAD_SIZE_MB=100` 設為相符的值。

通道會轉送 API 的回應標頭，包括 `Strict-Transport-Security`，因此不需要在儀表板中設定 HSTS（Cloudflare 本身邊緣的 HSTS 設定則是額外的選用項目）。

## 疑難排解 {#troubleshooting}

### 首次啟動失敗後立即出現「Postgres not reachable: EAI_AGAIN」{#eai-again-after-failed-first-start}

如果第一次的 `docker compose up -d` 在中途失敗（最常見的原因是連接埠已被佔用），單純重試 `up -d` 可能會在未將應用程式容器附加到 compose 網路的情況下啟動它。應用程式隨後會不斷崩潰重啟，並出現：

```
Postgres not reachable: EAI_AGAIN
```

而 `docker ps` 卻顯示 postgres 正常。這個錯誤是真實的，但指向了錯誤的容器：沒有網路時，`postgres` 主機名稱的 DNS 完全無法解析，而重啟政策會永遠重演同樣的失敗。

請先修正造成第一次啟動失敗的問題（通常是釋放被佔用的連接埠），然後強制重新建立應用程式容器，讓它重新附加到網路：

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows：其他裝置可連線，但 PC 本身無法連線 {#windows-wsl2-loopback}

在 WSL2 內執行 Docker（常見的 Windows 設定）時，堆疊可能對網路上的所有其他機器都可連線，但在 Windows 主機本身上 `http://localhost:1349` 卻逾時，即使啟用了 WSL 的鏡像網路模式也一樣。該連接埠不會出現在 Windows 的 `netstat` 中，而容器本身並沒有任何問題。

請從另一台裝置開啟應用程式，或在發行版內部使用它自己的位址（在 WSL shell 中使用 `hostname -I`）。如果 localhost 轉送在您的 WSL 版本上剛好可用，請把它當作額外的好處，而不要依賴它。

## CI/CD {#ci-cd}

GitHub 儲存庫有三個工作流程：

- **ci.yml** - 在每次 push 與 PR 時自動執行。執行 lint、型別檢查、測試、建置，並驗證 Docker 映像檔（不推送）。
- **release.yml** - 透過 `workflow_dispatch` 手動觸發。執行 semantic-release 以建立版本標籤與 GitHub 發行版本，然後建置多架構 Docker 映像檔（amd64 + arm64），並推送到 Docker Hub（`snapotter/snapotter`）與 GitHub Container Registry（`ghcr.io/snapotter-hq/snapotter`）。
- **deploy-docs.yml** - 建置本文件網站，並在推送到 `main` 時部署到 Cloudflare Pages。

若要建立發行版本，請在 GitHub UI 中前往 **Actions > Release > Run workflow**，或執行：

```bash
gh workflow run release.yml
```

Semantic-release 會依據提交歷史決定版本。Docker 標籤 `latest` 永遠指向最新的發行版本。

## 分析 {#analytics}

SnapOtter 包含匿名的產品分析（工具使用模式、錯誤報告），協助找出錯誤並改進功能。此功能預設為開啟。您的檔案、檔名與個人資料絕不會成為其中的一部分。停用分析後，SnapOtter 仍可正常運作。

### 停用分析 {#disabling-analytics}

執行期的退出機制是管理員的一鍵切換。請開啟 設定 > 系統 > 隱私，並關閉匿名產品分析。它會立即對整個執行個體停止，無需重新建置。

若需要一個永遠不會送出分析資料的映像檔，請複製儲存庫並重新建置，以設定建置期的硬性關閉：

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

或將建置參數加入您現有的 `docker-compose.yml`：

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
