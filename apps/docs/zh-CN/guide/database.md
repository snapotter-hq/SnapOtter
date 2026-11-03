---
description: "SnapOtter 的 PostgreSQL 数据库架构、表、迁移和备份流程。"
i18n_source_hash: 2150213f21da
i18n_provenance: machine
i18n_output_hash: 72b25076da96
i18n_hash_version: 2
---

# 数据库 {#database}

SnapOtter 使用 PostgreSQL 17 和 [Drizzle ORM](https://orm.drizzle.team/)（pg-core / node-postgres）进行数据持久化。架构定义在 `apps/api/src/db/schema.ts` 中。

连接通过 `DATABASE_URL` 环境变量配置（默认值为 `postgres://snapotter:snapotter@postgres:5432/snapotter`）。在 Docker Compose 中，Postgres 容器把数据存放在名为 `SnapOtter-pgdata` 的命名卷中。请求由一个只能读写行的角色处理，详见下文的[最小权限角色](#least-privilege-roles)。

## 表 {#tables}

### users {#users}

存储用户账户。首次运行时根据 `DEFAULT_USERNAME` 和 `DEFAULT_PASSWORD` 自动创建。

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | uuid | 主键 |
| `username` | varchar | 唯一，必填 |
| `passwordHash` | varchar | scrypt 哈希 |
| `role` | varchar | `admin`、`editor` 或 `user` |
| `mustChangePassword` | boolean | 强制重置密码标志 |
| `createdAt` | timestamp | 创建时间 |
| `updatedAt` | timestamp | 最后更新时间 |

### sessions {#sessions}

活动的登录会话。每一行把一个会话令牌与一个用户关联起来。

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | varchar | 主键（会话令牌） |
| `userId` | uuid | 指向 `users.id` 的外键 |
| `expiresAt` | timestamp | 过期时间 |
| `createdAt` | timestamp | 创建时间 |

### teams {#teams}

用于组织用户的分组。管理员可以把用户分配到团队。

| 列 | 类型 | 说明 |
|--------|------|-------------|
| `id` | uuid | 主键 |
| `name` | varchar（唯一，最多 50 个字符） | 团队名称 |
| `createdAt` | timestamp | 创建时间 |

### api_keys {#api-keys}

用于程序化访问的 API 密钥。原始密钥只在创建时显示一次；只存储哈希。

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | uuid | 主键 |
| `userId` | uuid | 指向 `users.id` 的外键 |
| `keyHash` | varchar | 密钥的 scrypt 哈希 |
| `name` | varchar | 用户提供的标签 |
| `createdAt` | timestamp | 创建时间 |
| `lastUsedAt` | timestamp | 每次经过认证的请求时更新 |

密钥以 `si_` 为前缀，后跟 96 个十六进制字符（48 个随机字节）。

### pipelines {#pipelines}

用户在界面中创建的已保存工具链。

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | uuid | 主键 |
| `name` | varchar | 管道名称 |
| `description` | varchar | 可选描述 |
| `steps` | jsonb | `{ toolId, settings }` 对象数组 |
| `createdAt` | timestamp | 创建时间 |

### user_files {#user-files}

持久文件库。默认情况下，已保存的编辑会作为独立的根行插入（“另存为新文件”：`version` 为 1，`parentId` 为 null，因此原始文件仍然列出），或者在你覆盖原始文件时作为带父级链接的版本插入（设置 `parentId`，`version` 递增，取代原始文件）。`toolChain` 列记录所应用的工具。

| 列 | 类型 | 说明 |
|--------|------|-------------|
| `id` | uuid | 主键 |
| `userId` | uuid | 指向 users 的外键（CASCADE DELETE） |
| `originalName` | varchar | 原始上传文件名 |
| `storedName` | varchar | 磁盘上的文件名 |
| `mimeType` | varchar | MIME 类型 |
| `size` | integer | 文件大小，单位为字节 |
| `width` | integer | 图像宽度，单位为 px |
| `height` | integer | 图像高度，单位为 px |
| `version` | integer | 版本号（1 = 原始） |
| `parentId` | uuid 或 null | 指向 user_files 的外键（父版本） |
| `toolChain` | jsonb | 为生成此版本而按顺序应用的工具 ID |
| `createdAt` | timestamp | 创建时间 |

### jobs {#jobs}

跟踪处理作业，用于进度报告和清理。

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | uuid | 主键 |
| `type` | varchar | 工具或管道标识符 |
| `status` | varchar | `queued`、`processing`、`completed` 或 `failed` |
| `progress` | real | 0.0-1.0 的小数 |
| `inputFiles` | jsonb | 输入文件路径数组 |
| `outputPath` | varchar | 结果文件的路径 |
| `settings` | jsonb | 所用的工具设置 |
| `error` | varchar | 失败时的错误消息 |
| `createdAt` | timestamp | 创建时间 |
| `completedAt` | timestamp | 完成时间 |

### settings {#settings}

服务器范围设置的键值存储，管理员可以在界面中修改。

| 列 | 类型 | 备注 |
|---|---|---|
| `key` | varchar | 主键 |
| `value` | varchar | 设置值 |
| `updatedAt` | timestamp | 最后更新时间 |

### roles {#roles}

带有细粒度权限的自定义角色。

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | uuid | 主键 |
| `name` | varchar | 唯一的角色名称 |
| `description` | varchar | 可选描述 |
| `permissions` | jsonb | 权限字符串数组 |
| `createdAt` | timestamp | 创建时间 |

### audit_log {#audit-log}

与安全相关的操作日志。

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | uuid | 主键 |
| `userId` | uuid | 指向 users 的外键 |
| `action` | varchar | 操作类型 |
| `details` | jsonb | 特定于操作的数据 |
| `createdAt` | timestamp | 操作时间 |

### user_preferences {#user-preferences}

每个用户的界面状态，以偏好名称为键。通过 `PUT /api/v1/preferences` 支撑仪表板上固定的工具。

| 列 | 类型 | 备注 |
|---|---|---|
| `userId` | text | 指向 users 的外键，删除时级联。与 `key` 共同构成主键 |
| `key` | text | 偏好名称。与 `userId` 共同构成主键 |
| `value` | jsonb | 偏好负载 |
| `updatedAt` | timestamp | 最后写入时间 |

## 迁移 {#migrations}

Drizzle 负责架构迁移。迁移文件位于 `apps/api/drizzle/`。开发期间：

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

在生产环境中，待处理的迁移会在启动时自动应用。

## 最小权限角色 {#least-privilege-roles}

两个角色，两项工作。`DATABASE_URL` 负责处理请求，对应用的数据表拥有 `SELECT`、`INSERT`、`UPDATE`、`DELETE` 权限，并对它们的序列拥有 `USAGE` 和 `SELECT` 权限。这就是全部清单。它不能创建或删除表、安装扩展、`TRUNCATE`、读取 `pg_authid`、创建数据库、修改角色，也不能接触存放迁移历史的 `drizzle` 架构。

`DATABASE_MIGRATION_URL` 是拥有特权的那个角色。它在启动期间运行迁移并向运行时角色授权，然后在处理任何请求之前关闭。

这种拆分随 SnapOtter 2.3.0 发布。从该版本起，仓库内的 Compose 文件和一体化镜像都按此方式配置，包括现有安装：启动时，SnapOtter 会在运行时角色缺失时创建它，授权，执行迁移，然后把授权扫描应用到之前就存在的表上。升级不需要手动执行 SQL。

2.2.0 镜像只读取运行时连接字符串，也从不创建第二个角色，所以把拆分后的配置交给它，它永远无法启动：应用日志会显示该角色的密码认证失败，而 Postgres 日志会显示该角色不存在。在将 Compose 文件切换为拆分配置之前，请先把镜像升级到 2.3.0 或更高版本。

将 `DATABASE_MIGRATION_URL` 留空会以单一角色运行，由 `DATABASE_URL` 像拆分之前一样承担两项工作。这是受支持的配置，而不是已弃用的配置。在托管的 Postgres 上这是正确的选择，因为在那里创建角色往往不是你能做的事。

### 外部和托管的 Postgres {#external-and-managed-postgres}

在 RDS、Supabase、Cloud SQL 或你自己运行的任何集群上，这种拆分都是可选的。先创建一次运行时角色：

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

然后把两个连接字符串都交给 SnapOtter，指向相同的主机、端口和数据库：

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

到此为止。SnapOtter 会自己应用授权，并在每次迁移之后重新应用，因此未来版本新增的表无需任何人为它执行 SQL 就会被覆盖。

`DATABASE_MIGRATION_URL` 中的角色必须拥有 SnapOtter 的表，因为只有表的所有者才能对其授权。在现有安装上，这意味着你一直用来运行 SnapOtter 的那个角色，而不是为此新建的角色。如果指向一个不拥有任何东西的新角色，启动会失败，并给出恰好说明这一点的错误。它还需要 `CREATEROLE` 来创建和维护运行时角色，以及创建 `drizzle` 架构的权限。

在两个 URL 中指定同一个角色就等于关闭了拆分，SnapOtter 会在日志中说明这一点，而不是假装没有发生。如果你的服务商没有提供既能拥有这些表又能持有 `CREATEROLE` 的角色，请使用单一角色运行。

### 为什么不去动超级用户位 {#why-the-superuser-bit-is-left-alone}

SnapOtter 从不自行去除某个角色的 `SUPERUSER`。在拆分之前创建的安装上，`snapotter` 是集群中唯一的超级用户，将其降级会让集群没有任何超级用户，只能在服务器停止的情况下通过单用户模式恢复。把长期存在的连接移到受限角色上，才是获得保护的办法。超级用户只在启动的那几秒钟出现在连接上，随后就消失了。

全新的一体化安装从不会遇到这个问题。它们有三个角色：`postgres`（引导用的超级用户，不出现在 SnapOtter 使用的任何连接字符串中）、`snapotter`（`NOSUPERUSER`，拥有数据，只在启动时连接）和 `snapotter_app`（只能操作行，处理请求）。

如果仍要降级较旧的 `snapotter`，请先创建第二个超级用户，并以它登录以确认其可用。然后 `ALTER ROLE snapotter NOSUPERUSER`。

## 备份与恢复 {#backup-and-restore}

关系型数据库位于 Postgres 容器的 `SnapOtter-pgdata` 卷中，而不是应用的 `/data` 卷。

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

两条命令都以所有者 `snapotter` 的身份连接，并且应该继续这样做。运行时角色看不到 `drizzle` 架构，所以以该角色生成的转储是不完整的。`--no-owner` 会让恢复出的对象归运行恢复操作的人所有，因此以所有者身份运行可以让所有权落在授权所期望的位置。在全新集群上有一点要注意：`pg_dump` 带有授权，但不带它们所指名的角色，所以请在恢复之前创建 `snapotter_app`，否则 `--exit-on-error` 会在第一个 `GRANT` 处停止。无论如何，SnapOtter 都会在下次启动时重新应用授权。

此数据库转储不包含 `/data/files` 中保存的库对象，也不包含 Redis 中持久的 BullMQ 状态。请按照[安全与加固](/zh-CN/guide/security#backup-and-recovery)中的协调流程备份并恢复它们。

**冷卷快照**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

不要用 `tar` 复制正在运行的 PostgreSQL 数据目录。Compose 会按项目为卷名加前缀，所以请从 `docker inspect` 或你的存储平台中解析已挂载卷的 ID，而不要假定字面标签 `SnapOtter-pgdata`。

### 从 1.x（SQLite）迁移 {#migrating-from-1-x-sqlite}

从 SnapOtter 1.x 升级有专门的指南：参见[从 1.x 升级到 2.0](./upgrading)。简而言之，复用你现有的 `/data` 卷，2.0 会在首次启动时自动检测并导入 `/data/snapotter.db`（或者设置 `SQLITE_MIGRATE_PATH` 来显式指向它）。请先备份整个 `/data` 卷，而不只是 `snapotter.db`：1.x 使用 SQLite 的 WAL 模式，所以已停止的容器通常会把大部分数据留在 `snapotter.db-wal` 中，而旁边的 `snapotter.db` 几乎是空的。
