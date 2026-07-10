---
description: "SnapOtter Docker 镜像标签、GPU 基准测试、版本锁定，以及对 AMD64 和 ARM64 的多平台支持。"
i18n_source_hash: 148b3608e11a
i18n_provenance: human
i18n_output_hash: 444ed01d924d
---

# Docker 镜像 {#docker-image}

SnapOtter 以单个 Docker 镜像发布。单独运行它时，会在回环接口上启动内嵌的 PostgreSQL 17 和 Redis（内嵌模式）；用于生产环境时，请通过 Compose 让它与独立的 PostgreSQL 17 和 Redis 8 容器一起运行。该应用镜像可在所有平台上运行。

## 快速开始 {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

未设置 `DATABASE_URL` 时，它会以内嵌模式运行：PostgreSQL 和 Redis 在容器内部的回环接口上启动，所有数据都保存在 `SnapOtter-data` 卷下。设置 `DATABASE_URL` 和 `REDIS_URL`（就像 [Compose](#docker-compose) 栈那样）即可改用外部服务。请参阅[配置](/zh-CN/guide/configuration#embedded-mode)。

## NVIDIA CUDA 加速 {#nvidia-cuda-acceleration}

该镜像在 amd64 上包含 NVIDIA CUDA 支持。如果你有一块 NVIDIA GPU 并已安装 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)，请添加 `--gpus all`：

```bash
docker run -d --name SnapOtter --gpus all -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

该镜像会在运行时自动检测 CUDA。没有 `--gpus all` 或 CUDA 不可用时，AI 工具会在 CPU 上运行。两种情况使用同一个镜像。

目前不支持通过 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 核显加速 SnapOtter 的 AI 推理。将 `/dev/dri` 映射到容器中可以暴露渲染设备，但除非 CUDA 可用，否则 AI 运行时仍会使用 CPU。

### 基准测试 {#benchmarks}

在一块 NVIDIA RTX 4070（12 GB 显存）上，使用一张 572x1024 的 JPEG 人像进行了测试。

#### 热态性能 {#warm-performance}

| 工具 | CPU | GPU | 加速比 |
|------|-----|-----|---------|
| 背景去除（u2net） | 2,415ms | 879ms | 2.7x |
| 背景去除（isnet） | 2,457ms | 1,137ms | 2.2x |
| 放大 2x | 350ms | 309ms | 1.1x |
| 放大 4x | 910ms | 310ms | 2.9x |
| OCR（PaddleOCR） | 137ms | 94ms | 1.5x |
| 人脸模糊 | 139ms | 122ms | 1.1x |

#### 冷启动（容器启动后的首次请求） {#cold-start-first-request-after-container-start}

| 工具 | CPU | GPU | 加速比 |
|------|-----|-----|---------|
| 背景去除 | 22,286ms | 4,792ms | 4.7x |
| 放大 2x | 3,957ms | 2,318ms | 1.7x |
| OCR（PaddleOCR） | 1,469ms | 1,090ms | 1.3x |

### CUDA 健康检查 {#cuda-health-check}

在首次 AI 请求之后，管理员健康端点会报告 CUDA GPU 状态：

```
GET /api/v1/admin/health
{"ai": {"gpu": true}}
```

## Docker Compose {#docker-compose}

完整的 Compose 栈包括应用、PostgreSQL 17 和 Redis 8。完整的 `docker-compose.yml` 请参阅[部署](/zh-CN/guide/deployment)。一个最小示例：

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

若要通过 Docker Compose 使用 NVIDIA CUDA 加速，请在 SnapOtter 服务中添加 deploy 部分：

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

## 版本锁定 {#version-pinning}

| 标签 | 说明 |
|-----|------------|
| `latest` | 最新发布版 |
| `1.11.0` | 精确版本 |
| `1.11` | 1.11.x 中的最新补丁版 |
| `1` | 1.x 中的最新次版本 |

## 平台 {#platforms}

| 架构 | GPU 支持 | 备注 |
|---|---|---|
| linux/amd64 | NVIDIA CUDA | AI 工具的完整 CUDA 加速 |
| linux/arm64 | 仅 CPU | Raspberry Pi 4/5、通过 Docker Desktop 运行的 Apple Silicon |

## 从旧标签迁移 {#migration-from-previous-tags}

如果你之前使用的是 `:cuda` 标签，请切换到 `:latest` 并保留 `--gpus all`。GPU 支持相同，镜像已统一。

你的数据和设置会保留在卷中。
