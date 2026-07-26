---
description: "所有 SnapOtter 环境变量及其默认值。配置认证、存储、AI 模型、分析等。"
i18n_source_hash: 25970c776f7c
i18n_provenance: human
i18n_output_hash: a0f2d2b10467
i18n_hash_version: 2
---

# 配置 {#configuration}

所有配置均通过环境变量完成。每个变量都有合理的默认值，因此 SnapOtter 无需设置任何变量即可开箱即用。

## 环境变量 {#environment-variables}

### 服务器 {#server}

| 变量 | 默认值 | 描述 |
|---|---|---|
| `PORT` | `1349` | 服务器监听的端口。 |
| `RATE_LIMIT_PER_MIN` | `1000` | 每个 IP 每分钟的最大请求数。设为 0 可禁用限流。 |
| `CORS_ORIGIN` | （空） | 用于 CORS 的逗号分隔的允许来源，留空则仅限同源。 |
| `LOG_LEVEL` | `info` | 日志详细程度。取值之一：`fatal`、`error`、`warn`、`info`、`debug`、`trace`。 |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | 允许哪些对端通过 `X-Forwarded-For` 设置客户端 IP。默认值只相信来自私有网络的对端，因此 Docker 网络或局域网中的反向代理会被信任，而公网客户端伪造的头不会。只有当你自己控制的代理以公网地址位于前端时，才设为 `true`。 |

### 认证 {#authentication}

下面两个布尔值只接受 `true` 和 `false`。其他任何取值，比如 `1`、`yes` 或 `on`，都会校验失败，服务器会在开始监听之前退出。

| 变量 | 默认值 | 描述 |
|---|---|---|
| `AUTH_ENABLED` | `true` | 要求登录。设为 `false` 可在完全没有账户的情况下运行，此时每个请求都拥有管理员权限，所以只应在可信网络中这样做。 |
| `DEFAULT_USERNAME` | `admin` | 初始管理员账户的用户名。仅在首次运行时使用。 |
| `DEFAULT_PASSWORD` | `admin` | 初始管理员账户的密码。首次登录后请更改。 |
| `MAX_USERS` | `0`（无限制） | 已注册用户账户的最大数量。设为 0 表示无限制。 |
| `SESSION_DURATION_HOURS` | `168` | 登录会话的存续时长（小时）（默认为 7 天）。 |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | 设为 `true` 可跳过首次登录时的强制改密提示。 |

### 存储 {#storage}

