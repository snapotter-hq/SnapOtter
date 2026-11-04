---
description: "使用 Docker 将 SnapOtter 部署到生产环境。包含硬件要求、GPU 设置，以及 Nginx、Traefik 和 Cloudflare 的反向代理配置。"
i18n_source_hash: 0c8f078ebe75
i18n_provenance: machine
i18n_output_hash: 8fbccd003cac
i18n_hash_version: 2
---

# 部署 {#deployment}

SnapOtter 以由 3 个容器组成的 Docker Compose 堆栈部署：SnapOtter 应用镜像、PostgreSQL 17 和 Redis 8。应用镜像支持 **linux/amd64**（使用 NVIDIA CUDA 进行 AI 加速）和 **linux/arm64**（CPU），因此可以在 Intel/AMD 服务器、Apple Silicon Mac 以及树莓派 4/5 等 ARM 设备上原生运行。目前不支持通过 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 核显进行 AI 推理加速。

GPU 设置、Docker Compose 示例和版本固定，请参见 [Docker 镜像](./docker-tags)。

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

随后可通过 `http://localhost:1349` 访问应用。

上述堆栈以数据库所有者的身份连接。从 SnapOtter 2.3.0 起，你可以使用只读写数据行的角色来处理请求，参见[最小权限角色](./database#least-privilege-roles)。

> **遇到 Docker Hub 速率限制？** 将 `snapotter/snapotter:latest` 替换为 `ghcr.io/snapotter-hq/snapotter:latest`，即可改从 GitHub Container Registry 拉取。每次发布时，两个镜像仓库都会收到相同的镜像。

## 快速开始（NVIDIA CUDA） {#quick-start-nvidia-cuda}

若要为受支持的 AI 工具（背景移除、放大、人脸增强）启用 NVIDIA CUDA 加速：

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

### 验证 GPU 加速 {#verify-gpu-acceleration}

在日志中检查 CUDA 检测情况：

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

如果即使 `--gpus all` 和 NVIDIA Container Toolkit 已正确设置，AI 工具仍在 CPU 上运行，请在 **设置 → AI 功能** 中重新安装受影响的功能包（例如背景移除）。安装程序会恢复 ONNX Runtime 的 GPU 版本；否则，其他功能包（例如转录）引入的仅 CPU 版本可能会在共享的 AI 环境中遮蔽它。如果在较旧的镜像上从界面重新安装无法恢复 GPU，请参见 [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490) 中的手动修复方法。

## 硬件要求 {#hardware-requirements}

这些数据来自在一系列系统上进行的基准测试，范围从配备 NVIDIA RTX 4070 的现代 amd64 工作站到树莓派。我们在每台设备上运行了完整的工具目录，并通过调整 Docker 资源限制来找出真实的下限。

如果你在这些档位的低端运行（树莓派、旧笔记本电脑、2 GB 的 VPS）？[低资源部署](/zh-CN/guide/low-resource)会把这些数字转化为带有调优上限的具体操作指南。

### 快速参考 {#quick-reference}

| 档位 | 使用场景 | CPU | 内存 | GPU | 存储 |
|------|----------|-----|-----|-----|---------|
| 最低 | 非 AI 工具（图像、文件、轻量 PDF），加上内置的快速 OCR 和人脸检测；单用户；小批量 | 2 核 | 2 GB | 无 | 约 7 GB |
| 推荐 | 全部五类模态，包括视频、PDF 和 CPU 上的标准 AI 功能包；批量处理；少量用户 | 4 核 | 4 GB（HQ 修复为 8 GB） | 无 | 约 25 GB |
| 完整 | 全速运行所有功能，包括 GPU AI；大批量；多用户 | 6-8 核 | 8 GB | NVIDIA 8 GB 以上显存（12 GB 更宽裕） | 约 35 GB |

**架构：仅支持 64 位**（`linux/amd64` 或 `linux/arm64`）。SnapOtter 可在 Intel/AMD 服务器、Apple Silicon Mac 以及 64 位 ARM 开发板（包括 **树莓派 4 和 5**，4-8 GB）上原生运行。它**不能**在 32 位 ARM（`armv7`/`armhf`）上运行，因为没有为其构建镜像，也不能在 Pi Zero 这类 512 MB 级别的开发板上运行，这类开发板低于内存下限（见下文）。

### 最低配置（图像、文件和轻量 PDF 工具；无 AI） {#minimum-image-files-and-light-pdf-tools-no-ai}

| 资源 | 要求 |
|---|---|
| CPU | 2 核 |
| 内存 | 2 GB |
| 磁盘 | 约 5.5 GB（镜像）+ 数据卷 |
| GPU | 不需要 |

目录中全部 222 个非 AI 工具，包括图像（缩放、裁剪、转换、压缩、调整、水印）、视频（裁剪、静音、重封装）、音频（转换、标准化、裁剪）、PDF（合并、拆分、压缩、旋转、保护）、文件转换以及专用转换预设，都可以在普通硬件上运行。即使是大文件，大多数操作也能在一秒内完成：一张 2.7 MB 的图像缩放约需 0.05 秒，重新编码为 WebP 约需 2 秒。

内存下限是真实存在的，来自 Docker 资源限制扫描测试：**512 MB 无法启动整个堆栈**（即使只做一次图像缩放也会被终止），**1 GB** 可以处理单文件操作，但多文件批量处理会耗尽内存，而 **2 GB / 2 核** 是能够从容处理非 AI 批量任务的最小配置。内置的快速 OCR 和 `face-detection` 功能包也能在 2 GB 内运行，而较大的 AI 功能包（Whisper、LaMa/DDColor、rembg、RealESRGAN、照片修复，以及 SD1.5 HQ 修复）需要 4 到 8 GB 内存，当可用内存低于各功能包的下限时，会被直接拒绝运行。

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**唯一占用大量 CPU 的例外是视频重新编码。** 流复制操作（裁剪、静音、容器重封装）是瞬时完成的，但转码为其他编码格式受限于 CPU。将一段 1080p / 45 秒的片段重新编码为 VP9（WebM），在快速的现代 CPU 上大约需要 **40 秒**，在 Apple Silicon 上约 45 秒，在较旧的 4 核移动处理器上约 80 秒，在较旧的 4 核服务器上约 **130 秒**。如果你的工作负载以视频为主，请优先考虑 CPU 核心数和主频，或者提高容器的 `cpus:` 限制，随附的 compose 默认将应用限制为 4 核（GPU 版 compose 为 8 核）。

### 推荐配置（CPU 上的 AI 工具） {#recommended-ai-tools-on-cpu}

| 资源 | 要求 |
|---|---|
| CPU | 4 核 |
| 内存 | 4 GB |
| 磁盘 | 3 GB（镜像）+ 约 20 GB（所有可选 AI 包）+ 工作区 |
| GPU | 不需要（回退到 CPU） |

**安装并运行较大的 AI 功能包，是推荐内存升至 4 GB 的原因。** 未安装任何可选包时，应用空闲内存约为 360 MB。传统的 Python 工具共享一个 sidecar，而精确 OCR 使用专用的长驻调度器，并固定在当前生效的不可变版本上。激活之前，安装程序会对候选版本运行冒烟测试，然后以原子方式切换到新的调度器，并在垃圾回收之前排空旧的调度器。每个官方的精确 OCR 制品都必须在 4 GiB 的 cgroup 内通过其最坏情况发布测试套件，而主机推荐的 4 GB 内存则为 Node.js 应用、Postgres、Redis、队列和并发工作留出了余量。

大多数 AI 工具在 CPU 上完全可用，只有少数确实需要 GPU。以下是在现代 4 核 CPU 上的实测结果：

| AI 工具 | CPU 耗时 | 在 CPU 上可用吗？ |
|---|---|---|
| 人脸检测（blur-faces、smart-crop、red-eye）、noise-removal | 1 秒以内 | 可以 |
| OCR、转录、字幕 | 1-3 秒 | 可以 |
| 上色、人脸增强 | 约 10 秒 | 可以 |
| 背景移除 / 替换 / 虚化 | 约 29 秒 | 可以（需要等待） |
| AI 放大（RealESRGAN） | 小图约 33 秒；大图需要数分钟 | 勉强，强烈建议使用 GPU |
| 照片修复（完整流程） | 数分钟 | 不可以，需要 GPU 或高速多核 CPU |

SnapOtter 有意不把这些模型下载内置到 Docker 镜像中。AI 功能包仅在管理员启用相关工具时才会拉取，存储在持久化的 `/data/ai` 卷中，并由依赖同一模型栈的所有工具共享。这样既能保持最终容器镜像较小，又能让完整的 AI 安装达到下文所述的较大存储用量。

有些工具依赖不止一个共享功能包。例如，证件照需要 `background-removal` 和 `face-detection` 两者；如果 `background-removal` 已经安装，启用证件照时只会下载缺少的 `face-detection` 功能包。所有 AI 工具都适用同样的复用方式。

可选 AI 包的存储空间和 CPU 内存下限（SnapOtter 在分派到 Python sidecar 之前会检查可用内存，当低于该功能包的可用内存下限时会立即拒绝运行）：

| 功能包 | 磁盘大小 | CPU 内存下限 |
|---|---|---|
| 人脸检测 | 200-300 MB | 2 GB 主机内存（约 0.5 GB 可用） |
| 转录 | 约 600 MB | 4 GB 主机内存（约 2 GB 可用） |
| 物体擦除 + 上色 | 1-2 GB | 4 GB 主机内存（约 2 GB 可用） |
| 精确 OCR（`balanced`/`best`） | 下载约 208-234 MiB / 安装后约 409-488 MiB | 配置的有效内存 4 GiB（`fast` 可在 2 GB 上运行） |
| 背景移除 | 4-5 GB | 4 GB 主机内存（约 2.5 GB 可用） |
| 放大 + 人脸增强 + 降噪 | 5-6 GB | 4 GB 主机内存（约 2.5 GB 可用） |
| 照片修复 | 4-5 GB | 4 GB 主机内存（约 3 GB 可用） |
| 高质量修复（`inpaint-hq`） | 5-7 GB | 8 GB 主机内存（约 6 GB 可用） |
| **全部功能包** | **安装后约 25 GB** | **4 GB（使用 `inpaint-hq` 时为 8 GB）** |

快速 OCR 通过 Tesseract 内置于镜像中，仅增加约 25 MiB，不需要可选的 OCR 包，也不需要其 4 GiB 内存要求。快速模式支持 `auto`、`en`、`de`、`es`、`fr`、`zh` 和 `ja`，但不支持韩语（`ko`）或阿拉伯语（`ar`）。这两种语言都使用 `balanced` 或 `best`，因此需要精确包。精确包可用于官方 Linux amd64 和 arm64 容器，并在 CPU 上运行 ONNX Runtime。NVIDIA 主机也使用同样的 CPU OCR 运行时，因此 OCR 不依赖 CUDA 版本或 GPU 架构。精确运行时要求至少 4 GiB 的有效内存：即配置的容器 cgroup 限制，若未配置则取主机内存。在下载该包之前，SnapOtter 会拒绝低于此签名兼容性最低要求的系统。对于无法保证 libc 和 Python ABI 的裸机或预构建归档，同样会拒绝安装精确包。在这些不受支持的主机上，韩语和阿拉伯语 OCR 会返回明确的不兼容错误，绝不会静默回退到快速模式。显式请求使用快速模式处理韩语时，会在任务入队之前返回 `FEATURE_INCOMPATIBLE` 以及 `fast-korean-unsupported` 原因。

共用同一个 `DATA_DIR` 的副本必须使用相同的 CPU 架构；多副本部署请使用节点亲和性固定架构。混合 amd64/arm64 的副本需要各自独立的数据卷和独立的 SnapOtter 部署。

精确运行时只保留一个活动版本，并在激活后清除其下载缓存。就本次发布而言，首次安装暂时需要大约 620-720 MiB 用于归档和暂存，升级时在旧版本仍处于活动状态期间，峰值可能接近 1.2 GiB。安装程序会在下载或解压之前，根据签名索引和当前版本计算出确切的需求，如果数据卷太小，则提前失败。

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### 完整配置（NVIDIA CUDA 上的 AI 工具） {#full-ai-tools-on-nvidia-cuda}

| 资源 | 要求 |
|---|---|
| CPU | 6-8 核（即使使用 GPU 运行 AI，视频准备和并发仍在 CPU 上运行） |
| 内存 | 8 GB |
| GPU | NVIDIA，8 GB 以上显存（推荐 12 GB） |
| 磁盘 | 总计约 35 GB |

NVIDIA GPU（CUDA）可以大幅加速重量级 AI 模型。以下是 RTX 4070 与现代 CPU 的对比实测：

| AI 工具 | GPU 加速倍数 | 说明 |
|---|---|---|
| AI 放大（RealESRGAN 2×） | **约 47 倍** | 收益最大，不到一秒，而 CPU 约需 33 秒（大图需要数分钟） |
| 人脸增强（CodeFormer） | **约 12 倍** | 约 0.9 秒 对比 约 11 秒 |
| 转录（Whisper） | 约 4.5 倍 | |
| 背景移除 / 替换 / 虚化 | 约 4 倍 | GPU 上约 7 秒，CPU 上约 29 秒 |
| 上色 | 约 1.8 倍 | |
| OCR、人脸检测、红眼、降噪 | 约 1 倍 | 在 CPU 上已经很快，GPU 帮不上忙 |
| 照片修复 | 无 | 即使有 GPU 也受限于 CPU（GPU 利用率为 0%）；这里快速的 CPU 比 GPU 更重要 |

值得配备 GPU 的工具是**放大、人脸增强、转录和背景移除**。人脸检测、OCR 和红眼去除受限于 CPU 且本身已经很快，因此 GPU 不会带来任何提升。

在带人脸增强的放大过程中，显存峰值用量可达 7.5 GB。6 GB 的 NVIDIA GPU 单独运行大多数 AI 工具没有问题，但放大会失败。8-12 GB 显存可以处理全部功能。

目前不支持通过 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 核显进行 AI 推理加速。将 `/dev/dri` 映射到容器中并不会启用 AI GPU 加速；除非有可用的 NVIDIA CUDA，否则 SnapOtter 会在 CPU 上运行 AI 工具。

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

针对默认限制为 4 核的应用容器发起并行的图像缩放请求：

| 并发请求数 | 平均响应时间 | 错误数 |
|---|---|---|
| 1 | 0.4 秒 | 0 |
| 5 | 1.2 秒 | 0 |
| 10 | 2.1 秒 | 0 |

随着工作线程池趋于饱和，响应时间呈次线性增长，且没有错误。提高应用容器的 `cpus:` 限制（或使用核心数更多的主机）可以抬高上限。请注意，重量级任务（视频转码、CPU 上的 AI）会在整个运行期间占用一个工作线程，因此请根据预期的并发重量级任务数来配置 CPU，而不只是请求数量。

### 支持的图像格式 {#supported-image-formats}

SnapOtter 支持 **55 种以上输入格式**和 **14 种输出格式**，包括来自 20 多个相机品牌的 RAW 文件、专业格式（PSD、EPS、OpenEXR、HDR）、现代编解码器（JPEG XL、AVIF、HEIC、QOI），以及科学和游戏格式（FITS、DDS）。

每种受支持格式、所用解码器和可用质量控制项的详细信息，请参见[完整格式列表](/zh-CN/guide/supported-formats)。

### 已知限制 {#known-limitations}

- **内容感知缩放**在处理大图（大于 5 MP）时会崩溃，这是 caire 二进制文件的限制。处理较小的图像时正常。
- **HEIF 解码**需要 13-23 秒。HEIC（Apple 的变体）要快得多，仅需 0.3-0.9 秒。
- **放大**在 CPU 上处理稍大的图像就会超时。实际使用需要 GPU。
- **CodeFormer** 人脸增强明显慢于 GFPGAN（GPU 上为 53 秒对 2 秒）。大多数场景推荐使用 GFPGAN。

## 卷 {#volumes}

| 挂载 / 卷 | 用途 | 是否必需？ |
|---|---|---|
| `/data`（应用） | AI 模型、Python venv、用户文件 | **是**，缺少它会丢失文件 |
| `/tmp/workspace`（应用） | 临时处理文件（自动清理） | 推荐 |
| `SnapOtter-pgdata`（postgres） | PostgreSQL 数据目录（用户、设置、流水线、任务） | **是**，缺少它会丢失数据 |
| `SnapOtter-redisdata`（redis） | 用于持久化任务队列的 Redis 仅追加文件 | 推荐 |

### 绑定挂载与命名卷 {#bind-mounts-vs-named-volumes}

**命名卷**（推荐）：Docker 自动管理权限：
```yaml
volumes:
  - SnapOtter-data:/data
```

**绑定挂载**：由你自己管理权限。请将 `PUID`/`PGID` 设置为与宿主机用户一致：
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### 存储权限 {#storage-permissions}

SnapOtter 在运行时会写入两个位置：`/data`（用户文件、日志、AI 模型和 Python venv）和 `/tmp/workspace`（临时处理暂存区）。容器所运行的用户必须对这两个位置都有写权限。如果任何一个没有，容器会在**启动时立即失败**，并给出一条消息，指明目录、正在运行的 UID/GID 以及修复方法，而不是以“健康”状态启动，然后在第一次上传时出现含糊的错误。日志目录（`LOG_DIR`，镜像中为 `/data/logs`）在所有存储模式下都以同样的方式检查，因为即使文件存放在 S3 中，日志仍保存在本地。

权限的处理方式取决于容器的启动方式：

**默认（以 root 启动，再降权到 `snapotter`）**：入口脚本以 root 启动，修正已挂载卷的所有权，然后通过 `gosu` 降权到无特权的 `snapotter` 用户。命名卷无需任何配置即可使用。对于绑定挂载，请将 `PUID`/`PGID` 设置为你的宿主机用户（见上文），这样它写入的文件才归你所有。

**Kubernetes / OpenShift（通过 `runAsUser` 以非 root 运行）**：直接以非 root 用户启动时，容器无法自行对卷执行 chown，因此必须由编排器让这些卷可写。请设置 `fsGroup`：

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

镜像中的可写目录属于 GID 0 组，且组可写，因此以**任意 UID** 加 root 附加组（OpenShift 默认设置）运行的 Pod 无需 `chown` 即可写入。

**TrueNAS Scale（以及其他“外来 UID”场景）**：TrueNAS 以非 root 用户（通常为 `568:568`）运行应用，并挂载归其他用户所有的宿主机数据集，因此无论是入口脚本还是 `fsGroup` 都无法单独使它们可写。请任选其一：

- **以 root 运行应用**（推荐）：不设置应用的用户，或将其设置为 `0`，让默认入口脚本修正权限并降权到 `snapotter`。
- **以 UID `999` 运行**：将应用的用户/组设置为 `999:999`（SnapOtter 内置的 `snapotter` 用户），使其与镜像的所有权一致。
- 在 TrueNAS shell 中，对宿主机数据集执行 `chown`，将其所有者改为容器所运行的 UID：

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

启动错误会指明要使用的确切 UID，因此最快的做法是先启动一次应用，阅读该消息，然后相应地执行 `chown`（或调整用户）。

## 环境变量 {#environment-variables}

| 变量 | 默认值 | 说明 |
|---|---|---|
| `AUTH_ENABLED` | `true` | 启用/禁用登录要求 |
| `DEFAULT_USERNAME` | `admin` | 初始管理员用户名 |
| `DEFAULT_PASSWORD` | `admin` | 初始管理员密码（首次登录时强制修改） |
| `MAX_UPLOAD_SIZE_MB` | `0`（无限制） | 单文件上传限制，单位为 MB。镜像默认为 `0`；源码构建从 100 开始 |
| `MAX_BATCH_SIZE` | `0`（无限制） | 每个批量请求的最大文件数。镜像默认为 `0`；源码构建从 100 开始 |
| `RATE_LIMIT_PER_MIN` | `1000` | 每个 IP 每分钟的 API 请求数（设为 0 可禁用） |
| `MAX_USERS` | `0`（无限制） | 最大用户账户数 |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | 哪些对端可以通过 `X-Forwarded-For` 设置客户端 IP。默认仅限私有网络 |
| `PUID` | `999` | 以该 UID 运行（用于绑定挂载权限） |
| `PGID` | `999` | 以该 GID 运行（用于绑定挂载权限） |
| `LOG_LEVEL` | `info` | 日志详细程度：fatal、error、warn、info、debug、trace |
| `CONCURRENT_JOBS` | `0`（自动） | 最大并行 AI 处理任务数 |
| `SESSION_DURATION_HOURS` | `168` | 登录会话有效期（7 天） |
| `CORS_ORIGIN` | （空） | 以逗号分隔的允许来源，留空表示仅限同源 |

### 出站代理与私有 CA {#outbound-proxy-and-private-ca}

官方容器启用了 Node 的环境变量代理支持。如果 SnapOtter 必须通过企业代理访问 OCR 运行时仓库或其他 HTTPS 服务，请设置 `HTTPS_PROXY`（需要时还有 `HTTP_PROXY`）。请将 `NO_PROXY` 设置为必须直连的主机的逗号分隔列表，例如 Postgres、Redis 和内部对象存储。

如果代理或内部服务由私有证书颁发机构签名，请以只读方式挂载该 CA 证书，并将 `NODE_EXTRA_CA_CERTS` 指向它。该文件必须在 Node 进程启动时就已存在：

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

请将代理凭据放在 Compose 文件之外（例如放在受保护的 `.env` 文件或 secret 中）。不要禁用 TLS 验证：签名的 OCR 索引用于验证发布元数据，而常规的 TLS 校验仍然保护传输过程以及所有其他出站请求。

## 健康检查 {#health-check}

容器包含内置的健康检查：

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## 反向代理 {#reverse-proxy}

`TRUST_PROXY` 默认为 `loopback,linklocal,uniquelocal`，因此 SnapOtter 只会信任来自私有网络对端的 `X-Forwarded-For`。位于同一主机、Docker 网络或局域网中的反向代理开箱即被信任，这意味着速率限制、登录暴力破解限制器、审计日志和企业版 IP 允许列表无需任何配置即可看到真实的客户端 IP。

仅当前置代理从**公网**地址访问 SnapOtter 时（例如位于不同网络的云负载均衡器），才需要设置 `TRUST_PROXY=true`。在直接暴露的实例上，该值会使 `request.ip` 受攻击者控制，因为轮换该请求头的调用方每次请求都会得到一个新的速率限制桶。

在测量客户端 IP 之前，需要了解两点。macOS 和 Windows 上的 Docker Desktop 通过用户态代理提供已发布的端口，它会把每个源地址都改写为虚拟机网关 `192.168.65.1`，因此在那里无论 `TRUST_PROXY` 取何值都无法还原真实的客户端；面向互联网的部署请使用 Linux。此外，在任何平台上，通过 `localhost` 访问已发布的端口，观察到的都是桥接网关，而不是你的客户端，所以本机测试无法说明真实客户端会如何被识别。`TRUST_PROXY` 各取值的完整表格以及 Docker Desktop 的注意事项，见 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy)。

