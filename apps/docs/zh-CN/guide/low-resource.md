---
i18n_source_hash: f5de74aee1b9
i18n_provenance: machine
i18n_output_hash: 6c82cfe39a38
---
# 低资源环境部署 {#low-resource-setups}

SnapOtter 在小型硬件上运行良好：Raspberry Pi 4 或 5、一台旧笔记本电脑，或一台 2 GB 的 VPS。本页是针对这些机器的实用指南：该有什么预期、一套可直接复制粘贴且带有合理上限的配置，以及哪些功能应该跳过。这些数字背后的完整基准测试数据见[硬件要求](/zh-CN/guide/deployment#hardware-requirements)。

先说两条硬性限制：

- **仅支持 64 位。**镜像只为 `linux/amd64` 和 `linux/arm64` 构建。不支持 32 位 ARM（`armv7`/`armhf`），因此第一代 Pi 和 Pi Zero 系列不在此列。
- **内存下限 2 GB。**512 MB 无法启动整个栈，1 GB 在多文件批量处理时会失败。2 GB 加 2 核是能舒适运行的最小配置。

## 小型硬件上哪些功能运行良好 {#what-runs-well}

所有非 AI 工具都能在 2 GB / 2 核的机器上运行：整个"图像"和"文件"板块、PDF 工具，以及流复制类的视频和音频操作（裁剪、静音、更换容器）。大多数在一秒内完成。

有两类负载是例外：

- **视频重编码**（在不同编解码器之间转换）受 CPU 限制。一段在高速桌面 CPU 上约 40 秒完成的 1080p 视频，在 Pi 级 CPU 上可能需要几分钟。流复制操作依然是即时的。
- **AI 工具**需要内存（推荐 4 GB）和磁盘（较大的 AI 包每个 4-5 GB），其中重型工具（放大、照片修复、背景移除）在 Pi 级 CPU 上并不实用。人脸检测和 OCR 这类轻量 AI 在内存足够时可以使用。

这两类负载在你用到之前既不会安装也不会运行：未安装任何 AI 包时，应用空闲内存占用约 360 MB，而 AI 包只有在管理员启用时才会下载。

## Raspberry Pi / 旧笔记本电脑实操指南 {#walkthrough}

这就是[快速上手](/zh-CN/guide/getting-started)中的标准 Compose 安装，外加资源限制和保守的上限。它假设使用 64 位操作系统（在 Pi 上：Raspberry Pi OS 64 位或 Ubuntu Server arm64）。

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@db:5432/snapotter
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
      - POSTGRES_USER=snapotter
      - POSTGRES_PASSWORD=snapotter
      - POSTGRES_DB=snapotter
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

针对 Pi 级机器的注意事项：

- **数据卷和 Postgres 优先使用 USB SSD 而不是 SD 卡。**任务工作区会产生真实的磁盘 IO，而 SD 卡既慢又容易磨损。
- **一体化单容器在这里同样适用**（未设置 `DATABASE_URL`/`REDIS_URL` 时使用嵌入式 Postgres 和 Redis），在内存受限的主机上应通过 `REDIS_MAXMEMORY` 调低其嵌入式 Redis 的内存上限（见[配置](/zh-CN/guide/configuration)）。Compose 提供更细的按服务控制，这也是本指南采用它的原因。
- **在 2 GB 设备上添加 swap。**它能避免偶发的内存尖峰（一个大 PDF、一个你忘了设上限的批量任务）以内存不足被杀进程收场。zram 是对 SD 卡更友好的选择。
- arm64 镜像仅支持 CPU；ARM 板卡上没有 CUDA。

## 调优参数 {#tuning-knobs}

所有上限都是环境变量，完整文档见[配置](/zh-CN/guide/configuration)。`0` 表示不限制或自动。在小型硬件上重要的有这些：

| 变量 | 小型机器建议值 | 它保护什么 |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | 并行运行的任务数。自动检测使用 CPU 核心数减一，在大机器上没问题，但在内存吃紧的 2 核机器上过于激进。 |
| `MAX_WORKER_THREADS` | `2` | 图像处理线程池。 |
| `MAX_BATCH_SIZE` | `5` | 批量处理是 1-2 GB 机器最先耗尽内存的地方。 |
| `MAX_UPLOAD_SIZE_MB` | `100` | 防止单个巨大文件占满整个工作区。 |
| `MAX_MEGAPIXELS` | `50` | 解码一张 100+ MP 的图像无论文件大小都要消耗内存。 |
| `MAX_VIDEO_DURATION_S` | `300` | 长时间转码会把小 CPU 独占几分钟到几小时。 |
| `PROCESSING_TIMEOUT_S` | `600` | 硬性上限，确保失控的任务最终会释放机器。 |

这些上限约束的是服务器接受什么，所以应按你的实际用途来设置，而不是越小越好。如果你从不处理视频，设一个 `MAX_VIDEO_DURATION_S` 上限毫无代价；如果你每天扫描文档，就不要限制 `MAX_PDF_PAGES`。

## 应该跳过什么 {#what-to-skip}

- **重型 AI 包。**放大、照片修复和背景移除需要 GPU 或高速多核 CPU，而且每个包要占 4-5 GB 磁盘。在小型机器上，干脆不要安装它们；缺少对应包的工具会显示安装提示，而不会运行。
- **把视频重编码当作日常负载。**偶尔转码没有问题（只是慢）；持续的转码队列需要的是 CPU 核心，而不是一台 Pi。
- **总的来说，用不到的工具。**管理员可以在 Settings 中关闭单个工具，这会把它们从 UI 中移除并停止注册其 API 路由。这本身并不省内存，但能避免一台共享的小型实例被拿去跑硬件唯一扛不住的那种负载。

如果以后把实例迁移到更强的硬件上，去掉这些上限（改回 `0`），同一个数据卷可以直接沿用。