| 变量 | 默认值 | 描述 |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` 或 `s3`。S3 和 MinIO 需要带有 s3_storage 功能的许可证，以及下面的 `S3_*` 变量。 |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL 连接字符串。Compose 栈会把它指向自己的 `postgres` 服务；把它（连同 `REDIS_URL`）留作未设置即可进入内嵌模式。 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 连接字符串（用于 BullMQ 作业队列）。Compose 会把它指向自己的 `redis` 服务。 |
| `WORKSPACE_PATH` | `./tmp/workspace` | 处理期间临时文件的目录。会自动清理。镜像将其设为 `/tmp/workspace`。 |
| `FILES_STORAGE_PATH` | `./data/files` | 持久化用户文件（上传的图像、已保存的结果）的目录。镜像将其设为 `/data/files`。 |

### S3 对象存储 {#s3-object-storage}

仅在 `STORAGE_MODE=s3` 时才会读取。三个必填项中缺少任何一个，启动都会失败，并指出你漏掉的变量名。

| 变量 | 默认值 | 描述 |
|---|---|---|
| `S3_BUCKET` | （空） | 存放上传文件和输出的存储桶。必填。 |
| `S3_ACCESS_KEY_ID` | （空） | 访问密钥。必填。在容器中也可以改用 `S3_ACCESS_KEY_ID_FILE` 挂载它。 |
| `S3_SECRET_ACCESS_KEY` | （空） | 私有密钥。必填。同样的文件约定：`S3_SECRET_ACCESS_KEY_FILE`。 |
| `S3_REGION` | `us-east-1` | 存储桶所在区域。 |
| `S3_ENDPOINT` | （空） | 供 MinIO、R2、Backblaze 及其他 S3 兼容存储使用的自定义端点。留空表示 AWS。 |
| `S3_FORCE_PATH_STYLE` | `false` | 对 MinIO 以及其他需要 `endpoint/bucket/key` 而非虚拟主机寻址的存储，设为 `true`。 |
| `S3_PREFIX` | （空） | 键前缀，可让一个存储桶容纳多个实例。 |

### 静态数据加密 {#encryption-at-rest}

| 变量 | 默认值 | 描述 |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | （空） | 64 个十六进制字符（32 字节）。用于加密数据库中存储的敏感设置。不是 64 个十六进制字符的值会在启动时被拒绝。 |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | （空） | 你正在轮换掉的旧密钥，格式相同。轮换期间同时设置两者，让已有数据行仍能解密，之后再移除这一个。 |

### 内嵌模式 {#embedded-mode}

在既没有 `DATABASE_URL` 也没有 `REDIS_URL` 的情况下运行镜像，它会在容器内启动自己的 PostgreSQL 17 和 Redis，绑定到 loopback，所有数据都在 `/data` 卷上。这恢复了用于快速开始、homelab 以及从 1.x 升级的单命令 `docker run` 体验。它是一条便利路径，而非生产部署：生产环境请运行带独立 PostgreSQL 和 Redis 的 3 容器 Compose 栈。内嵌模式需要以 root 运行容器，且与任意 UID 运行时（OpenShift、Kubernetes `runAsNonRoot`）不兼容；在那些环境中请使用 Compose。

| 变量 | 默认值 | 描述 |
|---|---|---|
| `EMBEDDED` | `auto` | 当 `DATABASE_URL` 和 `REDIS_URL` 均未设置时自动启用。设为 `0` 可禁用（此时若未设置外部的 `DATABASE_URL`/`REDIS_URL`，应用会快速失败，而不是悄悄启动一个容器内数据库）。 |
| `REDIS_MAXMEMORY` | `512mb` | 内嵌 Redis 的内存上限（仅限内嵌模式）。在树莓派等内存受限的主机上可将其调低。 |

从 1.x 升级：将旧的 `snapotter.db` 放到卷中的 `/data/snapotter.db`，内嵌模式会在首次启动时将其导入内嵌的 PostgreSQL。导入只运行一次；之后的启动会跳过它。

遥测说明：内嵌模式和其他任何配置一样，继承镜像的分析默认值。已发布镜像默认开启分析；使用 `--build-arg SNAPOTTER_ANALYTICS=off` 构建，或使用应用内的管理员选择退出，即可将其禁用。

### 处理限制 {#processing-limits}

| 变量 | 默认值 | 描述 |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0`（无限制） | 每次上传的最大文件大小（MB）。设为 0 表示无限制。已发布镜像出厂即为 `0`；源码构建的起点是 100。 |
| `MAX_BATCH_SIZE` | `0`（无限制） | 单个批处理请求中的最大文件数。设为 0 表示无限制。已发布镜像出厂即为 `0`；源码构建的起点是 100。 |
| `CONCURRENT_JOBS` | `0`（自动） | 并行运行的批处理作业数量。设为 0 可根据可用 CPU 核心自动检测。 |
| `MAX_MEGAPIXELS` | `0`（无限制） | 允许的最大图像分辨率（百万像素）。设为 0 表示无限制。 |
| `MAX_WORKER_THREADS` | `0`（自动） | 图像处理的最大工作线程数。设为 0 可根据可用 CPU 核心自动检测。 |
| `PROCESSING_TIMEOUT_S` | `0`（无限制） | 每个请求的最大处理时间（秒）。设为 0 表示无超时。 |
| `MAX_PIPELINE_STEPS` | `20` | 一个流水线中的最大步骤数。设为 0 表示无限制。 |
| `MAX_CANVAS_PIXELS` | `0`（无限制） | 输出图像的最大画布尺寸（像素）。设为 0 表示无限制。 |
| `MAX_SVG_SIZE_MB` | `50` | 净化处理之前所接受的最大 SVG 大小（MB）。这里的 `0` 与相邻各行的含义不同：它不是把上限调高，而是彻底移除解析前的大小限制，所以这一项请保持设置。 |
| `MAX_PDF_PAGES` | `0`（无限制） | PDF-to-image 转换的最大 PDF 页数。设为 0 表示无限制。 |

### 清理 {#cleanup}

| 变量 | 默认值 | 描述 |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | 未保存的处理结果（原始上传和工具输出）在自动删除前保留的时长。你显式保存到 Files 库的文件不受影响，会一直保留直到你删除它们。 |
| `CLEANUP_INTERVAL_MINUTES` | `60` | 清理作业运行的频率。 |

### 外观 {#appearance}

| 变量 | 默认值 | 描述 |
|---|---|---|
| `DEFAULT_THEME` | `light` | 新会话的默认主题。`light`、`dark` 或 `system`。 |
| `DEFAULT_LOCALE` | `en` | 默认界面语言。 |
| `DEFAULT_TOOL_VIEW` | `sidebar` | 默认工具布局。`sidebar` 或 `fullscreen`。 |

### Docker 权限 {#docker-permissions}

| 变量 | 默认值 | 描述 |
|---|---|---|
| `PUID` | `999` | 以此 UID 运行容器进程。设为与你的宿主用户匹配以用于 bind mount（`id -u`）。 |
| `PGID` | `999` | 以此 GID 运行容器进程。设为与你的宿主用户组匹配以用于 bind mount（`id -g`）。 |

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
      POSTGRES_PASSWORD: snapotter     # 针对非本地部署更改此设置
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

- `/data`（app）- AI 模型、Python venv 和用户文件。挂载它以在重启后保留已上传文件和已安装的 AI 组件包。
- `/tmp/workspace`（app）- 正在处理的文件的临时存储。它可以是临时的，但挂载它可以避免填满容器的可写层。
- `SnapOtter-pgdata`（postgres）- PostgreSQL 数据目录。它保存所有关系型数据（用户、设置、流水线、作业、审计日志）。通过 `pg_dump` 或卷快照进行备份。
- `SnapOtter-redisdata`（redis）- 用于持久化作业队列的 Redis 只追加文件（append-only file）。
