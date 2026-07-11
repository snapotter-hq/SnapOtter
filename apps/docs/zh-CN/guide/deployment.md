---
description: "使用 Docker 将 SnapOtter 部署到生产环境。涵盖硬件要求、GPU 配置，以及 Nginx、Traefik 和 Cloudflare 的反向代理配置。"
i18n_source_hash: 6b6957060fa6
i18n_provenance: machine
i18n_output_hash: 11dd631a0383
---

# 部署 {#deployment}

SnapOtter 以 3 容器 Docker Compose 栈的形式部署：SnapOtter 应用镜像、PostgreSQL 17 和 Redis 8。应用镜像支持 **linux/amd64**（配合 NVIDIA CUDA 实现 AI 加速）和 **linux/arm64**（CPU），因此可以在 Intel/AMD 服务器、Apple Silicon Mac，以及 Raspberry Pi 4/5 等 ARM 设备上原生运行。目前不支持通过 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 核显加速 AI 推理。

关于 GPU 配置、Docker Compose 示例和版本锁定，请参阅 [Docker 镜像](./docker-tags)。

## 快速开始（CPU） {#quick-start-cpu}

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

随后即可在 `http://localhost:1349` 访问应用。

> **遇到 Docker Hub 速率限制？** 将 `snapotter/snapotter:latest` 替换为 `ghcr.io/snapotter-hq/snapotter:latest`，改从 GitHub Container Registry 拉取。两个镜像仓库在每次发布时都会收到相同的镜像。

## 快速开始（NVIDIA CUDA） {#quick-start-nvidia-cuda}

如需在 AI 工具（背景移除、放大、人脸增强、OCR）上启用 NVIDIA CUDA 加速：

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

在日志中检查 CUDA 是否被检测到：

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## 硬件要求 {#hardware-requirements}

这些数字来自一系列系统上的基准测试，从配备 NVIDIA RTX 4070 的现代 amd64 工作站到 Raspberry Pi，在每台设备上运行整个工具目录，并扫描 Docker 资源限制以找出真实的下限。

### 快速参考 {#quick-reference}

| 层级 | 使用场景 | CPU | 内存 | GPU | 存储 |
|------|----------|-----|-----|-----|---------|
| 最低 | 图像、文件和轻量 PDF 工具；单用户；小批量 | 2 核 | 2 GB | 无 | ~7 GB |
| 推荐 | 全部五种模态，含视频、PDF 和 CPU 上的 AI；批量处理；少量用户 | 4 核 | 4 GB | 无 | ~25 GB |
| 完整 | 高速运行所有功能，含 GPU AI；大批量；多用户 | 6-8 核 | 8 GB | NVIDIA 8 GB+ 显存（12 GB 更宽裕） | ~35 GB |

**架构：仅支持 64 位**（`linux/amd64` 或 `linux/arm64`）。SnapOtter 可在 Intel/AMD 服务器、Apple Silicon Mac，以及包括 **Raspberry Pi 4 和 5**（4-8 GB）在内的 64 位 ARM 板卡上原生运行。它**不能**在 32 位 ARM（`armv7`/`armhf`）上运行（没有为其构建镜像），也不能在 Pi Zero 等 512 MB 级别的板卡上运行，这些设备低于内存下限（见下文）。

### 最低（图像、文件和轻量 PDF 工具；无 AI） {#minimum-image-files-and-light-pdf-tools-no-ai}

| 资源 | 要求 |
|---|---|
| CPU | 2 核 |
| 内存 | 2 GB |
| 磁盘 | ~5.5 GB（镜像）+ 数据卷 |
| GPU | 不需要 |

全部 222 个非 AI 目录工具 - 图像（缩放、裁剪、转换、压缩、调整、水印）、视频（剪辑、静音、重封装）、音频（转换、归一化、剪辑）、PDF（合并、拆分、压缩、旋转、加密）、文件转换以及专用转换预设 - 都能在普通硬件上运行。即使是大文件，大多数操作也能在远低于一秒的时间内完成：一张 2.7 MB 的图像缩放耗时约 0.05 秒，重新编码为 WebP 约 2 秒。

内存下限是实实在在的，来自一次 Docker 资源限制扫描：**512 MB 无法启动整个栈**（即使单张图像缩放也会被终止），**1 GB** 可以处理单文件操作，但多文件批处理会耗尽内存，而 **2 GB / 2 核** 是能够从容处理批量任务的最小配置。

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**唯一的 CPU 密集型例外是视频重新编码。** 流复制操作（剪辑、静音、容器重封装）是瞬时的，但转码到不同的编解码器则受 CPU 限制。一段 1080p / 45 秒的片段重新编码为 VP9（WebM），在快速的现代 CPU 上大约需要 **~40 秒**，在 Apple Silicon 上约 45 秒，在较旧的移动端 4 核上约 80 秒，在较旧的 4 核服务器上则需 **~130 秒**。如果你的工作负载以视频为主，请优先考虑 CPU 核心数和主频，或提高容器的 `cpus:` 限制 - 出厂的 compose 默认将应用限制为 4 核（GPU compose 为 8 核）。

