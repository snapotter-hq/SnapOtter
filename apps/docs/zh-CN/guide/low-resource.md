---
i18n_source_hash: b859c4f3b301
i18n_provenance: machine
i18n_output_hash: fc9d92806d5c
i18n_hash_version: 2
---
# 低资源配置 {#low-resource-setups}

SnapOtter 在小型硬件上也能良好运行：Raspberry Pi 4 或 5、旧笔记本电脑，或者 2 GB 的 VPS。本页是针对这些机器的实用指南：预期表现、带有合理上限的可直接复制的设置，以及哪些功能应当跳过。这些数字背后的完整基准数据见[硬件要求](/zh-CN/guide/deployment#hardware-requirements)。

开头先说两个硬性限制：

- **仅支持 64 位。** 镜像是为 `linux/amd64` 和 `linux/arm64` 构建的。不支持 32 位 ARM（`armv7`/`armhf`），因此第一代 Pi 和 Pi Zero 系列无法使用。
- **2 GB 内存下限（非 AI 工具）。** 512 MB 无法启动堆栈，1 GB 在多文件批处理时会失败。2 GB 内存配 2 核是能够轻松运行非 AI 工具的最小配置。

## 小型硬件上运行良好的功能 {#what-runs-well}

所有非 AI 工具都可以在 2 GB / 2 核的机器上运行：整个图像和文件部分、PDF 工具，以及流复制的视频和音频操作（剪切、静音、容器重新封装）。大多数操作在一秒内完成。

有两类工作负载是例外：

- **视频重新编码**（在编解码器之间转换）受 CPU 限制。一段在快速桌面 CPU 上约需 40 秒的 1080p 片段，在 Pi 级别的 CPU 上可能需要几分钟。流复制操作仍然是即时的。
- **AI 工具**对每个捆绑包都有 CPU 内存下限：人脸检测和内置快速 OCR 需要 2 GB 主机内存（0.5 GB 可用），精确 OCR 需要 4 GiB 配置的有效内存，转录、对象擦除与上色、背景移除、放大与增强以及照片修复需要 4 GB 主机内存（2 到 3 GB 可用），高质量修复需要 8 GB 主机内存（6 GB 可用）。2 GB 的机器无法在不被 OOM 终止的情况下运行 Whisper、RealESRGAN、rembg 或 LaMa，因此 SnapOtter 在分派到 Python sidecar 之前会检查可用内存，并立即拒绝低于捆绑包下限的运行。

除非你使用，否则这两者都不会被安装或运行：没有安装任何 AI 捆绑包时，应用空闲内存约为 360 MB，而 AI 捆绑包仅在管理员启用时才会下载。

## Raspberry Pi / 旧笔记本电脑操作指南 {#walkthrough}

这是[快速入门](/zh-CN/guide/getting-started)中的标准 Compose 安装，外加资源限制和保守的上限。它假定使用 64 位操作系统（在 Pi 上：64 位 Raspberry Pi OS 或 Ubuntu Server arm64）。

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@db:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@db:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-snapotter}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      - POSTGRES_DB=${POSTGRES_DB:-snapotter}
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

针对 Pi 级别机器的说明：

- **数据卷和 Postgres 优先使用 USB SSD，而不是 SD 卡。** 任务工作区会进行大量真实的磁盘 IO，而 SD 卡既慢又容易磨损。
- **一体化的单容器在这里同样可用**（未设置 `DATABASE_URL`/`REDIS_URL` 时使用内嵌的 Postgres 和 Redis），在内存受限的主机上，你应当用 `REDIS_MAXMEMORY` 降低其内嵌 Redis 的上限（参阅[配置](/zh-CN/guide/configuration)）。Compose 让你可以对每个服务进行更精细的控制，这就是本指南使用它的原因。
- **在 2 GB 设备上添加交换空间。** 它可以避免偶发的峰值（大型 PDF、忘记设置上限的批处理）以内存不足被终止告终。zram 是对 SD 卡友好的选项。
- arm64 镜像仅支持 CPU；ARM 开发板上没有 CUDA。

## 调优参数 {#tuning-knobs}

所有上限都是环境变量，完整说明见[配置](/zh-CN/guide/configuration)。`0` 表示不限制或自动。在小型硬件上起作用的有：

| 变量 | 小型机器建议值 | 保护对象 |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | 并行运行多少个任务。自动检测使用 CPU 核心数减一，这对大型机器没问题，但对内存吃紧的 2 核机器来说过于激进。 |
| `MAX_WORKER_THREADS` | `2` | 图像处理线程池。 |
| `MAX_BATCH_SIZE` | `5` | 批处理是 1-2 GB 机器最先耗尽内存的地方。 |
| `MAX_UPLOAD_SIZE_MB` | `100` | 避免单个超大文件占满整个工作区。 |
| `MAX_MEGAPIXELS` | `50` | 无论文件大小如何，解码 100 MP 以上的图像都会消耗内存。 |
| `MAX_VIDEO_DURATION_S` | `300` | 长时间转码会让小型 CPU 被独占数分钟到数小时。 |
| `PROCESSING_TIMEOUT_S` | `600` | 硬性上限，使失控的任务最终能释放机器。 |

这些上限作用于服务器接受的内容，因此请根据你实际的使用情况来设置，而不是越小越好。如果你从不处理视频，`MAX_VIDEO_DURATION_S` 的上限不会有任何代价；如果你每天扫描文档，则不要限制 `MAX_PDF_PAGES`。

## 应当跳过的内容 {#what-to-skip}

- **重型 AI 捆绑包。** 放大、照片修复和背景移除需要 GPU 或高速多核 CPU，而且每个捆绑包要占用 4-5 GB 磁盘。在小型机器上，直接不要安装它们；缺少捆绑包的工具会显示安装提示，而不是运行。
- **将视频重新编码作为常规工作负载。** 偶尔转码没有问题（只是慢）；持续的转码队列需要的是 CPU 核心，而不是 Pi。
- **一般而言不用的工具。** 管理员可以在设置中关闭单个工具，这样会将它们从界面中移除，并停止注册其 API 路由。这本身并不会节省内存，但可以避免共享的小型实例被用于硬件承受不了的那种工作负载。

如果你之后将实例迁移到更强大的硬件，请移除这些上限（将它们恢复为 `0`），同一个数据卷会继续沿用。
