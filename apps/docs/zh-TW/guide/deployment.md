---
description: "使用 Docker 將 SnapOtter 部署到正式環境。硬體需求、GPU 設定，以及 Nginx、Traefik 和 Cloudflare 的反向代理設定。"
i18n_output_hash: d1dc1e293c3a
i18n_source_hash: 98172965118b
i18n_provenance: human
---

# 部署 {#deployment}

SnapOtter 以 3 個容器的 Docker Compose 堆疊部署：SnapOtter 應用程式映像檔、PostgreSQL 17 和 Redis 8。應用程式映像檔支援 **linux/amd64**（搭配 NVIDIA CUDA 進行 AI 加速）與 **linux/arm64**（CPU），因此可原生執行於 Intel/AMD 伺服器、Apple Silicon Mac，以及 Raspberry Pi 4/5 等 ARM 裝置。目前不支援透過 VA-API、Quick Sync 或 OpenCL 進行 Intel/AMD iGPU 加速的 AI 推論。

關於 GPU 設定、Docker Compose 範例與版本鎖定，請參閱 [Docker Image](./docker-tags)。


<!-- korean-ocr-contract:start -->
::: info 韓語 OCR 相容性
快速 OCR 支援 `auto`、`en`、`de`、`es`、`fr`、`zh` 和 `ja`，但不支援韓語 (`ko`)。韓語需要精確 OCR 套件以及 `balanced` 或 `best`。此套件可在官方 Linux amd64 和 arm64 容器上執行；即使是 NVIDIA 主機，OCR 仍使用 CPU。不受支援的系統會傳回明確的相容性錯誤，絕不會靜默回退至 `fast`。韓語搭配 `fast` 或舊版 `tesseract` 別名時，會在排入佇列前以 `FEATURE_INCOMPATIBLE` 和 `fast-korean-unsupported` 拒絕。
:::
<!-- korean-ocr-contract:end -->
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

之後即可在 `http://localhost:1349` 存取應用程式。

> **遇到 Docker Hub 速率限制？** 將 `snapotter/snapotter:latest` 換成 `ghcr.io/snapotter-hq/snapotter:latest`，改從 GitHub Container Registry 拉取。兩個登錄檔在每次發行時都會收到相同的映像檔。

## 快速開始（NVIDIA CUDA） {#quick-start-nvidia-cuda}

對於支援的 AI 工具上的 NVIDIA CUDA 加速（背景去除、放大、臉部增強）：

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

在記錄中確認 CUDA 是否偵測到：

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## 硬體需求 {#hardware-requirements}

這些數字來自跨多種系統的效能測試，從搭載 NVIDIA RTX 4070 的現代 amd64 工作站，一直到 Raspberry Pi，在每台機器上執行整個工具目錄，並掃描 Docker 資源限制以找出實際的下限。

運行在這些等級的最低端（Pi、舊筆電、2 GB 的 VPS）？[低資源環境部署](/zh-TW/guide/low-resource)將這些數字化為一份帶有調校上限的具體逐步教學。

### 快速參考 {#quick-reference}

| 等級 | 使用情境 | CPU | RAM | GPU | 儲存空間 |
|------|----------|-----|-----|-----|---------|
| 最低 | 影像、檔案與輕量 PDF 工具；單一使用者；小批次 | 2 核心 | 2 GB | 無 | ~7 GB |
| 建議 | 全部五種模態，包含影片、PDF 與 CPU 上的 AI；批次；少數使用者 | 4 核心 | 4 GB | 無 | ~25 GB |
| 完整 | 全部高速運作，包含 GPU AI；大量批次；多位使用者 | 6-8 核心 | 8 GB | NVIDIA 8 GB 以上 VRAM（12 GB 較充裕） | ~35 GB |

