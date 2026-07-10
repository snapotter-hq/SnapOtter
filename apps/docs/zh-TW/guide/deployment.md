---
description: "使用 Docker 將 SnapOtter 部署到生產環境。硬體需求、GPU 設定，以及 Nginx、Traefik 和 Cloudflare 的反向代理設定。"
i18n_source_hash: ecc1b528bc4b
i18n_provenance: human
i18n_output_hash: 489ff82023c9
---

# 部署 {#deployment}

SnapOtter 以一個 3 容器的 Docker Compose 堆疊部署：SnapOtter 應用程式映像檔、PostgreSQL 17 和 Redis 8。應用程式映像檔支援 **linux/amd64**（搭配 NVIDIA CUDA 進行 AI 加速）與 **linux/arm64**（CPU），因此它可以原生執行於 Intel/AMD 伺服器、Apple Silicon Mac，以及像 Raspberry Pi 4/5 這類 ARM 裝置上。目前不支援透過 VA-API、Quick Sync 或 OpenCL 的 Intel/AMD iGPU 加速來進行 AI 推論。

GPU 設定、Docker Compose 範例與版本鎖定，請見 [Docker 映像檔](./docker-tags)。

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

接著即可在 `http://localhost:1349` 存取應用程式。

> **遇到 Docker Hub 速率限制？**把 `snapotter/snapotter:latest` 換成 `ghcr.io/snapotter-hq/snapotter:latest`，改從 GitHub Container Registry 拉取。兩個登錄庫在每次發布時都會收到相同的映像檔。

## 快速開始（NVIDIA CUDA） {#quick-start-nvidia-cuda}

若要在 AI 工具（去背、放大、臉部增強、OCR）上使用 NVIDIA CUDA 加速：

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

在記錄中檢查 CUDA 偵測結果：

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## 硬體需求 {#hardware-requirements}

這些數字來自跨多種系統的基準測試，從搭載 NVIDIA RTX 4070 的現代 amd64 工作站，一路到 Raspberry Pi，在每一台上執行整套工具目錄，並掃過 Docker 資源限制，以找出真正的下限。

### 快速參考 {#quick-reference}

| 等級 | 使用情境 | CPU | RAM | GPU | 儲存空間 |
|------|----------|-----|-----|-----|---------|
| 最低 | 影像、檔案與輕量 PDF 工具；單一使用者；小型批次 | 2 核心 | 2 GB | 無 | ~7 GB |
| 建議 | 全部五種模態，含影片、PDF 以及在 CPU 上執行的 AI；批次；少數使用者 | 4 核心 | 4 GB | 無 | ~25 GB |
| 完整 | 一切都要有速度，含 GPU AI；大型批次；多位使用者 | 6-8 核心 | 8 GB | NVIDIA 8 GB+ VRAM（12 GB 較充裕） | ~35 GB |

**架構：僅限 64 位元**（`linux/amd64` 或 `linux/arm64`）。SnapOtter 可原生執行於 Intel/AMD 伺服器、Apple Silicon Mac，以及包含 **Raspberry Pi 4 與 5**（4-8 GB）在內的 64 位元 ARM 開發板上。它**不**能在 32 位元 ARM（`armv7`／`armhf`）上執行（沒有為它建置任何映像檔），也不能在 Pi Zero 這類 512 MB 等級的開發板上執行，因為它們低於記憶體下限（見下文）。

### 最低（影像、檔案與輕量 PDF 工具；無 AI） {#minimum-image-files-and-light-pdf-tools-no-ai}

| 資源 | 需求 |
|---|---|
| CPU | 2 核心 |
| RAM | 2 GB |
| 磁碟 | ~5.5 GB（映像檔）+ 資料磁碟區 |
| GPU | 不需要 |

全部 222 個非 AI 目錄工具 - 影像（調整大小、裁切、轉換、壓縮、調整、浮水印）、影片（裁剪、靜音、重新封裝）、音訊（轉換、正規化、裁剪）、PDF（合併、分割、壓縮、旋轉、保護）、檔案轉換，以及專用的轉換預設 - 都能在普通的硬體上執行。即使是大型檔案，大多數操作也能在遠低於一秒內完成：一張 2.7 MB 的影像可在約 0.05 秒內調整大小，並在約 2 秒內重新編碼為 WebP。

記憶體下限確有其事，這來自一次 Docker 資源限制掃描：**512 MB 無法啟動堆疊**（連單一影像調整大小都會被終止），**1 GB** 可處理單一檔案的操作，但多檔批次會耗盡記憶體，而 **2 GB／2 核心**是能從容處理批次的最小設定。

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**唯一在 CPU 上吃重的例外是影片重新編碼。**串流複製操作（裁剪、靜音、容器重新封裝）是即時的，但轉碼到不同的編解碼器則受限於 CPU。一段 1080p／45 秒的影片重新編碼為 VP9（WebM），在一顆快速的現代 CPU 上大約需要 **~40 秒**，在 Apple Silicon 上約 45 秒，在較舊的行動 4 核心上約 80 秒，在較舊的 4 核心伺服器上則約 **~130 秒**。如果你的工作負載偏重影片，請優先考量 CPU 核心數與時脈，或提高容器的 `cpus:` 限制 - 隨附的 compose 預設把應用程式上限設在 4 核心（GPU compose 為 8 核心）。

