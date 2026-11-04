---
description: "使用 Docker 將 SnapOtter 部署到正式環境。包含硬體需求、GPU 設定，以及 Nginx、Traefik 和 Cloudflare 的反向代理設定。"
i18n_source_hash: b8c4ed2cc086
i18n_provenance: machine
i18n_output_hash: 63bf2da35732
i18n_hash_version: 2
---

# 部署 {#deployment}

SnapOtter 以 3 個容器的 Docker Compose 堆疊部署：SnapOtter 應用程式映像檔、PostgreSQL 17 與 Redis 8。應用程式映像檔支援 **linux/amd64**（搭配 NVIDIA CUDA 進行 AI 加速）與 **linux/arm64**（CPU），因此可原生執行於 Intel/AMD 伺服器、Apple Silicon Mac，以及 Raspberry Pi 4/5 等 ARM 裝置。目前 AI 推論不支援透過 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 內顯加速。

GPU 設定、Docker Compose 範例與版本固定，請參閱 [Docker 映像檔](./docker-tags)。

## 快速開始（CPU） {#quick-start-cpu}

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

之後即可在 `http://localhost:1349` 使用應用程式。

上述堆疊以資料庫擁有者的身分連線。從 SnapOtter 2.3.0 起，您可以改用只能讀寫資料列的角色來處理請求；請參閱[最小權限角色](./database#least-privilege-roles)。

> **遇到 Docker Hub 速率限制？** 將 `snapotter/snapotter:latest` 換成 `ghcr.io/snapotter-hq/snapotter:latest`，即可改從 GitHub Container Registry 拉取。兩個登錄庫在每次發行時都會收到相同的映像檔。

## 快速開始（NVIDIA CUDA） {#quick-start-nvidia-cuda}

若要讓支援的 AI 工具（去背、放大、臉部增強）使用 NVIDIA CUDA 加速：

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

如果 `--gpus all` 與 NVIDIA Container Toolkit 都已正確設定，AI 工具卻仍在 CPU 上執行，請從 **設定 → AI 功能** 重新安裝受影響的套件組合（例如去背）。安裝程式會還原 ONNX Runtime 的 GPU 版本；在共用的 AI 環境中，由其他套件組合（例如轉錄）帶入的僅 CPU 版本，可能會遮蔽它。如果在較舊的映像檔上從使用者介面重新安裝仍無法恢復 GPU，請參閱 [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490) 中的手動修復方式。

## 硬體需求 {#hardware-requirements}

這些數字來自對各種系統的基準測試，從搭載 NVIDIA RTX 4070 的現代 amd64 工作站，到 Raspberry Pi，在每一台上都執行完整的工具目錄，並調整 Docker 資源限制，以找出真正的下限。

要在這些等級中偏小的一端執行嗎（Pi、舊筆電、2 GB 的 VPS）？[低資源環境設定](/zh-TW/guide/low-resource)會將這些數字轉化為具體的操作步驟，並附上調校過的上限。

### 快速參考 {#quick-reference}

| 等級 | 使用情境 | CPU | RAM | GPU | 儲存空間 |
|------|----------|-----|-----|-----|---------|
| 最低 | 非 AI 工具（圖片、檔案、輕量 PDF）加上內建的快速 OCR 與臉部偵測；單一使用者；小型批次 | 2 核心 | 2 GB | 無 | 約 7 GB |
| 建議 | 全部五種類型，包括影片、PDF，以及在 CPU 上執行的標準 AI 套件組合；批次；少數使用者 | 4 核心 | 4 GB（HQ 修補需 8 GB） | 無 | 約 25 GB |
| 完整 | 全速執行所有項目，包括 GPU AI；大型批次；多位使用者 | 6-8 核心 | 8 GB | NVIDIA 8 GB+ VRAM（12 GB 較充裕） | 約 35 GB |

**架構：僅支援 64 位元**（`linux/amd64` 或 `linux/arm64`）。SnapOtter 可原生執行於 Intel/AMD 伺服器、Apple Silicon Mac，以及 64 位元 ARM 開發板，包括 **Raspberry Pi 4 與 5**（4-8 GB）。它**無法**在 32 位元 ARM（`armv7`/`armhf`）上執行，因為沒有為其建置映像檔；也無法在 Pi Zero 等 512 MB 等級的開發板上執行，這些開發板低於記憶體下限（見下文）。

### 最低（圖片、檔案與輕量 PDF 工具；無 AI） {#minimum-image-files-and-light-pdf-tools-no-ai}

| 資源 | 需求 |
|---|---|
| CPU | 2 核心 |
| RAM | 2 GB |
| 磁碟 | 約 5.5 GB（映像檔）+ 資料磁碟區 |
| GPU | 不需要 |

全部 222 個非 AI 目錄工具，包括圖片（調整大小、裁切、轉換、壓縮、調整、浮水印）、影片（剪輯、靜音、重新封裝）、音訊（轉換、正規化、剪輯）、PDF（合併、分割、壓縮、旋轉、保護）、檔案轉換，以及專用的轉換預設，都能在普通硬體上執行。即使是大型檔案，大多數操作也能在不到一秒內完成：2.7 MB 的圖片調整大小約 0.05 秒，重新編碼為 WebP 約 2 秒。

記憶體下限是真實存在的，來自 Docker 資源限制的掃描測試：**512 MB 無法啟動整個堆疊**（連一次圖片調整大小都會被終止），**1 GB** 可處理單一檔案操作，但多檔案批次會耗盡記憶體，而 **2 GB / 2 核心** 是能從容處理非 AI 批次的最小配置。內建的快速 OCR 與 `face-detection` 套件組合也能放進 2 GB，但較大的 AI 套件組合（Whisper、LaMa/DDColor、rembg、RealESRGAN、照片修復，以及 SD1.5 HQ 修補）需要 4 到 8 GB 的 RAM，當可用記憶體低於各套件組合的下限時，會事先被拒絕。

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**唯一吃重 CPU 的例外是影片重新編碼。** 串流複製操作（剪輯、靜音、容器重新封裝）是即時的，但轉碼成不同的編解碼器則受限於 CPU。將 1080p / 45 秒的片段重新編碼為 VP9（WebM），在高速的現代 CPU 上約需 **40 秒**，在 Apple Silicon 上約 45 秒，在較舊的行動版 4 核心上約 80 秒，在較舊的 4 核心伺服器上約需 **130 秒**。如果您的工作負載以影片為主，請優先考慮 CPU 核心數與時脈速度，或調高容器的 `cpus:` 限制：隨附的 compose 預設將應用程式限制為 4 個核心（GPU compose 為 8 個）。

### 建議（CPU 上的 AI 工具） {#recommended-ai-tools-on-cpu}

| 資源 | 需求 |
|---|---|
| CPU | 4 核心 |
| RAM | 4 GB |
| 磁碟 | 3 GB（映像檔）+ 約 20 GB（所有選用 AI 套件）+ 工作區 |
| GPU | 不需要（退回 CPU） |

**安裝並執行較大的 AI 套件組合，才是將建議值推高到 4 GB RAM 的原因。** 未安裝任何選用套件時，應用程式閒置的記憶體用量約為 360 MB。舊版 Python 工具共用一個 sidecar，而精準 OCR 則使用專用的長駐分派器，並固定在目前有效的不可變世代。啟用之前，安裝程式會對候選版本執行冒煙測試，接著以原子方式切換到新的分派器，並在垃圾回收之前耗盡舊的分派器。每個官方的精準 OCR 成品都必須在 4 GiB 的 cgroup 內通過其最壞情況的發行測試套件，而主機建議的 4 GB 則為 Node.js 應用程式、Postgres、Redis、佇列與並行工作保留了餘裕。

大多數 AI 工具在 CPU 上完全可用；少數工具確實需要 GPU。在現代 4 核心 CPU 上的實測結果：

| AI 工具 | CPU 耗時 | CPU 上可用？ |
|---|---|---|
| 臉部偵測（blur-faces、smart-crop、red-eye）、noise-removal | 不到 1 秒 | 可用 |
| OCR、轉錄、字幕 | 1-3 秒 | 可用 |
| 上色、臉部增強 | 約 10 秒 | 可用 |
| 去背 / 替換 / 模糊 | 約 29 秒 | 可用（需要等待） |
| AI 放大（RealESRGAN） | 小圖約 33 秒；大型圖片需數分鐘 | 勉強可用，強烈建議使用 GPU |
| 照片修復（完整管線） | 數分鐘 | 不建議，需要 GPU 或高速多核心 CPU |

SnapOtter 刻意不將這些模型下載內建到 Docker 映像檔中。AI 套件組合只會在管理員啟用相關工具時才拉取，儲存在持久化的 `/data/ai` 磁碟區中，並由所有依賴同一模型堆疊的工具共用。這能讓最終的容器映像檔保持精簡，同時仍可讓完整的 AI 安裝達到下方較大的儲存空間數字。

部分工具依賴一個以上的共用套件組合。例如，證件照需要 `background-removal` 與 `face-detection`；如果 `background-removal` 已安裝，啟用證件照只會下載缺少的 `face-detection` 套件組合。所有 AI 工具都採用同樣的重複使用方式。

選用 AI 套件的儲存空間與 CPU 記憶體下限（SnapOtter 會在分派到 Python sidecar 之前檢查可用記憶體，並在低於套件組合的可用記憶體下限時立即拒絕執行）：

| 套件組合 | 磁碟大小 | CPU 記憶體下限 |
|---|---|---|
| 臉部偵測 | 200-300 MB | 2 GB 主機 RAM（約 0.5 GB 可用） |
| 轉錄 | 約 600 MB | 4 GB 主機 RAM（約 2 GB 可用） |
| 物件擦除 + 上色 | 1-2 GB | 4 GB 主機 RAM（約 2 GB 可用） |
| 精準 OCR（`balanced`/`best`） | 下載約 208-234 MiB / 安裝後約 409-488 MiB | 4 GiB 設定的有效記憶體（`fast` 可在 2 GB 上執行） |
| 去背 | 4-5 GB | 4 GB 主機 RAM（約 2.5 GB 可用） |
| 放大 + 臉部增強 + 降噪 | 5-6 GB | 4 GB 主機 RAM（約 2.5 GB 可用） |
| 照片修復 | 4-5 GB | 4 GB 主機 RAM（約 3 GB 可用） |
| 高品質修補（`inpaint-hq`） | 5-7 GB | 8 GB 主機 RAM（約 6 GB 可用） |
| **所有套件組合** | **安裝後約 25 GB** | **4 GB（使用 `inpaint-hq` 時為 8 GB）** |

快速 OCR 透過 Tesseract 內建於映像檔，約增加 25 MiB，不需要選用的 OCR 套件或其 4 GiB 記憶體需求。快速模式支援 `auto`、`en`、`de`、`es`、`fr`、`zh` 與 `ja`，但不支援韓文（`ko`）或阿拉伯文（`ar`）。這兩者使用 `balanced` 或 `best`，因此需要精準套件。精準套件可在官方的 Linux amd64 與 arm64 容器中使用，並在 CPU 上執行 ONNX Runtime。NVIDIA 主機同樣使用這個 CPU OCR 執行階段，因此 OCR 不依賴 CUDA 版本或 GPU 架構。精準執行階段至少需要 4 GiB 的有效記憶體：即設定的容器 cgroup 限制，若無則為主機記憶體。在下載套件之前，SnapOtter 會拒絕低於該簽署相容性下限的系統。在 libc 與 Python ABI 無法保證的裸機或預先建置封存檔上，同樣會拒絕安裝精準套件。在這些不受支援的主機上，韓文與阿拉伯文 OCR 會回傳明確的不相容錯誤，絕不會悄悄退回快速模式。

共用同一個 `DATA_DIR` 的複本必須使用相同的 CPU 架構；多複本部署請以節點親和性（node affinity）固定。混合 amd64/arm64 的複本需要各自獨立的資料磁碟區與獨立的 SnapOtter 部署。

精準執行階段只保留一個有效世代，並在啟用後清除其下載快取。在此版本中，首次安裝暫時需要約 620-720 MiB 用於封存檔與暫存，而升級時在舊世代仍為有效的期間，尖峰可能接近 1.2 GiB。安裝程式會在下載或解壓縮之前，根據簽署的索引與目前的世代計算確切需求，若資料磁碟區太小則提早失敗。

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### 完整（NVIDIA CUDA 上的 AI 工具） {#full-ai-tools-on-nvidia-cuda}

| 資源 | 需求 |
|---|---|
| CPU | 6-8 核心（即使使用 GPU AI，影片前處理與並行也在 CPU 上執行） |
| RAM | 8 GB |
| GPU | NVIDIA，8+ GB VRAM（建議 12 GB） |
| 磁碟 | 總計約 35 GB |

NVIDIA GPU（CUDA）能大幅加快大型 AI 模型的速度。在 RTX 4070 與現代 CPU 上的實測比較：

| AI 工具 | GPU 加速倍率 | 備註 |
|---|---|---|
| AI 放大（RealESRGAN 2×） | **約 47×** | 最大的收益：不到一秒，對比約 33 秒（大型圖片需數分鐘） |
| 臉部增強（CodeFormer） | **約 12×** | 約 0.9 秒對比約 11 秒 |
| 轉錄（Whisper） | 約 4.5× | |
| 去背 / 替換 / 模糊 | 約 4× | GPU 約 7 秒，CPU 約 29 秒 |
| 上色 | 約 1.8× | |
| OCR、臉部偵測、紅眼、降噪 | 約 1× | 在 CPU 上已經很快，GPU 沒有幫助 |
| 照片修復 | 無 | 即使有 GPU 也受限於 CPU（GPU 使用率 0%）；在這裡，高速 CPU 比 GPU 更重要 |

值得配備 GPU 的工具是 **放大、臉部增強、轉錄與去背**。臉部偵測、OCR 與紅眼受限於 CPU 且已經很快，所以 GPU 沒有任何幫助。

在放大並搭配臉部增強時，VRAM 用量尖峰可達 7.5 GB。6 GB 的 NVIDIA GPU 能個別執行大多數 AI 工具，但放大會失敗。8-12 GB 的 VRAM 可處理所有項目。

目前 AI 推論不支援透過 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 內顯加速。將 `/dev/dri` 對應到容器中，並不會啟用 AI 的 GPU 加速；除非有 NVIDIA CUDA，否則 SnapOtter 會在 CPU 上執行 AI 工具。

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

針對預設限制為 4 核心的應用程式容器，同時發出圖片調整大小請求的結果：

| 並行請求數 | 平均回應時間 | 錯誤 |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

隨著工作執行緒池趨於飽和，回應時間以次線性方式變慢，且沒有錯誤。調高應用程式容器的 `cpus:` 限制（或使用核心數更多的主機）可提高上限。請注意，繁重的工作（影片轉碼、CPU 上的 AI）會在整個執行期間佔用一個工作執行緒，因此請依預期同時執行的繁重工作數量來規劃 CPU，而不只是請求數量。

### 支援的圖片格式 {#supported-image-formats}

SnapOtter 支援 **55 種以上的輸入格式**與 **14 種輸出格式**，包括來自 20 多個相機品牌的 RAW 檔案、專業格式（PSD、EPS、OpenEXR、HDR）、現代編解碼器（JPEG XL、AVIF、HEIC、QOI），以及科學與遊戲格式（FITS、DDS）。

每種支援格式、所用解碼器與可用品質控制項的詳細資訊，請參閱[完整格式清單](/zh-TW/guide/supported-formats)。

### 已知限制 {#known-limitations}

- **內容感知調整大小**在處理大型圖片（>5 MP）時會當機，這是 caire 執行檔的限制。較小的圖片可正常運作。
- **HEIF 解碼**需要 13-23 秒。HEIC（Apple 的變體）快得多，只需 0.3-0.9 秒。
- **放大**在 CPU 上處理小圖以外的圖片會逾時。實際使用需要 GPU。
- **CodeFormer** 臉部增強明顯比 GFPGAN 慢（GPU 上為 53 秒對比 2 秒）。大多數使用情境建議使用 GFPGAN。

## 磁碟區 {#volumes}

| 掛載點 / 磁碟區 | 用途 | 是否必要？ |
|---|---|---|
| `/data`（app） | AI 模型、Python venv、使用者檔案 | **是**：沒有它會遺失檔案 |
| `/tmp/workspace`（app） | 暫時性處理檔案（自動清理） | 建議 |
| `SnapOtter-pgdata`（postgres） | PostgreSQL 資料目錄（使用者、設定、管線、工作） | **是**：沒有它會遺失資料 |
| `SnapOtter-redisdata`（redis） | 用於持久化工作佇列的 Redis append-only 檔案 | 建議 |

### 綁定掛載與具名磁碟區 {#bind-mounts-vs-named-volumes}

**具名磁碟區**（建議）：由 Docker 自動管理權限：
```yaml
volumes:
  - SnapOtter-data:/data
```

**綁定掛載**：由您自行管理權限。請設定 `PUID`/`PGID` 以符合您的主機使用者：
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### 儲存空間權限 {#storage-permissions}

SnapOtter 在執行階段會寫入兩個位置：`/data`（使用者檔案、日誌、AI 模型與 Python venv）以及 `/tmp/workspace`（暫時性處理暫存區）。兩者都必須可由容器所執行的使用者寫入。如果其中任何一個不可寫入，容器會在**啟動時立即失敗**，並顯示一則訊息，指出目錄、目前執行的 UID/GID 以及修復方式，而不是看似「健康」地啟動，卻在第一次上傳時以含糊的錯誤失敗。日誌目錄（`LOG_DIR`，映像檔中為 `/data/logs`）在每種儲存模式下都以同樣方式檢查，因為即使檔案存放在 S3，日誌仍留在本機。

權限的處理方式取決於容器的啟動方式：

**預設（以 root 啟動，再降權為 `snapotter`）**：entrypoint 以 root 啟動，修正已掛載磁碟區的擁有者，然後透過 `gosu` 降權為非特權的 `snapotter` 使用者。具名磁碟區無須任何設定即可運作。對於綁定掛載，請將 `PUID`/`PGID` 設為您的主機使用者（如上所示），讓它寫入的檔案歸您所有。

**Kubernetes / OpenShift（透過 `runAsUser` 以非 root 身分執行）**：直接以非 root 使用者啟動時，容器無法自行對磁碟區執行 chown，因此必須由協調器讓它們可寫入。請設定 `fsGroup`：

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

映像檔的可寫入目錄由 GID 0 群組擁有且群組可寫入，因此以**任意 UID** 加上 root 補充群組執行的 Pod（OpenShift 預設）無須 `chown` 即可寫入。

**TrueNAS Scale（以及其他「外部 UID」設定）**：TrueNAS 以非 root 使用者（通常是 `568:568`）執行應用程式，並掛載由不同使用者擁有的主機資料集，因此 entrypoint 與 `fsGroup` 都無法單獨讓它們可寫入。請擇一處理：

- **以 root 執行應用程式**（建議）：不設定應用程式的使用者，或將其設為 `0`，讓預設的 entrypoint 修正權限並降權為 `snapotter`。
- **以 UID `999` 執行**：將應用程式的使用者/群組設為 `999:999`（SnapOtter 內建的 `snapotter` 使用者），使其符合映像檔的擁有者設定。
- 從 TrueNAS shell 對主機資料集執行 **`chown`**，改為容器所執行的 UID：

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

啟動錯誤會指出該使用的確切 UID，因此最快的做法是先啟動一次應用程式，讀取訊息，然後據此 `chown`（或調整使用者）。

## 環境變數 {#environment-variables}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `AUTH_ENABLED` | `true` | 啟用或停用登入要求 |
| `DEFAULT_USERNAME` | `admin` | 初始管理員使用者名稱 |
| `DEFAULT_PASSWORD` | `admin` | 初始管理員密碼（首次登入時強制變更） |
| `MAX_UPLOAD_SIZE_MB` | `0`（無限制） | 單一檔案的上傳上限（MB）。映像檔預設為 `0`；從原始碼建置時起始值為 100 |
| `MAX_BATCH_SIZE` | `0`（無限制） | 每個批次請求的最大檔案數。映像檔預設為 `0`；從原始碼建置時起始值為 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | 每個 IP 每分鐘的 API 請求數（設為 0 可停用） |
| `MAX_USERS` | `0`（無限制） | 使用者帳號數上限 |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | 哪些對端可以透過 `X-Forwarded-For` 設定用戶端 IP。預設僅限私人網路 |
| `PUID` | `999` | 以此 UID 執行（用於綁定掛載權限） |
| `PGID` | `999` | 以此 GID 執行（用於綁定掛載權限） |
| `LOG_LEVEL` | `info` | 日誌詳細程度：fatal、error、warn、info、debug、trace |
| `CONCURRENT_JOBS` | `0`（自動） | 並行 AI 處理工作的最大數量 |
| `SESSION_DURATION_HOURS` | `168` | 登入工作階段的有效期限（7 天） |
| `CORS_ORIGIN` | （空白） | 以逗號分隔的允許來源，留空則為同源 |

### 對外代理與私有 CA {#outbound-proxy-and-private-ca}

官方容器啟用了 Node 的環境代理支援。如果 SnapOtter 必須透過企業代理連線到 OCR 執行階段儲存庫或其他 HTTPS 服務，請設定 `HTTPS_PROXY`（必要時也設定 `HTTP_PROXY`）。將 `NO_PROXY` 設為必須直接連線的主機清單，以逗號分隔，例如 Postgres、Redis 與內部物件儲存空間。

如果代理或內部服務是由私有憑證授權單位簽署，請以唯讀方式掛載該 CA 憑證，並讓 `NODE_EXTRA_CA_CERTS` 指向它。該檔案必須在 Node 處理程序啟動時就已存在：

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

請將代理憑證放在 Compose 檔案之外（例如放在受保護的 `.env` 檔案或機密中）。請勿停用 TLS 驗證：簽署的 OCR 索引會驗證發行中繼資料，而一般的 TLS 驗證仍會保護傳輸過程以及所有其他對外請求。

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

`TRUST_PROXY` 預設為 `loopback,linklocal,uniquelocal`，因此 SnapOtter 只會相信來自私人網路對端的 `X-Forwarded-For`。位於同一主機、Docker 網路或區域網路上的反向代理預設即受信任，這表示速率限制、登入暴力破解限制器、稽核日誌與企業版 IP 允許清單，無須任何設定就能看到真實的用戶端 IP。

只有在前端代理是從**公開**位址連線到 SnapOtter 時才設定 `TRUST_PROXY=true`，例如位於不同網路的雲端負載平衡器。在直接對外暴露的執行個體上，該值會讓 `request.ip` 受攻擊者控制，因為呼叫端只要輪替該標頭，每個請求都會得到一個全新的速率限制桶。

在測量用戶端 IP 之前，有兩件事需要知道。macOS 與 Windows 上的 Docker Desktop 會透過使用者空間代理提供已發布的連接埠，並將每個來源位址改寫為 VM 閘道 `192.168.65.1`，因此在那裡，任何 `TRUST_PROXY` 的值都無法還原真實的用戶端；任何面向網際網路的部署都請使用 Linux。另外，在任何平台上，透過 `localhost` 連線到已發布的連接埠時，觀察到的會是橋接閘道，而不是您的用戶端，因此 localhost 測試無法說明真實用戶端的歸屬方式。`TRUST_PROXY` 值的完整對照表與 Docker Desktop 的注意事項，請見 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy)。

