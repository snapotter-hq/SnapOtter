---
description: "SnapOtter 的 PostgreSQL 数据库架构、表、迁移和备份流程。"
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: 127adc94ef4c
i18n_hash_version: 2
---

# 数据库 {#database}

SnapOtter 使用 PostgreSQL 17 配合 [Drizzle ORM](https://orm.drizzle.team/)（pg-core / node-postgres）进行数据持久化。架构定义在 `apps/api/src/db/schema.ts`。

连接通过 `DATABASE_URL` 环境变量配置（默认为 `postgres://snapotter:snapotter@postgres:5432/snapotter`）。在 Docker Compose 中，Postgres 容器将其数据存储在名为 `SnapOtter-pgdata` 的卷中。

## 表 {#tables}

### users {#users}

存储用户账户。首次运行时会根据 `DEFAULT_USERNAME` 和 `DEFAULT_PASSWORD` 自动创建。

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | uuid | 主键 |
| `username` | varchar | 唯一，必填 |
| `passwordHash` | varchar | scrypt 哈希 |
| `role` | varchar | `admin`、`editor` 或 `user` |
| `mustChangePassword` | boolean | 强制重置密码标志 |
| `createdAt` | timestamp | 创建时间 |
| `updatedAt` | timestamp | 上次更新时间 |

### sessions {#sessions}

活动登录会话。每一行将一个会话令牌与一个用户关联。

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | varchar | 主键（会话令牌） |
| `userId` | uuid | 指向 `users.id` 的外键 |
| `expiresAt` | timestamp | 过期时间 |
| `createdAt` | timestamp | 创建时间 |

### teams {#teams}

用于组织用户的分组。管理员可以将用户分配到团队。

| 列 | 类型 | 描述 |
|--------|------|-------------|
| `id` | uuid | 主键 |
| `name` | varchar（唯一，最多 50 个字符） | 团队名称 |
| `createdAt` | timestamp | 创建时间 |

### api_keys {#api-keys}

用于程序化访问的 API 密钥。原始密钥仅在创建时显示一次；仅存储其哈希。

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | uuid | 主键 |
| `userId` | uuid | 指向 `users.id` 的外键 |
| `keyHash` | varchar | 密钥的 scrypt 哈希 |
| `name` | varchar | 用户提供的标签 |
| `createdAt` | timestamp | 创建时间 |
| `lastUsedAt` | timestamp | 每次经过身份验证的请求时更新 |

密钥以 `si_` 为前缀，后跟 96 个十六进制字符（48 个随机字节）。

### pipelines {#pipelines}

用户在 UI 中创建的已保存工具链。

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | uuid | 主键 |
| `name` | varchar | 流水线名称 |
| `description` | varchar | 可选描述 |
| `steps` | jsonb | `{ toolId, settings }` 对象数组 |
| `createdAt` | timestamp | 创建时间 |

### user_files {#user-files}

持久化文件库。默认情况下，保存的编辑会作为一个独立的根行插入（“保存为新文件”：`version` 为 1、`parentId` 为 null，因此原文件仍会保留在列表中）；而当你覆盖原文件时，则作为一个与父行链接的版本（设置 `parentId`、递增 `version`，并取代原文件）。`toolChain` 列记录所应用的工具。

| 列 | 类型 | 描述 |
|--------|------|-------------|
| `id` | uuid | 主键 |
| `userId` | uuid | 指向 users 的外键（CASCADE DELETE） |
| `originalName` | varchar | 原始上传文件名 |
| `storedName` | varchar | 磁盘上的文件名 |
| `mimeType` | varchar | MIME 类型 |
| `size` | integer | 文件大小（字节） |
| `width` | integer | 图像宽度（像素） |
| `height` | integer | 图像高度（像素） |
| `version` | integer | 版本号（1 = 原始版本） |
| `parentId` | uuid 或 null | 指向 user_files 的外键（父版本） |
| `toolChain` | jsonb | 按顺序应用以生成此版本的工具 ID |
| `createdAt` | timestamp | 创建时间 |

### jobs {#jobs}

跟踪处理作业，用于进度报告和清理。

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | uuid | 主键 |
| `type` | varchar | 工具或流水线标识符 |
| `status` | varchar | `queued`、`processing`、`completed` 或 `failed` |
| `progress` | real | 0.0-1.0 的分数 |
| `inputFiles` | jsonb | 输入文件路径数组 |
| `outputPath` | varchar | 结果文件的路径 |
| `settings` | jsonb | 所用的工具设置 |
| `error` | varchar | 失败时的错误消息 |
| `createdAt` | timestamp | 创建时间 |
| `completedAt` | timestamp | 完成时间 |

### settings {#settings}

用于存储全服务器范围设置的键值存储，管理员可从 UI 更改这些设置。

| 列 | 类型 | 备注 |
|---|---|---|
| `key` | varchar | 主键 |
| `value` | varchar | 设置值 |
| `updatedAt` | timestamp | 上次更新时间 |

### roles {#roles}

具有细粒度权限的自定义角色。

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | uuid | 主键 |
| `name` | varchar | 唯一的角色名称 |
| `description` | varchar | 可选描述 |
| `permissions` | jsonb | 权限字符串数组 |
| `createdAt` | timestamp | 创建时间 |

### audit_log {#audit-log}

安全相关的操作日志。

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | uuid | 主键 |
| `userId` | uuid | 指向 users 的外键 |
| `action` | varchar | 操作类型 |
| `details` | jsonb | 特定于操作的数据 |
| `createdAt` | timestamp | 操作时间 |

### user_preferences {#user-preferences}

按偏好名称存储的每用户界面状态。首页的已固定工具通过 `PUT /api/v1/preferences` 写入这里。

| 列 | 类型 | 备注 |
|---|---|---|
| `userId` | text | 指向 users 的外键，级联删除。与 `key` 共同构成主键 |
| `key` | text | 偏好名称。与 `userId` 共同构成主键 |
| `value` | jsonb | 偏好内容 |
| `updatedAt` | timestamp | 最后写入时间 |

## 迁移 {#migrations}

Drizzle 负责处理架构迁移。迁移文件位于 `apps/api/drizzle/`。开发期间：

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

在生产环境中，待处理的迁移会在启动时自动应用。

## 备份和恢复{#backup-and-restore}

关系数据库位于 Postgres 容器的 `SnapOtter-pgdata` 卷中，而不是应用程序的 `/data` 卷中。

**带验证的逻辑备份（推荐）**

```bash
# Dump into PostgreSQL's portable custom archive format
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore into a fresh/disposable target first and fail on the first SQL error
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

此数据库转储不包含以 `/data/files` 保存的库对象或 Redis 中的持久 BullMQ 状态。使用[安全与强化](/zh-CN/guide/security#backup-and-recovery) 中的协调程序备份和恢复这些内容。

**冷卷快照**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

不要使用 `tar` 复制实时 PostgreSQL 数据目录。按项目编写卷名称前缀，因此从 `docker inspect` 或您的存储平台解析已安装的卷 ID，而不是假设文字标签 `SnapOtter-pgdata`。

### 从 1.x（SQLite）迁移 {#migrating-from-1-x-sqlite}

从 SnapOtter 1.x 升级有专门的指南：参见 [从 1.x 升级到 2.0](./upgrading)。简而言之，复用你现有的 `/data` 卷，2.0 会在首次启动时自动检测并导入 `/data/snapotter.db`（或设置 `SQLITE_MIGRATE_PATH` 明确指向它）。请先备份整个 `/data` 卷，而不仅仅是 `snapotter.db`：1.x 使用 SQLite WAL 模式，因此一个已停止的容器往往会把大部分数据留在 `snapotter.db-wal` 中，旁边则是一个几乎为空的 `snapotter.db`。
