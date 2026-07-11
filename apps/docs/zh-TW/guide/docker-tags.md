---
description: "SnapOtter Docker 映像標籤、GPU 效能基準、版本鎖定，以及 AMD64 與 ARM64 的多平台支援。"
i18n_source_hash: 148b3608e11a
i18n_provenance: human
i18n_output_hash: 8b69b4ed0e1b
---

# Docker 映像 {#docker-image}

SnapOtter 以單一 Docker 映像的形式發佈。單獨執行時，它會在 loopback 介面上啟動內嵌的 PostgreSQL 17 與 Redis（內嵌模式）；若用於正式環境，請透過 Compose 讓它與獨立的 PostgreSQL 17 和 Redis 8 容器一同執行。此應用映像可在所有平台上運作。

## 快速開始 {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

若未設定 `DATABASE_URL`，這會以內嵌模式執行：PostgreSQL 與 Redis 會在容器內的 loopback 上啟動，所有資料都存放在 `SnapOtter-data` 磁碟區下。設定 `DATABASE_URL` 與 `REDIS_URL`（就像 [Compose](#docker-compose) 堆疊那樣）即可改用外部服務。請參閱 [設定](/zh-TW/guide/configuration#embedded-mode)。

## NVIDIA CUDA 加速 {#nvidia-cuda-acceleration}

此映像在 amd64 上內含 NVIDIA CUDA 支援。如果你有 NVIDIA GPU 並已安裝 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)，請加上 `--gpus all`：

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

此映像會在執行階段自動偵測 CUDA。若沒有 `--gpus all`，或當 CUDA 無法使用時，AI 工具會在 CPU 上執行。兩種情況都是同一個映像。

目前 SnapOtter 的 AI 推論尚不支援透過 VA-API、Quick Sync 或 OpenCL 進行 Intel/AMD iGPU 加速。將 `/dev/dri` 對應進容器可以公開繪圖裝置，但除非 CUDA 可用，否則 AI 執行環境仍會使用 CPU。

### 效能基準 {#benchmarks}

在 NVIDIA RTX 4070（12 GB VRAM）上使用一張 572x1024 的 JPEG 人像測試。

#### 暖啟動效能 {#warm-performance}

| 工具 | CPU | GPU | 加速倍率 |
|------|-----|-----|---------|
| 背景移除（u2net） | 2,415ms | 879ms | 2.7x |
| 背景移除（isnet） | 2,457ms | 1,137ms | 2.2x |
| 放大 2x | 350ms | 309ms | 1.1x |
| 放大 4x | 910ms | 310ms | 2.9x |
| OCR（PaddleOCR） | 137ms | 94ms | 1.5x |
| 臉部模糊 | 139ms | 122ms | 1.1x |

#### 冷啟動（容器啟動後的第一次請求） {#cold-start-first-request-after-container-start}

| 工具 | CPU | GPU | 加速倍率 |
|------|-----|-----|---------|
| 背景移除 | 22,286ms | 4,792ms | 4.7x |
| 放大 2x | 3,957ms | 2,318ms | 1.7x |
| OCR（PaddleOCR） | 1,469ms | 1,090ms | 1.3x |

### CUDA 健康檢查 {#cuda-health-check}

在第一次 AI 請求之後，管理員健康檢查端點會回報 CUDA GPU 狀態：

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

完整的 Compose 堆疊包含應用程式、PostgreSQL 17 與 Redis 8。完整的 `docker-compose.yml` 請參閱 [部署](/zh-TW/guide/deployment)。一個最精簡的範例：

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
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

若要透過 Docker Compose 進行 NVIDIA CUDA 加速，請將 deploy 區段加入 SnapOtter 服務：

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## 版本鎖定 {#version-pinning}

| 標籤 | 說明 |
|-----|------------|
| `latest` | 最新版本 |
| `1.11.0` | 明確版本 |
| `1.11` | 1.11.x 中的最新修補版 |
| `1` | 1.x 中的最新次要版 |

## 平台 {#platforms}

| 架構 | GPU 支援 | 備註 |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | AI 工具的完整 CUDA 加速 |
| linux/arm64 | 僅 CPU | Raspberry Pi 4/5、透過 Docker Desktop 的 Apple Silicon |

## 從舊標籤遷移 {#migration-from-previous-tags}

如果你之前使用 `:cuda` 標籤，請改用 `:latest` 並保留 `--gpus all`。相同的 GPU 支援，統一的映像。

你的資料與設定會保留在磁碟區中。