下面每種代理都需要注意兩件事：允許較大的請求本文（上傳），以及不要緩衝回應。緩衝回應的代理會破壞 SSE 進度，更明顯的是會讓大型檔案下載「開始了卻永遠無法完成」，因為代理會先保留整個檔案，才往下傳遞。SnapOtter 在下載時會送出 `X-Accel-Buffering: no`，因此即使其他地方保持緩衝開啟，nginx 也會以串流方式傳送；但 nginx 以外的代理需要明確停用回應緩衝（每個設定範例中都有示範）。如果下載中途停滯，首先要檢查的就是前端是否有緩衝型代理。

關於 HSTS 的說明：API 會在每個回應中自行送出 `Strict-Transport-Security`，因此會直接傳遞回應標頭的代理（下面所有設定都是如此）無須自行設定 HSTS。只有在您的代理被設定為移除或覆寫上游回應標頭時，才需要保留該標頭，或在邊緣重新加入。

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

### 部署在子路徑下 {#subpath}

若要在 `https://example.com/snapotter` 提供服務，請在 SnapOtter 容器環境中設定 `BASE_PATH=/snapotter` 並重新啟動。官方的 CPU 與 GPU Compose 檔案也接受來自您的 shell 或 Compose `.env` 檔案的 `BASE_PATH`。同一個映像檔可用於任何路徑，無須重新建置前端。