**架構：僅限 64 位元**（`linux/amd64` 或 `linux/arm64`）。SnapOtter 可原生執行於 Intel/AMD 伺服器、Apple Silicon Mac，以及 64 位元 ARM 板，包括 **Raspberry Pi 4 和 5**（4-8 GB）。它**無法**執行於 32 位元 ARM（`armv7`/`armhf`），因為沒有為其建置映像檔，也無法執行於 Pi Zero 這類 512 MB 等級的板子，因為它們低於記憶體下限（見下文）。

### 最低（影像、檔案與輕量 PDF 工具；無 AI） {#minimum-image-files-and-light-pdf-tools-no-ai}

| 資源 | 需求 |
|---|---|
| CPU | 2 核心 |
| RAM | 2 GB |
| 磁碟 | ~5.5 GB（映像檔）+ 資料磁碟區 |
| GPU | 非必要 |

全部 222 個非 AI 目錄工具，包括影像（調整大小、裁切、轉換、壓縮、調整、浮水印）、影片（修剪、靜音、重新封裝）、音訊（轉換、正規化、修剪）、PDF（合併、分割、壓縮、旋轉、保護）、檔案轉換，以及專屬的轉換預設，都能在一般硬體上執行。即使是大型檔案，多數作業也能在遠低於一秒內完成：一張 2.7 MB 的影像調整大小約需 ~0.05 秒，重新編碼為 WebP 約需 ~2 秒。

記憶體下限是真實存在的，這來自一次 Docker 資源限制掃描：**512 MB 無法啟動堆疊**（即使是單一影像調整大小也會被終止），**1 GB** 可處理單一檔案作業，但多檔案批次會耗盡記憶體，而 **2 GB / 2 核心** 是能舒適處理批次的最小組態。

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**唯一吃重 CPU 的例外是影片重新編碼。** 串流複製作業（修剪、靜音、容器重新封裝）是瞬間完成的，但轉碼為不同的編解碼器則受限於 CPU。一段 1080p / 45 秒的影片重新編碼為 VP9（WebM），在快速的現代 CPU 上約需 **~40 秒**，在 Apple Silicon 上約 ~45 秒，在較舊的行動 4 核心上約 ~80 秒，在較舊的 4 核心伺服器上則需 **~130 秒**。如果你的工作負載偏重影片，請優先考慮 CPU 核心數與時脈速度，或提高容器的 `cpus:` 限制。隨附的 compose 預設將應用程式上限設為 4 核心（GPU compose 為 8 核心）。

### 建議（CPU 上的 AI 工具） {#recommended-ai-tools-on-cpu}

| 資源 | 需求 |
|---|---|
| CPU | 4 核心 |
| RAM | 4 GB |
| Disk | 3 GB（影像）+ 約 20 GB（所有選用 AI 套件）+ 工作區 |
| GPU | 非必要（CPU 後備） |

**安裝和運行更大的 AI 捆綁包將 RAM 的建議量推至 4 GB。** 如果未安裝可選包，則應用程式空閒時間約為 360 MB。 舊版 Python 工具共享 sidecar，而精確的 OCR 使用固定到活動不可變產生的專用長壽命 dispatcher。 在啟動之前，安裝程式會在候選程式上執行 smoke test。 然後，它會自動切換到新的 dispatcher，並在 garbage collection 之前耗盡先前的 dispatcher。 每個官方準確的 OCR 工件都必須通過 4 GiB cgroup 內最壞情況的 release suite， 雖然 4 GB 主機建議為 Node.js 應用程式留出了空間， Postgres, Redis, 隊列， 並同時進行工作。

多數 AI 工具在 CPU 上完全可用；少數確實需要 GPU。在現代 4 核心 CPU 上測得：