### 推荐（CPU 上的 AI 工具） {#recommended-ai-tools-on-cpu}

| 资源 | 要求 |
|---|---|
| CPU | 4 核 |
| 内存 | 4 GB |
| 磁盘 | 3 GB（镜像）+ 24 GB（AI 模型）+ 工作区 |
| GPU | 不需要（CPU 回退） |

**将内存推高到 4 GB 的正是安装 AI 包这一步。** 未安装任何 AI 时，应用空闲占用约 360 MB；安装全部七个包后，常驻内存维持在 ~2.6 GB，因为 Python AI 边车会在启动时预加载其模型（背景移除、放大、OCR、转录、人脸检测、修复）。非 AI 安装保持轻量；AI 安装需要 ≥4 GB。

大多数 AI 工具在 CPU 上完全可用；只有少数几个确实需要 GPU。在现代 4 核 CPU 上测得：

| AI 工具 | CPU 耗时 | 在 CPU 上可用？ |
|---|---|---|
| 人脸检测（模糊人脸、智能裁剪、红眼）、降噪 | 1 秒以内 | 是 |
| OCR、转录、字幕 | 1-3 秒 | 是 |
| 上色、人脸增强 | ~10 秒 | 是 |
| 背景移除 / 替换 / 模糊 | ~29 秒 | 是（需要等待） |
| AI 放大（RealESRGAN） | 小图 ~33 秒；大图数分钟 | 勉强 - 强烈建议使用 GPU |
| 照片修复（完整流程） | 数分钟 | 否 - 需要 GPU 或快速的多核 CPU |

SnapOtter 有意不将这些模型下载烘焙进 Docker 镜像。AI 包仅在管理员启用相关工具时才会拉取，存储在持久化的 `/data/ai` 卷中，并由依赖同一模型栈的每个工具共享。这样既能保持最终容器镜像小巧，又能让完整的 AI 安装达到下面更大的存储数字。

有些工具依赖不止一个共享包。例如，证件照同时需要 `background-removal` 和 `face-detection`；如果 `background-removal` 已安装，启用证件照就只会下载缺失的 `face-detection` 包。同样的复用规则适用于所有 AI 工具。

AI 模型下载大小：

| 包 | 磁盘大小 |
|---|---|
| 背景移除 | 4-5 GB |
| 放大 + 人脸增强 + 降噪 | 5-6 GB |
| 人脸检测 | 200-300 MB |
| 对象擦除 + 上色 | 1-2 GB |
| OCR | 5-6 GB |
| 照片修复 | 4-5 GB |
| **全部包** | **~24 GB** |

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### 完整（NVIDIA CUDA 上的 AI 工具） {#full-ai-tools-on-nvidia-cuda}

| 资源 | 要求 |
|---|---|
| CPU | 6-8 核（即使使用 GPU AI，视频预处理 + 并发也在 CPU 上运行） |
| 内存 | 8 GB |
| GPU | NVIDIA，8+ GB 显存（推荐 12 GB） |
| 磁盘 | 总计 ~35 GB |

NVIDIA GPU（CUDA）能大幅加速繁重的 AI 模型。在 RTX 4070 与现代 CPU 上对比测得：

| AI 工具 | GPU 加速比 | 备注 |
|---|---|---|
| AI 放大（RealESRGAN 2×） | **~47×** | 收益最大 - 不到一秒 vs ~33 秒（大图数分钟） |
| 人脸增强（CodeFormer） | **~12×** | ~0.9 秒 vs ~11 秒 |
| 转录（Whisper） | ~4.5× | |
| 背景移除 / 替换 / 模糊 | ~4× | GPU 上 ~7 秒 vs CPU 上 ~29 秒 |
| 上色 | ~1.8× | |
| OCR、人脸检测、红眼、降噪 | ~1× | 在 CPU 上已经很快 - GPU 无济于事 |
| 照片修复 | 无 | 即使在 GPU 上也受 CPU 限制（GPU 利用率 0%）；此处快速 CPU 比 GPU 更重要 |

值得配 GPU 的工具是 **放大、人脸增强、转录和背景移除**。人脸检测、OCR 和红眼受 CPU 限制且已经很快，因此 GPU 毫无帮助。

在放大配合人脸增强时，显存峰值占用达到 7.5 GB。6 GB 的 NVIDIA GPU 对大多数单独运行的 AI 工具都够用，但在放大上会失败。8-12 GB 显存可以应对一切。

