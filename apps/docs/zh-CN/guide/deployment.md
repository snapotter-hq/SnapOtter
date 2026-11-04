---
description: "使用 Docker 将 SnapOtter 部署到生产环境。包含硬件要求、GPU 设置，以及适用于 Nginx、Traefik 和 Cloudflare 的反向代理配置。"
i18n_source_hash: b8c4ed2cc086
i18n_provenance: machine
i18n_output_hash: 4f02a73e2db7
i18n_hash_version: 2
---

# 部署 {#deployment}

SnapOtter 以 3 个容器的 Docker Compose 堆栈形式部署：SnapOtter 应用镜像、PostgreSQL 17 和 Redis 8。应用镜像支持 **linux/amd64**（配合 NVIDIA CUDA 进行 AI 加速）和 **linux/arm64**（CPU），因此可以在 Intel/AMD 服务器、Apple Silicon Mac 以及 Raspberry Pi 4/5 等 ARM 设备上原生运行。目前不支持通过 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 集成显卡进行 AI 推理加速。

GPU 设置、Docker Compose 示例和版本固定请参阅 [Docker 镜像](./docker-tags)。

## 快速开始（CPU）{#quick-start-cpu}

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

之后即可通过 `http://localhost:1349` 访问应用。

上述堆栈以数据库所有者身份连接。从 SnapOtter 2.3.0 起，你可以使用只能读写数据行的角色来处理请求，详见[最小权限角色](./database#least-privilege-roles)。

> **遇到 Docker Hub 速率限制？** 将 `snapotter/snapotter:latest` 替换为 `ghcr.io/snapotter-hq/snapotter:latest`，改为从 GitHub Container Registry 拉取。每次发布时两个镜像仓库都会收到相同的镜像。

## 快速开始（NVIDIA CUDA）{#quick-start-nvidia-cuda}

若要在受支持的 AI 工具（背景移除、放大、人脸增强）上使用 NVIDIA CUDA 加速：

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

如果 `--gpus all` 和 NVIDIA Container Toolkit 都已正确设置，但 AI 工具仍在 CPU 上运行，请在 **设置 → AI 功能** 中重新安装受影响的捆绑包（例如背景移除）。安装程序会恢复 ONNX Runtime 的 GPU 版本；在共享的 AI 环境中，其他捆绑包（例如转录）引入的仅 CPU 版本可能会将其覆盖。如果在旧版镜像上通过界面重新安装后仍无法恢复 GPU，请参阅 [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490) 中的手动修复方法。

## 硬件要求 {#hardware-requirements}

这些数据来自对多种系统的基准测试，从配备 NVIDIA RTX 4070 的现代 amd64 工作站到 Raspberry Pi，在每台设备上运行完整的工具目录，并通过调整 Docker 资源限制来找出真实的下限。

如果你在这些档位的低端运行（Pi、旧笔记本电脑、2 GB VPS）？[低资源配置](/zh-CN/guide/low-resource)会把这些数据转化为带有调优上限的具体操作指南。

### 快速参考 {#quick-reference}

| 档位 | 使用场景 | CPU | 内存 | GPU | 存储 |
|------|----------|-----|-----|-----|---------|
| 最低 | 非 AI 工具（图像、文件、轻量 PDF），加上内置的快速 OCR 和人脸检测；单用户；小批量 | 2 核 | 2 GB | 无 | 约 7 GB |
| 推荐 | 全部五种类型，包括视频、PDF 和 CPU 上的标准 AI 捆绑包；批处理；少量用户 | 4 核 | 4 GB（HQ 修复为 8 GB） | 无 | 约 25 GB |
| 完整 | 全速运行所有功能，包括 GPU AI；大批量；多用户 | 6-8 核 | 8 GB | NVIDIA 8 GB 以上显存（12 GB 较为宽裕） | 约 35 GB |

**架构：仅支持 64 位**（`linux/amd64` 或 `linux/arm64`）。SnapOtter 可以在 Intel/AMD 服务器、Apple Silicon Mac 以及 64 位 ARM 开发板上原生运行，包括 **Raspberry Pi 4 和 5**（4-8 GB）。它**不能**在 32 位 ARM（`armv7`/`armhf`）上运行，因为没有为其构建镜像；也不能在 Pi Zero 等 512 MB 级别的开发板上运行，这些设备低于内存下限（见下文）。

### 最低配置（图像、文件和轻量 PDF 工具；无 AI）{#minimum-image-files-and-light-pdf-tools-no-ai}

| 资源 | 要求 |
|---|---|
| CPU | 2 核 |
| 内存 | 2 GB |
| 磁盘 | 约 5.5 GB（镜像）加数据卷 |
| GPU | 不需要 |

全部 222 个非 AI 目录工具，包括图像（缩放、裁剪、转换、压缩、调整、水印）、视频（剪切、静音、重新封装）、音频（转换、标准化、剪切）、PDF（合并、拆分、压缩、旋转、保护）、文件转换以及专用转换预设，都可以在普通硬件上运行。即使是大文件，大多数操作也能在远不到一秒内完成：一张 2.7 MB 的图像缩放约需 0.05 秒，重新编码为 WebP 约需 2 秒。

内存下限是真实存在的，来自 Docker 资源限制扫描：**512 MB 无法启动堆栈**（即使是单次图像缩放也会被终止），**1 GB** 可以处理单文件操作，但多文件批处理会耗尽内存，**2 GB / 2 核**是能够轻松处理非 AI 批处理的最小配置。内置的快速 OCR 和 `face-detection` 捆绑包同样可以在 2 GB 内运行，而较大的 AI 捆绑包（Whisper、LaMa/DDColor、rembg、RealESRGAN、照片修复和 SD1.5 HQ 修复）需要 4 到 8 GB 内存，当可用内存低于其各自捆绑包的下限时会被直接拒绝。

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**唯一占用大量 CPU 的例外是视频重新编码。** 流复制操作（剪切、静音、容器重新封装）是即时完成的，但转码为不同的编解码器受 CPU 限制。将一段 1080p / 45 秒的片段重新编码为 VP9（WebM），在快速的现代 CPU 上大约需要 **约 40 秒**，在 Apple Silicon 上约 45 秒，在较旧的 4 核移动处理器上约 80 秒，在较旧的 4 核服务器上约 **130 秒**。如果你的工作负载以视频为主，请优先考虑 CPU 核心数和时钟频率，或者提高容器的 `cpus:` 限制：自带的 compose 默认将应用限制为 4 核（GPU compose 为 8 核）。

### 推荐配置（CPU 上的 AI 工具）{#recommended-ai-tools-on-cpu}

| 资源 | 要求 |
|---|---|
| CPU | 4 核 |
| 内存 | 4 GB |
| 磁盘 | 3 GB（镜像）加约 20 GB（所有可选 AI 包）加工作区 |
| GPU | 不需要（回退到 CPU） |

**安装并运行较大的 AI 捆绑包是将推荐内存提高到 4 GB 的原因。** 未安装任何可选包时，应用空闲内存约为 360 MB。旧版 Python 工具共享一个 sidecar，而精确 OCR 使用专用的长驻调度器，并固定在当前生效的不可变代次上。激活之前，安装程序会对候选版本运行冒烟测试，然后以原子方式切换到新的调度器，并在垃圾回收之前排空旧的调度器。每个官方精确 OCR 产物都必须在 4 GiB cgroup 内通过其最坏情况发布测试套件，而 4 GB 的主机推荐配置则为 Node.js 应用、Postgres、Redis、队列和并发工作留出了余量。

大多数 AI 工具在 CPU 上完全可用，少数确实需要 GPU。在现代 4 核 CPU 上的测量结果：

| AI 工具 | CPU 耗时 | 在 CPU 上可用？ |
|---|---|---|
| 人脸检测（模糊人脸、智能裁剪、红眼），降噪 | 不到 1 秒 | 是 |
| OCR、转录、字幕 | 1-3 秒 | 是 |
| 上色、人脸增强 | 约 10 秒 | 是 |
| 背景移除 / 替换 / 模糊 | 约 29 秒 | 是（需要等待） |
| AI 放大（RealESRGAN） | 小图约 33 秒；大图需数分钟 | 勉强可用，强烈建议使用 GPU |
| 照片修复（完整流程） | 数分钟 | 否，需要 GPU 或高速多核 CPU |

SnapOtter 有意不把这些模型下载内置到 Docker 镜像中。AI 捆绑包仅在管理员启用相关工具时才会拉取，存储在持久化的 `/data/ai` 卷中，并由所有依赖同一模型栈的工具共享。这样可以让最终的容器镜像保持较小，同时仍能让完整的 AI 安装达到下文较大的存储数字。

某些工具依赖不止一个共享捆绑包。例如，证件照需要 `background-removal` 和 `face-detection` 两者；如果 `background-removal` 已经安装，启用证件照时只会下载缺失的 `face-detection` 捆绑包。所有 AI 工具都适用同样的复用方式。

可选 AI 包的存储空间和 CPU 内存下限（SnapOtter 在分派到 Python sidecar 之前会检查可用内存，并在低于捆绑包可用内存下限时立即拒绝运行）：

| 捆绑包 | 磁盘大小 | CPU 内存下限 |
|---|---|---|
| 人脸检测 | 200-300 MB | 2 GB 主机内存（约 0.5 GB 可用） |
| 转录 | 约 600 MB | 4 GB 主机内存（约 2 GB 可用） |
| 对象擦除 + 上色 | 1-2 GB | 4 GB 主机内存（约 2 GB 可用） |
| 精确 OCR（`balanced`/`best`） | 下载约 208-234 MiB / 安装后约 409-488 MiB | 4 GiB 配置的有效内存（`fast` 可在 2 GB 上运行） |
| 背景移除 | 4-5 GB | 4 GB 主机内存（约 2.5 GB 可用） |
| 放大 + 人脸增强 + 降噪 | 5-6 GB | 4 GB 主机内存（约 2.5 GB 可用） |
| 照片修复 | 4-5 GB | 4 GB 主机内存（约 3 GB 可用） |
| 高质量修复（`inpaint-hq`） | 5-7 GB | 8 GB 主机内存（约 6 GB 可用） |
| **所有捆绑包** | **安装后约 25 GB** | **4 GB（使用 `inpaint-hq` 时为 8 GB）** |

快速 OCR 通过 Tesseract 内置于镜像中，大约增加 25 MiB，不需要可选的 OCR 包，也没有其 4 GiB 内存要求。快速 OCR 支持 `auto`、`en`、`de`、`es`、`fr`、`zh` 和 `ja`，但不支持韩语（`ko`）或阿拉伯语（`ar`）。这两种语言使用 `balanced` 或 `best`，因此需要精确包。精确包在官方 Linux amd64 和 arm64 容器中可用，并在 CPU 上运行 ONNX Runtime。NVIDIA 主机使用同一个 CPU OCR 运行时，因此 OCR 不依赖 CUDA 版本或 GPU 架构。精确运行时要求至少 4 GiB 有效内存：即配置的容器 cgroup 限制，否则为主机内存。SnapOtter 会在下载该包之前拒绝低于该签名兼容性最低要求的系统。在无法保证 libc 和 Python ABI 的裸机/预构建归档上，同样会拒绝安装精确包。在这些不受支持的主机上，韩语和阿拉伯语 OCR 会返回明确的不兼容错误，绝不会静默回退到快速 OCR。

共享同一个 `DATA_DIR` 的副本必须使用相同的 CPU 架构；多副本部署请使用节点亲和性来固定。混合的 amd64/arm64 副本需要各自独立的数据卷和独立的 SnapOtter 部署。

精确运行时只保留一个活动代次，并在激活后清除其下载缓存。就本次发布而言，首次安装暂时需要大约 620-720 MiB 用于归档加暂存，而升级时在旧代次仍处于活动状态期间，峰值可能接近 1.2 GiB。安装程序会在下载或解压之前，根据签名索引和当前代次计算确切需求，如果数据卷太小则提前失败。

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### 完整配置（NVIDIA CUDA 上的 AI 工具）{#full-ai-tools-on-nvidia-cuda}

| 资源 | 要求 |
|---|---|
| CPU | 6-8 核（即使使用 GPU AI，视频准备和并发也在 CPU 上运行） |
| 内存 | 8 GB |
| GPU | 8 GB 以上显存的 NVIDIA（推荐 12 GB） |
| 磁盘 | 总计约 35 GB |

NVIDIA GPU（CUDA）可以显著加快大型 AI 模型的速度。在 RTX 4070 与现代 CPU 上的测量结果对比：

| AI 工具 | GPU 加速比 | 说明 |
|---|---|---|
| AI 放大（RealESRGAN 2×） | **约 47×** | 提升最大：不到一秒，对比约 33 秒（大图需数分钟） |
| 人脸增强（CodeFormer） | **约 12×** | 约 0.9 秒，对比约 11 秒 |
| 转录（Whisper） | 约 4.5× | |
| 背景移除 / 替换 / 模糊 | 约 4× | GPU 上约 7 秒，CPU 上约 29 秒 |
| 上色 | 约 1.8× | |
| OCR、人脸检测、红眼、降噪 | 约 1× | 在 CPU 上已经很快，GPU 没有帮助 |
| 照片修复 | 无 | 即使有 GPU 也受 CPU 限制（GPU 利用率为 0%）；这里高速 CPU 比 GPU 更重要 |

值得配备 GPU 的工具是**放大、人脸增强、转录和背景移除**。人脸检测、OCR 和红眼受 CPU 限制且本身已经很快，因此 GPU 不会带来任何提升。

在带人脸增强的放大过程中，显存峰值使用量可达 7.5 GB。6 GB 的 NVIDIA GPU 可以单独运行大多数 AI 工具，但放大会失败。8-12 GB 显存可以处理所有任务。

目前不支持通过 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 集成显卡进行 AI 推理加速。将 `/dev/dri` 映射到容器中并不会启用 AI GPU 加速；除非有 NVIDIA CUDA 可用，否则 SnapOtter 会在 CPU 上运行 AI 工具。

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

针对默认限制为 4 核的应用容器发起并行图像缩放请求：

| 并发请求数 | 平均响应时间 | 错误数 |
|---|---|---|
| 1 | 0.4 秒 | 0 |
| 5 | 1.2 秒 | 0 |
| 10 | 2.1 秒 | 0 |

随着工作线程池趋于饱和，响应时间呈次线性增长，且没有错误。提高应用容器的 `cpus:` 限制（或使用核心数更多的主机）可以抬高上限。请注意，重型任务（视频转码、CPU 上的 AI）会在整个执行期间占用一个工作线程，因此请根据预期的并发重型任务数量，而不仅仅是请求数量，来确定 CPU 的规模。

### 支持的图像格式 {#supported-image-formats}

SnapOtter 支持 **55 种以上输入格式**和 **14 种输出格式**，包括来自 20 多个相机品牌的 RAW 文件、专业格式（PSD、EPS、OpenEXR、HDR）、现代编解码器（JPEG XL、AVIF、HEIC、QOI），以及科学/游戏格式（FITS、DDS）。

每种受支持格式、所用解码器和可用质量控制的详细信息请参阅[完整格式列表](/zh-CN/guide/supported-formats)。

### 已知限制 {#known-limitations}

- **内容感知缩放**在处理大图像（超过 5 MP）时会崩溃，原因是 caire 二进制文件的限制。较小的图像可以正常工作。
- **HEIF 解码**需要 13-23 秒。HEIC（Apple 的变体）要快得多，仅需 0.3-0.9 秒。
- **放大**在 CPU 上处理稍大的图像就会超时。实际使用需要 GPU。
- **CodeFormer** 人脸增强明显慢于 GFPGAN（GPU 上为 53 秒对 2 秒）。大多数情况下推荐使用 GFPGAN。

## 卷 {#volumes}

| 挂载 / 卷 | 用途 | 是否必需？ |
|---|---|---|
| `/data`（app） | AI 模型、Python venv、用户文件 | **是**，缺少它会丢失文件 |
| `/tmp/workspace`（app） | 临时处理文件（自动清理） | 推荐 |
| `SnapOtter-pgdata`（postgres） | PostgreSQL 数据目录（用户、设置、流水线、任务） | **是**，缺少它会丢失数据 |
| `SnapOtter-redisdata`（redis） | 用于持久化任务队列的 Redis 仅追加文件 | 推荐 |

### 绑定挂载与命名卷 {#bind-mounts-vs-named-volumes}

**命名卷**（推荐）：Docker 自动管理权限：
```yaml
volumes:
  - SnapOtter-data:/data
```

**绑定挂载**：由你自己管理权限。将 `PUID`/`PGID` 设置为与宿主机用户一致：
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### 存储权限 {#storage-permissions}

SnapOtter 在运行时写入两个位置：`/data`（用户文件、日志、AI 模型和 Python venv）和 `/tmp/workspace`（临时处理暂存）。容器运行所用的用户必须对这两个位置都有写权限。如果任何一个没有，容器会在启动时**快速失败**，并给出一条消息，指明目录、正在运行的 UID/GID 以及修复方法，而不是以“健康”状态启动，然后在第一次上传时因含糊的错误而失败。日志目录（`LOG_DIR`，镜像中为 `/data/logs`）在所有存储模式下都以同样的方式检查，因为即使文件存放在 S3 中，日志也保留在本地。

权限如何处理取决于容器的启动方式：

**默认（以 root 启动，降权至 `snapotter`）**：入口点以 root 启动，修正已挂载卷的所有权，然后通过 `gosu` 降权为无特权的 `snapotter` 用户。命名卷无需任何配置即可使用。对于绑定挂载，请将 `PUID`/`PGID` 设置为你的宿主机用户（见上文），这样它写入的文件就归你所有。

**Kubernetes / OpenShift（通过 `runAsUser` 以非 root 运行）**：直接以非 root 用户启动时，容器无法自行 chown 这些卷，因此必须由编排器使它们可写。设置 `fsGroup`：

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

镜像中的可写目录归 GID 0 组所有且组可写，因此以**任意 UID** 加 root 补充组（OpenShift 默认）运行的 pod 无需 `chown` 即可写入。

**TrueNAS Scale（以及其他“外部 UID”设置）**：TrueNAS 以非 root 用户（通常为 `568:568`）运行应用，并挂载归其他用户所有的宿主机数据集，因此入口点和 `fsGroup` 都无法单独使它们可写。请选择以下之一：

- **以 root 运行应用**（推荐）：保持应用的用户未设置或设置为 `0`，让默认入口点修正权限并降权为 `snapotter`。
- **以 UID `999` 运行**：将应用的用户/组设置为 `999:999`（SnapOtter 内置的 `snapotter` 用户），使其与镜像的所有权一致。
- **对宿主机数据集执行 `chown`**，使其归容器运行所用的 UID 所有，在 TrueNAS shell 中操作：

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

启动错误会指明要使用的确切 UID，因此最快的方法是先启动一次应用，读取消息，然后相应地执行 `chown`（或调整用户）。

## 环境变量 {#environment-variables}

| 变量 | 默认值 | 说明 |
|---|---|---|
| `AUTH_ENABLED` | `true` | 启用/禁用登录要求 |
| `DEFAULT_USERNAME` | `admin` | 初始管理员用户名 |
| `DEFAULT_PASSWORD` | `admin` | 初始管理员密码（首次登录时强制修改） |
| `MAX_UPLOAD_SIZE_MB` | `0`（无限制） | 单文件上传限制，单位 MB。镜像默认为 `0`；源码构建从 100 开始 |
| `MAX_BATCH_SIZE` | `0`（无限制） | 每个批处理请求的最大文件数。镜像默认为 `0`；源码构建从 100 开始 |
| `RATE_LIMIT_PER_MIN` | `1000` | 每个 IP 每分钟的 API 请求数（设为 0 可禁用） |
| `MAX_USERS` | `0`（无限制） | 最大用户账户数 |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | 允许哪些对端通过 `X-Forwarded-For` 设置客户端 IP。默认仅限私有网络 |
| `PUID` | `999` | 以此 UID 运行（用于绑定挂载权限） |
| `PGID` | `999` | 以此 GID 运行（用于绑定挂载权限） |
| `LOG_LEVEL` | `info` | 日志详细程度：fatal、error、warn、info、debug、trace |
| `CONCURRENT_JOBS` | `0`（自动） | 最大并行 AI 处理任务数 |
| `SESSION_DURATION_HOURS` | `168` | 登录会话有效期（7 天） |
| `CORS_ORIGIN` | （空） | 以逗号分隔的允许来源，留空表示仅同源 |

### 出站代理与私有 CA {#outbound-proxy-and-private-ca}

官方容器启用了 Node 的环境代理支持。如果 SnapOtter 必须通过企业代理访问 OCR 运行时仓库或其他 HTTPS 服务，请设置 `HTTPS_PROXY`（需要时还有 `HTTP_PROXY`）。将 `NO_PROXY` 设置为必须直连的主机的逗号分隔列表，例如 Postgres、Redis 和内部对象存储。

如果代理或内部服务由私有证书颁发机构签名，请以只读方式挂载 CA 证书，并让 `NODE_EXTRA_CA_CERTS` 指向它。该文件必须在 Node 进程启动时就已存在：

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

请将代理凭据放在 Compose 文件之外（例如放在受保护的 `.env` 文件或密钥中）。不要禁用 TLS 验证：签名的 OCR 索引用于验证发布元数据，而常规的 TLS 验证仍然保护传输以及所有其他出站请求。

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

`TRUST_PROXY` 默认为 `loopback,linklocal,uniquelocal`，因此 SnapOtter 仅信任来自私有网络对端的 `X-Forwarded-For`。位于同一主机、Docker 网络或你的局域网中的反向代理开箱即用即被信任，这意味着速率限制、登录暴力破解限制器、审计日志和企业版 IP 允许列表都无需任何配置即可看到真实的客户端 IP。

仅当前置代理从**公网**地址访问 SnapOtter 时（例如位于不同网络的云负载均衡器），才设置 `TRUST_PROXY=true`。在直接暴露的实例上，该值会使 `request.ip` 受攻击者控制，因为轮换该标头的调用方每次请求都会获得一个新的速率限制桶。

在测量客户端 IP 之前，有两点需要了解。macOS 和 Windows 上的 Docker Desktop 通过用户态代理提供已发布的端口，该代理会把所有源地址改写为虚拟机网关 `192.168.65.1`，因此在那里任何 `TRUST_PROXY` 的取值都无法还原真实客户端；任何面向互联网的部署都请使用 Linux。而且在任何平台上，通过 `localhost` 访问已发布的端口，观察到的都是桥接网关而不是你的客户端，因此本地主机测试无法说明真实客户端是如何归因的。`TRUST_PROXY` 取值的完整表格以及 Docker Desktop 的注意事项见 [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy)。

对于下面的每种代理，有两点很重要：允许较大的请求体（上传），并且不要缓冲响应。缓冲响应的代理会破坏 SSE 进度，更明显的是，会使大文件下载“开始但永远无法完成”，因为代理会在转发之前先持有整个文件。SnapOtter 在下载时发送 `X-Accel-Buffering: no`，因此即使其他地方保持缓冲开启，nginx 也会以流方式传输下载内容，但 nginx 以外的代理需要显式禁用响应缓冲（见下方各配置）。如果下载中途停滞，首先应检查前置的缓冲代理。

关于 HSTS 的说明：API 本身会在每个响应上发送 `Strict-Transport-Security`，因此透传响应标头的代理（下方所有配置都是如此）无需自己设置 HSTS。只有当你的代理被配置为剥离或覆盖上游响应标头时，才需要保留该标头或在边缘重新添加。

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

若要在 `https://example.com/snapotter` 提供服务，请在
SnapOtter 容器环境中设置 `BASE_PATH=/snapotter` 并重启容器。官方的 CPU 和 GPU Compose
文件也接受来自你的 shell 或 Compose `.env` 文件的 `BASE_PATH`。同一个
镜像可在任意路径下工作，无需重新构建前端。

`BASE_PATH` 接受以斜杠分隔的段，段中包含字母、数字、`_` 或
`-`，包括 `/apps/snapotter` 这样的嵌套路径。末尾的斜杠是
可选的。对于根路径部署，请将其留空（默认值），或设置为 `/`。

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

API 脚本无需更改即可继续工作：API 响应中的 URL，例如工具的
`downloadUrl`，无论 `BASE_PATH` 是什么，都以 `/api/` 开头。请将它们追加到
你的实例基础 URL（`https://example.com/snapotter` + `/api/v1/download/...`）之后，
而不是相对于域名根路径来解析。

请通过带前缀的 URL（`https://example.com/snapotter`）打开界面。未带前缀到达的
浏览器会被自动重定向到那里；只有 API
请求才可能未带前缀到达应用。如果日志中出现
`Requests arrive under /snapotter/ but BASE_PATH is empty`，说明你的代理
转发了一个 `BASE_PATH` 未声明的前缀：请将 `BASE_PATH` 设置为该前缀，
或在代理处剥离该前缀。

### Nginx Proxy Manager {#nginx-proxy-manager}

1. 添加新的 Proxy Host
2. 将 Domain Name 设置为你的域名
3. 将 Scheme 设置为 `http`，Forward Hostname 设置为 `SnapOtter`（或你的容器 IP），Forward Port 设置为 `1349`
4. 启用 WebSocket 支持
5. 在 Advanced 下添加：`client_max_body_size 500M;` 和 `proxy_buffering off;`

API 的 `Strict-Transport-Security` 标头会原样通过 NPM；SSL 选项卡上的 HSTS 开关在此基础上是可选的。

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

Traefik 会原样转发上游响应标头，因此 API 的 `Strict-Transport-Security` 标头无需 `headers` 中间件即可到达浏览器。如果你已经运行了会改写响应标头的中间件，请确保它不会改动该标头。

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

`flush_interval -1` 会禁用响应缓冲，这是 SSE 进度事件（批处理、AI 工具、功能安装）所必需的，同时也能让大文件下载以流方式传输而不会停滞。延长的超时时间使大文件上传能够完成，而不会被 Caddy 提前关闭连接。Caddy 还会原封不动地透传 API 的 `Strict-Transport-Security` 标头，因此 HSTS 不需要 `header` 指令。

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

注意：Cloudflare 免费套餐有 100 MB 的上传限制。请相应设置 `MAX_UPLOAD_SIZE_MB=100`。

该隧道会转发 API 的响应标头，包括 `Strict-Transport-Security`，因此无需在控制台中配置 HSTS（Cloudflare 自己的边缘 HSTS 设置在此基础上是可选的）。

## 故障排除 {#troubleshooting}

### 首次启动失败后立即出现“Postgres not reachable: EAI_AGAIN” {#eai-again-after-failed-first-start}

如果第一次 `docker compose up -d` 中途失败（常见原因是端口已被占用），直接重试 `up -d` 可能会启动应用容器，却没有将其连接到 compose 网络。应用随后会崩溃循环，并输出：

```
Postgres not reachable: EAI_AGAIN
```

而 `docker ps` 显示 postgres 是健康的。该错误是真实的，但指向了错误的容器：没有网络，`postgres` 主机名的 DNS 根本无法解析，而重启策略会一遍又一遍地重复同样的失败。

修复首次启动时出问题的地方（通常是释放端口），然后强制重新创建应用容器，使其重新连接到网络：

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows：其他设备可以访问，本机却不行 {#windows-wsl2-loopback}

当 Docker 在 WSL2 内运行时（常见的 Windows 设置），堆栈可能可以被网络上的其他所有机器访问，而 Windows 主机本身访问 `http://localhost:1349` 却会超时，即使启用了 WSL 的镜像网络模式也是如此。该端口不会出现在 Windows 的 `netstat` 中，而容器本身并没有问题。

请从另一台设备打开应用，或者在发行版内部使用其自身地址（在 WSL shell 中使用 `hostname -I`）。如果 localhost 转发在你的 WSL 版本上恰好可用，请把它视为额外的好处，而不是可以依赖的功能。

## CI/CD {#ci-cd}

GitHub 仓库有三个工作流：

- **ci.yml**：在每次 push 和 PR 时自动运行。执行 lint、类型检查、测试、构建，并验证 Docker 镜像（不推送）。
- **release.yml**：通过 `workflow_dispatch` 手动触发。运行 semantic-release 创建版本标签和 GitHub 发布，然后构建多架构 Docker 镜像（amd64 + arm64），并推送到 Docker Hub（`snapotter/snapotter`）和 GitHub Container Registry（`ghcr.io/snapotter-hq/snapotter`）。
- **deploy-docs.yml**：构建本文档站点，并在推送到 `main` 时将其部署到 Cloudflare Pages。

要创建发布，请在 GitHub 界面中前往 **Actions > Release > Run workflow**，或运行：

```bash
gh workflow run release.yml
```

Semantic-release 根据提交历史确定版本。`latest` Docker 标签始终指向最新的发布。

## 分析 {#analytics}

SnapOtter 包含匿名产品分析（工具使用模式、错误报告），以帮助发现缺陷并改进功能。默认处于开启状态。你的文件、文件名和个人数据绝不会包含在内。禁用分析后，SnapOtter 仍可正常工作。

### 禁用分析 {#disabling-analytics}

运行时的退出方式是管理员的一键开关。打开 设置 > 系统 > 隐私，并关闭匿名产品分析。它会立即对整个实例停止，无需重新构建。

如果需要一个永远不会发出分析数据的镜像，请克隆仓库并重新构建，以设置构建时的彻底关闭：

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

或者将构建参数添加到你现有的 `docker-compose.yml`：

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