| AI 工具 | CPU 時間 | CPU 上可用？ |
|---|---|---|
| 臉部偵測（模糊臉部、智慧裁切、紅眼）、雜訊移除 | 不到 1 秒 | 是 |
| OCR、轉錄、字幕 | 1-3 秒 | 是 |
| 上色、臉部強化 | ~10 秒 | 是 |
| 去背 / 替換 / 模糊 | ~29 秒 | 是（需等待） |
| AI 放大（RealESRGAN） | 小圖 ~33 秒；大圖需數分鐘 | 勉強可用 — 強烈建議 GPU |
| 相片修復（完整流程） | 數分鐘 | 否 — 需要 GPU 或快速的多核心 CPU |

SnapOtter 刻意不將這些模型下載內建於 Docker 映像檔中。AI 套件組僅在管理員啟用相關工具時才會拉取，儲存於持久化的 `/data/ai` 磁碟區，並由所有依賴相同模型堆疊的工具共用。這讓最終容器映像檔保持精簡，同時仍允許完整的 AI 安裝達到下方較大的儲存數字。

有些工具依賴不只一個共用套件組。舉例來說，證件照同時需要 `background-removal` 和 `face-detection`；如果 `background-removal` 已安裝，啟用證件照只會下載缺少的 `face-detection` 套件組。相同的重用機制適用於所有 AI 工具。

可選 AI 包儲存估算：

| 套件組 | 磁碟大小 |
|---|---|
| 去背 | 4-5 GB |
| 放大 + 臉部強化 + 雜訊移除 | 5-6 GB |
| 臉部偵測 | 200-300 MB |
| 物件消除 + 上色 | 1-2 GB |
| 精確 OCR（`balanced`/`best`） | ~208-234 MiB 下載 / ~409-488 MiB 安裝 |
| 相片修復 | 4-5 GB |
| 轉錄 | 〜600MB |
| **所有捆綁包** | **已安裝~20 GB** |

Fast OCR 透過 Tesseract 內建到映像中，增加約 25 個 MiB，並且不需要選購的 OCR 套件或其 4 個 GiB 記憶體需求。 準確的包可以在官方找到 Linux  amd64 和 arm64 容器和運行 ONNX Runtime 在 CPU。 NVIDIA 主機使用相同的 CPU OCR 執行時，因此 OCR 不依賴 CUDA 版本或 GPU 架構。 準確的運行時需要至少 4 GiB 的有效記憶體：配置的容器 cgroup 限制，否則為主機記憶體。 在下載套件之前，SnapOtter 拒絕低於簽章相容性最低值的系統。 在無法保證 libc 和 Python ABI 的 bare-metal/預建檔案上，也會拒絕準確的套件安裝。

共用同一個 `DATA_DIR` 的複本必須使用相同的 CPU 架構；請透過節點親和性將多複本部署固定在相容的節點上。混合使用 amd64/arm64 的複本需要各自獨立的資料磁碟區和 SnapOtter 部署。

精確的運行時保持一代處於活動狀態，並在啟動後清除其下載快取。 對於此版本，首次安裝暫時需要大約 620-720 MiB 用於存檔和暫存，升級可以在老一代保持活動狀態時達到接近 1.2 GiB 的峰值。 安裝程式在下載或提取之前根據簽章索引和當前代計算確切的要求，如果資料量太小，安裝程式會提前失敗。

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
| CPU | 6-8 核心（即使使用 GPU AI，影片前置處理與並行仍在 CPU 上執行） |
| RAM | 8 GB |
| GPU | NVIDIA，8 GB 以上 VRAM（建議 12 GB） |
| 磁碟 | 總計 ~35 GB |

NVIDIA GPU（CUDA）能大幅加速吃重的 AI 模型。在 RTX 4070 與現代 CPU 上測得：

