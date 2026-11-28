---
description: "使用 Docker 一条命令安装 SnapOtter，登录并打开你的第一个工具。涵盖 GPU 加速、小型机器、Docker Compose 以及从源码构建。"
i18n_source_hash: b40014f9f1a3
i18n_provenance: machine
i18n_output_hash: c63c1d13d30f
i18n_hash_version: 2
---

# 快速入门 {#getting-started}

::: tip 安装前先试用
在 [demo.snapotter.com](https://demo.snapotter.com) 探索完整界面，无需注册或安装。
:::

## 快速开始 {#quick-start}

运行一条命令：

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

然后打开 [http://localhost:1349](http://localhost:1349)，使用 `admin` / `admin` 登录。首次登录时会要求你修改密码。

接下来打开一个工具。可以从侧边栏中选择，也可以直接进入[缩放](http://localhost:1349/image/resize)，放入一张图像，然后下载结果。

安装到此就完成了。这个单一容器包含运行所需的一切：未设置 [`DATABASE_URL`](/zh-CN/guide/configuration#env-database-url) 时，它会在回环接口上启动自己的 PostgreSQL 和 Redis（内嵌模式），并将所有数据保存在 `SnapOtter-data` 卷中。这是试用 SnapOtter 或在家庭实验室中自托管的最快方式。内嵌模式以 root 身份运行（默认），并且一旦你设置 `DATABASE_URL` 就会自动关闭。对于生产环境，请使用 [Docker Compose 堆栈](#docker-compose)，它将 PostgreSQL 和 Redis 放在各自的容器中。

任务结果不会保存在数据卷中，因此容器被替换时（例如升级镜像）它们会消失，对应的下载链接也会失效。部署指南中的[保留任务输出](/zh-CN/guide/deployment#keeping-job-output)说明了如何保留它们。

::: tip 在 4 GB 或更少内存上运行
在 Raspberry Pi、旧笔记本电脑或小型 VPS 上，请一次只运行一个任务，在上面的命令中加入 `-e CONCURRENT_JOBS=1 -e MAX_WORKER_THREADS=2` 来限制图像线程池，并跳过体积较大的 AI 软件包。[低资源配置](/zh-CN/guide/low-resource#tuning-knobs)列出了其他值得设置的限制，以及受限硬件上的预期表现。
:::

::: tip 匿名产品分析
SnapOtter 默认包含匿名产品分析。若要关闭，请打开 **设置 → 系统 → 隐私**，并关闭 **匿名产品分析**。它会立即对整个实例停止。

你也可以设置环境变量 `SNAPOTTER_TELEMETRY=0`（`false` 和 `off` 同样有效），无需重新构建即可为该实例禁用所有遥测。

错误监控由 [Sentry](https://sentry.io) 提供支持，Sentry 通过其开源计划赞助 SnapOtter。

有关收集内容的详细信息，请参阅 [SnapOtter 收集哪些数据](/zh-CN/guide/telemetry)。
:::

## GPU 加速 {#gpu-acceleration}

NVIDIA GPU 能大幅加快重型 AI 工具的速度：放大（约 47 倍）、人脸增强（约 12 倍）、转录和背景移除（各约 4 倍）。OCR、人脸检测和照片修复仍然依赖 CPU，因此 GPU 对它们没有帮助。同一个镜像同时支持两种情况，只需添加 `--gpus all`：

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

这需要主机上安装 [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)。没有 CUDA 时，SnapOtter 会自动回退到 CPU。目前不支持通过 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 集成显卡进行 AI 推理加速。

- [硬件要求](/zh-CN/guide/deployment#full-ai-tools-on-nvidia-cuda)提供完整的 GPU 和 CPU 耗时，[Docker 镜像基准测试](/zh-CN/guide/docker-tags#benchmarks)提供热启动和冷启动数据。
- 如果 AI 工具仍在 CPU 上运行，请参阅[验证 GPU 加速](/zh-CN/guide/deployment#verify-gpu-acceleration)。
- 使用 Compose 时，请参阅部署指南中的 [NVIDIA CUDA 快速开始](/zh-CN/guide/deployment#quick-start-nvidia-cuda)。

## 其他安装方式 {#other-ways-to-install}

### 使用 Compose 的单容器 {#single-container-compose}

与快速开始相同的内嵌模式容器，写成 Compose 文件，更便于管理和修改。将其保存为 `docker-compose.yml`，然后运行 `docker compose up -d`：

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace  # keeps job results across upgrades
    environment:
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin  # you're asked to change it on first login
    restart: unless-stopped
    # mem_limit: 4g
    # cpus: 2

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
```

与 `docker run` 命令一样，这适合试用 SnapOtter 和小型安装。[配置](/zh-CN/guide/configuration)中的所有设置都放在 `environment` 下。

### Docker Compose（生产环境） {#docker-compose}

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

打开 [http://localhost:1349](http://localhost:1349)，使用 `admin` / `admin` 登录。

标准的 [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) 包含全部四个运行时卷、健康检查、资源限制、持久化的 Redis 配置、固定版本的数据库/缓存镜像以及当前的容器加固。首次登录后请立即修改默认管理员密码。为了获得可复现的部署，请将 SnapOtter 应用镜像固定到你验证过的发布标签或摘要，而不要跟随 `latest`。

所有环境变量请参阅[配置](/zh-CN/guide/configuration)，密钥、网络策略和备份指南请参阅[安全与加固](/zh-CN/guide/security)。

### GitHub Container Registry {#ghcr}

每次发布时，Docker Hub 和 GHCR 都会发布相同的镜像。要从 GHCR 拉取，请替换镜像名称：

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

### 从源码构建 {#build-from-source}

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
| **图像** | 114 | 缩放、裁剪、压缩、转换、移除背景、放大、OCR、水印、拼贴、上色、GIF 工具、格式预设 |
| **视频** | 63 | 剪切、裁剪、压缩、转换、合并、提取音频、自动字幕、视频转 GIF、缩放、防抖、格式预设 |
| **音频** | 57 | 剪切、合并、转换、标准化、降噪、转录、变调、淡入淡出、铃声制作、格式预设 |
| **PDF / 文档** | 37 | 合并、拆分、压缩、OCR、水印、涂黑、Word 转 PDF、Excel 转 PDF、旋转、保护、修复 |
| **文件** | 32 | CSV 转 JSON、JSON 转 XML、合并 CSV、拆分 CSV、创建 ZIP、提取 ZIP、图表制作、YAML/JSON、转换字体、比例计算器、Base64、格式预设 |

### 流水线 {#pipelines}

将工具串联成多步骤工作流，并应用于单张图像或整批图像：

1. 在侧边栏中打开 **流水线**。
2. 添加步骤（任意工具、任意设置）。
3. 对单个文件运行，或一次性对整个批次运行。
4. 保存流水线以便日后复用。

流水线默认允许 20 个步骤。将 [`MAX_PIPELINE_STEPS=0`](/zh-CN/guide/configuration#env-max-pipeline-steps) 设置为不限制即可取消该上限。

### 文件库 {#file-library}

你处理过的每个文件都可以保存到 **文件** 库中。SnapOtter 会记录完整的版本历史，因此你可以追溯从原始上传到最终输出的每个处理步骤。

保存是显式的：你保存到库中的结果会保留到你删除为止，而处理后未保存的结果会在 72 小时后自动清除（可通过 [`FILE_MAX_AGE_HOURS`](/zh-CN/guide/configuration#env-file-max-age-hours) 配置）。

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

设置 [`AUTH_ENABLED=true`](/zh-CN/guide/configuration#env-auth-enabled)（或者对于无需登录的单用户/自用场景，设置 `false`）。

## 在手机上使用 {#use-it-from-your-phone}

SnapOtter 可在移动浏览器中使用，你也可以将其安装为应用。在手机上打开你的实例，然后：

- **iPhone / iPad（Safari）：** 点按分享，然后选择 **添加到主屏幕**。
- **Android（Chrome）：** 打开浏览器菜单并点按 **安装应用**。

安装后的应用会在自己的窗口中打开，直接进入你的实例。

有一点需要注意：浏览器只会在 HTTPS 下提供安装提示。局域网中的普通 HTTP 地址在浏览器标签页中仍然可以正常使用；若要真正安装，请把实例放在带证书的反向代理之后（参阅[部署指南](/zh-CN/guide/deployment)）。

在手机和平板电脑上，图像工具会在上传按钮旁边显示 **拍照** 按钮。拍下一张收据或白板，它会直接进入该工具。