对于下面的每种代理，有两点很重要：允许较大的请求体（上传），并且不要缓冲响应。缓冲响应的代理会破坏 SSE 进度，更明显的是，会让大文件下载“开始了却永远无法完成”，因为代理会先把整个文件保存下来再转发。SnapOtter 在下载响应中发送 `X-Accel-Buffering: no`，因此即使其他地方仍开启了缓冲，nginx 也会以流的方式传输，但 nginx 以外的代理需要显式关闭响应缓冲（见下方各配置）。如果下载在中途停滞，首先要检查前面是否有缓冲响应的代理。

关于 HSTS 的说明：API 本身会在每个响应中发送 `Strict-Transport-Security`，因此会透传响应头的代理（下面所有配置都是如此）无需自行设置 HSTS。只有当你的代理被配置为剥离或覆盖上游响应头时，才需要保留该响应头，或在边缘重新添加。

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

### 部署在子路径下 {#subpath}

要在 `https://example.com/snapotter` 提供服务，请在
SnapOtter 容器环境中设置 `BASE_PATH=/snapotter` 并重启。官方的 CPU 和 GPU Compose
文件也接受来自你的 shell 或 Compose `.env` 文件的 `BASE_PATH`。同一个
镜像可以在任意路径下工作，无需重新构建前端。