| AI 工具 | GPU 加速倍數 | 備註 |
|---|---|---|
| AI 放大（RealESRGAN 2×） | **~47×** | 最大的收益 — 不到一秒，對比 ~33 秒（大圖需數分鐘） |
| 臉部強化（CodeFormer） | **~12×** | ~0.9 秒對比 ~11 秒 |
| 轉錄（Whisper） | ~4.5× | |
| 去背 / 替換 / 模糊 | ~4× | GPU 上 ~7 秒對比 CPU 上 ~29 秒 |
| 上色 | ~1.8× | |
| OCR、臉部偵測、紅眼、雜訊移除 | ~1× | 在 CPU 上已很快 — GPU 幫不上忙 |
| 相片修復 | 無 | 即使在 GPU 上也受限於 CPU（0% GPU 使用率）；此處快速的 CPU 比 GPU 更重要 |

值得使用 GPU 的工具是 **放大、臉部強化、轉錄和去背**。臉部偵測、OCR 和紅眼受限於 CPU 且已經很快，因此 GPU 幫不上忙。

在放大搭配臉部強化時，VRAM 峰值使用量達到 7.5 GB。6 GB 的 NVIDIA GPU 對多數個別 AI 工具都能運作，但在放大時會失敗。8-12 GB VRAM 可處理所有情況。

目前不支援透過 VA-API、Quick Sync 或 OpenCL 進行 Intel/AMD iGPU 加速的 AI 推論。將 `/dev/dri` 對應到容器中並不會啟用 AI GPU 加速；除非有 NVIDIA CUDA 可用，否則 SnapOtter 會在 CPU 上執行 AI 工具。

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

對預設限制 4 核心的應用程式容器發出的並行影像調整大小請求：

| 並行請求數 | 平均回應時間 | 錯誤 |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

隨著工作者集區飽和，回應時間以次線性方式劣化，且無錯誤。提高應用程式容器的 `cpus:` 限制（或使用核心數更多的主機）可提升上限。請注意，吃重的作業（影片轉碼、CPU AI）在整個執行期間都會佔住一個工作者，因此請依你預期的並行吃重作業數量來調整 CPU，而不只是依請求數。

### 支援的影像格式 {#supported-image-formats}

SnapOtter 支援 **55+ 種輸入格式** 與 **14 種輸出格式**，包括來自 20+ 相機品牌的 RAW 檔、專業格式（PSD、EPS、OpenEXR、HDR）、現代編解碼器（JPEG XL、AVIF、HEIC、QOI），以及科學/遊戲格式（FITS、DDS）。

關於每種支援格式、使用的解碼器與可用的品質控制的詳細資訊，請參閱[完整格式清單](/zh-TW/guide/supported-formats)。

### 已知限制 {#known-limitations}

- **內容感知調整大小**在大型影像（>5 MP）上會因 caire 二進位檔的限制而當機。對較小的影像運作正常。
- **HEIF 解碼**需要 13-23 秒。HEIC（Apple 的變體）快得多，僅需 0.3-0.9 秒。
- **放大**在 CPU 上對超出小圖的任何影像都會逾時。實務使用需要 GPU。
- **CodeFormer** 臉部強化明顯比 GFPGAN 慢（GPU 上 53 秒對比 2 秒）。多數使用情境建議使用 GFPGAN。

## 磁碟區 {#volumes}

| 掛載 / 磁碟區 | 用途 | 是否必要？ |
|---|---|---|
| `/data`（app） | AI 模型、Python venv、使用者檔案 | **是** — 少了會遺失檔案 |
| `/tmp/workspace`（app） | 暫存處理檔案（自動清理） | 建議 |
| `SnapOtter-pgdata`（postgres） | PostgreSQL 資料目錄（使用者、設定、管線、作業） | **是** — 少了會遺失資料 |
| `SnapOtter-redisdata`（redis） | Redis 僅附加檔案，用於持久化的作業佇列 | 建議 |

### 繫結掛載 vs. 具名磁碟區 {#bind-mounts-vs-named-volumes}

**具名磁碟區**（建議）— Docker 會自動管理權限：
```yaml
volumes:
  - SnapOtter-data:/data
```

**繫結掛載** — 由你管理權限。設定 `PUID`/`PGID` 以符合你的主機使用者：
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### 儲存權限 {#storage-permissions}

