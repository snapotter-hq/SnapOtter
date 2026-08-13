---
description: "用一条 Docker 命令安装 SnapOtter。包含 Docker Compose 配置、从源码构建，以及完整的功能概览。"
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: 00a743d88802
i18n_hash_version: 2
---

# 快速上手 {#getting-started}

::: tip 安装前先试用
在 [demo.snapotter.com](https://demo.snapotter.com) 体验完整 UI - 无需注册或安装。
:::

## 快速开始 {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

这个单一容器运行它所需的一切：在没有设置 `DATABASE_URL` 的情况下，它在环回接口（嵌入模式）上启动自己的 PostgreSQL 和 Redis，并将所有数据保存在 `SnapOtter-data` 卷中。这是在家庭实验室上尝试 SnapOtter 或自托管的最快方法。对于生产，请使用[规范的 Docker Compose 堆栈](#docker-compose)，它将 PostgreSQL 和 Redis 保留在自己的容器中。嵌入模式以 root 身份运行（默认），并在您设置 `DATABASE_URL` 后自动关闭。

要安装在 Raspberry Pi、旧笔记本电脑或小型 VPS 上？参阅[低资源环境部署](/zh-CN/guide/low-resource)，那里有调优后的分步指南，以及对受限硬件该有的预期。

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

需要 [NVIDIA 容器工具包](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)。当 CUDA 不可用时自动回退到 CPU。目前，AI 推理不支持通过 VA-API、Quick Sync 或 OpenCL 进行 Intel/AMD iGPU 加速。请参阅 [Docker 标签](/zh-CN/guide/docker-tags) 了解基准。如果 AI 工具在 CPU 上运行（尽管 `--gpus all`），请参阅[验证 GPU 加速](/zh-CN/guide/deployment#verify-gpu-acceleration)。
:::

::: details 也可在 GHCR 获取
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

两个镜像仓库在每次发布时都会发布相同的镜像。
:::

## Docker 编写 {#docker-compose}

使用每个版本维护和测试的生产文件，而不是从此页面复制缩写的 Compose 示例：

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.2.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

规范的 [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.2.0/docker/docker-compose.yml) 包括所有四个运行时卷、运行状况检查、资源限制、持久 Redis 配置、固定数据库/缓存映像以及当前容器强化。首次登录后立即更改默认管理员密码。对于可重现的部署，请将 SnapOtter 应用程序映像固定到您验证的发布标签或摘要，而不是遵循 `latest`。

有关所有环境变量，请参阅[配置](/zh-CN/guide/configuration)；有关机密、网络策略和备份指南，请参阅[安全和强化](/zh-CN/guide/security)。

## 从源码构建 {#build-from-source}

**前置条件：** Node.js 22.22+、pnpm 9+、Docker（用于 Postgres + Redis）、Python 3.11+（用于 AI 功能）、Git。

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- 前端：[http://localhost:1351](http://localhost:1351)
- 后端：[http://localhost:13490](http://localhost:13490)

## 你能做什么 {#what-you-can-do}

### 文件处理（200+ 工具） {#file-processing-200-tools}

| 模态 | 数量 | 示例工具 |
|----------|-------|---------------|
| **图像** | 107 | 缩放、裁剪、压缩、转换、背景移除、放大、OCR、水印、拼贴、上色、GIF 工具、格式预设 |
| **视频** | 57 | 剪辑、裁剪、压缩、转换、合并、提取音频、自动字幕、视频转 GIF、缩放、防抖、格式预设 |
| **音频** | 27 | 剪辑、合并、转换、归一化、降噪、转录、变调、淡入淡出、铃声制作、格式预设 |
| **PDF / 文档** | 29 | 合并、拆分、压缩、OCR、水印、涂黑、Word 转 PDF、Excel 转 PDF、旋转、加密、修复 |
| **文件** | 23 | CSV 转 JSON、JSON 转 XML、合并 CSV、拆分 CSV、创建 ZIP、解压 ZIP、图表制作、YAML/JSON |

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

## 在手机上使用 {#use-it-from-your-phone}

SnapOtter 可以在手机浏览器中使用，也可以安装成应用。在手机上打开你的实例，然后：

- **iPhone / iPad（Safari）**：轻点“共享”，再轻点**添加到主屏幕**。
- **Android（Chrome）**：打开浏览器菜单，点按**安装应用**。

安装后的应用会在独立窗口中打开，直接进入你的实例。

有一点要注意：浏览器只在 HTTPS 下才会提供安装入口。局域网里的普通 HTTP 地址照样能在浏览器标签页中正常使用；想要真正安装，请把实例放到带证书的反向代理后面（参见[部署指南](/zh-CN/guide/deployment)）。

在手机和平板上，图像工具会在上传按钮旁边显示**拍照**按钮。拍一张收据或白板，照片会直接进入工具。
