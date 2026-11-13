---
i18n_source_hash: 959cca5c298c
i18n_provenance: machine
i18n_output_hash: 850741ef21d4
i18n_hash_version: 2
---
# 从 1.x 升级到 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x 将所有内容存储在单个 SQLite 文件中，并作为一个容器运行。SnapOtter 2.0 使用 PostgreSQL 和 Redis。本指南将带你完成把 1.x 安装迁移到 2.0 且不丢失数据的全过程。

简短版本：重复使用现有的 `/data` 卷，2.0 会在首次启动时自动导入你的 1.x 数据库。你的用户、已保存的文件、设置、API 密钥和流水线都会迁移过来。旧数据库绝不会被修改，因此你随时可以回滚。

::: tip 致 1.x 用户的一段话
你们中的许多人从第一天起就信任 SnapOtter，你们的反馈塑造了这个版本。2.0 在底层做了很多改动，而这份指南的存在，就是为了让这次迁移不会让你损失任何在意的东西。你的账户、文件、设置、API 密钥和流水线都会迁移过来，你的旧数据库也不会被触碰。感谢你与我们一起升级。
:::

## 开始之前：备份整个 `/data` 卷 {#before-you-start-back-up-the-whole-data-volume}

每次都要先做这一步。请备份**整个** `/data` 卷，而不仅仅是 `snapotter.db` 文件。

原因如下。1.x 以 WAL 模式运行 SQLite，因此已停止的 1.x 容器通常会把大部分已提交的数据留在 `snapotter.db-wal` 中，而旁边的 `snapotter.db` 几乎是空的。只复制 `snapotter.db` 得到的是一个空数据库，并会悄无声息地丢失所有内容。该卷同时包含 `snapotter.db`、`snapotter.db-wal`、`snapotter.db-shm` 和你的 `files/` 目录，它们必须作为一个整体一起迁移。

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## 先升级到 1.17.2 {#upgrade-to-1-17-2-first}

在迁移到 2.0 之前，请先将你的 1.x 安装升级到最新的 1.x 版本（1.17.2）。这样可以让 1.x 运行它自己的最终模式迁移，使 2.0 从已知的完整模式导入。不支持从更旧的 1.x 直接升级到 2.0。

## 检查你的卷名 {#check-your-volume-name}

只有当 2.0 堆栈挂载的卷与你的 1.x 安装所用的卷相同时，导入程序才能看到你的数据。Docker 卷名区分大小写，较早的 README 片段使用小写的 `snapotter-data`，而 Compose 文件使用 `SnapOtter-data`。请确认你使用的是哪一个：

```bash
docker volume ls | grep -i snapotter
```

在你的 2.0 配置中使用这个确切的名称。

## 方案 A：单个容器（最快）{#path-a-single-container-quickest}

如果你使用单个 `docker run` 运行 SnapOtter，请继续这样做。当你没有设置 `DATABASE_URL` 或 `REDIS_URL` 时，2.0 会在容器内启动内嵌的 PostgreSQL 和 Redis，并在首次启动时自动检测并导入 `/data/snapotter.db`。

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

在日志中留意类似这样的一行：

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

就这样。使用你现有的凭据登录即可。

## 方案 B：Compose（推荐用于生产环境）{#path-b-compose-recommended-for-production}

2.0 的 Compose 堆栈运行三个服务（app、Postgres、Redis）。为 app 服务重复使用你的 1.x `/data` 卷。应用会自动检测 `/data/snapotter.db`，并在首次启动时将其导入 Postgres。

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

如果你更愿意显式指向旧数据库，请设置 `SQLITE_MIGRATE_PATH=/data/snapotter.db`。显式路径始终优先于自动检测。

## 先预览导入（可选）{#preview-the-import-first-optional}

若想在不写入任何内容的情况下查看究竟会导入什么，请针对你的数据库文件执行一次试运行：

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

它会输出每个表的行数、在磁盘上找到的已保存库文件数量，以及它将规范化的所有任务状态。它不需要运行中的 Postgres。

## 哪些会迁移，哪些不会 {#what-carries-over-and-what-does-not}

会迁移的内容：

- 用户以及登录的能力。密码哈希保持不变，因此相同的用户名和密码仍然有效。
- 团队、设置（包括你的实例标识）、角色、API 密钥（它们会继续有效）以及已保存的流水线。
- 任务历史记录。
- 你已保存的文件库，包括记录和实际文件，因为 `/data/files` 会保留在卷上。

不会迁移的内容：

- 登录会话。升级后每个人都需要重新登录一次。凭据没有改变，所以只需再登录一次，仅此而已。
- 旧处理任务的输入和输出文件。它们存放在临时工作区中，按设计已经消失。任务历史记录仍然保留。
- 1.x 中每个用户的分析同意标志，它们在 2.0 中没有对应项（2.0 的分析是实例级别的设置）。

## 关闭导入 {#turning-the-import-off}

如果卷上存在 `snapotter.db`，但你有意想要一个全新的数据库，请设置 `SQLITE_MIGRATE_PATH=off`。

## 如果你的 2.0 实例中已经有数据 {#if-you-already-have-data-in-the-2-0-instance}

导入程序只会导入到空数据库中。如果你以全新方式启动了 2.0（并创建了数据），之后才挂载旧的 `snapotter.db`，2.0 会检测到它，但不会导入，因为合并两个数据集可能会产生 ID 冲突。你会在日志中看到一条警告。要导入 1.x 数据，你需要一个空实例：

- 如果 2.0 实例只有默认管理员（你并没有真正使用过它），请停止堆栈，删除 Postgres 卷（`SnapOtter-pgdata`），然后在旧的 `/data` 存在的情况下重新启动。它会干净地导入。这只会清除用完即弃的 Postgres 数据，而不会影响你的 1.x 数据库。
- 如果 2.0 实例中有你想保留的真实数据，则这两个数据集无法自动合并。请导出你需要的内容，并将 1.x 数据导入到另一个全新的部署中。

## 回滚 {#rolling-back}

升级绝不会修改或删除你的 1.x `snapotter.db`。如果你需要回到 1.x，请针对同一个卷重新部署 1.x 镜像。你在升级后于 2.0 中创建的任何内容都存在于 Postgres 中，不会出现在 1.x 数据库里，所以如果打算回滚，请尽快进行。