目前不支持通过 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 核显加速 AI 推理。将 `/dev/dri` 映射进容器并不能启用 AI GPU 加速；除非有 NVIDIA CUDA 可用，否则 SnapOtter 会在 CPU 上运行 AI 工具。

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

### 并发用户 {#concurrent-users}

针对默认限制为 4 核的应用容器进行并行图像缩放请求：

| 并发请求数 | 平均响应时间 | 错误 |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

随着工作线程池饱和，响应时间以次线性方式劣化，且无错误。提高应用容器的 `cpus:` 限制（或使用核心更多的主机）可以抬高上限。请注意，繁重任务（视频转码、CPU AI）会在其整个时长内占用一个工作线程，因此请按你预期的并发繁重任务数来配置 CPU，而不仅仅是请求数。

### 支持的图像格式 {#supported-image-formats}

SnapOtter 支持 **55+ 种输入格式** 和 **14 种输出格式**，包括来自 20+ 相机品牌的 RAW 文件、专业格式（PSD、EPS、OpenEXR、HDR）、现代编解码器（JPEG XL、AVIF、HEIC、QOI）以及科学/游戏格式（FITS、DDS）。

关于每种受支持格式、所用解码器以及可用质量控制的详情，请参阅[完整格式列表](/zh-CN/guide/supported-formats)。

### 已知限制 {#known-limitations}

- **内容感知缩放** 在大图（>5 MP）上会崩溃，原因是 caire 二进制文件的一个限制。较小的图像可以正常工作。
- **HEIF 解码** 耗时 13-23 秒。HEIC（Apple 的变体）快得多，为 0.3-0.9 秒。
- **OCR 日语** 在 CPU 上失败，原因是 PaddlePaddle 的一个 MKLDNN 缺陷。在 GPU 上可以正常工作。
- **放大** 在 CPU 上处理小图以外的任何图像都会超时。实际使用需要 GPU。
- **CodeFormer** 人脸增强显著慢于 GFPGAN（GPU 上 53 秒 vs 2 秒）。大多数使用场景推荐 GFPGAN。

## 卷 {#volumes}

| 挂载 / 卷 | 用途 | 是否必需？ |
|---|---|---|
| `/data`（应用） | AI 模型、Python venv、用户文件 | **是** - 缺少将导致文件丢失 |
| `/tmp/workspace`（应用） | 临时处理文件（自动清理） | 推荐 |
| `SnapOtter-pgdata`（postgres） | PostgreSQL 数据目录（用户、设置、流水线、任务） | **是** - 缺少将导致数据丢失 |
| `SnapOtter-redisdata`（redis） | Redis 追加文件，用于持久化任务队列 | 推荐 |

### 绑定挂载 vs. 命名卷 {#bind-mounts-vs-named-volumes}

**命名卷**（推荐） - Docker 自动管理权限：
```yaml
volumes:
  - SnapOtter-data:/data
```

**绑定挂载** - 由你管理权限。设置 `PUID`/`PGID` 以匹配你的主机用户：
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### 存储权限 {#storage-permissions}

SnapOtter 在运行时写入两个位置：`/data`（用户文件、日志、AI 模型和 Python venv）和 `/tmp/workspace`（临时处理暂存）。两者都必须能被容器运行所用的用户写入。如果任一不可写，容器会在启动时**快速失败**，给出一条指明目录、当前运行 UID/GID 以及如何修复的消息 - 而不是先启动为“健康”状态，随后在首次上传时以晦涩的错误失败。

权限的处理方式取决于容器的启动方式：

**默认（以 root 启动，降权到 `snapotter`）** - 入口点以 root 启动，修复挂载卷的所有权，然后通过 `gosu` 降权到非特权的 `snapotter` 用户。命名卷无需任何配置即可工作。对于绑定挂载，请将 `PUID`/`PGID` 设置为你的主机用户（见上文），这样它写入的文件就归你所有。

**Kubernetes / OpenShift（通过 `runAsUser` 以非 root 运行）** - 直接以非 root 用户启动，容器无法自行 chown 这些卷，因此必须由编排器使其可写。设置 `fsGroup`：

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

镜像的可写目录归 GID 0 组所有且组可写，因此以**任意 UID** 加上 root 补充组（OpenShift 的默认设置）运行的 Pod 无需 `chown` 即可写入。

**TrueNAS Scale（以及其他“外来 UID”设置）** - TrueNAS 以非 root 用户运行应用（通常是 `568:568`），并挂载归属另一用户的主机数据集，因此入口点和 `fsGroup` 都无法自行使其可写。请选择其一：