`BASE_PATH` 接受以斜線分隔、由字母、數字、`_` 或 `-` 組成的區段，包括 `/apps/snapotter` 這類巢狀路徑。結尾的斜線是選用的。若是根路徑部署，請留空（預設值），或設定 `/`。

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

此範例會保留前綴。在轉送前先移除 `/snapotter` 的代理同樣受到支援。內部健康檢查可以繼續使用 `/api/v1/health`。對於 OIDC 或 SAML，另外請設定 `EXTERNAL_URL=https://example.com/snapotter`，並更新識別提供者的回呼 URL，分別加入 `/snapotter/api/auth/oidc/callback` 或 `/snapotter/api/auth/saml/callback`。

API 指令碼不需修改即可繼續運作：API 回應中的 URL（例如工具的 `downloadUrl`）無論 `BASE_PATH` 為何，都以 `/api/` 開頭。請將它們附加到您執行個體的基礎 URL（`https://example.com/snapotter` + `/api/v1/download/...`），而不要依網域根目錄解析它們。

請透過帶有前綴的 URL（`https://example.com/snapotter`）開啟使用者介面。沒有帶前綴就抵達的瀏覽器會被自動導向該處；只有 API 請求預期會不帶前綴就送達應用程式。如果日誌顯示 `Requests arrive under /snapotter/ but BASE_PATH is empty`，表示您的代理轉送了 `BASE_PATH` 未宣告的前綴：請將 `BASE_PATH` 設為該前綴，或在代理處移除前綴。