`BASE_PATH` 接受以斜杠分隔的路径段，其中可包含字母、数字、`_` 或
`-`，也支持嵌套路径，例如 `/apps/snapotter`。末尾的斜杠
可有可无。根路径部署请将其留空（默认值），或设置为 `/`。

在你现有的 Nginx HTTPS server 块中，使用：

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

此示例保留了前缀。在转发之前剥离 `/snapotter` 的代理同样受支持。内部健康检查可以继续使用
`/api/v1/health`。对于 OIDC 或 SAML，还需要设置
`EXTERNAL_URL=https://example.com/snapotter`，并更新身份提供商的
回调 URL，分别包含 `/snapotter/api/auth/oidc/callback` 或
`/snapotter/api/auth/saml/callback`。

API 脚本无需任何修改即可继续工作：API 响应中的 URL，例如工具的
`downloadUrl`，无论 `BASE_PATH` 为何值，都以 `/api/` 开头。请将它们追加到
实例的基础 URL 之后（`https://example.com/snapotter` + `/api/v1/download/...`），
而不要基于域名根路径来解析。

请通过带前缀的 URL 打开界面（`https://example.com/snapotter`）。没有带前缀到达的
浏览器会被自动重定向到那里；只有 API
请求才可以不带前缀访问应用。如果日志显示
`Requests arrive under /snapotter/ but BASE_PATH is empty`，说明你的代理
转发了一个 `BASE_PATH` 并未声明的前缀：请将 `BASE_PATH` 设置为该前缀，
或在代理处剥离该前缀。

