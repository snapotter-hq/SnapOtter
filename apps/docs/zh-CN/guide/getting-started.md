---
description: "用一条 Docker 命令安装 SnapOtter。包含 Docker Compose 配置、从源码构建，以及完整的功能概览。"
i18n_output_hash: 3da9d8045239
i18n_source_hash: 24724b5595b2
i18n_provenance: human
---

# 快速上手 {#getting-started}

::: tip 安装前先试用
在 [demo.snapotter.com](https://demo.snapotter.com) 体验完整 UI - 无需注册或安装。
:::

## 快速开始 {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

这个单容器运行它所需的一切：在未设置 `DATABASE_URL` 时，它会在回环接口上启动自己的 PostgreSQL 和 Redis（嵌入式模式），并将所有数据保存在 `SnapOtter-data` 卷中。这是试用 SnapOtter 或在家庭实验室中自托管的最快方式。生产环境请运行下面的 [Docker Compose](#docker-compose) 栈，它会将 PostgreSQL 和 Redis 分别放在各自的容器中。嵌入式模式以 root 运行（默认），一旦你设置了 `DATABASE_URL` 便会自动关闭。

首次登录时会要求你更改密码。

::: tip 匿名产品分析
SnapOtter 默认包含匿名产品分析。要关闭它，请打开 **Settings → System → Privacy**，关闭 **Anonymous Product Analytics**。它会立即对整个实例停止。

你也可以设置环境变量 `SNAPOTTER_TELEMETRY=0`（`false` 和 `off` 同样有效）来为整个实例禁用所有遥测，无需重新构建。

错误监控由 [Sentry](https://sentry.io) 提供，它通过其开源计划赞助 SnapOtter。

关于收集内容的详情，请参阅 [SnapOtter 收集的内容](/zh-CN/guide/telemetry)。
:::

::: tip NVIDIA CUDA 加速
添加 `--gpus all` 以实现 NVIDIA CUDA 加速的背景去除、放大、面部增强和恢复。 OCR 仍然基于 CPU，并且在有或没有 GPU 访问的情况下在同一映像中工作：

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

需要 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)。当 CUDA 不可用时会自动回退到 CPU。目前不支持通过 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 核显加速 AI 推理。基准测试参见 [Docker 标签](/zh-CN/guide/docker-tags)。
:::

::: details 也可在 GHCR 获取
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

两个镜像仓库在每次发布时都会发布相同的镜像。
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

所有环境变量请参阅 [配置](/zh-CN/guide/configuration)。

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

## 你能做什么 {#what-you-can-do}

### 文件处理（200+ 工具） {#file-processing-200-tools}

| 模态 | 数量 | 示例工具 |
|----------|-------|---------------|
| **图像** | 105 | 缩放、裁剪、压缩、转换、背景移除、放大、OCR、水印、拼贴、上色、GIF 工具、格式预设 |
| **视频** | 57 | 剪辑、裁剪、压缩、转换、合并、提取音频、自动字幕、视频转 GIF、缩放、防抖、格式预设 |
| **音频** | 27 | 剪辑、合并、转换、归一化、降噪、转录、变调、淡入淡出、铃声制作、格式预设 |
| **PDF / 文档** | 42 | 合并、拆分、压缩、OCR、水印、涂黑、Word 转 PDF、Excel 转 PDF、旋转、加密、修复 |
| **文件** | 10 | CSV 转 JSON、JSON 转 XML、合并 CSV、拆分 CSV、创建 ZIP、解压 ZIP、图表制作、YAML/JSON |

### 流水线 {#pipelines}

将工具串联成多步骤工作流，并将其应用于单张图像或整个批次：

1. 在侧边栏中打开 **Pipelines**。
2. 添加步骤（任意工具、任意设置）。
3. 对单个文件运行 - 或一次性对整批文件运行。
4. 保存流水线以便日后复用。

流水线默认允许 20 个步骤。设置 `MAX_PIPELINE_STEPS=0` 可使该限制变为无限制。

### 文件库 {#file-library}

你处理的每个文件都可以保存到你的 **Files** 库中。SnapOtter 会跟踪完整的版本历史，让你能够追溯从原始上传到最终输出的每一个处理步骤。

保存是显式的：保存到库中的结果会一直保留，直到你删除它们；而你处理后未保存的结果会在 72 小时后自动清除（可通过 `FILE_MAX_AGE_HOURS` 配置）。

### REST API 与 API 密钥 {#rest-api-api-keys}

每个工具都可通过 HTTP 访问：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

在 **Settings → API Keys** 下生成 API 密钥。所有端点请参阅 [REST API 参考](/zh-CN/api/rest)，或访问 [http://localhost:1349/api/docs](http://localhost:1349/api/docs) 查看交互式参考。

### 多用户与团队 {#multi-user-teams}

启用基于角色的访问控制的多用户功能：

- **Admin**：完全访问 - 管理用户、团队、设置，以及所有文件/流水线/API 密钥
- **User**：使用工具，管理自己的文件/流水线/API 密钥

在 **Settings → Teams** 下创建团队以对用户分组。

设置 `AUTH_ENABLED=true`（或对单用户/自用无需登录的场景设置 `false`）。
