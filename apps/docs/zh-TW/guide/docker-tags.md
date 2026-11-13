---
description: "SnapOtter Docker 映像檔標籤、GPU 效能基準、版本固定，以及 AMD64 與 ARM64 的多平台支援。"
i18n_source_hash: a5871d76250c
i18n_provenance: machine
i18n_output_hash: 5d420a6e6a67
i18n_hash_version: 2
---

# Docker 映像檔標籤 {#docker-image}

SnapOtter 以單一 Docker 映像檔發行。單獨執行時，它會在 loopback 介面上啟動內嵌的 PostgreSQL 17 與 Redis（內嵌模式）；正式環境則請搭配 Compose，與獨立的 PostgreSQL 17 和 Redis 8 容器一起執行。此應用程式映像檔適用於所有平台。

## 快速開始 {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

未設定 `DATABASE_URL` 時，會以內嵌模式執行：PostgreSQL 與 Redis 在容器內的 loopback 上啟動，所有資料都放在 `SnapOtter-data` 磁碟區下。設定 `DATABASE_URL` 與 `REDIS_URL`（如 [Compose](#docker-compose) 堆疊的做法）即可改用外部服務。請參閱[設定](/zh-TW/guide/configuration#embedded-mode)。

## NVIDIA CUDA 加速 {#nvidia-cuda-acceleration}

此映像檔在 amd64 上內建 NVIDIA CUDA 支援。如果您有 NVIDIA GPU，且已安裝 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)，請加上 `--gpus all`：

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

映像檔會在執行階段自動偵測 CUDA。未加上 `--gpus all`，或 CUDA 無法使用時，AI 工具會在 CPU 上執行。兩種情況使用的是同一個映像檔。

目前 SnapOtter 的 AI 推論不支援透過 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 內顯加速。將 `/dev/dri` 對應到容器中可以讓 render 裝置可見，但除非有 CUDA，AI 執行階段仍會使用 CPU。

### 效能基準 {#benchmarks}

在 NVIDIA RTX 4070（12 GB VRAM）上，使用 572x1024 的 JPEG 人像照片測試。

#### 暖機後效能 {#warm-performance}

| 工具 | CPU | GPU | 加速倍率 |
|------|-----|-----|---------|
| 去背（u2net） | 2,415ms | 879ms | 2.7x |
| 去背（isnet） | 2,457ms | 1,137ms | 2.2x |
| 2 倍放大 | 350ms | 309ms | 1.1x |
| 4 倍放大 | 910ms | 310ms | 2.9x |
| 臉部模糊 | 139ms | 122ms | 1.1x |

#### 冷啟動（容器啟動後的第一次請求） {#cold-start-first-request-after-container-start}

| 工具 | CPU | GPU | 加速倍率 |
|------|-----|-----|---------|
| 去背 | 22,286ms | 4,792ms | 4.7x |
| 2 倍放大 | 3,957ms | 2,318ms | 1.7x |

OCR 不包含在 CUDA 比較中。內建的 Tesseract 層級與選用的 RapidOCR/ONNX 層級都使用 CPU，即使容器可以存取 NVIDIA GPU 也一樣。

### CUDA 健康檢查 {#cuda-health-check}

第一次 AI 請求之後，管理員健康檢查端點會回報 CUDA GPU 狀態：

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

完整的 Compose 堆疊包含應用程式、PostgreSQL 17 與 Redis 8。完整的 `docker-compose.yml` 請參閱[部署](/zh-TW/guide/deployment)。最精簡的範例如下：

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
      # Runtime role (rows only), then the boot-only owner connection.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    environment:
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

若要透過 Docker Compose 啟用 NVIDIA CUDA 加速，請在 SnapOtter 服務中加入 deploy 區段：

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## 版本固定 {#version-pinning}

| 標籤 | 說明 |
|-----|------------|
| `latest` | 最新發行版本 |
| `2.2.0` | 精確版本 |
| `2.2` | 2.2.x 中最新的修補版本 |
| `2` | 2.x 中最新的次要版本 |

## 平台 {#platforms}

| 架構 | GPU 支援 | 備註 |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | AI 工具可完整使用 CUDA 加速 |
| linux/arm64 | 僅 CPU | Raspberry Pi 4/5、透過 Docker Desktop 的 Apple Silicon |

## 從舊標籤遷移 {#migration-from-previous-tags}

如果您之前使用 `:cuda` 標籤，請改用 `:latest` 並保留 `--gpus all`。GPU 支援相同，映像檔已整合為一。

您的資料與設定都保存在磁碟區中。
