---
i18n_source_hash: 9a6abf3fc8ae
i18n_provenance: human
i18n_output_hash: e05e1ec521f8
---
# 从 1.x 升级到 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x 将所有内容存储在单个 SQLite 文件中，并以单容器方式运行。SnapOtter 2.0 使用 PostgreSQL 和 Redis。本指南将带你把 1.x 安装迁移到 2.0 而不丢失数据。

简要版：复用你现有的 `/data` 卷，2.0 会在首次启动时自动导入你的 1.x 数据库。你的用户、已保存的文件、设置、API 密钥和流水线都会一并迁移过来。旧数据库从不会被修改，因此你随时可以回滚。

::: tip 致我们的 1.x 用户
你们中的许多人从第一天起就信任 SnapOtter，你们的反馈塑造了这个版本。2.0 在底层做了大量改动，本指南的存在就是为了让这次迁移不会让你损失任何在意的东西。你的账户、文件、设置、API 密钥和流水线都会平移过来，你的旧数据库从不会被触碰。感谢你与我们一同升级。
:::

## 开始之前：备份整个 `/data` 卷 {#before-you-start-back-up-the-whole-data-volume}

每次都先做这一步。备份**整个** `/data` 卷，而不仅仅是 `snapotter.db` 文件。

原因如下。1.x 以 WAL 模式运行 SQLite，因此一个已停止的 1.x 容器通常会把大部分已提交的数据留在 `snapotter.db-wal` 中，旁边只有一个几乎为空的 `snapotter.db`。仅复制 `snapotter.db` 会抓到一个空数据库，并悄无声息地丢失所有内容。该卷同时携带 `snapotter.db`、`snapotter.db-wal`、`snapotter.db-shm` 以及你的 `files/` 目录，它们必须作为一个整体一起迁移。

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## 先升级到 1.17.2 {#upgrade-to-1-17-2-first}

在迁移到 2.0 之前，先把你的 1.x 安装升级到最新的 1.x 版本（1.17.2）。这能让 1.x 运行它自己的最终 schema 迁移，从而让 2.0 从一个已知且完整的 schema 导入。不支持从更旧的 1.x 直接升级到 2.0。

## 检查你的卷名 {#check-your-volume-name}

只有当 2.0 栈挂载的卷与你的 1.x 安装使用的卷相同时，导入器才能看到你的数据。Docker 卷名区分大小写，较旧的 README 片段用的是小写的 `snapotter-data`，而 Compose 文件用的是 `SnapOtter-data`。确认你用的是哪一个：

```bash
docker volume ls | grep -i snapotter
```

在你的 2.0 配置中使用那个确切的名称。

## 路径 A：单容器（最快） {#path-a-single-container-quickest}

如果你用单个 `docker run` 运行 SnapOtter，那就继续这么做。当你不设置 `DATABASE_URL` 或 `REDIS_URL` 时，2.0 会在容器内启动一个内嵌的 PostgreSQL 和 Redis，并在首次启动时自动检测并导入 `/data/snapotter.db`。

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

留意日志中类似这样的一行：

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

就这样。用你现有的凭据登录即可。

## 路径 B：Compose（生产环境推荐） {#path-b-compose-recommended-for-production}

2.0 Compose 栈运行三个服务（应用、Postgres、Redis）。为应用服务复用你的 1.x `/data` 卷。应用会自动检测 `/data/snapotter.db` 并在首次启动时将其导入 Postgres。

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

如果你更想显式指向旧数据库，设置 `SQLITE_MIGRATE_PATH=/data/snapotter.db`。显式路径始终优先于自动检测。

## 先预览导入（可选） {#preview-the-import-first-optional}

若想在不写入任何内容的情况下准确查看将会导入什么，可针对你的数据库文件运行一次 dry run：

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

它会打印每个表的行数、在磁盘上找到的已保存库文件数量，以及任何将被规范化的任务状态。它无需运行中的 Postgres。

## 哪些会迁移，哪些不会 {#what-carries-over-and-what-does-not}

会迁移的：

- 用户，以及登录能力。密码哈希保持不变，因此相同的用户名和密码仍然有效。
- 团队、设置（包括你的实例标识）、角色、API 密钥（它们继续有效）以及已保存的流水线。
- 任务历史记录。
- 你已保存的文件库，包括记录和实际文件，因为 `/data/files` 在卷上得到保留。

不会迁移的：

- 登录会话。升级后每个人都需要重新登录一次。凭据保持不变，因此这只是一次性重新登录，仅此而已。
- 旧处理任务的输入和输出文件。它们存放在临时工作区中，按设计已被清除。任务历史记录仍然保留。
- 来自 1.x 的每用户分析同意标记，它在 2.0 中没有对应项（2.0 的分析是实例级设置）。

## 关闭导入 {#turning-the-import-off}

如果即便卷上存在 `snapotter.db`，你也刻意想要一个全新的数据库，请设置 `SQLITE_MIGRATE_PATH=off`。

## 如果 2.0 实例中已有数据 {#if-you-already-have-data-in-the-2-0-instance}

导入器只会在空数据库上运行。如果你全新启动了 2.0（创建了数据），随后又挂载了一个旧的 `snapotter.db`，2.0 会检测到它但不会导入，因为合并两个数据集可能会在 ID 上冲突。你会在日志中看到一条警告。要导入 1.x 数据，你需要一个空实例：

- 如果 2.0 实例只包含默认管理员（你其实还没真正使用过它），停止栈，移除 Postgres 卷（`SnapOtter-pgdata`），然后在旧的 `/data` 存在的情况下再次启动。它会干净地导入。这只会抹掉一次性的 Postgres 数据，而不是你的 1.x 数据库。
- 如果 2.0 实例包含你想保留的真实数据，那这两个数据集无法自动合并。请导出你需要的内容，并将 1.x 数据导入到一个独立的全新部署中。

## 回滚 {#rolling-back}

升级从不会修改或删除你的 1.x `snapotter.db`。如果你需要回退到 1.x，针对同一个卷重新部署 1.x 镜像即可。升级后你在 2.0 中创建的任何内容都存在于 Postgres 中，不会出现在 1.x 数据库里，所以如果打算回滚，请尽早进行。