### Nginx Proxy Manager {#nginx-proxy-manager}

1. 添加一个新的 Proxy Host
2. 将 Domain Name 设置为你的域名
3. 将 Scheme 设置为 `http`，Forward Hostname 设置为 `SnapOtter`（或你的容器 IP），Forward Port 设置为 `1349`
4. 启用 WebSocket 支持
5. 在 Advanced 下添加：`client_max_body_size 500M;` 和 `proxy_buffering off;`

API 的 `Strict-Transport-Security` 响应头会原样通过 NPM；SSL 选项卡上的 HSTS 开关则是在此之上的可选项。

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

Traefik 会原样转发上游响应头，因此 API 的 `Strict-Transport-Security` 响应头无需 `headers` 中间件即可到达浏览器。如果你已经运行了会改写响应头的中间件，请确保它不会改动该响应头。

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

`flush_interval -1` 会禁用响应缓冲，这对于 SSE 进度事件（批量处理、AI 工具、功能安装）以及让大文件下载以流的方式传输而不是停滞，都是必需的。延长的超时时间可让大文件上传顺利完成，而不会被 Caddy 提前关闭连接。Caddy 也会原封不动地透传 API 的 `Strict-Transport-Security` 响应头，因此 HSTS 不需要 `header` 指令。

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