### 建議（在 CPU 上執行 AI 工具） {#recommended-ai-tools-on-cpu}

| 資源 | 需求 |
|---|---|
| CPU | 4 核心 |
| RAM | 4 GB |
| 磁碟 | 3 GB（映像檔）+ 24 GB（AI 模型）+ 工作空間 |
| GPU | 不需要（CPU 後備） |

**把 RAM 推高到 4 GB 的正是安裝 AI 套件包這件事。**在未安裝任何 AI 的情況下，應用程式閒置時約占用 360 MB；安裝全部七個套件包後，會維持約 2.6 GB 常駐，因為 Python AI 附屬程序會在啟動時預先載入其模型（去背、放大、OCR、轉錄、臉部偵測、修復）。非 AI 安裝維持輕量；AI 安裝需要 ≥4 GB。

大多數 AI 工具在 CPU 上完全可用；有一兩個真的想要 GPU。在一顆現代 4 核心 CPU 上量測：

| AI 工具 | CPU 時間 | 在 CPU 上可用嗎？ |
|---|---|---|
| 臉部偵測（模糊臉部、智慧裁切、紅眼）、去噪 | 不到 1 秒 | 可以 |
| OCR、轉錄、字幕 | 1-3 秒 | 可以 |
| 上色、臉部增強 | ~10 秒 | 可以 |
| 去背／替換背景／背景模糊 | ~29 秒 | 可以（你得等一下） |
| AI 放大（RealESRGAN） | 小圖 ~33 秒；大圖需數分鐘 | 勉強 - 強烈建議使用 GPU |
| 相片修復（完整管線） | 數分鐘 | 不行 - 需要 GPU 或快速的多核心 CPU |

AI 模型下載大小：

| 套件包 | 磁碟大小 |
|---|---|
| 去背 | 4-5 GB |
| 放大 + 臉部增強 + 去噪 | 5-6 GB |
| 臉部偵測 | 200-300 MB |
| 物件橡皮擦 + 上色 | 1-2 GB |
| OCR | 5-6 GB |
| 相片修復 | 4-5 GB |
| **全部套件包** | **~24 GB** |

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### 完整（在 NVIDIA CUDA 上執行 AI 工具） {#full-ai-tools-on-nvidia-cuda}

| 資源 | 需求 |
|---|---|
| CPU | 6-8 核心（即使使用 GPU AI，影片前處理 + 並行仍在 CPU 上執行） |
| RAM | 8 GB |
| GPU | 具備 8+ GB VRAM 的 NVIDIA（建議 12 GB） |
| 磁碟 | 總計 ~35 GB |

NVIDIA GPU（CUDA）能大幅加速吃重的 AI 模型。在 RTX 4070 對比一顆現代 CPU 上量測：

| AI 工具 | 使用 GPU 的加速比 | 說明 |
|---|---|---|
| AI 放大（RealESRGAN 2×） | **~47×** | 最大的勝利 - 不到一秒 vs ~33 秒（大圖需數分鐘） |
| 臉部增強（CodeFormer） | **~12×** | ~0.9 秒 vs ~11 秒 |
| 轉錄（Whisper） | ~4.5× | |
| 去背／替換背景／背景模糊 | ~4× | GPU 上 ~7 秒 vs CPU 上 ~29 秒 |
| 上色 | ~1.8× | |
| OCR、臉部偵測、紅眼、去噪 | ~1× | 在 CPU 上已經很快 - GPU 沒有幫助 |
| 相片修復 | 無 | 即使在 GPU 上也受限於 CPU（GPU 使用率為 0%）；此處快速的 CPU 比 GPU 更重要 |

值得配 GPU 的工具是 **放大、臉部增強、轉錄與去背**。臉部偵測、OCR 與紅眼受限於 CPU 且本就很快，所以 GPU 沒有任何加成。

在放大加臉部增強期間，VRAM 尖峰使用量達到 7.5 GB。一張 6 GB 的 NVIDIA GPU 對大多數 AI 工具個別使用時可行，但在放大時會失敗。8-12 GB VRAM 能應付一切。

目前不支援透過 VA-API、Quick Sync 或 OpenCL 的 Intel/AMD iGPU 加速來進行 AI 推論。把 `/dev/dri` 對映進容器並不會啟用 AI GPU 加速；除非有 NVIDIA CUDA 可用，否則 SnapOtter 會在 CPU 上執行 AI 工具。

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

