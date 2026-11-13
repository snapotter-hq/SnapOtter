---
description: "SnapOtter 的 PostgreSQL 資料庫結構描述、資料表、遷移與備份程序。"
i18n_source_hash: 2150213f21da
i18n_provenance: machine
i18n_output_hash: 41d32b473f82
i18n_hash_version: 2
---

# 資料庫 {#database}

SnapOtter 使用 PostgreSQL 17 搭配 [Drizzle ORM](https://orm.drizzle.team/)（pg-core / node-postgres）進行資料持久化。結構描述定義於 `apps/api/src/db/schema.ts`。

連線透過 `DATABASE_URL` 環境變數設定（預設為 `postgres://snapotter:snapotter@postgres:5432/snapotter`）。在 Docker Compose 中，Postgres 容器將其資料存放在名為 `SnapOtter-pgdata` 的具名磁碟區。請求由只能讀寫資料列的角色處理，詳見下方的[最小權限角色](#least-privilege-roles)。

## 資料表 {#tables}

### users {#users}

儲存使用者帳號。首次執行時會依 `DEFAULT_USERNAME` 與 `DEFAULT_PASSWORD` 自動建立。

| 欄位 | 型別 | 備註 |
|---|---|---|
| `id` | uuid | 主鍵 |
| `username` | varchar | 唯一，必填 |
| `passwordHash` | varchar | scrypt 雜湊 |
| `role` | varchar | `admin`、`editor` 或 `user` |
| `mustChangePassword` | boolean | 強制重設密碼旗標 |
| `createdAt` | timestamp | 建立時間 |
| `updatedAt` | timestamp | 最後更新時間 |

### sessions {#sessions}

有效的登入工作階段。每一列將一個工作階段權杖對應到一位使用者。

| 欄位 | 型別 | 備註 |
|---|---|---|
| `id` | varchar | 主鍵（工作階段權杖） |
| `userId` | uuid | 指向 `users.id` 的外部索引鍵 |
| `expiresAt` | timestamp | 到期時間 |
| `createdAt` | timestamp | 建立時間 |

### teams {#teams}

用於組織使用者的群組。管理員可以將使用者指派到團隊。

| 欄位 | 型別 | 說明 |
|--------|------|-------------|
| `id` | uuid | 主鍵 |
| `name` | varchar（唯一，最多 50 個字元） | 團隊名稱 |
| `createdAt` | timestamp | 建立時間 |

### api_keys {#api-keys}

供程式化存取使用的 API 金鑰。原始金鑰僅在建立時顯示一次，資料庫只儲存其雜湊。

| 欄位 | 型別 | 備註 |
|---|---|---|
| `id` | uuid | 主鍵 |
| `userId` | uuid | 指向 `users.id` 的外部索引鍵 |
| `keyHash` | varchar | 金鑰的 scrypt 雜湊 |
| `name` | varchar | 使用者提供的標籤 |
| `createdAt` | timestamp | 建立時間 |
| `lastUsedAt` | timestamp | 每次通過驗證的請求都會更新 |

金鑰以 `si_` 為前綴，後接 96 個十六進位字元（48 個隨機位元組）。

### pipelines {#pipelines}

使用者在 UI 中建立並儲存的工具鏈。

| 欄位 | 型別 | 備註 |
|---|---|---|
| `id` | uuid | 主鍵 |
| `name` | varchar | 管線名稱 |
| `description` | varchar | 選填的說明 |
| `steps` | jsonb | `{ toolId, settings }` 物件的陣列 |
| `createdAt` | timestamp | 建立時間 |

### user_files {#user-files}

持久性檔案庫。儲存的編輯結果預設會作為獨立的根資料列插入（「另存新檔」：`version` 為 1、`parentId` 為 null，因此原始檔案仍會列出），或在您覆寫原始檔案時，作為與上一版連結的版本插入（設定 `parentId`、`version` 遞增，並取代原檔）。`toolChain` 欄位記錄所套用的工具。

| 欄位 | 型別 | 說明 |
|--------|------|-------------|
| `id` | uuid | 主鍵 |
| `userId` | uuid | 指向 users 的外部索引鍵（CASCADE DELETE） |
| `originalName` | varchar | 原始上傳檔名 |
| `storedName` | varchar | 磁碟上的檔名 |
| `mimeType` | varchar | MIME 類型 |
| `size` | integer | 檔案大小（位元組） |
| `width` | integer | 圖片寬度（像素） |
| `height` | integer | 圖片高度（像素） |
| `version` | integer | 版本編號（1 = 原始檔案） |
| `parentId` | uuid 或 null | 指向 user_files 的外部索引鍵（上一版） |
| `toolChain` | jsonb | 依序套用以產生此版本的工具 ID |
| `createdAt` | timestamp | 建立時間 |

### jobs {#jobs}

追蹤處理工作，用於進度回報與清理。

| 欄位 | 型別 | 備註 |
|---|---|---|
| `id` | uuid | 主鍵 |
| `type` | varchar | 工具或管線識別碼 |
| `status` | varchar | `queued`、`processing`、`completed` 或 `failed` |
| `progress` | real | 0.0-1.0 的比例 |
| `inputFiles` | jsonb | 輸入檔案路徑的陣列 |
| `outputPath` | varchar | 結果檔案的路徑 |
| `settings` | jsonb | 所用的工具設定 |
| `error` | varchar | 失敗時的錯誤訊息 |
| `createdAt` | timestamp | 建立時間 |
| `completedAt` | timestamp | 完成時間 |

### settings {#settings}

儲存伺服器全域設定的鍵值儲存區，管理員可從 UI 變更。

| 欄位 | 型別 | 備註 |
|---|---|---|
| `key` | varchar | 主鍵 |
| `value` | varchar | 設定值 |
| `updatedAt` | timestamp | 最後更新時間 |

### roles {#roles}

具備細粒度權限的自訂角色。

| 欄位 | 型別 | 備註 |
|---|---|---|
| `id` | uuid | 主鍵 |
| `name` | varchar | 唯一的角色名稱 |
| `description` | varchar | 選填的說明 |
| `permissions` | jsonb | 權限字串的陣列 |
| `createdAt` | timestamp | 建立時間 |

### audit_log {#audit-log}

與安全性相關的操作日誌。

| 欄位 | 型別 | 備註 |
|---|---|---|
| `id` | uuid | 主鍵 |
| `userId` | uuid | 指向 users 的外部索引鍵 |
| `action` | varchar | 操作類型 |
| `details` | jsonb | 該操作專屬的資料 |
| `createdAt` | timestamp | 操作時間 |

### user_preferences {#user-preferences}

每位使用者的 UI 狀態，以偏好設定名稱為鍵。儀表板上釘選的工具即透過 `PUT /api/v1/preferences` 儲存於此。

| 欄位 | 型別 | 備註 |
|---|---|---|
| `userId` | text | 指向 users 的外部索引鍵，刪除時連鎖刪除。與 `key` 共同組成主鍵 |
| `key` | text | 偏好設定名稱。與 `userId` 共同組成主鍵 |
| `value` | jsonb | 偏好設定內容 |
| `updatedAt` | timestamp | 最後寫入時間 |

## 遷移 {#migrations}

結構描述的遷移由 Drizzle 處理。遷移檔案位於 `apps/api/drizzle/`。開發期間：

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

在正式環境中，待處理的遷移會於啟動時自動套用。

## 最小權限角色 {#least-privilege-roles}

兩個角色，各司其職。`DATABASE_URL` 負責處理請求，對應用程式的資料表擁有 `SELECT`、`INSERT`、`UPDATE`、`DELETE` 權限，並對其序列擁有 `USAGE` 與 `SELECT` 權限。權限僅限於此。它無法建立或刪除資料表、安裝擴充功能、`TRUNCATE`、讀取 `pg_authid`、建立資料庫、修改角色，也無法存取存放遷移紀錄的 `drizzle` 結構描述。

`DATABASE_MIGRATION_URL` 是具備特權的角色。它在啟動期間執行遷移並授權給執行階段角色，然後在處理任何請求之前關閉。

此權限分離隨 SnapOtter 2.3.0 推出。自該版本起，儲存庫內的 Compose 檔案與一體化映像檔皆採用此方式配置，既有的安裝也包含在內：啟動時，SnapOtter 會在執行階段角色不存在時建立它、授予權限、執行遷移，然後將權限補齊到先前就已存在的資料表。升級不需要手動執行任何 SQL。

2.2.0 映像檔只讀取執行階段連線字串，且從不建立第二個角色，所以若讓它使用分離後的設定，它將無法啟動：應用程式日誌會顯示該角色的密碼驗證失敗，而 Postgres 日誌則顯示該角色不存在。在將 Compose 檔案切換為分離配置之前，請先將映像檔升級到 2.3.0 或更新版本。

將 `DATABASE_MIGRATION_URL` 留空會以單一角色執行，由 `DATABASE_URL` 同時負責兩項工作，與分離之前完全相同。這是受支援的設定，而非已棄用的設定。在受管理的 Postgres 上，建立角色往往不是您能做的事，這就是合適的做法。

### 外部與受管理的 Postgres {#external-and-managed-postgres}

在 RDS、Supabase、Cloud SQL，或任何您自行執行的叢集上，權限分離是選用的。請先建立一次執行階段角色：

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

接著將兩個連線字串都提供給 SnapOtter，並指向相同的主機、連接埠與資料庫：

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

到此為止即可。SnapOtter 會自行套用權限，並在每次遷移後重新套用，因此日後版本新增的資料表無需任何人為其執行 SQL 即可涵蓋。

`DATABASE_MIGRATION_URL` 中的角色必須擁有 SnapOtter 的資料表，因為只有資料表的擁有者才能對它授權。在既有的安裝中，這指的是您一直用來執行 SnapOtter 的角色，而不是專為此目的新建的角色。若指向一個不擁有任何物件的新角色，啟動會失敗，並以錯誤訊息明確指出這一點。它還需要 `CREATEROLE` 以建立並維護執行階段角色，並具備建立 `drizzle` 結構描述的權限。

若兩個 URL 指定同一個角色，則不會進行權限分離，SnapOtter 會在日誌中如實說明，而不是假裝已分離。如果您的供應商沒有提供既能擁有資料表、又能持有 `CREATEROLE` 的角色，請以單一角色執行。

### 為什麼不處理超級使用者位元 {#why-the-superuser-bit-is-left-alone}

SnapOtter 絕不會自行移除角色的 `SUPERUSER`。在權限分離之前建立的安裝中，`snapotter` 是叢集中唯一的超級使用者，將它降級會讓叢集失去所有超級使用者，只能在伺服器停止的情況下透過單一使用者模式復原。真正帶來保護的做法，是將長期存在的連線移到受限角色。超級使用者只在啟動的那幾秒鐘出現在連線上，之後便不再存在。

全新安裝的一體化映像檔不會有這個問題。它們有三個角色：`postgres`（啟動用超級使用者，不會出現在 SnapOtter 使用的任何連線字串中）、`snapotter`（`NOSUPERUSER`，擁有資料，僅在啟動時連線），以及 `snapotter_app`（僅限資料列，負責處理請求）。

若仍要降級較舊的 `snapotter`，請先建立第二個超級使用者，並以它登入確認可正常運作。然後 `ALTER ROLE snapotter NOSUPERUSER`。

## 備份與還原 {#backup-and-restore}

關聯式資料庫位於 Postgres 容器的 `SnapOtter-pgdata` 磁碟區，而不是應用程式的 `/data` 磁碟區。

**附驗證的邏輯備份（建議）**

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

這兩個指令都以擁有者 `snapotter` 連線，並且應該繼續如此。執行階段角色看不到 `drizzle` 結構描述，因此以該角色取得的傾印內容會不完整。`--no-owner` 會讓還原後的物件歸執行還原的人所有，所以由擁有者執行，就能讓擁有權落在權限設定所預期的位置。全新叢集上有一個陷阱：`pg_dump` 帶有權限設定，卻不包含其中所指的角色，因此請在還原之前先建立 `snapotter_app`，否則 `--exit-on-error` 會在第一個 `GRANT` 就停止。無論如何，SnapOtter 都會在下次啟動時重新套用權限。

此資料庫傾印不包含 `/data/files` 中已儲存的檔案庫物件，也不包含 Redis 中的持久 BullMQ 狀態。請依照[安全性與強化](/zh-TW/guide/security#backup-and-recovery)中的協調程序來備份與還原這些資料。

**冷磁碟區快照**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

請勿使用 `tar` 複製運作中的 PostgreSQL 資料目錄。Compose 會以專案名稱作為磁碟區名稱的前綴，因此請從 `docker inspect` 或您的儲存平台查出實際掛載的磁碟區 ID，而不要假設其名稱就是字面上的標籤 `SnapOtter-pgdata`。

### 從 1.x（SQLite）遷移 {#migrating-from-1-x-sqlite}

從 SnapOtter 1.x 升級有專屬的指南：請參閱[從 1.x 升級到 2.0](./upgrading)。簡單來說，沿用既有的 `/data` 磁碟區，2.0 會在首次啟動時自動偵測並匯入 `/data/snapotter.db`（或設定 `SQLITE_MIGRATE_PATH` 明確指向它）。請先備份整個 `/data` 磁碟區，而不只是 `snapotter.db`：1.x 使用 SQLite 的 WAL 模式，因此容器停止後，大部分資料往往仍留在 `snapotter.db-wal` 中，而旁邊的 `snapotter.db` 幾乎是空的。