SnapOtter 在執行期間會寫入兩個位置：`/data`（使用者檔案、記錄、AI 模型與 Python venv）和 `/tmp/workspace`（暫存處理暫存區）。兩者都必須可由容器所執行的使用者寫入。若其中之一不可寫入，容器會在**啟動時快速失敗**，並顯示一則訊息，指出該目錄、執行中的 UID/GID，以及修正方式，而不是在啟動時看似「健康」，然後在第一次上傳時以難解的錯誤失敗。

權限的處理方式取決於容器的啟動方式：

**預設（以 root 啟動，降權至 `snapotter`）** — 進入點以 root 啟動，修正已掛載磁碟區的擁有權，然後透過 `gosu` 降權至非特權的 `snapotter` 使用者。具名磁碟區無需任何設定即可運作。對於繫結掛載，請將 `PUID`/`PGID` 設為你的主機使用者（如上），使它寫入的檔案由你擁有。

**Kubernetes / OpenShift（透過 `runAsUser` 以非 root 執行）** — 直接以非 root 使用者啟動時，容器無法自行 chown 磁碟區，因此協調器必須使其可寫入。請設定 `fsGroup`：

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

映像檔的可寫入目錄群組擁有者為 GID 0 且群組可寫入，因此以**任意 UID** 加上 root 補充群組（OpenShift 的預設值）執行的 pod 無需 `chown` 即可寫入。

**TrueNAS Scale（以及其他「外來 UID」設定）** — TrueNAS 以非 root 使用者執行應用程式（通常是 `568:568`），並掛載由不同使用者擁有的主機資料集，因此進入點和 `fsGroup` 都無法自行使其可寫入。請擇一：

