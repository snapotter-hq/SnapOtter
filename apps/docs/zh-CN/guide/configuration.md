---
description: "SnapOtter 的所有环境变量及其默认值。可配置认证、存储、AI 模型、分析等。"
i18n_source_hash: 02edb8bd70e5
i18n_provenance: machine
i18n_output_hash: 71dee2df3bd2
i18n_hash_version: 2
---

# 配置 {#configuration}

所有配置都通过环境变量完成。每个变量都有合理的默认值，因此无需设置任何变量，SnapOtter 即可开箱即用。

## 环境变量 {#environment-variables}

### 服务器 {#server}

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `1349` | 服务器监听的端口。 |
| `HOST` | `0.0.0.0` | 服务器监听的 IP 地址。在桥接网络上（`docker run` 和 Compose 的默认网络），请保持 `0.0.0.0`（或 `::`），否则发布的端口将无法工作。在原生安装或使用主机网络的容器中，`127.0.0.1` 可让 API 不暴露在网络上；如需远程访问，请在前面放置反向代理。[内置模式](#embedded-mode)仅适用于 `0.0.0.0`、`::` 或 `127.0.0.1`，因为它的启动检查会调用 `127.0.0.1`。使用任何其他地址（包括 `::1`）时，容器永远不会被视为已启动，之后发生的崩溃会停止容器，而不是重启服务器。任何不是 IP 地址的值（包括 `localhost`）都会使服务器在启动时停止。 |
| `BASE_PATH` | （空） | 公开的部署路径，例如 `/snapotter`。留空或设为 `/` 时在域名根路径提供服务。在运行时生效，无需重新构建镜像。 |
| `RATE_LIMIT_PER_MIN` | `1000` | 每个 IP 每分钟的最大请求数。设为 0 可禁用速率限制。 |
| `CORS_ORIGIN` | （空） | 以逗号分隔的 CORS 允许来源，留空则仅允许同源。 |
| `LOG_LEVEL` | `info` | 日志详细程度。可选值：`fatal`、`error`、`warn`、`info`、`debug`、`trace`。 |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | 哪些对端可以通过 `X-Forwarded-For` 设置客户端 IP。默认值只信任私有网络中的对端，因此 Docker 网络或局域网上的反向代理会被信任，而公网客户端伪造的请求头不会。仅当你控制的代理位于公网地址之前时，才设置 `true`。 |
| `SNAPOTTER_ANALYTICS_DEFAULT` | `on` | 设为 `off` 可让新实例在启动时关闭“匿名产品分析”，从而从首次启动起就不发送任何数据。它只在尚无人做出选择时填入该设置。一旦该设置已被保存（无论是由管理员还是由此变量保存），更改此变量都不再起作用；管理员仍可在 设置 > 系统 > 隐私 中开启分析。 |

### 认证 {#authentication}

下面两个布尔值只接受 `true` 和 `false`。其他任何值，例如 `1`、`yes` 或 `on`，都无法通过验证，服务器会在开始监听之前退出。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `AUTH_ENABLED` | `true` | 是否要求登录。设为 `false` 时完全不使用账户运行，这会让每个请求都拥有管理员权限，因此请仅在受信任的网络中使用。 |
| `DEFAULT_USERNAME` | `admin` | 初始管理员账户的用户名。仅在首次运行时使用。 |
| `DEFAULT_PASSWORD` | `admin` | 初始管理员账户的密码。请在首次登录后修改。 |
| `MAX_USERS` | `0`（无限制） | 已注册用户账户的最大数量。设为 0 表示无限制。 |
| `SESSION_DURATION_HOURS` | `168` | 登录会话的有效期，单位为小时（默认 7 天）。 |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | 设为 `true` 可跳过首次登录时强制修改密码的提示。 |

### 存储 {#storage}

| 变量 | 默认值 | 说明 |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` 或 `s3`。S3 和 MinIO 需要包含 s3_storage 功能的许可证，以及下面的 `S3_*` 变量。 |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL 连接字符串，也是处理每个请求所用的连接。在 2.3.0 及更高版本中，同时设置 `DATABASE_MIGRATION_URL` 后，它会成为最小权限的运行时角色，只拥有应用数据表上的 DML 权限，别无其他。Compose 栈将它指向其 `postgres` 服务；将它（连同 `REDIS_URL`）保持未设置即可进入内置模式。 |
| `DATABASE_MIGRATION_URL` | （空） | 特权连接，仅在启动期间用于运行迁移并授权给运行时角色，然后在第一个请求之前关闭。留空时，SnapOtter 以单一角色运行，由 `DATABASE_URL` 承担这两项工作。参见[最小权限角色](/zh-CN/guide/database#least-privilege-roles)。 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 连接字符串（用于 BullMQ 作业队列）。Compose 将其指向其 `redis` 服务。 |
| `WORKSPACE_PATH` | `./tmp/workspace` | 处理期间用于存放临时文件的目录。会自动清理。镜像将其设置为 `/tmp/workspace`。 |
| `FILES_STORAGE_PATH` | `./data/files` | 用于存放持久用户文件（上传的图片、保存的结果）的目录。镜像将其设置为 `/data/files`。 |

### S3 对象存储 {#s3-object-storage}

仅在 `STORAGE_MODE=s3` 时读取。缺少三个必填变量中的任何一个，启动都会失败，并指出你漏掉的变量名。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `S3_BUCKET` | （空） | 存放上传文件和输出的存储桶。必填。 |
| `S3_ACCESS_KEY_ID` | （空） | 访问密钥。必填。在容器中，你也可以通过 `S3_ACCESS_KEY_ID_FILE` 挂载它。 |
| `S3_SECRET_ACCESS_KEY` | （空） | 秘密密钥。必填。遵循相同的文件约定：`S3_SECRET_ACCESS_KEY_FILE`。 |
| `S3_REGION` | `us-east-1` | 存储桶所在区域。 |
| `S3_ENDPOINT` | （空） | MinIO、R2、Backblaze 及其他兼容 S3 的存储的自定义端点。留空表示 AWS。 |
| `S3_FORCE_PATH_STYLE` | `false` | 对于 MinIO 以及其他需要 `endpoint/bucket/key` 而不是虚拟主机寻址的服务，请设为 `true`。 |
| `S3_PREFIX` | （空） | 键前缀，使一个存储桶可以容纳多个实例。 |

### 静态加密 {#encryption-at-rest}

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | （空） | 64 个十六进制字符（32 字节）。用于加密存储在数据库中的敏感设置。任何不是 64 个十六进制字符的值都会在启动时被拒绝。 |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | （空） | 你正在更换掉的旧密钥，格式相同。轮换期间请同时设置两者，以便现有行仍能解密，之后再移除这一个。 |

### 内置模式 {#embedded-mode}

在不设置 `DATABASE_URL` 和 `REDIS_URL` 的情况下运行镜像，它会在容器内启动自己的 PostgreSQL 17 和 Redis，绑定到回环地址，所有数据都放在 `/data` 卷上。这恢复了用于快速开始、家庭实验室以及从 1.x 升级的单命令 `docker run` 体验。它是一条便利路径，而不是生产部署：生产环境请运行带有独立 PostgreSQL 和 Redis 的 3 容器 Compose 栈。内置模式要求以 root 身份运行容器，与任意 UID 运行时（OpenShift、Kubernetes `runAsNonRoot`）不兼容；在这些环境请使用 Compose。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `EMBEDDED` | `auto` | 当 `DATABASE_URL` 和 `REDIS_URL` 都未设置时自动启用。设为 `0` 可禁用它（此时如果没有设置外部的 `DATABASE_URL`/`REDIS_URL`，应用会快速失败，而不是悄悄启动容器内的数据库）。 |
| `REDIS_MAXMEMORY` | `512mb` | 内置 Redis 的内存上限（仅限内置模式）。在 Raspberry Pi 等内存受限的主机上请调低它。 |
| `EMBEDDED_PG_PORT` | `5432` | 内置 PostgreSQL 的回环端口（仅限内置模式）。仅当容器共享的网络中 5432 已被占用时才需要更改，例如 `--network host`。它必须不同于 `EMBEDDED_REDIS_PORT` 且大于 1023，因为 PostgreSQL 以非特权用户身份运行，无法在主机网络上绑定特权端口。 |
| `EMBEDDED_REDIS_PORT` | `6379` | 同上，针对内置 Redis，它同样以非特权用户身份运行。 |
| `EMBEDDED_DB_PASSWORDS` | （空） | 设为 `1` 可在下次启动时为内置 PostgreSQL 角色和 Redis 生成随机密码，保存在 `/data/.embedded-db-secrets` 中。此后通过 TCP 登录就需要这些密码。在由 2.3.0 或更高版本首次创建的卷上，PostgreSQL 超级用户完全无法通过 TCP 登录；在较旧的卷上，数据库所有者就是超级用户，保护它的正是其密码。只要有其他程序共享容器的网络（例如使用 `--network host` 时），就请使用它。对该卷而言它会一直保持开启：即使你取消设置此变量，每次启动仍会使用这些密码；删除 `/data/.embedded-db-secrets` 只会让你得到新密码，或者在变量未设置时导致启动失败。如果容器因其中某个文件损坏而无法启动，请用 `docker run --rm -v <volume>:/data --entrypoint rm snapotter/snapotter:<your tag> -r /data/.embedded-db-secrets/<name>` 删除该文件，然后重新启动容器；下次启动会生成一个新文件。此变量接受 `1`、`0` 或空值，任何其他值都会使启动停止。 |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | 启动时等待内置 Redis 响应 `PING` 的秒数，超时后放弃。超时时容器会停止并记录原因，而不是挂起。取值为 1 到 999999 的整数秒；没有无限制值，因为无限等待正是这个上限要防止的故障。仅当慢速主机触发超时时才需要调高。 |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | 同上，针对内置 PostgreSQL。计时从首次启动的 `initdb` 完成之后开始，因此涵盖的是服务器启动和崩溃恢复，而不是最初的数据库创建。 |

从 1.x 升级：将旧的 `snapotter.db` 放在卷中的 `/data/snapotter.db` 位置，内置模式会在首次启动时把它导入内置 PostgreSQL。导入只运行一次；之后的启动会跳过它。

遥测说明：内置模式与其他配置一样继承镜像的分析默认值。发布的镜像默认开启分析；使用 `--build-arg SNAPOTTER_ANALYTICS=off` 构建、在首次启动前设置 `SNAPOTTER_ANALYTICS_DEFAULT=off`，或使用应用内的管理员退出选项，即可将其禁用。

### 处理限制 {#processing-limits}

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0`（无限制） | 每次上传的最大文件大小，单位为 MB。设为 0 表示无限制。发布的镜像默认为 `0`；从源码构建则从 100 开始。 |
| `MAX_BATCH_SIZE` | `0`（无限制） | 单个批处理请求中的最大文件数。设为 0 表示无限制。发布的镜像默认为 `0`；从源码构建则从 100 开始。 |
| `CONCURRENT_JOBS` | `0`（自动） | 并行运行的批处理作业数。设为 0 则根据可用 CPU 核心数自动检测。 |
| `MAX_MEGAPIXELS` | `0`（无限制） | 允许的最大图像分辨率，单位为百万像素。设为 0 表示无限制。 |
| `MAX_WORKER_THREADS` | `0`（自动） | 图像处理的最大工作线程数。设为 0 则根据可用 CPU 核心数自动检测。 |
| `PROCESSING_TIMEOUT_S` | `0`（无限制） | 对运行 AI 工具的 Python sidecar 的每次调用的超时时间，单位为秒。设为 0 表示不设超时。它不限制图像、PDF 或媒体作业；这些由 `JOB_TIMEOUT_FAST_S` 和 `JOB_TIMEOUT_LONG_S` 负责。 |
| `AI_SIDECAR_IDLE_TIMEOUT` | `600` | Python AI sidecar 和精确 OCR 运行时空闲多少秒后退出并释放内存（预热后分别约 1.3 GB 和 0.7 GB）。两者都会在下一个请求到来时重新启动，因此空闲退出后的第一次 AI 调用需要承担几秒钟的库启动开销。设为 0 可让它们保持运行。默认值与 `AI_SESSION_IDLE_TIMEOUT` 一致，因此已加载的模型不会早于该设置规定的时间被释放。如果你调高 `AI_SESSION_IDLE_TIMEOUT`，请将此值也调高到相同数值。 |
| `JOB_TIMEOUT_FAST_S` | `120` | 快速作业池（图像和文档工具）中单个作业的截止时间，单位为秒。运行时间更长的作业会因超时错误而失败。设为 0 表示不设限制。 |
| `JOB_TIMEOUT_LONG_S` | `7200` | 长时作业池（AI 和媒体工具，以及任何标记为长时间运行的工具）中单个作业的截止时间，单位为秒。设为 0 表示不设限制。均衡和最佳 PDF OCR 会按页数自行延长截止时间（每页 2 分钟和 5 分钟），最长 6 小时，因此大型 PDF 无需调高此值。 |
| `SYNC_WAIT_MS` | `8000` | 工具请求等待其作业的时长，单位为毫秒；超过该时长后，API 停止等待并返回 `202` 和一个可通过 SSE 跟踪的作业 ID。这不会停止作业。设为 0 则无论作业耗时多久都一直等待。 |
| `MAX_PIPELINE_STEPS` | `20` | 管道中的最大步骤数。设为 0 表示不设限制。 |
| `MAX_CANVAS_PIXELS` | `0`（无限制） | 输出图像的最大画布尺寸，单位为像素。设为 0 表示不设限制。 |
| `MAX_SVG_SIZE_MB` | `50` | 清理之前接受的最大 SVG，单位为 MB。`0` 在这里的行为与周围各行不同。它会完全移除解析前的大小上限，而不是将其调高，所以请保持设置此项。 |
| `MAX_PDF_PAGES` | `0`（无限制） | PDF 转图片时的最大 PDF 页数。设为 0 表示无限制。 |
| `MAX_SETTINGS_PAYLOAD_KB` | `64` | 工具请求可携带的 `settings` 字段的最大大小，单位为 KB，按 UTF-8 字节计算。超过限制的请求会收到 `400`。设为 0 表示不设限制。实际的工具设置远小于 64 KB，因此仅当客户端发送异常大的设置时才需要调高此值。 |

### 引擎 {#engines}

SnapOtter 会在容器内的 `$PATH` 上查找每个处理用的二进制文件，所以除非你挂载了自己的构建，否则这些变量保持为空。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `FFMPEG_PATH` | （空） | 视频和音频工具所用的 `ffmpeg` 二进制文件的路径。 |
| `FFPROBE_PATH` | （空） | `ffprobe` 的路径，用于在处理之前读取媒体文件。请将它指向与 `FFMPEG_PATH` 相同的构建。 |
| `QPDF_PATH` | （空） | `qpdf` 的路径，供 PDF 工具使用，并用于检查上传的 PDF。 |
| `SOFFICE_PATH` | （空） | LibreOffice 的 `soffice` 的路径，用于办公文档转换。 |
| `PDFCPU_PATH` | （空） | `pdfcpu` 的路径，部分 PDF 工具会用到。 |
| `GS_PATH` | （空） | Ghostscript 的 `gs` 的路径，供 PDF 工具和 PDF OCR 使用。 |
| `PANDOC_PATH` | （空） | `pandoc` 的路径，用于文档转换。 |
| `SNAPOTTER_FONT_FILE` | （空） | 绘制到视频上的文字所用的字体文件（烧录字幕、视频水印）。留空则使用镜像找到的第一个字体。 |
| `SNAPOTTER_FONT_FAMILY` | （空） | `SNAPOTTER_FONT_FILE` 的字体族名称。留空表示 `Sans`。 |
| `SNAPOTTER_HW_ACCEL` | （空） | 硬件视频编码器系列，`nvenc` 或 `vaapi`。留空则使用软件编码。 |

`SNAPOTTER_HW_ACCEL` 需要带有该编码器系列的 ffmpeg 构建，而镜像中的 ffmpeg 两者都没有。使用镜像自带的二进制文件时，该设置会回退到软件编码，并在启动日志中说明。要使用它，请挂载你自己的 ffmpeg 构建，让 `FFMPEG_PATH` 和 `FFPROBE_PATH` 指向它，并为容器提供 GPU 设备。对于 `nvenc`，还要设置 `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`：镜像只请求 `compute,utility`，如果没有 `video`，NVIDIA 运行时就不会挂载编码库，因此编码器虽然被列出，但每次编码都会失败。不存在或不可执行的路径覆盖项也会在启动日志中点名，在你修正路径或取消设置之前，每个需要该二进制文件的作业都会失败。

发布的 Compose 文件会从 `.env` 传入所有这些变量，所以在那里设置就足够了。

### 清理 {#cleanup}

| 变量 | 默认值 | 说明 |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | 未保存的处理结果（原始上传文件和工具输出）在被自动删除之前保留多长时间。你明确保存到文件库的文件不受影响，会一直保留到你删除为止。 |
| `CLEANUP_INTERVAL_MINUTES` | `60` | 清理作业的运行频率。 |

### 外观 {#appearance}

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DEFAULT_THEME` | `light` | 新会话的默认主题。`light`、`dark` 或 `system`。 |
| `DEFAULT_LOCALE` | `en` | 默认界面语言。 |
| `DEFAULT_TOOL_VIEW` | `sidebar` | 默认工具布局。`sidebar` 或 `fullscreen`。 |

### Docker 权限 {#docker-permissions}

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PUID` | `999` | 以此 UID 运行容器进程。为绑定挂载设置得与宿主机用户一致（`id -u`）。 |
| `PGID` | `999` | 以此 GID 运行容器进程。为绑定挂载设置得与宿主机组一致（`id -g`）。 |

## Docker 示例 {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
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
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
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
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## 卷 {#volumes}

Docker Compose 栈使用四个卷：

- `/data`（app） - AI 模型、Python venv 和用户文件。挂载它可以在重启后保留上传的文件和已安装的 AI 组件包。
- `/tmp/workspace`（app） - 用于存放正在处理的文件的临时存储。它可以是临时性的，但挂载它可以避免填满容器的可写层。
- `SnapOtter-pgdata`（postgres） - PostgreSQL 数据目录。它保存所有关系型数据（用户、设置、管道、作业、审计日志）。可通过 `pg_dump` 或卷快照备份。
- `SnapOtter-redisdata`（redis） - 用于持久化作业队列的 Redis 仅追加文件。