### Nginx Proxy Manager {#nginx-proxy-manager}

1. 新增 Proxy Host
2. 將 Domain Name 設為您的網域
3. 將 Scheme 設為 `http`，Forward Hostname 設為 `SnapOtter`（或您的容器 IP），Forward Port 設為 `1349`
4. 啟用 WebSocket 支援
5. 在 Advanced 中加入：`client_max_body_size 500M;` 與 `proxy_buffering off;`

API 的 `Strict-Transport-Security` 標頭會原封不動地通過 NPM；SSL 分頁上的 HSTS 開關是額外的選用項目。

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

Traefik 會原封不動地轉送上游回應標頭，因此 API 的 `Strict-Transport-Security` 標頭不需要 `headers` 中介軟體就能到達瀏覽器。如果您已經執行了會改寫回應標頭的中介軟體，請確認它不會動到該標頭。

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

`flush_interval -1` 會停用回應緩衝，這是 SSE 進度事件（批次處理、AI 工具、功能安裝）以及大型檔案下載以串流方式通過而不停滯所必需的。延長的逾時設定可讓大型檔案上傳順利完成，而不會被 Caddy 提早關閉連線。Caddy 也會原封不動地傳遞 API 的 `Strict-Transport-Security` 標頭，因此 HSTS 不需要 `header` 指令。

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