- **以 root 執行應用程式**（建議）— 將應用程式的使用者保持未設定或設為 `0`，讓預設進入點修正權限並降權至 `snapotter`。
- **以 UID `999` 執行** — 將應用程式的使用者/群組設為 `999:999`（SnapOtter 內建的 `snapotter` 使用者），使其符合映像檔的擁有權。
- 從 TrueNAS shell 將主機資料集 **`chown`** 至容器所執行的 UID：

  ```bash
  # 使用啟動錯誤中的 UID（或在容器內執行 `id`）
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

啟動錯誤會指出要使用的確切 UID，因此最快的做法是先啟動一次應用程式、讀取訊息，然後據此 `chown`（或調整使用者）。

## 環境變數 {#environment-variables}

| 變數 | 預設值 | 說明 |
|---|---|---|
| `AUTH_ENABLED` | `true` | 啟用/停用登入需求 |
| `DEFAULT_USERNAME` | `admin` | 初始管理員使用者名稱 |
| `DEFAULT_PASSWORD` | `admin` | 初始管理員密碼（首次登入時強制變更） |
| `MAX_UPLOAD_SIZE_MB` | `100` | 每個檔案的上傳限制 |
| `MAX_BATCH_SIZE` | `100` | 每個批次請求的最大檔案數 |
| `RATE_LIMIT_PER_MIN` | `1000` | 每個 IP 每分鐘的 API 請求數（設為 0 以停用） |
| `MAX_USERS` | `0`（無限制） | 最大使用者帳號數 |
| `TRUST_PROXY` | `true` | 信任來自反向代理的 X-Forwarded-For 標頭 |
| `PUID` | `999` | 以此 UID 執行（用於繫結掛載權限） |
| `PGID` | `999` | 以此 GID 執行（用於繫結掛載權限） |
| `LOG_LEVEL` | `info` | 記錄詳細程度：fatal、error、warn、info、debug、trace |
| `CONCURRENT_JOBS` | `0`（自動） | 最大並行 AI 處理作業數 |
| `SESSION_DURATION_HOURS` | `168` | 登入工作階段存留期（7 天） |
| `CORS_ORIGIN` | （空白） | 以逗號分隔的允許來源，或留空表示同源 |

### 出站代理程式和私人 CA {#outbound-proxy-and-private-ca}

官方容器啟用了 Node 的環境代理支援。 如果 SnapOtter 必須透過企業代理程式到達 OCR 執行階段儲存庫或其他 HTTPS 服務，請設定 `HTTPS_PROXY`（並在需要時設定 `HTTP_PROXY`）。 將 `NO_PROXY` 設定為必須直接存取的以逗號分隔的主機列表，例如 Postgres、Redis 和內部物件儲存。

如果代理程式或內部服務由私有憑證授權單位簽署，請將 CA 憑證掛載為唯讀並將 `NODE_EXTRA_CA_CERTS` 指向它。 Node進程啟動時該檔案必須存在：

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

將代理憑證保留在 Compose 檔案外部（例如，在受保護的 `.env` 檔案或機密中）。不要停用 TLS 驗證：簽署的 OCR 索引對發布元資料進行身份驗證，而正常的 TLS 驗證仍然保護傳輸和所有其他出站請求。

## 健康檢查 {#health-check}

容器內建健康檢查：

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## 反向代理 {#reverse-proxy}

SnapOtter 預設會設定 `TRUST_PROXY=true`，使速率限制與記錄使用來自 `X-Forwarded-For` 標頭的真實用戶端 IP。

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

1. 新增一個 Proxy Host
2. 將 Domain Name 設為你的網域
3. 將 Scheme 設為 `http`，Forward Hostname 設為 `SnapOtter`（或你的容器 IP），Forward Port 設為 `1349`
4. 啟用 WebSocket 支援
5. 在 Advanced 底下，加入：`client_max_body_size 500M;` 和 `proxy_buffering off;`

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

`flush_interval -1` 會停用回應緩衝，這是 SSE 進度事件（批次處理、AI 工具、功能安裝）所必需的。延長的逾時允許大型檔案上傳在 Caddy 提早關閉連線之前完成。

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

注意：Cloudflare 在免費方案上有 100 MB 的上傳限制。請將 `MAX_UPLOAD_SIZE_MB=100` 設為相符。

## CI/CD {#ci-cd}

GitHub 儲存庫有三個工作流程：

- **ci.yml** — 在每次推送與 PR 時自動執行。進行 lint、型別檢查、測試、建置，並驗證 Docker 映像檔（不推送）。
- **release.yml** — 透過 `workflow_dispatch` 手動觸發。執行 semantic-release 以建立版本標籤與 GitHub 發行，然後建置多架構 Docker 映像檔（amd64 + arm64）並推送到 Docker Hub（`snapotter/snapotter`）和 GitHub Container Registry（`ghcr.io/snapotter-hq/snapotter`）。
- **deploy-docs.yml** — 建置這個文件網站，並在推送到 `main` 時部署到 Cloudflare Pages。

若要建立發行，請在 GitHub UI 中前往 **Actions > Release > Run workflow**，或執行：

```bash
gh workflow run release.yml
```

Semantic-release 會依提交歷史決定版本。`latest` Docker 標籤永遠指向最近一次的發行。

## 分析 {#analytics}

SnapOtter 包含匿名的產品分析（工具使用模式、錯誤回報），以協助抓出錯誤並改善功能。它預設為開啟。你的檔案、檔案名稱與個人資料絕不屬於這些資料的一部分。停用分析後，SnapOtter 仍正常運作。

### 停用分析 {#disabling-analytics}

執行期間的退出是一鍵式的管理員切換。開啟 Settings > System > Privacy，關閉 Anonymous Product Analytics。它會立即對整個執行個體停止，無需重新建置。

若要取得一個絕不會發出分析的映像檔，請透過複製儲存庫並重新建置來設定建置時的硬性關閉：

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

或將建置引數加入你現有的 `docker-compose.yml`：

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
