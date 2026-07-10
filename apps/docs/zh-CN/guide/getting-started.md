---
description: "用一条 Docker 命令安装 SnapOtter。包含 Docker Compose 设置、从源码构建，以及完整的功能概览。"
i18n_source_hash: d2366a2e051c
i18n_provenance: human
i18n_output_hash: 2b77b3ccb8d8
---

# 快速开始 {#getting-started}

::: tip 安装前先试用
在 [demo.snapotter.com](https://demo.snapotter.com) 上体验完整界面，无需注册或安装。
:::

## 快速开始 {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

这个单一容器运行它所需的一切：未设置 `DATABASE_URL` 时，它会在回环接口上启动自带的 PostgreSQL 和 Redis（内嵌模式），并将所有数据保存在 `SnapOtter-data` 卷中。这是试用 SnapOtter 或在家庭实验室自托管的最快方式。用于生产环境时，请运行下方的 [Docker Compose](#docker-compose) 栈，它会将 PostgreSQL 和 Redis 保留在各自的容器中。内嵌模式以 root 身份运行（默认），一旦你设置了 `DATABASE_URL`，它就会自动关闭。

首次登录时，系统会要求你更改密码。

::: tip 匿名产品分析
SnapOtter 默认包含匿名产品分析。要关闭它，请打开 **设置 → 系统 → 隐私**，然后关闭 **匿名产品分析**。整个实例会立即停止。

关于收集内容的详情，请参阅 [SnapOtter 收集哪些数据](/zh-CN/guide/telemetry)。
:::

::: tip NVIDIA CUDA 加速
添加 `--gpus all` 即可为背景去除、放大、OCR、人脸增强和修复启用 NVIDIA CUDA 加速：

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

需要 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)。CUDA 不可用时会自动回退到 CPU。目前不支持通过 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 核显加速 AI 推理。基准测试请参阅 [Docker 标签](/zh-CN/guide/docker-tags)。
:::

::: details GHCR 上也有
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

每次发布时两个镜像仓库都会发布相同的镜像。
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
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
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

所有环境变量请参阅[配置](/zh-CN/guide/configuration)。

## 从源码构建 {#build-from-source}

**前置条件：** Node.js 22+、pnpm 9+、Docker（用于 Postgres + Redis）、Python 3.10+（用于 AI 功能）、Git。

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- 前端：[http://localhost:1349](http://localhost:1349)
- 后端：[http://localhost:13490](http://localhost:13490)

## 你可以做什么 {#what-you-can-do}

### 文件处理（241 个工具） {#file-processing-241-tools}

| 模态 | 数量 | 示例工具 |
|----------|-------|---------------|
| **图像** | 105 | 调整尺寸、裁剪、压缩、转换、背景去除、放大、OCR、水印、拼贴、上色、GIF 工具、格式预设 |
| **视频** | 57 | 剪辑、裁剪、压缩、转换、合并、提取音频、自动字幕、视频转 GIF、调整尺寸、防抖、格式预设 |
| **音频** | 27 | 剪辑、合并、转换、归一化、降噪、转录、变调、淡入淡出、铃声制作、格式预设 |
| **PDF / 文档** | 42 | 合并、拆分、压缩、OCR、水印、涂黑、Word 转 PDF、Excel 转 PDF、旋转、加密、修复 |
| **文件** | 10 | CSV 转 JSON、JSON 转 XML、合并 CSV、拆分 CSV、创建 ZIP、解压 ZIP、图表制作、YAML/JSON |

### 流水线 {#pipelines}

将工具串联成多步骤工作流，并将其应用于单张图像或整个批次：

1. 在侧边栏打开 **流水线**。
2. 添加步骤（任意工具、任意设置）。
3. 在单个文件上运行，或一次性运行整个批次。
4. 保存流水线以便日后复用。

流水线默认允许 20 个步骤。设置 `MAX_PIPELINE_STEPS=0` 可将限制设为无限制。

### 文件库 {#file-library}

你处理的每个文件都可以保存到 **文件** 库中。SnapOtter 会跟踪完整的版本历史，让你能够从原始上传一直追溯到最终输出的每一个处理步骤。

保存是显式的：你保存到文件库的结果会一直保留，直到你删除它们；而你处理后未保存的结果会在 72 小时后自动清除（可通过 `FILE_MAX_AGE_HOURS` 配置）。

### REST API 与 API 密钥 {#rest-api-api-keys}

每个工具都可通过 HTTP 访问：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

在 **设置 → API 密钥** 下生成 API 密钥。所有端点请参阅 [REST API 参考](/zh-CN/api/rest)，或访问 [http://localhost:1349/api/docs](http://localhost:1349/api/docs) 查看交互式参考。

### 多用户与团队 {#multi-user-teams}

启用多用户并使用基于角色的访问控制：

- **管理员**：完全访问权限，可管理用户、团队、设置，以及所有文件/流水线/API 密钥
- **用户**：使用工具，管理自己的文件/流水线/API 密钥

在 **设置 → 团队** 下创建团队以对用户分组。

设置 `AUTH_ENABLED=true`（或设置 `false` 用于无需登录的单用户/自用场景）。
