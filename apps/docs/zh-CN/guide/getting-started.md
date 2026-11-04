---
description: "使用 Docker 一条命令安装 SnapOtter。包含 Docker Compose 设置、从源码构建以及完整的功能概览。"
i18n_source_hash: aa8428189808
i18n_provenance: machine
i18n_output_hash: e5cd3a38e669
i18n_hash_version: 2
---

# 快速入门 {#getting-started}

::: tip 安装前先试用
在 [demo.snapotter.com](https://demo.snapotter.com) 探索完整界面，无需注册或安装。
:::

## 快速开始 {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

这个单一容器包含运行所需的一切：未设置 `DATABASE_URL` 时，它会在回环接口上启动自己的 PostgreSQL 和 Redis（内嵌模式），并将所有数据保存在 `SnapOtter-data` 卷中。这是试用 SnapOtter 或在家庭实验室中自托管的最快方式。对于生产环境，请使用[标准 Docker Compose 堆栈](#docker-compose)，它将 PostgreSQL 和 Redis 放在各自的容器中。内嵌模式以 root 身份运行（默认），并且一旦你设置 `DATABASE_URL` 就会自动关闭。

要在 Raspberry Pi、旧笔记本电脑或小型 VPS 上安装？请参阅[低资源配置](/zh-CN/guide/low-resource)，了解经过调优的操作指南以及受限硬件上的预期表现。

首次登录时会要求你修改密码。

::: tip 匿名产品分析
SnapOtter 默认包含匿名产品分析。要关闭它，请打开 **设置 → 系统 → 隐私**，并关闭 **匿名产品分析**。它会立即对整个实例停止。

你也可以设置环境变量 `SNAPOTTER_TELEMETRY=0`（`false` 和 `off` 同样有效），无需重新构建即可为该实例禁用所有遥测。

错误监控由 [Sentry](https://sentry.io) 提供支持，Sentry 通过其开源计划赞助 SnapOtter。

有关收集内容的详细信息，请参阅 [SnapOtter 收集哪些数据](/zh-CN/guide/telemetry)。
:::

::: tip NVIDIA CUDA 加速
添加 `--gpus all`，即可使用 NVIDIA CUDA 加速背景移除、放大、人脸增强和修复。OCR 仍基于 CPU，无论有无 GPU 访问权限，都可在同一个镜像中使用：

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

需要 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)。CUDA 不可用时会自动回退到 CPU。目前不支持通过 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 集成显卡进行 AI 推理加速。基准测试请参阅 [Docker 标签](/zh-CN/guide/docker-tags)。如果尽管设置了 `--gpus all`，AI 工具仍在 CPU 上运行，请参阅[验证 GPU 加速](/zh-CN/guide/deployment#verify-gpu-acceleration)。
:::

::: details 同时发布在 GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

每次发布时，两个镜像仓库都会发布相同的镜像。
:::

## Docker Compose {#docker-compose}

请使用随每个版本维护和测试的生产文件，而不要复制本页上简化的 Compose 示例：

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

标准的 [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) 包含全部四个运行时卷、健康检查、资源限制、持久化的 Redis 配置、固定版本的数据库/缓存镜像以及当前的容器加固。首次登录后请立即修改默认管理员密码。为了获得可复现的部署，请将 SnapOtter 应用镜像固定到你验证过的发布标签或摘要，而不要跟随 `latest`。

所有环境变量请参阅[配置](/zh-CN/guide/configuration)，密钥、网络策略和备份指南请参阅[安全与加固](/zh-CN/guide/security)。

## 从源码构建 {#build-from-source}

**前提条件：** Node.js 22.22+、pnpm 9+、Docker（用于 Postgres + Redis）、Python 3.11+（用于 AI 功能）、Git。

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- 前端：[http://localhost:1351](http://localhost:1351)
- 后端：[http://localhost:13490](http://localhost:13490)

## 你可以做什么 {#what-you-can-do}

### 文件处理（200+ 工具）{#file-processing-200-tools}

| 类型 | 数量 | 示例工具 |
|----------|-------|---------------|
| **图像** | 112 | 缩放、裁剪、压缩、转换、移除背景、放大、OCR、水印、拼贴、上色、GIF 工具、格式预设 |
| **视频** | 57 | 剪切、裁剪、压缩、转换、合并、提取音频、自动字幕、视频转 GIF、缩放、防抖、格式预设 |
| **音频** | 27 | 剪切、合并、转换、标准化、降噪、转录、变调、淡入淡出、铃声制作、格式预设 |
| **PDF / 文档** | 35 | 合并、拆分、压缩、OCR、水印、涂黑、Word 转 PDF、Excel 转 PDF、旋转、保护、修复 |
| **文件** | 23 | CSV 转 JSON、JSON 转 XML、合并 CSV、拆分 CSV、创建 ZIP、提取 ZIP、图表制作、YAML/JSON |

### 流水线 {#pipelines}

将工具串联成多步骤工作流，并应用于单张图像或整批图像：

1. 在侧边栏中打开 **流水线**。
2. 添加步骤（任意工具、任意设置）。
3. 对单个文件运行，或一次性对整个批次运行。
4. 保存流水线以便日后复用。

流水线默认允许 20 个步骤。将 `MAX_PIPELINE_STEPS=0` 设置为不限制即可取消该上限。

### 文件库 {#file-library}

你处理过的每个文件都可以保存到 **文件** 库中。SnapOtter 会记录完整的版本历史，因此你可以追溯从原始上传到最终输出的每个处理步骤。

保存是显式的：你保存到库中的结果会保留到你删除为止，而处理后未保存的结果会在 72 小时后自动清除（可通过 `FILE_MAX_AGE_HOURS` 配置）。

### REST API 与 API 密钥 {#rest-api-api-keys}

每个工具都可以通过 HTTP 访问：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

在 **设置 → API 密钥** 下生成 API 密钥。所有端点请参阅 [REST API 参考](/zh-CN/api/rest)，或访问 [http://localhost:1349/api/docs](http://localhost:1349/api/docs) 查看交互式参考。

### 多用户与团队 {#multi-user-teams}

通过基于角色的访问控制启用多用户：

- **管理员**：完全访问权限，可管理用户、团队、设置以及所有文件/流水线/API 密钥
- **用户**：使用工具，管理自己的文件/流水线/API 密钥

在 **设置 → 团队** 下创建团队以对用户分组。

设置 `AUTH_ENABLED=true`（或者对于无需登录的单用户/自用场景，设置 `false`）。

## 在手机上使用 {#use-it-from-your-phone}

SnapOtter 可在移动浏览器中使用，你也可以将其安装为应用。在手机上打开你的实例，然后：

- **iPhone / iPad（Safari）：** 点按分享，然后选择 **添加到主屏幕**。
- **Android（Chrome）：** 打开浏览器菜单并点按 **安装应用**。

安装后的应用会在自己的窗口中打开，直接进入你的实例。

有一点需要注意：浏览器只会在 HTTPS 下提供安装提示。局域网中的普通 HTTP 地址在浏览器标签页中仍然可以正常使用；若要真正安装，请把实例放在带证书的反向代理之后（参阅[部署指南](/zh-CN/guide/deployment)）。

在手机和平板电脑上，图像工具会在上传按钮旁边显示 **拍照** 按钮。拍下一张收据或白板，它会直接进入该工具。