注意：Cloudflare 免费套餐有 100 MB 的上传限制。请相应地设置 `MAX_UPLOAD_SIZE_MB=100`。

该隧道会转发 API 的响应头，包括 `Strict-Transport-Security`，因此无需在控制台中配置 HSTS（Cloudflare 自身的边缘 HSTS 设置是在此之上的可选项）。

## 故障排查 {#troubleshooting}

### 首次启动失败后出现“Postgres not reachable: EAI_AGAIN” {#eai-again-after-failed-first-start}

如果第一次 `docker compose up -d` 中途失败（常见原因是端口已被占用），简单地再次执行 `up -d` 可能会启动应用容器，却没有将其接入 compose 网络。此时应用会不断崩溃重启，并报错：

```
Postgres not reachable: EAI_AGAIN
```

而 `docker ps` 显示 postgres 处于健康状态。该错误是真实的，但指向了错误的容器：没有网络，`postgres` 主机名的 DNS 就根本无法解析，而重启策略会一遍又一遍地重复同样的失败。

先修复导致首次启动失败的问题（通常是释放端口），然后强制重新创建应用容器，使其重新接入网络：

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows：其他设备可以访问，但 PC 本机无法访问 {#windows-wsl2-loopback}

当 Docker 运行在 WSL2 内部（常见的 Windows 配置）时，堆栈可能可以从网络中的其他所有机器访问，而在 Windows 主机本身上 `http://localhost:1349` 却会超时，即使启用了 WSL 的镜像网络模式也是如此。该端口不会出现在 Windows 的 `netstat` 中，而容器本身并没有任何问题。

请从另一台设备打开应用，或在发行版内部使用其自身地址（WSL shell 中的 `hostname -I`）。如果 localhost 转发在你的 WSL 版本上恰好可用，请把它当作额外的好处，而不要依赖它。

## CI/CD {#ci-cd}

GitHub 仓库有三个工作流：

- **ci.yml**：在每次推送和 PR 时自动运行。执行 lint、类型检查、测试、构建，并验证 Docker 镜像（不推送）。
- **release.yml**：通过 `workflow_dispatch` 手动触发。运行 semantic-release 创建版本标签和 GitHub 发布，然后构建多架构 Docker 镜像（amd64 + arm64），并推送到 Docker Hub（`snapotter/snapotter`）和 GitHub Container Registry（`ghcr.io/snapotter-hq/snapotter`）。
- **deploy-docs.yml**：构建本文档站点，并在推送到 `main` 时部署到 Cloudflare Pages。

要创建发布，请在 GitHub 界面中前往 **Actions > Release > Run workflow**，或运行：

```bash
gh workflow run release.yml
```

Semantic-release 根据提交历史确定版本号。`latest` Docker 标签始终指向最新的发布。

## 分析 {#analytics}

SnapOtter 包含匿名的产品分析（工具使用模式、错误报告），以帮助发现缺陷并改进功能。该功能默认开启。你的文件、文件名和个人数据绝不会包含在内。禁用分析后，SnapOtter 仍可正常工作。

### 禁用分析 {#disabling-analytics}

运行时的退出方式是管理员的一键开关。打开 设置 > 系统 > 隐私，关闭“匿名产品分析”。它会立即对整个实例生效，无需重新构建。

如果需要一个永远不会发出分析数据的镜像，请克隆仓库并重新构建，设置构建时的硬关闭：

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

或者将构建参数添加到现有的 `docker-compose.yml` 中：

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