針對預設上限為 4 核心的應用程式容器，平行送出影像調整大小請求：

| 並行請求數 | 平均回應時間 | 錯誤 |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

隨著工作者池飽和，回應時間呈次線性劣化且無錯誤。提高應用程式容器的 `cpus:` 限制（或使用核心更多的主機）可拉高上限。請注意，吃重的工作（影片轉碼、CPU AI）會在整個執行期間占住一個工作者，所以請依你預期的並行吃重工作數量來決定 CPU 大小，而非只看請求數。

### 支援的影像格式 {#supported-image-formats}

SnapOtter 支援 **55+ 種輸入格式**與 **14 種輸出格式**，包含來自 20+ 個相機品牌的 RAW 檔案、專業格式（PSD、EPS、OpenEXR、HDR）、現代編解碼器（JPEG XL、AVIF、HEIC、QOI），以及科學／遊戲格式（FITS、DDS）。

關於每一種支援格式、所用的解碼器，以及可用的品質控制的詳細資訊，請見[完整格式清單](/zh-TW/guide/supported-formats)。

### 已知限制 {#known-limitations}

- **內容感知調整大小**在大型影像（>5 MP）上會因為 caire 二進位檔的一項限制而當機。對較小的影像運作正常。
- **HEIF 解碼**需要 13-23 秒。HEIC（Apple 的變體）快得多，為 0.3-0.9 秒。
- **OCR 日文**因為 PaddlePaddle 的 MKLDNN 錯誤而在 CPU 上失敗。在 GPU 上可運作。
- **放大**在 CPU 上對小圖以外的任何影像都會逾時。實務上需要 GPU 才能使用。
- **CodeFormer** 臉部增強明顯比 GFPGAN 慢（GPU 上 53 秒 vs 2 秒）。大多數使用情境建議使用 GFPGAN。

## 磁碟區 {#volumes}

| 掛載／磁碟區 | 用途 | 是否必要？ |
|---|---|---|
| `/data`（app） | AI 模型、Python venv、使用者檔案 | **是** - 缺少它會遺失檔案 |
| `/tmp/workspace`（app） | 暫時處理檔案（自動清理） | 建議 |
| `SnapOtter-pgdata`（postgres） | PostgreSQL 資料目錄（使用者、設定、管線、工作） | **是** - 缺少它會遺失資料 |
| `SnapOtter-redisdata`（redis） | 供持久化工作佇列使用的 Redis 附加寫入檔（AOF） | 建議 |

### 繫結掛載 vs. 具名磁碟區 {#bind-mounts-vs-named-volumes}

**具名磁碟區**（建議） - Docker 自動管理權限：
```yaml
volumes:
  - SnapOtter-data:/data
```

**繫結掛載** - 由你管理權限。設定 `PUID`／`PGID` 以符合你的主機使用者：
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### 儲存權限 {#storage-permissions}

SnapOtter 在執行期會寫入兩個位置：`/data`（使用者檔案、記錄、AI 模型與 Python venv）以及 `/tmp/workspace`（暫時處理的暫存空間）。兩者都必須可由容器執行身分的使用者寫入。若其中任一者不可寫，容器會在**啟動時快速失敗**，並附上一則指明該目錄、執行中的 UID/GID，以及如何修正的訊息 - 而不是啟動為「健康」，然後在第一次上傳時以一則難解的錯誤失敗。

權限的處理方式取決於容器的啟動方式：

**預設（以 root 啟動，降權到 `snapotter`）** - 進入點以 root 啟動，修正已掛載磁碟區的擁有權，然後透過 `gosu` 降權為無特權的 `snapotter` 使用者。具名磁碟區無需設定即可運作。對於繫結掛載，請把 `PUID`／`PGID` 設為你的主機使用者（如上），這樣它寫入的檔案便由你擁有。

**Kubernetes／OpenShift（透過 `runAsUser` 以非 root 執行）** - 由於直接以非 root 使用者啟動，容器無法自行 chown 這些磁碟區，所以協調器必須讓它們可寫。設定 `fsGroup`：

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

映像檔的可寫目錄由 GID 0 群組擁有且群組可寫，因此一個以**任意 UID** 加上 root 補充群組（OpenShift 的預設）執行的 pod，無需 `chown` 即可寫入。

**TrueNAS Scale（以及其他「外來 UID」設定）** - TrueNAS 以非 root 使用者（通常是 `568:568`）執行應用程式，並掛載由不同使用者擁有的主機資料集，所以進入點與 `fsGroup` 都無法靠自己讓它們可寫。請擇一：