注意：Cloudflare 在免費方案上有 100 MB 的上傳限制。請設定 `MAX_UPLOAD_SIZE_MB=100` 以符合此限制。

通道會轉送 API 的回應標頭，包括 `Strict-Transport-Security`，因此不需要在儀表板中設定 HSTS（Cloudflare 自身邊緣的 HSTS 設定則是額外的選用項目）。

## 疑難排解 {#troubleshooting}

### 首次啟動失敗後出現「Postgres not reachable: EAI_AGAIN」 {#eai-again-after-failed-first-start}

如果第一次 `docker compose up -d` 中途失敗（連接埠已被佔用是常見原因），單純重試 `up -d` 可能會啟動 app 容器，卻沒有將它接上 compose 網路。接著應用程式會不斷崩潰重啟，並出現：

```
Postgres not reachable: EAI_AGAIN
```

而 `docker ps` 卻顯示 postgres 是健康的。這個錯誤是真的，但指向了錯誤的容器：沒有網路，`postgres` 主機名稱的 DNS 完全無法解析，而重新啟動原則會永遠重複同樣的失敗。

請先修復造成第一次啟動失敗的問題（通常是釋放該連接埠），然後強制重新建立 app 容器，使其重新接上網路：

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows：其他裝置可連線，但 PC 本身不行 {#windows-wsl2-loopback}

當 Docker 執行於 WSL2 內（常見的 Windows 設定）時，堆疊可能可以從網路上的其他每台機器連線，但在 Windows 主機本身上，`http://localhost:1349` 卻逾時，即使啟用了 WSL 的鏡像網路模式也一樣。該連接埠不會出現在 Windows 的 `netstat` 中，而容器本身並沒有任何問題。

請從另一台裝置開啟應用程式，或在發行版內使用它自己的位址（在 WSL shell 中使用 `hostname -I`）。如果 localhost 轉送在您的 WSL 版本上剛好可用，請把它視為額外的好處，而不要依賴它。

## CI/CD {#ci-cd}

GitHub 儲存庫有三個工作流程：

- **ci.yml**：在每次推送與 PR 時自動執行。進行 Lint、型別檢查、測試、建置，並驗證 Docker 映像檔（不推送）。
- **release.yml**：透過 `workflow_dispatch` 手動觸發。執行 semantic-release 以建立版本標籤與 GitHub release，接著建置多架構 Docker 映像檔（amd64 + arm64），並推送到 Docker Hub（`snapotter/snapotter`）與 GitHub Container Registry（`ghcr.io/snapotter-hq/snapotter`）。
- **deploy-docs.yml**：在推送到 `main` 時，建置本文件網站並部署到 Cloudflare Pages。

若要建立發行版本，請在 GitHub 使用者介面中前往 **Actions > Release > Run workflow**，或執行：

```bash
gh workflow run release.yml
```

Semantic-release 會根據提交歷史決定版本。`latest` Docker 標籤一律指向最新的發行版本。

## 分析 {#analytics}

SnapOtter 包含匿名產品分析（工具使用模式、錯誤報告），以協助找出錯誤並改進功能。此功能預設為開啟。您的檔案、檔名與個人資料絕不會成為其中的一部分。停用分析後，SnapOtter 仍可正常運作。

### 停用分析 {#disabling-analytics}

執行階段的退出方式是管理員的一鍵開關。開啟「設定 > 系統 > 隱私權」，並關閉匿名產品分析。整個執行個體會立即停止，無須重新建置。

若要取得永遠不會送出分析的映像檔，請複製儲存庫並重新建置，設定建置時的硬性關閉：

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