- **以 root 运行应用**（推荐） - 让应用的用户保持未设置，或将其设为 `0`，由默认入口点修复权限并降权到 `snapotter`。
- **以 UID `999` 运行** - 将应用的用户/组设为 `999:999`（SnapOtter 内置的 `snapotter` 用户），使其与镜像的所有权匹配。
- **对主机数据集执行 `chown`**，改为容器运行所用的 UID，从 TrueNAS shell 中操作：

  ```bash
  # 使用启动错误中的 UID（或在容器内运行 `id`）
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

启动错误会指明要使用的确切 UID，所以最快的路径是先启动一次应用，读取该消息，然后据此执行 `chown`（或调整用户）。

## 环境变量 {#environment-variables}

| 变量 | 默认值 | 说明 |
|---|---|---|
| `AUTH_ENABLED` | `true` | 启用/禁用登录要求 |
| `DEFAULT_USERNAME` | `admin` | 初始管理员用户名 |
| `DEFAULT_PASSWORD` | `admin` | 初始管理员密码（首次登录时强制更改） |
| `MAX_UPLOAD_SIZE_MB` | `100` | 单文件上传限制 |
| `MAX_BATCH_SIZE` | `100` | 每个批量请求的最大文件数 |
| `RATE_LIMIT_PER_MIN` | `1000` | 每 IP 每分钟的 API 请求数（设为 0 可禁用） |
| `MAX_USERS` | `0`（无限制） | 最大用户账户数 |
| `TRUST_PROXY` | `true` | 信任来自反向代理的 X-Forwarded-For 头 |
| `PUID` | `999` | 以此 UID 运行（用于绑定挂载权限） |
| `PGID` | `999` | 以此 GID 运行（用于绑定挂载权限） |
| `LOG_LEVEL` | `info` | 日志详细程度：fatal、error、warn、info、debug、trace |
| `CONCURRENT_JOBS` | `0`（自动） | 最大并行 AI 处理任务数 |
| `SESSION_DURATION_HOURS` | `168` | 登录会话有效期（7 天） |
| `CORS_ORIGIN` | （空） | 逗号分隔的允许来源，或留空表示同源 |

## 健康检查 {#health-check}

容器内置了健康检查：

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## 反向代理 {#reverse-proxy}

SnapOtter 默认设置 `TRUST_PROXY=true`，因此速率限制和日志记录会使用来自 `X-Forwarded-For` 头的真实客户端 IP。

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

1. 添加一个新的 Proxy Host
2. 将 Domain Name 设为你的域名
3. 将 Scheme 设为 `http`，Forward Hostname 设为 `SnapOtter`（或你的容器 IP），Forward Port 设为 `1349`
4. 启用 WebSocket 支持
5. 在 Advanced 下添加：`client_max_body_size 500M;` 和 `proxy_buffering off;`

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

`flush_interval -1` 会禁用响应缓冲，这对于 SSE 进度事件（批量处理、AI 工具、功能安装）是必需的。延长的超时时间允许大文件上传在 Caddy 不提前关闭连接的情况下完成。

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

注意：Cloudflare 在免费套餐上有 100 MB 的上传限制。请将 `MAX_UPLOAD_SIZE_MB=100` 设置为与之匹配。

## CI/CD {#ci-cd}

GitHub 仓库有三个工作流：

- **ci.yml** - 在每次推送和 PR 时自动运行。执行 lint、类型检查、测试、构建，并验证 Docker 镜像（不推送）。
- **release.yml** - 通过 `workflow_dispatch` 手动触发。运行 semantic-release 创建版本标签和 GitHub 发布，然后构建多架构 Docker 镜像（amd64 + arm64）并推送到 Docker Hub（`snapotter/snapotter`）和 GitHub Container Registry（`ghcr.io/snapotter-hq/snapotter`）。
- **deploy-docs.yml** - 构建本文档站点，并在推送到 `main` 时将其部署到 Cloudflare Pages。

要创建发布，请在 GitHub UI 中前往 **Actions > Release > Run workflow**，或运行：

```bash
gh workflow run release.yml
```

Semantic-release 会根据提交历史确定版本。`latest` 这个 Docker 标签始终指向最近的一次发布。

## 分析 {#analytics}

SnapOtter 包含匿名的产品分析（工具使用模式、错误报告），以帮助捕获缺陷并改进功能。它默认开启。你的文件、文件名和个人数据永远不会包含在其中。禁用分析后 SnapOtter 也能正常工作。

### 禁用分析 {#disabling-analytics}

运行时退出是一键式的管理员开关。打开 Settings > System > Privacy，关闭 Anonymous Product Analytics。它会立即对整个实例停止，无需重新构建。

如需一个永远不会发出分析数据的镜像，可通过克隆仓库并重新构建来设置构建时硬关闭：

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

或将该构建参数添加到你现有的 `docker-compose.yml` 中：

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