- **以 root 執行應用程式**（建議） - 讓應用程式的使用者保持未設定，或設為 `0`，並讓預設進入點修正權限並降權到 `snapotter`。
- **以 UID `999` 執行** - 把應用程式的使用者／群組設為 `999:999`（SnapOtter 內建的 `snapotter` 使用者），使其符合映像檔的擁有權。
- 從 TrueNAS shell **`chown`** 主機資料集到容器執行身分的 UID：

  ```bash
  # 使用啟動錯誤中的 UID（或在容器內執行 `id`）
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

啟動錯誤會指明要使用的確切 UID，所以最快的路徑是先啟動一次應用程式、讀取訊息，然後據此 `chown`（或調整使用者）。

## 環境變數 {#environment-variables}

| 變數 | 預設 | 描述 |
|---|---|---|
| `AUTH_ENABLED` | `true` | 啟用／停用登入要求 |
| `DEFAULT_USERNAME` | `admin` | 初始管理員使用者名稱 |
| `DEFAULT_PASSWORD` | `admin` | 初始管理員密碼（首次登入時強制變更） |
| `MAX_UPLOAD_SIZE_MB` | `100` | 每個檔案的上傳限制 |
| `MAX_BATCH_SIZE` | `100` | 每個批次請求的最大檔案數 |
| `RATE_LIMIT_PER_MIN` | `1000` | 每個 IP 每分鐘的 API 請求數（設為 0 以停用） |
| `MAX_USERS` | `0`（無限制） | 使用者帳號數上限 |
| `TRUST_PROXY` | `true` | 信任來自反向代理的 X-Forwarded-For 標頭 |
| `PUID` | `999` | 以此 UID 執行（供繫結掛載權限使用） |
| `PGID` | `999` | 以此 GID 執行（供繫結掛載權限使用） |
| `LOG_LEVEL` | `info` | 記錄詳細程度：fatal、error、warn、info、debug、trace |
| `CONCURRENT_JOBS` | `0`（自動） | 最大並行 AI 處理工作數 |
| `SESSION_DURATION_HOURS` | `168` | 登入工作階段存留時間（7 天） |
| `CORS_ORIGIN` | （空） | 以逗號分隔的允許來源，或留空表示同源 |

## 健康檢查 {#health-check}

容器內建一項健康檢查：

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## 反向代理 {#reverse-proxy}

SnapOtter 預設會設定 `TRUST_PROXY=true`，好讓速率限制與記錄使用來自 `X-Forwarded-For` 標頭的真實用戶端 IP。

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
2. 把 Domain Name 設為你的網域
3. 把 Scheme 設為 `http`、Forward Hostname 設為 `SnapOtter`（或你的容器 IP）、Forward Port 設為 `1349`
4. 啟用 WebSocket 支援
5. 在 Advanced 底下，新增：`client_max_body_size 500M;` 與 `proxy_buffering off;`

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

`flush_interval -1` 會停用回應緩衝，這是 SSE 進度事件（批次處理、AI 工具、功能安裝）所必需的。延長的逾時讓大型檔案上傳得以完成，而不會被 Caddy 提早關閉連線。

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

注意：Cloudflare 在免費方案上有 100 MB 的上傳限制。請把 `MAX_UPLOAD_SIZE_MB=100` 設定為相符。

## CI/CD {#ci-cd}

GitHub 儲存庫有三個工作流程：

- **ci.yml** - 在每次推送與 PR 時自動執行。進行 lint、typecheck、測試、建置，並驗證 Docker 映像檔（不推送）。
- **release.yml** - 透過 `workflow_dispatch` 手動觸發。執行 semantic-release 以建立版本標籤與 GitHub release，接著建置多架構 Docker 映像檔（amd64 + arm64），並推送到 Docker Hub（`snapotter/snapotter`）與 GitHub Container Registry（`ghcr.io/snapotter-hq/snapotter`）。
- **deploy-docs.yml** - 建置這份文件網站，並在推送到 `main` 時把它部署到 Cloudflare Pages。

若要建立一個 release，請在 GitHub UI 中前往 **Actions > Release > Run workflow**，或執行：

```bash
gh workflow run release.yml
```

Semantic-release 會依提交歷史決定版本。`latest` 這個 Docker 標籤永遠指向最近一次的 release。

## 分析 {#analytics}

SnapOtter 內含匿名的產品分析（工具使用模式、錯誤報告），以協助捕捉錯誤並改進功能。它預設為開啟。你的檔案、檔名與個人資料絕不會是其中的一部分。SnapOtter 在停用分析的情況下也能正常運作。

### 停用分析 {#disabling-analytics}

執行期的退出是一個一鍵式的管理員切換。開啟 Settings > System > Privacy，並關閉 Anonymous Product Analytics。它會為整個實例立即停止，無需重新建置。

若想要一個永遠不會發送分析的映像檔，請透過複製儲存庫並重新建置，設定建置期的硬關閉：

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

或把這個建置參數加到你既有的 `docker-compose.yml` 中：

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
